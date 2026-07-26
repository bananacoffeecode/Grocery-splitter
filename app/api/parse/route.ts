// Groq-only receipt parser. A vision model (Qwen3-VL on Groq) reads the receipt
// image(s) straight into structured items + total. No OCR fallback: if Groq fails
// we surface the error so problems are visible rather than silently degraded.

type ParsedItem = { name: string; price: number; quantity?: number };
type ParsedReceipt = {
  items: ParsedItem[];
  source: string;
  orderDate: string | null;
  currency: string;
  grandTotal: number | null;
};
type InputImage = { imageBase64: string; mimeType?: string };

// Groq/Qwen vision accepts multiple images per request. We pass every screenshot
// of the same order together so the model can merge and de-duplicate overlaps.
const MAX_IMAGES = 5;

const VISION_PROMPT = `You are a grocery receipt parser. You may be given MULTIPLE images that are screenshots of the SAME order, scrolled to different positions and often OVERLAPPING. Read them together as ONE receipt.

Return STRICT JSON only:
{"items":[{"name":string,"price":number,"quantity":number|null}],"source":string,"orderDate":string|null,"currency":string,"grandTotal":number|null}

Rules:
- price = the FINAL amount the customer pays for that line. When two prices are shown for an item, use the current/bold one and IGNORE the struck-through, crossed-out, original or MRP price.
- price is the TOTAL for that line (all units together), not the per-unit price.
- quantity = the number of units for that line if stated (e.g. "2 units") else null.
- DEDUPLICATE across images: if the same item appears in more than one screenshot, include it EXACTLY ONCE. The same item is never listed twice.
- Include every distinct purchased item exactly once.
- A discount/coupon/cashback shown as its OWN line: include as an item with a NEGATIVE price. Per-item discounts already reflected in the final price must NOT be added separately.
- Fees (delivery, handling, service, packing): include as positive items ONLY if actually charged. If shown as FREE or 0, skip them.
- Do NOT include subtotal, "items total", "you saved"/savings, taxes, loyalty points, or payment rows as items.
- grandTotal = the final amount payable printed on the receipt (e.g. "You pay", "Grand total", "Items total"), number only, or null if not shown.
- The items you return should sum to grandTotal. If they don't, re-check for missed items or a wrong price.
- currency is the symbol (₹, $, £, €). orderDate as "12 Mar 2026" or null.
Return only the JSON object.`;

// Parse a vision model's JSON string into our shape. Tolerates prose/code fences.
function normalizeVisionJson(text: string): ParsedReceipt | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  const items: ParsedItem[] = (parsed.items || [])
    .filter((i: { name?: string; price?: unknown }) => i && i.name && typeof i.price === 'number')
    .map((i: { name: string; price: number; quantity?: number | null }) => ({
      name: String(i.name).trim(),
      price: i.price,
      quantity: i.quantity && i.quantity > 1 ? i.quantity : undefined,
    }));
  if (!items.length) return null;
  return {
    items,
    source: parsed.source || 'Receipt',
    orderDate: parsed.orderDate || null,
    currency: parsed.currency || '₹',
    grandTotal: typeof parsed.grandTotal === 'number' ? parsed.grandTotal : null,
  };
}

// Safety net in case the model still emits a duplicate: collapse identical
// name+price lines (the exact overlap-screenshot case) into one.
function dedupeItems(items: ParsedItem[]): ParsedItem[] {
  const seen = new Set<string>();
  const out: ParsedItem[] = [];
  for (const item of items) {
    const key = `${item.name.toLowerCase().trim()}::${item.price}::${item.quantity ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// Groq keys start with "gsk_". Anything else is treated as unconfigured.
function groqKey(): string | null {
  const k = process.env.GROQ_API_KEY?.trim();
  return k && k.startsWith('gsk_') ? k : null;
}

// Groq vision (Qwen3-VL). Throws on API/parse errors so the caller can surface why.
async function groqParse(images: InputImage[], key: string): Promise<ParsedReceipt | null> {
  const Groq = (await import('groq-sdk')).default;
  const groq = new Groq({ apiKey: key });
  const completion = await groq.chat.completions.create({
    model: 'qwen/qwen3.6-27b',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          ...images.slice(0, MAX_IMAGES).map((img) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.imageBase64}` },
          })),
        ],
      },
    ],
  });
  return normalizeVisionJson(completion.choices[0]?.message?.content || '');
}

// Warn when the extracted items don't sum to the receipt's printed total.
function buildTallyWarning(
  items: ParsedItem[],
  grandTotal: number | null,
  currency: string
): string | null {
  if (grandTotal === null) return null;
  const extractedSum = Math.round(items.reduce((s, i) => s + (i.price ?? 0), 0) * 100) / 100;
  if (Math.abs(extractedSum - grandTotal) <= 0.5) return null;
  return `Extracted total (${currency}${extractedSum.toFixed(2)}) doesn't match receipt total (${currency}${grandTotal.toFixed(2)}). Please review and edit.`;
}

// Probe so the client / external checks can see whether Groq is configured.
export async function GET() {
  return Response.json({ engine: groqKey() ? 'groq' : 'none' });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Accept either { images: [{imageBase64, mimeType}] } or a single { imageBase64, mimeType }.
    const images: InputImage[] = Array.isArray(body.images) && body.images.length
      ? body.images.filter((i: InputImage) => i && i.imageBase64)
      : body.imageBase64
      ? [{ imageBase64: body.imageBase64, mimeType: body.mimeType }]
      : [];

    if (!images.length) {
      return Response.json({ error: 'No receipt image was provided.' }, { status: 400 });
    }

    const key = groqKey();
    if (!key) {
      return Response.json(
        { error: 'Groq is not configured. Set GROQ_API_KEY (a gsk_… key) in the environment.' },
        { status: 500 }
      );
    }

    const parsed = await groqParse(images, key);
    if (!parsed || !parsed.items.length) {
      return Response.json(
        { error: "Groq couldn't read this receipt. Try clearer screenshots, or add items manually." },
        { status: 422 }
      );
    }

    const items = dedupeItems(parsed.items);
    const tallyWarning = buildTallyWarning(items, parsed.grandTotal, parsed.currency);
    return Response.json({ ...parsed, items, engine: 'groq', tallyWarning });
  } catch (err: unknown) {
    // No fallback — report the real reason (rate limit, bad JSON, model access, …).
    const message = err instanceof Error ? err.message : 'Failed to parse receipt';
    return Response.json({ error: `Groq scan failed: ${message}` }, { status: 500 });
  }
}

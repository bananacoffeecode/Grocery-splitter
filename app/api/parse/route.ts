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

const VISION_PROMPT = `You are a grocery receipt parser. You are given one or more screenshots. They may be EITHER:
(a) multiple OVERLAPPING screenshots of the SAME order (a long receipt scrolled), OR
(b) screenshots of SEVERAL DIFFERENT orders.
Look at the order number / order ID in each screenshot's header (e.g. "ORDER #2485...") to tell orders apart.

Return STRICT JSON only:
{"items":[{"name":string,"price":number,"quantity":number|null}],"source":string,"orderDate":string|null,"currency":string,"grandTotal":number|null}

Rules:
- price = the FINAL amount the customer pays for that line. When two prices are shown, use the current/bold one and IGNORE the struck-through, crossed-out, original or MRP price. A fee shown as struck-through then "Free" is NOT charged — skip it.
- price is the TOTAL for that line (all units together), not the per-unit price.
- DECIMALS: prices often show one decimal place like "₹107.0", "₹78.0", "₹34.0". The digits AFTER the decimal point are fractional — keep the decimal point. "₹107.0" is 107 (one hundred seven), NOT 1070. "₹78.0" is 78, NOT 780. Never drop or absorb the decimal point into the number.
- quantity = the number of units for that line if stated (e.g. "3 x") else null.
- SAME order across overlapping screenshots: include each item and fee EXACTLY ONCE (do not double-count a line visible in two overlapping screenshots).
- DIFFERENT orders: include EVERY order's items and fees. Do NOT drop or merge a line just because another order has an item or fee with the same name — each order's own products, "Delivery Fee", "Handling Fee", "Offer Discount" etc. are ALL kept as separate lines.
- A discount/coupon/cashback shown as its OWN line: include as an item with a NEGATIVE price. Per-item discounts already reflected in the final price must NOT be added separately.
- Fees (delivery, handling, service, surge, packing): include as positive items ONLY if actually charged. If shown as FREE or 0, skip them.
- Do NOT include subtotal, "item bill"/"items total", "you saved"/savings, taxes, loyalty points, or payment rows as items.
- grandTotal = the SUM of the printed grand total of EVERY distinct order (add them together). If there is only one order, that order's grand total. null if none shown.
- The items you return should sum to grandTotal. If they don't, re-check for missed/duplicated items or a wrong price.
- currency is the symbol (₹, $, £, €). orderDate as "12 Mar 2026" (use the earliest if several) or null.
Return only the JSON object.`;

// Parse a vision model's JSON string into our shape. Tolerates reasoning
// (<think>…</think>), code fences, and surrounding prose.
function normalizeVisionJson(text: string): ParsedReceipt | null {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
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
    model: 'qwen/qwen3.8-27b',
    temperature: 0,
    // With reasoning off the JSON is small (~450 tokens for 12 items), so a big
    // max_tokens just wastes the free 8k-TPM budget and 413s on multi-image scans.
    // 1200 still leaves ~2.5x headroom for a long receipt.
    max_tokens: 1200,
    // Qwen is a reasoning model and ignores "/no_think" in the prompt — it will
    // "think" until it exhausts max_tokens and never emit JSON. This Groq param
    // actually disables reasoning, so the model returns the JSON directly.
    reasoning_effort: 'none',
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

// Repair the common decimal misread where one price loses its decimal point
// (e.g. "₹107.0" read as 1070). Only acts when dividing exactly one inflated
// item by 10 makes the items sum to the printed grand total — so it never
// "corrects" a genuinely large price; it just resolves a provable mismatch.
function reconcileDecimalMisread(items: ParsedItem[], grandTotal: number | null): ParsedItem[] {
  if (grandTotal === null) return items;
  const sum = (arr: ParsedItem[]) => Math.round(arr.reduce((s, i) => s + (i.price ?? 0), 0) * 100) / 100;
  if (Math.abs(sum(items) - grandTotal) <= 0.5) return items;

  for (let i = 0; i < items.length; i++) {
    // Only consider positive prices that look like a dropped decimal (integer, ≥100).
    if (items[i].price < 100 || items[i].price % 1 !== 0) continue;
    const trial = items.map((it, j) => (j === i ? { ...it, price: it.price / 10 } : it));
    if (Math.abs(sum(trial) - grandTotal) <= 0.5) return trial;
  }
  return items;
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

    const items = reconcileDecimalMisread(parsed.items, parsed.grandTotal);
    const tallyWarning = buildTallyWarning(items, parsed.grandTotal, parsed.currency);
    return Response.json({ ...parsed, items, engine: 'groq', tallyWarning });
  } catch (err: unknown) {
    // No fallback — report the real reason (rate limit, bad JSON, model access, …).
    const message = err instanceof Error ? err.message : 'Failed to parse receipt';
    return Response.json({ error: `Groq scan failed: ${message}` }, { status: 500 });
  }
}

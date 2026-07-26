// Pure, key-free receipt parser. Takes OCR text (from tesseract.js in the browser)
// and turns it into structured items, fees, discounts, and totals using heuristics.

type ParsedItem = { name: string; price: number; quantity?: number };

const STORE_PATTERNS: [RegExp, string][] = [
  [/blinkit/i, 'Blinkit'],
  [/instamart/i, 'Swiggy Instamart'],
  [/swiggy/i, 'Swiggy'],
  [/amazon|amazon\.in|amazon fresh/i, 'Amazon'],
  [/zepto/i, 'Zepto'],
  [/bigbasket|big basket/i, 'BigBasket'],
  [/d[\s-]?mart|avenue supermarts/i, 'DMart'],
  [/jio\s?mart|reliance retail/i, 'JioMart'],
  [/dunzo/i, 'Dunzo'],
];

// Lines that are never items (summary / payment rows).
const EXCLUDE_LINE = /\b(sub[\s-]?total|item\s+total|item\s+bill|cart\s+total|mrp\s+total|order\s+bill|grand\s+total|total\s+payable|net\s+payable|amount\s+payable|amount\s+paid|to\s+pay|cash|card|upi|tender|change\s+due|balance\s+due|round\s*off|you\s+saved|total\s+savings|loyalty|reward\s+points|points\s+balance|gst\s+summary|invoice|order\s+id|order\s+placed|placed\s+on|order\s+date|bill\s+no)\b/i;

// Order-status / header rows (e.g. "Order #157... Processing, 2 Items, ₹92.00").
// These carry a price but are never purchased items.
const HEADER_LINE = /\border\s*#|\bprocessing\b|\b\d+\s+items?\b|order\s+in\s+progress|out\s+for\s+delivery|\bdelivered\b|\bhelp\b|arriving|estimated/i;

// Lines whose amount should be treated as the receipt grand total.
const TOTAL_LINE = /\b(grand\s+total|total\s+payable|net\s+payable|amount\s+payable|amount\s+paid|to\s+pay|bill\s+total|order\s+total)\b/i;

// Lines that represent a reduction (store as negative).
const DISCOUNT_LINE = /\b(discount|coupon|promo|cashback|savings?|offer|off\b|voucher|redeem)/i;

// Fee lines that are legitimate positive charges.
const FEE_LINE = /\b(delivery|handling|service|platform|convenience|packing|packaging|surge|small\s+cart|tip)\b.*\bfee\b|\b(delivery|handling|service|platform|convenience|packing|packaging)\s+(fee|charge|charges)/i;

function detectCurrency(text: string): string {
  if (/₹|Rs\.?\b|INR/i.test(text)) return '₹';
  if (/€|EUR/i.test(text)) return '€';
  if (/£|GBP/i.test(text)) return '£';
  if (/\$|USD/i.test(text)) return '$';
  return '₹';
}

function detectSource(text: string): string {
  for (const [re, name] of STORE_PATTERNS) if (re.test(text)) return name;
  return 'Receipt';
}

function detectDate(text: string): string | null {
  const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
  // "12 Mar 2026" / "12 March 2026"
  let m = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${months})[a-z]*\\.?\\s+(\\d{4})\\b`, 'i'));
  if (m) return `${m[1]} ${m[2][0].toUpperCase()}${m[2].slice(1, 3).toLowerCase()} ${m[3]}`;
  // "Mar 12, 2026"
  m = text.match(new RegExp(`\\b(${months})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i'));
  if (m) return `${m[2]} ${m[1][0].toUpperCase()}${m[1].slice(1, 3).toLowerCase()} ${m[3]}`;
  // "12/03/2026" or "12-03-2026" or "2026-03-12"
  m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (m) {
    const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = m[1], mon = parseInt(m[2], 10), yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (mon >= 1 && mon <= 12) return `${day} ${mons[mon - 1]} ${yr}`;
  }
  return null;
}

// Extract the last price-like number from a line. Prefers numbers with a currency
// symbol or two decimals so we don't grab quantities/weights by mistake.
function extractPrice(line: string): { value: number; matchText: string } | null {
  const re = /(-)?\s*(?:₹|Rs\.?|\$|£|€)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)/g;
  let best: { value: number; matchText: string; score: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const raw = m[2].replace(/,/g, '');
    const value = parseFloat(raw) * (m[1] ? -1 : 1);
    if (Number.isNaN(value)) continue;
    const hasSymbol = /[₹$£€]|Rs/i.test(m[0]);
    const hasDecimal = /\.\d/.test(m[0]);
    // A bare integer with no symbol/decimals is often a real price whose ₹/.00
    // was dropped by OCR ("Amul Milk 52"). Accept it, but treat obvious non-prices
    // as quantities/codes: a leading quantity ("2 x ...") or a 4-digit year.
    if (!hasSymbol && !hasDecimal) {
      const isQuantityToken = new RegExp(`\\b${m[2]}\\s*(?:x|@|nos?|qty|pcs?)\\b`, 'i').test(line);
      const looksLikeYear = /^(19|20)\d{2}$/.test(raw);
      if (isQuantityToken || looksLikeYear) continue;
    }
    // Prefer currency-tagged / decimal amounts, and later positions on the line
    // (the price is almost always the last number). Bare integers score lowest so
    // a symbol/decimal amount elsewhere on the line still wins.
    const score = (hasSymbol ? 2 : 0) + (hasDecimal ? 1 : 0) + m.index / 1000;
    if (!best || score >= best.score) best = { value, matchText: m[0], score };
  }
  return best ? { value: best.value, matchText: best.matchText } : null;
}

// Recover a price from an OCR cell where the ₹ symbol was misread as junk
// (e.g. "052.0" → 52, "c30.oo" → 30, "CJ46.OO" → 46, "01027.00" → 1027,
// "₹1,027.00" → 1027, "2,450" → 2450).
function parsePriceCell(cell: string): { value: number; matchText: string } | null {
  // Fix common letter/digit confusions inside numbers.
  const fixed = cell.replace(/[oO]/g, '0').replace(/[lI|]/g, '1');
  const negative = /-/.test(fixed);
  // Match whole price tokens, keeping commas (thousands separators, incl. Indian
  // grouping like 1,00,000) and the decimal part intact. Grabbing tokens rather
  // than splitting on commas is what prevents "1,027.00" collapsing to "27".
  const tokens = fixed.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!tokens || !tokens.length) return null;
  // Prefer the last number on the row (handles struck-through original prices).
  const raw = tokens[tokens.length - 1].replace(/,/g, '');
  // Strip a single leading-zero artifact only when it's clearly the ₹→0 misread
  // (e.g. "052" → 52), never when it would change a real value like "0.99".
  const numStr = /^0\d/.test(raw) && !raw.startsWith('0.') ? raw.replace(/^0+(?=\d)/, '') : raw;
  const v = parseFloat(numStr);
  if (Number.isNaN(v)) return null;
  return { value: negative ? -v : v, matchText: cell };
}

function extractQuantity(line: string): number | undefined {
  const m = line.match(/\b(\d{1,3})\s*(?:x|@|nos?|qty|pcs?)\b|\bx\s*(\d{1,3})\b/i);
  const q = m ? parseInt(m[1] || m[2], 10) : NaN;
  return q > 1 ? q : undefined;
}

function cleanName(line: string, priceText: string): string {
  return line
    .replace(priceText, '')
    .replace(/(?:₹|Rs\.?|\$|£|€)\s*[\d,.]+/g, '')
    .replace(/\b\d{1,3}\s*(?:x|@|nos?|qty|pcs?)\b/gi, '')
    .replace(/[*|]+/g, ' ')
    .replace(/^[\s.\-:]+|[\s.\-:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseReceipt(ocrText: string) {
  const currency = detectCurrency(ocrText);
  const source = detectSource(ocrText);
  const orderDate = detectDate(ocrText);

  const lines = ocrText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];
  let grandTotal: number | null = null;

  for (const rawLine of lines) {
    // OCR.space table mode separates columns with tabs: last cell is the price,
    // the rest is the item name. Fall back to inline parsing when there are no tabs.
    const cells = rawLine.split('\t').map((c) => c.trim()).filter(Boolean);
    let priced: { value: number; matchText: string } | null;
    let name: string;
    if (cells.length >= 2) {
      priced = parsePriceCell(cells[cells.length - 1]);
      name = cleanName(cells.slice(0, -1).join(' '), '');
    } else {
      const inline = extractPrice(rawLine);
      priced = inline ? (parsePriceCell(inline.matchText) ?? inline) : null;
      name = inline ? cleanName(rawLine, inline.matchText) : '';
    }

    // Capture the grand total but never add it as an item.
    if (TOTAL_LINE.test(rawLine)) {
      if (priced) grandTotal = Math.abs(priced.value);
      continue;
    }
    if (EXCLUDE_LINE.test(rawLine)) continue;
    if (HEADER_LINE.test(rawLine)) continue;
    if (!priced) continue;
    if (!name || name.length < 2) continue; // drop OCR noise with no label

    const isDiscount = DISCOUNT_LINE.test(rawLine) || priced.value < 0;
    const isFee = FEE_LINE.test(rawLine);
    let price = Math.abs(priced.value);
    if (price === 0 && isFee) continue; // waived fee
    if (isDiscount) price = -price;

    items.push({ name, price, quantity: extractQuantity(rawLine) });
  }

  return { items, source, orderDate, currency, grandTotal };
}

// Warn when the extracted line items don't sum to the receipt's printed total —
// the signal that something was misread and needs a human glance.
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

// Run OCR via OCR.space. Uses the free "helloworld" demo key by default; set
// OCR_SPACE_API_KEY in the environment for higher rate limits (free at ocr.space).
async function ocrSpace(imageBase64: string, mimeType: string): Promise<string> {
  const apikey = process.env.OCR_SPACE_API_KEY || 'helloworld';
  const filetype = /png/i.test(mimeType) ? 'PNG' : /gif/i.test(mimeType) ? 'GIF' : 'JPG';
  const body = new URLSearchParams();
  body.set('apikey', apikey);
  body.set('base64Image', `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`);
  body.set('filetype', filetype);
  body.set('language', 'eng');
  body.set('OCREngine', '1'); // Engine 1 + isTable keeps each item's name and price on one row
  body.set('isTable', 'true');
  body.set('scale', 'true');
  body.set('detectOrientation', 'true');

  const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body });
  const json = await res.json();

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join('; ') : json.ErrorMessage;
    throw new Error(msg || 'OCR service failed to process the image.');
  }
  return (json.ParsedResults || []).map((r: { ParsedText?: string }) => r.ParsedText || '').join('\n');
}

// Instruction shared by every vision model so Gemini and Groq behave identically.
const VISION_PROMPT = `You are a receipt parser. Read this grocery receipt image and return STRICT JSON:
{"items":[{"name":string,"price":number,"quantity":number|null}],"source":string,"orderDate":string|null,"currency":string,"grandTotal":number|null}
Rules:
- One entry per purchased line item. price is the amount charged for that line (after any per-item discount), as a plain number.
- Discounts/coupons/cashback: include as an item with a NEGATIVE price.
- Delivery/handling/service/packing fees: include as positive items.
- Do NOT include subtotal, taxes already in line prices, "you saved", loyalty points, payment/tender rows, or order-status lines as items.
- grandTotal = the final amount payable printed on the receipt (number only), or null if not shown.
- currency is the symbol (₹, $, £, €). orderDate as "12 Mar 2026" or null.
Return only the JSON object.`;

// Normalize a vision model's raw JSON string into the same shape parseReceipt returns.
function normalizeVisionJson(text: string): ReturnType<typeof parseReceipt> | null {
  // Models sometimes wrap JSON in prose or ```json fences — grab the object.
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

// Groq keys start with "gsk_". Free tier, hosts Llama 4 vision models.
function groqKey(): string | null {
  const k = process.env.GROQ_API_KEY?.trim();
  return k && k.startsWith('gsk_') ? k : null;
}

// The active vision engine. Groq is the default and only vision engine; if its
// key is missing we fall back to the free client OCR + heuristics path.
function visionEngine(): 'groq' | 'ocr' {
  if (groqKey()) return 'groq';
  return 'ocr';
}

// Groq vision (Qwen3-VL) → structured items. Free tier, very fast. null on failure.
// Model verified available + vision-capable for this account via GET /v1/models.
async function groqParse(
  imageBase64: string,
  mimeType: string,
  key: string
): Promise<ReturnType<typeof parseReceipt> | null> {
  try {
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
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` },
            },
          ],
        },
      ],
    });
    return normalizeVisionJson(completion.choices[0]?.message?.content || '');
  } catch {
    return null; // fall back to the next engine
  }
}

// Capability probe: lets the client decide whether to run client-side OCR
// (free path) or skip it because a vision model will read the image server-side.
export async function GET() {
  return Response.json({ engine: visionEngine() });
}

export async function POST(req: Request) {
  try {
    const { imageBase64, mimeType, ocrText: providedText } = await req.json();

    // 1) Best accuracy: Groq vision reads the image directly (only with a gsk_ key).
    if (imageBase64 && visionEngine() === 'groq') {
      const v = await groqParse(imageBase64, mimeType || 'image/jpeg', groqKey()!);
      if (v && v.items.length) {
        const tallyWarning = buildTallyWarning(v.items, v.grandTotal, v.currency);
        return Response.json({ ...v, engine: 'groq', tallyWarning });
      }
      // else: fall through to the free OCR path
    }

    // 2) Free path: use client-provided OCR text (tesseract.js in the browser).
    //    Only hit OCR.space if the browser sent no text at all.
    let ocrText = providedText;
    if ((!ocrText || !ocrText.trim()) && imageBase64) {
      ocrText = await ocrSpace(imageBase64, mimeType || 'image/jpeg');
    }

    if (!ocrText || !ocrText.trim()) {
      return Response.json(
        { error: "Couldn't read any text from this image. Try a sharper, well-lit photo." },
        { status: 400 }
      );
    }

    const { items, source, orderDate, currency, grandTotal } = parseReceipt(ocrText);

    if (!items.length) {
      return Response.json(
        { error: "Couldn't find any line items in this receipt. You can add them manually." },
        { status: 422 }
      );
    }

    const tallyWarning = buildTallyWarning(items, grandTotal, currency);
    return Response.json({ items, source, orderDate, currency, grandTotal, engine: 'ocr', tallyWarning });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse receipt';
    return Response.json({ error: message }, { status: 500 });
  }
}

// Parses raw OCR text from a receipt into item name + price pairs
const EXCLUDE_KEYWORDS = /\b(total|subtotal|sub-total|tax|vat|discount|saving|saving|loyalty|points|cash|change|card|visa|mastercard|balance|amount|due|paid|tender|service|charge|fee|bag|carrier)\b/i;

export interface RawItem {
  name: string;
  price: number;
}

export function parseReceiptText(text: string): RawItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: RawItem[] = [];

  for (const line of lines) {
    // Match a price at end of line: optional £/$, digits, dot, 2 digits
    const priceMatch = line.match(/[£$]?\s*(\d+\.\d{2})\s*[A-Z]?$/);
    if (!priceMatch) continue;

    const price = parseFloat(priceMatch[1]);
    if (price <= 0 || price > 500) continue; // sanity bounds

    // Strip price and currency symbols from end to get name
    const name = line
      .slice(0, line.lastIndexOf(priceMatch[0]))
      .replace(/^[\d\s*]+/, '')   // leading product codes / qty
      .replace(/[£$@]/g, '')
      .trim();

    if (!name || name.length < 2) continue;
    if (EXCLUDE_KEYWORDS.test(name)) continue;

    items.push({ name, price });
  }

  return items;
}

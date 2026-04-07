import Groq from 'groq-sdk';

export async function POST(req: Request) {
  try {
    const { imageBase64, mimeType } = await req.json();

    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const response = await client.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: `Extract all line items from this receipt image.
Return ONLY valid JSON with this shape, no markdown, no explanation:
{
  "source": "Blinkit",
  "orderDate": "12 Mar 2026",
  "currency": "$",
  "items": [{"name": "Item Name", "price": 1.99, "quantity": 1}, ...]
}
Also extract "currency": the currency symbol used in this receipt (e.g. "$", "₹", "£", "€"). Use "₹" if unidentifiable.
Identify the source: look for "Blinkit" (yellow branding), "Swiggy Instamart" (orange, "Order details" header with product thumbnails), "Amazon Now" or "Amazon Fresh" (ORDER # format like "ORDER #2324...", shows address like "Home Blr"), "Zepto" (purple), "BigBasket" (red), "DMart". For physical store receipts (thermal/printed paper), use the store name if visible, otherwise use "Receipt".
Also extract "orderDate": the date of the order or purchase visible in the receipt (format "D MMM YYYY"). Use null if not visible.
Rules:
- Include all purchasable items with a positive price
- Include fees: delivery fee, service fee, handling fee, platform fee, convenience fee, packing charges, surge charges — include these as items with their actual name
- Exclude ONLY: subtotals, grand totals, discounts, savings, loyalty points, cash paid, card charged, change given, balance due
- IMPORTANT: If the same item name appears on multiple separate lines, include it as a SEPARATE entry for each line — do NOT merge or deduplicate them
- Always include quantity (default 1 if single unit)
- If an item has a quantity (e.g. 2x or "2 @"), set quantity to that number and price to the TOTAL price (not unit price)
- For physical/printed receipts: extract items even if the price is on the next line, or item names include product codes — clean up names
- Clean up item names (remove product codes, trailing asterisks)`,
            },
          ],
        },
      ],
      temperature: 0,
    });

    const text = response.choices[0].message.content?.trim() ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    const source: string = Array.isArray(parsed) ? 'Receipt' : (parsed.source || 'Receipt');
    const orderDate: string | null = Array.isArray(parsed) ? null : (parsed.orderDate ?? null);
    const currency: string = Array.isArray(parsed) ? '₹' : (parsed.currency || '₹');

    if (!Array.isArray(items)) throw new Error('Response is not an array');

    return Response.json({ items, source, orderDate, currency });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse receipt';
    return Response.json({ error: message }, { status: 500 });
  }
}

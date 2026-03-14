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
              text: `Extract all grocery line items from this receipt image.
Return ONLY valid JSON with this shape, no markdown, no explanation:
{
  "source": "Blinkit",
  "orderDate": "12 Mar 2026",
  "items": [{"name": "Item Name", "price": 1.99, "quantity": 1}, ...]
}
Identify the delivery app: look for "Blinkit" (yellow branding), "Swiggy Instamart" (orange, "Order details" header with product thumbnails), "Amazon Now" or "Amazon Fresh" (ORDER # format like "ORDER #2324...", shows address like "Home Blr"), "Zepto" (purple), "BigBasket" (red), "DMart". If unidentifiable, use "Receipt".
Also extract "orderDate": the date of the order visible in the screenshot (format "D MMM YYYY"). Use null if not visible.
Rules:
- Exclude: subtotals, totals, taxes, VAT, discounts, loyalty points, cash, change, card payments
- Include only purchasable items with a positive price
- Always include quantity (default 1 if single unit)
- If an item has a quantity (e.g. 2x), set quantity to that number and price to the TOTAL price (not unit price)
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

    if (!Array.isArray(items)) throw new Error('Response is not an array');

    return Response.json({ items, source, orderDate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse receipt';
    return Response.json({ error: message }, { status: 500 });
  }
}

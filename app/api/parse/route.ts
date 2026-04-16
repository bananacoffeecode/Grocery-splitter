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
  "currency": "₹",
  "grandTotal": 450.50,
  "items": [{"name": "Item Name", "price": 1.99, "quantity": 1}, ...]
}
Also extract "currency": the currency symbol used in this receipt (e.g. "$", "₹", "£", "€"). Use "₹" if unidentifiable.
Also extract "grandTotal": the final total amount paid/charged shown on the receipt (after all discounts and fees are applied). Use null if not visible.
Identify the source store or platform. Check for these in order:
- "Blinkit": yellow branding, green owl logo, "blinkit" text anywhere, or "Blinkit" in the header
- "Swiggy Instamart": orange branding, "Instamart" text, "Order details" header with product thumbnails
- "Swiggy": orange branding with "Swiggy" text (food delivery, not Instamart)
- "Amazon": "ORDER #" prefix (e.g. "ORDER #402-..."), "amazon.in", "Amazon Fresh", "Amazon Now", Amazon Prime branding, or a delivery address shown as a short label (e.g. "Home Blr")
- "Zepto": purple/dark branding, "Zepto" text
- "BigBasket": red branding, "bigbasket" or "BB" text
- "DMart": "D-Mart", "DMart", or "Avenue Supermarts" text
- "JioMart": "JioMart", "Jio Mart", or "Reliance Retail" text
- "Dunzo": "Dunzo" text
For physical store receipts (thermal/printed paper), use the store name if visible, otherwise use "Receipt".
Also extract "orderDate": the date of the order or purchase visible in the receipt (format "D MMM YYYY", e.g. "12 Mar 2026"). Use null if not visible.
Rules:
- Include all purchasable items with a positive price
- Include fees that are actually charged: delivery fee, service fee, handling fee, platform fee, convenience fee, packing charges, surge charges — include these as items with their actual name and a POSITIVE price. IMPORTANT: if a fee is shown as FREE, waived, crossed out, or ₹0, do NOT include it at all — skip both the fee and any associated waiver/discount for it.
- Include ALL discounts, coupons, promo codes, and savings as items with NEGATIVE prices (e.g. {"name": "Coupon Discount", "price": -50, "quantity": 1}). Do NOT skip any discount line. Exception: do NOT include a discount that merely cancels a fee you already excluded (e.g. a "free delivery" discount for a delivery fee you did not include).
- Exclude ONLY: subtotals, grand totals, cash paid, card charged, change given, balance due, loyalty points balance
- IMPORTANT tally check: after extracting all items (positive + negative), sum their prices. This sum MUST equal grandTotal. If it does not match, re-examine the receipt — you have missed an item or discount. Adjust until the sum matches.
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
    const grandTotal: number | null = Array.isArray(parsed) ? null : (parsed.grandTotal ?? null);

    if (!Array.isArray(items)) throw new Error('Response is not an array');

    // Tally check: warn if extracted items don't sum to the receipt grand total
    let tallyWarning: string | null = null;
    if (grandTotal !== null) {
      const extractedSum = Math.round(items.reduce((s: number, i: { price: number }) => s + (i.price ?? 0), 0) * 100) / 100;
      const diff = Math.abs(extractedSum - grandTotal);
      if (diff > 0.5) {
        tallyWarning = `Extracted total (${currency}${extractedSum.toFixed(2)}) doesn't match receipt total (${currency}${grandTotal.toFixed(2)}). Some items or discounts may be missing — please review.`;
      }
    }

    return Response.json({ items, source, orderDate, currency, grandTotal, tallyWarning });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse receipt';
    return Response.json({ error: message }, { status: 500 });
  }
}

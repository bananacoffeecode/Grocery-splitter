import { ReceiptItem, PersonTotal, SplitwiseMember } from '@/types';

const CURRENCY_MAP: Record<string, string> = {
  '₹': 'INR',
  '$': 'USD',
  '£': 'GBP',
  '€': 'EUR',
};

export function currencyCode(symbol: string): string {
  return CURRENCY_MAP[symbol] ?? 'INR';
}

export function buildDescription(items: ReceiptItem[], dateStr: string): string {
  const sources = Array.from(new Set(
    items.map(i => i.source).filter((s): s is string => !!s && s !== 'Receipt')
  ));
  const prefix = sources.length > 0 ? sources.join(' · ') : 'Grocery';
  return `${prefix} — ${dateStr}`;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function autoMatch(appName: string, members: SplitwiseMember[]): number | null {
  const needle = normalize(appName);
  // 1. Full name exact match
  const full = members.find(m => normalize(`${m.first_name} ${m.last_name}`) === needle);
  if (full) return full.id;
  // 2. First name exact match
  const first = members.find(m => normalize(m.first_name) === needle);
  if (first) return first.id;
  // 3. Prefix match (app name starts with member first name or vice versa)
  const prefix = members.find(m =>
    needle.startsWith(normalize(m.first_name)) ||
    normalize(m.first_name).startsWith(needle)
  );
  return prefix?.id ?? null;
}

export function buildExpensePayload(
  personTotals: PersonTotal[],
  mapping: Map<string, number | null>, // appPersonId -> splitwiseMemberId
  payerMemberId: number,
  currency: string,
  dateStr: string,
  items: ReceiptItem[],
  groupId: number
): Record<string, string | number> {
  const totalCost = personTotals.reduce((s, pt) => s + pt.total, 0);
  const cost = (Math.round(totalCost * 100) / 100).toFixed(2);

  // Parse date: "16 Apr 2026" → ISO string, fall back to today
  const parsed = new Date(dateStr);
  const date = isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();

  const payload: Record<string, string | number> = {
    cost,
    description: buildDescription(items, dateStr),
    date,
    currency_code: currencyCode(currency),
    group_id: groupId,
  };

  let idx = 0;
  for (const pt of personTotals) {
    const memberId = mapping.get(pt.personId);
    if (memberId == null) continue;

    const isPayer = memberId === payerMemberId;
    payload[`users__${idx}__user_id`] = memberId;
    payload[`users__${idx}__paid_share`] = isPayer ? cost : '0.00';
    payload[`users__${idx}__owed_share`] = pt.total.toFixed(2);
    idx++;
  }

  return payload;
}

import { ReceiptItem, Person, ItemAssignment, PersonTotal } from '@/types';

function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateSplit(
  items: ReceiptItem[],
  people: Person[],
  assignments: ItemAssignment[]
): PersonTotal[] {
  const includedPeople = people.filter((p) => p.included);
  if (includedPeople.length === 0) return [];

  // Map personId -> PersonTotal
  const totals = new Map<string, PersonTotal>();
  for (const person of includedPeople) {
    totals.set(person.id, {
      personId: person.id,
      name: person.name,
      items: [],
      total: 0,
    });
  }

  for (const item of items) {
    const assignment = assignments.find((a) => a.itemId === item.id);

    let payers: Person[];

    if (!assignment || assignment.mode === 'equal') {
      payers = includedPeople;
    } else {
      // specific mode — filter assignedPersonIds against currently included people
      const validIds = new Set(includedPeople.map((p) => p.id));
      const specific = assignment.assignedPersonIds.filter((id) => validIds.has(id));
      payers = specific.length > 0
        ? includedPeople.filter((p) => specific.includes(p.id))
        : includedPeople; // fallback
    }

    if (payers.length === 0) continue;

    const baseShare = Math.floor((item.price * 100) / payers.length) / 100;
    const remainder = roundToCents(item.price - baseShare * payers.length);

    payers.forEach((payer, idx) => {
      const share = idx === 0 ? roundToCents(baseShare + remainder) : baseShare;
      const personTotal = totals.get(payer.id)!;
      personTotal.items.push({ name: item.name, share, source: item.source, orderDate: item.orderDate });
      personTotal.total = roundToCents(personTotal.total + share);
    });
  }

  return Array.from(totals.values());
}

export function grandTotal(items: ReceiptItem[]): number {
  return roundToCents(items.reduce((sum, i) => sum + i.price, 0));
}

export function formatSplitwiseText(
  personTotals: PersonTotal[],
  items: ReceiptItem[],
  assignments: ItemAssignment[],
  people: Person[]
): string {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const itemLines = items.map((item) => {
    const assignment = assignments.find((a) => a.itemId === item.id);
    let who = 'All';
    if (assignment && assignment.mode === 'specific' && assignment.assignedPersonIds.length > 0) {
      const names = assignment.assignedPersonIds
        .map((id) => people.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(', ');
      who = names || 'All';
    }
    return `- ${item.name} (${item.price.toFixed(2)}) -> ${who}`;
  });

  const breakdownLines = personTotals.map(
    (pt) => `${pt.name}: ₹${pt.total.toFixed(2)}`
  );

  const total = grandTotal(items);

  return [
    `Grocery Split - ${date}`,
    '',
    'Items:',
    ...itemLines,
    '',
    'Breakdown:',
    ...breakdownLines,
    '',
    `Total: ₹${total.toFixed(2)}`,
  ].join('\n');
}

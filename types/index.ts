export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  rawLine: string;
  quantity?: number;
  source?: string;
  orderDate?: string;
}

export interface Person {
  id: string;
  name: string;
  included: boolean;
  emoji?: string;
}

export type AssignmentMode = 'equal' | 'specific';

export interface ItemAssignment {
  itemId: string;
  mode: AssignmentMode;
  assignedPersonIds: string[];
}

export interface PersonTotal {
  personId: string;
  name: string;
  items: { name: string; share: number; source?: string; orderDate?: string }[];
  total: number;
}

export type Step = 1 | 2 | 3 | 4 | 5;

export interface SplitwiseMember {
  id: number;
  first_name: string;
  last_name: string;
}

export interface SplitwiseGroup {
  id: number;
  name: string;
  members: SplitwiseMember[];
}

// appPersonId -> SplitwiseMember.id, or null if not mapped
export type PersonMapping = Map<string, number | null>;

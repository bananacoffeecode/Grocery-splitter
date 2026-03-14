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

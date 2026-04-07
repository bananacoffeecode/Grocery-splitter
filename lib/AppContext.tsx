'use client';

import React, { createContext, useContext, useReducer, useEffect, Dispatch } from 'react';
import { ReceiptItem, Person, ItemAssignment, Step } from '@/types';

const PEOPLE_STORAGE_KEY = 'gs-people';

// ── State ──────────────────────────────────────────────────────────────────

export interface AppState {
  step: Step;
  receiptImageUrls: string[];
  items: ReceiptItem[];
  people: Person[];
  assignments: ItemAssignment[];
  currency: string;
}

const defaultPeople: Person[] = [
  { id: '1', name: 'Sulakshana', included: true },
  { id: '2', name: 'Chahat', included: true },
  { id: '3', name: 'Ankita', included: true },
];

function loadPeople(): Person[] {
  if (typeof window === 'undefined') return defaultPeople;
  try {
    const saved = localStorage.getItem(PEOPLE_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return defaultPeople;
}

const initialState: AppState = {
  step: 1,
  receiptImageUrls: [],
  items: [],
  people: defaultPeople,
  assignments: [],
  currency: '₹',
};

// ── Actions ────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'SET_STEP'; payload: Step }
  | { type: 'SET_RECEIPTS'; payload: string[] }
  | { type: 'SET_ITEMS'; payload: ReceiptItem[] }
  | { type: 'SET_CURRENCY'; payload: string }
  | { type: 'UPSERT_ITEM'; payload: ReceiptItem }
  | { type: 'DELETE_ITEM'; payload: string }
  | { type: 'SET_PEOPLE'; payload: Person[] }
  | { type: 'UPSERT_PERSON'; payload: Person }
  | { type: 'DELETE_PERSON'; payload: string }
  | { type: 'SET_ASSIGNMENT'; payload: ItemAssignment };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'SET_RECEIPTS':
      return { ...state, receiptImageUrls: action.payload };
    case 'SET_ITEMS':
      return { ...state, items: action.payload };
    case 'SET_CURRENCY':
      return { ...state, currency: action.payload };
    case 'UPSERT_ITEM': {
      const exists = state.items.find((i) => i.id === action.payload.id);
      return {
        ...state,
        items: exists
          ? state.items.map((i) => (i.id === action.payload.id ? action.payload : i))
          : [...state.items, action.payload],
      };
    }
    case 'DELETE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.payload),
        assignments: state.assignments.filter((a) => a.itemId !== action.payload),
      };
    case 'SET_PEOPLE':
      return { ...state, people: action.payload };
    case 'UPSERT_PERSON': {
      const exists = state.people.find((p) => p.id === action.payload.id);
      return {
        ...state,
        people: exists
          ? state.people.map((p) => (p.id === action.payload.id ? action.payload : p))
          : [...state.people, action.payload],
      };
    }
    case 'DELETE_PERSON':
      return {
        ...state,
        people: state.people.filter((p) => p.id !== action.payload),
      };
    case 'SET_ASSIGNMENT': {
      const exists = state.assignments.find((a) => a.itemId === action.payload.itemId);
      return {
        ...state,
        assignments: exists
          ? state.assignments.map((a) =>
              a.itemId === action.payload.itemId ? action.payload : a
            )
          : [...state.assignments, action.payload],
      };
    }
    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface AppContextType {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (s) => ({
    ...s,
    people: loadPeople(),
  }));

  useEffect(() => {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(state.people));
  }, [state.people]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

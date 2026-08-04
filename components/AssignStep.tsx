'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/AppContext';
import { ItemAssignment, Step } from '@/types';

export default function AssignStep() {
  const { state, dispatch } = useApp();
  const { items, people, assignments, currency } = state;
  const includedPeople = people.filter((p) => p.included);
  // Discounts (negative-price lines) aren't assignable to a specific person, so
  // they don't belong on this page. They stay in state and are split equally
  // across everyone in the final totals, so the math still matches the receipt.
  const assignableItems = items.filter((item) => item.price >= 0);

  // Initialize assignments for items that don't have one yet
  useEffect(() => {
    for (const item of items) {
      const existing = assignments.find((a) => a.itemId === item.id);
      if (!existing) {
        dispatch({
          type: 'SET_ASSIGNMENT',
          payload: {
            itemId: item.id,
            mode: 'equal',
            assignedPersonIds: includedPeople.map((p) => p.id),
          },
        });
      }
    }
  }, [items]);

  function getAssignment(itemId: string): ItemAssignment {
    return (
      assignments.find((a) => a.itemId === itemId) || {
        itemId,
        mode: 'equal',
        assignedPersonIds: includedPeople.map((p) => p.id),
      }
    );
  }

  function setMode(itemId: string, mode: 'equal' | 'specific') {
    const current = getAssignment(itemId);
    dispatch({
      type: 'SET_ASSIGNMENT',
      payload: {
        ...current,
        mode,
        assignedPersonIds:
          mode === 'equal'
            ? includedPeople.map((p) => p.id)
            : current.assignedPersonIds.length > 0
            ? current.assignedPersonIds
            : includedPeople.map((p) => p.id),
      },
    });
  }

  function togglePerson(itemId: string, personId: string) {
    const current = getAssignment(itemId);
    const included = current.assignedPersonIds.includes(personId);
    const next = included
      ? current.assignedPersonIds.filter((id) => id !== personId)
      : [...current.assignedPersonIds, personId];
    // Prevent empty selection
    if (next.length === 0) return;
    dispatch({
      type: 'SET_ASSIGNMENT',
      payload: { ...current, assignedPersonIds: next },
    });
  }

  return (
    <div className="flex flex-col gap-4 pt-6">
      <p className="text-center text-sm" style={{ color: 'var(--ink-soft)' }}>Who pays for each item?</p>

      <div className="flex flex-col gap-3">
        {assignableItems.map((item, i) => {
          const assignment = getAssignment(item.id);
          return (
            <div
              key={item.id}
              className="card px-5 py-4 animate-fade-in-up"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-[15px] flex-1 mr-2" style={{ color: 'var(--ink)' }}>{item.name}</span>
                <span className="font-bold text-[15px] gradient-text">{currency}{item.price.toFixed(2)}</span>
              </div>

              {(item.source && item.source !== 'Receipt') || item.orderDate ? (
                <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--ink-faint)' }}>
                  {item.source && item.source !== 'Receipt' ? item.source : ''}
                  {item.source && item.source !== 'Receipt' && item.orderDate ? ' · ' : ''}
                  {item.orderDate ?? ''}
                </p>
              ) : <div className="mb-3" />}

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setMode(item.id, 'equal')}
                  className={`chip flex-1 min-h-[40px] text-sm font-medium ${assignment.mode === 'equal' ? 'chip-active' : ''}`}
                >
                  Split equally
                </button>
                <button
                  onClick={() => setMode(item.id, 'specific')}
                  className={`chip flex-1 min-h-[40px] text-sm font-medium ${assignment.mode === 'specific' ? 'chip-active' : ''}`}
                >
                  Assign to specific
                </button>
              </div>

              {assignment.mode === 'specific' && (
                <div className="flex flex-wrap gap-2 animate-fade-in">
                  {includedPeople.map((person) => {
                    const active = assignment.assignedPersonIds.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        onClick={() => togglePerson(item.id, person.id)}
                        className={`chip inline-flex items-center gap-1.5 pl-1.5 pr-3.5 py-1 text-sm ${active ? 'chip-active' : ''}`}
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                          style={{ background: active ? 'rgba(255,255,255,0.6)' : '#f1eefb' }}
                        >
                          {person.emoji ?? '🙂'}
                        </span>
                        {person.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {assignment.mode === 'equal' && (
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  Split between {includedPeople.length} {includedPeople.length === 1 ? 'person' : 'people'}
                  {' '}({currency}{(item.price / Math.max(includedPeople.length, 1)).toFixed(2)} each)
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 3 as Step })}
          className="btn-secondary min-h-[52px] flex-1 px-4"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 5 as Step })}
          className="btn-primary min-h-[52px] flex-1 px-4"
        >
          See breakdown
        </button>
      </div>
    </div>
  );
}

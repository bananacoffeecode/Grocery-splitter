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
    <div className="flex flex-col gap-4 pt-4">
      <p className="text-gray-500 text-sm text-center">Who pays for each item?</p>

      <div className="flex flex-col gap-3">
        {assignableItems.map((item, i) => {
          const assignment = getAssignment(item.id);
          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl shadow-sm px-4 py-4 animate-fade-in-up"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-gray-800 text-sm flex-1 mr-2">{item.name}</span>
                <span className="text-gray-600 font-semibold text-sm">{currency}{item.price.toFixed(2)}</span>
              </div>

              {(item.source && item.source !== 'Receipt') || item.orderDate ? (
                <p className="text-xs text-gray-400 mt-0.5 mb-3">
                  {item.source && item.source !== 'Receipt' ? item.source : ''}
                  {item.source && item.source !== 'Receipt' && item.orderDate ? ' · ' : ''}
                  {item.orderDate ?? ''}
                </p>
              ) : <div className="mb-3" />}

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setMode(item.id, 'equal')}
                  className={`press flex-1 min-h-[36px] rounded-lg text-sm font-medium border transition-colors ${
                    assignment.mode === 'equal'
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  Split equally
                </button>
                <button
                  onClick={() => setMode(item.id, 'specific')}
                  className={`press flex-1 min-h-[36px] rounded-lg text-sm font-medium border transition-colors ${
                    assignment.mode === 'specific'
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  Assign to specific
                </button>
              </div>

              {assignment.mode === 'specific' && (
                <div className="flex flex-wrap gap-2">
                  {includedPeople.map((person) => {
                    const active = assignment.assignedPersonIds.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        onClick={() => togglePerson(item.id, person.id)}
                        className={`press rounded-full border px-3 py-1 text-sm transition-colors ${
                          active
                            ? 'bg-green-500 text-white border-green-500'
                            : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        {active ? '' : ''}{person.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {assignment.mode === 'equal' && (
                <p className="text-xs text-gray-400">
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
          className="press min-h-[44px] flex-1 border border-gray-200 text-gray-600 font-semibold rounded-xl px-4 bg-white"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 5 as Step })}
          className="press min-h-[44px] flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl px-4 transition-colors"
        >
          See Breakdown
        </button>
      </div>
    </div>
  );
}

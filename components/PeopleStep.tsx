'use client';

import { useState, useRef } from 'react';
import { useApp } from '@/lib/AppContext';
import { Person, Step } from '@/types';
import { pickEmoji } from '@/lib/emoji';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function PeopleStep() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  const includedCount = state.people.filter((p) => p.included).length;
  const canContinue = includedCount >= 1;

  function toggle(person: Person) {
    dispatch({ type: 'UPSERT_PERSON', payload: { ...person, included: !person.included } });
  }

  function remove(id: string) {
    dispatch({ type: 'DELETE_PERSON', payload: id });
  }

  function addPerson() {
    const name = input.trim();
    if (!name) return;
    const used = state.people.map((p) => p.emoji).filter(Boolean) as string[];
    dispatch({
      type: 'UPSERT_PERSON',
      payload: { id: generateId(), name, included: true, emoji: pickEmoji(used) },
    });
    setInput('');
  }

  // Re-roll a person's emoji to another unused one.
  function changeEmoji(person: Person) {
    const used = state.people.map((p) => p.emoji).filter(Boolean) as string[];
    dispatch({ type: 'UPSERT_PERSON', payload: { ...person, emoji: pickEmoji(used) } });
  }

  function startEdit(person: Person) {
    setEditingId(person.id);
    setEditingName(person.name);
    setTimeout(() => editRef.current?.select(), 0);
  }

  function commitEdit(person: Person) {
    const name = editingName.trim();
    if (name && name !== person.name) {
      dispatch({ type: 'UPSERT_PERSON', payload: { ...person, name } });
    }
    setEditingId(null);
  }

  function selectAll(included: boolean) {
    dispatch({
      type: 'SET_PEOPLE',
      payload: state.people.map((p) => ({ ...p, included })),
    });
  }

  return (
    <div className="flex flex-col gap-4 pt-6">
      <p className="text-center text-sm" style={{ color: 'var(--ink-soft)' }}>Who is splitting this bill?</p>

      <div className="card divide-y divide-[var(--line)] overflow-hidden">
        {state.people.map((person, i) => (
          <div
            key={person.id}
            className="flex items-center gap-3 px-5 py-3.5 min-h-[48px] animate-fade-in-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={person.included}
              aria-label={`${person.included ? 'Deselect' : 'Select'} ${person.name}`}
              onClick={() => toggle(person)}
              className="press w-6 h-6 rounded-lg flex items-center justify-center border transition-colors"
              style={
                person.included
                  ? { background: '#8b6cff', borderColor: 'transparent' }
                  : { background: '#fff', borderColor: '#d6d4e4' }
              }
            >
              {person.included && (
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-white animate-pop" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M5 10.5l3.2 3.2L15 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => changeEmoji(person)}
              aria-label={`Change ${person.name}'s emoji`}
              className="press w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: '#f1eefb' }}
            >
              {person.emoji ?? '🙂'}
            </button>
            {editingId === person.id ? (
              <input
                ref={editRef}
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => commitEdit(person)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(person);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="flex-1 text-sm border-b outline-none bg-transparent"
                style={{ borderColor: '#b784ff', color: 'var(--ink)' }}
              />
            ) : (
              <span
                className="flex-1 text-[15px]"
                style={{ color: person.included ? 'var(--ink)' : 'var(--ink-faint)' }}
                onClick={() => startEdit(person)}
              >
                {person.name}
              </span>
            )}
            <button
              onClick={() => remove(person.id)}
              className="press text-lg transition-colors"
              style={{ color: 'var(--ink-faint)' }}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3 text-sm justify-center">
        <button onClick={() => selectAll(true)} className="press font-semibold gradient-text">
          Select all
        </button>
        <span style={{ color: 'var(--ink-faint)' }}>|</span>
        <button onClick={() => selectAll(false)} className="press font-medium" style={{ color: 'var(--ink-soft)' }}>
          Deselect all
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPerson()}
          placeholder="Add a person..."
          className="flex-1 card-sm px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#c7bcff]"
          style={{ color: 'var(--ink)' }}
        />
        <button
          onClick={addPerson}
          disabled={!input.trim()}
          className="btn-secondary min-h-[44px] px-5 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 2 as Step })}
          className="btn-secondary min-h-[52px] flex-1 px-4"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 4 as Step })}
          disabled={!canContinue}
          className="btn-primary min-h-[52px] flex-1 px-4"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

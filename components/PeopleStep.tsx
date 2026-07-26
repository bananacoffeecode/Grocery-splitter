'use client';

import { useState, useRef } from 'react';
import { useApp } from '@/lib/AppContext';
import { Person, Step } from '@/types';

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
    dispatch({
      type: 'UPSERT_PERSON',
      payload: { id: generateId(), name, included: true },
    });
    setInput('');
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
    <div className="flex flex-col gap-4 pt-4">
      <p className="text-gray-500 text-sm text-center">Who is splitting this bill?</p>

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
        {state.people.map((person, i) => (
          <div
            key={person.id}
            className="flex items-center gap-3 px-4 py-3 min-h-[44px] animate-fade-in-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={person.included}
              aria-label={`${person.included ? 'Deselect' : 'Select'} ${person.name}`}
              onClick={() => toggle(person)}
              className={`press w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                person.included ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
              }`}
            >
              {person.included && (
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-white animate-pop" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M5 10.5l3.2 3.2L15 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
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
                className="flex-1 text-sm border-b border-green-400 outline-none bg-transparent text-gray-800"
              />
            ) : (
              <span
                className={`flex-1 text-sm ${person.included ? 'text-gray-800' : 'text-gray-400'}`}
                onClick={() => startEdit(person)}
              >
                {person.name}
              </span>
            )}
            <button
              onClick={() => remove(person.id)}
              className="text-gray-300 hover:text-red-400 text-lg transition-colors"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 text-sm justify-center">
        <button onClick={() => selectAll(true)} className="text-green-600 underline">
          Select all
        </button>
        <span className="text-gray-300">|</span>
        <button onClick={() => selectAll(false)} className="text-gray-500 underline">
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
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 outline-none focus:border-green-400"
        />
        <button
          onClick={addPerson}
          disabled={!input.trim()}
          className="press min-h-[44px] bg-green-500 hover:bg-green-600 disabled:bg-gray-200 text-white font-semibold rounded-xl px-4 transition-colors"
        >
          Add
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 2 as Step })}
          className="press min-h-[44px] flex-1 border border-gray-200 text-gray-600 font-semibold rounded-xl px-4 bg-white"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 4 as Step })}
          disabled={!canContinue}
          className="press min-h-[44px] flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl px-4 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { PersonTotal, ReceiptItem, SplitwiseGroup, SplitwiseMember } from '@/types';
import { autoMatch, buildExpensePayload } from '@/lib/splitwise';

type Screen = 'key' | 'groups' | 'map' | 'result';

interface Props {
  personTotals: PersonTotal[];
  items: ReceiptItem[];
  currency: string;
  dateStr: string;
  onClose: () => void;
}

async function sw(endpoint: string, method: 'GET' | 'POST', apiKey: string, payload?: object, signal?: AbortSignal) {
  const res = await fetch('/api/splitwise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, method, apiKey, payload }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Splitwise error');
  return data;
}

export default function SplitwiseModal({ personTotals, items, currency, dateStr, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('key');

  // Screen 1
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(true);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // Screen 2
  const [groups, setGroups] = useState<SplitwiseGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<SplitwiseGroup | null>(null);

  // Screen 3
  // mapping: appPersonId -> splitwiseMemberId | null
  const [mapping, setMapping] = useState<Map<string, number | null>>(new Map());
  const [payerMemberId, setPayerMemberId] = useState<number | null>(null);

  // Screen 4
  const [creating, setCreating] = useState(false);
  const [successDesc, setSuccessDesc] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Pre-fill saved key
  useEffect(() => {
    const saved = localStorage.getItem('sw-api-key');
    if (saved) setApiKey(saved);
  }, []);

  // When group is selected, auto-match people
  useEffect(() => {
    if (!selectedGroup) return;
    const members = selectedGroup.members;
    const initMap = new Map<string, number | null>();
    for (const pt of personTotals) {
      initMap.set(pt.personId, autoMatch(pt.name, members));
    }
    setMapping(initMap);
    // Default payer = current Splitwise user if they're in the group
    const currentInGroup = members.find(m => m.id === currentUserId);
    if (currentInGroup) {
      setPayerMemberId(currentInGroup.id);
    } else {
      // Fall back to the first mapped person
      const firstMapped = Array.from(initMap.values()).find(id => id != null);
      if (firstMapped != null) setPayerMemberId(firstMapped);
    }
    setScreen('map');
  }, [selectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleValidateKey() {
    setKeyError(null);
    setKeyLoading(true);
    abortRef.current = new AbortController();
    const timer = setTimeout(() => abortRef.current?.abort(), 15000);
    try {
      const data = await sw('get_current_user', 'GET', apiKey, undefined, abortRef.current.signal);
      clearTimeout(timer);
      const user = data.user;
      setCurrentUserId(user.id);
      if (rememberKey) localStorage.setItem('sw-api-key', apiKey);
      // Immediately fetch groups
      setGroupsLoading(true);
      setScreen('groups');
      const gData = await sw('get_groups', 'GET', apiKey);
      setGroups((gData.groups ?? []).filter((g: SplitwiseGroup) => g.id !== 0));
      setGroupsLoading(false);
    } catch (e: unknown) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : 'Connection failed';
      if (msg.includes('abort') || msg.includes('signal')) {
        setKeyError('Request timed out — check your connection');
      } else {
        setKeyError(msg === 'Invalid API key' ? 'Invalid API key — double-check and try again' : msg);
      }
      setKeyLoading(false);
    }
  }

  async function handleLoadGroups() {
    setGroupsError(null);
    setGroupsLoading(true);
    try {
      const gData = await sw('get_groups', 'GET', apiKey);
      setGroups((gData.groups ?? []).filter((g: SplitwiseGroup) => g.id !== 0));
    } catch (e: unknown) {
      setGroupsError(e instanceof Error ? e.message : 'Failed to load groups');
    } finally {
      setGroupsLoading(false);
    }
  }

  async function handleCreate() {
    if (!selectedGroup || payerMemberId == null) return;
    setCreating(true);
    setCreateError(null);
    setScreen('result');
    try {
      const payload = buildExpensePayload(
        personTotals, mapping, payerMemberId, currency, dateStr, items, selectedGroup.id
      );
      const data = await sw('create_expense', 'POST', apiKey, payload);
      if (data.errors && Object.keys(data.errors).length > 0) {
        const msg = Object.values(data.errors).flat().join(' ');
        throw new Error(msg || 'Splitwise rejected the expense');
      }
      setSuccessDesc(payload.description as string);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create expense');
    } finally {
      setCreating(false);
    }
  }

  function mappedPeople() {
    return personTotals.filter(pt => mapping.get(pt.personId) != null);
  }

  const totalCost = personTotals.reduce((s, pt) => s + pt.total, 0);
  const canCreate = payerMemberId != null && mappedPeople().length > 0 && totalCost > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <span className="font-semibold text-base text-gray-800">Add to Splitwise</span>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">
            &times;
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">

          {/* ── Screen 1: API Key ── */}
          {screen === 'key' && (
            <>
              <p className="text-sm text-gray-500">Enter your Splitwise API key to connect.</p>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setKeyError(null); }}
                  placeholder="Paste your API key"
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-green-400"
                  onKeyDown={e => e.key === 'Enter' && apiKey && handleValidateKey()}
                />
                <a
                  href="https://secure.splitwise.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 mt-0.5"
                >
                  Get your key at splitwise.com/apps →
                </a>
              </div>
              {keyError && <p className="text-sm text-red-600">{keyError}</p>}
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberKey}
                  onChange={e => setRememberKey(e.target.checked)}
                  className="accent-green-500 w-4 h-4"
                />
                Remember this key
              </label>
              <button
                onClick={handleValidateKey}
                disabled={!apiKey || keyLoading}
                className="min-h-[44px] rounded-xl font-semibold text-white text-sm transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#1EB941' }}
              >
                {keyLoading ? 'Connecting…' : 'Continue'}
              </button>
            </>
          )}

          {/* ── Screen 2: Select Group ── */}
          {screen === 'groups' && (
            <>
              <p className="text-sm text-gray-500">Which group is this expense for?</p>
              {groupsLoading && (
                <div className="flex justify-center py-8">
                  <span className="text-gray-400 text-sm animate-pulse">Loading groups…</span>
                </div>
              )}
              {groupsError && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-red-600">{groupsError}</p>
                  <button onClick={handleLoadGroups} className="text-sm text-green-600 underline">Retry</button>
                </div>
              )}
              {!groupsLoading && !groupsError && groups.length === 0 && (
                <p className="text-sm text-gray-400">No groups found on this account.</p>
              )}
              {!groupsLoading && groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroup(g)}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors text-left"
                >
                  <span className="font-medium text-sm text-gray-800">{g.name}</span>
                  <span className="text-xs text-gray-400">{g.members.length} members ›</span>
                </button>
              ))}
              <button onClick={() => setScreen('key')} className="text-sm text-gray-400 underline text-center">
                ← Change API key
              </button>
            </>
          )}

          {/* ── Screen 3: Map People + Payer ── */}
          {screen === 'map' && selectedGroup && (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Group</p>
                <p className="text-sm font-medium text-gray-700">{selectedGroup.name}</p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Match people</p>
                {personTotals.map(pt => {
                  const currentVal = mapping.get(pt.personId) ?? '';
                  return (
                    <div key={pt.personId} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-700 flex-shrink-0 w-24">{pt.name}</span>
                      <select
                        value={currentVal === null ? '' : (currentVal ?? '')}
                        onChange={e => {
                          const val = e.target.value === '' ? null : Number(e.target.value);
                          setMapping(prev => new Map(prev).set(pt.personId, val));
                        }}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-800 bg-white"
                      >
                        <option value="">— Not in group —</option>
                        {selectedGroup.members.map((m: SplitwiseMember) => (
                          <option key={m.id} value={m.id}>
                            {m.first_name} {m.last_name}{m.id === currentUserId ? ' (You)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Who paid?</p>
                <select
                  value={payerMemberId ?? ''}
                  onChange={e => setPayerMemberId(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-800 bg-white"
                >
                  <option value="" disabled>Select payer</option>
                  {mappedPeople().map(pt => {
                    const mid = mapping.get(pt.personId)!;
                    const member = selectedGroup.members.find(m => m.id === mid);
                    return (
                      <option key={pt.personId} value={mid}>
                        {member ? `${member.first_name} ${member.last_name}` : pt.name}
                        {mid === currentUserId ? ' (You)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {mappedPeople().length === 0 && (
                <p className="text-sm text-amber-600">Match at least one person to create the expense.</p>
              )}
              {totalCost <= 0 && (
                <p className="text-sm text-amber-600">Total is {currency}0 — nothing to split.</p>
              )}

              <button
                onClick={handleCreate}
                disabled={!canCreate}
                className="min-h-[44px] rounded-xl font-semibold text-white text-sm transition-colors disabled:opacity-40"
                style={{ backgroundColor: canCreate ? '#1EB941' : undefined }}
              >
                Create Expense — {currency}{totalCost.toFixed(2)}
              </button>

              <button onClick={() => setScreen('groups')} className="text-sm text-gray-400 underline text-center">
                ← Change group
              </button>
            </>
          )}

          {/* ── Screen 4: Result ── */}
          {screen === 'result' && (
            <>
              {creating && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <span className="text-gray-400 text-sm animate-pulse">Creating expense…</span>
                </div>
              )}
              {!creating && successDesc && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl" style={{ backgroundColor: '#e6f9eb' }}>
                    ✓
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-800">Expense created!</p>
                    <p className="text-sm text-gray-500 mt-1">{successDesc}</p>
                    <p className="text-sm font-medium text-gray-700 mt-1">{currency}{totalCost.toFixed(2)}</p>
                  </div>
                  <a
                    href="https://secure.splitwise.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 underline"
                  >
                    View on Splitwise →
                  </a>
                  <button
                    onClick={onClose}
                    className="min-h-[44px] w-full rounded-xl font-semibold text-white text-sm"
                    style={{ backgroundColor: '#1EB941' }}
                  >
                    Done
                  </button>
                </div>
              )}
              {!creating && createError && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-2xl">✕</div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-800">Failed to create expense</p>
                    <p className="text-xs text-gray-400 mt-1">{createError}</p>
                  </div>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => { setCreateError(null); setScreen('map'); }}
                      className="flex-1 min-h-[44px] rounded-xl font-semibold text-white text-sm"
                      style={{ backgroundColor: '#1EB941' }}
                    >
                      Try Again
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 min-h-[44px] rounded-xl border border-gray-200 font-semibold text-gray-700 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

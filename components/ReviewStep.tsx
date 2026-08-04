'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { ReceiptItem, Step } from '@/types';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ReviewStep() {
  const { state, dispatch } = useApp();
  const { items, receiptImageUrls, currency, scanWarning, billDate } = state;
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  const canContinue = items.length > 0;

  function updateItem(id: string, field: keyof ReceiptItem, value: string | number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    dispatch({ type: 'UPSERT_ITEM', payload: { ...item, [field]: value } });
  }

  function addItem() {
    dispatch({
      type: 'UPSERT_ITEM',
      payload: { id: generateId(), name: '', price: 0, rawLine: '' },
    });
  }

  function deleteItem(id: string) {
    dispatch({ type: 'DELETE_ITEM', payload: id });
  }

  function keepItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const { quantity: _q, ...rest } = item;
    dispatch({ type: 'UPSERT_ITEM', payload: { ...rest } });
  }

  function splitItem(id: string, qty: number) {
    const item = items.find((i) => i.id === id);
    if (!item || qty < 2) return;

    const unitPrice = Math.floor((item.price / qty) * 100) / 100;
    const remainder = Math.round((item.price - unitPrice * qty) * 100) / 100;

    const splitItems: ReceiptItem[] = Array.from({ length: qty }, (_, i) => ({
      id: generateId(),
      name: `${item.name} #${i + 1}`,
      price: i === 0 ? parseFloat((unitPrice + remainder).toFixed(2)) : unitPrice,
      rawLine: item.rawLine,
    }));

    dispatch({ type: 'DELETE_ITEM', payload: id });
    splitItems.forEach((si) => dispatch({ type: 'UPSERT_ITEM', payload: si }));
  }

  return (
    <div className="flex flex-col gap-4 pt-6">
      {/* Fullscreen image lightbox */}
      {fullscreenUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setFullscreenUrl(null)}
        >
          <img
            src={fullscreenUrl}
            alt="Receipt fullscreen"
            className="max-w-full max-h-full object-contain rounded-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white text-3xl leading-none w-10 h-10 flex items-center justify-center"
            onClick={() => setFullscreenUrl(null)}
          >
            &times;
          </button>
        </div>
      )}

      {scanWarning && (
        <div className="card-sm border border-amber-200 bg-amber-50/80 p-3 text-amber-700 text-sm animate-fade-in">
          {scanWarning}
        </div>
      )}

      {receiptImageUrls.length > 0 && (
        <div className="card p-4">
          <div className="flex gap-3 overflow-x-auto">
            {receiptImageUrls.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`Receipt ${idx + 1}`}
                className="h-32 w-24 flex-shrink-0 object-cover rounded-2xl border border-[var(--line)] cursor-pointer active:opacity-75"
                onClick={() => setFullscreenUrl(url)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card-sm flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>Bill date</span>
        <input
          type="text"
          value={billDate ?? ''}
          onChange={(e) => dispatch({ type: 'SET_BILL_DATE', payload: e.target.value })}
          placeholder="e.g. 31 Jul 2026"
          className="text-sm text-right font-semibold border-none outline-none bg-transparent w-40"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      <div className="card divide-y divide-[var(--line)] overflow-hidden">
        {items.map((item, i) => (
          <div key={item.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 45}ms` }}>
            <div className="flex items-center gap-2 px-5 py-3.5">
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    placeholder="Item name"
                    className="min-w-0 flex-1 text-[15px] border-none outline-none bg-transparent font-medium"
                    style={{ color: item.price < 0 ? '#7c5ce6' : 'var(--ink)' }}
                  />
                  {item.quantity && item.quantity > 1 && (
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--ink-faint)' }}>&times;{item.quantity}</span>
                  )}
                </div>
                {item.source && (
                  <span className="text-xs leading-tight" style={{ color: 'var(--ink-faint)' }}>{item.source}</span>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={item.price === 0 ? '' : item.price}
                onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-20 text-[15px] border-none outline-none bg-transparent text-right font-semibold"
                style={{ color: item.price < 0 ? '#7c5ce6' : 'var(--ink)' }}
              />
              <button
                onClick={() => setSplittingId(splittingId === item.id ? null : item.id)}
                className="press text-sm min-w-[24px] transition-colors hover:opacity-70"
                style={{ color: 'var(--ink-faint)' }}
                title="Split item"
              >
                ÷
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="press text-lg min-w-[24px] transition-colors hover:text-rose-400"
                style={{ color: 'var(--ink-faint)' }}
              >
                &times;
              </button>
            </div>
            {splittingId === item.id && (
              <div className="mx-5 mb-3 card-sm px-3 py-2 animate-fade-in">
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--ink-soft)' }}>Split into:</p>
                <div className="flex gap-2 items-center">
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => { splitItem(item.id, n); setSplittingId(null); }}
                      className="press flex-1 text-xs bg-white border border-[var(--line)] rounded-xl py-2 font-semibold hover:border-[#c7bcff] transition-colors"
                      style={{ color: 'var(--ink)' }}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setSplittingId(null)}
                    className="press text-xs px-2 py-1.5 font-medium"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {item.quantity && item.quantity > 1 && (
              <div className="mx-5 mb-3 card-sm border border-amber-200 bg-amber-50/70 px-3 py-2">
                <p className="text-xs text-amber-700 font-medium mb-2">
                  {item.quantity} units detected
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => keepItem(item.id)}
                    className="press flex-1 text-xs border border-amber-300 text-amber-700 rounded-xl py-2 font-medium bg-white"
                  >
                    Keep as one item
                  </button>
                  <button
                    onClick={() => splitItem(item.id, item.quantity!)}
                    className="press flex-1 text-xs bg-amber-400 text-amber-900 rounded-xl py-2 font-semibold"
                  >
                    Split into {item.quantity} items
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="px-5 py-3.5">
          <button
            onClick={addItem}
            className="press text-sm font-semibold gradient-text"
          >
            + Add item
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center px-2">
        <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
        <span className="font-bold text-lg">
          <span style={{ color: 'var(--ink-soft)' }} className="text-sm font-medium">Total </span>
          <span className="gradient-text">{currency}{items.reduce((s, i) => s + i.price, 0).toFixed(2)}</span>
        </span>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 1 as Step })}
          className="btn-secondary min-h-[52px] flex-1 px-4"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 3 as Step })}
          disabled={!canContinue}
          className="btn-primary min-h-[52px] flex-1 px-4"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

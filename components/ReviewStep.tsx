'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { ReceiptItem, Step } from '@/types';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ReviewStep() {
  const { state, dispatch } = useApp();
  const { items, receiptImageUrls, currency, scanWarning } = state;
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
    <div className="flex flex-col gap-4 pt-4">
      {/* Fullscreen image lightbox */}
      {fullscreenUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullscreenUrl(null)}
        >
          <img
            src={fullscreenUrl}
            alt="Receipt fullscreen"
            className="max-w-full max-h-full object-contain rounded-xl"
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
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 text-yellow-800 text-sm">
          {scanWarning}
        </div>
      )}

      {receiptImageUrls.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-3">
          <div className="flex gap-2 overflow-x-auto">
            {receiptImageUrls.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`Receipt ${idx + 1}`}
                className="h-32 w-24 flex-shrink-0 object-cover rounded-xl border border-gray-200 cursor-pointer active:opacity-75"
                onClick={() => setFullscreenUrl(url)}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Tap a receipt to view fullscreen</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
        {items.map((item, i) => (
          <div key={item.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 45}ms` }}>
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    placeholder="Item name"
                    className={`min-w-0 flex-1 text-sm border-none outline-none bg-transparent font-medium ${item.price < 0 ? 'text-green-700' : 'text-gray-900'}`}
                  />
                  {item.quantity && item.quantity > 1 && (
                    <span className="text-xs text-gray-400 font-medium flex-shrink-0">&times;{item.quantity}</span>
                  )}
                </div>
                {item.source && (
                  <span className="text-xs text-gray-400 leading-tight">{item.source}</span>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={item.price === 0 ? '' : item.price}
                onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className={`w-20 text-sm border-none outline-none bg-transparent text-right font-medium ${item.price < 0 ? 'text-green-600' : 'text-gray-900'}`}
              />
              <button
                onClick={() => setSplittingId(splittingId === item.id ? null : item.id)}
                className="press text-gray-300 hover:text-green-500 text-sm min-w-[24px] transition-colors"
                title="Split item"
              >
                ÷
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="press text-gray-300 hover:text-red-400 text-lg min-w-[24px] transition-colors"
              >
                &times;
              </button>
            </div>
            {splittingId === item.id && (
              <div className="mx-4 mb-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 animate-fade-in">
                <p className="text-xs text-gray-600 font-medium mb-2">Split into:</p>
                <div className="flex gap-2 items-center">
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => { splitItem(item.id, n); setSplittingId(null); }}
                      className="press flex-1 text-xs bg-white border border-gray-300 text-gray-900 rounded-lg py-1.5 font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setSplittingId(null)}
                    className="press text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {item.quantity && item.quantity > 1 && (
              <div className="mx-4 mb-3 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
                <p className="text-xs text-yellow-700 font-medium mb-2">
                  {item.quantity} units detected
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => keepItem(item.id)}
                    className="press flex-1 text-xs border border-yellow-300 text-yellow-700 rounded-lg py-1.5 font-medium bg-white"
                  >
                    Keep as one item
                  </button>
                  <button
                    onClick={() => splitItem(item.id, item.quantity!)}
                    className="press flex-1 text-xs bg-yellow-400 text-yellow-900 rounded-lg py-1.5 font-medium"
                  >
                    Split into {item.quantity} items
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="px-4 py-3">
          <button
            onClick={addItem}
            className="press text-green-600 text-sm font-medium hover:text-green-700"
          >
            + Add item
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center px-1">
        <span className="text-sm text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        <span className="font-semibold text-gray-800">
          Total: {currency}{items.reduce((s, i) => s + i.price, 0).toFixed(2)}
        </span>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 1 as Step })}
          className="press min-h-[44px] flex-1 border border-gray-200 text-gray-600 font-semibold rounded-xl px-4 bg-white"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 3 as Step })}
          disabled={!canContinue}
          className="press min-h-[44px] flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl px-4 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

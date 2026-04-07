'use client';

import { useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { ReceiptItem, PersonTotal, Step } from '@/types';
import { calculateSplit, grandTotal, formatSplitwiseText } from '@/lib/calculations';

function computeBills(items: ReceiptItem[]) {
  const map = new Map<string, { source: string; orderDate?: string; total: number }>();
  for (const item of items) {
    const src = item.source && item.source !== 'Receipt' ? item.source : null;
    if (!src) continue;
    const key = `${src}::${item.orderDate ?? ''}`;
    if (!map.has(key)) map.set(key, { source: src, orderDate: item.orderDate ?? undefined, total: 0 });
    map.get(key)!.total = Math.round((map.get(key)!.total + item.price) * 100) / 100;
  }
  return Array.from(map.values());
}

export default function BreakdownStep() {
  const { state, dispatch } = useApp();
  const { items, people, assignments, currency } = state;
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const personTotals = calculateSplit(items, people, assignments);
  const total = grandTotal(items);
  const bills = computeBills(items);

  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `grocery-split-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopy() {
    const text = formatSplitwiseText(personTotals, items, assignments, people, currency);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      {/* Card — simple flat styles only for html2canvas */}
      <div
        ref={cardRef}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #f3f4f6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontWeight: 700, fontSize: '18px', color: '#1f2937' }}>Grocery Split</span>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>{dateStr}</span>
        </div>

        {bills.length > 0 && (
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '12px', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bills</span>
            {bills.map((bill, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '12px', marginTop: '6px' }}>
                <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{bill.source}</span>
                <span style={{ fontSize: '12px', color: '#9ca3af', flex: 1, textAlign: 'center' }}>{bill.orderDate ?? ''}</span>
                <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{currency}{bill.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: bills.length > 0 ? 'none' : '1px solid #f3f4f6' }}>
          {personTotals.map((pt) => (
            <div key={pt.personId} style={{ borderBottom: '1px solid #f3f4f6', paddingTop: '12px', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '16px', color: '#1f2937' }}>{pt.name}</span>
                <span style={{ fontWeight: 700, fontSize: '16px', color: '#16a34a' }}>{currency}{pt.total.toFixed(2)}</span>
              </div>
              {pt.items.map((lineItem, i) => (
                <div key={i} style={{ paddingLeft: '12px', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>{lineItem.name}</span>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>{currency}{lineItem.share.toFixed(2)}</span>
                  </div>
                  {(lineItem.source && lineItem.source !== 'Receipt') || lineItem.orderDate ? (
                    <span style={{ fontSize: '11px', color: '#d1d5db' }}>
                      {lineItem.source && lineItem.source !== 'Receipt' ? lineItem.source : ''}
                      {lineItem.source && lineItem.source !== 'Receipt' && lineItem.orderDate ? ' · ' : ''}
                      {lineItem.orderDate ?? ''}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '14px', marginTop: '4px', borderTop: '2px solid #e5e7eb' }}>
          <span style={{ fontWeight: 700, fontSize: '17px', color: '#1f2937' }}>Total</span>
          <span style={{ fontWeight: 700, fontSize: '17px', color: '#1f2937' }}>{currency}{total.toFixed(2)}</span>
        </div>
      </div>

      {/* Buttons — outside card ref so they don't appear in screenshot */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="min-h-[44px] bg-green-500 hover:bg-green-600 disabled:bg-gray-200 text-white font-semibold rounded-xl px-4 transition-colors"
      >
        {downloading ? 'Generating...' : 'Download Image'}
      </button>

      <button
        onClick={handleCopy}
        className="min-h-[44px] border border-gray-200 bg-white text-gray-700 font-semibold rounded-xl px-4 hover:bg-gray-50 transition-colors"
      >
        {copied ? 'Copied!' : 'Copy Text'}
      </button>

      <button
        onClick={() => dispatch({ type: 'SET_STEP', payload: 4 as Step })}
        className="min-h-[44px] text-gray-400 underline text-sm"
      >
        Back to assignments
      </button>

      <button
        onClick={() => dispatch({ type: 'SET_STEP', payload: 1 as Step })}
        className="min-h-[44px] text-gray-400 underline text-sm"
      >
        Start over
      </button>
    </div>
  );
}

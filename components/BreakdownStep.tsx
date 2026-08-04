'use client';

import { useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { ReceiptItem, Step } from '@/types';
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
  const emojiOf = (personId: string) => people.find((p) => p.id === personId)?.emoji ?? '';

  // Bill date: extracted from the receipt (user-editable on the review step),
  // falling back to an item's order date, then today.
  const dateStr = state.billDate
    ?? items.find(i => i.orderDate)?.orderDate
    ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: '#f2f1f7',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `tally-split-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopy() {
    const text = formatSplitwiseText(personTotals, items, assignments, people, currency, dateStr);
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
      {/* Receipt card — flat inline styles only, so html2canvas renders it faithfully */}
      <div ref={cardRef} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '0', padding: '26px 22px 20px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '30px', lineHeight: 1 }}>🧾</div>
            <div style={{ fontWeight: 700, fontSize: '19px', color: '#1c1b2e', marginTop: '8px' }}>Grocery Split</div>
            <input
              value={dateStr}
              onChange={(e) => dispatch({ type: 'SET_BILL_DATE', payload: e.target.value })}
              aria-label="Bill date"
              style={{ fontSize: '13px', color: '#6c6a82', marginTop: '3px', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', width: '150px' }}
            />
          </div>

          <div style={{ borderTop: '1.5px dashed #d7d4e6', margin: '18px 0 14px' }} />

          {/* Bills */}
          {bills.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#8b8a9e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Bills</div>
              {bills.map((bill, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                  <span style={{ fontSize: '13px', color: '#3f3d52', fontWeight: 500 }}>{bill.source}</span>
                  <span style={{ fontSize: '12px', color: '#9a98ad', flex: 1, textAlign: 'center' }}>{bill.orderDate ?? ''}</span>
                  <span style={{ fontSize: '13px', color: '#3f3d52', fontWeight: 600 }}>{currency}{bill.total.toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1.5px dashed #d7d4e6', marginTop: '14px' }} />
            </div>
          )}

          {/* People */}
          {personTotals.map((pt) => (
            <div key={pt.personId} style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid #f1eff7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '16px', color: '#1c1b2e' }}>
                  <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#f1eefb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                    {emojiOf(pt.personId)}
                  </span>
                  {pt.name}
                </span>
                <span style={{ fontWeight: 800, fontSize: '16px', color: '#7c5ce6' }}>{currency}{pt.total.toFixed(2)}</span>
              </div>
              {pt.items.map((lineItem, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingLeft: '40px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '13.5px', color: '#4b4a5e' }}>
                    {lineItem.name}
                    {bills.length > 1 && lineItem.source && lineItem.source !== 'Receipt'
                      ? <span style={{ fontSize: '11px', color: '#a3a1b5' }}> · {lineItem.source}</span>
                      : null}
                  </span>
                  <span style={{ fontSize: '13.5px', color: '#4b4a5e', fontWeight: 500 }}>{currency}{lineItem.share.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}

          {/* Total */}
          <div style={{ borderTop: '1.5px dashed #d7d4e6', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '18px', color: '#1c1b2e' }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: '20px', color: '#7c5ce6' }}>{currency}{total.toFixed(2)}</span>
          </div>

          {/* Barcode */}
          <div style={{ marginTop: '20px' }}>
            <div style={{
              height: '46px',
              backgroundImage: 'repeating-linear-gradient(90deg, #1c1b2e 0, #1c1b2e 2px, #ffffff 2px, #ffffff 4px, #1c1b2e 4px, #1c1b2e 7px, #ffffff 7px, #ffffff 9px, #1c1b2e 9px, #1c1b2e 10px, #ffffff 10px, #ffffff 13px)',
            }} />
            <div style={{ textAlign: 'center', fontSize: '11px', letterSpacing: '3px', color: '#8b8a9e', marginTop: '8px', fontFamily: 'ui-monospace, monospace' }}>
              TALLY · {String(Math.round(total * 100)).padStart(6, '0')}
            </div>
          </div>
        </div>

        {/* Scalloped receipt bottom edge */}
        <div style={{
          height: '11px',
          backgroundColor: 'transparent',
          backgroundImage: 'radial-gradient(circle at 11px 0, #ffffff 11px, transparent 11.5px)',
          backgroundSize: '22px 11px',
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'left top',
        }} />
      </div>

      {/* Buttons — outside card ref so they don't appear in screenshot */}

      {/* Back, Save image, Copy text — one line */}
      <div className="flex gap-3">
        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 4 as Step })}
          className="btn-secondary flex-1 min-h-[52px] px-2 text-sm"
        >
          Back
        </button>
        <button
          onClick={handleCopy}
          className="btn-secondary flex-1 min-h-[52px] px-2 text-sm"
        >
          {copied ? 'Copied!' : 'Copy text'}
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn-primary flex-1 min-h-[52px] px-2 text-sm"
        >
          {downloading ? 'Generating…' : 'Save image'}
        </button>
      </div>

      <button
        onClick={() => dispatch({ type: 'SET_STEP', payload: 1 as Step })}
        className="press min-h-[40px] text-sm font-semibold"
        style={{ color: 'var(--ink)' }}
      >
        Start over
      </button>
    </div>
  );
}

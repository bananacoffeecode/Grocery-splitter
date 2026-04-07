'use client';

import { useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { ReceiptItem, Step } from '@/types';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Deduplicates across receipt files only — items within the same receipt are never removed,
// so buying the same product twice on one receipt is correctly preserved.
function deduplicateItems(groups: ReceiptItem[][]): { items: ReceiptItem[]; removedCount: number } {
  const seenAcrossReceipts = new Set<string>();
  const deduped: ReceiptItem[] = [];
  let removedCount = 0;
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.name.toLowerCase().trim()}::${item.price}`;
      if (seenAcrossReceipts.has(key)) {
        removedCount++;
      } else {
        deduped.push(item);
      }
    }
    // Mark all keys from this receipt as seen after processing the whole group
    for (const item of group) {
      seenAcrossReceipts.add(`${item.name.toLowerCase().trim()}::${item.price}`);
    }
  }
  return { items: deduped, removedCount };
}

export default function UploadStep() {
  const { dispatch } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles);
    setFiles(prev => [...prev, ...arr]);
    arr.forEach(f => setPreviews(prev => [...prev, URL.createObjectURL(f)]));
    setError(null);
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleScan() {
    if (!files.length) return;
    setScanning(true);
    setScannedCount(0);
    setError(null);

    try {
      const allItemGroups: ReceiptItem[][] = [];
      let detectedCurrency = '₹';

      for (let i = 0; i < files.length; i++) {
        setScannedCount(i + 1);
        const base64 = await toBase64(files[i]);
        const res = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: files[i].type }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `Failed to parse image ${i + 1}`);
        }

        const { items, source, orderDate, currency } = await res.json();
        if (currency && currency !== '₹') detectedCurrency = currency;
        const receiptItems: ReceiptItem[] = items.map((item: { name: string; price: number; quantity?: number }) => ({
          id: generateId(),
          name: item.name,
          price: item.price,
          rawLine: item.name,
          quantity: item.quantity && item.quantity > 1 ? item.quantity : undefined,
          source: source || 'Receipt',
          orderDate: orderDate || undefined,
        }));
        allItemGroups.push(receiptItems);
      }

      const { items: deduped } = deduplicateItems(allItemGroups);

      dispatch({ type: 'SET_RECEIPTS', payload: previews });
      dispatch({ type: 'SET_ITEMS', payload: deduped });
      dispatch({ type: 'SET_CURRENCY', payload: detectedCurrency });
      dispatch({ type: 'SET_STEP', payload: 2 as Step });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setScanning(false);
    }
  }

  const hasFiles = files.length > 0;

  return (
    <div className="flex flex-col gap-4 pt-4">
      {!hasFiles ? (
        <div
          className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 flex flex-col items-center justify-center min-h-[220px] p-6 cursor-pointer"
          onClick={() => !scanning && inputRef.current?.click()}
        >
          <div className="text-5xl mb-3 text-gray-300">&#128247;</div>
          <p className="text-gray-500 font-medium">Tap to add your receipts</p>
          <p className="text-gray-400 text-sm mt-1">Supports JPG, PNG, HEIC</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm p-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {previews.map((src, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                <img
                  src={src}
                  alt={`Receipt ${idx + 1}`}
                  className="h-32 w-24 object-cover rounded-xl border border-gray-200"
                />
                <button
                  onClick={() => removeFile(idx)}
                  className="absolute -top-1.5 -right-1.5 bg-gray-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-2 text-sm text-green-600 font-medium"
          >
            + Add more
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleScan}
        disabled={!hasFiles || scanning}
        className="min-h-[44px] bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl px-4 transition-colors"
      >
        {scanning
          ? `Scanning ${scannedCount} / ${files.length}…`
          : hasFiles
          ? `Scan ${files.length > 1 ? `all ${files.length} receipts` : 'Receipt'}`
          : 'Scan Receipt'}
      </button>

      {hasFiles && !scanning && (
        <button
          onClick={() => {
            dispatch({ type: 'SET_RECEIPTS', payload: previews });
            dispatch({ type: 'SET_STEP', payload: 2 as Step });
          }}
          className="min-h-[44px] text-gray-500 underline text-sm"
        >
          Skip scan — enter items manually
        </button>
      )}

    </div>
  );
}

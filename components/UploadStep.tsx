'use client';

import { useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { ReceiptItem, Step } from '@/types';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Downscale + JPEG-compress the receipt to keep the upload payload small while
// preserving enough resolution for the vision model to read prices accurately.
async function toUploadBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const img = await loadImage(file);
  const maxDim = 2200;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 1_300_000 && quality > 0.4) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

export default function UploadStep() {
  const { dispatch } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(newFiles: FileList | File[]) {
    // Only accept images (drag-and-drop can carry anything).
    const arr = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
    if (!arr.length) {
      setError('Please drop image files (JPG, PNG, HEIC).');
      return;
    }
    setFiles(prev => [...prev, ...arr]);
    arr.forEach(f => setPreviews(prev => [...prev, URL.createObjectURL(f)]));
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (scanning) return;
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!scanning && !dragging) setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Ignore drag-leave events bubbling up from children.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleScan() {
    if (!files.length) return;
    setScanning(true);
    setError(null);

    try {
      // Send ALL screenshots together in one request. Groq reads them as a single
      // receipt — merging overlapping screenshots and de-duplicating shared items —
      // so the result tallies to one total. No client-side OCR: Groq only.
      const images = await Promise.all(
        files.map(async (file) => {
          const { base64, mimeType } = await toUploadBase64(file);
          return { imageBase64: base64, mimeType };
        })
      );

      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to scan receipt.');
      }

      const { items, source, orderDate, currency, tallyWarning } = await res.json();

      const receiptItems = (items as { name: string; price: number; quantity?: number }[]).map(
        (item) => ({
          id: generateId(),
          name: item.name,
          price: item.price,
          rawLine: item.name,
          quantity: item.quantity && item.quantity > 1 ? item.quantity : undefined,
          source: source || 'Receipt',
          orderDate: orderDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        })
      ) as ReceiptItem[];

      dispatch({ type: 'SET_RECEIPTS', payload: previews });
      dispatch({ type: 'SET_ITEMS', payload: receiptItems });
      dispatch({ type: 'SET_CURRENCY', payload: currency && currency !== '₹' ? currency : '₹' });
      dispatch({ type: 'SET_SCAN_WARNING', payload: tallyWarning || null });
      dispatch({ type: 'SET_STEP', payload: 2 as Step });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setScanning(false);
    }
  }

  const hasFiles = files.length > 0;

  return (
    <div
      className="flex flex-col gap-4 pt-4"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {!hasFiles ? (
        <div
          className={`bg-white rounded-2xl shadow-sm border-2 border-dashed flex flex-col items-center justify-center min-h-[220px] p-6 cursor-pointer transition-all duration-200 ${
            dragging
              ? 'border-green-400 bg-green-50 scale-[1.01]'
              : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => !scanning && inputRef.current?.click()}
        >
          <div className={`text-5xl mb-3 transition-transform duration-200 ${dragging ? 'text-green-400 scale-110' : 'text-gray-300'}`}>&#128247;</div>
          <p className={`font-medium transition-colors ${dragging ? 'text-green-600' : 'text-gray-500'}`}>
            {dragging ? 'Drop your receipts here' : 'Tap or drag receipts here'}
          </p>
          <p className="text-gray-400 text-sm mt-1">Supports JPG, PNG, HEIC</p>
        </div>
      ) : (
        <div className={`bg-white rounded-2xl shadow-sm p-3 border-2 transition-colors duration-200 ${dragging ? 'border-green-400 border-dashed bg-green-50' : 'border-transparent'}`}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {previews.map((src, idx) => (
              <div key={idx} className="relative flex-shrink-0 animate-scale-in">
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
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm animate-fade-in">
          {error}
        </div>
      )}

      <button
        onClick={handleScan}
        disabled={!hasFiles || scanning}
        className="press min-h-[44px] bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl px-4 transition-colors"
      >
        {scanning ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            {files.length > 1 ? `Reading ${files.length} screenshots…` : 'Reading receipt…'}
          </span>
        ) : hasFiles ? (
          `Scan ${files.length > 1 ? `all ${files.length} receipts` : 'Receipt'}`
        ) : (
          'Scan Receipt'
        )}
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

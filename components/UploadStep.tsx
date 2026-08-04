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
async function toUploadBase64(file: File, maxDim: number): Promise<{ base64: string; mimeType: string }> {
  const img = await loadImage(file);
  // Vision-model image tokens scale with pixels and the free Groq tier caps a
  // request at 8k tokens. A single receipt can be larger (dense text stays
  // readable); several screenshots must each stay smaller to fit the budget.
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

  let quality = 0.7;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 900_000 && quality > 0.4) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

// Groq bills a roughly FIXED token cost per image (resolution barely matters), so
// N separate screenshots blow past the free 8k-token cap. Stacking them into ONE
// tall image is one cheap image regardless of how many — it always fits, and the
// model de-duplicates any overlapping rows.
async function stitchToBase64(files: File[]): Promise<{ base64: string; mimeType: string }> {
  const imgs = await Promise.all(files.map(loadImage));
  const targetW = 760;
  const rows = imgs.map((img) => ({ img, h: Math.round(img.height * (targetW / img.width)) }));
  const totalH = rows.reduce((s, r) => s + r.h, 0);
  const maxH = 3200; // cap so the combined image stays readable and light
  const k = totalH > maxH ? maxH / totalH : 1;
  const w = Math.round(targetW * k);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = Math.round(totalH * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  let y = 0;
  for (const r of rows) {
    const h = Math.round(r.h * k);
    ctx.drawImage(r.img, 0, y, w, h);
    y += h;
  }

  let quality = 0.72;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 1_400_000 && quality > 0.4) {
    quality -= 0.12;
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
      // One screenshot → send it large & readable. Multiple → stitch them into a
      // single tall image so the request stays one cheap image under the free tier,
      // and Groq merges/de-duplicates the overlapping rows into one receipt.
      const { base64, mimeType } =
        files.length === 1 ? await toUploadBase64(files[0], 1500) : await stitchToBase64(files);
      const images = [{ imageBase64: base64, mimeType }];

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
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

      const receiptItems = (items as { name: string; price: number; quantity?: number }[]).map(
        (item) => ({
          id: generateId(),
          name: item.name,
          price: item.price,
          rawLine: item.name,
          quantity: item.quantity && item.quantity > 1 ? item.quantity : undefined,
          source: source || 'Receipt',
          orderDate: orderDate || today,
        })
      ) as ReceiptItem[];

      dispatch({ type: 'SET_RECEIPTS', payload: previews });
      dispatch({ type: 'SET_ITEMS', payload: receiptItems });
      dispatch({ type: 'SET_CURRENCY', payload: currency && currency !== '₹' ? currency : '₹' });
      dispatch({ type: 'SET_SCAN_WARNING', payload: tallyWarning || null });
      dispatch({ type: 'SET_BILL_DATE', payload: orderDate || today });
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
      className="flex flex-col gap-3 pt-6"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {!hasFiles ? (
        <div
          className={`card relative overflow-hidden flex flex-col items-center justify-center min-h-[300px] p-8 cursor-pointer transition-all duration-300 ${
            dragging ? 'scale-[1.02]' : ''
          }`}
          style={{ borderStyle: 'dashed', borderWidth: 2, borderColor: dragging ? '#8b6cff' : '#cdc7ea' }}
          onClick={() => !scanning && inputRef.current?.click()}
        >
          {/* Camera emoji */}
          <div className={`cam-breathe mb-5 text-[64px] leading-none transition-transform duration-300 ${dragging ? 'scale-110' : ''}`}>
            &#128247;
          </div>
          <p className="relative font-semibold text-[17px]" style={{ color: 'var(--ink)' }}>
            {dragging ? 'Drop your receipts here' : 'Tap or drag receipts here'}
          </p>
          <p className="relative text-sm mt-1.5" style={{ color: 'var(--ink-faint)' }}>Supports JPG, PNG, HEIC</p>
        </div>
      ) : (
        <div className={`card p-4 transition-transform duration-200 ${dragging ? 'scale-[1.01]' : ''}`}>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {previews.map((src, idx) => (
              <div key={idx} className="relative flex-shrink-0 animate-scale-in">
                <img
                  src={src}
                  alt={`Receipt ${idx + 1}`}
                  className="h-32 w-24 object-cover rounded-xl border border-[var(--line)]"
                />
                <button
                  onClick={() => removeFile(idx)}
                  className="press absolute top-1 right-1 bg-black/55 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm leading-none"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="press mt-3 text-sm font-semibold gradient-text"
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
        <div className="card-sm border border-rose-200 bg-rose-50/80 p-3 text-rose-600 text-sm animate-fade-in">
          {error}
        </div>
      )}

      <button
        onClick={handleScan}
        disabled={!hasFiles || scanning}
        className="btn-primary min-h-[52px] px-4"
      >
        {scanning ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-[#2a2440]/30 border-t-[#2a2440] rounded-full animate-spin" />
            {files.length > 1 ? `Reading ${files.length} screenshots…` : 'Reading receipt…'}
          </span>
        ) : hasFiles ? (
          `Scan ${files.length > 1 ? `all ${files.length} receipts` : 'receipt'}`
        ) : (
          'Scan receipt'
        )}
      </button>

      {hasFiles && !scanning && (
        <button
          onClick={() => {
            dispatch({ type: 'SET_RECEIPTS', payload: previews });
            dispatch({ type: 'SET_STEP', payload: 2 as Step });
          }}
          className="btn-secondary min-h-[48px] px-4"
        >
          Enter manually
        </button>
      )}

    </div>
  );
}

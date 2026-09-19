import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface HsnEntry { code: string; description: string; gst: number; type: 'HSN' | 'SAC'; }

/**
 * HSN/SAC code field with search-as-you-type. Type a description ("pump") or a
 * code prefix ("8413") to see matches from the common HSN/SAC catalog; pick one
 * to fill the code (and, via onPick, a suggested GST rate).
 */
export function HsnSearch({ value, onChange, onPick, placeholder }: {
  value: string;
  onChange: (code: string) => void;
  onPick?: (e: HsnEntry) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<HsnEntry[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<HsnEntry[]>(`/products/hsn?q=${encodeURIComponent(value.trim())}`);
        setResults(data);
      } catch { setResults([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [value, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(e: HsnEntry) {
    onChange(e.code);
    onPick?.(e);
    setOpen(false);
  }

  return (
    <div className="hsn-search" ref={boxRef}>
      <input
        value={value}
        placeholder={placeholder ?? 'Type a product/service or code…'}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
      />
      {open && results.length > 0 && (
        <div className="hsn-panel">
          {results.map((r) => (
            <button type="button" key={r.code} className="hsn-row" onClick={() => pick(r)}>
              <span className="hsn-code">{r.code}</span>
              <span className="hsn-desc">{r.description}</span>
              <span className="hsn-gst">{r.gst}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

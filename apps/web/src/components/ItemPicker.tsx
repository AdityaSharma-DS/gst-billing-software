import { useMemo, useRef, useState } from 'react';

export interface PickerProduct {
  id: string; name: string; hsnSacCode?: string | null; unit?: string | null;
  rate: string | number; gstRate: string | number;
}

const inr = (n: string | number) => '₹' + Number(n).toLocaleString('en-IN');

/**
 * Searchable item picker (the pattern used by Zoho/Swipe/Vyapar):
 * type to filter inventory, rich rows show HSN · rate · GST, arrow keys +
 * Enter to select, and a "+ add as new item" row for unknown items
 * (new items are auto-saved to inventory when the bill is saved).
 */
export function ItemPicker({ value, products, onText, onPick }: {
  value: string;
  products: PickerProduct[];
  onText: (v: string) => void;
  onPick: (p: PickerProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
    return list.slice(0, 8);
  }, [value, products]);

  const exact = products.some((p) => p.name.toLowerCase() === value.trim().toLowerCase());
  const showCreate = value.trim().length > 0 && !exact;
  const rows = matches.length + (showCreate ? 1 : 0);

  function pick(i: number) {
    if (i < matches.length) onPick(matches[i]);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open && ['ArrowDown', 'ArrowUp'].includes(e.key)) { setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, rows - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hi); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="item-picker" ref={wrapRef}>
      <input
        className="cell-input"
        value={value}
        placeholder="Search items…"
        onChange={(e) => { onText(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {open && rows > 0 && (
        <div className="picker-panel" onMouseDown={(e) => e.preventDefault()}>
          {matches.map((p, i) => (
            <button key={p.id} className={`picker-row ${hi === i ? 'picker-row--hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(i)}>
              <span className="picker-name">{p.name}</span>
              <span className="picker-sub">
                {p.hsnSacCode ? `HSN ${p.hsnSacCode} · ` : ''}{inr(p.rate)}{p.unit ? ` / ${p.unit}` : ''}
              </span>
              <span className="picker-gst">{Number(p.gstRate)}%</span>
            </button>
          ))}
          {showCreate && (
            <button
              className={`picker-row picker-row--new ${hi === rows - 1 ? 'picker-row--hi' : ''}`}
              onMouseEnter={() => setHi(rows - 1)}
              onClick={() => setOpen(false)}
            >
              <span className="picker-name">+ Add “{value.trim()}” as new item</span>
              <span className="picker-sub">Saved to inventory when the bill is saved</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; msg: string; kind: Kind }

/** Fire a toast from anywhere: toast('Saved'), toast('Failed', 'error'). */
export function toast(msg: string, kind: Kind = 'success') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg, kind } }));
}

let seq = 0;

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { msg, kind } = (e as CustomEvent).detail;
      const t = { id: ++seq, msg, kind };
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3500);
    };
    window.addEventListener('app-toast', on);
    return () => window.removeEventListener('app-toast', on);
  }, []);
  return (
    <div className="toaster">
      {items.map((t) => <div key={t.id} className={`toast toast--${t.kind}`}>{t.msg}</div>)}
    </div>
  );
}

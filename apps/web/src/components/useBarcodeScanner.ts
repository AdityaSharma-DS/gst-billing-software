import { useEffect, useRef } from 'react';

/**
 * Global hardware-scanner capture. USB/Bluetooth barcode scanners act as HID
 * keyboards that "type" the code as a very fast keystroke burst ending in a
 * terminator (Enter/Tab). This hook watches document keystrokes, distinguishes
 * that fast burst from human typing (inter-key gap), and fires `onScan` — so a
 * scan is picked up anywhere on the page without focusing an input.
 *
 * It stays out of the way while the user is typing in a field (those focused
 * scans are handled by the dedicated barcode box).
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  opts: { enabled?: boolean; suffix?: 'Enter' | 'Tab'; minLength?: number; gapMs?: number } = {},
) {
  const buf = useRef('');
  const last = useRef(0);

  useEffect(() => {
    const enabled = opts.enabled ?? true;
    if (!enabled) return;
    const suffix = opts.suffix ?? 'Enter';
    const minLength = opts.minLength ?? 4;
    const gapMs = opts.gapMs ?? 60; // scanners emit chars faster than this

    const isEditable = (el: Element | null) => {
      if (!el) return false;
      const t = (el as HTMLElement).tagName;
      return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (el as HTMLElement).isContentEditable;
    };

    function onKey(e: KeyboardEvent) {
      if (isEditable(document.activeElement)) return; // don't intercept typing
      const now = performance.now();
      if (e.key === suffix) {
        if (buf.current.length >= minLength) { const code = buf.current; buf.current = ''; e.preventDefault(); onScan(code); }
        else buf.current = '';
        return;
      }
      if (e.key.length === 1) {
        if (now - last.current > gapMs) buf.current = ''; // slow gap ⇒ human / new burst
        buf.current += e.key;
        last.current = now;
      }
    }

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onScan, opts.enabled, opts.suffix, opts.minLength, opts.gapMs]);
}

/**
 * Theme + accent preferences (persisted per browser). Applied to
 * <html> as data-theme / data-accent / data-contrast attributes; the
 * matching CSS variable overrides live in styles/tokens.css.
 */
export type Theme = 'light' | 'dark';
export type Accent = 'orange' | 'blue' | 'emerald' | 'rose';

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'orange', label: 'DONICY Orange', swatch: '#F68820' },
  { id: 'blue', label: 'Ocean Blue', swatch: '#3B6FE0' },
  { id: 'emerald', label: 'Emerald', swatch: '#0F9E6E' },
  { id: 'rose', label: 'Rose', swatch: '#E0446B' },
];

const KEY_THEME = 'ui.theme';
const KEY_ACCENT = 'ui.accent';
const KEY_CONTRAST = 'ui.contrast';

export function getTheme(): Theme { return (localStorage.getItem(KEY_THEME) as Theme) || 'light'; }
export function getAccent(): Accent { return (localStorage.getItem(KEY_ACCENT) as Accent) || 'orange'; }
export function getContrast(): boolean { return localStorage.getItem(KEY_CONTRAST) === '1'; }

export function setTheme(t: Theme) { localStorage.setItem(KEY_THEME, t); apply(); }
export function setAccent(a: Accent) { localStorage.setItem(KEY_ACCENT, a); apply(); }
export function setContrast(on: boolean) { localStorage.setItem(KEY_CONTRAST, on ? '1' : '0'); apply(); }

/** Apply the stored preferences to the document root. Safe to call repeatedly. */
export function apply() {
  const el = document.documentElement;
  el.setAttribute('data-theme', getTheme());
  el.setAttribute('data-accent', getAccent());
  if (getContrast()) el.setAttribute('data-contrast', 'high');
  else el.removeAttribute('data-contrast');
}

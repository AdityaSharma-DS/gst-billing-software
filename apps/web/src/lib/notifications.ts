// Per-browser read state for notifications (no server-side store).
const KEY = 'notif.read';

export function getReadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}

export function markRead(ids: string[]) {
  const s = getReadIds();
  ids.forEach((i) => s.add(i));
  localStorage.setItem(KEY, JSON.stringify([...s]));
}

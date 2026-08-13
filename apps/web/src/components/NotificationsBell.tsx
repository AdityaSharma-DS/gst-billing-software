import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getReadIds, markRead } from '../lib/notifications';
import { IconBell } from './icons';

interface Item { id: string; type: 'gst' | 'invoice' | 'recurring'; severity: 'high' | 'medium' | 'info'; title: string; detail: string; amount?: number; date: string; group: 'Today' | 'This Week' | 'Earlier'; }

const GROUPS: Item['group'][] = ['Today', 'This Week', 'Earlier'];
const LINK: Record<Item['type'], string> = { gst: '/returns', invoice: '/invoices', recurring: '/recurring' };

export function NotificationsBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [read, setRead] = useState<Set<string>>(() => getReadIds());
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<{ items: Item[]; count: number }>('/notifications')).data,
    refetchInterval: 60_000,
  });
  const items = data?.items ?? [];
  const unread = items.filter((i) => !read.has(i.id));
  const badge = unread.length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function markAll() { markRead(items.map((i) => i.id)); setRead(getReadIds()); }
  function openItem(it: Item) {
    markRead([it.id]); setRead(getReadIds()); setOpen(false);
    nav(LINK[it.type]);
  }

  const shown = tab === 'unread' ? unread : items;

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button className={`icon-btn ${open ? 'icon-btn--active' : ''}`} aria-label="Notifications" onClick={() => setOpen((o) => !o)}>
        <IconBell size={20} />
        {badge > 0 && <span className="notif-badge">{badge > 9 ? '9+' : badge}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Notifications</strong>
            {badge > 0 && <button className="link-btn" onClick={markAll}>Mark all as read</button>}
          </div>
          <div className="notif-tabs">
            <button className={`notif-tab ${tab === 'all' ? 'notif-tab--active' : ''}`} onClick={() => setTab('all')}>All</button>
            <button className={`notif-tab ${tab === 'unread' ? 'notif-tab--active' : ''}`} onClick={() => setTab('unread')}>Unread{badge ? ` (${badge})` : ''}</button>
          </div>

          <div className="notif-list">
            {shown.length === 0 && <div className="notif-empty muted">{tab === 'unread' ? "You're all caught up 🎉" : 'No notifications.'}</div>}
            {GROUPS.map((g) => {
              const group = shown.filter((i) => i.group === g);
              if (group.length === 0) return null;
              return (
                <div key={g}>
                  <div className="notif-group-label">{g}</div>
                  {group.map((it) => (
                    <button key={it.id} className={`notif-item ${read.has(it.id) ? '' : 'notif-item--unread'}`} onClick={() => openItem(it)}>
                      <span className={`notif-dot notif-dot--${it.severity}`} />
                      <span className="notif-body">
                        <span className="notif-title">{it.title}</span>
                        <span className="notif-detail muted">{it.detail}</span>
                      </span>
                      {!read.has(it.id) && <span className="notif-unread-dot" />}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

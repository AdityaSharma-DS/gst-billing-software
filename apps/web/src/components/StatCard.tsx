import { ReactNode } from 'react';

export function StatCard({ icon, label, value, delta, up }: {
  icon: ReactNode; label: string; value: string; delta: string; up: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-row">
        <span className="stat-value">{value}</span>
        <span className={`delta ${up ? 'delta--up' : 'delta--down'}`}>
          {up ? '↑' : '↓'} {delta}
        </span>
      </div>
    </div>
  );
}

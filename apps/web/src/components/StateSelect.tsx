import { useState } from 'react';
import { INDIAN_STATES, getDefaultState, setDefaultState, clearDefaultState } from '../lib/states';
import { IconLock, IconUnlock } from './icons';

/**
 * Indian state dropdown (GST state codes) with a "lock as default" toggle.
 * When locked, the chosen state is remembered (per tenant) and pre-fills future forms.
 */
export function StateSelect({ value, onChange, label = 'State' }: {
  value: string; onChange: (code: string) => void; label?: string;
}) {
  const [defaultCode, setDefaultCode] = useState(getDefaultState());
  const isDefault = !!value && defaultCode === value;

  function toggleLock() {
    if (isDefault) { clearDefaultState(); setDefaultCode(''); }        // unlock
    else if (value) { setDefaultState(value); setDefaultCode(value); } // lock current selection
  }

  return (
    <label>{label}
      <div className="state-select">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select state…</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
          ))}
        </select>
        <button
          type="button"
          className={`lock-btn ${isDefault ? 'locked' : ''}`}
          title={isDefault ? 'Default state (click to unlock)' : 'Lock this state as default'}
          disabled={!value}
          onClick={toggleLock}
          aria-label={isDefault ? 'Unlock default state' : 'Lock as default state'}
        >
          {isDefault ? <IconLock size={18} /> : <IconUnlock size={18} />}
        </button>
      </div>
      {isDefault && <span className="hint">Locked as default</span>}
    </label>
  );
}

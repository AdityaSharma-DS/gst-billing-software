import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

export function ImportBills() {
  const nav = useNavigate();
  const loc = useLocation();
  const direction: 'OUTGOING' | 'INCOMING' = loc.pathname.startsWith('/purchases') ? 'INCOMING' : 'OUTGOING';
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<{ created: number; failed: number; errors: { row: number; message: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setCsv(await f.text());
  }
  async function downloadTemplate() {
    const res = await api.get('/bills/import/template', { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.data); a.download = 'bill-import-template.csv'; a.click();
  }
  async function run() {
    setBusy(true); setResult(null);
    try { setResult((await api.post('/bills/import', { csv, direction })).data); }
    finally { setBusy(false); }
  }

  return (
    <section className="page">
      <div className="page-head"><h2>Bulk Import — {direction === 'OUTGOING' ? 'Invoices' : 'Purchases'}</h2>
        <button className="btn-ghost" onClick={() => nav(direction === 'OUTGOING' ? '/invoices' : '/purchases')}>← Back</button>
      </div>
      <div className="card">
        <p className="muted small">Upload a CSV using the template columns: billDate, partyName, description, hsnSacCode, quantity, rate, gstRate, placeOfSupply. Each row creates one bill.</p>
        <div className="page-actions" style={{ margin: '12px 0' }}>
          <button className="btn-ghost" onClick={downloadTemplate}>Download Template</button>
          <input type="file" accept=".csv" onChange={onFile} />
          <button className="btn-primary" disabled={!csv || busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
        </div>
        {csv && <textarea className="csv-preview" value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} />}
        {result && (
          <div className="import-result">
            <p className="pos">Created: {result.created}</p>
            {result.failed > 0 && <>
              <p className="neg">Failed: {result.failed}</p>
              <ul>{result.errors.map((e, i) => <li key={i} className="small muted">Row {e.row}: {e.message}</li>)}</ul>
            </>}
          </div>
        )}
      </div>
    </section>
  );
}

import { useState } from 'react';
import { api } from '../lib/api';

type MainTab = 'GSTR-1' | 'GSTR-3B' | 'GSTR-3B Reconciliation' | 'TDS/TCS Report';
type SubTab = 'B2B' | 'B2CL' | 'B2CS' | 'CDNR';

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

const b2b = [
  { gstin: '27ABCDE1234F1Z5', invoice: 'INV-00001', date: '06-12-26', value: 118000, rate: 18, taxable: 100000, igst: 0, cgst: 9000, sgst: 9000 },
  { gstin: '29LMNOP4321K1Z9', invoice: 'INV-00002', date: '08-12-26', value: 66080, rate: 18, taxable: 56000, igst: 10080, cgst: 0, sgst: 0 },
];

export function Returns() {
  const [tab, setTab] = useState<MainTab>('GSTR-1');
  const [sub, setSub] = useState<SubTab>('B2B');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function exportJson(returnType: string) {
    setBusy(true); setMsg('');
    try {
      await api.post('/returns/generate', { returnType, period: '06-2026' });
      setMsg(`${returnType} JSON generated.`);
    } catch {
      setMsg('Sign in to generate (backend).');
    } finally { setBusy(false); }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>GST Returns</h2>
        <div className="page-actions"><button className="btn-ghost">Monthly</button><button className="btn-ghost">FY 2026-27</button></div>
      </div>

      <div className="stat-grid stat-grid--4">
        {[['Total Tax Liability', '₹3,782'], ['ITC Available', '₹3,782'], ['Net Payable', '₹3,782'], ['Filed', '₹3,782']].map(([l, v]) => (
          <div className="stat-card" key={l}><div className="stat-label">{l}</div><div className="stat-value">{v}</div></div>
        ))}
      </div>

      <div className="card">
        <div className="tabs tabs--between">
          <div className="tabs-group">
            {(['GSTR-1', 'GSTR-3B', 'GSTR-3B Reconciliation', 'TDS/TCS Report'] as MainTab[]).map((t) => (
              <button key={t} className={`tab ${tab === t ? 'tab--active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <div className="tabs-actions">
            <button className="btn-ghost" disabled={busy} onClick={() => exportJson(tab === 'GSTR-3B' ? 'GSTR3B' : 'GSTR1')}>Generate JSON</button>
            <button className="btn-primary" disabled={busy} onClick={() => exportJson(tab === 'GSTR-3B' ? 'GSTR3B' : 'GSTR1')}>JSON Export</button>
          </div>
        </div>

        {msg && <p className="muted small" style={{ marginTop: 8 }}>{msg}</p>}

        {tab === 'GSTR-1' && (
          <>
            <div className="subtabs">
              {(['B2B', 'B2CL', 'B2CS', 'CDNR'] as SubTab[]).map((s) => (
                <button key={s} className={`subtab ${sub === s ? 'subtab--active' : ''}`} onClick={() => setSub(s)}>{s}</button>
              ))}
            </div>
            <table className="data-table compact">
              <thead><tr><th>GSTIN</th><th>Invoice</th><th>Date</th><th className="num">Value</th><th className="num">Rate</th><th className="num">Taxable</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr></thead>
              <tbody>
                {b2b.map((r) => (
                  <tr key={r.invoice}>
                    <td className="mono">{r.gstin}</td><td>{r.invoice}</td><td className="muted">{r.date}</td>
                    <td className="num">{inr(r.value)}</td><td className="num">{r.rate}%</td><td className="num">{inr(r.taxable)}</td>
                    <td className="num">{inr(r.igst)}</td><td className="num">{inr(r.cgst)}</td><td className="num">{inr(r.sgst)}</td>
                  </tr>
                ))}
                <tr className="row-total"><td colSpan={5}>Total</td><td className="num">{inr(156000)}</td><td className="num">{inr(10080)}</td><td className="num">{inr(9000)}</td><td className="num">{inr(9000)}</td></tr>
              </tbody>
            </table>
          </>
        )}

        {tab === 'GSTR-3B' && (
          <table className="data-table compact">
            <thead><tr><th>Nature of Supplies</th><th className="num">Taxable</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr></thead>
            <tbody>
              <tr><td>(a) Outward taxable supplies</td><td className="num">{inr(156000)}</td><td className="num">{inr(10080)}</td><td className="num">{inr(9000)}</td><td className="num">{inr(9000)}</td></tr>
              <tr><td>(d) Inward supplies (reverse charge)</td><td className="num">{inr(0)}</td><td className="num">{inr(0)}</td><td className="num">{inr(0)}</td><td className="num">{inr(0)}</td></tr>
              <tr className="row-total"><td>Net Tax Payable</td><td className="num">—</td><td className="num">{inr(10080)}</td><td className="num">{inr(9000)}</td><td className="num">{inr(9000)}</td></tr>
            </tbody>
          </table>
        )}

        {tab === 'GSTR-3B Reconciliation' && <div className="empty-state"><p className="muted">GSTR-2B vs purchase reconciliation — matched / mismatched / missing.</p></div>}
        {tab === 'TDS/TCS Report' && <div className="empty-state"><p className="muted">TDS (GSTR-7) and TCS (GSTR-8) deduction summary.</p></div>}
      </div>
    </section>
  );
}

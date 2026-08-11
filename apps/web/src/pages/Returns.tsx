import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/Toaster';

type MainTab = 'GSTR-1' | 'GSTR-3B' | 'GSTR-4' | 'GSTR-9' | 'GSTR-3B Reconciliation' | 'TDS/TCS Report';
type SubTab = 'B2B' | 'B2CL' | 'B2CS' | 'CDNR' | 'HSN';

// Composition (GSTR-4) uses quarters. Q1=Apr-Jun … Q4=Jan-Mar.
function recentQuarters(): string[] { const y = new Date().getFullYear(); return [`Q1-${y}`, `Q2-${y}`, `Q3-${y}`, `Q4-${y}`]; }

// Annual return (GSTR-9) uses financial years, e.g. "2026-27". FY starts in April.
function recentFYs(): string[] {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, 1, 2].map((i) => { const sy = startYear - i; return `${sy}-${String((sy + 1) % 100).padStart(2, '0')}`; });
}

interface GstReturn { id: string; returnType: string; period: string; version: number; status: string; jsonUrl?: string; summary?: any; validationErrors?: any; filedAt?: string; arn?: string; }
interface ComplianceRow { returnType: string; period: string; dueDate: string; status: string; overdueDays: number; lateFee: number; arn: string | null; }

const inr = (n: number) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN') : '—');

// Build the current + last two periods as MM-YYYY.
function recentPeriods(): string[] {
  const now = new Date(); const out: string[] = [];
  for (let i = 0; i < 4; i++) { const dt = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`); }
  return out;
}

export function Returns() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<MainTab>('GSTR-1');
  const [sub, setSub] = useState<SubTab>('B2B');
  const [period, setPeriod] = useState('06-2026');

  const { data: returns = [] } = useQuery({ queryKey: ['returns'], queryFn: async () => (await api.get<GstReturn[]>('/returns')).data });
  const { data: compliance = [] } = useQuery({ queryKey: ['compliance'], queryFn: async () => (await api.get<ComplianceRow[]>('/returns/compliance')).data });

  const isGstr4 = tab === 'GSTR-4';
  const isGstr9 = tab === 'GSTR-9';
  // Latest generated return for the current tab + period.
  const rtype = tab === 'GSTR-3B' ? 'GSTR3B' : tab === 'GSTR-4' ? 'GSTR4' : tab === 'GSTR-9' ? 'GSTR9' : 'GSTR1';
  const current = useMemo(() => returns.filter((r) => r.returnType === rtype && r.period === period).sort((a, b) => b.version - a.version)[0], [returns, rtype, period]);

  const generate = useMutation({
    mutationFn: async () => (await api.post('/returns/generate', { returnType: rtype, period })).data,
    onSuccess: (r: GstReturn) => { qc.invalidateQueries({ queryKey: ['returns'] }); toast(r.status === 'ERROR' ? `Generated with ${r.validationErrors?.length} validation issue(s)` : `${rtype} generated (v${r.version})`, r.status === 'ERROR' ? 'info' : 'success'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Generation failed', 'error'),
  });
  const markFiled = useMutation({
    mutationFn: async (id: string) => (await api.post(`/returns/${id}/file`, {})).data,
    onSuccess: (r: GstReturn) => { qc.invalidateQueries({ queryKey: ['returns'] }); qc.invalidateQueries({ queryKey: ['compliance'] }); toast(`Marked filed — ${r.arn}`); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed', 'error'),
  });

  async function downloadJson(id: string) {
    const res = await api.get(`/returns/${id}/json`, { responseType: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(res.data);
    a.download = `${rtype}_${period}.json`; a.click(); URL.revokeObjectURL(a.href);
  }

  const s = current?.summary ?? {};
  const netPayable = isGstr4 ? (s.taxPayable ?? 0)
    : isGstr9 ? (s.netPayable ?? 0)
    : tab === 'GSTR-3B' && s.netPayable ? (s.netPayable.iamt + s.netPayable.camt + s.netPayable.samt)
    : (s.igst + s.cgst + s.sgst) || 0;
  const taxableVal = s.taxable ?? s.outward?.txval ?? s.outwardTaxable ?? s.turnover;
  const totalTax = (s.igst ?? s.outward?.iamt ?? 0) + (s.cgst ?? s.outward?.camt ?? 0) + (s.sgst ?? s.outward?.samt ?? 0) || s.outwardTax || s.taxPayable || 0;

  return (
    <section className="page">
      <div className="page-head">
        <h2>GST Returns</h2>
        <div className="page-actions">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {(isGstr4 ? recentQuarters() : isGstr9 ? recentFYs() : recentPeriods()).map((p) => <option key={p} value={p}>{isGstr9 ? `FY ${p}` : p}</option>)}
          </select>
        </div>
      </div>

      <div className="stat-grid stat-grid--4">
        <div className="stat-card"><div className="stat-label">Taxable Value</div><div className="stat-value">{current && taxableVal != null ? inr(taxableVal) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Total Tax</div><div className="stat-value">{current ? inr(totalTax) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Net Payable</div><div className="stat-value">{current ? inr(netPayable) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Status</div><div className="stat-value" style={{ fontSize: 18 }}>{current ? current.status : 'Not generated'}</div></div>
      </div>

      <div className="card">
        <div className="tabs tabs--between">
          <div className="tabs-group">
            {(['GSTR-1', 'GSTR-3B', 'GSTR-4', 'GSTR-9', 'GSTR-3B Reconciliation', 'TDS/TCS Report'] as MainTab[]).map((t) => (
              <button key={t} className={`tab ${tab === t ? 'tab--active' : ''}`}
                onClick={() => {
                  setTab(t);
                  if (t === 'GSTR-4') setPeriod(recentQuarters()[0]);
                  else if (t === 'GSTR-9') setPeriod(recentFYs()[0]);
                  else if (/^Q[1-4]-/.test(period) || /^\d{4}-\d{2}$/.test(period)) setPeriod(recentPeriods()[1]);
                }}>{t}</button>
            ))}
          </div>
          <div className="tabs-actions">
            <button className="btn-ghost" disabled={generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? 'Generating…' : 'Generate'}</button>
            {current && <button className="btn-ghost" onClick={() => downloadJson(current.id)}>Download JSON</button>}
            {current && current.status !== 'FILED' && <button className="btn-primary" onClick={() => markFiled.mutate(current.id)}>Mark Filed</button>}
            {current?.status === 'FILED' && <span className="badge badge--finalized">Filed · {current.arn}</span>}
          </div>
        </div>

        {current?.status === 'ERROR' && (
          <div className="warn-item" style={{ marginBottom: 12 }}>
            {current.validationErrors?.length} validation issue(s): {current.validationErrors?.slice(0, 3).map((e: any) => e.message).join('; ')}
          </div>
        )}
        {!current && <p className="muted small">No {rtype} generated for {period}. Click <b>Generate</b>.</p>}

        {tab === 'GSTR-1' && current && (
          <Gstr1Sections id={current.id} sub={sub} setSub={setSub} />
        )}

        {tab === 'GSTR-3B' && current && (
          <table className="data-table compact">
            <thead><tr><th>Nature of Supplies</th><th className="num">Taxable</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr></thead>
            <tbody>
              <tr><td>3.1(a) Outward taxable supplies</td><td className="num">{inr(s.outward?.txval)}</td><td className="num">{inr(s.outward?.iamt)}</td><td className="num">{inr(s.outward?.camt)}</td><td className="num">{inr(s.outward?.samt)}</td></tr>
              <tr><td>4. ITC available (purchases)</td><td className="num">—</td><td className="num">{inr(s.itc?.iamt)}</td><td className="num">{inr(s.itc?.camt)}</td><td className="num">{inr(s.itc?.samt)}</td></tr>
              <tr className="row-total"><td>Net Tax Payable</td><td className="num">—</td><td className="num">{inr(s.netPayable?.iamt)}</td><td className="num">{inr(s.netPayable?.camt)}</td><td className="num">{inr(s.netPayable?.samt)}</td></tr>
            </tbody>
          </table>
        )}

        {tab === 'GSTR-4' && current && (
          <table className="data-table compact">
            <thead><tr><th>Composition Summary (Quarter {s.quarter})</th><th className="num">Value</th></tr></thead>
            <tbody>
              <tr><td>Outward turnover</td><td className="num">{inr(s.turnover)}</td></tr>
              <tr><td>Composition rate</td><td className="num">{s.rate}%</td></tr>
              <tr><td>Invoices</td><td className="num">{s.invoices}</td></tr>
              <tr className="row-total"><td>Composition tax payable</td><td className="num">{inr(s.taxPayable)}</td></tr>
            </tbody>
          </table>
        )}
        {tab === 'GSTR-4' && !current && <p className="muted small">Quarterly composition return. Select a quarter and <b>Generate</b>.</p>}

        {tab === 'GSTR-9' && current && (
          <table className="data-table compact">
            <thead><tr><th>Annual Return Summary — FY {s.fy}</th><th className="num">Value</th></tr></thead>
            <tbody>
              <tr><td>Pt II · Outward taxable — B2B</td><td className="num">{inr(s.b2bTaxable)}</td></tr>
              <tr><td>Pt II · Outward taxable — B2C</td><td className="num">{inr(s.b2cTaxable)}</td></tr>
              <tr><td>Pt II · Total tax on outward supplies</td><td className="num">{inr(s.outwardTax)}</td></tr>
              <tr><td>Pt III · ITC availed (eligible)</td><td className="num pos">{inr(s.itcEligible)}</td></tr>
              <tr><td>Pt III · ITC blocked — Sec 17(5)</td><td className="num neg">{inr(s.itcBlocked)}</td></tr>
              <tr><td>Outward invoices / inward bills</td><td className="num">{s.outwardInvoices ?? 0} / {s.inwardBills ?? 0}</td></tr>
              <tr className="row-total"><td>Pt IV · Net annual tax payable</td><td className="num">{inr(s.netPayable)}</td></tr>
            </tbody>
          </table>
        )}
        {tab === 'GSTR-9' && !current && <p className="muted small">Annual consolidated return. Select a financial year and <b>Generate</b>.</p>}

        {tab === 'GSTR-3B Reconciliation' && <div className="empty-state"><p className="muted">GSTR-2B vs purchase reconciliation — needs GSTN 2B download (credential-gated).</p></div>}
        {tab === 'TDS/TCS Report' && <div className="empty-state"><p className="muted">TDS (GSTR-7) and TCS (GSTR-8) — coming next.</p></div>}
      </div>

      {/* Compliance / filing status */}
      <div className="card">
        <h3 className="card-title">Filing Status &amp; Due Dates</h3>
        <table className="data-table">
          <thead><tr><th>Return</th><th>Period</th><th>Due Date</th><th>Status</th><th className="num">Overdue</th><th className="num">Late Fee (est.)</th><th>ARN</th></tr></thead>
          <tbody>
            {compliance.map((r, i) => (
              <tr key={i}>
                <td className="cell-strong">{r.returnType}</td>
                <td>{r.period}</td>
                <td className="muted">{d(r.dueDate)}</td>
                <td><span className={`badge badge--${r.status === 'FILED' ? 'finalized' : r.status === 'OVERDUE' ? 'overdue' : 'pending'}`}>{r.status}</span></td>
                <td className="num">{r.overdueDays ? `${r.overdueDays}d` : '—'}</td>
                <td className="num">{r.lateFee ? <span className="neg">{inr(r.lateFee)}</span> : '—'}</td>
                <td className="muted mono">{r.arn ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Renders GSTR-1 sections (B2B/B2CL/B2CS/CDNR/HSN) from the generated JSON. */
function Gstr1Sections({ id, sub, setSub }: { id: string; sub: SubTab; setSub: (s: SubTab) => void }) {
  const { data } = useQuery({ queryKey: ['return-json', id], queryFn: async () => JSON.parse((await api.get(`/returns/${id}/json`, { responseType: 'text' })).data) });
  const j = data ?? {};

  return (
    <>
      <div className="subtabs">
        {(['B2B', 'B2CL', 'B2CS', 'CDNR', 'HSN'] as SubTab[]).map((sName) => (
          <button key={sName} className={`subtab ${sub === sName ? 'subtab--active' : ''}`} onClick={() => setSub(sName)}>{sName}</button>
        ))}
      </div>

      {sub === 'B2B' && (
        <table className="data-table compact">
          <thead><tr><th>GSTIN</th><th>Invoice</th><th>Date</th><th className="num">Value</th><th>POS</th><th className="num">Rate</th><th className="num">Taxable</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr></thead>
          <tbody>
            {(j.b2b ?? []).flatMap((p: any) => p.inv.map((inv: any) => ({ ctin: p.ctin, ...inv }))).map((inv: any, i: number) => {
              const it = inv.itms?.[0]?.itm_det ?? {};
              return <tr key={i}>
                <td className="mono">{inv.ctin}</td><td>{inv.inum}</td><td className="muted">{inv.idt}</td>
                <td className="num">{inr(inv.val)}</td><td>{inv.pos}</td><td className="num">{it.rt}%</td>
                <td className="num">{inr(it.txval)}</td><td className="num">{inr(it.iamt)}</td><td className="num">{inr(it.camt)}</td><td className="num">{inr(it.samt)}</td>
              </tr>;
            })}
            {(!j.b2b || j.b2b.length === 0) && <tr><td colSpan={10} className="muted">No B2B invoices.</td></tr>}
          </tbody>
        </table>
      )}

      {sub === 'B2CS' && (
        <table className="data-table compact">
          <thead><tr><th>Type</th><th>POS</th><th className="num">Rate</th><th className="num">Taxable</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr></thead>
          <tbody>
            {(j.b2cs ?? []).map((r: any, i: number) => <tr key={i}><td>{r.sply_ty}</td><td>{r.pos}</td><td className="num">{r.rt}%</td><td className="num">{inr(r.txval)}</td><td className="num">{inr(r.iamt)}</td><td className="num">{inr(r.camt)}</td><td className="num">{inr(r.samt)}</td></tr>)}
            {(!j.b2cs || j.b2cs.length === 0) && <tr><td colSpan={7} className="muted">No B2C (small) supplies.</td></tr>}
          </tbody>
        </table>
      )}

      {sub === 'B2CL' && (
        <table className="data-table compact">
          <thead><tr><th>POS</th><th>Invoice</th><th>Date</th><th className="num">Value</th></tr></thead>
          <tbody>
            {(j.b2cl ?? []).flatMap((p: any) => p.inv.map((inv: any) => ({ pos: p.pos, ...inv }))).map((inv: any, i: number) => <tr key={i}><td>{inv.pos}</td><td>{inv.inum}</td><td className="muted">{inv.idt}</td><td className="num">{inr(inv.val)}</td></tr>)}
            {(!j.b2cl || j.b2cl.length === 0) && <tr><td colSpan={4} className="muted">No B2C (large, inter-state &gt; ₹2.5L) invoices.</td></tr>}
          </tbody>
        </table>
      )}

      {sub === 'CDNR' && (
        <table className="data-table compact">
          <thead><tr><th>GSTIN</th><th>Note No.</th><th>Date</th><th className="num">Value</th></tr></thead>
          <tbody>
            {(j.cdnr ?? []).flatMap((p: any) => p.nt.map((n: any) => ({ ctin: p.ctin, ...n }))).map((n: any, i: number) => <tr key={i}><td className="mono">{n.ctin}</td><td>{n.nt_num}</td><td className="muted">{n.nt_dt}</td><td className="num">{inr(n.val)}</td></tr>)}
            {(!j.cdnr || j.cdnr.length === 0) && <tr><td colSpan={4} className="muted">No credit/debit notes.</td></tr>}
          </tbody>
        </table>
      )}

      {sub === 'HSN' && (
        <table className="data-table compact">
          <thead><tr><th>HSN/SAC</th><th>UQC</th><th className="num">Qty</th><th className="num">Taxable</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr></thead>
          <tbody>
            {(j.hsn?.data ?? []).map((h: any, i: number) => <tr key={i}><td className="mono">{h.hsn_sc}</td><td>{h.uqc}</td><td className="num">{h.qty}</td><td className="num">{inr(h.txval)}</td><td className="num">{inr(h.iamt)}</td><td className="num">{inr(h.camt)}</td><td className="num">{inr(h.samt)}</td></tr>)}
            {(!j.hsn?.data || j.hsn.data.length === 0) && <tr><td colSpan={7} className="muted">No HSN data.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/Toaster';

interface Pnl { totalRevenue: number; gstCollected: number; netRevenue: number; totalExpenses: number; itc: number; netExpenses: number; netProfit: number; gstPayable: number; }
interface Receivable { date: string; invoice: string; client: string; amount: number; paid: number; outstanding: number; }
interface SummaryRow { period: string; count: number; taxable: number; tax: number; total: number; }
interface PartyRow { party: string; gstin: string | null; bills: number; taxable: number; total: number; }
interface Tax { cgst: number; sgst: number; igst: number; cess: number; }
interface TaxSummary { output: Tax; input: Tax; net: Tax; }
interface VendorRow { vendor: string; gstin: string | null; bills: number; ytdPurchases: number; last30: number; avgInvoice: number; outstanding: number; itc: number; score: number; }

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (s: string) => new Date(s).toLocaleDateString('en-IN');

export function Reports() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [partyType, setPartyType] = useState<'CUSTOMER' | 'VENDOR'>('CUSTOMER');

  const { data: pnl } = useQuery({ queryKey: ['pnl'], queryFn: async () => (await api.get<Pnl>('/reports/pnl')).data });
  const { data: recv = [] } = useQuery({ queryKey: ['receivables'], queryFn: async () => (await api.get<Receivable[]>('/reports/receivables')).data });
  const { data: summary = [] } = useQuery({ queryKey: ['rsummary', period], queryFn: async () => (await api.get<SummaryRow[]>(`/reports/summary?period=${period}`)).data });
  const { data: byParty = [] } = useQuery({ queryKey: ['byparty', partyType], queryFn: async () => (await api.get<PartyRow[]>(`/reports/by-party?type=${partyType}`)).data });
  const { data: tax } = useQuery({ queryKey: ['taxsummary'], queryFn: async () => (await api.get<TaxSummary>('/reports/tax-summary')).data });
  const { data: vendorRows = [] } = useQuery({ queryKey: ['vendor-analytics'], queryFn: async () => (await api.get<VendorRow[]>('/reports/vendor-analytics')).data });

  const rows = pnl ? [
    { label: 'Total Revenue', value: pnl.totalRevenue },
    { label: 'Less: GST Collected', value: pnl.gstCollected, sub: true },
    { label: 'Net Revenue', value: pnl.netRevenue, strong: true },
    { label: 'Total Expenses', value: pnl.totalExpenses },
    { label: 'Less: GST on Expenses (ITC)', value: pnl.itc, sub: true },
    { label: 'Net Expenses', value: pnl.netExpenses, strong: true },
    { label: 'Net Profit', value: pnl.netProfit, profit: true },
  ] : [];

  return (
    <section className="page">
      <div className="page-head"><h2>Reports</h2></div>

      <ReportCentre />

      {/* Tax summary */}
      <div className="card">
        <h3 className="card-title">Tax Summary (CGST / SGST / IGST)</h3>
        <table className="data-table">
          <thead><tr><th></th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">CESS</th></tr></thead>
          <tbody>
            <tr><td>Output (sales)</td><td className="num">{inr(tax?.output.cgst ?? 0)}</td><td className="num">{inr(tax?.output.sgst ?? 0)}</td><td className="num">{inr(tax?.output.igst ?? 0)}</td><td className="num">{inr(tax?.output.cess ?? 0)}</td></tr>
            <tr><td>Input / ITC (purchases)</td><td className="num">{inr(tax?.input.cgst ?? 0)}</td><td className="num">{inr(tax?.input.sgst ?? 0)}</td><td className="num">{inr(tax?.input.igst ?? 0)}</td><td className="num">{inr(tax?.input.cess ?? 0)}</td></tr>
            <tr className="row-total"><td>Net Payable</td><td className="num">{inr(tax?.net.cgst ?? 0)}</td><td className="num">{inr(tax?.net.sgst ?? 0)}</td><td className="num">{inr(tax?.net.igst ?? 0)}</td><td className="num">{inr(tax?.net.cess ?? 0)}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Bill summary by period */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Bill Summary</h3>
          <div className="tabs-group">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button key={p} className={`subtab ${period === p ? 'subtab--active' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>Period</th><th className="num">Bills</th><th className="num">Taxable</th><th className="num">Tax</th><th className="num">Total</th></tr></thead>
          <tbody>
            {summary.length === 0 && <tr><td colSpan={5} className="muted">No data.</td></tr>}
            {summary.map((r) => (
              <tr key={r.period}><td>{r.period}</td><td className="num">{r.count}</td><td className="num">{inr(r.taxable)}</td><td className="num">{inr(r.tax)}</td><td className="num">{inr(r.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Party-wise summary */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">{partyType === 'CUSTOMER' ? 'Customer-wise' : 'Vendor-wise'} Summary</h3>
          <div className="tabs-group">
            <button className={`subtab ${partyType === 'CUSTOMER' ? 'subtab--active' : ''}`} onClick={() => setPartyType('CUSTOMER')}>Customers</button>
            <button className={`subtab ${partyType === 'VENDOR' ? 'subtab--active' : ''}`} onClick={() => setPartyType('VENDOR')}>Vendors</button>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>{partyType === 'CUSTOMER' ? 'Customer' : 'Vendor'}</th><th>GSTIN</th><th className="num">Bills</th><th className="num">Taxable</th><th className="num">Total</th></tr></thead>
          <tbody>
            {byParty.length === 0 && <tr><td colSpan={5} className="muted">No data.</td></tr>}
            {byParty.map((r) => (
              <tr key={r.party}><td>{r.party}</td><td className="muted mono">{r.gstin ?? '—'}</td><td className="num">{r.bills}</td><td className="num">{inr(r.taxable)}</td><td className="num">{inr(r.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vendor analytics */}
      <div className="card">
        <h3 className="card-title">Vendor Analytics</h3>
        <table className="data-table">
          <thead><tr><th>Vendor</th><th className="num">Bills</th><th className="num">YTD Purchases</th><th className="num">Last 30d</th><th className="num">Avg Invoice</th><th className="num">Outstanding</th><th className="num">ITC</th><th className="num">Score</th></tr></thead>
          <tbody>
            {vendorRows.length === 0 && <tr><td colSpan={8} className="muted">No vendors yet.</td></tr>}
            {vendorRows.map((v) => (
              <tr key={v.vendor}>
                <td className="cell-strong">{v.vendor}</td>
                <td className="num">{v.bills}</td>
                <td className="num">{inr(v.ytdPurchases)}</td>
                <td className="num">{inr(v.last30)}</td>
                <td className="num">{inr(v.avgInvoice)}</td>
                <td className="num">{v.outstanding ? <span className="neg">{inr(v.outstanding)}</span> : '—'}</td>
                <td className="num pos">{inr(v.itc)}</td>
                <td className="num"><span className={`badge badge--${v.score >= 70 ? 'finalized' : v.score >= 40 ? 'pending' : 'overdue'}`}>{v.score}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* P&L */}
      <div className="card">
        <h3 className="card-title">Profit &amp; Loss Statement</h3>
        <div className="pnl">
          {rows.map((r) => (
            <div key={r.label} className={`pnl-row ${r.strong ? 'pnl-strong' : ''} ${r.profit ? 'pnl-profit' : ''}`}>
              <span className={r.sub ? 'muted' : ''}>{r.label}</span><span>{inr(r.value)}</span>
            </div>
          ))}
          {!pnl && <p className="muted">Loading…</p>}
        </div>
      </div>

      {/* Receivables */}
      <div className="card">
        <h3 className="card-title">Outstanding Receivables</h3>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Invoice No.</th><th>Client</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead>
          <tbody>
            {recv.length === 0 && <tr><td colSpan={6} className="muted">No receivables.</td></tr>}
            {recv.map((r) => (
              <tr key={r.invoice}>
                <td className="muted">{d(r.date)}</td><td>{r.invoice}</td><td>{r.client}</td>
                <td className="num">{inr(r.amount)}</td><td className="num pos">{inr(r.paid)}</td>
                <td className="num"><span className={r.outstanding ? 'neg' : 'muted'}>{inr(r.outstanding)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface CatalogItem { id: string; name: string; group: string; status: 'ready' | 'soon' | 'in-returns'; needs?: string; param?: 'party'; }
interface PartyLite { id: string; name: string; type: string; }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); };

/** Report Centre — audit/record report catalogue with PDF / CSV export (premium). */
function ReportCentre() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [partyId, setPartyId] = useState('');
  const [busy, setBusy] = useState('');

  const { data: catalog = [] } = useQuery({ queryKey: ['report-catalog'], queryFn: async () => (await api.get<CatalogItem[]>('/reports/catalog')).data });
  const { data: parties = [] } = useQuery({ queryKey: ['parties-lite'], queryFn: async () => (await api.get<PartyLite[]>('/parties')).data });

  const groups = useMemo(() => {
    const g: Record<string, CatalogItem[]> = {};
    for (const r of catalog) (g[r.group] ??= []).push(r);
    return Object.entries(g);
  }, [catalog]);

  async function download(r: CatalogItem, format: 'pdf' | 'csv') {
    if (r.param === 'party' && !partyId) { toast('Choose a party first for this report.', 'error'); return; }
    setBusy(`${r.id}:${format}`);
    try {
      const q = new URLSearchParams({ from, to, format });
      if (r.param === 'party') q.set('partyId', partyId);
      const res = await api.get(`/reports/export/${r.id}?${q.toString()}`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.data);
      a.download = `${r.name.replace(/[^\w]+/g, '_')}_${from}_${to}.${format}`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) {
      let msg = 'Export failed';
      try { msg = JSON.parse(await e?.response?.data?.text?.())?.message ?? msg; } catch { /* keep default */ }
      toast(msg, 'error');
    } finally { setBusy(''); }
  }

  const badge = (s: CatalogItem['status']) =>
    s === 'ready' ? <span className="badge badge--finalized">Ready</span>
      : s === 'in-returns' ? <span className="badge badge--pending">In GST Returns</span>
      : <span className="badge badge--overdue">Premium · soon</span>;

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Report Centre</h3>
        <span className="badge badge--pending">Premium</span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Export audit &amp; record reports as PDF or Excel (CSV). Ready reports export live data for the selected period;
        reports marked <b>Premium · soon</b> unlock as stock, accounting and bank modules are configured.
      </p>

      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <label className="inline-field">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline-field">To<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="inline-field">Party (for statement)
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">— select —</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type === 'VENDOR' ? 'Vendor' : 'Customer'})</option>)}
          </select>
        </label>
      </div>

      {groups.map(([group, items]) => (
        <div key={group} style={{ marginTop: 18 }}>
          <h4 className="section-label" style={{ margin: '0 0 8px' }}>{group}</h4>
          <table className="data-table compact">
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="cell-strong" style={{ width: '42%' }}>{r.name}</td>
                  <td>{badge(r.status)}{r.status === 'soon' && r.needs && <span className="muted small" style={{ marginLeft: 8 }}>needs {r.needs}</span>}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {r.status === 'ready' ? <>
                      <button className="link-btn" disabled={!!busy} onClick={() => download(r, 'pdf')}>{busy === `${r.id}:pdf` ? '…' : 'PDF'}</button>
                      <button className="link-btn" disabled={!!busy} onClick={() => download(r, 'csv')}>{busy === `${r.id}:csv` ? '…' : 'Excel (CSV)'}</button>
                    </> : r.status === 'in-returns'
                      ? <span className="muted small">Open GST Returns</span>
                      : <span className="muted small">Configuring</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

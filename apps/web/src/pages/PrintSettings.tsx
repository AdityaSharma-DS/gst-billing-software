import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/Toaster';
import {
  PrintSettings as PS, loadPrintSettings, savePrintSettings, DEFAULT_PRINT_SETTINGS,
  COLOR_SWATCHES, THEMES, THERMAL_THEMES, TEXT_SIZES, ITEM_COLS, ItemColKey,
} from '../lib/printSettings';
import { renderInvoiceHtml, InvCompany, InvData } from '../lib/invoiceRender';
import { ACCENTS, getAccent } from '../lib/theme';

/** Sample bill for the live preview (company comes from the org profile). */
const SAMPLE: InvData = {
  title: 'Tax Invoice', number: 'INV-00042', date: new Date().toLocaleDateString('en-IN'),
  dueDate: new Date(Date.now() + 15 * 86400000).toLocaleDateString('en-IN'), placeOfSupply: '29-Karnataka',
  billTo: { name: 'Classic Enterprises', gstin: '29AAAAA0000A1Z5', state: '29-Karnataka', address: 'Plot 1, Shop 8, Koramangala, Bengaluru 560034', phone: '8888888888' },
  items: [
    { name: 'Cotton Shirt', hsn: '6205', qty: 10, unit: 'Pcs', price: 500, discountPct: 10, gstPct: 5 },
    { name: 'Repair Service', hsn: '998719', qty: 1, unit: '-', price: 1000, discountPct: 0, gstPct: 18 },
  ],
  received: 3000, description: 'Sample sale for preview',
};

function orgToCompany(o: any): InvCompany {
  const addr = [o?.addressLine1, o?.addressLine2, o?.city, o?.pincode].filter(Boolean).join(', ');
  return {
    name: o?.tradeName || o?.legalName || 'Your Company', address: addr, email: o?.email, phone: o?.phone,
    gstin: o?.gstin, stateCode: o?.stateCode, state: o?.state, logoUrl: o?.logoUrl,
    bankName: o?.bankName, bankAccountNumber: o?.bankAccountNumber, bankIfsc: o?.bankIfsc, upiId: o?.upiId,
  };
}

function Info({ text }: { text: string }) {
  return <span className="info-i" title={text} aria-label={text}>i</span>;
}

export function PrintSettings() {
  const [ps, setPs] = useState<PS>(() => loadPrintSettings());
  const [tab, setTab] = useState<'regular' | 'thermal'>('regular');
  const [layoutTab, setLayoutTab] = useState<'layout' | 'colors'>('layout');
  const [savedFlash, setSavedFlash] = useState(false);
  const first = useRef(true);

  const { data: org } = useQuery({ queryKey: ['organization'], queryFn: async () => (await api.get('/organization')).data });
  const company = useMemo(() => orgToCompany(org ?? {}), [org]);

  // Autosave (debounced) with a "Saved" flash.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => { savePrintSettings(ps); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200); }, 400);
    return () => clearTimeout(t);
  }, [ps]);

  const html = useMemo(() => renderInvoiceHtml(company, SAMPLE, ps, tab), [company, ps, tab]);

  const R = ps.regular; const T = ps.thermal;
  const setR = (patch: Partial<PS['regular']>) => setPs((p) => ({ ...p, regular: { ...p.regular, ...patch } }));
  const setT = (patch: Partial<PS['thermal']>) => setPs((p) => ({ ...p, thermal: { ...p.thermal, ...patch } }));

  function printDoc() {
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) { toast('Allow pop-ups to print/download', 'error'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  }

  return (
    <div className="print-settings">
      <div className="ps-head">
        <div className="tabs-group">
          <button className={`tab ${tab === 'regular' ? 'tab--active' : ''}`} onClick={() => setTab('regular')}>Regular Printer</button>
          <button className={`tab ${tab === 'thermal' ? 'tab--active' : ''}`} onClick={() => setTab('thermal')}>Thermal Printer</button>
        </div>
        <div className="ps-actions">
          {savedFlash && <span className="pos small">✓ Saved</span>}
          <button className="btn-ghost" onClick={() => { if (confirm('Reset print settings to defaults?')) setPs(DEFAULT_PRINT_SETTINGS); }}>Reset</button>
          <button className="btn-ghost" onClick={printDoc}>Print</button>
          <button className="btn-primary" onClick={printDoc}>Download PDF</button>
        </div>
      </div>

      <div className="ps-body">
        <div className="ps-settings">
          {tab === 'regular' ? (
            <RegularPanel R={R} setR={setR} layoutTab={layoutTab} setLayoutTab={setLayoutTab} />
          ) : (
            <ThermalPanel T={T} setT={setT} />
          )}
        </div>

        <div className="ps-preview">
          <div className="ps-preview-head">Live Preview {tab === 'thermal' && <span className="muted small">(thermal receipt)</span>}</div>
          <div className={`ps-frame ${tab}`}>
            <iframe title="invoice preview" srcDoc={html} />
          </div>
          {tab === 'thermal' && <p className="muted small">Thermal layouts print only to a receipt printer; Download PDF uses the selected Regular theme.</p>}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, info }: { label: string; checked: boolean; onChange: (v: boolean) => void; info?: string }) {
  return (
    <label className="ps-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>{info && <Info text={info} />}
    </label>
  );
}

function RegularPanel({ R, setR, layoutTab, setLayoutTab }: { R: PS['regular']; setR: (p: Partial<PS['regular']>) => void; layoutTab: 'layout' | 'colors'; setLayoutTab: (t: 'layout' | 'colors') => void }) {
  const setCol = (k: ItemColKey, v: boolean) => setR({ itemTable: { ...R.itemTable, columns: { ...R.itemTable.columns, [k]: v } } });
  const currentAccentHex = ACCENTS.find((a) => a.id === getAccent())?.swatch ?? ACCENTS[0].swatch;
  return (
    <>
      <div className="subtabs">
        <button className={`subtab ${layoutTab === 'layout' ? 'subtab--active' : ''}`} onClick={() => setLayoutTab('layout')}>Change Layout</button>
        <button className={`subtab ${layoutTab === 'colors' ? 'subtab--active' : ''}`} onClick={() => setLayoutTab('colors')}>Change Colors</button>
      </div>

      {layoutTab === 'layout' ? (
        <div className="theme-carousel">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme-card ${R.themeId === t.id ? 'theme-card--active' : ''} ${!t.ready ? 'theme-card--locked' : ''}`}
              onClick={() => t.ready ? setR({ themeId: t.id }) : toast(`${t.name} is a premium theme — coming soon`, 'info')}>
              <div className="theme-thumb" style={{ borderTopColor: R.colorHex }}><span>{t.name.split(' ')[0]}</span></div>
              <div className="theme-name">{t.name}{t.premium && <span className="lock">🔒</span>}</div>
              <div className="muted small">{t.group}</div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="ps-color-head">
            <span className="section-label" style={{ margin: 0 }}>App theme colours</span>
            <button type="button" className="link-btn" onClick={() => setR({ colorHex: currentAccentHex })}>Use current theme colour</button>
          </div>
          <div className="color-grid theme-accents">
            {ACCENTS.map((a) => (
              <button key={a.id} title={`${a.label}${a.swatch === currentAccentHex ? ' (current app theme)' : ''}`} aria-label={a.label}
                className={`swatch ${R.colorHex === a.swatch ? 'swatch--active' : ''}`}
                style={{ background: a.swatch }} onClick={() => setR({ colorHex: a.swatch })}>
                {a.swatch === currentAccentHex && <span className="swatch-current">Current</span>}
              </button>
            ))}
          </div>
          <div className="section-label" style={{ marginTop: 12 }}>More colours</div>
          <div className="color-grid">
            {COLOR_SWATCHES.map((c) => (
              <button key={c.hex} title={c.name} aria-label={c.name}
                className={`swatch ${R.colorHex === c.hex ? 'swatch--active' : ''}`}
                style={{ background: c.hex }} onClick={() => setR({ colorHex: c.hex })} />
            ))}
          </div>
        </>
      )}

      <h4 className="section-label">Company Info / Header</h4>
      <Toggle label="Make Regular Printer default" checked={R.makeDefault} onChange={(v) => setR({ makeDefault: v })} info="Use the A4/A5 printer as the default for sharing and printing." />
      <Toggle label="Repeat header on all pages" checked={R.repeatHeader} onChange={(v) => setR({ repeatHeader: v })} info="Print the company header at the top of every page of a multi-page invoice." />
      <Toggle label="Company Name" checked={R.header.companyName} onChange={(v) => setR({ header: { ...R.header, companyName: v } })} info="Show your business name in the header." />
      <Toggle label="Company Logo" checked={R.header.logo} onChange={(v) => setR({ header: { ...R.header, logo: v } })} info="Show the logo from Settings → Company Branding." />
      <Toggle label="Address" checked={R.header.address} onChange={(v) => setR({ header: { ...R.header, address: v } })} />
      <Toggle label="Email" checked={R.header.email} onChange={(v) => setR({ header: { ...R.header, email: v } })} />
      <Toggle label="Phone Number" checked={R.header.phone} onChange={(v) => setR({ header: { ...R.header, phone: v } })} />
      <Toggle label="GSTIN on Sale" checked={R.header.gstin} onChange={(v) => setR({ header: { ...R.header, gstin: v } })} />
      <div className="form-grid form-grid--2" style={{ marginTop: 8 }}>
        <label>Paper Size<select value={R.paperSize} onChange={(e) => setR({ paperSize: e.target.value as any })}><option>A4</option><option>A5</option></select></label>
        <label>Orientation<select value={R.orientation} onChange={(e) => setR({ orientation: e.target.value as any })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        <label>Company Name Size<select value={R.companyNameSize} onChange={(e) => setR({ companyNameSize: e.target.value as any })}>{TEXT_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label>Invoice Text Size<select value={R.invoiceTextSize} onChange={(e) => setR({ invoiceTextSize: e.target.value as any })}>{TEXT_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label>Extra space on top (lines)<input type="number" min={0} max={20} value={R.extraTopSpace} onChange={(e) => setR({ extraTopSpace: Math.max(0, Math.min(20, +e.target.value)) })} /></label>
      </div>
      <Toggle label="Print Original / Duplicate copies" checked={R.originalDuplicate} onChange={(v) => setR({ originalDuplicate: v })} info="Add 'Original for Recipient / Duplicate for Transporter / Triplicate for Supplier' copies." />

      <h4 className="section-label">Item Table</h4>
      <Toggle label="Expand table to fill the page" checked={R.itemTable.expandFullPage} onChange={(v) => setR({ itemTable: { ...R.itemTable, expandFullPage: v } })} />
      <label className="ps-inline">Minimum rows<input type="number" min={0} value={R.itemTable.minRows} onChange={(e) => setR({ itemTable: { ...R.itemTable, minRows: Math.max(0, +e.target.value) } })} /></label>
      <div className="col-grid">
        {ITEM_COLS.map((c) => (
          <label key={c.key} className={`ps-row ${c.locked ? 'ps-row--locked' : ''}`}>
            <input type="checkbox" checked={R.itemTable.columns[c.key]} disabled={c.locked} onChange={(e) => setCol(c.key, e.target.checked)} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>

      <h4 className="section-label">Totals &amp; Taxes</h4>
      <Toggle label="Total item quantity" checked={R.totals.totalQty} onChange={(v) => setR({ totals: { ...R.totals, totalQty: v } })} />
      <Toggle label="Amounts with decimal (0.00)" checked={R.totals.decimals} onChange={(v) => setR({ totals: { ...R.totals, decimals: v } })} />
      <Toggle label="Received amount" checked={R.totals.received} onChange={(v) => setR({ totals: { ...R.totals, received: v } })} />
      <Toggle label="Balance amount" checked={R.totals.balance} onChange={(v) => setR({ totals: { ...R.totals, balance: v } })} />
      <Toggle label="Current balance of party" checked={R.totals.partyBalance} onChange={(v) => setR({ totals: { ...R.totals, partyBalance: v } })} />
      <Toggle label="Tax details (HSN-wise summary)" checked={R.totals.taxDetails} onChange={(v) => setR({ totals: { ...R.totals, taxDetails: v } })} info="Print the HSN/SAC-wise CGST/SGST/IGST breakup." />
      <Toggle label="You Saved (total discount)" checked={R.totals.youSaved} onChange={(v) => setR({ totals: { ...R.totals, youSaved: v } })} />
      <Toggle label="Amount grouping (1,00,000.00)" checked={R.totals.grouping} onChange={(v) => setR({ totals: { ...R.totals, grouping: v } })} />
      <label className="ps-inline">Amount in words<select value={R.totals.amountWords} onChange={(e) => setR({ totals: { ...R.totals, amountWords: e.target.value as any } })}><option value="indian">Indian (Lakh/Crore)</option><option value="international">International (Million)</option></select></label>

      <h4 className="section-label">Footer</h4>
      <Toggle label="Print description" checked={R.footer.description} onChange={(v) => setR({ footer: { ...R.footer, description: v } })} />
      <Toggle label="Print Terms &amp; Conditions" checked={R.footer.terms} onChange={(v) => setR({ footer: { ...R.footer, terms: v } })} />
      {R.footer.terms && <input className="ps-text" value={R.footer.termsText} onChange={(e) => setR({ footer: { ...R.footer, termsText: e.target.value } })} placeholder="Terms & Conditions" />}
      <Toggle label="Received by (signature line)" checked={R.footer.receivedBy} onChange={(v) => setR({ footer: { ...R.footer, receivedBy: v } })} />
      <Toggle label="Delivered by (signature line)" checked={R.footer.deliveredBy} onChange={(v) => setR({ footer: { ...R.footer, deliveredBy: v } })} />
      <Toggle label="Signature" checked={R.footer.signature} onChange={(v) => setR({ footer: { ...R.footer, signature: v } })} />
      {R.footer.signature && <input className="ps-text" value={R.footer.signatureLabel} onChange={(e) => setR({ footer: { ...R.footer, signatureLabel: e.target.value } })} placeholder="Signature label" />}
      <Toggle label="Bank details" checked={R.footer.bankDetails} onChange={(v) => setR({ footer: { ...R.footer, bankDetails: v } })} info="Print bank name, account, IFSC and UPI from Settings → Bank Details." />
      <Toggle label="Payment mode" checked={R.footer.paymentMode} onChange={(v) => setR({ footer: { ...R.footer, paymentMode: v } })} />
      <Toggle label="Print acknowledgement slip" checked={R.footer.acknowledgement} onChange={(v) => setR({ footer: { ...R.footer, acknowledgement: v } })} />
    </>
  );
}

function ThermalPanel({ T, setT }: { T: PS['thermal']; setT: (p: Partial<PS['thermal']>) => void }) {
  return (
    <>
      <h4 className="section-label">Layout</h4>
      <div className="theme-carousel">
        {THERMAL_THEMES.map((t) => (
          <button key={t.id} className={`theme-card ${T.themeId === t.id ? 'theme-card--active' : ''} ${!t.ready ? 'theme-card--locked' : ''}`}
            onClick={() => t.ready ? setT({ themeId: t.id }) : toast(`${t.name} — coming soon`, 'info')}>
            <div className="theme-thumb thermal"><span>{t.name}</span></div>
          </button>
        ))}
      </div>

      <h4 className="section-label">Printer</h4>
      <Toggle label="Make Thermal Printer default" checked={T.makeDefault} onChange={(v) => setT({ makeDefault: v })} />
      <label className="ps-inline">Page size
        <select value={T.pageWidth} onChange={(e) => setT({ pageWidth: +e.target.value as any })}>
          <option value={58}>2 inch (58mm)</option><option value={80}>3 inch (80mm)</option><option value={112}>4 inch (112mm)</option>
        </select>
      </label>
      <label className="ps-inline">Printing type
        <select value={T.printingType} onChange={(e) => setT({ printingType: e.target.value as any })}><option value="text">Text Printing</option><option value="graphic">Graphic Printing</option></select>
      </label>
      <Toggle label="Use text styling (bold)" checked={T.bold} onChange={(v) => setT({ bold: v })} />
      <Toggle label="Auto cut paper after printing" checked={T.autoCut} onChange={(v) => setT({ autoCut: v })} info="Sends the ESC/POS cut command to supported printers." />
      <Toggle label="Open cash drawer after printing" checked={T.openDrawer} onChange={(v) => setT({ openDrawer: v })} />
      <div className="form-grid form-grid--2" style={{ marginTop: 8 }}>
        <label>Extra lines at end<input type="number" min={0} value={T.extraLines} onChange={(e) => setT({ extraLines: Math.max(0, +e.target.value) })} /></label>
        <label>Number of copies<input type="number" min={1} value={T.copies} onChange={(e) => setT({ copies: Math.max(1, +e.target.value) })} /></label>
      </div>

      <h4 className="section-label">Header</h4>
      <Toggle label="Company Name" checked={T.header.companyName} onChange={(v) => setT({ header: { ...T.header, companyName: v } })} />
      <Toggle label="Address" checked={T.header.address} onChange={(v) => setT({ header: { ...T.header, address: v } })} />
      <Toggle label="Phone Number" checked={T.header.phone} onChange={(v) => setT({ header: { ...T.header, phone: v } })} />
      <Toggle label="GSTIN on Sale" checked={T.header.gstin} onChange={(v) => setT({ header: { ...T.header, gstin: v } })} />

      <h4 className="section-label">Totals &amp; Footer</h4>
      <Toggle label="Received &amp; balance" checked={T.totals.received} onChange={(v) => setT({ totals: { ...T.totals, received: v, balance: v } })} />
      <Toggle label="Tax details" checked={T.totals.taxDetails} onChange={(v) => setT({ totals: { ...T.totals, taxDetails: v } })} />
      <Toggle label="You Saved" checked={T.totals.youSaved} onChange={(v) => setT({ totals: { ...T.totals, youSaved: v } })} />
      <Toggle label="Print Terms &amp; Conditions" checked={T.footer.terms} onChange={(v) => setT({ footer: { ...T.footer, terms: v } })} />
      {T.footer.terms && <input className="ps-text" value={T.footer.termsText} onChange={(e) => setT({ footer: { ...T.footer, termsText: e.target.value } })} />}
      <p className="muted small" style={{ marginTop: 12 }}>Hardware output (USB / Bluetooth / Network ESC/POS, cash-drawer, auto-cut) connects when a supported printer is configured — coming in the printer-setup step.</p>
    </>
  );
}

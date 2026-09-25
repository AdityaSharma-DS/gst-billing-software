import { ReactNode } from 'react';

/** Split-screen auth shell: brand/value panel on the left, form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <div className="auth-aside-inner">
          <div className="auth-brand">
            <svg width="28" height="32" viewBox="0 0 30 34" aria-hidden>
              <path d="M15 1C7.8 1 2 6.6 2 13.5 2 22 15 33 15 33s13-11 13-19.5C28 6.6 22.2 1 15 1z" fill="#fff" />
              <circle cx="15" cy="13" r="5.2" fill="var(--color-primary)" />
              <path d="M12.6 13.2l1.7 1.7 3.2-3.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>DONICY</span>
          </div>
          <h2 className="auth-tagline">GST billing &amp; compliance, on autopilot.</h2>
          <p className="auth-sub">Invoice, file returns, and stay compliant — all from one clean dashboard built for Indian businesses.</p>
          <ul className="auth-feats">
            <li>File GSTR-1 &amp; GSTR-3B directly with OTP</li>
            <li>e-Invoice IRN &amp; e-Way Bill through the GSP</li>
            <li>GST reconciliation &amp; audit-ready reports</li>
            <li>Share invoices on WhatsApp &amp; email with PDF</li>
          </ul>
          <p className="auth-aside-foot">No card required · 14-day free trial</p>
        </div>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}

/* DONICY logo — orange location-pin mark + wordmark. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden>
        <path
          d="M15 1C7.8 1 2 6.6 2 13.5 2 22 15 33 15 33s13-11 13-19.5C28 6.6 22.2 1 15 1z"
          fill="var(--color-primary)"
        />
        <circle cx="15" cy="13" r="5.2" fill="#fff" />
        <path d="M12.6 13.2l1.7 1.7 3.2-3.5" stroke="var(--color-primary)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="logo-word">DONICY</span>}
    </div>
  );
}

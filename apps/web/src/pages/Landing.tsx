/**
 * Public marketing landing at "/". The page itself is the self-contained
 * apps/landing build, served from /landing.html and shown in a full-viewport
 * iframe so its (global) styles never collide with the app's. Its CTAs use
 * target="_top" to break out of the frame into /register.
 */
export function Landing() {
  return (
    <iframe
      src="/landing.html"
      title="DONICY — GST Billing &amp; Compliance"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0 }}
    />
  );
}

/* Generic page scaffold for sidebar destinations not yet built out.
   Each maps to a Figma screen — listed so the build order is clear. */
export function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <section className="page">
      <div className="page-head"><h2>{title}</h2></div>
      <div className="card empty-state">
        <p className="muted">{note ?? `${title} — screen scaffolded, UI coming next.`}</p>
      </div>
    </section>
  );
}

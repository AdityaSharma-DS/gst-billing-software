export function Dashboard() {
  // TODO: wire to GET /api/dashboard once the endpoint exists.
  const cards = [
    { label: "Today's Bills", value: '—' },
    { label: 'Outgoing Supply (₹)', value: '—' },
    { label: 'Incoming Supply (₹)', value: '—' },
    { label: 'Pending Approvals', value: '—' },
  ];
  return (
    <section>
      <h2>Dashboard</h2>
      <div className="card-grid">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <span className="card-label">{c.label}</span>
            <span className="card-value">{c.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

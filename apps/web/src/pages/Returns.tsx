export function Returns() {
  const returns = ['GSTR-1', 'GSTR-2B', 'GSTR-3B', 'GSTR-4', 'GSTR-9'];
  return (
    <section>
      <h2>GST Returns</h2>
      <p>Generate, validate, and file returns. Wired to <code>POST /api/returns/generate</code>.</p>
      <ul className="return-list">
        {returns.map((r) => <li key={r}>{r} <button disabled>Generate</button></li>)}
      </ul>
    </section>
  );
}

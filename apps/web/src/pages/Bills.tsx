import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Bill {
  id: string;
  billNumber: string;
  direction: 'INCOMING' | 'OUTGOING';
  status: string;
  billDate: string;
  grandTotal: string;
}

export function Bills() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bills'],
    queryFn: async () => (await api.get<Bill[]>('/bills')).data,
  });

  return (
    <section>
      <h2>Bills</h2>
      {isLoading && <p>Loading…</p>}
      {error && <p className="error">Sign in to load bills.</p>}
      <table className="data-table">
        <thead>
          <tr><th>Bill #</th><th>Type</th><th>Date</th><th>Status</th><th>Total</th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((b) => (
            <tr key={b.id}>
              <td>{b.billNumber}</td>
              <td>{b.direction}</td>
              <td>{new Date(b.billDate).toLocaleDateString()}</td>
              <td>{b.status}</td>
              <td>₹{b.grandTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

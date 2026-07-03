import { BillsList } from '../components/BillsList';
export function Invoices() {
  return <BillsList direction="OUTGOING" title="Invoices" newLabel="New Invoice" />;
}

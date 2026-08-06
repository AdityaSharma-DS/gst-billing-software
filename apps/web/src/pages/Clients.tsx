import { PartyList } from '../components/PartyList';

export function Clients() {
  return <PartyList cfg={{
    type: 'CUSTOMER', title: 'Clients', noun: 'Client', queryKey: 'clients',
    billDirection: 'OUTGOING', billNoun: 'invoices', createTo: '/invoices/new',
  }} />;
}

import { PartyList } from '../components/PartyList';

export function Vendors() {
  return <PartyList cfg={{
    type: 'VENDOR', title: 'Vendors', noun: 'Vendor', queryKey: 'vendors',
    billDirection: 'INCOMING', billNoun: 'purchase bills', createTo: '/purchases/new',
  }} />;
}

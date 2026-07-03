import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BillsList } from '../components/BillsList';
import { AddPurchaseModal } from '../components/AddPurchaseModal';

export function Purchases() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <>
      <BillsList direction="INCOMING" title="Purchases" newLabel="Add Purchase Bill" onNew={() => setOpen(true)} />
      {open && (
        <AddPurchaseModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['bills'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            qc.invalidateQueries({ queryKey: ['parties', 'INCOMING'] });
          }}
        />
      )}
    </>
  );
}

'use client';

// Voiding a bill or an invoice (the company owner's correction for a wrong document). The document stays as the record;
// the reason is required and kept on it. For a bill, the owner also chooses what happens to the goods it covered.
import { useState } from 'react';
import { ConfirmDialog, FormField, Input } from '../kit';

export default function VoidDocumentDialog({ kind, doc, open, onClose, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  const [returnStock, setReturnStock] = useState(false);
  const isBill = kind === 'bill';
  const number = isBill ? doc?.billNo : doc?.invoiceNo;
  const hasGoods = isBill && doc?.ewayBills?.length > 0;
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => onConfirm({ reason: reason.trim(), ...(isBill ? { returnStock } : {}) })}
      title={`Void ${isBill ? 'bill' : 'invoice'} ${number}?`}
      confirmLabel={`Void ${isBill ? 'bill' : 'invoice'}`}
      busy={busy}
    >
      {isBill ? (
        <>
          <p>The bill stays on record as void and its number is not reused. The payment of {doc?.total != null ? 'this bill' : 'it'} is taken off the books, so totals and dashboards drop it at once.</p>
          {hasGoods && (
            <>
              <p className="mt-2">Its e-way bill{doc.ewayBills.length === 1 ? '' : 's'} ({doc.ewayBills.map((e) => e.ewayNo).join(', ')}) open again so you can bill {doc.ewayBills.length === 1 ? 'it' : 'them'} correctly.</p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-slate-700">
                <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand" />
                <span>The goods came back: cancel the e-way bill{doc.ewayBills.length === 1 ? '' : 's'} and return the goods to stock instead.</span>
              </label>
            </>
          )}
        </>
      ) : (
        <p>The invoice stays on record as void and its number is not reused. Its bills become paid again, so you can void them or put them on a new invoice.</p>
      )}
      <div className="mt-3">
        <FormField label="Reason (required)">
          <Input maxLength={300} value={reason} onValue={setReason} placeholder={isBill ? 'e.g. Wrong GST rate, entered twice' : 'e.g. Wrong buyer name'} />
        </FormField>
      </div>
    </ConfirmDialog>
  );
}

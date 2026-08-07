import { db } from '../../lib/firebase';
import { doc } from 'firebase/firestore';

export type VoucherType =
  | 'JV' // Journal Voucher
  | 'RV' // Receipt Voucher
  | 'PV' // Payment Voucher
  | 'SV' // Sales Voucher
  | 'CV' // Cash Voucher
  | 'INV' // Sales Invoice
  | 'PR' // Purchase Return
  | 'PO' // Purchase Order
  | 'SQ' // Sales Quotation
  | 'SAL' // Salary Voucher
  | 'SI' // Supplier Invoice
  | string;

export interface SequenceAllocation {
  postingNumber: string;
  nextVal: number;
}

/**
 * Reads sequence document for a specific voucher type inside a transaction.
 * Path: /sequences/{voucherType}
 * Falls back to legacy /counters/posting_sequences if /sequences/{voucherType} does not exist yet.
 */
export async function getNextPostingNumber(
  transaction: any,
  voucherType: VoucherType,
  year: number = new Date().getFullYear()
): Promise<SequenceAllocation> {
  const seqRef = doc(db, 'sequences', voucherType);
  const seqSnap = await transaction.get(seqRef);

  let lastSequence = 0;

  if (seqSnap.exists()) {
    const data = seqSnap.data();
    lastSequence = typeof data.lastSequence === 'number' ? data.lastSequence : 0;
  } else {
    // Check legacy counter document if individual sequence document is not initialized yet
    try {
      const legacyRef = doc(db, 'counters', 'posting_sequences');
      const legacySnap = await transaction.get(legacyRef);
      if (legacySnap.exists()) {
        const legacyData = legacySnap.data();
        if (typeof legacyData[voucherType] === 'number') {
          lastSequence = legacyData[voucherType];
        }
      }
    } catch {
      // Ignore legacy lookup errors
    }
  }

  const nextVal = lastSequence + 1;
  const paddingSize = voucherType === 'INV' || voucherType === 'PO' ? 5 : 6;
  const postingNumber = `${voucherType}-${year}-${String(nextVal).padStart(paddingSize, '0')}`;

  return { postingNumber, nextVal };
}

/**
 * Commits sequence update into /sequences/{voucherType} inside transaction WRITE phase.
 */
export function commitNextPostingNumber(
  transaction: any,
  voucherType: VoucherType,
  nextVal: number,
  onWrite?: (path: string, payload: any, setFn: () => void) => void
): void {
  const seqRef = doc(db, 'sequences', voucherType);
  const payload = {
    id: voucherType,
    prefix: voucherType,
    lastSequence: nextVal,
    updatedAt: new Date().toISOString()
  };

  if (onWrite) {
    onWrite(seqRef.path, payload, () => {
      transaction.set(seqRef, payload, { merge: true });
    });
  } else {
    transaction.set(seqRef, payload, { merge: true });
  }
}

/**
 * Bulk updates sequence documents across all voucher types (e.g. during system restore/synchronization).
 */
export async function syncSequenceCounters(
  sequencesMap: Record<string, number>,
  setDocFn: (ref: any, data: any, options: any) => Promise<void>
): Promise<void> {
  for (const [voucherType, lastVal] of Object.entries(sequencesMap)) {
    const seqRef = doc(db, 'sequences', voucherType);
    await setDocFn(
      seqRef,
      {
        id: voucherType,
        prefix: voucherType,
        lastSequence: lastVal,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  }
}

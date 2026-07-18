import { isVoidStatus } from '../shared/utils';

export interface ISupplierService {
  /**
   * Calculates the outstanding ledger balance for a given supplier or all suppliers.
   */
  calculateSupplierLedger(
    purchases: any[],
    payments: any[],
    supplierId?: string,
    openingBalance?: number
  ): number;
}

export class SupplierService implements ISupplierService {
  calculateSupplierLedger(
    purchases: any[],
    payments: any[],
    supplierId?: string,
    openingBalance: number = 0
  ): number {
    // 1. Filter by supplierId if provided
    const supplierPurchases = supplierId ? purchases.filter(p => p.supplierId === supplierId) : purchases;
    const supplierPayments = supplierId ? payments.filter(p => p.supplierId === supplierId) : payments;

    // 2. Deduplicate purchases by ID to avoid any double counting
    const uniquePurchasesMap = new Map();
    supplierPurchases.forEach(p => {
      if (p && p.id) {
        uniquePurchasesMap.set(p.id, p);
      } else if (p) {
        const tempId = `temp-purchase-${Math.random()}`;
        uniquePurchasesMap.set(tempId, p);
      }
    });
    const uniquePurchases = Array.from(uniquePurchasesMap.values());

    // 3. Deduplicate payments by ID to avoid double counting
    const uniquePaymentsMap = new Map();
    supplierPayments.forEach(p => {
      if (p && p.id) {
        uniquePaymentsMap.set(p.id, p);
      } else if (p) {
        const tempId = `temp-payment-${Math.random()}`;
        uniquePaymentsMap.set(tempId, p);
      }
    });
    const uniquePayments = Array.from(uniquePaymentsMap.values());

    // 4. Filter purchases: Valid ONLY IF status is not "VOID" and not "voided", and paymentType is exactly "Credit"
    const validPurchases = uniquePurchases.filter(p => {
      if (isVoidStatus(p.status)) {
        return false;
      }
      const paymentType = (p.paymentType || '').toString().toUpperCase().trim();
      if (paymentType !== 'CREDIT') {
        return false;
      }
      return true;
    });

    // 5. Filter payments: Ensure voided payments are excluded so dues rollback correctly
    const validPayments = uniquePayments.filter(p => {
      if (isVoidStatus(p.status)) {
        return false;
      }
      return true;
    });

    // 6. Sum up and compute the outstanding balance
    const totalPurchases = validPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
    const totalPaid = validPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);

    return openingBalance + totalPurchases - totalPaid;
  }
}

export const supplierService = new SupplierService();

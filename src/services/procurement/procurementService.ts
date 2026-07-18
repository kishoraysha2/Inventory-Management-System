import { LineItem, Purchase } from '../../types';
import { calculateLineTotals, calculateTransactionTotals, getNormalizedItems } from '../../types';

export interface IProcurementService {
  /**
   * Calculates subtotal, tax and total for a procurement item line.
   */
  calculateLineTotals(
    quantity: number,
    unitPrice: number,
    taxRatePercent?: number
  ): { subtotal: number; taxAmount: number; totalAmount: number };

  /**
   * Summarizes totals for a list of procurement lines.
   */
  calculateTransactionTotals(items: LineItem[]): {
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  };

  /**
   * Normalizes a purchase record's lines.
   */
  getNormalizedItems(transaction: any): LineItem[];

  /**
   * Helper to compute total procurement volume.
   */
  calculateTotalProcurementVolume(purchases: Purchase[]): number;
}

export class ProcurementService implements IProcurementService {
  calculateLineTotals(
    quantity: number,
    unitPrice: number,
    taxRatePercent: number = 0
  ): { subtotal: number; taxAmount: number; totalAmount: number } {
    return calculateLineTotals(quantity, unitPrice, taxRatePercent);
  }

  calculateTransactionTotals(items: LineItem[]): {
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  } {
    return calculateTransactionTotals(items);
  }

  getNormalizedItems(transaction: any): LineItem[] {
    return getNormalizedItems(transaction);
  }

  calculateTotalProcurementVolume(purchases: Purchase[]): number {
    return purchases
      .filter(p => p.status !== 'VOID' && p.status !== 'VOIDED')
      .reduce((sum, p) => sum + (p.totalAmount || 0), 0);
  }
}

export const procurementService = new ProcurementService();

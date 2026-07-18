import { LineItem, Sale, Product } from '../../types';
import { 
  calculateLineTotals, 
  calculateTransactionTotals, 
  getNormalizedItems, 
  getSaleSummary 
} from '../../types';

export interface ISalesService {
  /**
   * Calculates subtotal, tax amount and total for a single item line.
   */
  calculateLineTotals(
    quantity: number,
    unitPrice: number,
    taxRatePercent?: number
  ): { subtotal: number; taxAmount: number; totalAmount: number };

  /**
   * Summarizes transactional totals for a list of line items.
   */
  calculateTransactionTotals(items: LineItem[]): {
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  };

  /**
   * Utility to map either nested items or a root item transaction into a clean array of LineItems.
   */
  getNormalizedItems(transaction: any): LineItem[];

  /**
   * Summarizes a sale object including gross profit and COGS calculation details.
   */
  getSaleSummary(
    sale: Sale,
    products: Product[]
  ): {
    subtotal: number;
    totalAmount: number;
    taxAmount: number;
    costOfGoodsSold: number;
    grossProfit: number;
  };
}

export class SalesService implements ISalesService {
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

  getSaleSummary(
    sale: Sale,
    products: Product[]
  ): {
    subtotal: number;
    totalAmount: number;
    taxAmount: number;
    costOfGoodsSold: number;
    grossProfit: number;
  } {
    return getSaleSummary(sale, products);
  }
}

export const salesService = new SalesService();

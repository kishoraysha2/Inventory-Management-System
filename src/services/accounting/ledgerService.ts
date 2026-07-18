import { 
  VoucherType, 
  resolveExpenseAccount, 
  resolveSystemAccount, 
  getNextPostingNumber, 
  commitNextPostingNumber, 
  ensureSystemAccountsExist 
} from '../../lib/postingEngine';
import { customerService } from '../customer/customerService';
import { supplierService } from '../supplier/supplierService';

export interface ILedgerService {
  /**
   * Calculates the customer ledger balance.
   */
  calculateCustomerLedger(
    sales: any[],
    payments: any[],
    customerId?: string,
    openingBalance?: number
  ): number;

  /**
   * Calculates the supplier ledger balance.
   */
  calculateSupplierLedger(
    purchases: any[],
    payments: any[],
    supplierId?: string,
    openingBalance?: number
  ): number;

  /**
   * Resolves appropriate Chart of Accounts ID and code for a given expense category.
   */
  resolveExpenseAccount(category: string, existingCoa?: any[]): { id: string; code: string; name: string };

  /**
   * Dynamically resolves a critical system account role from active Chart of Accounts.
   */
  resolveSystemAccount(role: string, coa?: any[]): { id: string; code: string; name: string };

  /**
   * Reads sequence counter inside a transaction.
   */
  getNextPostingNumber(
    transaction: any,
    voucherType: VoucherType,
    year?: number
  ): Promise<{ postingNumber: string; nextVal: number }>;

  /**
   * Commits sequence counter inside a transaction.
   */
  commitNextPostingNumber(transaction: any, voucherType: VoucherType, nextVal: number): void;

  /**
   * Verifies standard accounts (such as VAT and Capital) exist.
   */
  ensureSystemAccountsExist(transaction: any, currentCoaIds: string[]): Promise<void>;
}

export class LedgerService implements ILedgerService {
  calculateCustomerLedger(
    sales: any[],
    payments: any[],
    customerId?: string,
    openingBalance?: number
  ): number {
    return customerService.calculateCustomerLedger(sales, payments, customerId, openingBalance);
  }

  calculateSupplierLedger(
    purchases: any[],
    payments: any[],
    supplierId?: string,
    openingBalance?: number
  ): number {
    return supplierService.calculateSupplierLedger(purchases, payments, supplierId, openingBalance);
  }

  resolveExpenseAccount(category: string, existingCoa: any[] = []): { id: string; code: string; name: string } {
    return resolveExpenseAccount(category, existingCoa);
  }

  resolveSystemAccount(role: string, coa: any[] = []): { id: string; code: string; name: string } {
    return resolveSystemAccount(role, coa);
  }

  getNextPostingNumber(
    transaction: any,
    voucherType: VoucherType,
    year: number = 2026
  ): Promise<{ postingNumber: string; nextVal: number }> {
    return getNextPostingNumber(transaction, voucherType, year);
  }

  commitNextPostingNumber(transaction: any, voucherType: VoucherType, nextVal: number): void {
    commitNextPostingNumber(transaction, voucherType, nextVal);
  }

  ensureSystemAccountsExist(transaction: any, currentCoaIds: string[]): Promise<void> {
    return ensureSystemAccountsExist(transaction, currentCoaIds);
  }
}

export const ledgerService = new LedgerService();

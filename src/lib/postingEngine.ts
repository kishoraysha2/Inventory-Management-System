import { db, auth } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { LedgerEntry, LedgerEntryLine } from '../types';
import { INITIAL_CHART_OF_ACCOUNTS } from '../data';
import { 
  getNextPostingNumber as getNextPostingNumberFromEngine, 
  commitNextPostingNumber as commitNextPostingNumberFromEngine,
  syncSequenceCounters,
  VoucherType as EngineVoucherType 
} from '../services/sequence/sequenceEngine';

// Voucher type definition
export type VoucherType = EngineVoucherType;

export { syncSequenceCounters };

/**
 * Enterprise Journal Integrity Validation (Phase X)
 * Mandatory validation for every financial posting before committing an accounting transaction.
 * Validates that Total Debit == Total Credit.
 * If NOT balanced:
 *   - Aborts transaction / throws Error (causing Firestore transaction rollback)
 *   - Prevents saving Sale, Purchases, Payments, Ledger Entries, Inventory
 *   - Displays exact error message:
 *     "Accounting validation failed.
 *
 *      Debits and Credits are not balanced.
 *
 *      The transaction has been cancelled."
 */
export function validateJournalBalance(lines: { debit?: number; credit?: number }[]): void {
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    throw new Error(
      "Accounting validation failed.\n\nDebits and Credits are not balanced.\n\nThe transaction has been cancelled."
    );
  }

  const totalDebits = parseFloat(
    lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0).toFixed(2)
  );
  const totalCredits = parseFloat(
    lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0).toFixed(2)
  );

  if (Math.abs(totalDebits - totalCredits) >= 0.01) {
    throw new Error(
      "Accounting validation failed.\n\nDebits and Credits are not balanced.\n\nThe transaction has been cancelled."
    );
  }
}

// Standard predefined accounts matching the preset Chart of Accounts
export const SYSTEM_ACCOUNTS = {
  CASH: { id: 'coa-1010', code: '1010', name: 'Cash' },
  AR: { id: 'coa-1200', code: '1200', name: 'Accounts Receivable' },
  INVENTORY: { id: 'coa-1300', code: '1300', name: 'Inventory Asset' },
  AP: { id: 'coa-2100', code: '2100', name: 'Accounts Payable' },
  SALES_REVENUE: { id: 'coa-4100', code: '4100', name: 'Sales Revenue' },
  COGS: { id: 'coa-5100', code: '5100', name: 'Cost of Goods Sold' },
  INPUT_VAT: { id: 'coa-1400', code: '1400', name: 'Input VAT Receivable' },
  OUTPUT_VAT: { id: 'coa-2400', code: '2400', name: 'Output VAT Payable' },
  EXPENSE_ROOT: { id: 'coa-6100', code: '6100', name: 'Operating Expenses' },
  CAPITAL: { id: 'coa-3100', code: '3100', name: 'Owner Capital' },
};

// Standard expense categories mapping to specific account codes and names
export const EXPENSE_CATEGORY_MAPPINGS: Record<string, { code: string; name: string; id: string }> = {
  "Office Rent": { id: 'coa-6110', code: '6110', name: 'Rent Expense' },
  "Electricity": { id: 'coa-6120', code: '6120', name: 'Electricity Expense' },
  "Water": { id: 'coa-6135', code: '6135', name: 'Water Expense' },
  "Internet": { id: 'coa-6130', code: '6130', name: 'Internet & Telecom Expense' },
  "Salary": { id: 'coa-6150', code: '6150', name: 'Salaries & Wages Expense' },
  "Fuel": { id: 'coa-6140', code: '6140', name: 'Fuel & Travel Expense' },
  "Transportation": { id: 'coa-6145', code: '6145', name: 'Transportation & Freight' },
  "Maintenance": { id: 'coa-6160', code: '6160', name: 'Repairs & Maintenance' },
  "Office Supplies": { id: 'coa-6170', code: '6170', name: 'Office Supplies Expense' },
  "Marketing": { id: 'coa-6180', code: '6180', name: 'Marketing & Advertising' },
  "Meals": { id: 'coa-6185', code: '6185', name: 'Meals & Entertainment' },
  "Taxes": { id: 'coa-6190', code: '6190', name: 'Taxes & Licensing' },
  "Miscellaneous": { id: 'coa-6199', code: '6199', name: 'Miscellaneous Expense' }
};

// Dynamic helper to resolve account details for an expense category
export function resolveExpenseAccount(category: string, existingCoa: any[] = []): { id: string; code: string; name: string } {
  // 1. Try to find an exact match in existing Chart of Accounts list
  const matchedInCoa = existingCoa.find(acc => acc.name.toLowerCase() === category.toLowerCase() || acc.code === category);
  if (matchedInCoa) {
    return { id: matchedInCoa.id, code: matchedInCoa.code, name: matchedInCoa.name };
  }

  // 2. Fall back to standard default mapping
  const mapped = EXPENSE_CATEGORY_MAPPINGS[category];
  if (mapped) {
    return mapped;
  }

  // 3. If custom category, generate a deterministic code or use the Operating Expenses root (6100)
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const suffix = Math.abs(hash % 90) + 10; // 10 to 99
  const generatedCode = `61${suffix}`;
  
  return {
    id: `coa-${generatedCode}`,
    code: generatedCode,
    name: `${category} Expense`
  };
}

// Dynamic helper to resolve a system account by its role from active Chart of Accounts
export function resolveSystemAccount(
  role: string,
  coa: any[] = []
): { id: string; code: string; name: string } {
  const normRole = role.toUpperCase().trim();
  const activeCoa = Array.isArray(coa) ? coa.filter(acc => acc && (acc.status === 'ACTIVE' || acc.status === 'active' || !acc.status)) : [];

  // Match 1: Search active Chart of Accounts with an exact match on systemRole
  let matched = activeCoa.find(acc => acc.systemRole?.toUpperCase() === normRole);

  // Match 2: Match based on standard patterns or codes or names (for backward compatibility if systemRole is not yet in DB)
  if (!matched) {
    if (normRole === 'CASH') {
      matched = activeCoa.find(acc => acc.code === '1010' || acc.code === '1100' || acc.systemRole === 'CASH') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('cash') && acc.isSystem);
    } else if (normRole === 'ACCOUNTS_RECEIVABLE' || normRole === 'AR') {
      matched = activeCoa.find(acc => acc.code === '1200') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('receivable') && acc.isSystem);
    } else if (normRole === 'INVENTORY') {
      matched = activeCoa.find(acc => acc.code === '1300') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('inventory') && acc.isSystem);
    } else if (normRole === 'ACCOUNTS_PAYABLE' || normRole === 'AP') {
      matched = activeCoa.find(acc => acc.code === '2100') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('payable') && acc.isSystem);
    } else if (normRole === 'INPUT_VAT') {
      matched = activeCoa.find(acc => acc.code === '1400') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('input vat') && acc.isSystem);
    } else if (normRole === 'OUTPUT_VAT') {
      matched = activeCoa.find(acc => acc.code === '2400') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('output vat') && acc.isSystem);
    } else if (normRole === 'SALES_REVENUE' || normRole === 'REVENUE') {
      matched = activeCoa.find(acc => acc.code === '4100') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('sales revenue') && acc.isSystem);
    } else if (normRole === 'COGS') {
      matched = activeCoa.find(acc => acc.code === '5100') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('cost of goods sold') && acc.isSystem);
    } else if (normRole === 'OWNER_CAPITAL' || normRole === 'CAPITAL') {
      matched = activeCoa.find(acc => acc.code === '3100') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('capital') && acc.isSystem);
    }
  }

  // Match 3: Secondary check on any active account matching name/code even if not system
  if (!matched) {
    if (normRole === 'CASH') {
      matched = activeCoa.find(acc => acc.code === '1010' || acc.code === '1100') ||
                activeCoa.find(acc => acc.name?.toLowerCase().includes('cash'));
    }
  }

  if (matched) {
    return { id: matched.id, code: matched.code, name: matched.name };
  }

  // Emergency FALLBACK: if no active account is found, return the predefined static system account
  if (normRole === 'CASH') return SYSTEM_ACCOUNTS.CASH;
  if (normRole === 'ACCOUNTS_RECEIVABLE' || normRole === 'AR') return SYSTEM_ACCOUNTS.AR;
  if (normRole === 'INVENTORY') return SYSTEM_ACCOUNTS.INVENTORY;
  if (normRole === 'ACCOUNTS_PAYABLE' || normRole === 'AP') return SYSTEM_ACCOUNTS.AP;
  if (normRole === 'OUTPUT_VAT') return SYSTEM_ACCOUNTS.OUTPUT_VAT;
  if (normRole === 'INPUT_VAT') return SYSTEM_ACCOUNTS.INPUT_VAT;
  if (normRole === 'SALES_REVENUE' || normRole === 'REVENUE') return SYSTEM_ACCOUNTS.SALES_REVENUE;
  if (normRole === 'COGS') return SYSTEM_ACCOUNTS.COGS;
  if (normRole === 'OWNER_CAPITAL' || normRole === 'CAPITAL') return SYSTEM_ACCOUNTS.CAPITAL;

  return { id: `coa-${normRole.toLowerCase()}`, code: '0000', name: `Fallback ${role}` };
}

/**
 * Reads the sequence counter inside a transaction.
 * MUST be executed in the READ phase of the transaction.
 */
export async function getNextPostingNumber(
  transaction: any,
  voucherType: VoucherType,
  year: number = 2026
): Promise<{ postingNumber: string; nextVal: number }> {
  return getNextPostingNumberFromEngine(transaction, voucherType, year);
}

/**
 * Updates the sequence counter inside a transaction.
 * MUST be executed in the WRITE phase of the transaction.
 */
export function commitNextPostingNumber(
  transaction: any,
  voucherType: VoucherType,
  nextVal: number,
  onWrite?: (path: string, payload: any, setFn: () => void) => void
): void {
  commitNextPostingNumberFromEngine(transaction, voucherType, nextVal, onWrite);
}

/**
 * Checks if the system VAT accounts exist in the current list of accounts,
 * if not, returns a list of operations/documents to create them to ensure
 * they are searchable and reportable.
 */
export async function ensureSystemAccountsExist(
  transaction: any,
  currentCoaIds: string[],
  onWrite?: (path: string, payload: any, setFn: () => void) => void
) {
  const currentUser = auth?.currentUser;

  const REQUIRED_SYSTEM_ACCOUNTS = [
    ...INITIAL_CHART_OF_ACCOUNTS,
    {
      id: SYSTEM_ACCOUNTS.INPUT_VAT.id,
      code: SYSTEM_ACCOUNTS.INPUT_VAT.code,
      name: SYSTEM_ACCOUNTS.INPUT_VAT.name,
      type: 'Asset',
      parentAccount: '1000',
      normalBalance: 'Debit',
      status: 'ACTIVE',
      description: 'VAT paid on business procurements and expenses, recoverable from tax authorities.',
      isSystem: true
    },
    {
      id: SYSTEM_ACCOUNTS.OUTPUT_VAT.id,
      code: SYSTEM_ACCOUNTS.OUTPUT_VAT.code,
      name: SYSTEM_ACCOUNTS.OUTPUT_VAT.name,
      type: 'Liability',
      parentAccount: '2000',
      normalBalance: 'Credit',
      status: 'ACTIVE',
      description: 'VAT collected on taxable customer sales, payable to tax authorities.',
      isSystem: true
    },
    ...Object.values(EXPENSE_CATEGORY_MAPPINGS).map(exp => ({
      id: exp.id,
      code: exp.code,
      name: exp.name,
      type: 'Expense',
      parentAccount: '6100',
      normalBalance: 'Debit',
      status: 'ACTIVE',
      description: `${exp.name} for regular operating overheads.`,
      isSystem: true
    }))
  ];

  // Helper to build a clean doc strictly adhering to isValidChartOfAccount in Firestore Rules
  const buildCleanDoc = (acc: any) => {
    const now = new Date().toISOString();
    let type = acc.type || 'Expense';
    if (!['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].includes(type)) {
      type = 'Expense';
    }
    let normalBalance = acc.normalBalance;
    if (!['Debit', 'Credit'].includes(normalBalance)) {
      normalBalance = (type === 'Asset' || type === 'Expense') ? 'Debit' : 'Credit';
    }
    let status = (acc.status || 'ACTIVE').toUpperCase();
    if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) {
      status = 'ACTIVE';
    }

    const clean: Record<string, any> = {
      id: String(acc.id),
      code: String(acc.code),
      name: String(acc.name),
      type,
      normalBalance,
      status,
      isSystem: acc.isSystem !== undefined ? Boolean(acc.isSystem) : true,
      createdAt: acc.createdAt || now,
      updatedAt: now
    };

    if (acc.description) {
      clean.description = String(acc.description);
    }
    if (acc.parentAccount) {
      clean.parentAccount = String(acc.parentAccount);
    }

    return clean;
  };

  const missingAccounts = REQUIRED_SYSTEM_ACCOUNTS
    .filter(acc => !currentCoaIds.includes(acc.id))
    .map(acc => buildCleanDoc(acc));

  for (const accountDocument of missingAccounts) {
    const chartAccountRef = doc(db, 'chartOfAccounts', accountDocument.id);
    if (onWrite) {
      onWrite(chartAccountRef.path, accountDocument, () => {
        transaction.set(chartAccountRef, accountDocument);
      });
    } else {
      transaction.set(chartAccountRef, accountDocument);
    }
  }
}

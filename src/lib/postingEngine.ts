import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { LedgerEntry, LedgerEntryLine } from '../types';

// Voucher type definition
export type VoucherType = 'JV' | 'RV' | 'PV' | 'SV' | 'CV' | 'INV';

// Standard predefined accounts matching the preset Chart of Accounts
export const SYSTEM_ACCOUNTS = {
  CASH: { id: 'coa-1100', code: '1100', name: 'Cash in Hand' },
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
  const activeCoa = Array.isArray(coa) ? coa.filter(acc => acc && acc.status === 'active') : [];

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
  const counterRef = doc(db, 'counters', 'posting_sequences');
  const counterSnap = await transaction.get(counterRef);
  
  let currentSequences = { JV: 0, RV: 0, PV: 0, SV: 0, CV: 0, INV: 0 };
  if (counterSnap.exists()) {
    currentSequences = { ...currentSequences, ...counterSnap.data() };
  }
  
  const nextVal = (currentSequences[voucherType] || 0) + 1;
  const paddingSize = voucherType === 'INV' ? 5 : 6;
  const postingNumber = `${voucherType}-${year}-${String(nextVal).padStart(paddingSize, '0')}`;
  
  return { postingNumber, nextVal };
}

/**
 * Updates the sequence counter inside a transaction.
 * MUST be executed in the WRITE phase of the transaction.
 */
export function commitNextPostingNumber(
  transaction: any,
  voucherType: VoucherType,
  nextVal: number
) {
  const counterRef = doc(db, 'counters', 'posting_sequences');
  transaction.set(counterRef, {
    [voucherType]: nextVal
  }, { merge: true });
}

/**
 * Checks if the system VAT accounts exist in the current list of accounts,
 * if not, returns a list of operations/documents to create them to ensure
 * they are searchable and reportable.
 */
export async function ensureSystemAccountsExist(transaction: any, currentCoaIds: string[]) {
  const missingAccounts = [];
  
  // Let's verify Input VAT (1400) and Output VAT (2400)
  if (!currentCoaIds.includes(SYSTEM_ACCOUNTS.INPUT_VAT.id)) {
    missingAccounts.push({
      id: SYSTEM_ACCOUNTS.INPUT_VAT.id,
      code: SYSTEM_ACCOUNTS.INPUT_VAT.code,
      name: SYSTEM_ACCOUNTS.INPUT_VAT.name,
      type: 'Asset',
      parentAccount: '1000',
      normalBalance: 'Debit',
      status: 'active',
      description: 'VAT paid on business procurements and expenses, recoverable from tax authorities.',
      isSystem: true,
      editable: false,
      systemRole: 'INPUT_VAT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  if (!currentCoaIds.includes(SYSTEM_ACCOUNTS.OUTPUT_VAT.id)) {
    missingAccounts.push({
      id: SYSTEM_ACCOUNTS.OUTPUT_VAT.id,
      code: SYSTEM_ACCOUNTS.OUTPUT_VAT.code,
      name: SYSTEM_ACCOUNTS.OUTPUT_VAT.name,
      type: 'Liability',
      parentAccount: '2000',
      normalBalance: 'Credit',
      status: 'active',
      description: 'VAT collected on taxable customer sales, payable to tax authorities.',
      isSystem: true,
      editable: false,
      systemRole: 'OUTPUT_VAT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Verify Owner Capital (3100)
  if (!currentCoaIds.includes(SYSTEM_ACCOUNTS.CAPITAL.id)) {
    missingAccounts.push({
      id: SYSTEM_ACCOUNTS.CAPITAL.id,
      code: SYSTEM_ACCOUNTS.CAPITAL.code,
      name: SYSTEM_ACCOUNTS.CAPITAL.name,
      type: 'Equity',
      parentAccount: '3000',
      normalBalance: 'Credit',
      status: 'active',
      description: 'Owner equity capital injections into the enterprise.',
      isSystem: true,
      editable: false,
      systemRole: 'OWNER_CAPITAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Also make sure all standard expense accounts exist in the COA
  Object.values(EXPENSE_CATEGORY_MAPPINGS).forEach(exp => {
    if (!currentCoaIds.includes(exp.id)) {
      missingAccounts.push({
        id: exp.id,
        code: exp.code,
        name: exp.name,
        type: 'Expense',
        parentAccount: '6000',
        normalBalance: 'Debit',
        status: 'active',
        description: `${exp.name} for regular operating overheads.`,
        isSystem: true,
        editable: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  });

  for (const acc of missingAccounts) {
    const ref = doc(db, 'chartOfAccounts', acc.id);
    transaction.set(ref, acc, { merge: true });
  }
}

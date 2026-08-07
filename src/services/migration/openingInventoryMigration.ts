import { collection, doc, getDocs, runTransaction } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Product, LedgerEntry, LedgerEntryLine } from '../../types';
import { 
  getNextPostingNumber, 
  commitNextPostingNumber, 
  resolveSystemAccount, 
  validateJournalBalance, 
  ensureSystemAccountsExist 
} from '../../lib/postingEngine';
import { INITIAL_CHART_OF_ACCOUNTS } from '../../data';
import { isInactiveStatus } from '../../lib/utils';

export interface MigrationReport {
  scannedCount: number;
  skippedCount: number;
  missingCount: number;
  createdCount: number;
  totalBackfilledValue: number;
  createdEntries: LedgerEntry[];
}

export async function runOpeningInventoryMigration(): Promise<MigrationReport> {
  const report: MigrationReport = {
    scannedCount: 0,
    skippedCount: 0,
    missingCount: 0,
    createdCount: 0,
    totalBackfilledValue: 0,
    createdEntries: []
  };

  // Check if running in offline mode or online mode
  if (!auth.currentUser) {
    // --- OFFLINE (LOCALSTORAGE) MIGRATION ---
    const savedProductsStr = localStorage.getItem('inventory_products');
    const products: Product[] = savedProductsStr ? JSON.parse(savedProductsStr) : [];
    
    const savedLedgersStr = localStorage.getItem('inventory_ledger_entries');
    const localLedgers: LedgerEntry[] = savedLedgersStr ? JSON.parse(savedLedgersStr) : [];

    const savedCoaStr = localStorage.getItem('nexus_chart_of_accounts');
    const coa: any[] = savedCoaStr ? JSON.parse(savedCoaStr) : INITIAL_CHART_OF_ACCOUNTS;

    report.scannedCount = products.length;

    const inventoryAcc = resolveSystemAccount('INVENTORY', coa);
    const capitalAcc = resolveSystemAccount('CAPITAL', coa);

    const updatedLedgers = [...localLedgers];

    for (const product of products) {
      if (!product || isInactiveStatus(product.status)) {
        report.skippedCount++;
        continue;
      }

      const openingQty = product.initialStock !== undefined ? product.initialStock : (product.currentStock || 0);
      const purchasePrice = product.purchasePrice || 0;
      const openingValue = openingQty * purchasePrice;

      if (openingValue <= 0) {
        report.skippedCount++;
        continue;
      }

      // Check if opening journal already exists
      const existing = updatedLedgers.find(
        le => (le.createdFrom === product.id && le.sourceModule === 'OPENING_BALANCE') ||
              le.id === `le-opening-${product.id}`
      );

      if (existing) {
        report.skippedCount++;
        continue;
      }

      // Missing opening journal detected!
      report.missingCount++;

      const entryId = `le-opening-${product.id}`;
      const postingDate = product.createdDate || new Date().toISOString();
      const transDateYear = new Date(postingDate).getFullYear() || 2026;
      const periodMonth = String(new Date(postingDate).getMonth() + 1).padStart(2, '0');
      const accountingPeriod = `${transDateYear}-${periodMonth}`;
      const postingNumber = `JV-${transDateYear}-${String(updatedLedgers.length + 1).padStart(6, '0')}`;

      const lines: LedgerEntryLine[] = [
        {
          accountId: inventoryAcc.id,
          accountCode: inventoryAcc.code,
          accountName: inventoryAcc.name,
          debit: openingValue,
          credit: 0,
          baseCurrencyDebit: openingValue,
          baseCurrencyCredit: 0
        },
        {
          accountId: capitalAcc.id,
          accountCode: capitalAcc.code,
          accountName: capitalAcc.name,
          debit: 0,
          credit: openingValue,
          baseCurrencyDebit: 0,
          baseCurrencyCredit: openingValue
        }
      ];

      validateJournalBalance(lines);

      const openingLedgerEntry: LedgerEntry = {
        id: entryId,
        postingNumber,
        companyId: 'comp-default',
        branchId: 'branch-main',
        fiscalYear: transDateYear,
        accountingPeriod,
        sourceModule: 'OPENING_BALANCE',
        postingStatus: 'POSTED',
        currency: 'USD',
        exchangeRate: 1,
        baseCurrencyCode: 'USD',
        version: 1,
        narration: `Opening Inventory Valuation for product "${product.name}" (${product.sku}) - Qty: ${openingQty} @ $${purchasePrice}`,
        createdFrom: product.id,
        approvalStatus: 'APPROVED',
        postingDate,
        createdAt: postingDate,
        createdBy: 'System Backfill Migration',
        lines
      };

      updatedLedgers.push(openingLedgerEntry);
      report.createdEntries.push(openingLedgerEntry);
      report.createdCount++;
      report.totalBackfilledValue += openingValue;
    }

    if (report.createdCount > 0) {
      localStorage.setItem('inventory_ledger_entries', JSON.stringify(updatedLedgers));
    }

    return report;
  }

  // --- ONLINE (FIRESTORE) MIGRATION ---
  try {
    const productsSnap = await getDocs(collection(db, 'products'));
    const products: Product[] = [];
    productsSnap.forEach(docSnap => {
      products.push({ id: docSnap.id, ...(docSnap.data() as Product) });
    });

    const ledgerSnap = await getDocs(collection(db, 'ledgerEntries'));
    const existingLedgers: LedgerEntry[] = [];
    ledgerSnap.forEach(docSnap => {
      existingLedgers.push({ id: docSnap.id, ...(docSnap.data() as LedgerEntry) });
    });

    const coaSnap = await getDocs(collection(db, 'chartOfAccounts'));
    const coa: any[] = [];
    coaSnap.forEach(docSnap => {
      coa.push({ id: docSnap.id, ...docSnap.data() });
    });
    const activeCoa = coa.length > 0 ? coa : INITIAL_CHART_OF_ACCOUNTS;

    report.scannedCount = products.length;

    const candidateProducts: Product[] = [];

    for (const product of products) {
      if (!product || isInactiveStatus(product.status)) {
        report.skippedCount++;
        continue;
      }

      const openingQty = product.initialStock !== undefined ? product.initialStock : (product.currentStock || 0);
      const purchasePrice = product.purchasePrice || 0;
      const openingValue = openingQty * purchasePrice;

      if (openingValue <= 0) {
        report.skippedCount++;
        continue;
      }

      const existing = existingLedgers.find(
        le => (le.createdFrom === product.id && le.sourceModule === 'OPENING_BALANCE') ||
              le.id === `le-opening-${product.id}`
      );

      if (existing) {
        report.skippedCount++;
        continue;
      }

      candidateProducts.push(product);
    }

    report.missingCount = candidateProducts.length;

    if (candidateProducts.length === 0) {
      return report;
    }

    const inventoryAcc = resolveSystemAccount('INVENTORY', activeCoa);
    const capitalAcc = resolveSystemAccount('CAPITAL', activeCoa);

    for (const product of candidateProducts) {
      const openingQty = product.initialStock !== undefined ? product.initialStock : (product.currentStock || 0);
      const purchasePrice = product.purchasePrice || 0;
      const openingValue = openingQty * purchasePrice;

      await runTransaction(db, async (transaction) => {
        const postingDate = product.createdDate || new Date().toISOString();
        const transDateYear = new Date(postingDate).getFullYear() || 2026;

        const seqAlloc = await getNextPostingNumber(transaction, 'JV', transDateYear);
        const postingNumber = seqAlloc.postingNumber;
        const nextVal = seqAlloc.nextVal;

        const lines: LedgerEntryLine[] = [
          {
            accountId: inventoryAcc.id,
            accountCode: inventoryAcc.code,
            accountName: inventoryAcc.name,
            debit: openingValue,
            credit: 0,
            baseCurrencyDebit: openingValue,
            baseCurrencyCredit: 0
          },
          {
            accountId: capitalAcc.id,
            accountCode: capitalAcc.code,
            accountName: capitalAcc.name,
            debit: 0,
            credit: openingValue,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: openingValue
          }
        ];

        validateJournalBalance(lines);

        const periodMonth = String(new Date(postingDate).getMonth() + 1).padStart(2, '0');
        const accountingPeriod = `${transDateYear}-${periodMonth}`;
        const entryId = `le-opening-${product.id}`;

        const ledgerEntry: LedgerEntry = {
          id: entryId,
          postingNumber,
          companyId: 'comp-default',
          branchId: 'branch-main',
          fiscalYear: transDateYear,
          accountingPeriod,
          sourceModule: 'OPENING_BALANCE',
          postingStatus: 'POSTED',
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration: `Opening Inventory Valuation for product "${product.name}" (${product.sku}) - Qty: ${openingQty} @ $${purchasePrice}`,
          createdFrom: product.id,
          approvalStatus: 'APPROVED',
          postingDate,
          createdAt: postingDate,
          createdBy: 'System Backfill Migration',
          lines
        };

        const ledgerRef = doc(db, 'ledgerEntries', entryId);
        transaction.set(ledgerRef, ledgerEntry);

        commitNextPostingNumber(transaction, 'JV', nextVal);

        const currentCoaIds = activeCoa.map(c => c.id);
        await ensureSystemAccountsExist(transaction, currentCoaIds);

        report.createdEntries.push(ledgerEntry);
      });

      report.createdCount++;
      report.totalBackfilledValue += openingValue;
    }

    return report;
  } catch (err) {
    console.error("Firestore Opening Inventory Backfill Migration error:", err);
    throw err;
  }
}

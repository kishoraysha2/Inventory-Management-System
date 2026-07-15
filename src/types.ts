export interface ActivityLog {
  id: string;
  itemId: string;
  itemName: string;
  type: 'add' | 'edit' | 'delete' | 'stock_change';
  description: string;
  quantityDifference?: number;
  timestamp: string;
  reason?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone: string;
  category?: string;
  address?: string;
  paymentType?: 'Cash' | 'Credit';
  dueBalance?: number;
  supplierAdvance?: number;
  createdDate?: string;
  status?: 'active' | 'inactive';
  vatNumber?: string;
  updatedAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  customerType: 'Cash' | 'Credit';
  dueBalance: number;
  customerCredit?: number;
  createdDate: string;
  status?: 'active' | 'inactive';
  vatNumber?: string;
  email?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  minimumStockAlert: number;
  createdDate: string;
  status?: 'active' | 'inactive';
  location?: string;
  supplierName?: string;
  supplierEmail?: string;
  description?: string;
  initialStock?: number;
}

export interface CustomerSnapshot {
  id: string;
  name: string;
  phone: string;
  address: string;
  customerType: 'Cash' | 'Credit';
  vatNumber?: string;
  email?: string;
}

export interface CompanySnapshot {
  name: string;
  tradeName?: string;
  ownerName?: string;
  taxRegistrationId: string;
  crNumber?: string;
  address: string;
  phone: string;
  email?: string;
  website?: string;
  logo?: string;
  taxRatePercent: number;
}

export interface ProductSnapshot {
  id: string;
  name: string;
  sku: string;
  category: string;
  description?: string;
}

export interface LineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxRatePercent?: number;
  taxAmount?: number;
  totalAmount: number;
  purchasePriceAtSale?: number;
  costOfGoodsSold?: number;
  grossProfit?: number;
  productSnapshot?: ProductSnapshot;
}

export interface Sale {
  id: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  unitPrice?: number;
  subtotal?: number;
  taxRatePercent?: number;
  taxAmount?: number;
  totalAmount: number;
  paymentType: 'Cash' | 'Credit';
  saleDate: string;
  timestamp?: string;
  productPurchasePriceAtSale?: number;
  productSellingPriceAtSale?: number;
  costOfGoodsSold?: number;
  grossProfit?: number;
  items?: LineItem[];
  status?: string;
  customerSnapshot?: CustomerSnapshot;
  companySnapshot?: CompanySnapshot;
  invoiceNumber?: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  quantity: number;
  purchasePrice: number;
  totalAmount: number;
  paymentType: 'Cash' | 'Credit';
  purchaseDate: string;
  items?: LineItem[];
  status?: string;
  invoiceNumber?: string;
  vatAmount?: number;
  discountAmount?: number;
  supplierSnapshot?: any;
  productSnapshot?: any;
  companySnapshot?: CompanySnapshot;
}

export function calculateLineTotals(
  quantity: number,
  unitPrice: number,
  taxRatePercent: number = 0
): { subtotal: number; taxAmount: number; totalAmount: number } {
  const subtotal = quantity * unitPrice;
  const taxAmount = (subtotal * taxRatePercent) / 100;
  const totalAmount = subtotal + taxAmount;
  return { subtotal, taxAmount, totalAmount };
}

export function calculateTransactionTotals(items: LineItem[]): {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
} {
  return items.reduce(
    (acc, item) => {
      acc.subtotal += item.subtotal;
      acc.taxAmount += item.taxAmount ?? 0;
      acc.totalAmount += item.totalAmount;
      return acc;
    },
    { subtotal: 0, taxAmount: 0, totalAmount: 0 }
  );
}

export function getNormalizedItems(transaction: any): LineItem[] {
  if (transaction && Array.isArray(transaction.items) && transaction.items.length > 0) {
    return transaction.items;
  }
  
  if (!transaction) {
    return [];
  }

  let unitPrice = 0;
  if (transaction.unitPrice !== undefined) {
    unitPrice = transaction.unitPrice;
  } else if (transaction.sellingPrice !== undefined) {
    unitPrice = transaction.sellingPrice;
  } else if (transaction.purchasePrice !== undefined) {
    unitPrice = transaction.purchasePrice;
  }

  let subtotal = 0;
  if (transaction.subtotal !== undefined) {
    subtotal = transaction.subtotal;
  } else {
    subtotal = (transaction.quantity || 0) * unitPrice;
  }

  const taxRatePercent = transaction.taxRatePercent ?? 0;
  let taxAmount = 0;
  if (transaction.taxAmount !== undefined) {
    taxAmount = transaction.taxAmount;
  } else {
    taxAmount = (subtotal * taxRatePercent) / 100;
  }

  let totalAmount = 0;
  if (transaction.totalAmount !== undefined) {
    totalAmount = transaction.totalAmount;
  } else {
    totalAmount = subtotal + taxAmount;
  }

  const productId = transaction.productId || '';
  const productName = transaction.productName || '';
  const quantity = transaction.quantity !== undefined ? transaction.quantity : 0;

  return [{
    productId,
    productName,
    quantity,
    unitPrice,
    subtotal,
    taxRatePercent,
    taxAmount,
    totalAmount
  }];
}

export function getSaleSummary(sale: Sale, products: Product[]): {
  subtotal: number;
  totalAmount: number;
  taxAmount: number;
  costOfGoodsSold: number;
  grossProfit: number;
} {
  const isLegacy = !sale.items || sale.items.length === 0;
  if (isLegacy) {
    const subtotal = sale.subtotal !== undefined ? sale.subtotal : ((sale.quantity || 0) * (sale.unitPrice ?? sale.sellingPrice ?? 0));
    const totalAmount = sale.totalAmount !== undefined ? sale.totalAmount : subtotal;
    const taxAmount = sale.taxAmount !== undefined ? sale.taxAmount : (totalAmount - subtotal);
    const costOfGoodsSold = sale.costOfGoodsSold !== undefined 
      ? sale.costOfGoodsSold 
      : (sale.productPurchasePriceAtSale !== undefined ? sale.productPurchasePriceAtSale : (sale.sellingPrice ?? 0) * 0.6) * (sale.quantity || 0);
    const grossProfit = sale.grossProfit !== undefined ? sale.grossProfit : (subtotal - costOfGoodsSold);
    return { subtotal, totalAmount, taxAmount, costOfGoodsSold, grossProfit };
  } else {
    const items = sale.items || [];
    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;
    let costOfGoodsSold = 0;

    items.forEach(item => {
      subtotal += item.subtotal;
      taxAmount += item.taxAmount ?? 0;
      totalAmount += item.totalAmount;
      
      const itemCOGS = (item as any).costOfGoodsSold !== undefined
        ? (item as any).costOfGoodsSold
        : ((item as any).purchasePriceAtSale !== undefined
            ? (item as any).purchasePriceAtSale
            : (products.find(p => p.id === item.productId)?.purchasePrice ?? item.unitPrice * 0.6)) * item.quantity;
      costOfGoodsSold += itemCOGS;
    });

    const grossProfit = subtotal - costOfGoodsSold;
    return { subtotal, totalAmount, taxAmount, costOfGoodsSold, grossProfit };
  }
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  customerName?: string;
  amountPaid: number;
  previousDue: number;
  remainingDue: number;
  paymentDate: string;
  receiptNumber: string;
  receiptDate: string;
  receivedBy: string;
  referenceNumber?: string;
  chequeOrBankRef?: string;
  notes: string;
  status?: string;
  updatedAt?: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName?: string;
  amountPaid: number;
  previousDue: number;
  remainingDue: number;
  paymentDate: string;
  voucherNumber: string;
  paidBy: string;
  referenceNumber?: string;
  chequeOrBankRef?: string;
  notes: string;
  status?: string;
  updatedAt?: string;
}

export interface CashLedgerEntry {
  id: string;
  type: 'inflow' | 'outflow';
  source: 'sale' | 'purchase' | 'payment' | 'manual' | 'expense';
  amount: number;
  referenceId?: string;
  description: string;
  timestamp: string;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  category: string;
  vendor: string;
  description: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string;
  status: 'active' | 'void';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface Capital {
  id: string;
  amount: number;
  date: string;
  note?: string;
  createdBy: string;
}

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  subType?: string;
  parentAccount?: string;
  description?: string;
  normalBalance: 'Debit' | 'Credit';
  status: 'active' | 'inactive';
  isSystem: boolean;
  editable: boolean;
  systemRole?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerEntryLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  baseCurrencyDebit: number;
  baseCurrencyCredit: number;
}

export interface LedgerEntry {
  id: string;
  postingNumber: string;
  companyId: string;
  branchId: string;
  fiscalYear: number;
  accountingPeriod: string;
  sourceModule: 'SALES' | 'PROCUREMENT' | 'EXPENSE' | 'CUSTOMER_PAYMENT' | 'SUPPLIER_PAYMENT' | 'CAPITAL' | 'OPENING_BALANCE' | 'STOCK_ADJUSTMENT' | 'MANUAL_JOURNAL' | 'YEAR_CLOSING' | 'SYSTEM';
  postingStatus: 'POSTED' | 'REVERSED' | 'PENDING' | 'FAILED' | 'LOCKED';
  currency: string;
  exchangeRate: number;
  baseCurrencyCode: string;
  version: number;
  narration: string;
  createdFrom: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  postingDate: string;
  createdAt: string;
  createdBy: string;
  lines: LedgerEntryLine[];
  originalEntryId?: string;
}




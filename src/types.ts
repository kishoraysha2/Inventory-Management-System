export * from './types/barcodeIntegration';
export * from './types/barcodeProtocol';
export * from './types/barcodeTransport';
export * from './types/barcodeGateway';
export * from './types/barcodeExecution';
export * from './types/barcodeBridge';
export * from './types/barcodeConnectorHost';
export * from './types/barcodeLocalClient';
export * from './types/barcodeRuntime';

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

export type UnitCategory =
  | 'Packaging'
  | 'Quantity'
  | 'Weight'
  | 'Liquid'
  | 'Length'
  | 'Area'
  | 'Volume'
  | string;

export type UnitStatus = 'active' | 'inactive' | 'archived';

export interface UnitMaster {
  id: string;
  unitName: string;
  unitCode: string;
  symbol: string;
  category: UnitCategory;
  status: UnitStatus;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isSystem: boolean;
  isDefault?: boolean;
  sortOrder: number;
  allowDecimal: boolean;
  decimalPlaces: number;
  badgeColor?: string;
  icon?: string;
  translations?: {
    en?: string;
    ar?: string;
    bn?: string;
    [key: string]: string | undefined;
  };
}

export type Unit = UnitMaster;

export interface UnitConversion {
  id: string;
  productId: string;
  productName?: string;
  productSku?: string;
  baseUnitId: string;
  baseUnitCode: string;
  alternateUnitId: string;
  alternateUnitCode: string;
  conversionFactor: number; // 1 Alternate Unit = conversionFactor Base Units
  direction?: 'multiply' | 'divide';
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  isDefault?: boolean;
  isActive?: boolean;
  description?: string;
}


export interface Supplier {
  id: string;
  name: string;
  nameArabic?: string;
  contactPerson?: string;
  email?: string;
  phone: string;
  category?: string;
  address?: string;
  paymentType?: 'Cash' | 'Credit';
  dueBalance?: number;
  totalPurchase?: number;
  purchaseCount?: number;
  lastPurchaseDate?: string;
  supplierAdvance?: number;
  createdDate?: string;
  status?: 'active' | 'inactive';
  vatNumber?: string;
  updatedAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  nameArabic?: string;
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

export type BarcodeType =
  | 'CODE128'
  | 'EAN13'
  | 'EAN8'
  | 'UPCA'
  | 'UPCE'
  | 'QR_CODE'
  | 'DATA_MATRIX';

export type BarcodeStatus = 'generated' | 'assigned' | 'unassigned' | 'locked' | 'invalid';
export type BarcodeSource = 'manual' | 'auto_generated' | 'mz_suite' | 'imported';

export interface Product {
  id: string;
  name: string;
  nameArabic?: string;
  sku: string;
  category: string;
  brand?: string;
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
  unitId?: string;
  unitCode?: string;
  unitName?: string;
  // Enterprise Barcode Metadata (Sprint 6)
  barcode?: string;
  barcodeType?: BarcodeType;
  barcodeStatus?: BarcodeStatus;
  barcodeSource?: BarcodeSource;
  generatedAt?: string;
  generatedBy?: string;
  isBarcodeLocked?: boolean;
  barcodeVersion?: number;
}

export interface CustomerSnapshot {
  id: string;
  name: string;
  nameArabic?: string;
  phone: string;
  address: string;
  customerType: 'Cash' | 'Credit';
  vatNumber?: string;
  email?: string;
}

export interface SupplierSnapshot {
  id: string;
  name: string;
  nameArabic?: string;
  phone?: string;
  address?: string;
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
  companyNameArabic?: string;
  tradeNameArabic?: string;
}

export interface CompanyProfile {
  name?: string;
  companyName?: string;
  companyNameArabic?: string;
  tradeName?: string;
  tradeNameArabic?: string;
  taxRegistrationId?: string;
  phone?: string;
  email?: string;
  address?: string;
  [key: string]: any;
}

export interface ProductSnapshot {
  id: string;
  name: string;
  nameArabic?: string;
  sku: string;
  category: string;
  description?: string;
  unitId?: string;
  unitCode?: string;
  unitName?: string;
}

export interface LineItem {
  productId: string;
  productName: string;
  productNameArabic?: string;
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
  unitId?: string;
  unitCode?: string;
  unitName?: string;
  // Multi-Unit Conversion fields (Sprint 5)
  enteredQuantity?: number;
  enteredUnitCode?: string;
  baseQuantity?: number;
  baseUnitCode?: string;
  conversionFactor?: number;
  isAlternateUnit?: boolean;
}

export interface Sale {
  id: string;
  customerId: string;
  customerName: string;
  customerNameArabic?: string;
  companyNameArabic?: string;
  productId: string;
  productName: string;
  productNameArabic?: string;
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
  unitId?: string;
  unitCode?: string;
  unitName?: string;
  // Multi-Unit Conversion fields (Sprint 5)
  enteredQuantity?: number;
  enteredUnitCode?: string;
  baseQuantity?: number;
  baseUnitCode?: string;
  conversionFactor?: number;
  isAlternateUnit?: boolean;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierNameArabic?: string;
  companyNameArabic?: string;
  productId: string;
  productName: string;
  productNameArabic?: string;
  quantity: number;
  purchasePrice: number;
  subtotal?: number;
  taxAmount?: number;
  taxRatePercent?: number;
  totalAmount: number;
  paymentType: 'Cash' | 'Credit';
  purchaseDate: string;
  items?: LineItem[];
  status?: string;
  invoiceNumber?: string;
  vatAmount?: number;
  discountAmount?: number;
  unitId?: string;
  unitCode?: string;
  unitName?: string;
  supplierSnapshot?: SupplierSnapshot | any;
  productSnapshot?: ProductSnapshot | any;
  companySnapshot?: CompanySnapshot;
  // Multi-Unit Conversion fields (Sprint 5)
  enteredQuantity?: number;
  enteredUnitCode?: string;
  baseQuantity?: number;
  baseUnitCode?: string;
  conversionFactor?: number;
  isAlternateUnit?: boolean;
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
  const summary = items.reduce(
    (acc, item) => {
      const itemSubtotal = item.subtotal ?? ((item.quantity || 0) * (item.unitPrice || 0));
      const itemTax = item.taxAmount ?? ((itemSubtotal * (item.taxRatePercent ?? 0)) / 100);
      acc.subtotal += itemSubtotal;
      acc.taxAmount += itemTax;
      return acc;
    },
    { subtotal: 0, taxAmount: 0, totalAmount: 0 }
  );
  summary.totalAmount = summary.subtotal + summary.taxAmount;
  return summary;
}

export function getNormalizedItems(transaction: any): LineItem[] {
  if (transaction && Array.isArray(transaction.items) && transaction.items.length > 0) {
    return transaction.items.map((item: any) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unitPrice ?? item.sellingPrice ?? 0;
      const subtotal = item.subtotal ?? (quantity * unitPrice);
      const taxRatePercent = item.taxRatePercent ?? transaction.taxRatePercent ?? 0;
      const taxAmount = item.taxAmount ?? ((subtotal * taxRatePercent) / 100);
      const totalAmount = subtotal + taxAmount;
      return {
        ...item,
        quantity,
        unitPrice,
        subtotal,
        taxRatePercent,
        taxAmount,
        totalAmount
      };
    });
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

  const quantity = transaction.quantity !== undefined ? transaction.quantity : 0;
  const subtotal = transaction.subtotal !== undefined ? transaction.subtotal : (quantity * unitPrice);
  const taxRatePercent = transaction.taxRatePercent ?? 0;
  const taxAmount = transaction.taxAmount !== undefined ? transaction.taxAmount : ((subtotal * taxRatePercent) / 100);
  const totalAmount = subtotal + taxAmount;

  const productId = transaction.productId || '';
  const productName = transaction.productName || '';

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
  source: 'sale' | 'purchase' | 'procurement' | 'payment' | 'manual' | 'expense' | 'capital';
  amount: number;
  referenceId?: string | null;
  description: string;
  timestamp: string;
  status?: string;
  isReversal?: boolean;
  reversesCashEntryId?: string;
  postingStatus?: string;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  category: string;
  vendor: string;
  description: string;
  amount: number;
  subtotal?: number;
  taxAmount?: number;
  taxRatePercent?: number;
  vatAmount?: number;
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
  isVoided?: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  reversalEntryId?: string;
  isReversal?: boolean;
  reversesEntryId?: string;
  supplierId?: string;
  supplierName?: string;
  customerId?: string;
  customerName?: string;
  projectId?: string;
  costCenterId?: string;
  warehouseId?: string;
}




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
  createdDate?: string;
  status?: 'active' | 'inactive';
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

export interface LineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxRatePercent?: number;
  taxAmount?: number;
  totalAmount: number;
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
  notes: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName?: string;
  amountPaid: number;
  previousDue: number;
  remainingDue: number;
  paymentDate: string;
  notes: string;
}

export interface CashLedgerEntry {
  id: string;
  type: 'inflow' | 'outflow';
  source: 'sale' | 'purchase' | 'payment' | 'manual';
  amount: number;
  referenceId?: string;
  description: string;
  timestamp: string;
}

export interface Capital {
  id: string;
  amount: number;
  date: string;
  note?: string;
  createdBy: string;
}



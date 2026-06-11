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



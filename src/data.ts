import { ActivityLog, Supplier, Product } from './types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Pro Display XDR 32"',
    sku: 'DISP-XDR-001',
    category: 'Electronics',
    purchasePrice: 2999.00,
    sellingPrice: 4999.00,
    currentStock: 3,
    minimumStockAlert: 5,
    supplierName: 'Apple Wholesale Corp',
    supplierEmail: 'orders@applewholesale.com',
    location: 'Warehouse A - Shelf B2',
    description: '32-inch Retina 6K display with 1,000,000:1 contrast ratio, extreme dynamic range (XDR), and superwide viewing angle.',
    createdDate: '2026-05-30T14:22:00Z',
    status: 'active'
  },
  {
    id: 'prod-2',
    name: 'MacBook Pro 16" M3 Max',
    sku: 'LAP-MBP-163',
    category: 'Electronics',
    purchasePrice: 2199.00,
    sellingPrice: 3499.00,
    currentStock: 12,
    minimumStockAlert: 8,
    supplierName: 'Apple Wholesale Corp',
    supplierEmail: 'orders@applewholesale.com',
    location: 'Warehouse A - Shelf B1',
    description: '16-inch liquid retina XDR screen, 36GB unified memory, 1TB SSD, M3 Max 14-core CPU and 30-core GPU.',
    createdDate: '2026-05-31T09:15:00Z',
    status: 'active'
  },
  {
    id: 'prod-3',
    name: 'Ergonomic Aeron Chair',
    sku: 'OFF-AER-102',
    category: 'Office Supplies',
    purchasePrice: 750.00,
    sellingPrice: 1295.00,
    currentStock: 6,
    minimumStockAlert: 4,
    supplierName: 'Herman Miller Direct',
    supplierEmail: 'supply@hermanmiller.com',
    location: 'Warehouse B - Room 1',
    description: 'PostureFit SL lumbar support, fully adjustable armrests, Tilt Limiter mechanism with seat angle adjustment, Graphite finish.',
    createdDate: '2026-05-28T11:45:00Z',
    status: 'active'
  },
  {
    id: 'prod-4',
    name: 'Mechanical Keychron Q1 Keyboard',
    sku: 'ACC-KEY-Q01',
    category: 'Accessories',
    purchasePrice: 110.00,
    sellingPrice: 189.00,
    currentStock: 42,
    minimumStockAlert: 15,
    supplierName: 'Keychron Distribution',
    supplierEmail: 'sales@keychrondist.com',
    location: 'Warehouse A - Shelf C4',
    description: 'Fully customizable mechanical keyboard, 75% layout, hot-swappable switches, CNC aluminum body, double-gasket design.',
    createdDate: '2026-06-01T08:00:00Z',
    status: 'active'
  },
  {
    id: 'prod-5',
    name: 'Sony WH-1000XM5 Headphones',
    sku: 'ACC-XM5-105',
    category: 'Accessories',
    purchasePrice: 240.00,
    sellingPrice: 399.00,
    currentStock: 0,
    minimumStockAlert: 10,
    supplierName: 'Sony Electronics B2B',
    supplierEmail: 'business@sony-electronics.com',
    location: 'Warehouse A - Shelf C10',
    description: 'Industry-leading noise-canceling headphones with auto-NC optimizer, 8 mics, and precise voice pickup system.',
    createdDate: '2026-05-25T16:30:00Z',
    status: 'active'
  },
  {
    id: 'prod-6',
    name: 'Patagonia Torrentshell Jacket',
    sku: 'APP-PAT-TOR',
    category: 'Apparel',
    purchasePrice: 95.00,
    sellingPrice: 179.00,
    currentStock: 24,
    minimumStockAlert: 10,
    supplierName: 'Patagonia Outfit Co',
    supplierEmail: 'wholesale@patagonia.com',
    location: 'Warehouse C - Rack 3',
    description: 'Simple and unpretentious 3-layer waterproof/breathable H2No Performance Standard shell for high comfort and performance.',
    createdDate: '2026-05-29T10:05:00Z',
    status: 'active'
  },
  {
    id: 'prod-7',
    name: 'Yeti Rambler Tumbler 30oz',
    sku: 'HOM-YET-30Z',
    category: 'Home & Kitchen',
    purchasePrice: 18.00,
    sellingPrice: 38.00,
    currentStock: 85,
    minimumStockAlert: 20,
    supplierName: 'Yeti Authorized Wholesalers',
    supplierEmail: 'support@yetiwholesale.org',
    location: 'Warehouse B - Room 2',
    description: 'Double-wall vacuum insulted tumbler with MagSlider lid, durable Duracoat color, stainless steel premium body.',
    createdDate: '2026-06-01T06:45:00Z',
    status: 'active'
  },
  {
    id: 'prod-8',
    name: 'Hydro Flask 32oz Water Bottle',
    sku: 'SPO-HYD-32B',
    category: 'Sports & Outdoors',
    purchasePrice: 22.00,
    sellingPrice: 44.95,
    currentStock: 110,
    minimumStockAlert: 30,
    supplierName: 'Cascade Outdoors Ltd',
    supplierEmail: 'orders@cascadeoutdoors.ca',
    location: 'Warehouse B - Room 3',
    description: 'Wide mouth vacuum insulated stainless steel water bottle with leakproof straw lid and flex strap handle.',
    createdDate: '2026-05-27T13:10:00Z',
    status: 'active'
  }
];

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 's1',
    name: 'Apple Wholesale Corp',
    contactPerson: 'Sarah Jenkins',
    email: 'orders@applewholesale.com',
    phone: '+1 (800) 555-0199',
    category: 'Electronics',
  },
  {
    id: 's2',
    name: 'Herman Miller Direct',
    contactPerson: 'David Miller',
    email: 'supply@hermanmiller.com',
    phone: '+1 (800) 222-7744',
    category: 'Office Supplies',
  },
  {
    id: 's3',
    name: 'Keychron Distribution',
    contactPerson: 'Linus Chen',
    email: 'sales@keychrondist.com',
    phone: '+852 9876 5432',
    category: 'Accessories',
  },
  {
    id: 's4',
    name: 'Sony Electronics B2B',
    contactPerson: 'Kenji Sato',
    email: 'business@sony-electronics.com',
    phone: '+1 (888) 123-4567',
    category: 'Accessories',
  },
  {
    id: 's5',
    name: 'Patagonia Outfit Co',
    contactPerson: 'Elena Rostova',
    email: 'wholesale@patagonia.com',
    phone: '+1 (800) 654-3210',
    category: 'Apparel',
  }
];

export const INITIAL_LOGS: ActivityLog[] = [
  {
    id: 'l1',
    itemId: 'prod-4',
    itemName: 'Mechanical Keychron Q1 Keyboard',
    type: 'stock_change',
    description: 'Restocked 15 units of Keychron Q1 Keyboard',
    quantityDifference: 15,
    timestamp: '2026-06-01T08:00:00Z',
  },
  {
    id: 'l2',
    itemId: 'prod-5',
    itemName: 'Sony WH-1000XM5 Headphones',
    type: 'stock_change',
    description: 'Sold 10 units. Item stock is now zero.',
    quantityDifference: -10,
    timestamp: '2026-05-25T16:30:00Z',
  },
  {
    id: 'l3',
    itemId: 'prod-1',
    itemName: 'Pro Display XDR 32"',
    type: 'edit',
    description: 'Updated price from $4799 to $4999',
    timestamp: '2026-05-30T14:22:00Z',
  },
  {
    id: 'l4',
    itemId: 'prod-8',
    itemName: 'Hydro Flask 32oz Water Bottle',
    type: 'add',
    description: 'Added new item Hydro Flask 32oz Water Bottle to Sports & Outdoors',
    timestamp: '2026-05-27T13:10:00Z',
  }
];

export const INITIAL_CASH_LEDGER: any[] = [
  {
    id: 'cl-init-setup',
    type: 'outflow',
    source: 'manual',
    amount: 5000.00,
    description: 'Initial Office & Warehouse Setup Procurement',
    timestamp: '2026-05-02T00:00:00Z'
  }
];

export const INITIAL_CAPITAL: any[] = [
  {
    id: 'cap-init-seed',
    amount: 100000.00,
    date: '2026-05-01',
    note: 'Initial Seed Investment from Owner Equity',
    createdBy: 'admin_01'
  }
];

export const INITIAL_CHART_OF_ACCOUNTS: any[] = [
  {
    id: 'coa-1000',
    code: '1000',
    name: 'Assets',
    type: 'Asset',
    parentAccount: undefined,
    normalBalance: 'Debit',
    status: 'active',
    description: 'Economic resources owned or controlled by the enterprise.',
    isSystem: true,
    editable: false
  },
  {
    id: 'coa-1100',
    code: '1100',
    name: 'Cash in Hand',
    type: 'Asset',
    parentAccount: '1000',
    normalBalance: 'Debit',
    status: 'active',
    description: 'Physical cash held on company premises for transaction settlements.',
    isSystem: true,
    editable: false,
    systemRole: 'CASH'
  },
  {
    id: 'coa-1200',
    code: '1200',
    name: 'Accounts Receivable',
    type: 'Asset',
    parentAccount: '1000',
    normalBalance: 'Debit',
    status: 'active',
    description: 'Outstanding customer balances owed to the business for recorded credit sales.',
    isSystem: true,
    editable: false,
    systemRole: 'ACCOUNTS_RECEIVABLE'
  },
  {
    id: 'coa-1300',
    code: '1300',
    name: 'Inventory Asset',
    type: 'Asset',
    parentAccount: '1000',
    normalBalance: 'Debit',
    status: 'active',
    description: 'Value of physical stock on hand evaluated at average purchase cost.',
    isSystem: true,
    editable: false,
    systemRole: 'INVENTORY'
  },
  {
    id: 'coa-2000',
    code: '2000',
    name: 'Liabilities',
    type: 'Liability',
    parentAccount: undefined,
    normalBalance: 'Credit',
    status: 'active',
    description: 'Obligations arising from past transactions or events.',
    isSystem: true,
    editable: false
  },
  {
    id: 'coa-2100',
    code: '2100',
    name: 'Accounts Payable',
    type: 'Liability',
    parentAccount: '2000',
    normalBalance: 'Credit',
    status: 'active',
    description: 'Business obligations owed to trade suppliers for credit procurements.',
    isSystem: true,
    editable: false,
    systemRole: 'ACCOUNTS_PAYABLE'
  },
  {
    id: 'coa-2200',
    code: '2200',
    name: 'Customer Advance',
    type: 'Liability',
    parentAccount: '2000',
    normalBalance: 'Credit',
    status: 'active',
    description: 'Prepayments or advance deposits received from customers for pending deliveries.',
    isSystem: true,
    editable: false
  },
  {
    id: 'coa-2300',
    code: '2300',
    name: 'Supplier Advance',
    type: 'Liability',
    parentAccount: '2000',
    normalBalance: 'Credit',
    status: 'active',
    description: 'Advance payments made to vendors/suppliers for upcoming stock procurements.',
    isSystem: true,
    editable: false
  },
  {
    id: 'coa-3000',
    code: '3000',
    name: 'Equity',
    type: 'Equity',
    parentAccount: undefined,
    normalBalance: 'Credit',
    status: 'active',
    description: 'Residual interest in assets after deducting all liabilities.',
    isSystem: true,
    editable: false
  },
  {
    id: 'coa-3100',
    code: '3100',
    name: 'Owner Capital',
    type: 'Equity',
    parentAccount: '3000',
    normalBalance: 'Credit',
    status: 'active',
    description: 'Initial and subsequent investments made by company owners.',
    isSystem: true,
    editable: false,
    systemRole: 'OWNER_CAPITAL'
  },
  {
    id: 'coa-4000',
    code: '4000',
    name: 'Revenue',
    type: 'Revenue',
    parentAccount: undefined,
    normalBalance: 'Credit',
    status: 'active',
    description: 'Inflows of economic benefits from normal business operating activities.',
    isSystem: true,
    editable: false
  },
  {
    id: 'coa-4100',
    code: '4100',
    name: 'Sales Revenue',
    type: 'Revenue',
    parentAccount: '4000',
    normalBalance: 'Credit',
    status: 'active',
    description: 'Gross inflows of economic benefits from sales of goods.',
    isSystem: true,
    editable: false,
    systemRole: 'SALES_REVENUE'
  },
  {
    id: 'coa-5000',
    code: '5000',
    name: 'Cost of Sales',
    type: 'Expense',
    parentAccount: undefined,
    normalBalance: 'Debit',
    status: 'active',
    description: 'Direct expenditures incurred to generate sales revenue.',
    isSystem: true,
    editable: false
  },
  {
    id: 'coa-5100',
    code: '5100',
    name: 'Cost of Goods Sold',
    type: 'Expense',
    parentAccount: '5000',
    normalBalance: 'Debit',
    status: 'active',
    description: 'Direct cost attributable to inventory units sold to customers.',
    isSystem: true,
    editable: false,
    systemRole: 'COGS'
  },
  {
    id: 'coa-6000',
    code: '6000',
    name: 'Expenses',
    type: 'Expense',
    parentAccount: undefined,
    normalBalance: 'Debit',
    status: 'active',
    description: 'Outflows or consumption of assets in the course of operating activities.',
    isSystem: true,
    editable: false
  },
  {
    id: 'coa-6100',
    code: '6100',
    name: 'Operating Expenses',
    type: 'Expense',
    parentAccount: '6000',
    normalBalance: 'Debit',
    status: 'active',
    description: 'General expenditures incurred during regular business operations.',
    isSystem: true,
    editable: false
  }
];


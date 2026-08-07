import React from 'react';
import {
  LayoutDashboard,
  Box,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  ShoppingCart,
  Users,
  Truck,
  CreditCard,
  TrendingDown,
  BarChart3,
  Scale,
  BookOpen,
  Shield,
  Settings,
  UserCheck,
  DollarSign,
  Cpu,
  Store,
  Factory,
  PieChart,
  Workflow,
  FileText,
  Layers
} from 'lucide-react';

export type ERPModuleCategory =
  | 'Main'
  | 'Operations'
  | 'MasterData'
  | 'Finance'
  | 'Administration'
  | 'HR'
  | 'Payroll'
  | 'CRM'
  | 'POS'
  | 'Manufacturing'
  | 'Analytics'
  | 'Workflow'
  | 'DocumentManagement';

export interface ERPNavItem {
  id: string;             // Module ID
  routeKey: string;       // Route key used by App activeTab
  displayName: string;    // Label shown in Sidebar
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: string | ((permissions: any) => boolean);
  elementId?: string;     // Element ID for automated testing compatibility
  mobileElementId?: string;
  isBeta?: boolean;
  badge?: string;
}

export interface ERPSidebarGroup {
  id: ERPModuleCategory;
  label: string;
  description?: string;
  items: ERPNavItem[];
}

// --- ENTERPRISE SIDEBAR MODULE GROUPING ---
export const ERP_NAVIGATION_GROUPS: ERPSidebarGroup[] = [
  {
    id: 'Main',
    label: 'Overview',
    items: [
      {
        id: 'dashboard',
        routeKey: 'dashboard',
        displayName: 'Dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 'Operations',
    label: 'Operations',
    description: 'Inventory, Stock Movement & Commercial Trading',
    items: [
      {
        id: 'inventory',
        routeKey: 'inventory',
        displayName: 'Inventory Desk',
        icon: Box,
        requiredPermission: 'viewProducts',
      },
      {
        id: 'product_ledger',
        routeKey: 'product_ledger',
        displayName: 'Stock Card',
        icon: RefreshCw,
        requiredPermission: 'viewProducts',
      },
      {
        id: 'products',
        routeKey: 'products',
        displayName: 'Products',
        icon: ShoppingBag,
        requiredPermission: 'viewProducts',
      },
      {
        id: 'sales',
        routeKey: 'sales',
        displayName: 'Sales',
        icon: TrendingUp,
        requiredPermission: 'viewSales',
      },
      {
        id: 'purchases',
        routeKey: 'procurement',
        displayName: 'Purchases',
        icon: ShoppingCart,
        requiredPermission: 'viewProcurement',
      },
    ],
  },
  {
    id: 'MasterData',
    label: 'Master Data',
    description: 'Customer & Supplier Registry Management',
    items: [
      {
        id: 'customers',
        routeKey: 'customers',
        displayName: 'Customers',
        icon: Users,
        requiredPermission: 'viewCustomers',
      },
      {
        id: 'suppliers',
        routeKey: 'suppliers',
        displayName: 'Suppliers',
        icon: Truck,
        requiredPermission: 'viewSuppliers',
      },
      {
        id: 'units',
        routeKey: 'units',
        displayName: 'Unit Management',
        icon: Layers,
        requiredPermission: (p: any) => !!(p?.viewSettings || p?.viewProducts || p?.manageInventory),
        elementId: 'open-unit-management-tab',
        mobileElementId: 'open-mobile-unit-management-tab',
      },
    ],
  },
  {
    id: 'Finance',
    label: 'Finance & Accounting',
    description: 'General Ledger, Expenses & Financial Reporting',
    items: [
      {
        id: 'ledger',
        routeKey: 'ledger',
        displayName: 'Due Ledger',
        icon: CreditCard,
        requiredPermission: 'viewLedger',
      },
      {
        id: 'expenses',
        routeKey: 'expenses',
        displayName: 'Expenses',
        icon: TrendingDown,
        requiredPermission: 'viewExpenses',
      },
      {
        id: 'reports',
        routeKey: 'reports',
        displayName: 'Reports',
        icon: BarChart3,
        requiredPermission: 'viewFinancialReports',
      },
      {
        id: 'balancesheet',
        routeKey: 'balancesheet',
        displayName: 'Balance Sheet',
        icon: Scale,
        requiredPermission: 'viewFinancialReports',
      },
      {
        id: 'chart_of_accounts',
        routeKey: 'chart_of_accounts',
        displayName: 'Chart of Accounts',
        icon: BookOpen,
        requiredPermission: 'viewSettings',
      },
    ],
  },
  {
    id: 'Administration',
    label: 'Administration',
    description: 'User Access, Permissions & Corporate Config',
    items: [
      {
        id: 'users',
        routeKey: 'users',
        displayName: 'User Access',
        icon: Shield,
        requiredPermission: 'viewUsers',
        elementId: 'open-user-access-tab',
        mobileElementId: 'open-mobile-user-access-tab',
      },
      {
        id: 'company_settings',
        routeKey: 'company_settings',
        displayName: 'Company Settings',
        icon: Settings,
        requiredPermission: (p: any) => !!(p?.viewSettings || p?.voidPayment),
        elementId: 'open-company-settings-tab',
        mobileElementId: 'open-mobile-company-settings-tab',
      },
    ],
  },
];

// --- FUTURE-READY EXTENSIBILITY ARCHITECTURE SCHEMA ---
// This registry defines future modules so the sidebar architecture can scale seamlessly without layout redesign.
export const FUTURE_ENTERPRISE_MODULES: Record<ERPModuleCategory, { label: string; icon: React.ComponentType<{ className?: string }> }[]> = {
  HR: [
    { label: 'Employee Directory', icon: UserCheck },
    { label: 'Attendance & Leave', icon: UserCheck },
  ],
  Payroll: [
    { label: 'Salary Computation', icon: DollarSign },
    { label: 'Tax Statements', icon: DollarSign },
  ],
  CRM: [
    { label: 'Lead Management', icon: Cpu },
    { label: 'Opportunities', icon: Cpu },
  ],
  POS: [
    { label: 'Retail Terminal', icon: Store },
    { label: 'Shift Cash Desk', icon: Store },
  ],
  Manufacturing: [
    { label: 'Bill of Materials (BOM)', icon: Factory },
    { label: 'Work Orders', icon: Factory },
  ],
  Analytics: [
    { label: 'Business Intelligence', icon: PieChart },
  ],
  Workflow: [
    { label: 'Approval Chains', icon: Workflow },
  ],
  DocumentManagement: [
    { label: 'Digital Archiving', icon: FileText },
  ],
  Main: [],
  Operations: [],
  MasterData: [],
  Finance: [],
  Administration: []
};

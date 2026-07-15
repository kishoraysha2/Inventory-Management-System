import { useState, useEffect, useMemo } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs, writeBatch } from 'firebase/firestore';

// Target roles for the privilege-based security architecture
export type UserRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'accountant'
  | 'cashier'
  | 'salesman'
  | 'viewer';

// Master privilege registry schema grouping the ERP features by visual and action categories
export interface AppPermissions {
  // Category: Dashboard
  viewDashboard: boolean;
  viewDashboardStats: boolean;

  // Category: Inventory
  viewInventory: boolean;
  manageInventory: boolean;

  // Category: Customers
  viewCustomers: boolean;
  createCustomer: boolean;
  editCustomer: boolean;
  deleteCustomer: boolean;

  // Category: Suppliers
  viewSuppliers: boolean;
  createSupplier: boolean;
  editSupplier: boolean;
  deleteSupplier: boolean;

  // Category: Due Ledger
  viewLedger: boolean;
  createPayment: boolean;
  voidPayment: boolean;

  // Category: Products
  viewProducts: boolean;
  createProduct: boolean;
  editProduct: boolean;
  deleteProduct: boolean;
  viewProductCost: boolean;

  // Category: Sales
  viewSales: boolean;
  createSale: boolean;
  editSale: boolean;
  voidSale: boolean;

  // Category: Procurement
  viewProcurement: boolean;
  createProcurement: boolean;
  voidProcurement: boolean;

  // Category: Reports
  viewReports: boolean;
  viewFinancialReports: boolean;

  // Category: User Access
  viewUsers: boolean;
  manageUsers: boolean;
  assignRoles: boolean;

  // Category: System
  viewSettings: boolean;
  manageSettings: boolean;
  voidAny: boolean;

  // Category: Expenses
  viewExpenses: boolean;
  createExpense: boolean;
  editExpense: boolean;
  voidExpense: boolean;
}

// Default role templates mapping privileges to each of the 8 target roles
export const ROLE_PERMISSIONS_TEMPLATES: Record<UserRole, AppPermissions> = {
  owner: {
    viewDashboard: true,
    viewDashboardStats: true,
    viewInventory: true,
    manageInventory: true,
    viewCustomers: true,
    createCustomer: true,
    editCustomer: true,
    deleteCustomer: true,
    viewSuppliers: true,
    createSupplier: true,
    editSupplier: true,
    deleteSupplier: true,
    viewLedger: true,
    createPayment: true,
    voidPayment: true,
    viewProducts: true,
    createProduct: true,
    editProduct: true,
    deleteProduct: true,
    viewProductCost: true,
    viewSales: true,
    createSale: true,
    editSale: true,
    voidSale: true,
    viewProcurement: true,
    createProcurement: true,
    voidProcurement: true,
    viewReports: true,
    viewFinancialReports: true,
    viewUsers: true,
    manageUsers: true,
    assignRoles: true,
    viewSettings: true,
    manageSettings: true,
    voidAny: true,
    viewExpenses: true,
    createExpense: true,
    editExpense: true,
    voidExpense: true,
  },
  admin: {
    viewDashboard: true,
    viewDashboardStats: true,
    viewInventory: true,
    manageInventory: true,
    viewCustomers: true,
    createCustomer: true,
    editCustomer: true,
    deleteCustomer: true,
    viewSuppliers: true,
    createSupplier: true,
    editSupplier: true,
    deleteSupplier: true,
    viewLedger: true,
    createPayment: true,
    voidPayment: true,
    viewProducts: true,
    createProduct: true,
    editProduct: true,
    deleteProduct: true,
    viewProductCost: true,
    viewSales: true,
    createSale: true,
    editSale: true,
    voidSale: true,
    viewProcurement: true,
    createProcurement: true,
    voidProcurement: true,
    viewReports: true,
    viewFinancialReports: true,
    viewUsers: true,
    manageUsers: true,
    assignRoles: true,
    viewSettings: true,
    manageSettings: true,
    voidAny: true,
    viewExpenses: true,
    createExpense: true,
    editExpense: true,
    voidExpense: true,
  },
  manager: {
    viewDashboard: true,
    viewDashboardStats: true,
    viewInventory: true,
    manageInventory: true,
    viewCustomers: true,
    createCustomer: true,
    editCustomer: true,
    deleteCustomer: false,
    viewSuppliers: true,
    createSupplier: true,
    editSupplier: true,
    deleteSupplier: false,
    viewLedger: true,
    createPayment: true,
    voidPayment: false,
    viewProducts: true,
    createProduct: true,
    editProduct: true,
    deleteProduct: false,
    viewProductCost: true,
    viewSales: true,
    createSale: true,
    editSale: true,
    voidSale: false,
    viewProcurement: true,
    createProcurement: true,
    voidProcurement: false,
    viewReports: true,
    viewFinancialReports: true,
    viewUsers: false,
    manageUsers: false,
    assignRoles: false,
    viewSettings: true,
    manageSettings: false,
    voidAny: false,
    viewExpenses: true,
    createExpense: true,
    editExpense: true,
    voidExpense: false,
  },
  supervisor: {
    viewDashboard: true,
    viewDashboardStats: false,
    viewInventory: true,
    manageInventory: true,
    viewCustomers: true,
    createCustomer: true,
    editCustomer: true,
    deleteCustomer: false,
    viewSuppliers: true,
    createSupplier: false,
    editSupplier: false,
    deleteSupplier: false,
    viewLedger: false,
    createPayment: false,
    voidPayment: false,
    viewProducts: true,
    createProduct: true,
    editProduct: true,
    deleteProduct: false,
    viewProductCost: false,
    viewSales: true,
    createSale: false,
    editSale: false,
    voidSale: false,
    viewProcurement: false,
    createProcurement: false,
    voidProcurement: false,
    viewReports: true,
    viewFinancialReports: false,
    viewUsers: false,
    manageUsers: false,
    assignRoles: false,
    viewSettings: false,
    manageSettings: false,
    voidAny: false,
    viewExpenses: true,
    createExpense: false,
    editExpense: false,
    voidExpense: false,
  },
  accountant: {
    viewDashboard: true,
    viewDashboardStats: true,
    viewInventory: true,
    manageInventory: true,
    viewCustomers: true,
    createCustomer: true,
    editCustomer: true,
    deleteCustomer: false,
    viewSuppliers: true,
    createSupplier: true,
    editSupplier: true,
    deleteSupplier: false,
    viewLedger: true,
    createPayment: true,
    voidPayment: true,
    viewProducts: true,
    createProduct: true,
    editProduct: true,
    deleteProduct: false,
    viewProductCost: true,
    viewSales: true,
    createSale: false,
    editSale: false,
    voidSale: false,
    viewProcurement: true,
    createProcurement: true,
    voidProcurement: true,
    viewReports: true,
    viewFinancialReports: true,
    viewUsers: false,
    manageUsers: false,
    assignRoles: false,
    viewSettings: false,
    manageSettings: false,
    voidAny: false,
    viewExpenses: true,
    createExpense: true,
    editExpense: true,
    voidExpense: true,
  },
  cashier: {
    viewDashboard: true,
    viewDashboardStats: false,
    viewInventory: true,
    manageInventory: false,
    viewCustomers: true,
    createCustomer: true,
    editCustomer: false,
    deleteCustomer: false,
    viewSuppliers: false,
    createSupplier: false,
    editSupplier: false,
    deleteSupplier: false,
    viewLedger: true,
    createPayment: true,
    voidPayment: false,
    viewProducts: true,
    createProduct: false,
    editProduct: false,
    deleteProduct: false,
    viewProductCost: false,
    viewSales: true,
    createSale: true,
    editSale: false,
    voidSale: false,
    viewProcurement: false,
    createProcurement: false,
    voidProcurement: false,
    viewReports: false,
    viewFinancialReports: false,
    viewUsers: false,
    manageUsers: false,
    assignRoles: false,
    viewSettings: false,
    manageSettings: false,
    voidAny: false,
    viewExpenses: true,
    createExpense: true,
    editExpense: false,
    voidExpense: false,
  },
  salesman: {
    viewDashboard: true,
    viewDashboardStats: false,
    viewInventory: true,
    manageInventory: false,
    viewCustomers: true,
    createCustomer: true,
    editCustomer: false,
    deleteCustomer: false,
    viewSuppliers: false,
    createSupplier: false,
    editSupplier: false,
    deleteSupplier: false,
    viewLedger: false,
    createPayment: false,
    voidPayment: false,
    viewProducts: true,
    createProduct: false,
    editProduct: false,
    deleteProduct: false,
    viewProductCost: false,
    viewSales: true,
    createSale: true,
    editSale: false,
    voidSale: false,
    viewProcurement: false,
    createProcurement: false,
    voidProcurement: false,
    viewReports: false,
    viewFinancialReports: false,
    viewUsers: false,
    manageUsers: false,
    assignRoles: false,
    viewSettings: false,
    manageSettings: false,
    voidAny: false,
    viewExpenses: false,
    createExpense: false,
    editExpense: false,
    voidExpense: false,
  },
  viewer: {
    viewDashboard: true,
    viewDashboardStats: false,
    viewInventory: true,
    manageInventory: false,
    viewCustomers: true,
    createCustomer: false,
    editCustomer: false,
    deleteCustomer: false,
    viewSuppliers: true,
    createSupplier: false,
    editSupplier: false,
    deleteSupplier: false,
    viewLedger: false,
    createPayment: false,
    voidPayment: false,
    viewProducts: true,
    createProduct: false,
    editProduct: false,
    deleteProduct: false,
    viewProductCost: false,
    viewSales: true,
    createSale: false,
    editSale: false,
    voidSale: false,
    viewProcurement: false,
    createProcurement: false,
    voidProcurement: false,
    viewReports: false,
    viewFinancialReports: false,
    viewUsers: false,
    manageUsers: false,
    assignRoles: false,
    viewSettings: false,
    manageSettings: false,
    voidAny: false,
    viewExpenses: true,
    createExpense: false,
    editExpense: false,
    voidExpense: false,
  },
};

export interface UserProfileForPermission {
  role?: UserRole | string;
  [key: string]: any;
}

// Reusable helper method to seed Default Role templates if collection is empty
export async function seedRolePermissions() {
  try {
    const colRef = collection(db, 'rolePermissions');
    const snapshot = await getDocs(colRef);
    
    // Seed ONLY when rolePermissions collection is completely empty.
    if (!snapshot.empty) {
      console.log('rolePermissions collection is not empty. Skipping seeding to preserve all customized company permissions.');
      return;
    }

    const batch = writeBatch(db);

    for (const [role, templatePrivileges] of Object.entries(ROLE_PERMISSIONS_TEMPLATES)) {
      const userRole = role as UserRole;
      const docRef = doc(db, 'rolePermissions', userRole);

      batch.set(docRef, {
        role: userRole,
        privileges: templatePrivileges,
        ownerBaselinePrivileges: templatePrivileges,
        baselineUpdatedBy: 'system_auto_seed',
        baselineUpdatedTime: new Date().toISOString(),
        lastUpdatedBy: 'system_auto_seed',
        lastUpdatedTime: new Date().toISOString()
      });
    }

    await batch.commit();
    console.log('rolePermissions collection successfully seeded!');
  } catch (err) {
    console.error('Failed to auto-seed role permissions:', err);
  }
}

// Reusable helper to retrieve role permissions
export async function getRolePermissions(role: UserRole): Promise<AppPermissions> {
  try {
    const docRef = doc(db, 'rolePermissions', role);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.privileges) {
        return data.privileges as AppPermissions;
      }
    }
  } catch (error) {
    console.error(`Failed to get role permissions for "${role}" from Firestore:`, error);
  }
  return ROLE_PERMISSIONS_TEMPLATES[role];
}

// Reusable helper to save role permissions
export async function saveRolePermissions(role: UserRole, privileges: AppPermissions, lastUpdatedBy?: string): Promise<void> {
  const docRef = doc(db, 'rolePermissions', role);
  const data = {
    role,
    privileges,
    lastUpdatedBy: lastUpdatedBy || auth.currentUser?.email || 'authenticated_user',
    lastUpdatedTime: new Date().toISOString()
  };
  try {
    await setDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rolePermissions/${role}`);
  }
}

export function usePermission(profile: UserProfileForPermission | null | undefined) {
  const rawRole = profile?.role || 'viewer';

  // Support unknown or deprecated roles by falling back to 'viewer'
  const role = (ROLE_PERMISSIONS_TEMPLATES[rawRole as UserRole] ? rawRole : 'viewer') as UserRole;

  const [dbPrivileges, setDbPrivileges] = useState<AppPermissions | null>(null);

  useEffect(() => {
    if (!role) return;

    // Subscribe to changes in the rolePermissions document for the user's role
    const docRef = doc(db, 'rolePermissions', role);
    const unsubscribe = onSnapshot(docRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.privileges) {
            setDbPrivileges(data.privileges as AppPermissions);
          } else {
            setDbPrivileges(null);
          }
        } else {
          setDbPrivileges(null);
        }
      },
      (error) => {
        console.warn(`Firestore subscription failed for role "${role}", using fallback.`, error);
        setDbPrivileges(null);
      }
    );

    return () => unsubscribe();
  }, [role]);

  return useMemo(() => {
    const isOwner = role === 'owner';
    const isAdmin = role === 'admin' || isOwner;
    const isAccountant = role === 'accountant';
    const isCashier = role === 'cashier';
    const isViewer = role === 'viewer';
    const isManager = role === 'manager';
    const isSupervisor = role === 'supervisor';
    const isSalesman = role === 'salesman';

    // Fetch the detailed list of mapped privileges for this role
    // Fallback to local ROLE_PERMISSIONS_TEMPLATES if Firestore data is unavailable or not yet loaded
    // Merge template with loaded Firestore data to support newly added privileges backward-compatibly
    const activePermissions = dbPrivileges 
      ? { ...ROLE_PERMISSIONS_TEMPLATES[role], ...dbPrivileges }
      : ROLE_PERMISSIONS_TEMPLATES[role];

    return {
      // Legacy role and status primitives to guarantee 100% backward compatibility
      role,
      isAdmin,
      isAccountant,
      isCashier,
      isViewer,
      isOwner,
      isManager,
      isSupervisor,
      isSalesman,

      // UI/Feature Specific clearance compatibility mappings
      canViewInventory: true,
      canEditInventory: isAdmin || isAccountant,
      canEditProduct: isAdmin || isAccountant,
      canDeleteProduct: isAdmin,
      isReadOnly: isViewer,

      // Modern core privilege schema registry
      permissions: activePermissions,
    };
  }, [role, dbPrivileges]);
}


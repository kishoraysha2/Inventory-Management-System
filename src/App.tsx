import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Box,
  DollarSign,
  MapPin,
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Truck,
  ShoppingBag,
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  CreditCard,
  Scale,
  Menu,
  Lock,
  Mail,
  LogOut,
  Key,
  Shield,
  Crown,
  Loader2,
  Eye,
  EyeOff,
  UserPlus,
  Settings,
  RefreshCw,
  BookOpen
} from 'lucide-react';

import { Product, ActivityLog, Supplier, CashLedgerEntry, Capital, UnitMaster } from './types';
import { isInactiveStatus } from './lib/utils';
import { INITIAL_PRODUCTS, INITIAL_LOGS, INITIAL_SUPPLIERS, INITIAL_CASH_LEDGER, INITIAL_CAPITAL, INITIAL_CHART_OF_ACCOUNTS } from './data';
import { INITIAL_UNITS } from './data/defaultUnits';
import MetricCard from './components/MetricCard';
import ItemForm from './components/ItemForm';
import ActivityHistory from './components/ActivityHistory';
import SupplierContact from './components/SupplierContact';
import CustomerManagement from './components/CustomerManagement';
import SupplierManagement from './components/SupplierManagement';
import PaymentLedger from './components/PaymentLedger';
import ProductManagement from './components/ProductManagement';
import SalesManagement from './components/SalesManagement';
import ProcurementManagement from './components/ProcurementManagement';
import Dashboard from './components/Dashboard';
import ReportsPage from './components/ReportsPage';
import BalanceSheet from './components/BalanceSheet';
import ChartOfAccounts from './components/ChartOfAccounts';
import CompanySettings from './components/CompanySettings';
import PrivilegeMatrix from './components/PrivilegeMatrix';
import ExpenseManagement from './components/ExpenseManagement';
import ProductLedger from './components/ProductLedger';
import UnitManagement from './components/UnitManagement';
import SetupWizard from './components/SetupWizard';
import EnterpriseShell from './components/layout/EnterpriseShell';
import { runOpeningInventoryMigration } from './services/migration/openingInventoryMigration';
import { usePermission, AppPermissions, seedRolePermissions, UserRole } from './hooks/usePermission';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity } from './lib/firebase';
import { getVisibleModules } from './core/moduleRegistry';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, updateDoc, query, where, limit, getDocs } from 'firebase/firestore';
import { signOut, onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { setGlobalCompanyProfile, formatCurrency } from './utils/currencyFormatter';

export default function App() {
  // --- Core Persistent State ---
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('inventory_products');
    return saved ? JSON.parse(saved) : [];
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    const saved = localStorage.getItem('inventory_suppliers');
    return saved ? JSON.parse(saved) : [];
  });

  const [logs, setLogs] = useState<ActivityLog[]>(() => {
    const saved = localStorage.getItem('inventory_logs');
    return saved ? JSON.parse(saved) : [];
  });

  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>(() => {
    const saved = localStorage.getItem('inventory_cash_ledger');
    return saved ? JSON.parse(saved) : [];
  });

  const [capital, setCapital] = useState<Capital[]>(() => {
    const saved = localStorage.getItem('inventory_capital');
    return saved ? JSON.parse(saved) : [];
  });

  const [units, setUnits] = useState<UnitMaster[]>(() => {
    const saved = localStorage.getItem('nexus_units');
    return saved ? JSON.parse(saved) : INITIAL_UNITS;
  });

  // --- Search, Filter & Sort State ---
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [sortBy, setBy] = useState<'name' | 'sku' | 'price' | 'quantity' | 'lastUpdated'>('lastUpdated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // --- Modal / Active Interaction State ---
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'customers' | 'suppliers' | 'ledger' | 'products' | 'sales' | 'procurement' | 'reports' | 'balancesheet' | 'chart_of_accounts' | 'users' | 'company_settings' | 'expenses' | 'product_ledger' | 'units'>('dashboard');
  
  const isModuleAccessible = (modId: string) => {
    if (modId === 'expenses') return !!permissions.viewExpenses;
    if (modId === 'users') return !!permissions.viewUsers;
    if (modId === 'company_settings') return !!(permissions.viewSettings || permissions.voidPayment);
    if (modId === 'units') return !!(permissions.viewSettings || permissions.viewProducts || userRole === 'owner' || userRole === 'admin');
    return true;
  };
  const [userAccessTab, setUserAccessTab] = useState<'users' | 'matrix'>('users');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- Inventory Adjustment Modal State ---
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null);
  const [adjustmentDelta, setAdjustmentDelta] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Physical Count Correction');
  const [isAdjusting, setIsAdjusting] = useState<boolean>(false);

  // --- Core Authentication State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ role: UserRole; name: string; email: string } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isFirstInstallation, setIsFirstInstallation] = useState<boolean | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState<boolean>(false);
  const [isOwnerProfileMissing, setIsOwnerProfileMissing] = useState<boolean>(false);
  const [companyProfileState, setCompanyProfileState] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  // --- Auth View Controls ---
  const [authFeedback, setAuthFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // --- Email/Password Authentication States ---
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isAuthSubmitLoading, setIsAuthSubmitLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const permissionHook = usePermission(currentUserProfile);
  const userRole = permissionHook.role;
  const canEditInventory = permissionHook.canEditInventory;
  const permissions = {
    ...permissionHook,
    ...permissionHook.permissions
  };

  const checkAndLogLogin = async (uid: string, email: string, name: string, role: string) => {
    if (sessionStorage.getItem('just_logged_in') === 'true') {
      sessionStorage.removeItem('just_logged_in');
      const timestamp = new Date().toISOString();
      const details = [
        `User successfully established system session clearance.`,
        `- Action: User Login`,
        `- User ID: ${uid}`,
        `- User Name: ${name}`,
        `- User Email: ${email}`,
        `- User Role: ${role.toUpperCase()}`,
        `- Timestamp: ${timestamp}`
      ].join('\n');
      await logSystemActivity("User Login", details);
    }
  };

  // --- Listen to Programmatic Tab Switching Events ---
  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail);
      }
    };
    window.addEventListener('nexus-change-tab', handleTabChange);
    return () => window.removeEventListener('nexus-change-tab', handleTabChange);
  }, []);

  // --- Check first installation on load ---
  useEffect(() => {
    const checkFirstInstallation = async () => {
      try {
        const bootSnap = await getDoc(doc(db, 'system', 'bootstrap'));
        if (bootSnap.exists() && bootSnap.data()?.initialized === true) {
          setIsFirstInstallation(false);
        } else {
          setIsFirstInstallation(true);
        }
      } catch (err) {
        console.error("Failed to check system bootstrap status:", err);
        // Fallback: default to true if document doesn't exist, but if we got a permission/network error, default to false to not disrupt login
        setIsFirstInstallation(false);
      }
    };
    checkFirstInstallation();
  }, []);

  // --- Trigger Database Privilege Seeding ---
  useEffect(() => {
    if (currentUser && (userRole === 'admin' || userRole === 'owner')) {
      seedRolePermissions();
    }
  }, [currentUser, userRole]);

  // --- Trigger One-Time Opening Inventory Backfill Migration ---
  useEffect(() => {
    let isSubscribed = true;
    const triggerMigration = async () => {
      try {
        const report = await runOpeningInventoryMigration();
        // Silent backfill check completed
      } catch (err) {
        console.error("Opening Inventory Backfill Migration error:", err);
      }
    };
    triggerMigration();
    return () => { isSubscribed = false; };
  }, [currentUser]);

  // --- Observe Authentication State ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        if (user.isAnonymous) {
          const savedRole = localStorage.getItem('demo_user_role') || 'viewer';
          const name = savedRole === 'admin' ? 'Sandbox Admin' : 'Demo Guest';
          const email = savedRole === 'admin' ? 'admin@nexus-erp.com' : 'demo-guest@example.com';
          setCurrentUserProfile({
            role: savedRole as any,
            name,
            email
          });
          await checkAndLogLogin(user.uid, email, name, savedRole);
          setIsAuthChecked(true);
          return;
        }

        const userRef = doc(db, 'users', user.uid);
        try {
          const docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const role = data.role || 'viewer';
            const name = data.name || user.displayName || user.email?.split('@')[0] || 'User';
            const email = data.email || user.email || '';
            
            // Cache role in localStorage
            localStorage.setItem('nexus_role_' + user.uid, role);
            setIsOwnerProfileMissing(false);

            setCurrentUserProfile({
              role,
              name,
              email
            });
            await checkAndLogLogin(user.uid, email, name, role);
          } else {
            // Check if system is installed
            const bootSnap = await getDoc(doc(db, 'system', 'bootstrap'));
            const isInstalled = bootSnap.exists() && bootSnap.data()?.initialized === true;

            if (!isInstalled) {
              console.log("System not installed, letting SetupWizard handle owner creation.");
              setIsFirstInstallation(true);
              setIsAuthChecked(true);
              return;
            }

            // ENTERPRISE USER BOOTSTRAP FLOW
            // The document users/{currentUser.uid} does not exist. Provision it automatically.
            const cachedRole = localStorage.getItem('nexus_role_' + user.uid);
            let isOwnerEmail = false;
            try {
              const configSnap = await getDoc(doc(db, 'businessProfile', 'config'));
              if (configSnap.exists()) {
                const configData = configSnap.data();
                if (configData.email === user.email || configData.ownerEmail === user.email || configData.ownerName === user.displayName) {
                  isOwnerEmail = true;
                }
              }
            } catch (configErr) {
              console.error("Failed to fetch business config to check owner email status:", configErr);
            }

            const targetRole: UserRole = (cachedRole === 'owner' || isOwnerEmail) ? 'owner' : 'viewer';
            const nowIso = new Date().toISOString();
            const userName = user.displayName || user.email?.split('@')[0] || 'User';
            const userEmail = user.email || '';

            const userPayload = {
              uid: user.uid,
              name: userName,
              displayName: userName,
              email: userEmail,
              role: targetRole,
              status: 'active',
              createdAt: nowIso,
              updatedAt: nowIso
            };

            try {
              await setDoc(userRef, userPayload);
            } catch (provisionErr) {
              // Fallback to 'viewer' if owner self-creation is restricted by Firestore rules after bootstrap initialization
              if (targetRole !== 'viewer') {
                userPayload.role = 'viewer';
                await setDoc(userRef, userPayload);
              } else {
                throw provisionErr;
              }
            }

            // Reload user profile after successful provisioning
            const reSnap = await getDoc(userRef);
            const data = reSnap.exists() ? reSnap.data() : userPayload;
            const role = (data.role || 'viewer') as UserRole;
            const name = data.name || userName;
            const email = data.email || userEmail;

            localStorage.setItem('nexus_role_' + user.uid, role);
            setIsOwnerProfileMissing(false);

            setCurrentUserProfile({
              role,
              name,
              email
            });
            await checkAndLogLogin(user.uid, email, name, role);
          }
        } catch (err) {
          console.error("Failed to load or provision user profile document:", err);
          const cachedRole = localStorage.getItem('nexus_role_' + user.uid);
          const role = (cachedRole as UserRole) || 'viewer';
          const name = user.displayName || user.email?.split('@')[0] || 'User';
          const email = user.email || '';
          setCurrentUserProfile({
            role,
            name,
            email
          });
          await checkAndLogLogin(user.uid, email, name, role);
        }
      } else {
        setCurrentUserProfile(null);
        setIsOwnerProfileMissing(false);
      }
      setIsAuthChecked(true);
    });

    return () => unsubscribe();
  }, []);

  // --- Combined Loading State Resolver ---
  useEffect(() => {
    if (isFirstInstallation !== null && isAuthChecked) {
      setIsAuthLoading(false);
    }
  }, [isFirstInstallation, isAuthChecked]);

  const handleSetupComplete = async (user: User) => {
    setIsFirstInstallation(false);
    setIsAuthLoading(true);
    
    const userRef = doc(db, 'users', user.uid);
    try {
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const role = data.role || 'owner';
        const name = data.name || user.displayName || 'Owner';
        const email = data.email || user.email || '';
        setCurrentUserProfile({
          role,
          name,
          email
        });
        await checkAndLogLogin(user.uid, email, name, role);
      }
    } catch (err) {
      console.error("Error setting up user profile after wizard completion:", err);
    } finally {
      setIsAuthLoading(false);
    }
  };

  // --- Authentication Actions ---
  const handleEmailPasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFeedback(null);
    if (!authEmail.trim() || !authPassword) {
      setAuthFeedback({ message: 'Please enter both an email and a password.', type: 'error' });
      return;
    }

    setIsAuthSubmitLoading(true);
    try {
      sessionStorage.setItem('just_logged_in', 'true');
      if (isSignUpMode) {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        setFeedback({ message: 'Welcome! Your user profile has been created successfully.', type: 'success' });
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        setFeedback({ message: 'Access granted! Signed in successfully.', type: 'success' });
      }
    } catch (err: any) {
      sessionStorage.removeItem('just_logged_in');
      console.error("Email/Password Auth Exception:", err);
      let errMsg = 'An unexpected credential authentication issue has occurred.';
      const errorCode = err.code;
      
      if (errorCode === 'auth/invalid-email') {
        errMsg = 'Invalid email address. Please make sure the format is valid.';
      } else if (errorCode === 'auth/wrong-password') {
        errMsg = 'Wrong password. Please enter correct credentials and retry.';
      } else if (errorCode === 'auth/user-not-found') {
        errMsg = 'User not found. Please register an account first.';
      } else if (errorCode === 'auth/email-already-in-use') {
        errMsg = 'Email already exists. Please log in instead or use another address.';
      } else if (errorCode === 'auth/weak-password') {
        errMsg = 'Weak password. Password must contain at least 6 characters.';
      } else if (errorCode === 'auth/invalid-credential') {
        errMsg = 'Invalid email or password. Please verify your credentials and try again.';
      } else if (err.message) {
        errMsg = err.message;
      }
      setAuthFeedback({ message: errMsg, type: 'error' });
    } finally {
      setIsAuthSubmitLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthFeedback(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      sessionStorage.setItem('just_logged_in', 'true');
      await signInWithPopup(auth, provider);
      setFeedback({ message: 'Welcome! Signed in successfully with Google.', type: 'success' });
    } catch (err: any) {
      sessionStorage.removeItem('just_logged_in');
      console.error("Google Auth Exception:", err);
      let errMsg = err.message || 'An unexpected Google login error occurred.';
      if (err.code === 'auth/popup-closed-by-user') {
        errMsg = 'The login popup was closed before completion. If browser popup blocking is active inside the review frame, please click "Sandbox Admin" or "Guest Viewer" below.';
      } else if (err.code === 'auth/blocked-by-popup-triggerer') {
        errMsg = 'Popup was blocked by your browser. Please allow popups for this site or use our direct sandbox bypass buttons below.';
      }
      setAuthFeedback({ message: errMsg, type: 'error' });
    }
  };

  const handleAnonymousSignIn = async () => {
    setAuthFeedback(null);
    try {
      localStorage.setItem('demo_user_role', 'viewer');
      sessionStorage.setItem('just_logged_in', 'true');
      await signInAnonymously(auth);
      setFeedback({ message: 'Anonymous session established. Welcome Guest!', type: 'success' });
    } catch (err: any) {
      sessionStorage.removeItem('just_logged_in');
      console.error("Anonymous Auth Exception:", err);
      const uid = 'offline-guest-uid';
      const email = 'guest@example.com';
      const name = 'Guest Viewer';
      const role = 'viewer';
      const timestamp = new Date().toISOString();
      const details = [
        `Offline system session established.`,
        `- Action: User Login`,
        `- User ID: ${uid}`,
        `- User Name: ${name}`,
        `- User Email: ${email}`,
        `- User Role: ${role.toUpperCase()}`,
        `- Timestamp: ${timestamp}`
      ].join('\n');
      
      // Fallback to local state-only mock if completely offline or blocked
      setCurrentUser({
        uid: uid,
        email: email,
        displayName: name
      } as any);
      setCurrentUserProfile({
        role: role,
        name: name,
        email: email
      });
      await logSystemActivity("User Login", details);
      setFeedback({ message: 'Offline guest session established.', type: 'success' });
    }
  };

  const handleDemoAdminSignIn = async () => {
    setAuthFeedback(null);
    try {
      localStorage.setItem('demo_user_role', 'admin');
      sessionStorage.setItem('just_logged_in', 'true');
      await signInAnonymously(auth);
      setFeedback({ message: 'Sandbox Admin session established via secure gateway.', type: 'success' });
    } catch (err: any) {
      sessionStorage.removeItem('just_logged_in');
      console.error("Demo Admin Auth Exception:", err);
      const uid = 'offline-admin-uid';
      const email = 'admin@nexus-erp.com';
      const name = 'Sandbox Admin';
      const role = 'admin';
      const timestamp = new Date().toISOString();
      const details = [
        `Offline Sandbox Admin system session established.`,
        `- Action: User Login`,
        `- User ID: ${uid}`,
        `- User Name: ${name}`,
        `- User Email: ${email}`,
        `- User Role: ${role.toUpperCase()}`,
        `- Timestamp: ${timestamp}`
      ].join('\n');

      // Fallback to local state-only mock if completely offline or blocked
      setCurrentUser({
        uid: uid,
        email: email,
        displayName: name
      } as any);
      setCurrentUserProfile({
        role: role,
        name: name,
        email: email
      });
      await logSystemActivity("User Login", details);
      setFeedback({ message: 'Offline Sandbox Admin session established.', type: 'success' });
    }
  };

  const handleSignOut = async () => {
    try {
      if (currentUser) {
        const uid = currentUser.uid;
        const email = currentUser.email || '';
        const name = currentUserProfile?.name || currentUser.displayName || email.split('@')[0] || 'User';
        const role = currentUserProfile?.role || 'viewer';
        const timestamp = new Date().toISOString();

        const details = [
          `User successfully logged out of the system.`,
          `- Action: User Logout`,
          `- User ID: ${uid}`,
          `- User Name: ${name}`,
          `- User Email: ${email}`,
          `- User Role: ${role.toUpperCase()}`,
          `- Timestamp: ${timestamp}`
        ].join('\n');

        await logSystemActivity("User Logout", details);
      }
      await signOut(auth);
      setActiveTab('dashboard');
      setFeedback({ message: 'Logged out successfully.', type: 'success' });
    } catch (err: any) {
      console.error("Sign Out Error:", err);
    }
  };

  const handleUpdateUserRole = async (targetUid: string, targetEmail: string, newRole: UserRole) => {
    if (!permissions.manageUsers) {
      setFeedback({ message: 'Access Denied: Only system administrators can adjust security clearance.', type: 'error' });
      return;
    }

    try {
      const targetUser = usersList.find(u => u.uid === targetUid);
      const previousRole = (targetUser?.role || 'viewer') as UserRole;
      const targetName = targetUser?.name || 'Anonymous';
      const changedByUid = auth.currentUser?.uid || 'unknown-uid';
      const changedByUserName = currentUserProfile?.name || auth.currentUser?.displayName || auth.currentUser?.email || 'Anonymous Admin';
      const timestampString = new Date().toISOString();

      // Ensure a user cannot change their own role
      if (targetUid === auth.currentUser?.uid) {
        setFeedback({ message: 'Access Denied: Users are not authorized to modify their own security clearance or role.', type: 'error' });
        return;
      }

      // Enforce Owner Promotion rules: Only existing Owners may promote someone to Owner or modify an Owner
      if (userRole !== 'owner') {
        if (newRole === 'owner') {
          setFeedback({ message: 'Access Denied: Only an existing Owner may promote another user to Owner.', type: 'error' });
          return;
        }
        if (previousRole === 'owner') {
          setFeedback({ message: 'Access Denied: Only an existing Owner may modify or demote Owner profiles.', type: 'error' });
          return;
        }
      }

      // Admin Restrictions
      if (userRole === 'admin') {
        if (previousRole === 'owner' || newRole === 'owner') {
          setFeedback({ message: 'Access Denied: Administrators are not authorized to grant, demote, or modify Owner roles.', type: 'error' });
          return;
        }
      }

      // Count active Owners in the directory
      const activeOwners = usersList.filter(u => u.role === 'owner');
      const ownerCount = activeOwners.length;

      // Owner Limit Protection: Max 5 Owners
      if (newRole === 'owner' && previousRole !== 'owner') {
        if (ownerCount >= 5) {
          setFeedback({ message: 'Maximum Owner limit reached.', type: 'error' });
          return;
        }
      }

      // Last Owner Protection: Min 1 Owner
      if (previousRole === 'owner' && newRole !== 'owner') {
        if (ownerCount <= 1) {
          setFeedback({ message: 'Owner Lockout Protection: At least one Owner must remain registered at all times.', type: 'error' });
          return;
        }
      }

      // Confirmation Dialogs with clear consequences explanation
      if (newRole === 'owner') {
        const confirmed = window.confirm(
          `WARNING: PROMOTING TO OWNER STATUS\n\n` +
          `You are about to promote ${targetName} (${targetEmail}) to Owner.\n` +
          `This will grant them absolute system-wide permissions, including modifying other Owner profiles and company settings.\n\n` +
          `Are you sure you want to proceed?`
        );
        if (!confirmed) return;
      }

      if (previousRole === 'owner' && newRole !== 'owner') {
        const confirmed = window.confirm(
          `WARNING: DEMOTING OWNER STATUS\n\n` +
          `You are about to demote ${targetName} (${targetEmail}) to ${newRole.toUpperCase()}.\n` +
          `This will immediately revoke their absolute system control and remove their Owner clearances.\n\n` +
          `Are you sure you want to proceed?`
        );
        if (!confirmed) return;
      }

      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        role: newRole
      });

      const details = [
        `Role security clearance tier updated successfully.`,
        `- Action Type: Role Change`,
        `- Target User ID: ${targetUid}`,
        `- Target User Name: ${targetName}`,
        `- Previous Role: ${previousRole}`,
        `- New Role: ${newRole}`,
        `- Changed By User ID: ${changedByUid}`,
        `- Changed By User Name: ${changedByUserName}`,
        `- Timestamp: ${timestampString}`
      ].join('\n');

      await logSystemActivity("Role Change", details);

      setFeedback({ message: `Role for ${targetEmail} updated to ${newRole.toUpperCase()}.`, type: 'success' });
    } catch (err: any) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `users/${targetUid}`);
      } catch (firestoreErr: any) {
        setFeedback({ message: `Access Control Failure: ${firestoreErr.message}`, type: 'error' });
      }
    }
  };

  // --- Admin User Listing Sync ---
  useEffect(() => {
    if (!currentUser || !auth.currentUser || !permissions.viewUsers) {
      setUsersList([]);
      setUsersLoading(false);
      setUsersError(null);
      return;
    }

    setUsersLoading(true);
    setUsersError(null);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: any[] = [];
      const seenUids = new Set<string>();

      snapshot.forEach((docSnap) => {
        const uid = docSnap.id;
        if (!uid || seenUids.has(uid)) return; // Prevent duplicate rendering

        const data = docSnap.data();
        if (!data) return;

        const email = data.email || '';
        const role = data.role || '';
        const name = data.name || '';
        const createdAt = data.createdAt || '';

        // Profile Validation: Ignore completely invalid user documents
        if (!email || !email.includes('@')) {
          console.warn(`User Directory: Filtered out invalid profile with missing/invalid email for UID ${uid}`);
          return;
        }

        // Gracefully handle missing role, name, and timestamps
        const validatedRole = (role || 'viewer').toLowerCase();
        const validatedName = name || email.split('@')[0] || 'User';
        const validatedTimestamp = createdAt || new Date().toISOString();

        seenUids.add(uid);
        list.push({
          uid,
          name: validatedName,
          email: email,
          role: validatedRole,
          createdAt: validatedTimestamp,
          phone: data.phone || ''
        });
      });

      setUsersList(list);
      setUsersError(null);
      setUsersLoading(false);
    }, (error) => {
      console.error("Users Sync Error", error);
      setUsersError("Failed to synchronize user list. This typically indicates insufficient credentials or permission policies under your current clearance level.");
      setUsersLoading(false);
    });

    return () => unsubUsers();
  }, [currentUser, userRole, permissions?.viewUsers]);

  // --- Units Collection Sync ---
  useEffect(() => {
    if (!currentUser || !auth.currentUser) {
      return;
    }

    const unsubUnits = onSnapshot(
      collection(db, 'units'),
      (snapshot) => {
        if (!snapshot.empty) {
          const loadedUnits = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as UnitMaster[];
          setUnits(loadedUnits);
          localStorage.setItem('nexus_units', JSON.stringify(loadedUnits));
        } else {
          setUnits(INITIAL_UNITS);
          localStorage.setItem('nexus_units', JSON.stringify(INITIAL_UNITS));
        }
      },
      (error) => {
        console.warn('Units Sync Warning:', error);
      }
    );

    return () => unsubUnits();
  }, [currentUser]);

  // --- Reference Nodes ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    if (!currentUser || !auth.currentUser) return;

    // 1. Products Sync
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsList: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Product;
        productsList.push({
          ...data,
          id: data.id || docSnap.id
        });
      });
      
      setProducts(productsList);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'products');
      } catch (err: any) {
        setFeedback({ message: `Firestore Read Error: ${err.message}`, type: 'error' });
      }
    });

    // 2. Suppliers Sync
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const suppliersList: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        suppliersList.push(docSnap.data() as Supplier);
      });
      
      setSuppliers(suppliersList);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (err: any) {
        console.error("Suppliers Sync Error", err);
      }
    });

    // 3. Logs Sync
    const unsubLogs = onSnapshot(collection(db, 'logs'), (snapshot) => {
      const logsList: ActivityLog[] = [];
      snapshot.forEach((docSnap) => {
        logsList.push(docSnap.data() as ActivityLog);
      });
      
      const sorted = logsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(sorted);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'logs');
      } catch (err: any) {
        console.error("Logs Sync Error", err);
      }
    });

    // 4. Cash Ledger Sync
    const unsubCashLedger = onSnapshot(collection(db, 'cashLedger'), (snapshot) => {
       const ledgerList: CashLedgerEntry[] = [];
       snapshot.forEach((docSnap) => {
         ledgerList.push(docSnap.data() as CashLedgerEntry);
       });
       
       const sorted = ledgerList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
       setCashLedger(sorted);
     }, (error) => {
       try {
         handleFirestoreError(error, OperationType.LIST, 'cashLedger');
       } catch (err: any) {
         console.error("Cash Ledger Sync Error", err);
       }
     });

    // 5. Capital Sync
    const unsubCapital = onSnapshot(collection(db, 'capital'), (snapshot) => {
       const capitalList: Capital[] = [];
       snapshot.forEach((docSnap) => {
         capitalList.push(docSnap.data() as Capital);
       });
       
       const sorted = capitalList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
       setCapital(sorted);
     }, (error) => {
       try {
         handleFirestoreError(error, OperationType.LIST, 'capital');
       } catch (err: any) {
         console.error("Capital Sync Error", err);
       }
     });

    // 6. Company Settings Sync
    const unsubCompanyProfile = onSnapshot(doc(db, 'businessProfile', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGlobalCompanyProfile(data);
        setCompanyProfileState(data);
      }
    }, (error) => {
      console.error("Company Settings Sync Error", error);
    });

    return () => {
      unsubProducts();
      unsubSuppliers();
      unsubLogs();
      unsubCashLedger();
      unsubCapital();
      unsubCompanyProfile();
    };
  }, [currentUser]);

  // --- Task 2: Safe Idempotent Backward-Compatibility Migration ---
  useEffect(() => {
    if (!currentUser || !auth.currentUser) return;
    if (userRole !== 'admin' && userRole !== 'accountant' && userRole !== 'owner') return;
    if (products.length === 0) return;

    const performProductMigration = async () => {
      const alreadyRun = sessionStorage.getItem('nexus_products_migrated_v1');
      if (alreadyRun === 'true') return;

      let migratedCount = 0;
      for (const product of products) {
        if (product.minimumStockAlert === undefined) {
          try {
            const productRef = doc(db, 'products', product.id);
            await updateDoc(productRef, {
              minimumStockAlert: 0
            });
            migratedCount++;
          } catch (err) {
            console.error(`[Schema Migration] Failed to migrate product ${product.id}:`, err);
          }
        }
      }

      sessionStorage.setItem('nexus_products_migrated_v1', 'true');
      if (migratedCount > 0) {
        console.log(`[Schema Migration] Idempotent product schema migration completed. Migrated ${migratedCount} products to include minimumStockAlert: 0.`);
      }
    };

    performProductMigration();
  }, [currentUser, products, userRole]);

  // --- Task 3: Safe Idempotent Chart of Accounts Bootstrapping ---
  useEffect(() => {
    if (!currentUser || !auth.currentUser) return;

    const bootstrapChartOfAccounts = async () => {
      const alreadyRun = sessionStorage.getItem('nexus_coa_bootstrapped_v1');
      if (alreadyRun === 'true') return;

      try {
        const coaSnap = await getDocs(collection(db, 'chartOfAccounts'));
        const existingIds = coaSnap.docs.map(doc => doc.id);
        const existingCodes = coaSnap.docs.map(doc => doc.data().code);

        let createdCount = 0;

        // 1. Seed standard accounts from INITIAL_CHART_OF_ACCOUNTS
        for (const account of INITIAL_CHART_OF_ACCOUNTS) {
          if (!existingIds.includes(account.id) && !existingCodes.includes(account.code)) {
            await setDoc(doc(db, 'chartOfAccounts', account.id), {
              ...account,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            createdCount++;
            existingIds.push(account.id);
            existingCodes.push(account.code);
          }
        }

        // 2. Seed Input VAT (1400) if missing
        if (!existingIds.includes('coa-1400') && !existingCodes.includes('1400')) {
          await setDoc(doc(db, 'chartOfAccounts', 'coa-1400'), {
            id: 'coa-1400',
            code: '1400',
            name: 'Input VAT Receivable',
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
          createdCount++;
        }

        // 3. Seed Output VAT (2400) if missing
        if (!existingIds.includes('coa-2400') && !existingCodes.includes('2400')) {
          await setDoc(doc(db, 'chartOfAccounts', 'coa-2400'), {
            id: 'coa-2400',
            code: '2400',
            name: 'Output VAT Payable',
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
          createdCount++;
        }

        sessionStorage.setItem('nexus_coa_bootstrapped_v1', 'true');
        if (createdCount > 0) {
          console.log(`[Bootstrap] Idempotent Chart of Accounts bootstrapping completed. Created ${createdCount} missing system accounts.`);
        }
      } catch (err) {
        console.error("[Bootstrap] Failed to bootstrap Chart of Accounts:", err);
      }
    };

    bootstrapChartOfAccounts();
  }, [currentUser]);

  // --- Autosave to LocalStorage for offline resilience ---
  useEffect(() => {
    localStorage.setItem('inventory_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('inventory_suppliers', JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    localStorage.setItem('inventory_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('inventory_cash_ledger', JSON.stringify(cashLedger));
  }, [cashLedger]);

  useEffect(() => {
    localStorage.setItem('inventory_capital', JSON.stringify(capital));
  }, [capital]);

  // --- Feedback timer ---
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // --- Derived Categories ---
  const categories: string[] = ['All', ...Array.from(new Set(products.filter(p => !isInactiveStatus(p.status)).map((p) => p.category))).map(String)];

  // --- Global Metrics ---
  const totalProducts = products.filter(p => !isInactiveStatus(p.status)).length;
  const totalStockQuantity = products.filter(p => !isInactiveStatus(p.status)).reduce((acc, p) => acc + p.currentStock, 0);
  const totalValuation = products.filter(p => !isInactiveStatus(p.status)).reduce((acc, p) => acc + p.sellingPrice * p.currentStock, 0);
  const lowStockItemsCount = products.filter((p) => !isInactiveStatus(p.status) && p.currentStock <= p.minimumStockAlert).length;

  const lowStockList = products.filter((p) => !isInactiveStatus(p.status) && p.currentStock <= p.minimumStockAlert);

  // --- Quick Stock Increments ---
  const handleQuickQuantityAdjust = (productId: string, delta: number) => {
    if (!permissions.canEditInventory) {
      setFeedback({ message: 'Access denied: You do not have permission to adjust inventory levels.', type: 'error' });
      return;
    }
    const productToUpdate = products.find((p) => p.id === productId);
    if (!productToUpdate) return;

    const newQty = productToUpdate.currentStock + delta;
    if (newQty < 0) {
      setFeedback({ message: `Cannot decrease stock level below 0 for ${productToUpdate.name}.`, type: 'error' });
      return;
    }

    setAdjustmentProduct(productToUpdate);
    setAdjustmentDelta(delta);
    setAdjustmentReason('Physical Count Correction');
  };

  const handleConfirmAdjustment = async () => {
    if (!adjustmentProduct) return;
    setIsAdjusting(true);

    const productId = adjustmentProduct.id;
    const delta = adjustmentDelta;

    const productToUpdate = products.find((p) => p.id === productId);
    if (!productToUpdate) {
      setAdjustmentProduct(null);
      setIsAdjusting(false);
      return;
    }

    const newQty = productToUpdate.currentStock + delta;
    if (newQty < 0) {
      setFeedback({ message: `Cannot decrease stock level below 0 for ${productToUpdate.name}.`, type: 'error' });
      setAdjustmentProduct(null);
      setIsAdjusting(false);
      return;
    }

    const timestamp = new Date().toISOString();
    const updatedProduct: Product = {
      ...productToUpdate,
      currentStock: newQty,
    };

    // Log activity including selected reason
    const logEntry: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      itemId: productToUpdate.id,
      itemName: productToUpdate.name,
      type: 'stock_change',
      description: `Adjusted quantity from ${productToUpdate.currentStock} to ${newQty} (${delta > 0 ? '+' : ''}${delta}) - Reason: ${adjustmentReason}`,
      quantityDifference: delta,
      timestamp,
      reason: adjustmentReason,
    };

    try {
      await setDoc(doc(db, 'products', updatedProduct.id), updatedProduct);
      await setDoc(doc(db, 'logs', logEntry.id), logEntry);
      await logSystemActivity(
        "Stock updated",
        `Adjusted stock level for item "${productToUpdate.name}" (SKU: ${productToUpdate.sku}) from ${productToUpdate.currentStock} to ${newQty} (${delta > 0 ? '+' : ''}${delta}) - Reason: ${adjustmentReason}`
      );
      setFeedback({ message: `Inventory Adjustment completed: ${productToUpdate.name} is now at ${newQty} units.`, type: 'success' });
    } catch (e) {
      try {
        handleFirestoreError(e, OperationType.WRITE, `products/${productId}`);
      } catch (err: any) {
        setFeedback({ message: `Firestore Write Error: ${err.message}`, type: 'error' });
      }
    } finally {
      setIsAdjusting(false);
      setAdjustmentProduct(null);
    }
  };

  // --- Create or Update Dispatch ---
  const handleSaveItem = async (formData: Omit<Product, 'id' | 'createdDate'> & { id?: string }) => {
    const timestamp = new Date().toISOString();

    const targetSku = formData.sku.trim().toUpperCase();
    const isSkuDuplicate = products.some(p => p.id !== formData.id && p.sku.trim().toUpperCase() === targetSku);
    if (isSkuDuplicate) {
      setFeedback({ message: 'SKU already exists. SKU must be unique.', type: 'error' });
      return;
    }

    if (formData.id) {
      // Edit mode
      if (!permissions.canEditProduct) {
        setFeedback({ message: 'Access denied: You do not have permission to edit products.', type: 'error' });
        return;
      }
      const existingProduct = products.find((p) => p.id === formData.id);
      if (!existingProduct) return;

      const originalQty = existingProduct.currentStock;
      const updatedQty = formData.currentStock;
      let logMsg = `Modified fields for ${formData.name}`;

      if (originalQty !== updatedQty) {
        logMsg = `Adjusted Quantity from ${originalQty} to ${updatedQty} during property update.`;
      }

      const updatedProduct: Product = {
        ...existingProduct,
        ...formData,
        id: formData.id,
      };

      const logEntry: ActivityLog = {
        id: `log-edit-${Date.now()}`,
        itemId: updatedProduct.id,
        itemName: updatedProduct.name,
        type: originalQty !== updatedQty ? 'stock_change' : 'edit',
        description: logMsg,
        quantityDifference: originalQty !== updatedQty ? updatedQty - originalQty : undefined,
        timestamp,
      };

      try {
        await setDoc(doc(db, 'products', updatedProduct.id), updatedProduct);
        await setDoc(doc(db, 'logs', logEntry.id), logEntry);
        await logSystemActivity(
          "Product edited",
          `Edited details for inventory product: "${updatedProduct.name}" (SKU: ${updatedProduct.sku}). Stock level: ${updatedProduct.currentStock} units.`
        );
        if (originalQty !== updatedQty) {
          await logSystemActivity(
            "Stock updated",
            `Adjusted stock level for product "${updatedProduct.name}" from ${originalQty} to ${updatedQty} during details edit.`
          );
        }
        setFeedback({ message: `${formData.name} updated successfully.`, type: 'success' });
      } catch (e) {
        try {
          handleFirestoreError(e, OperationType.WRITE, `products/${formData.id}`);
        } catch (err: any) {
          setFeedback({ message: `Firestore Error: ${err.message}`, type: 'error' });
        }
      }
    } else {
      // Add mode
      if (!permissions.canEditProduct) {
        setFeedback({ message: 'Access denied: You do not have permission to catalog new products.', type: 'error' });
        return;
      }
      const newProductId = `prod-${Date.now()}`;
      const newProduct: Product = {
        ...formData,
        id: newProductId,
        name: formData.name,
        nameArabic: formData.nameArabic || '',
        sku: formData.sku,
        category: formData.category,
        sellingPrice: formData.sellingPrice,
        purchasePrice: formData.purchasePrice,
        currentStock: formData.currentStock,
        minimumStockAlert: formData.minimumStockAlert,
        supplierName: formData.supplierName,
        supplierEmail: formData.supplierEmail,
        location: formData.location,
        description: formData.description,
        createdDate: timestamp,
        status: 'active',
      };

      const logEntry: ActivityLog = {
        id: `log-add-${Date.now()}`,
        itemId: newProduct.id,
        itemName: newProduct.name,
        type: 'add',
        description: `Catalogs new product: ${newProduct.name} (SKU: ${newProduct.sku})`,
        timestamp,
      };

      try {
        await setDoc(doc(db, 'products', newProduct.id), newProduct);
        await setDoc(doc(db, 'logs', logEntry.id), logEntry);
        await logSystemActivity(
          "Product added",
          `Added new inventory product: "${newProduct.name}" (SKU: ${newProduct.sku}, Price: $${newProduct.sellingPrice}, Initial Stock: ${newProduct.currentStock} units)`
        );
        setFeedback({ message: `${newProduct.name} successfully catalogs.`, type: 'success' });
      } catch (e) {
        try {
          handleFirestoreError(e, OperationType.WRITE, `products/${newProduct.id}`);
        } catch (err: any) {
          setFeedback({ message: `Firestore Error: ${err.message}`, type: 'error' });
        }
      }
    }
  };

  // --- Deletion Flow ---
  const handleDeleteItem = async (itemId: string) => {
    if (!permissions.canDeleteProduct) {
      setFeedback({ message: 'Access denied: You do not have permission to delete products.', type: 'error' });
      return;
    }
    const productToDelete = products.find((p) => p.id === itemId);
    if (!productToDelete) return;

    if (confirm(`Are you absolutely sure you want to remove ${productToDelete.name} from inventory records?`)) {
      const logEntry: ActivityLog = {
        id: `log-del-${Date.now()}`,
        itemId: productToDelete.id,
        itemName: productToDelete.name,
        type: 'delete',
        description: `Removed product records (SKU: ${productToDelete.sku})`,
        timestamp: new Date().toISOString(),
      };

      try {
        await deleteDoc(doc(db, 'products', itemId));
        await setDoc(doc(db, 'logs', logEntry.id), logEntry);
        setFeedback({ message: `${productToDelete.name} removed from registry.`, type: 'success' });
      } catch (e) {
        try {
          handleFirestoreError(e, OperationType.WRITE, `products/${itemId}`);
        } catch (err: any) {
          setFeedback({ message: `Firestore Error: ${err.message}`, type: 'error' });
        }
      }
    }
  };

  // --- Filter and Sort Core Execution ---
  const filteredItems = products
    .filter((item) => {
      // Exclude soft-deleted/inactive items from standard inventory workspace
      if (isInactiveStatus(item.status)) return false;

      const query = search.toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        (item.location || '').toLowerCase().includes(query) ||
        (item.supplierName || '').toLowerCase().includes(query) ||
        (item.barcode || '').toLowerCase().includes(query);

      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;

      let matchesStatus = true;
      if (stockFilter === 'in_stock') {
        matchesStatus = item.currentStock > item.minimumStockAlert;
      } else if (stockFilter === 'low_stock') {
        matchesStatus = item.currentStock > 0 && item.currentStock <= item.minimumStockAlert;
      } else if (stockFilter === 'out_of_stock') {
        matchesStatus = item.currentStock === 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    })
    .sort((a, b) => {
      const keyA = sortBy === 'price' ? 'sellingPrice' : sortBy === 'quantity' ? 'currentStock' : sortBy === 'lastUpdated' ? 'createdDate' : sortBy;
      const keyB = sortBy === 'price' ? 'sellingPrice' : sortBy === 'quantity' ? 'currentStock' : sortBy === 'lastUpdated' ? 'createdDate' : sortBy;
      
      let valA = (a as any)[keyA] ?? '';
      let valB = (b as any)[keyB] ?? '';

      if (typeof valA === 'string') {
        valA = (valA as string).toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSortSelection = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setBy(field);
      setSortOrder('desc');
    }
  };

  // --- Reset Entire Local Database ---
  const handleResetDemoData = async () => {
    if (confirm('This action resets current stock and logs to the original initial setup. Proceed?')) {
      try {
        // Overwrite and clear documents
        for (const product of products) {
          try {
            await deleteDoc(doc(db, 'products', product.id));
          } catch (err) {}
        }
        for (const supplier of suppliers) {
          try {
            await deleteDoc(doc(db, 'suppliers', supplier.id));
          } catch (err) {}
        }
        for (const log of logs) {
          try {
            await deleteDoc(doc(db, 'logs', log.id));
          } catch (err) {}
        }
        for (const entry of cashLedger) {
          try {
            await deleteDoc(doc(db, 'cashLedger', entry.id));
          } catch (err) {}
        }
        for (const capItem of capital) {
          try {
            await deleteDoc(doc(db, 'capital', capItem.id));
          } catch (err) {}
        }

        // Write initial defaults to Firestore
        for (const product of INITIAL_PRODUCTS) {
          await setDoc(doc(db, 'products', product.id), product);
        }
        for (const supplier of INITIAL_SUPPLIERS) {
          await setDoc(doc(db, 'suppliers', supplier.id), supplier);
        }
        for (const log of INITIAL_LOGS) {
          await setDoc(doc(db, 'logs', log.id), log);
        }
        for (const entry of INITIAL_CASH_LEDGER) {
          await setDoc(doc(db, 'cashLedger', entry.id), entry);
        }
        for (const capItem of INITIAL_CAPITAL) {
          await setDoc(doc(db, 'capital', capItem.id), capItem);
        }

        localStorage.clear();
        setFeedback({ message: 'Database reset to default template products.', type: 'success' });
      } catch (e) {
        try {
          handleFirestoreError(e, OperationType.WRITE, 'reset');
        } catch (err: any) {
          setFeedback({ message: `Reset Failed: ${err.message}`, type: 'error' });
        }
      }
    }
  };

  // --- Securely Clear Audit Logs ---
  const handleClearLogs = async () => {
    if (confirm('Clear all system audit logs?')) {
      try {
        for (const log of logs) {
          await deleteDoc(doc(db, 'logs', log.id));
        }
        setFeedback({ message: 'Cleared system audit logs.', type: 'success' });
      } catch (e) {
        setFeedback({ message: 'Failed to clear logs on Firestore database.', type: 'error' });
      }
    }
  };

  // --- JSON Data Export ---
  const handleExportJSON = () => {
    try {
      const dataStr = JSON.stringify(
        {
          products,
          suppliers,
          logs,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      );
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `inventory-records-${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      setFeedback({ message: 'Backup JSON generated and downloaded.', type: 'success' });
    } catch {
      setFeedback({ message: 'Failed to generate backup JSON.', type: 'error' });
    }
  };

  // --- JSON Data Import ---
  const processImportText = async (text: string) => {
    if (!permissions.isAdmin) {
      setFeedback({ message: 'Access denied: Only administrators are permitted to override/import database records.', type: 'error' });
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const importedProducts = parsed.products || parsed.items;
      if (importedProducts && Array.isArray(importedProducts)) {
        // Map products (robust against legacy property names as well)
        const productsList: Product[] = importedProducts.map((p: any) => {
          return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            category: p.category,
            sellingPrice: p.sellingPrice ?? p.price ?? 0,
            purchasePrice: p.purchasePrice ?? (p.price ? p.price * 0.6 : 0),
            currentStock: p.currentStock ?? p.quantity ?? 0,
            minimumStockAlert: p.minimumStockAlert ?? p.minQuantity ?? 0,
            supplierName: p.supplierName ?? 'N/A',
            supplierEmail: p.supplierEmail ?? 'N/A',
            location: p.location ?? 'Unassigned',
            description: p.description ?? '',
            createdDate: p.createdDate ?? p.lastUpdated ?? p.createdAt ?? new Date().toISOString(),
            status: p.status ?? 'active',
          };
        });
        
        // Write all loaded products to Firestore
        for (const prod of productsList) {
          await setDoc(doc(db, 'products', prod.id), prod);
        }

        if (parsed.suppliers && Array.isArray(parsed.suppliers)) {
          for (const supplier of parsed.suppliers) {
            await setDoc(doc(db, 'suppliers', supplier.id), supplier);
          }
        }

        const logEntry: ActivityLog = {
          id: `log-import-${Date.now()}`,
          itemName: 'Bulk Database Import',
          itemId: 'system',
          type: 'add',
          description: `Loaded ${productsList.length} products from JSON file.`,
          timestamp: new Date().toISOString(),
        };

        await setDoc(doc(db, 'logs', logEntry.id), logEntry);
        setFeedback({ message: `Successfully loaded ${productsList.length} products.`, type: 'success' });
        setShowImport(false);
      } else {
        setFeedback({ message: 'Invalid file format. Missing "products" or "items" array structure.', type: 'error' });
      }
    } catch (e: any) {
      setFeedback({ message: `Parsing failed or Firestore writing failed: ${e.message || e}`, type: 'error' });
    }
  };

  // File picker handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const txt = event.target?.result as string;
      processImportText(txt);
    };
    reader.readAsText(file);
  };

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setFeedback({ message: 'Only standard JSON array backups are supported.', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const txt = event.target?.result as string;
      processImportText(txt);
    };
    reader.readAsText(file);
  };

  // --- UI Color Helpers ---
  const getBadgeColors = (qty: number, min: number) => {
    if (qty === 0) {
      return 'bg-rose-50 text-rose-700 border-rose-100';
    }
    if (qty <= min) {
      return 'bg-amber-50 text-amber-700 border-amber-100';
    }
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  };

  const getBadgeValue = (qty: number, min: number) => {
    if (qty === 0) return 'Out of Stock';
    if (qty <= min) return 'Low Stock';
    return 'In Stock';
  };

  if (isAuthLoading) {
    return (
      <div id="auth-loading-screen" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl animate-bounce shrink-0">
            <Box className="h-8 w-8" />
          </div>
          <h2 className="font-sans text-lg font-black tracking-widest text-slate-950 uppercase mt-4">NEXUS ERP SYSTEMS</h2>
          <div className="flex items-center gap-2 mt-2">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
            <span className="font-mono text-xs text-slate-400 font-bold uppercase tracking-wider">Verifying Cryptosync...</span>
          </div>
        </div>
      </div>
    );
  }

  if (isFirstInstallation === true) {
    return (
      <SetupWizard 
        db={db} 
        auth={auth} 
        onComplete={handleSetupComplete} 
      />
    );
  }

  if (isOwnerProfileMissing) {
    return (
      <div id="owner-profile-missing-screen" className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6 lg:p-8 text-white">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 sm:p-12 shadow-2xl space-y-8 text-center animate-fade-in">
          <div className="w-16 h-16 bg-rose-950 border border-rose-500 rounded-3xl flex items-center justify-center text-rose-500 shadow-md mx-auto animate-pulse">
            <Shield className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="font-sans text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
              Profile Missing
            </h1>
            <p className="text-[10px] text-rose-400 font-extrabold uppercase tracking-widest">
              Owner Profile Protection Active
            </p>
          </div>
          <div className="text-slate-300 text-xs px-2 leading-relaxed space-y-3">
            <p>
              Your authenticated session is active, but your corresponding Firestore Owner user profile document could not be located.
            </p>
            <p className="font-semibold text-rose-300">
              To preserve system integrity, your permissions have NOT been automatically downgraded to Viewer.
            </p>
            <p className="text-[11px] text-slate-400 bg-slate-850 p-4 rounded-2xl border border-slate-800">
              Please contact an active Owner to restore or recreate your profile, or sign out below.
            </p>
          </div>
          <button
            id="owner-recovery-signout"
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-750 text-white px-5 py-3 text-xs font-bold transition border border-slate-700 cursor-pointer"
          >
            Sign Out of Workstation
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div id="unauthenticated-gate" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-[2.5rem] p-8 sm:p-10 shadow-xl space-y-6">
          
          {/* Logo Heading */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md mx-auto animate-pulse">
              <Box className="h-6 w-6" />
            </div>
            <h1 className="font-sans text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-none pt-2 uppercase">
              NEXUS ERP SUITE
            </h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-none">
              Secured Identity Ingress
            </p>
          </div>

          <div className="text-center text-slate-500 text-xs px-2 leading-relaxed">
            Welcome to the Nexus Enterprise Resource Planning Suite. Please log in with your credentials or register a new profile below to establish your secure workstation session.
          </div>

          {/* Feedback message */}
          {authFeedback && (
            <div id="auth-status-container" className="p-4 rounded-2xl border text-xs font-medium flex flex-col gap-2 bg-rose-50 border-rose-100 text-rose-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>{authFeedback.message}</span>
              </div>
            </div>
          )}

          {/* Email/Password Auth Form */}
          <form onSubmit={handleEmailPasswordAuth} id="auth-email-password-form" className="space-y-4">
            <div>
              <label htmlFor="auth-email-input" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4.5 w-4.5" />
                </div>
                <input
                  id="auth-email-input"
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm placeholder-slate-400 bg-slate-50 focus:bg-white text-slate-900 outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password-input" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Key className="h-4.5 w-4.5" />
                </div>
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm placeholder-slate-400 bg-slate-50 focus:bg-white text-slate-900 outline-none"
                />
                <button
                  type="button"
                  id="auth-toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              {/* Primary Submit Button */}
              <button
                id="auth-submit-btn"
                type="submit"
                disabled={isAuthSubmitLoading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3.5 text-xs sm:text-sm font-bold transition shadow-xs hover:shadow-md cursor-pointer transition-all duration-200 disabled:opacity-50"
              >
                {isAuthSubmitLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>{isSignUpMode ? 'Create Corporate Account' : 'Sign In to Workstation'}</span>
                )}
              </button>

              {/* Toggle Link to switch modes without submitting */}
              <div className="text-center pt-1">
                <button
                  id="auth-mode-toggle-btn"
                  type="button"
                  onClick={() => {
                    setIsSignUpMode(!isSignUpMode);
                    setAuthFeedback(null);
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                >
                  {isSignUpMode 
                    ? "Already have an account? Sign In" 
                    : "Don't have a secure workstation account? Register here"}
                </button>
              </div>
            </div>
          </form>

          {/* Fallback Google Authentication option */}
          <div id="google-sso-bypass" className="pt-2 flex flex-col gap-2.5">
            <div className="relative flex py-1 items-center font-sans">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-white px-2">or single sign-on</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              id="auth-google-login"
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-3.5 text-sm font-bold transition shadow-xs cursor-pointer transition-all duration-200"
            >
              <svg className="w-5 h-5 shrink-0 bg-white p-0.5 rounded-full" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M23.04 12.261c0-.83-.074-1.63-.213-2.4H12v4.542h6.19c-.267 1.396-1.054 2.58-2.234 3.367v2.798h3.61c2.112-1.942 3.473-4.802 3.473-8.307z" fill="#4285F4" />
                <path fillRule="evenodd" clipRule="evenodd" d="M12 23.5c3.105 0 5.71-1.028 7.61-2.798l-3.61-2.798c-1.002.67-2.285 1.07-4 1.07-3.078 0-5.684-2.079-6.613-4.882H1.677v2.89C3.582 20.899 7.551 23.5 12 23.5z" fill="#34A853" />
                <path fillRule="evenodd" clipRule="evenodd" d="M5.387 14.092a6.901 6.901 0 010-4.184V7.018H1.677a11.968 11.968 0 000 9.964l3.71-2.89z" fill="#FBBC05" />
                <path fillRule="evenodd" clipRule="evenodd" d="M12 4.07c1.69 0 3.204.58 4.398 1.716l3.297-3.297C17.705 1.058 15.1 0 12 0 7.551 0 3.582 2.6 1.677 6.61L5.387 9.5a6.93 6.93 0 016.613-5.43z" fill="#EA4335" />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>

          {/* Quick Demo Sandbox Access */}
          <div id="sandbox-direct-access" className="pt-1 flex flex-col gap-2.5">
            <div className="relative flex py-1 items-center font-sans">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-white px-2">or quick sandbox access</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                id="auth-sandbox-admin-btn"
                type="button"
                onClick={handleDemoAdminSignIn}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 text-xs font-bold transition cursor-pointer shadow-xs"
              >
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span>Sandbox Admin</span>
              </button>

              <button
                id="auth-anonymous-guest-btn"
                type="button"
                onClick={handleAnonymousSignIn}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-3 text-xs font-bold transition cursor-pointer shadow-xs"
              >
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Guest Viewer</span>
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <p className="text-[11px] text-slate-500 leading-normal flex gap-2">
              <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Authorized workstation administrators can authenticate using Google Single Sign-On or verified email credentials to gain secure clearance levels.
              </span>
            </p>
          </div>

        </div>
      </div>
    );
  }

  return (
    <EnterpriseShell
      currentUser={currentUser}
      currentUserProfile={currentUserProfile}
      userRole={userRole}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onSignOut={handleSignOut}
      permissions={permissions}
      isModuleAccessible={isModuleAccessible}
      onOpenForm={() => {
        setProductToEdit(null);
        setIsFormOpen(true);
      }}
      onResetDemoData={handleResetDemoData}
      onExportJSON={handleExportJSON}
      onToggleImport={() => setShowImport((prev) => !prev)}
      showImport={showImport}
    >

      {/* FEEDBACK STATUS BANNER */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            id="feedback-popup-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`rounded-2xl border p-4 text-xs font-medium flex items-center justify-between shadow-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : 'bg-rose-50 border-rose-100 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600" />
              )}
              <span>{backupFeedbackMessage(feedback.message)}</span>
            </div>
            <button
              id="close-feedback-button"
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAG AND DROP COLLAPSIBLE PANELS SECTION */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            id="upload-dropzone-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed p-8 text-center transition cursor-pointer flex flex-col items-center justify-center ${
                dragActive
                  ? 'border-slate-800 bg-slate-50/80'
                  : 'border-slate-200 bg-white hover:bg-slate-50/45'
              }`}
            >
              <Upload className={`h-8 w-8 mb-3 ${dragActive ? 'text-slate-800' : 'text-slate-400'}`} />
              <p className="font-sans text-xs font-bold text-slate-700">
                Drag and drop your JSON backup file here, or click to browse
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Supports standard formats generated by the export facility
              </p>
              <input
                id="file-import-hidden-input"
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'dashboard' ? (
        <Dashboard userRole={userRole} permissions={permissions} />
      ) : activeTab === 'inventory' ? (
        <>
          {/* METRICS BENTO GRID */}
          <div id="metrics-bento-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Consolidated Portfolio Value"
              value={formatCurrency(totalValuation)}
              icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
              subtext="Net stock asset valuation face"
              trend="Real-Time"
              trendType="neutral"
              colorClass="border-emerald-100 bg-emerald-50/10"
            />
            <MetricCard
              title="Cataloged Stock Level"
              value={totalStockQuantity.toLocaleString('en-US')}
              icon={<Box className="h-5 w-5 text-indigo-600" />}
              subtext="Total items actively in bins"
              trend={`${totalProducts} Products`}
              trendType="neutral"
              colorClass="border-indigo-100 bg-indigo-50/10"
            />
            <MetricCard
              title="Procurement Alerts"
              value={lowStockItemsCount}
              icon={<AlertCircle className="h-5 w-5 text-rose-600" />}
              subtext="Products below safe limits"
              trend={lowStockItemsCount > 0 ? 'Critical' : 'All Clear'}
              trendType={lowStockItemsCount > 0 ? 'negative' : 'positive'}
              colorClass={lowStockItemsCount > 0 ? 'border-rose-100 bg-rose-50/25' : 'border-slate-100'}
            />
            <MetricCard
              title="Dynamic Categories"
              value={categories.length - 1}
              icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
              subtext="Catalog departments tracked"
              trend="Organized"
              trendType="neutral"
              colorClass="border-slate-100"
            />
          </div>

          {/* MAIN DESK GRID */}
          <div id="main-working-grid" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* LEFT COMPONENT: Search, Filters & Data Table */}
            <div id="table-working-desk" className="lg:col-span-2 space-y-6">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
                {/* Filter controls row */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-sans text-sm font-bold tracking-tight text-slate-800">
                      Active Asset Registry
                    </h3>
                    <p className="text-xs text-slate-400">Search, adjust, and audit product status parameters</p>
                  </div>

                  {/* Mini filters summary display */}
                  <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1 self-start">
                    Showing {filteredItems.length} of {totalProducts} Cataloged
                  </span>
                </div>

                {/* Searching Filters Center */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  {/* Search text filter */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="table-search-input"
                      type="text"
                      placeholder="Query product name, SKU, or storage location..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 outline-none text-xs transition focus:border-slate-400 bg-slate-50/50"
                    />
                    {search && (
                      <button
                        id="clear-search-button"
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category filter */}
                  <div className="min-w-[140px]">
                    <div className="relative">
                      <select
                        id="table-category-select-filter"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-slate-200 text-xs px-3.5 py-2.5 outline-none bg-slate-50/50 font-semibold text-slate-600 transition focus:border-slate-400 pr-8"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat === 'All' ? 'All Categories' : cat}
                          </option>
                        ))}
                      </select>
                      <Filter className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Status Alert Filter */}
                  <div className="min-w-[140px]">
                    <select
                      id="table-stock-status-select-filter"
                      value={stockFilter}
                      onChange={(e) => setStockFilter(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 text-xs px-3.5 py-2.5 outline-none bg-slate-50/50 font-semibold text-slate-600 transition focus:border-slate-400"
                    >
                      <option value="all">All Stock Status</option>
                      <option value="in_stock">In Stock (Safe)</option>
                      <option value="low_stock">Low Stock Alerts</option>
                      <option value="out_of_stock">Out of Stock</option>
                    </select>
                  </div>
                </div>

                {/* Live Inventory Data Grid */}
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table id="inventory-data-grid" className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/40 text-slate-400 select-none">
                        <th
                          id="header-name"
                          onClick={() => handleSortSelection('name')}
                          className="cursor-pointer p-4 font-bold tracking-wider uppercase text-[10px] hover:text-slate-700 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>Product</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </th>
                        <th
                          id="header-category"
                          className="p-4 font-bold tracking-wider uppercase text-[10px]"
                        >
                          Category
                        </th>
                        <th
                          id="header-price"
                          onClick={() => handleSortSelection('price')}
                          className="cursor-pointer p-4 font-bold tracking-wider uppercase text-[10px] hover:text-slate-700 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>Unit Price</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </th>
                        <th
                          id="header-quantity"
                          onClick={() => handleSortSelection('quantity')}
                          className="cursor-pointer p-4 font-bold tracking-wider uppercase text-[10px] hover:text-slate-700 transition text-center"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Level</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </th>
                        <th id="header-status" className="p-4 font-bold tracking-wider uppercase text-[10px] text-center">
                          Status
                        </th>
                        <th id="header-actions" className="p-4 font-bold tracking-wider uppercase text-[10px] text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredItems.length === 0 ? (
                        <tr id="empty-table-row">
                          <td colSpan={6} className="p-10 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center">
                              <AlertCircle className="h-8 w-8 text-slate-200 mb-2" />
                              <p className="font-semibold text-slate-500 text-xs">No cataloged products match searches</p>
                              <p className="text-[10px] text-slate-350 mt-1">Try widening your active filter queries</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => (
                          <tr
                            id={`inventory-row-${item.id}`}
                            key={item.id}
                            className="group hover:bg-slate-55/15 hover:bg-slate-50/30 transition-colors"
                          >
                            {/* Name & SKU & Storage location */}
                            <td className="p-4 max-w-[200px]">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-slate-800 text-xs truncate group-hover:text-slate-900 leading-tight">
                                    {item.name}
                                  </p>
                                  {item.initialStock !== undefined && item.initialStock > 0 && (
                                    <span className="inline-flex items-center rounded bg-emerald-50 border border-emerald-200 px-1 py-0.25 text-[8px] font-extrabold uppercase tracking-wider text-emerald-700 shadow-3xs">
                                      Opening Stock
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-mono text-[9px] text-slate-400 font-bold bg-slate-50 border border-slate-100 rounded px-1 tracking-wider uppercase">
                                    {item.sku}
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400">
                                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                                    {item.location || 'Unassigned'}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Category */}
                            <td className="p-4 text-slate-500 font-medium">
                              {item.category}
                            </td>

                            {/* Price */}
                            <td className="p-4 font-mono text-slate-700 font-bold">
                              ${item.sellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Live Quantity Adjuster */}
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  id={`adjust-minus-${item.id}`}
                                  type="button"
                                  onClick={() => handleQuickQuantityAdjust(item.id, -1)}
                                  disabled={!canEditInventory}
                                  className={`rounded-lg border border-slate-200 bg-white p-1 text-slate-500 transition shadow-2xs ${
                                    !canEditInventory ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50 hover:text-slate-800'
                                  }`}
                                  title={!canEditInventory ? 'You do not have permission to adjust stock levels' : undefined}
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <span className="inline-block w-8 font-mono text-xs font-bold text-slate-800">
                                  {item.currentStock}
                                </span>
                                <button
                                  id={`adjust-plus-${item.id}`}
                                  type="button"
                                  onClick={() => handleQuickQuantityAdjust(item.id, 1)}
                                  disabled={!canEditInventory}
                                  className={`rounded-lg border border-slate-200 bg-white p-1 text-slate-500 transition shadow-2xs ${
                                    !canEditInventory ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50 hover:text-slate-800'
                                  }`}
                                  title={!canEditInventory ? 'You do not have permission to adjust stock levels' : undefined}
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>

                            {/* Status badge */}
                            <td className="p-4 text-center">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${getBadgeColors(
                                  item.currentStock,
                                  item.minimumStockAlert
                                )}`}
                              >
                                <span className="mr-1 h-1 w-1 rounded-full bg-current" />
                                {getBadgeValue(item.currentStock, item.minimumStockAlert)}
                              </span>
                            </td>

                            {/* Row quick action buttons */}
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                <button
                                  id={`action-edit-${item.id}`}
                                  type="button"
                                  onClick={() => {
                                    setProductToEdit(item);
                                    setIsFormOpen(true);
                                  }}
                                  disabled={!permissions.canEditProduct}
                                  title={!permissions.canEditProduct ? 'You do not have permission to edit products' : 'Edit item parameters'}
                                  className={`rounded-lg border border-slate-200 bg-white p-1.5 transition shadow-2xs ${
                                    !permissions.canEditProduct
                                      ? 'opacity-40 cursor-not-allowed text-slate-300'
                                      : 'text-slate-400 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-100'
                                  }`}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  id={`action-delete-${item.id}`}
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id)}
                                  disabled={!permissions.canDeleteProduct}
                                  title={!permissions.canDeleteProduct ? 'You do not have permission to delete products' : 'Delete product catalog'}
                                  className={`rounded-lg border border-slate-200 bg-white p-1.5 transition shadow-2xs ${
                                    !permissions.canDeleteProduct
                                      ? 'opacity-40 cursor-not-allowed text-slate-300'
                                      : 'text-slate-400 hover:bg-slate-50 hover:text-rose-600 hover:border-rose-100'
                                  }`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT MODULE: Sub components (Suppliers and History) */}
            <div id="widgets-working-desk" className="space-y-6">
              {/* Supplier Directory desk */}
              <SupplierContact suppliers={suppliers} lowStockItems={lowStockList} />

              {/* Audit Trail list */}
              <ActivityHistory logs={logs} onClear={handleClearLogs} />
            </div>
          </div>
        </>
      ) : activeTab === 'customers' ? (
        <SafeTabWrapper tab="customers" userRole={userRole} permissions={permissions}>
          <CustomerManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'suppliers' ? (
        <SafeTabWrapper tab="suppliers" userRole={userRole} permissions={permissions}>
          <SupplierManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'ledger' ? (
        <SafeTabWrapper tab="ledger" userRole={userRole} permissions={permissions}>
          <PaymentLedger userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'products' ? (
        <SafeTabWrapper tab="products" userRole={userRole} permissions={permissions}>
          <ProductManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'sales' ? (
        <SafeTabWrapper tab="sales" userRole={userRole} permissions={permissions}>
          <SalesManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'procurement' ? (
        <SafeTabWrapper tab="procurement" userRole={userRole} permissions={permissions}>
          <ProcurementManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'balancesheet' ? (
        <SafeTabWrapper tab="balancesheet" userRole={userRole} permissions={permissions}>
          <BalanceSheet />
        </SafeTabWrapper>
      ) : activeTab === 'users' ? (
        <SafeTabWrapper tab="users" userRole={userRole} permissions={permissions}>
          <div className="space-y-6">
            
            {/* Sub-tab selection menu for Users Directory vs Role Matrix */}
            <div id="user-access-sub-tabs" className="flex border-b border-slate-200 text-xs max-w-sm select-none gap-2">
              <button
                id="user-subtab-directory"
                type="button"
                onClick={() => setUserAccessTab('users')}
                className={`py-2.5 px-4 font-bold font-sans text-center border-b-2 transition-all cursor-pointer ${
                  userAccessTab === 'users'
                    ? 'border-indigo-600 text-indigo-700 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                👥 Users Directory
              </button>
              <button
                id="user-subtab-matrix"
                type="button"
                onClick={() => setUserAccessTab('matrix')}
                className={`py-2.5 px-4 font-bold font-sans text-center border-b-2 transition-all cursor-pointer ${
                  userAccessTab === 'matrix'
                    ? 'border-indigo-600 text-indigo-700 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                🔐 Privilege Matrix
              </button>
            </div>

            {userAccessTab === 'users' ? (
              /* USER MANAGEMENT ADMIN PANEL */
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
                <div>
                  <h3 className="font-sans text-base font-bold tracking-tight text-slate-800 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-indigo-600" />
                    <span>Enterprise User Access Directory</span>
                  </h3>
                  <p className="text-xs text-slate-400">Manage corporate identities, assign roles, and audit security clearance tiers in Firestore</p>
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table id="user-directory-grid" className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/40 text-slate-400 select-none">
                        <th className="p-4 font-bold tracking-wider uppercase text-[10px]">User Profile</th>
                        <th className="p-4 font-bold tracking-wider uppercase text-[10px]">Security UID Identifier</th>
                        <th className="p-4 font-bold tracking-wider uppercase text-[10px]">Created Date</th>
                        <th className="p-4 font-bold tracking-wider uppercase text-[10px] text-center">Clearance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {usersLoading ? (
                        <tr>
                          <td colSpan={4} className="p-10 text-center text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-2" />
                            <span>Querying Firestore user list...</span>
                          </td>
                        </tr>
                      ) : usersError ? (
                        <tr>
                          <td colSpan={4} className="p-10 text-center bg-rose-50/50 border border-dashed border-rose-200 rounded-xl">
                            <div className="font-bold text-rose-600 mb-1 font-sans text-xs uppercase tracking-wider">Access Control Restriction</div>
                            <div className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">{usersError}</div>
                            <button 
                              type="button"
                              onClick={() => {
                                setUsersLoading(true);
                                setUsersError(null);
                              }}
                              className="mt-3 px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 text-[10px] font-sans font-bold rounded uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Retry Sync
                            </button>
                          </td>
                        </tr>
                      ) : usersList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-10 text-center text-slate-400">
                            <span>No interactive identities discovered in the directory.</span>
                          </td>
                        </tr>
                      ) : (
                        usersList.map((usr) => (
                          <tr key={usr.uid} className="hover:bg-slate-50/30 transition-colors">
                            <td className="p-4">
                              <div>
                                <p className="font-bold text-slate-800 text-xs">{usr.name || 'Anonymous'}</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{usr.email}</p>
                              </div>
                            </td>
                            <td className="p-4 font-mono text-[10px] text-slate-400 tracking-wider">
                              {usr.uid}
                            </td>
                            <td className="p-4 text-slate-500 font-medium font-mono text-[10px]">
                              {usr.createdAt ? new Date(usr.createdAt).toLocaleString() : 'Bootstrap/Legacy'}
                            </td>
                            <td className="p-4 text-center">
                              {usr.role === 'owner' ? (
                                <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-150 rounded px-2.5 py-1 uppercase">👑 Owner</span>
                              ) : (userRole === 'owner' || (userRole === 'admin' && usr.role !== 'admin')) ? (
                                <select
                                  value={usr.role || 'viewer'}
                                  onChange={(e) => handleUpdateUserRole(usr.uid, usr.email, e.target.value as any)}
                                  className="bg-slate-50 border border-slate-200 text-slate-700 font-mono font-bold rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-slate-400 cursor-pointer outline-none uppercase"
                                >
                                  {userRole === 'owner' && <option value="owner">👑 Owner</option>}
                                  {userRole === 'owner' && <option value="admin">🔒 Admin</option>}
                                  <option value="manager">🛡️ Manager</option>
                                  <option value="supervisor">👁️‍ Supervisor</option>
                                  <option value="accountant">💰 Accountant</option>
                                  <option value="cashier">💼 Cashier</option>
                                  <option value="salesman">🛒 Salesman</option>
                                  <option value="viewer">👁️ Viewer</option>
                                </select>
                              ) : (
                                <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-150 rounded px-2.5 py-1 uppercase">{usr.role || 'viewer'}</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <PrivilegeMatrix currentUserRole={userRole} />
            )}

          </div>
        </SafeTabWrapper>
      ) : activeTab === 'reports' ? (
        <SafeTabWrapper tab="reports" userRole={userRole} permissions={permissions}>
          <ReportsPage userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'expenses' ? (
        <SafeTabWrapper tab="expenses" userRole={userRole} permissions={permissions}>
          <ExpenseManagement userRole={userRole} permissions={permissions} />
        </SafeTabWrapper>
      ) : activeTab === 'product_ledger' ? (
        <SafeTabWrapper tab="inventory" userRole={userRole} permissions={permissions}>
          <ProductLedger userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'chart_of_accounts' ? (
        <SafeTabWrapper tab="chart_of_accounts" userRole={userRole} permissions={permissions}>
          <ChartOfAccounts userRole={userRole} permissions={permissions} />
        </SafeTabWrapper>
      ) : activeTab === 'units' ? (
        <SafeTabWrapper tab="units" userRole={userRole} permissions={permissions}>
          <UnitManagement userRole={userRole} permissions={permissions} units={units} setUnits={setUnits} products={products} />
        </SafeTabWrapper>
      ) : (
        <SafeTabWrapper tab="company_settings" userRole={userRole} permissions={permissions}>
          <CompanySettings userRole={userRole} permissions={permissions} />
        </SafeTabWrapper>
      )}

      {/* RENDER FORM OVERLAY MODAL */}
      <ItemForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveItem}
        itemToEdit={productToEdit}
        categories={categories.filter((cat) => cat !== 'All')}
        products={products}
        permissions={permissions}
        units={units}
      />

      {/* INVENTORY ADJUSTMENT MODAL */}
      <AnimatePresence>
        {adjustmentProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-xl relative text-slate-800"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-sans text-base font-extrabold text-slate-900 uppercase tracking-wide">
                    Inventory Adjustment
                  </h3>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5 font-medium">
                    Adjust catalog level and register a certified audit trail
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdjustmentProduct(null)}
                  className="rounded-full p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="py-5 space-y-4 font-sans text-xs">
                {/* Product specifics */}
                <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Product Name:</span>
                    <span className="font-bold text-slate-900">{adjustmentProduct.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Product SKU:</span>
                    <span className="font-mono font-bold text-slate-700 bg-white border border-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                      {adjustmentProduct.sku}
                    </span>
                  </div>
                </div>

                {/* Adjustment values */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Before</span>
                    <span className="block text-base font-extrabold text-slate-800 font-mono mt-1">
                      {adjustmentProduct.currentStock}
                    </span>
                  </div>
                  <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                    <span className="block text-[10px] text-amber-600 font-bold uppercase tracking-wider">Change</span>
                    <span className="block text-base font-extrabold text-amber-700 font-mono mt-1">
                      {adjustmentDelta > 0 ? `+${adjustmentDelta}` : adjustmentDelta}
                    </span>
                  </div>
                  <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                    <span className="block text-[10px] text-emerald-600 font-bold uppercase tracking-wider">After</span>
                    <span className="block text-base font-extrabold text-emerald-700 font-mono mt-1">
                      {adjustmentProduct.currentStock + adjustmentDelta}
                    </span>
                  </div>
                </div>

                {/* Reason drop control */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Reason for Adjustment <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3.5 py-2.5 outline-none font-sans text-xs focus:border-slate-400 transition cursor-pointer font-medium"
                    required
                  >
                    <option value="Physical Count Correction">📋 Physical Count Correction</option>
                    <option value="Damaged Stock">💥 Damaged Stock</option>
                    <option value="Lost Stock">🔍 Lost Stock</option>
                    <option value="Found Stock">🎁 Found Stock</option>
                    <option value="Other">❓ Other</option>
                  </select>
                </div>
              </div>

              {/* Actions footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustmentProduct(null)}
                  disabled={isAdjusting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition active:scale-98 disabled:opacity-55"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdjustment}
                  disabled={isAdjusting}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-900 text-xs font-bold text-white hover:bg-slate-800 transition shadow-xs flex items-center gap-2 active:scale-98 disabled:opacity-75"
                >
                  {isAdjusting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Apply Adjustment"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MOBILE NAVIGATION DRAWER */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              id="mobile-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 cursor-pointer"
            />

            {/* Side Drawer Panel */}
            <motion.div
              id="mobile-drawer-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="md:hidden fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0">
                    <Box className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-black text-slate-900 tracking-tight uppercase">
                      Nexus Navigation
                    </h2>
                  </div>
                </div>
                <button
                  id="mobile-drawer-close"
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Navigation List */}
              <div className="flex-1 overflow-y-auto py-3 px-4 space-y-1.5 scrollbar-thin">
                {getVisibleModules().filter(mod => isModuleAccessible(mod.id)).map(mod => {
                  const Icon = mod.icon;
                  const routeKey = mod.routeKey || mod.id;
                  const isActive = activeTab === routeKey;
                  const activeColorClass = mod.id === 'expenses'
                    ? 'bg-rose-50 border-rose-100 text-rose-700 font-black'
                    : 'bg-indigo-50 border-indigo-100 text-indigo-700 font-black';
                  
                  return (
                    <button
                      key={mod.id}
                      id={mod.id === 'users' ? 'open-mobile-user-access-tab' : mod.id === 'company_settings' ? 'open-mobile-company-settings-tab' : undefined}
                      type="button"
                      onClick={() => {
                        setActiveTab(routeKey as any);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3.5 px-4.5 py-3.5 text-xs font-bold rounded-xl transition cursor-pointer border text-left ${
                        isActive
                          ? activeColorClass
                          : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                      <span>{mod.displayName}</span>
                    </button>
                  );
                })}
              </div>

              {/* Drawer Footer info summary */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Nexus ERP Workforce Clearance
                </p>
                <p className="text-[9px] text-slate-400 mt-1 font-mono">
                  {currentUser?.email}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MOBILE STICKY BOTTOM QUICK ACTION BUTTON */}
      {(() => {
        const isMobileFabAllowed = () => {
          if (activeTab === 'inventory') return permissions.canEditProduct;
          if (activeTab === 'customers') return permissions.createCustomer;
          if (activeTab === 'suppliers') return permissions.createSupplier;
          if (activeTab === 'sales') return permissions.createSale;
          if (activeTab === 'procurement') return permissions.createProcurement;
          if (activeTab === 'ledger') return permissions.createPayment;
          if (activeTab === 'products') return permissions.canEditProduct;
          return false;
        };

        const getFabLabel = () => {
          if (activeTab === 'inventory') return 'Add Product';
          if (activeTab === 'customers') return 'New Customer';
          if (activeTab === 'suppliers') return 'New Supplier';
          if (activeTab === 'sales') return 'Record Sale';
          if (activeTab === 'procurement') return 'Add Purchase';
          if (activeTab === 'ledger') return 'Record Pay';
          if (activeTab === 'products') return 'Add Product';
          return 'Add New';
        };

        if (!['inventory', 'customers', 'suppliers', 'sales', 'procurement', 'ledger', 'products'].includes(activeTab) || !isMobileFabAllowed()) {
          return null;
        }

        return (
          <div id="mobile-sticky-fab-container" className="md:hidden fixed bottom-6 right-6 z-40 filter drop-shadow-lg">
            <button
              id={`mobile-fab-trigger-${activeTab}`}
              type="button"
              onClick={() => {
                if (activeTab === 'inventory') {
                  setProductToEdit(null);
                  setIsFormOpen(true);
                } else {
                  window.dispatchEvent(new CustomEvent('nexus-trigger-add-modal', { detail: { tab: activeTab } }));
                }
              }}
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 text-white shadow-lg active:scale-95 cursor-pointer border border-indigo-500 font-bold text-xs"
              title={`Quick add action for ${activeTab}`}
            >
              <Plus className="h-5 w-5 shrink-0" />
              <span>{getFabLabel()}</span>
            </button>
          </div>
        );
      })()}

    </EnterpriseShell>
  );
}

// Simple message cleaner helper (optional)
function backupFeedbackMessage(msg: string) {
  return msg;
}

interface SafeTabWrapperProps {
  children: React.ReactNode;
  tab: string;
  userRole: string;
  permissions: AppPermissions;
}

function SafeTabWrapper({ children, tab, userRole, permissions }: SafeTabWrapperProps) {
  let isAccessible = true;

  if (tab === 'dashboard') isAccessible = permissions.viewDashboard;
  else if (tab === 'customers') isAccessible = permissions.viewCustomers;
  else if (tab === 'suppliers') isAccessible = permissions.viewSuppliers;
  else if (tab === 'ledger') isAccessible = permissions.viewLedger;
  else if (tab === 'products') isAccessible = permissions.viewProducts;
  else if (tab === 'sales') isAccessible = permissions.viewSales;
  else if (tab === 'procurement') isAccessible = permissions.viewProcurement;
  else if (tab === 'balancesheet') isAccessible = permissions.viewFinancialReports;
  else if (tab === 'chart_of_accounts') isAccessible = permissions.viewFinancialReports;
  else if (tab === 'users') isAccessible = permissions.viewUsers;
  else if (tab === 'reports') isAccessible = permissions.viewReports;
  else if (tab === 'expenses') isAccessible = permissions.viewExpenses;
  else if (tab === 'company_settings') isAccessible = permissions.viewSettings || permissions.voidPayment;
  else if (tab === 'units') isAccessible = permissions.viewSettings || permissions.viewProducts || userRole === 'owner' || userRole === 'admin';
  
  if (!isAccessible) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-xs">
        <div className="h-16 w-16 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-500 shadow-inner">
          <svg className="w-8 h-8 font-extrabold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-base font-sans font-black text-slate-800 uppercase tracking-widest">Clearance Restriction</h3>
        <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
          Your current security clearance level (<span className="font-mono font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded uppercase">{userRole}</span>) does not grant permissions to open the <strong className="capitalize text-slate-800">{tab}</strong> module.
        </p>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pt-2">Please contact the system administrator to request access privilege promotion.</p>
      </div>
    );
  }
  return <>{children}</>;
}

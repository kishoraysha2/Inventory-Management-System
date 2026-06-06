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
  Lock,
  Mail,
  LogOut,
  Key,
  Shield,
  Loader2,
  Eye,
  EyeOff,
  UserPlus
} from 'lucide-react';

import { Product, ActivityLog, Supplier, CashLedgerEntry, Capital } from './types';
import { INITIAL_PRODUCTS, INITIAL_LOGS, INITIAL_SUPPLIERS, INITIAL_CASH_LEDGER, INITIAL_CAPITAL } from './data';
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
import { usePermission } from './hooks/usePermission';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity } from './lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';
import { signOut, onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'customers' | 'suppliers' | 'ledger' | 'products' | 'sales' | 'procurement' | 'reports' | 'balancesheet' | 'users'>('dashboard');

  // --- Core Authentication State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ role: 'admin' | 'accountant' | 'cashier' | 'viewer'; name: string; email: string } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [usersList, setUsersList] = useState<any[]>([]);

  // --- Auth View Controls ---
  const [authFeedback, setAuthFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // --- Email/Password Authentication States ---
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isAuthSubmitLoading, setIsAuthSubmitLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const permissions = usePermission(currentUserProfile);
  const userRole = permissions.role;
  const canEditInventory = permissions.canEditInventory;

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

  // --- Observe Authentication State ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        if (user.isAnonymous) {
          const savedRole = localStorage.getItem('demo_user_role') || 'viewer';
          const name = savedRole === 'admin' ? 'Kishor Aysha (Admin Bypass)' : 'Demo Guest';
          const email = savedRole === 'admin' ? 'kishor.aysha2@gmail.com' : 'demo-guest@example.com';
          setCurrentUserProfile({
            role: savedRole as any,
            name,
            email
          });
          setIsAuthLoading(false);
          await checkAndLogLogin(user.uid, email, name, savedRole);
          return;
        }

        const userRef = doc(db, 'users', user.uid);
        try {
          const docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (user.email === 'kishor.aysha2@gmail.com' && data.role !== 'admin') {
              await setDoc(userRef, { role: 'admin' }, { merge: true });
              const name = data.name || 'Kishor Aysha (Admin)';
              const email = user.email || 'kishor.aysha2@gmail.com';
              const role = 'admin';
              setCurrentUserProfile({
                role,
                name,
                email
              });
              await checkAndLogLogin(user.uid, email, name, role);
            } else {
              const role = data.role || 'viewer';
              const name = data.name || user.email?.split('@')[0] || 'User';
              const email = data.email || user.email || '';
              setCurrentUserProfile({
                role,
                name,
                email
              });
              await checkAndLogLogin(user.uid, email, name, role);
            }
          } else {
            const defaultRole = user.email === 'kishor.aysha2@gmail.com' ? 'admin' : 'viewer';
            await setDoc(userRef, {
              name: user.email === 'kishor.aysha2@gmail.com' ? 'Kishor Aysha (Admin)' : (user.email?.split('@')[0] || 'User'),
              email: user.email || '',
              role: 'viewer',
              createdAt: new Date().toISOString()
            });

            if (user.email === 'kishor.aysha2@gmail.com') {
              await updateDoc(userRef, { role: 'admin' });
            }

            const name = user.email === 'kishor.aysha2@gmail.com' ? 'Kishor Aysha (Admin)' : (user.email?.split('@')[0] || 'User');
            const email = user.email || '';
            setCurrentUserProfile({
              role: defaultRole as any,
              name,
              email
            });
            await checkAndLogLogin(user.uid, email, name, defaultRole);
          }
        } catch (err) {
          console.error("Failed to load user profile document:", err);
          const role = user.email === 'kishor.aysha2@gmail.com' ? 'admin' : 'viewer';
          const name = user.email?.split('@')[0] || 'User';
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
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
      const email = 'kishor.aysha2@gmail.com';
      const name = 'Kishor Aysha (Admin Bypass)';
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

  const handleUpdateUserRole = async (targetUid: string, targetEmail: string, newRole: 'admin' | 'accountant' | 'cashier' | 'viewer') => {
    if (userRole !== 'admin') {
      setFeedback({ message: 'Access Denied: Only system administrators can adjust security clearance.', type: 'error' });
      return;
    }

    try {
      const targetUser = usersList.find(u => u.uid === targetUid);
      const previousRole = targetUser?.role || 'viewer';
      const targetName = targetUser?.name || 'Anonymous';
      const changedByUid = auth.currentUser?.uid || 'unknown-uid';
      const changedByUserName = currentUserProfile?.name || auth.currentUser?.displayName || auth.currentUser?.email || 'Anonymous Admin';
      const timestampString = new Date().toISOString();

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
    if (!currentUser || !auth.currentUser || userRole !== 'admin') {
      if (currentUser && userRole === 'admin') {
        setUsersList([
          { uid: currentUser.uid, name: currentUser.displayName || 'Kishor Aysha (Admin Bypass)', email: currentUser.email, role: 'admin', createdAt: new Date().toISOString() }
        ]);
      } else {
        setUsersList([]);
      }
      return;
    }

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ uid: docSnap.id, ...docSnap.data() });
      });
      setUsersList(list);
    }, (error) => {
      console.error("Users Sync Error", error);
    });

    return () => unsubUsers();
  }, [currentUser, userRole]);

  // --- Reference Nodes ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    if (!currentUser || !auth.currentUser) return;

    // 1. Products Sync
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsList: Product[] = [];
      snapshot.forEach((docSnap) => {
        productsList.push(docSnap.data() as Product);
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

    return () => {
      unsubProducts();
      unsubSuppliers();
      unsubLogs();
      unsubCashLedger();
      unsubCapital();
    };
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
  const categories: string[] = ['All', ...Array.from(new Set(products.filter(p => p.status !== 'inactive').map((p) => p.category))).map(String)];

  // --- Global Metrics ---
  const totalProducts = products.filter(p => p.status !== 'inactive').length;
  const totalStockQuantity = products.filter(p => p.status !== 'inactive').reduce((acc, p) => acc + p.currentStock, 0);
  const totalValuation = products.filter(p => p.status !== 'inactive').reduce((acc, p) => acc + p.sellingPrice * p.currentStock, 0);
  const lowStockItemsCount = products.filter((p) => p.status !== 'inactive' && p.currentStock <= p.minimumStockAlert).length;

  const lowStockList = products.filter((p) => p.status !== 'inactive' && p.currentStock <= p.minimumStockAlert);

  // --- Quick Stock Increments ---
  const handleQuickQuantityAdjust = async (productId: string, delta: number) => {
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

    const timestamp = new Date().toISOString();
    const updatedProduct: Product = {
      ...productToUpdate,
      currentStock: newQty,
    };

    // Log activity
    const logEntry: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      itemId: productToUpdate.id,
      itemName: productToUpdate.name,
      type: 'stock_change',
      description: `Adjusted quantity from ${productToUpdate.currentStock} to ${newQty} (${delta > 0 ? '+' : ''}${delta})`,
      quantityDifference: delta,
      timestamp,
    };

    try {
      await setDoc(doc(db, 'products', updatedProduct.id), updatedProduct);
      await setDoc(doc(db, 'logs', logEntry.id), logEntry);
      await logSystemActivity(
        "Stock updated",
        `Adjusted stock level for item "${productToUpdate.name}" (SKU: ${productToUpdate.sku}) from ${productToUpdate.currentStock} to ${newQty} (${delta > 0 ? '+' : ''}${delta})`
      );
      setFeedback({ message: `Level updated for ${productToUpdate.name} (${newQty} units total).`, type: 'success' });
    } catch (e) {
      try {
        handleFirestoreError(e, OperationType.WRITE, `products/${productId}`);
      } catch (err: any) {
        setFeedback({ message: `Firestore Write Error: ${err.message}`, type: 'error' });
      }
    }
  };

  // --- Create or Update Dispatch ---
  const handleSaveItem = async (formData: Omit<Product, 'id' | 'createdDate'> & { id?: string }) => {
    const timestamp = new Date().toISOString();

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
        id: newProductId,
        name: formData.name,
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
      if (item.status === 'inactive') return false;

      const query = search.toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        (item.location || '').toLowerCase().includes(query) ||
        (item.supplierName || '').toLowerCase().includes(query);

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
                Authorized administrators logging in via <strong>kishor.aysha2@gmail.com</strong> will instantly receive full <strong>System Admin</strong> privileges. All other corporate profiles default to secure viewer clearance.
              </span>
            </p>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div id="inventory-app-container" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* HEADER BAR */}
      <div id="dashboard-header" className="print:hidden flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6 mb-2">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-sans text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center flex-wrap gap-2 leading-none">
                NEXUS INVENTORY <span className="text-slate-400 font-normal text-xs uppercase tracking-widest bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">v4.2.1</span>
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500">
                <span className="text-slate-800 font-bold">{currentUserProfile?.name || currentUser?.email?.split('@')[0]}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-400 font-mono text-[11px] font-bold">{currentUser?.email}</span>
                <span className="text-slate-300">•</span>
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase border ${
                  userRole === 'admin' 
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                    : userRole === 'accountant'
                    ? 'bg-blue-50 border-blue-100 text-blue-700'
                    : userRole === 'cashier'
                    ? 'bg-amber-50 border-amber-100 text-amber-700'
                    : 'bg-slate-50 border-slate-100 text-slate-600'
                }`}>
                  <Shield className="w-2.5 h-2.5" />
                  <span>{userRole}</span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="font-sans font-bold text-rose-500 hover:text-rose-700 transition flex items-center gap-1 cursor-pointer pl-2 ml-1 border-l border-slate-200"
                >
                  <LogOut className="w-3.5 h-3.5 hover:rotate-12 transition-transform" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Global Control Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Load Sample Reset Button */}
          {userRole === 'admin' && (
            <button
              id="reset-demo-data-button"
              type="button"
              onClick={handleResetDemoData}
              title="Restore default product catalog"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Load Demo</span>
            </button>
          )}

          {/* Export JSON backup */}
          {userRole === 'admin' && (
            <button
              id="export-backup-json-button"
              type="button"
              onClick={handleExportJSON}
              title="Download full catalog backup in JSON"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Backup</span>
            </button>
          )}

          {/* Import JSON backup panel switcher */}
          {permissions.isAdmin && (
            <button
              id="import-backup-toggle-button"
              type="button"
              onClick={() => setShowImport((prev) => !prev)}
              title="Import inventory data from JSON backup"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                showImport
                  ? 'bg-slate-100 text-slate-700 border-slate-355'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import JSON</span>
            </button>
          )}

          {/* Main Primary Addition Button */}
          {permissions.canEditProduct && (
            <button
              id="register-new-item-button"
              type="button"
              onClick={() => {
                setProductToEdit(null);
                setIsFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Register Product</span>
            </button>
          )}
        </div>
      </div>

      {/* PRIMARY NAVIGATION TABS */}
      <div className="print:hidden flex bg-slate-100 p-1 rounded-2xl max-w-7xl border border-slate-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'dashboard'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Dashboard</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`flex-1 min-w-[110px] flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'inventory'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Box className="h-4 w-4" />
          <span>Inventory Desk</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'customers'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Customers</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('suppliers')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'suppliers'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="h-4 w-4" />
          <span>Suppliers</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'ledger'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>Due Ledger</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'products'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingBag className="h-4 w-4" />
          <span>Products</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'sales'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          <span>Sales</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('procurement')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'procurement'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Procurement</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'reports'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Reports</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('balancesheet')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition min-w-[120px] ${
            activeTab === 'balancesheet'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Scale className="h-4 w-4" />
          <span>Balance Sheet</span>
        </button>
        {userRole === 'admin' && (
          <button
            id="open-user-access-tab"
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition min-w-[125px] ${
              activeTab === 'users'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>User Access</span>
          </button>
        )}
      </div>

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
        <Dashboard userRole={userRole} />
      ) : activeTab === 'inventory' ? (
        <>
          {/* METRICS BENTO GRID */}
          <div id="metrics-bento-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Consolidated Portfolio Value"
              value={`$${totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
                                <p className="font-bold text-slate-800 text-xs truncate group-hover:text-slate-900 leading-tight">
                                  {item.name}
                                </p>
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
        <SafeTabWrapper tab="customers" userRole={userRole}>
          <CustomerManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'suppliers' ? (
        <SafeTabWrapper tab="suppliers" userRole={userRole}>
          <SupplierManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'ledger' ? (
        <SafeTabWrapper tab="ledger" userRole={userRole}>
          <PaymentLedger userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'products' ? (
        <SafeTabWrapper tab="products" userRole={userRole}>
          <ProductManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'sales' ? (
        <SafeTabWrapper tab="sales" userRole={userRole}>
          <SalesManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'procurement' ? (
        <SafeTabWrapper tab="procurement" userRole={userRole}>
          <ProcurementManagement userRole={userRole} />
        </SafeTabWrapper>
      ) : activeTab === 'balancesheet' ? (
        <SafeTabWrapper tab="balancesheet" userRole={userRole}>
          <BalanceSheet />
        </SafeTabWrapper>
      ) : activeTab === 'users' ? (
        <SafeTabWrapper tab="users" userRole={userRole}>
          {/* USER MANAGEMENT ADMIN PANEL */}
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
                  {usersList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-2" />
                        <span>Querying Firestore user list...</span>
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
                          {usr.email === 'kishor.aysha2@gmail.com' ? (
                            <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2.5 py-1 uppercase">Root Admin</span>
                          ) : (
                            <select
                              value={usr.role || 'viewer'}
                              onChange={(e) => handleUpdateUserRole(usr.uid, usr.email, e.target.value as any)}
                              className="bg-slate-50 border border-slate-200 text-slate-700 font-mono font-bold rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-slate-400 cursor-pointer outline-none uppercase"
                            >
                              <option value="admin">🔒 Admin</option>
                              <option value="accountant">💰 Accountant</option>
                              <option value="cashier">💼 Cashier</option>
                              <option value="viewer">👁️ Viewer</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </SafeTabWrapper>
      ) : (
        <SafeTabWrapper tab="reports" userRole={userRole}>
          <ReportsPage userRole={userRole} />
        </SafeTabWrapper>
      )}

      {/* RENDER FORM OVERLAY MODAL */}
      <ItemForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveItem}
        itemToEdit={productToEdit}
        categories={categories.filter((cat) => cat !== 'All')}
      />

      {/* Footer Bar */}
      <footer className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap justify-between items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
        <div className="flex gap-6">
          <span>System: Online</span>
          <span>Sync: 0.04s Latency</span>
          <span>Region: Europe-West3</span>
        </div>
        <div>© 2026 Nexus Intelligence Systems Inc.</div>
      </footer>
    </div>
  );
}

// Simple message cleaner helper (optional)
function backupFeedbackMessage(msg: string) {
  return msg;
}

interface SafeTabWrapperProps {
  children: React.ReactNode;
  tab: string;
  userRole: 'admin' | 'accountant' | 'cashier' | 'viewer';
}

function SafeTabWrapper({ children, tab, userRole }: SafeTabWrapperProps) {
  let isAccessible = true;

  if (userRole === 'viewer') {
    isAccessible = tab !== 'users';
  } else if (userRole === 'cashier') {
    isAccessible = tab === 'dashboard' || tab === 'sales' || tab === 'customers';
  } else if (userRole === 'accountant') {
    isAccessible = tab !== 'procurement' && tab !== 'suppliers' && tab !== 'users';
  } else if (userRole === 'admin') {
    isAccessible = true;
  }
  
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

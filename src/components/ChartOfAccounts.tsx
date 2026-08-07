import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ChartOfAccount, Sale, Product, Customer, Supplier, Capital, CashLedgerEntry, Purchase, CustomerPayment, SupplierPayment, LedgerEntry } from '../types';
import { INITIAL_CHART_OF_ACCOUNTS } from '../data';
import { calculateCustomerLedger, isVoidStatus, isInactiveStatus } from '../lib/utils';
import { formatCurrency } from '../utils/currencyFormatter';
import { getSaleSummary } from '../types';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Download, 
  Printer, 
  RefreshCw, 
  BookOpen, 
  Scale, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  DollarSign, 
  ShieldAlert,
  FolderTree,
  Check,
  X,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePermission, AppPermissions, UserRole } from '../hooks/usePermission';

interface ChartOfAccountsProps {
  userRole?: UserRole;
  permissions?: AppPermissions;
}

export default function ChartOfAccounts({ userRole, permissions: propPermissions }: ChartOfAccountsProps = {}) {
  const { permissions: hookPermissions } = usePermission({ role: userRole || 'viewer' });
  const permissions = propPermissions || hookPermissions;

  const canManageCOA = permissions.isAdmin || permissions.isAccountant;

  // --- Real-Time Collections States ---
  const [coa, setCoa] = useState<ChartOfAccount[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [capital, setCapital] = useState<Capital[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // --- UI Filter & Search States ---
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'active' | 'inactive'>('All');
  const [activeTab, setActiveTab] = useState<'all' | 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'>('all');

  // --- Modal Forms States ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'>('Asset');
  const [formSubType, setFormSubType] = useState('');
  const [formNormalBalance, setFormNormalBalance] = useState<'Debit' | 'Credit'>('Debit');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formDescription, setFormDescription] = useState('');
  const [formParentAccount, setFormParentAccount] = useState('');
  const [formEditable, setFormEditable] = useState(true);
  const [formError, setFormError] = useState('');

  // --- Helper to show feedback ---
  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  // --- Map and Calculate Customer Ledger to track outstanding balances ---
  const customers = useMemo(() => {
    return customersState.map(c => {
      const rawDue = calculateCustomerLedger(sales, customerPayments, c.id, c.dueBalance);
      return {
        ...c,
        dueBalance: Math.max(0, rawDue),
        customerCredit: rawDue < 0 ? Math.abs(rawDue) : 0
      };
    });
  }, [customersState, sales, customerPayments]);

  // --- Real-time subscription to Firebase ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local Fallback
      const savedSales = localStorage.getItem('inventory_sales');
      setSales(savedSales ? JSON.parse(savedSales) : []);

      const savedProducts = localStorage.getItem('inventory_products');
      setProducts(savedProducts ? JSON.parse(savedProducts) : []);

      const savedCustomers = localStorage.getItem('inventory_customers');
      setCustomersState(savedCustomers ? JSON.parse(savedCustomers) : []);

      const savedSuppliers = localStorage.getItem('inventory_suppliers');
      setSuppliers(savedSuppliers ? JSON.parse(savedSuppliers) : []);

      const savedLedger = localStorage.getItem('inventory_cash_ledger');
      setCashLedger(savedLedger ? JSON.parse(savedLedger) : []);

      const savedCapital = localStorage.getItem('inventory_capital');
      setCapital(savedCapital ? JSON.parse(savedCapital) : []);

      const savedPurchases = localStorage.getItem('inventory_purchases');
      setPurchases(savedPurchases ? JSON.parse(savedPurchases) : []);

      const savedCustomerPayments = localStorage.getItem('inventory_customer_payments');
      setCustomerPayments(savedCustomerPayments ? JSON.parse(savedCustomerPayments) : []);

      const savedSupplierPayments = localStorage.getItem('inventory_supplier_payments');
      setSupplierPayments(savedSupplierPayments ? JSON.parse(savedSupplierPayments) : []);

      const savedExpenses = localStorage.getItem('expenses');
      setExpenses(savedExpenses ? JSON.parse(savedExpenses) : []);

      const savedLedgerEntries = localStorage.getItem('inventory_ledger_entries');
      setLedgerEntries(savedLedgerEntries ? JSON.parse(savedLedgerEntries) : []);

      // Load Chart of Accounts
      const savedCOA = localStorage.getItem('nexus_chart_of_accounts');
      if (savedCOA) {
        setCoa(JSON.parse(savedCOA));
      } else {
        setCoa(INITIAL_CHART_OF_ACCOUNTS);
        localStorage.setItem('nexus_chart_of_accounts', JSON.stringify(INITIAL_CHART_OF_ACCOUNTS));
      }

      setLoading(false);
      return;
    }

    setLoading(true);
    const resolved = new Set<string>();
    const totalCollections = 12;

    const markResolved = (colName: string) => {
      resolved.add(colName);
      if (resolved.size === totalCollections) {
        setLoading(false);
      }
    };

    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      const list: Sale[] = [];
      snap.forEach(d => list.push(d.data() as Sale));
      setSales(list);
      markResolved('sales');
    }, (err) => {
      console.error("COA: Failed to load sales", err);
      markResolved('sales');
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      const list: Product[] = [];
      snap.forEach(d => {
        const data = d.data() as Product;
        list.push({ ...data, id: data.id || d.id });
      });
      setProducts(list);
      markResolved('products');
    }, (err) => {
      console.error("COA: Failed to load products", err);
      markResolved('products');
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      const list: Customer[] = [];
      snap.forEach(d => list.push(d.data() as Customer));
      setCustomersState(list);
      markResolved('customers');
    }, (err) => {
      console.error("COA: Failed to load customers", err);
      markResolved('customers');
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      const list: Supplier[] = [];
      snap.forEach(d => list.push(d.data() as Supplier));
      setSuppliers(list);
      markResolved('suppliers');
    }, (err) => {
      console.error("COA: Failed to load suppliers", err);
      markResolved('suppliers');
    });

    const unsubCashLedger = onSnapshot(collection(db, 'cashLedger'), (snap) => {
      const list: CashLedgerEntry[] = [];
      snap.forEach(d => list.push(d.data() as CashLedgerEntry));
      setCashLedger(list);
      markResolved('cashLedger');
    }, (err) => {
      console.error("COA: Failed to load cashLedger", err);
      markResolved('cashLedger');
    });

    const unsubCapital = onSnapshot(collection(db, 'capital'), (snap) => {
      const list: Capital[] = [];
      snap.forEach(d => list.push(d.data() as Capital));
      setCapital(list);
      markResolved('capital');
    }, (err) => {
      console.error("COA: Failed to load capital", err);
      markResolved('capital');
    });

    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snap) => {
      const list: Purchase[] = [];
      snap.forEach(d => list.push(d.data() as Purchase));
      setPurchases(list);
      markResolved('purchases');
    }, (err) => {
      console.error("COA: Failed to load purchases", err);
      markResolved('purchases');
    });

    const unsubCustomerPayments = onSnapshot(collection(db, 'customerPayments'), (snap) => {
      const list: CustomerPayment[] = [];
      snap.forEach(d => list.push(d.data() as CustomerPayment));
      setCustomerPayments(list);
      markResolved('customerPayments');
    }, (err) => {
      console.error("COA: Failed to load customerPayments", err);
      markResolved('customerPayments');
    });

    const unsubSupplierPayments = onSnapshot(collection(db, 'supplierPayments'), (snap) => {
      const list: SupplierPayment[] = [];
      snap.forEach(d => list.push(d.data() as SupplierPayment));
      setSupplierPayments(list);
      markResolved('supplierPayments');
    }, (err) => {
      console.error("COA: Failed to load supplierPayments", err);
      markResolved('supplierPayments');
    });

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push(d.data()));
      setExpenses(list);
      markResolved('expenses');
    }, (err) => {
      console.error("COA: Failed to load expenses", err);
      markResolved('expenses');
    });

    const unsubLedgerEntries = onSnapshot(collection(db, 'ledgerEntries'), (snap) => {
      const list: LedgerEntry[] = [];
      snap.forEach(d => list.push(d.data() as LedgerEntry));
      setLedgerEntries(list);
      markResolved('ledgerEntries');
    }, (err) => {
      console.error("COA: Failed to load ledgerEntries", err);
      markResolved('ledgerEntries');
    });

    // Real-time Chart of Accounts collection
    const unsubCOA = onSnapshot(collection(db, 'chartOfAccounts'), (snap) => {
      const list: ChartOfAccount[] = [];
      snap.forEach(d => list.push(d.data() as ChartOfAccount));
      
      if (list.length === 0) {
        // Automatically seed INITIAL_CHART_OF_ACCOUNTS if Firestore is empty
        seedCOAToFirestore();
      } else {
        setCoa(list.sort((a, b) => a.code.localeCompare(b.code)));
      }
      markResolved('chartOfAccounts');
    }, (err) => {
      console.error("COA: Failed to load chartOfAccounts", err);
      markResolved('chartOfAccounts');
    });

    return () => {
      unsubSales();
      unsubProducts();
      unsubCustomers();
      unsubSuppliers();
      unsubCashLedger();
      unsubCapital();
      unsubPurchases();
      unsubCustomerPayments();
      unsubSupplierPayments();
      unsubExpenses();
      unsubLedgerEntries();
      unsubCOA();
    };
  }, []);

  // --- Seed Initial Accounts to Firestore if completely empty ---
  const seedCOAToFirestore = async () => {
    if (!auth.currentUser) return;
    setSyncing(true);
    try {
      for (const account of INITIAL_CHART_OF_ACCOUNTS) {
        await setDoc(doc(db, 'chartOfAccounts', account.id), {
          ...account,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      // Also seed Input VAT (1400)
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

      // Also seed Output VAT (2400)
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

      showFeedback("Chart of Accounts successfully initialized with standard corporate profiles.", "success");
    } catch (err) {
      console.error("Failed to seed chartOfAccounts:", err);
      handleFirestoreError(err, OperationType.WRITE, "chartOfAccounts");
      showFeedback("Failed to initialize Chart of Accounts in Cloud Firestore.", "error");
    } finally {
      setSyncing(false);
    }
  };

  // --- B. EXCLUSIONS & FILTERS ---
  const activeSales = sales.filter(s => !isVoidStatus((s as any).status));
  const activeCustomerPayments = customerPayments.filter(p => !isVoidStatus((p as any).status));
  const activeSupplierPayments = supplierPayments.filter(p => !isVoidStatus((p as any).status));
  const activePurchases = purchases.filter(p => !isVoidStatus((p as any).status));
  const activeLedgerEntries = cashLedger.filter(e => !isVoidStatus((e as any).status));

  // --- Live dynamic accounting calculations to feed corresponding System Accounts ---
  const initialCapital = capital.reduce((sum, entry) => sum + entry.amount, 0);

  const totalLedgerInflows = activeLedgerEntries
    .filter(entry => entry.type === 'inflow')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const totalLedgerOutflows = activeLedgerEntries
    .filter(entry => entry.type === 'outflow')
    .reduce((sum, entry) => sum + entry.amount, 0);

  // Dynamic values that feed system accounts
  const dynamicCashInHand = initialCapital + totalLedgerInflows - totalLedgerOutflows;
  
  const activeCustomers = customers.filter(c => !isInactiveStatus(c.status));
  const dynamicAccountsReceivable = activeCustomers.reduce((sum, c) => sum + (c.dueBalance ?? 0), 0);

  const activeProducts = products.filter(p => !isInactiveStatus(p.status));
  const dynamicInventoryAsset = activeProducts.reduce((sum, p) => sum + (p.purchasePrice * p.currentStock), 0);

  const activeSuppliers = suppliers.filter(s => !isInactiveStatus(s.status));
  const dynamicAccountsPayable = activeSuppliers.reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);

  const salesVAT = activeSales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0);
  const purchaseVAT = activePurchases.reduce((sum, p) => sum + (p.vatAmount ?? 0), 0);
  const dynamicVATPayable = Math.max(0, salesVAT - purchaseVAT);

  const dynamicSalesRevenue = activeSales.reduce((sum, s) => sum + getSaleSummary(s, products).subtotal, 0);
  const dynamicCOGS = activeSales.reduce((sum, s) => sum + getSaleSummary(s, products).costOfGoodsSold, 0);

  const dynamicExpenses = expenses
    .filter(e => e.status === 'active')
    .reduce((sum, e) => sum + e.amount, 0);

  const dynamicRetainedEarnings = (dynamicSalesRevenue - dynamicCOGS) - dynamicExpenses;

  // Compute ledger-based balances for each account code from the Accounting Ledger (ledgerEntries)
  const ledgerBalances = useMemo(() => {
    const balances: Record<string, { totalDebits: number; totalCredits: number; lastActivity: string | null }> = {};
    
    // Seed initial values for all accounts in the Chart of Accounts
    coa.forEach(acc => {
      balances[acc.code] = { totalDebits: 0, totalCredits: 0, lastActivity: null };
    });

    // Populate balances from actual ledgerEntries
    ledgerEntries.forEach(entry => {
      // Only process POSTED journal entries
      if (entry.postingStatus !== 'POSTED') return;

      const postingDate = entry.postingDate || entry.createdAt;

      entry.lines.forEach(line => {
        const code = line.accountCode;
        if (!balances[code]) {
          balances[code] = { totalDebits: 0, totalCredits: 0, lastActivity: null };
        }
        
        balances[code].totalDebits += line.debit || 0;
        balances[code].totalCredits += line.credit || 0;
        
        if (!balances[code].lastActivity || new Date(postingDate) > new Date(balances[code].lastActivity!)) {
          balances[code].lastActivity = postingDate;
        }
      });
    });

    return balances;
  }, [ledgerEntries, coa]);

  // --- Dynamic balances mapping dictionary for System Accounts ---
  const getAccountLiveBalance = (code: string): number => {
    // Map cash code 1010 to 1100 if needed for legacy compatibility
    const resolvedCode = code === '1010' ? '1100' : code;
    const data = ledgerBalances[resolvedCode];
    if (!data) return 0.00;
    
    // Find the account type to determine normal balance
    const account = coa.find(acc => acc.code === resolvedCode);
    const isDebitNormal = account ? account.normalBalance === 'Debit' : true;

    if (isDebitNormal) {
      return data.totalDebits - data.totalCredits;
    } else {
      return data.totalCredits - data.totalDebits;
    }
  };

  const getAccountDebits = (code: string): number => {
    const resolvedCode = code === '1010' ? '1100' : code;
    return ledgerBalances[resolvedCode]?.totalDebits || 0;
  };

  const getAccountCredits = (code: string): number => {
    const resolvedCode = code === '1010' ? '1100' : code;
    return ledgerBalances[resolvedCode]?.totalCredits || 0;
  };

  const getAccountLastActivity = (code: string): string | null => {
    const resolvedCode = code === '1010' ? '1100' : code;
    return ledgerBalances[resolvedCode]?.lastActivity || null;
  };

  // --- Sum balances by account types ---
  const typeBalances = useMemo(() => {
    const sums = { Asset: 0, Liability: 0, Equity: 0, Revenue: 0, Expense: 0 };
    coa.forEach(acc => {
      if (acc.status === 'active') {
        sums[acc.type] += getAccountLiveBalance(acc.code);
      }
    });
    return sums;
  }, [coa, ledgerBalances]);

  // --- Search and filter COA ---
  const filteredCOA = useMemo(() => {
    return coa.filter(acc => {
      const matchesSearch = acc.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            acc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (acc.subType || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (acc.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const tabType = activeTab === 'all' ? 'All' : activeTab;
      const matchesTabType = tabType === 'All' || acc.type === tabType;
      
      const matchesStatus = statusFilter === 'All' || acc.status === statusFilter;

      return matchesSearch && matchesTabType && matchesStatus;
    });
  }, [coa, searchTerm, activeTab, statusFilter]);

  // --- Open form modal for creating or editing accounts ---
  const handleOpenModal = (account: ChartOfAccount | null = null) => {
    setEditingAccount(account);
    if (account) {
      setFormCode(account.code);
      setFormName(account.name);
      setFormType(account.type);
      setFormSubType(account.subType || '');
      setFormNormalBalance(account.normalBalance);
      setFormStatus(account.status);
      setFormDescription(account.description || '');
      setFormParentAccount(account.parentAccount || '');
      setFormEditable(account.editable ?? true);
    } else {
      // Find a suitable next code based on typical ranges
      setFormCode('');
      setFormName('');
      setFormType('Asset');
      setFormSubType('');
      setFormNormalBalance('Debit');
      setFormStatus('active');
      setFormDescription('');
      setFormParentAccount('');
      setFormEditable(true);
    }
    setFormError('');
    setIsModalOpen(true);
  };

  // --- Handle Type Changes to align normal balances automatically ---
  useEffect(() => {
    if (!editingAccount) {
      if (formType === 'Asset' || formType === 'Expense') {
        setFormNormalBalance('Debit');
      } else {
        setFormNormalBalance('Credit');
      }
    }
  }, [formType, editingAccount]);

  // --- Save or Update Account ---
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const codeStr = formCode.trim();
    const nameStr = formName.trim();
    
    if (!codeStr || !nameStr) {
      setFormError("Account Code and Name are required fields.");
      return;
    }

    if (!codeStr.match(/^[0-9]+$/)) {
      setFormError("Account Code must consist of numeric characters only.");
      return;
    }

    // Check code prefix consistency
    const firstDigit = codeStr[0];
    const expectedDigit = formType === 'Asset' ? '1' :
                          formType === 'Liability' ? '2' :
                          formType === 'Equity' ? '3' :
                          formType === 'Revenue' ? '4' : '5';
    
    if (firstDigit !== expectedDigit) {
      setFormError(`Accounting standard alignment error: ${formType} codes must begin with the digit '${expectedDigit}'.`);
      return;
    }

    // Check duplicate code
    const isDuplicate = coa.some(acc => acc.code === codeStr && (!editingAccount || acc.id !== editingAccount.id));
    if (isDuplicate) {
      setFormError(`An account with code ${codeStr} already exists.`);
      return;
    }

    const payload: ChartOfAccount = {
      id: editingAccount ? editingAccount.id : `coa-${codeStr}`,
      code: codeStr,
      name: nameStr,
      type: formType,
      subType: formSubType.trim() || undefined,
      parentAccount: formParentAccount ? formParentAccount : undefined,
      normalBalance: formNormalBalance,
      status: formStatus,
      description: formDescription.trim() || undefined,
      isSystem: editingAccount ? editingAccount.isSystem : false,
      editable: editingAccount ? (editingAccount.isSystem ? false : formEditable) : true,
      createdAt: editingAccount?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!auth.currentUser) {
      // Local updates
      let updatedList = [...coa];
      if (editingAccount) {
        updatedList = updatedList.map(acc => acc.id === editingAccount.id ? payload : acc);
        showFeedback(`Account ${codeStr} successfully modified locally.`, 'success');
      } else {
        updatedList.push(payload);
        showFeedback(`New Account ${codeStr} successfully created locally.`, 'success');
      }
      setCoa(updatedList.sort((a, b) => a.code.localeCompare(b.code)));
      localStorage.setItem('nexus_chart_of_accounts', JSON.stringify(updatedList));
      setIsModalOpen(false);
      return;
    }

    // Firebase write
    try {
      await setDoc(doc(db, 'chartOfAccounts', payload.id), payload);
      showFeedback(`Account ${payload.code} (${payload.name}) has been successfully saved to Cloud Firestore.`, 'success');
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save Chart of Account:", err);
      handleFirestoreError(err, OperationType.WRITE, `chartOfAccounts/${payload.id}`);
      setFormError("Server validation failed. Please check access permissions.");
    }
  };

  // --- Deactivate or Delete Account ---
  const handleDeleteAccount = async (account: ChartOfAccount) => {
    if (account.isSystem) {
      showFeedback("System protected accounts cannot be deleted or deactivated.", "error");
      return;
    }

    const confirmAction = window.confirm(`Are you sure you want to permanently delete account ${account.code} - ${account.name}?`);
    if (!confirmAction) return;

    if (!auth.currentUser) {
      const updatedList = coa.filter(acc => acc.id !== account.id);
      setCoa(updatedList);
      localStorage.setItem('nexus_chart_of_accounts', JSON.stringify(updatedList));
      showFeedback(`Account ${account.code} was deleted locally.`, "success");
      return;
    }

    try {
      await deleteDoc(doc(db, 'chartOfAccounts', account.id));
      showFeedback(`Account ${account.code} was successfully removed from Cloud Firestore.`, "success");
    } catch (err) {
      console.error("Failed to delete Chart of Account:", err);
      handleFirestoreError(err, OperationType.DELETE, `chartOfAccounts/${account.id}`);
      showFeedback("Server validation error: Unable to complete account deletion.", "error");
    }
  };

  // --- Print Chart of Accounts ---
  const handlePrintCOA = () => {
    window.print();
  };

  // --- Export COA CSV ---
  const handleExportCSV = () => {
    const headers = ['Account Code', 'Account Name', 'Type', 'Subtype', 'Normal Balance', 'Live Balance', 'Status', 'System Protected', 'Description'];
    const rows = coa.map(acc => [
      acc.code,
      acc.name,
      acc.type,
      acc.subType || '',
      acc.normalBalance,
      getAccountLiveBalance(acc.code).toFixed(2),
      acc.status,
      acc.isSystem ? 'Yes' : 'No',
      acc.description || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `nexus_erp_coa_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showFeedback("Chart of Accounts successfully exported to CSV.", "success");
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-150 rounded-full px-2.5 py-1 text-[10px] font-bold text-indigo-700 tracking-wide uppercase">
            <BookOpen className="h-3 w-3" /> Core Ledger Architecture
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Enterprise Chart of Accounts (COA)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Accounting foundation mapping dynamic transacting balances. Safe-net secured.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrintCOA}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl hover:bg-slate-50 transition"
          >
            <Printer className="h-3.5 w-3.5 text-slate-400" />
            <span>Print List</span>
          </button>
          
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl hover:bg-slate-50 transition"
          >
            <Download className="h-3.5 w-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          {canManageCOA && (
            <button
              type="button"
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-xs font-bold text-white rounded-xl hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus className="h-4 w-4" />
              <span>Create Account</span>
            </button>
          )}
        </div>
      </div>

      {/* FEEDBACK FEED */}
      {feedback && (
        <div className={`p-4 rounded-2xl border flex items-start gap-3 transition-all print:hidden ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <span className="text-xs font-semibold">{feedback.message}</span>
        </div>
      )}

      {/* REACTION & BALANCE SHEET INTEGRATION INDICATOR (PRINT ONLY) */}
      <div className="hidden print:block border-b border-slate-300 pb-4 mb-4">
        <h1 className="text-2xl font-bold text-slate-900">NEXUS ERP - Enterprise Chart of Accounts</h1>
        <p className="text-xs text-slate-500">Corporate Balance Summary Sheet. Date Issued: {new Date().toLocaleDateString()}</p>
      </div>

      {/* DUAL-ENTRY SUMMARIES Bento Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">1xxx - Assets</span>
            <div className="p-1 bg-emerald-50 text-emerald-600 rounded-lg">
              <Scale className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-black text-slate-900 font-mono">
              {formatCurrency(typeBalances.Asset)}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Debit Normal Balance</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">2xxx - Liabilities</span>
            <div className="p-1 bg-rose-50 text-rose-600 rounded-lg">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-black text-slate-900 font-mono">
              {formatCurrency(typeBalances.Liability)}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Credit Normal Balance</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">3xxx - Equity</span>
            <div className="p-1 bg-indigo-50 text-indigo-600 rounded-lg">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-black text-slate-900 font-mono">
              {formatCurrency(typeBalances.Equity)}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Credit Normal Balance</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">4xxx - Revenues</span>
            <div className="p-1 bg-violet-50 text-violet-600 rounded-lg">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-black text-slate-900 font-mono">
              {formatCurrency(typeBalances.Revenue)}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Credit Normal Balance</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">5xxx - Expenses</span>
            <div className="p-1 bg-amber-50 text-amber-600 rounded-lg">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-black text-slate-900 font-mono">
              {formatCurrency(typeBalances.Expense)}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Debit Normal Balance</p>
          </div>
        </div>
      </div>

      {/* FILTER BAR & TAB SELECTORS */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        {/* Type Tabs */}
        <div className="flex gap-1 overflow-x-auto p-0.5 bg-slate-100 rounded-xl max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
              activeTab === 'all'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Accounts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Asset')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
              activeTab === 'Asset'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Assets (1xxx)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Liability')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
              activeTab === 'Liability'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Liabilities (2xxx)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Equity')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
              activeTab === 'Equity'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Equity (3xxx)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Revenue')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
              activeTab === 'Revenue'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Revenue (4xxx)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Expense')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
              activeTab === 'Expense'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Expenses (5xxx)
          </button>
        </div>

        {/* Search and Secondary Filter */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Code or Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 text-xs font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64"
            />
          </div>

          <div className="relative shrink-0">
            <Filter className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="pl-8 pr-4 py-2 bg-white border border-slate-200 text-xs font-bold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[right_8px_center] bg-no-repeat w-full md:w-36"
            >
              <option value="All">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABLE/TREE OF ACCOUNTS */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-6">Account Code</th>
                <th className="py-3.5 px-4">Account Name</th>
                <th className="py-3.5 px-4">Accounting Type</th>
                <th className="py-3.5 px-4">Parent Account</th>
                <th className="py-3.5 px-4">Subtype Category</th>
                <th className="py-3.5 px-4">Normal Balance</th>
                <th className="py-3.5 px-4 text-right">Total Debits</th>
                <th className="py-3.5 px-4 text-right">Total Credits</th>
                <th className="py-3.5 px-4 text-right">Current Ledger Balance</th>
                <th className="py-3.5 px-4 text-center">Last Activity</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-6 text-right print:hidden">Ledger Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400 font-mono">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
                      <span>Retrieving dual-entry ledger accounts...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCOA.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400 font-medium">
                    No ledger accounts matched your active queries and parameters.
                  </td>
                </tr>
              ) : (
                filteredCOA.map(acc => {
                  const liveBal = getAccountLiveBalance(acc.code);
                  const parentAcc = coa.find(p => p.code === acc.parentAccount);
                  const totalDebits = getAccountDebits(acc.code);
                  const totalCredits = getAccountCredits(acc.code);
                  const lastAct = getAccountLastActivity(acc.code);
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-6 font-mono font-bold text-slate-900 flex items-center gap-1.5">
                        {acc.isSystem && <Lock className="h-3 w-3 text-indigo-500" title="System Locked Account" />}
                        <span>{acc.code}</span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        <div>
                          <span>{acc.name}</span>
                          {acc.description && (
                            <p className="text-[10px] text-slate-400 font-normal mt-0.5 max-w-md line-clamp-1">
                              {acc.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          acc.type === 'Asset' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' :
                          acc.type === 'Liability' ? 'bg-rose-50 text-rose-700 border border-rose-150' :
                          acc.type === 'Equity' ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' :
                          acc.type === 'Revenue' ? 'bg-violet-50 text-violet-700 border border-violet-150' :
                          'bg-amber-50 text-amber-700 border border-amber-150'
                        }`}>
                          {acc.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {parentAcc ? (
                          <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md font-semibold text-[11px]">
                            {parentAcc.code} - {parentAcc.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-medium">{acc.subType || 'General Account'}</td>
                      <td className="py-3 px-4 text-slate-500 font-bold">{acc.normalBalance}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 font-medium">
                        {formatCurrency(totalDebits)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 font-medium">
                        {formatCurrency(totalCredits)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900 text-sm">
                        {formatCurrency(liveBal)}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500 font-mono text-[11px]">
                        {lastAct ? new Date(lastAct).toLocaleDateString() : <span className="text-slate-300 italic">-</span>}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          acc.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' 
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {acc.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right print:hidden">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManageCOA ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenModal(acc)}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                title={acc.isSystem ? "Edit description & details" : "Full account edit"}
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleDeleteAccount(acc)}
                                disabled={acc.isSystem}
                                className={`p-1 rounded-lg transition ${
                                  acc.isSystem 
                                    ? 'text-slate-200 cursor-not-allowed' 
                                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                }`}
                                title={acc.isSystem ? "System protected accounts cannot be removed." : "Delete Account"}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium font-mono">Read Only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DUAL-ENTRY SYSTEM POSTING MATRIX (ACCOUNTING CHEAT-SHEET) */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 print:hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          <div>
            <h4 className="text-xs font-bold text-slate-900">Corporate Transaction Mapping Matrix</h4>
            <p className="text-[10px] text-slate-500">How physical business operations integrate and post to the Chart of Accounts.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600">
          <div className="bg-white border border-slate-150 rounded-2xl p-4 space-y-3">
            <h5 className="font-bold text-indigo-900 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
              Sales & Revenue posting
            </h5>
            <div className="space-y-1.5 text-[11px] font-mono leading-relaxed">
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span>1. Cash Sales</span>
                <span className="text-emerald-700">+1010 Cash / +4100 Sales</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span>2. Credit Sales</span>
                <span className="text-indigo-700">+1200 AR / +4100 Sales</span>
              </div>
              <div className="flex justify-between">
                <span>3. Real-Time COGS</span>
                <span className="text-amber-700">+5100 COGS / -1300 Stock</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-150 rounded-2xl p-4 space-y-3">
            <h5 className="font-bold text-emerald-900 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
              Procurement & Inventory posting
            </h5>
            <div className="space-y-1.5 text-[11px] font-mono leading-relaxed">
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span>1. Cash Purchase</span>
                <span className="text-emerald-700">+1300 Stock / -1010 Cash</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span>2. Credit Purchase</span>
                <span className="text-rose-700">+1300 Stock / +2100 AP</span>
              </div>
              <div className="flex justify-between">
                <span>3. AP Payments</span>
                <span className="text-indigo-700">-2100 AP / -1010 Cash</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-150 rounded-2xl p-4 space-y-3">
            <h5 className="font-bold text-rose-900 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-600"></span>
              Capital & Expense posting
            </h5>
            <div className="space-y-1.5 text-[11px] font-mono leading-relaxed">
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span>1. Seed Capital</span>
                <span className="text-emerald-700">+1010 Cash / +3100 Capital</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span>2. Corporate Expense</span>
                <span className="text-rose-700">+5200 Expense / -1010 Cash</span>
              </div>
              <div className="flex justify-between">
                <span>3. VAT Collection</span>
                <span className="text-indigo-700">+1010 Cash / +2200 VAT</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CREATE/EDIT MODAL OVERLAY */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xl max-w-lg w-full relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <FolderTree className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-900">
                    {editingAccount ? `Configure Account: ${editingAccount.code}` : "Introduce New Ledger Account"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {formError && (
                <div className="p-3 mb-4 bg-rose-50 border border-rose-150 rounded-2xl text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSaveAccount} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Account Code */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Account Code
                    </label>
                    <input
                      type="text"
                      placeholder={
                        formType === 'Asset' ? '1xxx (e.g. 1030)' :
                        formType === 'Liability' ? '2xxx (e.g. 2150)' :
                        formType === 'Equity' ? '3xxx (e.g. 3300)' :
                        formType === 'Revenue' ? '4xxx (e.g. 4200)' : '5xxx (e.g. 5300)'
                      }
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      disabled={!!editingAccount && editingAccount.isSystem}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-semibold font-mono rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      required
                    />
                  </div>

                  {/* Account Type */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Accounting Type
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as any)}
                      disabled={!!editingAccount && editingAccount.isSystem}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[right_8px_center] bg-no-repeat"
                      required
                    >
                      <option value="Asset">Asset (1xxx)</option>
                      <option value="Liability">Liability (2xxx)</option>
                      <option value="Equity">Equity (3xxx)</option>
                      <option value="Revenue">Revenue (4xxx)</option>
                      <option value="Expense">Expense (5xxx)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Account Name */}
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Account Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cash Clearing Account"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Subtype Category */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Subtype Category
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Current Asset, Fixed Asset"
                      value={formSubType}
                      onChange={(e) => setFormSubType(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Normal Balance */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Normal Balance
                    </label>
                    <select
                      value={formNormalBalance}
                      onChange={(e) => setFormNormalBalance(e.target.value as any)}
                      disabled={!!editingAccount && editingAccount.isSystem}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[right_8px_center] bg-no-repeat"
                      required
                    >
                      <option value="Debit">Debit</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Parent Account */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Parent Account
                    </label>
                    <select
                      value={formParentAccount}
                      onChange={(e) => setFormParentAccount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[right_8px_center] bg-no-repeat"
                    >
                      <option value="">None (Top-Level Category)</option>
                      {coa
                        .filter(acc => !editingAccount || acc.code !== editingAccount.code)
                        .map(acc => (
                          <option key={acc.id} value={acc.code}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Editable */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      User Editable
                    </label>
                    <select
                      value={formEditable ? "true" : "false"}
                      onChange={(e) => setFormEditable(e.target.value === "true")}
                      disabled={!!editingAccount && editingAccount.isSystem}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[right_8px_center] bg-no-repeat"
                    >
                      <option value="true">Yes</option>
                      <option value="false">No (Lock Account)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Status */}
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Status
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="formStatus"
                          value="active"
                          checked={formStatus === 'active'}
                          onChange={() => setFormStatus('active')}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Active</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="formStatus"
                          value="inactive"
                          checked={formStatus === 'inactive'}
                          onChange={() => setFormStatus('inactive')}
                          disabled={!!editingAccount && editingAccount.isSystem}
                          className="text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span className={!!editingAccount && editingAccount.isSystem ? "text-slate-400 cursor-not-allowed" : ""}>Inactive</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Account Description
                  </label>
                  <textarea
                    placeholder="Enter purpose or mapping details of this account..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-xs font-bold text-slate-700 rounded-xl hover:bg-slate-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-xs font-bold text-white rounded-xl hover:bg-indigo-700 shadow-sm transition"
                  >
                    {editingAccount ? "Save Configuration" : "Deploy Account"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

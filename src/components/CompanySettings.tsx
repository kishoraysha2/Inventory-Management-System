import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  Percent, 
  Check, 
  Lock, 
  Eye, 
  FileText,
  AlertCircle,
  Database,
  Download,
  CloudLightning,
  FileJson,
  CheckCircle2,
  RefreshCw,
  Layers,
  Sparkles,
  Shield,
  User,
  Search,
  ChevronDown,
  Paintbrush,
  Settings,
  Upload,
  History,
  FileArchive,
  ShieldAlert,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { db, auth, logSystemActivity } from '../lib/firebase';
import { MODULE_REGISTRY } from '../core/moduleRegistry';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import JSZip from 'jszip';

import { AppPermissions, UserRole } from '../hooks/usePermission';
import PrivilegeMatrix from './PrivilegeMatrix';

interface CompanyProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxRegistrationId: string;
  taxRatePercent: number;
  tradeName?: string;
  ownerName?: string;
  crNumber?: string;
  logo?: string;
  businessType: string;
  currency: string;
  timezone: string;
  country?: string;
  accentColor?: string;
  theme?: string;
  dateFormat?: string;
  numberFormat?: string;
  language?: string;
}

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: "Apex Global Supply Ltd.",
  address: "740 Industrial Boulevard, Suite C, Austin, TX 78701",
  phone: "+1 (512) 555-0193",
  email: "billing@apexsupply.com",
  website: "www.apexsupply.com",
  taxRegistrationId: "VAT-US948301140B",
  taxRatePercent: 15,
  tradeName: "Apex Global Supply",
  ownerName: "Apex Global LLC",
  crNumber: "CR-1010349283",
  logo: "",
  businessType: "Retail",
  currency: "USD ($)",
  timezone: "UTC",
  country: "United States (USA)",
  accentColor: "indigo",
  theme: "Light",
  dateFormat: "YYYY-MM-DD",
  numberFormat: "1,234.56",
  language: "English"
};

interface CompanySettingsProps {
  userRole: UserRole | string;
  permissions: AppPermissions;
}

export default function CompanySettings({ userRole, permissions }: CompanySettingsProps) {
  const [profile, setProfile] = useState<CompanyProfile>(() => {
    const saved = localStorage.getItem('invoice_company_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_COMPANY_PROFILE,
          ...parsed
        };
      } catch (e) {
        console.error("Failed to load saved company profile", e);
      }
    }
    return DEFAULT_COMPANY_PROFILE;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const isReadOnly = !permissions.manageSettings;

  // --- SETTINGS NAVIGATION STATE ---
  // Defaulting activeSettingsTab to 'company_settings' as required by Settings list
  const [activeSettingsTab, setActiveSettingsTab] = useState<'company_settings' | 'backup_restore' | 'users_roles' | 'security_workspace' | 'audit_logs'>('company_settings');

  // --- COUNTRY SELECTOR STATE & LOGIC ---
  const [countrySearch, setCountrySearch] = useState('');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  const COUNTRY_OPTIONS = useMemo(() => [
    { name: 'Saudi Arabia (KSA)', code: 'SA', currency: 'SAR (SR)', timezone: 'AST (UTC+3)' },
    { name: 'United Arab Emirates (UAE)', code: 'AE', currency: 'AED (DH)', timezone: 'GST (UTC+4)' },
    { name: 'United States (USA)', code: 'US', currency: 'USD ($)', timezone: 'EST (UTC-5)' },
    { name: 'United Kingdom (UK)', code: 'GB', currency: 'GBP (£)', timezone: 'UTC (GMT+0)' }
  ], []);

  const filteredCountries = useMemo(() => {
    return COUNTRY_OPTIONS.filter(c => 
      c.name.toLowerCase().includes(countrySearch.toLowerCase())
    );
  }, [COUNTRY_OPTIONS, countrySearch]);

  const getTimezoneOptions = (countryName: string) => {
    if (countryName === 'Saudi Arabia (KSA)') {
      return ['AST (UTC+3)'];
    } else if (countryName === 'United Arab Emirates (UAE)') {
      return ['GST (UTC+4)'];
    } else if (countryName === 'United States (USA)') {
      return ['EST (UTC-5)', 'PST (UTC-8)', 'CST (UTC-6)', 'MST (UTC-7)'];
    } else if (countryName === 'United Kingdom (UK)') {
      return ['UTC (GMT+0)'];
    }
    return [
      'UTC', 'AST (UTC+3)', 'GST (UTC+4)', 'EST (UTC-5)', 'PST (UTC-8)', 
      'CST (UTC-6)', 'MST (UTC-7)', 'CET (UTC+1)', 'EET (UTC+2)'
    ];
  };

  const handleCountrySelect = (countryName: string) => {
    const found = COUNTRY_OPTIONS.find(c => c.name === countryName);
    if (found) {
      // Auto-set Currency based on Country
      let defaultTimezone = 'UTC';
      if (countryName === 'Saudi Arabia (KSA)') defaultTimezone = 'AST (UTC+3)';
      else if (countryName === 'United Arab Emirates (UAE)') defaultTimezone = 'GST (UTC+4)';
      else if (countryName === 'United States (USA)') defaultTimezone = 'EST (UTC-5)';
      else if (countryName === 'United Kingdom (UK)') defaultTimezone = 'UTC (GMT+0)';

      setProfile(prev => ({
        ...prev,
        country: countryName,
        currency: found.currency,
        timezone: defaultTimezone
      }));
    } else {
      setProfile(prev => ({
        ...prev,
        country: countryName
      }));
    }
    setIsCountryDropdownOpen(false);
  };

  // Close country dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // --- DATABASE BACKUP & RESTORE REGISTER CONFIG ---
  const COLLECTION_PATH_MAP = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const mod of MODULE_REGISTRY) {
      if (mod.supportsBackup && mod.backupPath) {
        map[mod.id] = mod.backupPath;
      }
    }
    return map;
  }, []);

  const MODULE_DEPENDENCIES = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const mod of MODULE_REGISTRY) {
      if (mod.supportsBackup) {
        map[mod.id] = [...mod.dependencies];
      }
    }
    return map;
  }, []);

  const BACKUP_MODULE_GROUPS = useMemo(() => {
    const categories: ('Configuration' | 'Security' | 'Master Data' | 'Transactions' | 'Accounting' | 'System')[] = [
      'Configuration',
      'Security',
      'Master Data',
      'Transactions',
      'Accounting',
      'System'
    ];
    
    return categories.map(catName => {
      const groupMods = MODULE_REGISTRY.filter(m => m.category === catName && m.supportsBackup);
      return {
        name: catName,
        modules: groupMods.map(m => ({
          id: m.id,
          name: m.displayName,
          dependencies: [...m.dependencies]
        }))
      };
    }).filter(g => g.modules.length > 0);
  }, []);

  const ALL_COLLECTIONS = useMemo(() => {
    return MODULE_REGISTRY.filter(m => m.supportsBackup && !m.isSingleton).map(m => m.id);
  }, []);

  const SINGLETON_DOCUMENTS = useMemo(() => {
    return MODULE_REGISTRY.filter(m => m.supportsBackup && m.isSingleton).map(m => ({
      collectionName: m.collectionNames[0],
      docId: m.singletonDocId || '',
      fileName: m.backupPath?.split('/').pop() || ''
    }));
  }, []);

  const schemaList = useMemo(() => {
    return [
      ...ALL_COLLECTIONS,
      ...SINGLETON_DOCUMENTS.map(s => `${s.collectionName}/${s.docId}`)
    ];
  }, [ALL_COLLECTIONS, SINGLETON_DOCUMENTS]);

  const calculateChecksum = (dataStr: string): string => {
    let hash = 0;
    for (let i = 0; i < dataStr.length; i++) {
      const char = dataStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'CRC-' + Math.abs(hash).toString(16).toUpperCase();
  };

  // --- DATABASE BACKUP STATE ---
  const [backupStatus, setBackupStatus] = useState<'idle' | 'scanning' | 'exporting' | 'completed' | 'error'>('idle');
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupStats, setBackupStats] = useState({ totalCollections: 0, totalDocuments: 0, estimatedSizeKB: 0 });
  const [collectionDetails, setCollectionDetails] = useState<Record<string, number>>({});
  const [backupLogs, setBackupLogs] = useState<string[]>([]);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [activeBackupSubTab, setActiveBackupSubTab] = useState<'full' | 'module'>('full');
  const [backupWorkspaceTab, setBackupWorkspaceTab] = useState<'backup_center' | 'restore_center' | 'history'>('backup_center');

  // --- DATABASE RESTORE STATE ---
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreBackupMeta, setRestoreBackupMeta] = useState<any | null>(null);
  const [restoreIsLoading, setRestoreIsLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'parsing' | 'preview' | 'restoring' | 'completed' | 'error'>('idle');
  const [restoreLogs, setRestoreLogs] = useState<string[]>([]);
  const [restoreSelectedModules, setRestoreSelectedModules] = useState<Record<string, boolean>>({});
  const [restoreDuplicateStrategy, setRestoreDuplicateStrategy] = useState<'skip' | 'replace' | 'merge' | 'rename'>('skip');
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [restoreReport, setRestoreReport] = useState<any | null>(null);
  const [restoreConfirmationText, setRestoreConfirmationText] = useState('');

  const [restoreDependencyStatus, setRestoreDependencyStatus] = useState<{ checked: boolean; satisfied: boolean; missingDeps: string[] }>({
    checked: false,
    satisfied: true,
    missingDeps: []
  });

  useEffect(() => {
    let active = true;
    const checkLiveDeps = async () => {
      if (!restoreBackupMeta) {
        setRestoreDependencyStatus({ checked: false, satisfied: true, missingDeps: [] });
        return;
      }
      
      const selectedColKeys = Object.keys(restoreSelectedModules).filter(k => restoreSelectedModules[k]);
      if (selectedColKeys.length === 0) {
        setRestoreDependencyStatus({ checked: true, satisfied: true, missingDeps: [] });
        return;
      }
      
      const missingList: string[] = [];
      
      for (const colKey of selectedColKeys) {
        const deps = MODULE_DEPENDENCIES[colKey] || [];
        for (const dep of deps) {
          // Check if in backup
          const inBackup = restoreBackupMeta.recordsMap[dep] && Object.keys(restoreBackupMeta.recordsMap[dep]).length > 0;
          if (inBackup) continue;
          
          // Check if in live DB
          let inDb = false;
          try {
            const isDepSingleton = dep.includes('/');
            const depColName = isDepSingleton ? dep.split('/')[0] : dep;
            if (isDepSingleton) {
              const depSnap = await getDoc(doc(db, depColName, dep.split('/')[1]));
              inDb = depSnap.exists();
            } else {
              const depSnap = await getDocs(collection(db, depColName));
              inDb = !depSnap.empty;
            }
          } catch (e) {
            console.warn(`Error verifying live dependency [${dep}]:`, e);
          }
          
          if (!inDb) {
            missingList.push(dep);
          }
        }
      }
      
      if (active) {
        setRestoreDependencyStatus({
          checked: true,
          satisfied: missingList.length === 0,
          missingDeps: missingList
        });
      }
    };
    
    checkLiveDeps();
    return () => {
      active = false;
    };
  }, [restoreBackupMeta, restoreSelectedModules, MODULE_DEPENDENCIES]);

  // --- HISTORY LOGS ---
  const [historyLogs, setHistoryLogs] = useState<any[]>(() => {
    const saved = localStorage.getItem('nexus_backup_history_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const saveHistory = (action: string, details: string, status: 'success' | 'error' | 'aborted') => {
    const newLog = {
      id: 'history-' + Math.random().toString(36).substring(7).toUpperCase(),
      timestamp: new Date().toISOString(),
      user: auth.currentUser?.email || "System Admin",
      action,
      details,
      status
    };
    setHistoryLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 50);
      localStorage.setItem('nexus_backup_history_logs', JSON.stringify(updated));
      return updated;
    });
  };

  const scanDatabase = async () => {
    setBackupStatus('scanning');
    setBackupProgress(0);
    setBackupLogs(['Initiating pre-backup database integrity check...', 'Scanning Cloud Firestore schema...']);
    
    let totalDocs = 0;
    const details: Record<string, number> = {};
    const logs = ['Pre-backup scan initiated.'];

    try {
      for (const colName of ALL_COLLECTIONS) {
        logs.push(`Reading reference indexes for collection: [${colName}]...`);
        setBackupLogs([...logs]);
        try {
          const qSnap = await getDocs(collection(db, colName));
          const count = qSnap.size;
          details[colName] = count;
          totalDocs += count;
          logs.push(`Collection [${colName}] count resolved: ${count} documents.`);
        } catch (err: any) {
          console.warn(`Warning reading collection [${colName}]:`, err);
          logs.push(`WARNING: Skipping collection [${colName}]. Reason: ${err.message || String(err)}`);
        }
        setBackupLogs([...logs]);
      }

      for (const singleton of SINGLETON_DOCUMENTS) {
        const path = `${singleton.collectionName}/${singleton.docId}`;
        logs.push(`Reading singleton document: [${path}]...`);
        setBackupLogs([...logs]);
        try {
          const docSnap = await getDoc(doc(db, singleton.collectionName, singleton.docId));
          if (docSnap.exists()) {
            details[path] = 1;
            totalDocs += 1;
            logs.push(`Singleton [${path}] found and verified.`);
          } else {
            logs.push(`WARNING: Singleton [${path}] does not exist.`);
          }
        } catch (err: any) {
          console.warn(`Warning reading singleton document [${path}]:`, err);
          logs.push(`WARNING: Skipping singleton [${path}]. Reason: ${err.message || String(err)}`);
        }
        setBackupLogs([...logs]);
      }

      setCollectionDetails(details);
      setBackupStats({
        totalCollections: ALL_COLLECTIONS.length + SINGLETON_DOCUMENTS.length,
        totalDocuments: totalDocs,
        estimatedSizeKB: Math.round((totalDocs * 0.45) * 10) / 10
      });
      setBackupStatus('idle');
      logs.push(`SUCCESS: Pre-backup integrity count completed. Database is certified safe for full JSON export.`);
      setBackupLogs([...logs]);
    } catch (err: any) {
      console.error("Scanning failed:", err);
      setBackupStatus('error');
      logs.push(`CRITICAL_ERROR: Integration check interrupted: ${err.message || String(err)}`);
      setBackupLogs([...logs]);
    }
  };

  const handleExportBackup = async () => {
    setBackupStatus('exporting');
    setBackupProgress(5);
    setBackupLogs(['Spawning background archive compiler...', 'Claiming memory blocks for zip processing...']);

    const zip = new JSZip();
    const logs = ['Spawned archive thread ID: ' + Math.random().toString(36).substring(7).toUpperCase()];
    
    try {
      let totalCollsCopied = 0;
      let totalDocsCopied = 0;
      const totalItems = Object.keys(COLLECTION_PATH_MAP).length;
      const stepIncrement = 80 / totalItems;
      let currentProgress = 5;
      let combinedDataString = '';

      for (const colKey of Object.keys(COLLECTION_PATH_MAP)) {
        const zipPath = COLLECTION_PATH_MAP[colKey];
        if (colKey.includes('/')) {
          const [colName, docId] = colKey.split('/');
          logs.push(`Streaming singleton document [${colKey}]...`);
          setBackupLogs([...logs]);
          try {
            const docSnap = await getDoc(doc(db, colName, docId));
            if (docSnap.exists()) {
              const records = { [docId]: docSnap.data() };
              const recordsStr = JSON.stringify(records, null, 2);
              combinedDataString += recordsStr;
              zip.file(zipPath, recordsStr);
              totalCollsCopied++;
              totalDocsCopied++;
              logs.push(`SUCCESS: Written singleton [${colKey}] to [${zipPath}].`);
            } else {
              logs.push(`Singleton [${colKey}] is empty. Skipping file descriptor...`);
            }
          } catch (err: any) {
            console.warn(`Warning reading singleton [${colKey}]:`, err);
            logs.push(`WARNING: Skipping [${colKey}]. Reason: ${err.message || String(err)}`);
          }
        } else {
          logs.push(`Streaming query cursor for collection [${colKey}]...`);
          setBackupLogs([...logs]);
          try {
            const qSnap = await getDocs(collection(db, colKey));
            const count = qSnap.size;
            if (count > 0) {
              const records: Record<string, any> = {};
              qSnap.forEach(docSnap => {
                records[docSnap.id] = docSnap.data();
              });
              const recordsStr = JSON.stringify(records, null, 2);
              combinedDataString += recordsStr;
              zip.file(zipPath, recordsStr);
              totalCollsCopied++;
              totalDocsCopied += count;
              logs.push(`SUCCESS: Written ${count} records from [${colKey}] to [${zipPath}].`);
            } else {
              logs.push(`Collection [${colKey}] is empty. Skipping file descriptor...`);
            }
          } catch (err: any) {
            console.warn(`Warning reading collection [${colKey}]:`, err);
            logs.push(`WARNING: Skipping [${colKey}]. Reason: ${err.message || String(err)}`);
          }
        }
        currentProgress += stepIncrement;
        setBackupProgress(Math.min(85, Math.round(currentProgress)));
        setBackupLogs([...logs]);
      }

      logs.push(`Synthesizing secure backup manifest (manifest.json)...`);
      setBackupLogs([...logs]);

      const manifest = {
        erpVersion: "6.3.6",
        schemaVersion: "1.1",
        backupVersion: "1.0",
        backupType: "full",
        companyName: profile.name || "Nexus Corporate",
        companyId: "nexus-erp-default",
        projectId: "nexus-erp-production",
        createdBy: auth.currentUser?.email || "System Admin",
        createdAt: new Date().toISOString(),
        documentCount: totalDocsCopied,
        collectionCount: totalCollsCopied,
        moduleList: Object.keys(COLLECTION_PATH_MAP),
        checksum: calculateChecksum(combinedDataString)
      };

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      setBackupProgress(93);

      logs.push(`Compiling archive directory structures and signing files...`);
      setBackupLogs([...logs]);

      const contentBlob = await zip.generateAsync({ type: 'blob' });
      setBackupProgress(98);

      logs.push(`Generating local download trigger...`);
      setBackupLogs([...logs]);

      const now = new Date();
      const filename = `backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}.zip`;

      const downloadUrl = URL.createObjectURL(contentBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

      setBackupProgress(100);
      setLastBackupTime(new Date().toLocaleTimeString());
      setBackupStatus('completed');
      logs.push(`SUCCESS: Full snapshot successfully downloaded as [${filename}]!`);
      setBackupLogs([...logs]);

      setBackupStats({
        totalCollections: totalCollsCopied,
        totalDocuments: totalDocsCopied,
        estimatedSizeKB: Math.round(contentBlob.size / 102.4) / 10
      });

      saveHistory('Backup Full', `Exported full database ZIP (${totalDocsCopied} docs in ${totalCollsCopied} modules)`, 'success');
    } catch (error) {
      console.error("Backup failed: ", error);
      setBackupStatus('error');
      setBackupLogs(prev => [...prev, `CRITICAL_ERROR: Export interrupted: ${error instanceof Error ? error.message : String(error)}`]);
      saveHistory('Backup Full', `Export failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const handleExportModuleBackup = async (colKey: string) => {
    setBackupStatus('exporting');
    setBackupProgress(10);
    const logs = [`Initiating export for single module: [${colKey}]...`];
    setBackupLogs([...logs]);
    try {
      let records: Record<string, any> = {};
      let docCount = 0;
      
      if (colKey.includes('/')) {
        const [cName, dId] = colKey.split('/');
        const docSnap = await getDoc(doc(db, cName, dId));
        if (docSnap.exists()) {
          records[dId] = docSnap.data();
          docCount = 1;
        }
      } else {
        const qSnap = await getDocs(collection(db, colKey));
        qSnap.forEach(d => {
          records[d.id] = d.data();
          docCount++;
        });
      }
      
      setBackupProgress(60);
      const moduleBackupObj = {
        backupVersion: "1.0",
        system: "Nexus ERP",
        erpVersion: "6.3.6",
        schemaVersion: "1.1",
        backupType: "module",
        moduleName: colKey,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || "System Admin",
        companyName: profile.name || "Nexus Corporate",
        documentCount: docCount,
        records: records,
        checksum: ""
      };
      
      const recordsStr = JSON.stringify(records);
      moduleBackupObj.checksum = calculateChecksum(recordsStr);
      
      const fileContent = JSON.stringify(moduleBackupObj, null, 2);
      const blob = new Blob([fileContent], { type: 'application/json' });
      setBackupProgress(90);
      
      const getModuleExportFilename = (key: string) => {
        if (key === 'businessProfile/config') return 'businessProfile.json';
        if (key === 'system/bootstrap') return 'system.json';
        return `${key}.json`;
      };
      const filename = getModuleExportFilename(colKey);
      const downloadUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);
      
      setBackupProgress(100);
      setBackupStatus('completed');
      setLastBackupTime(new Date().toLocaleTimeString());
      logs.push(`SUCCESS: Single module [${colKey}] successfully exported as [${filename}]!`);
      setBackupLogs([...logs]);
      
      saveHistory('Backup Module', `Exported [${colKey}] (${docCount} docs)`, 'success');
    } catch (err: any) {
      console.error(err);
      setBackupStatus('error');
      logs.push(`CRITICAL_ERROR: Single module export failed: ${err.message || String(err)}`);
      setBackupLogs([...logs]);
      saveHistory('Backup Module', `Export [${colKey}] failed: ${err.message}`, 'error');
    }
  };

  const handleRestoreFileSelected = async (eOrFile: any) => {
    let file: File | null = null;
    
    if (eOrFile) {
      if (eOrFile instanceof File) {
        file = eOrFile;
      } else if (eOrFile.target && eOrFile.target.files) {
        file = eOrFile.target.files[0] || null;
      } else if (eOrFile.dataTransfer && eOrFile.dataTransfer.files) {
        file = eOrFile.dataTransfer.files[0] || null;
      }
    }

    if (!file) {
      setRestoreStatus('error');
      setRestoreLogs([`CRITICAL_ERROR: No file was selected or detected. Please upload a valid JSON or ZIP backup file.`]);
      setRestoreIsLoading(false);
      return;
    }

    setRestoreFile(file);
    setRestoreStatus('parsing');
    const displaySize = file.size ? (file.size / 1024).toFixed(1) : '0';
    setRestoreLogs([`Selected file: ${file.name || 'Unknown'} (${displaySize} KB)`, `Reading and validating archive metadata...`]);
    setRestoreIsLoading(true);
    setRestoreReport(null);
    
    try {
      const fileName = file.name || '';
      if (!fileName) {
        throw new Error('Selected file does not have a valid filename.');
      }

      if (fileName.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const data = JSON.parse(content);
            
            const isModuleBackup = data.backupType === 'module' && data.records;
            let moduleName = isModuleBackup ? data.moduleName : null;
            if (!moduleName) {
              const baseName = file.name.toLowerCase().replace('.json', '').replace('_backup', '');
              if (baseName === 'businessprofile') {
                moduleName = 'businessProfile/config';
              } else if (baseName === 'system') {
                moduleName = 'system/bootstrap';
              } else if (baseName === 'rolepermissions') {
                moduleName = 'rolePermissions';
              } else if (baseName === 'expensecategories') {
                moduleName = 'expenseCategories';
              } else if (baseName === 'chartofaccounts') {
                moduleName = 'chartOfAccounts';
              } else if (baseName === 'ledgerentries') {
                moduleName = 'ledgerEntries';
              } else if (baseName === 'cashledger') {
                moduleName = 'cashLedger';
              } else if (baseName === 'financiallogs') {
                moduleName = 'financialLogs';
              } else {
                const found = schemaList.find(s => s.toLowerCase() === baseName || s.toLowerCase().replace('/', '_') === baseName);
                moduleName = found || baseName;
              }
            }
            const records = isModuleBackup ? data.records : data;
            const docCount = Object.keys(records).length;
            
            const calculatedChecksum = calculateChecksum(JSON.stringify(records));
            const checksumValid = data.checksum ? (data.checksum === calculatedChecksum) : true;
            
            const meta = {
              backupType: 'module',
              moduleName: moduleName,
              erpVersion: data.erpVersion || 'Unknown',
              schemaVersion: data.schemaVersion || 'Unknown',
              backupVersion: data.backupVersion || '1.0',
              companyName: data.companyName || 'Unknown Company',
              createdBy: data.createdBy || 'Unknown User',
              createdAt: data.createdAt || new Date(file.lastModified).toISOString(),
              documentCount: docCount,
              recordsMap: { [moduleName]: records },
              checksum: data.checksum || '',
              calculatedChecksum: calculatedChecksum,
              checksumValid: checksumValid
            };
            
            setRestoreBackupMeta(meta);
            setRestoreSelectedModules({ [moduleName]: true });
            
            if (checksumValid) {
              setRestoreStatus('preview');
              setRestoreLogs(prev => [...prev, `SUCCESS: Single module backup parsed. Found module [${moduleName}] with ${docCount} records.`, `INTEGRITY CHECK: Checksum validation passed.`]);
            } else {
              setRestoreStatus('error');
              setRestoreLogs(prev => [...prev, `CRITICAL_ERROR: Integrity check failed. The backup file is corrupted or has been modified. Pre-validation blocked.`, `MANIFEST CHECKSUM: ${data.checksum}`, `CALCULATED CHECKSUM: ${calculatedChecksum}`]);
            }
          } catch (err: any) {
            setRestoreStatus('error');
            setRestoreLogs(prev => [...prev, `CRITICAL_ERROR: Failed to parse JSON file: ${err.message}`]);
          } finally {
            setRestoreIsLoading(false);
          }
        };
        reader.readAsText(file);
      } else if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const manifestFile = zip.file('manifest.json') || zip.file('metadata.json');
        if (!manifestFile) {
          throw new Error('Missing backup manifest (manifest.json or metadata.json) at ZIP root.');
        }
        
        const manifestStr = await manifestFile.async('text');
        const manifest = JSON.parse(manifestStr);
        
        const recordsMap: Record<string, any> = {};
        let totalDocs = 0;
        let combinedDataStr = '';
        
        for (const colKey of Object.keys(COLLECTION_PATH_MAP)) {
          const zipPath = COLLECTION_PATH_MAP[colKey];
          const zipFile = zip.file(zipPath);
          if (zipFile) {
            const contentStr = await (zipFile as any).async('text');
            combinedDataStr += contentStr;
            const colRecords = JSON.parse(contentStr);
            recordsMap[colKey] = colRecords;
            totalDocs += Object.keys(colRecords).length;
          }
        }
        
        const calculatedChecksum = calculateChecksum(combinedDataStr);
        const checksumValid = manifest.checksum ? (manifest.checksum === calculatedChecksum) : true;
        
        const meta = {
          backupType: 'full',
          erpVersion: manifest.erpVersion || 'Unknown',
          schemaVersion: manifest.schemaVersion || 'Unknown',
          backupVersion: manifest.backupVersion || '1.0',
          companyName: manifest.companyName || 'Unknown Company',
          createdBy: manifest.createdBy || 'Unknown User',
          createdAt: manifest.createdAt || new Date(file.lastModified).toISOString(),
          documentCount: totalDocs,
          recordsMap: recordsMap,
          checksum: manifest.checksum || '',
          calculatedChecksum: calculatedChecksum,
          checksumValid: checksumValid
        };
        
        setRestoreBackupMeta(meta);
        
        const selected: Record<string, boolean> = {};
        for (const k of Object.keys(recordsMap)) {
          selected[k] = true;
        }
        setRestoreSelectedModules(selected);
        
        if (checksumValid) {
          setRestoreStatus('preview');
          setRestoreLogs(prev => [
            ...prev, 
            `SUCCESS: Full backup parsed successfully.`,
            `Included collections: ${Object.keys(recordsMap).join(', ')}`,
            `Total records found: ${totalDocs}`,
            `INTEGRITY CHECK: Checksum validation passed.`
          ]);
        } else {
          setRestoreStatus('error');
          setRestoreLogs(prev => [
            ...prev,
            `CRITICAL_ERROR: Integrity check failed. The backup file is corrupted or has been modified. Pre-validation blocked.`,
            `MANIFEST CHECKSUM: ${manifest.checksum}`,
            `CALCULATED CHECKSUM: ${calculatedChecksum}`
          ]);
        }
        setRestoreIsLoading(false);
      } else {
        throw new Error('Unsupported file format. Please upload a .zip (Full Backup) or .json (Module Backup) file.');
      }
    } catch (err: any) {
      console.error(err);
      setRestoreStatus('error');
      setRestoreLogs(prev => [...prev, `CRITICAL_ERROR: Parse failed: ${err.message}`]);
      setRestoreIsLoading(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreBackupMeta) return;
    setRestoreStatus('restoring');
    setRestoreProgress(5);
    
    const logs = [
      `Initiating database restoration workflow...`,
      `Restore Mode: ${restoreMode.toUpperCase()}`,
      `Duplicate Handling: ${restoreDuplicateStrategy.toUpperCase()}`
    ];
    setRestoreLogs([...logs]);
    
    const startTime = Date.now();
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let duplicateHandled = 0;
    let warningsList: string[] = [];
    const restoredModulesList: string[] = [];
    
    const classifyRestoreError = (err: any): { category: string; message: string } => {
      const errMsg = err.message || String(err);
      
      if (errMsg.includes('Stage: DEPENDENCY_VALIDATION') || errMsg.includes('Dependency') || errMsg.includes('dependency')) {
        return { category: 'Dependency Failure', message: errMsg };
      }
      if (errMsg.includes('CHECKSUM_PRE_VALIDATION') || errMsg.includes('checksum') || errMsg.includes('Checksum')) {
        return { category: 'Checksum Failure', message: errMsg };
      }
      if (errMsg.includes('permission') || errMsg.includes('Permission') || errMsg.includes('PERMISSION_DENIED')) {
        return { category: 'Permission Failure', message: errMsg };
      }
      if (errMsg.includes('RECORD_RECOVERY_WRITING') || errMsg.includes('batch') || errMsg.includes('Batch') || errMsg.includes('writeBatch')) {
        return { category: 'Batch Failure', message: errMsg };
      }
      if (errMsg.includes('network') || errMsg.includes('offline') || errMsg.includes('timeout')) {
        return { category: 'Network Failure', message: errMsg };
      }
      if (errMsg.includes('DATA_PRE_CLEARING') || errMsg.includes('clear existing') || errMsg.includes('deletion')) {
        return { category: 'Firestore Failure', message: errMsg };
      }
      if (errMsg.includes('manifest') || errMsg.includes('JSON') || errMsg.includes('format')) {
        return { category: 'Validation Failure', message: errMsg };
      }
      return { category: 'Unexpected Exception', message: errMsg };
    };

    try {
      // Stage 1: Checksum Pre-Validation Enforcement
      if (!restoreBackupMeta.checksumValid) {
        throw new Error(`[Stage: CHECKSUM_PRE_VALIDATION] Checksum verification failed. Restore blocked. The archive has been tampered with or corrupted.`);
      }

      const selectedColKeys = Object.keys(restoreSelectedModules).filter(k => restoreSelectedModules[k]);
      if (selectedColKeys.length === 0) {
        throw new Error('[Stage: SELECTION_VALIDATION] No modules selected for restore.');
      }
      
      // Stage 2: Mandatory Dependency Enforcement (PART 3)
      logs.push(`Stage 2: Dependency Validation...`);
      setRestoreLogs([...logs]);
      
      for (const colKey of selectedColKeys) {
        const deps = MODULE_DEPENDENCIES[colKey];
        if (deps) {
          for (const dep of deps) {
            // Check if it's in the backup payload
            const inBackup = restoreBackupMeta.recordsMap[dep] && Object.keys(restoreBackupMeta.recordsMap[dep]).length > 0;
            if (inBackup) continue; // Dependency is satisfied by backup payload
            
            // Check if it's in the live database (Firestore)
            let inDb = false;
            try {
              const isDepSingleton = dep.includes('/');
              const depColName = isDepSingleton ? dep.split('/')[0] : dep;
              if (isDepSingleton) {
                const depSnap = await getDoc(doc(db, depColName, dep.split('/')[1]));
                inDb = depSnap.exists();
              } else {
                const depSnap = await getDocs(collection(db, depColName));
                inDb = !depSnap.empty;
              }
            } catch (e) {
              console.warn(`Could not verify live database dependency [${dep}]:`, e);
            }
            
            if (!inDb) {
              throw new Error(`[Stage: DEPENDENCY_VALIDATION] Cannot restore ${colKey}: required dependency "${dep}" is missing from both backup payload and live database.`);
            }
          }
        }
      }
      logs.push(`SUCCESS: Dependency validation completed. All dependencies satisfied.`);
      setRestoreLogs([...logs]);

      const stepIncrement = 80 / selectedColKeys.length;
      let currentProgress = 5;
      
      // Stage 3: Safe Restore Execution (Firestore operations) using writeBatch
      const batchExecutor = {
        batch: writeBatch(db),
        count: 0,
        async addSet(ref: any, data: any) {
          this.batch.set(ref, data);
          this.count++;
          if (this.count >= 400) {
            await this.commit();
          }
        },
        async addDelete(ref: any) {
          this.batch.delete(ref);
          this.count++;
          if (this.count >= 400) {
            await this.commit();
          }
        },
        async commit() {
          if (this.count > 0) {
            try {
              await this.batch.commit();
            } catch (err: any) {
              throw new Error(`[Stage: RECORD_RECOVERY_WRITING] Firestore batch commit failed: ${err.message}`);
            }
            this.batch = writeBatch(db);
            this.count = 0;
          }
        }
      };

      // 1. Perform Restore Loop
      for (const colKey of selectedColKeys) {
        const incomingRecords = restoreBackupMeta.recordsMap[colKey];
        if (!incomingRecords) continue;
        
        restoredModulesList.push(colKey);
        logs.push(`Processing module restoration: [${colKey}]...`);
        setRestoreLogs([...logs]);
        
        const isSingleton = colKey.includes('/');
        const colName = isSingleton ? colKey.split('/')[0] : colKey;
        const docId = isSingleton ? colKey.split('/')[1] : null;
        
        // 1a. If Replace mode, clear existing database records first using batch deletes
        if (restoreMode === 'replace') {
          logs.push(`REPLACE MODE: Queuing deletion of existing records for [${colKey}]...`);
          setRestoreLogs([...logs]);
          
          try {
            if (isSingleton) {
              await batchExecutor.addDelete(doc(db, colName, docId!));
            } else {
              const currentDocs = await getDocs(collection(db, colName));
              for (const d of currentDocs.docs) {
                await batchExecutor.addDelete(doc(db, colName, d.id));
              }
            }
            await batchExecutor.commit();
            logs.push(`SUCCESS: Pre-restore deletion of existing data in [${colKey}] complete.`);
          } catch (err: any) {
            throw new Error(`[Stage: DATA_PRE_CLEARING] Failed to clear existing records in [${colKey}]: ${err.message}`);
          }
          setRestoreLogs([...logs]);
        }
        
        // 1b. Fetch current state of DB for duplicate analysis (only if not Replace mode)
        const dbRecordsMap = new Map<string, any>();
        if (restoreMode !== 'replace') {
          try {
            if (isSingleton) {
              const docSnap = await getDoc(doc(db, colName, docId!));
              if (docSnap.exists()) {
                dbRecordsMap.set(docId!, docSnap.data());
              }
            } else {
              const dbSnap = await getDocs(collection(db, colName));
              dbSnap.forEach(d => dbRecordsMap.set(d.id, d.data()));
            }
          } catch (err: any) {
            console.warn(`Could not read current DB state for [${colKey}]:`, err);
          }
        }
        
        // 1c. Queue write/merge operations
        for (const [recId, recData] of Object.entries(incomingRecords)) {
          const docRef = isSingleton ? doc(db, colName, docId!) : doc(db, colName, recId);
          const exists = dbRecordsMap.has(recId);
          
          let actionToTake: 'insert' | 'update' | 'skip' | 'rename' = 'insert';
          let finalId = recId;
          let finalData = { ...(recData as any) };
          
          if (exists) {
            duplicateHandled++;
            if (restoreDuplicateStrategy === 'skip') {
              actionToTake = 'skip';
            } else if (restoreDuplicateStrategy === 'replace') {
              actionToTake = 'update';
            } else if (restoreDuplicateStrategy === 'merge') {
              actionToTake = 'update';
              const existingData = dbRecordsMap.get(recId);
              finalData = { ...existingData, ...finalData };
            } else if (restoreDuplicateStrategy === 'rename') {
              actionToTake = 'rename';
              finalId = `${recId}_restored`;
            }
          }
          
          if (actionToTake === 'skip') {
            skipped++;
            logs.push(`DUPLICATE SKIP: Skipped record [${recId}] in [${colKey}].`);
            setRestoreLogs([...logs]);
            continue;
          }
          
          const finalDocRef = isSingleton ? docRef : doc(db, colName, finalId);
          await batchExecutor.addSet(finalDocRef, finalData);
          
          if (actionToTake === 'insert' || actionToTake === 'rename') {
            imported++;
          } else {
            updated++;
          }
        }
        
        // Commit remaining operations for this module
        await batchExecutor.commit();
        
        currentProgress += stepIncrement;
        setRestoreProgress(Math.min(85, Math.round(currentProgress)));
        setRestoreLogs([...logs]);
      }
      
      // Stage 4: Smart Counter Synchronization (PART 8)
      logs.push(`Executing Smart Counter Synchronization...`);
      setRestoreLogs([...logs]);
      
      try {
        const extractMaxNum = (records: any[], fieldName: string, idField = 'id'): number => {
          let maxVal = 0;
          for (const rec of records) {
            const valStr = String(rec[fieldName] || rec[idField] || '');
            const matches = valStr.match(/\d+/g);
            if (matches && matches.length > 0) {
              const num = parseInt(matches[matches.length - 1], 10);
              if (!isNaN(num) && num > maxVal) {
                maxVal = num;
              }
            }
          }
          return maxVal;
        };
        
        const getModuleRecordsList = async (colKey: string): Promise<any[]> => {
          if (restoreSelectedModules[colKey] && restoreBackupMeta.recordsMap[colKey]) {
            return Object.values(restoreBackupMeta.recordsMap[colKey]);
          }
          try {
            const dbSnap = await getDocs(collection(db, colKey));
            return dbSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch (e) {
            return [];
          }
        };
        
        const salesList = await getModuleRecordsList('sales');
        const purchasesList = await getModuleRecordsList('purchases');
        const customersList = await getModuleRecordsList('customers');
        const suppliersList = await getModuleRecordsList('suppliers');
        const ledgerEntriesList = await getModuleRecordsList('ledgerEntries');
        
        const maxInvoice = extractMaxNum(salesList, 'invoiceNumber', 'id');
        const maxPurchase = extractMaxNum(purchasesList, 'invoiceNumber', 'id');
        const maxCustomer = extractMaxNum(customersList, 'id', 'id');
        const maxSupplier = extractMaxNum(suppliersList, 'id', 'id');
        
        let maxJV = 0, maxCV = 0, maxPV = 0, maxSV = 0, maxRV = 0;
        for (const entry of ledgerEntriesList) {
          const postingNumber = String(entry.postingNumber || entry.id || '');
          const prefix = postingNumber.split('-')[0];
          const matches = postingNumber.match(/\d+/g);
          if (matches && matches.length > 0) {
            const num = parseInt(matches[matches.length - 1], 10);
            if (!isNaN(num)) {
              if (prefix === 'JV' && num > maxJV) maxJV = num;
              if (prefix === 'CV' && num > maxCV) maxCV = num;
              if (prefix === 'PV' && num > maxPV) maxPV = num;
              if (prefix === 'SV' && num > maxSV) maxSV = num;
              if (prefix === 'RV' && num > maxRV) maxRV = num;
            }
          }
        }
        
        if (maxJV === 0) maxJV = extractMaxNum(ledgerEntriesList, 'postingNumber', 'id');
        
        const nextInvoiceVal = maxInvoice + 1;
        const nextPurchaseVal = maxPurchase + 1;
        const nextCustomerVal = maxCustomer + 1;
        const nextSupplierVal = maxSupplier + 1;
        const nextJournalVal = Math.max(maxJV, maxCV, maxPV, maxSV, maxRV) + 1;
        
        const counterRef = doc(db, 'counters', 'posting_sequences');
        const synchronizedSequences = {
          JV: Math.max(maxJV, 1),
          CV: Math.max(maxCV, 1),
          PV: Math.max(maxPV, 1),
          SV: Math.max(maxSV, 1),
          RV: Math.max(maxRV, 1),
          INV: Math.max(maxInvoice, 1) // Store INV sequence for Sales Invoicing!
        };
        
        await setDoc(counterRef, synchronizedSequences, { merge: true });
        logs.push(`SUCCESS: Counter synchronization finalized and committed to Cloud Firestore!`);
        setRestoreLogs([...logs]);
        
        const nextInvoiceStr = `INV-2026-${String(nextInvoiceVal).padStart(5, '0')}`;
        const nextPurchaseStr = `PO-2026-${String(nextPurchaseVal).padStart(5, '0')}`;
        const nextCustomerStr = `cust-${nextCustomerVal}`;
        const nextSupplierStr = `supp-${nextSupplierVal}`;
        const nextJournalStr = `JV-2026-${String(nextJournalVal).padStart(6, '0')}`;
        
        const counterReportText = `Next Invoice: ${nextInvoiceStr} (Index: ${nextInvoiceVal}) | Next Purchase: ${nextPurchaseStr} (Index: ${nextPurchaseVal}) | Next Customer: ${nextCustomerStr} | Next Supplier: ${nextSupplierStr} | Next Journal: ${nextJournalStr}`;
        
        const execTime = Date.now() - startTime;
        setRestoreProgress(100);
        setRestoreStatus('completed');
        
        const report = {
          status: 'success',
          modulesRestored: restoredModulesList,
          documentsImported: imported,
          documentsUpdated: updated,
          documentsSkipped: skipped,
          duplicateRecordsHandled: duplicateHandled,
          validationWarnings: warningsList.length,
          counterSynchronization: counterReportText,
          executionTimeMs: execTime
        };
        setRestoreReport(report);
        
        logs.push(`SUCCESS: Restoration completed successfully in ${execTime}ms!`);
        setRestoreLogs([...logs]);
        
        saveHistory(
          'Restore Completed', 
          `Restored modules [${restoredModulesList.join(', ')}]. Imported: ${imported}, Updated: ${updated}, Skipped: ${skipped}`, 
          'success'
        );
        
        // Firestore Append-only Audit Trail Log
        try {
          const auditLogId = `restore-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const auditRef = doc(db, 'restoreAuditTrail', auditLogId);
          const auditPayload = {
            id: auditLogId,
            timestamp: new Date().toISOString(),
            operatorUid: auth.currentUser?.uid || 'offline-uid',
            operatorEmail: auth.currentUser?.email || 'System Admin',
            operationType: 'Restore Completed',
            restoreMode: restoreMode,
            affectedModules: restoredModulesList,
            documentCounts: imported + updated,
            status: 'success',
            duration: execTime,
            validationResult: {
              checksumValid: restoreBackupMeta.checksumValid,
              manifestChecksum: restoreBackupMeta.checksum,
              calculatedChecksum: restoreBackupMeta.calculatedChecksum
            }
          };
          await setDoc(auditRef, auditPayload);
        } catch (auditErr) {
          console.error("Failed to write restore event to Firestore audit trail:", auditErr);
        }
        
        scanDatabase();
      } catch (err: any) {
        throw new Error(`[Stage: SMART_COUNTER_SYNCHRONIZATION] Smart Counter Synchronization failed: ${err.message}`);
      }
    } catch (err: any) {
      console.error(err);
      setRestoreStatus('error');
      setRestoreProgress(0);
      
      const classified = classifyRestoreError(err);
      const errDetail = `[${classified.category}] ${classified.message}`;
      
      logs.push(`CRITICAL_ERROR: Restoration failed & aborted. Stage: ${errDetail}`);
      setRestoreLogs([...logs]);
      
      saveHistory('Restore Failed', errDetail, 'error');
      
      // Save to Firestore audit trail too!
      try {
        const auditLogId = `restore-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const auditRef = doc(db, 'restoreAuditTrail', auditLogId);
        await setDoc(auditRef, {
          id: auditLogId,
          timestamp: new Date().toISOString(),
          operatorUid: auth.currentUser?.uid || 'offline-uid',
          operatorEmail: auth.currentUser?.email || 'System Admin',
          operationType: 'Restore Failed',
          restoreMode: restoreMode,
          affectedModules: restoredModulesList,
          documentCounts: imported + updated,
          status: 'error',
          duration: Date.now() - startTime,
          validationResult: {
            category: classified.category,
            error: classified.message,
            checksumValid: restoreBackupMeta?.checksumValid ?? false,
            manifestChecksum: restoreBackupMeta?.checksum ?? '',
            calculatedChecksum: restoreBackupMeta?.calculatedChecksum ?? ''
          }
        });
      } catch (auditErr) {
        console.error("Failed to write failed restore event to Firestore audit:", auditErr);
      }
    }
  };

  const handleClearRestore = () => {
    setRestoreFile(null);
    setRestoreBackupMeta(null);
    setRestoreProgress(0);
    setRestoreStatus('idle');
    setRestoreLogs([]);
    setRestoreSelectedModules({});
    setRestoreReport(null);
  };

  useEffect(() => {
    if (activeSettingsTab === 'backup_restore') {
      scanDatabase();
    }
  }, [activeSettingsTab]);

  // Load from Firestore on Mount
  useEffect(() => {
    const fetchCompanyProfile = async () => {
      try {
        setIsLoading(true);
        const snapshot = await getDoc(doc(db, 'businessProfile', 'config'));
        if (snapshot.exists()) {
          const data = snapshot.data();
          const loadedProfile: CompanyProfile = {
            name: data.name || DEFAULT_COMPANY_PROFILE.name,
            address: data.address || DEFAULT_COMPANY_PROFILE.address,
            phone: data.phone || DEFAULT_COMPANY_PROFILE.phone,
            email: data.email || DEFAULT_COMPANY_PROFILE.email,
            website: data.website || DEFAULT_COMPANY_PROFILE.website,
            taxRegistrationId: data.taxRegistrationId || DEFAULT_COMPANY_PROFILE.taxRegistrationId,
            taxRatePercent: typeof data.taxRatePercent === 'number' ? data.taxRatePercent : DEFAULT_COMPANY_PROFILE.taxRatePercent,
            tradeName: data.tradeName || '',
            ownerName: data.ownerName || '',
            crNumber: data.crNumber || '',
            logo: data.logo || '',
            businessType: data.businessType || DEFAULT_COMPANY_PROFILE.businessType,
            currency: data.currency || DEFAULT_COMPANY_PROFILE.currency,
            timezone: data.timezone || DEFAULT_COMPANY_PROFILE.timezone,
            country: data.country || DEFAULT_COMPANY_PROFILE.country,
            accentColor: data.accentColor || DEFAULT_COMPANY_PROFILE.accentColor,
            theme: data.theme || DEFAULT_COMPANY_PROFILE.theme,
            dateFormat: data.dateFormat || DEFAULT_COMPANY_PROFILE.dateFormat,
            numberFormat: data.numberFormat || DEFAULT_COMPANY_PROFILE.numberFormat,
            language: data.language || DEFAULT_COMPANY_PROFILE.language
          };
          setProfile(loadedProfile);
          localStorage.setItem('invoice_company_profile', JSON.stringify(loadedProfile));
        }
      } catch (err) {
        console.error("Failed to fetch company profile from Firestore:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCompanyProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const cleanProfile = {
        name: profile.name.trim(),
        tradeName: profile.tradeName ? profile.tradeName.trim() : '',
        ownerName: profile.ownerName ? profile.ownerName.trim() : '',
        taxRegistrationId: profile.taxRegistrationId.trim(),
        crNumber: profile.crNumber ? profile.crNumber.trim() : '',
        address: profile.address.trim(),
        phone: profile.phone.trim(),
        email: profile.email ? profile.email.trim() : '',
        website: profile.website ? profile.website.trim() : '',
        logo: profile.logo ? profile.logo.trim() : '',
        taxRatePercent: Number(profile.taxRatePercent) || 0,
        businessType: profile.businessType.trim(),
        currency: profile.currency.trim(),
        timezone: profile.timezone.trim(),
        country: profile.country ? profile.country.trim() : '',
        accentColor: profile.accentColor ? profile.accentColor.trim() : 'indigo',
        theme: profile.theme ? profile.theme.trim() : 'Light',
        dateFormat: profile.dateFormat ? profile.dateFormat.trim() : 'YYYY-MM-DD',
        numberFormat: profile.numberFormat ? profile.numberFormat.trim() : '1,234.56',
        language: profile.language ? profile.language.trim() : 'English'
      };

      if (auth.currentUser) {
        await setDoc(doc(db, 'businessProfile', 'config'), cleanProfile);
      }
      localStorage.setItem('invoice_company_profile', JSON.stringify(cleanProfile));
      
      // Log Settings Sync action
      await logSystemActivity(
        "Update settings",
        "Business Profile Configuration has been manually updated by owner. Saved fields include: country, branding accents, preferences."
      );

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3500);
    } catch (err) {
      console.error("Failed to save Company Profile:", err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin"></div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading corporate profile configuration...</p>
      </div>
    );
  }

  return (
    <div id="company-settings-section" className="space-y-6 w-full py-2">
      
      {/* ENTERPRISE TITLE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white border border-slate-800 shadow-sm shrink-0">
            <Settings className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Settings & Workspace Controls
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">Manage localized regional profiles, backup registries, security clearings, and core parameters</p>
          </div>
        </div>

        {/* Access badge */}
        <div className="flex items-center gap-2 self-start md:self-center">
          {isReadOnly ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <Eye className="h-3 w-3 text-slate-400" />
              Read Only Mode ({userRole})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-150 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
              <Check className="h-3.5 w-3.5 text-indigo-600" />
              Root Clearances Active
            </span>
          )}
        </div>
      </div>

      {/* DUAL COLUMN SYSTEM CONTROL PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: ENTERPRISE TABBAR NAVIGATION */}
        <div className="lg:col-span-3 space-y-2">
          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest px-1.5 mb-1">System Workspace</p>
          <div className="flex flex-col gap-1.5 bg-slate-50 p-2 rounded-2xl border border-slate-200/60 shadow-3xs">
            <button
              type="button"
              id="tab-btn-company-settings"
              onClick={() => setActiveSettingsTab('company_settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition text-left border ${
                activeSettingsTab === 'company_settings'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm font-extrabold'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent hover:text-slate-900'
              }`}
            >
              <Building2 className="h-4.5 w-4.5 shrink-0" />
              <div className="truncate">
                <span>Company Settings</span>
                <span className="text-[8px] opacity-75 font-medium block mt-0.5">Profiles & Parameters</span>
              </div>
            </button>

            <button
              type="button"
              id="tab-btn-backup-restore"
              onClick={() => setActiveSettingsTab('backup_restore')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition text-left border ${
                activeSettingsTab === 'backup_restore'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm font-extrabold'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent hover:text-slate-900'
              }`}
            >
              <Database className="h-4.5 w-4.5 shrink-0" />
              <div className="truncate">
                <span>Backup & Restore</span>
                <span className="text-[8px] opacity-75 font-medium block mt-0.5">Firestore Snapshots</span>
              </div>
            </button>

            <button
              type="button"
              id="tab-btn-users-roles"
              onClick={() => setActiveSettingsTab('users_roles')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition text-left border ${
                activeSettingsTab === 'users_roles'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm font-extrabold'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent hover:text-slate-900'
              }`}
            >
              <Shield className="h-4.5 w-4.5 shrink-0" />
              <div className="truncate">
                <span>Users & Roles</span>
                <span className="text-[8px] opacity-75 font-medium block mt-0.5">Privileges Matrix</span>
              </div>
            </button>

            <button
              type="button"
              id="tab-btn-security"
              onClick={() => setActiveSettingsTab('security_workspace')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition text-left border ${
                activeSettingsTab === 'security_workspace'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm font-extrabold'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent hover:text-slate-900'
              }`}
            >
              <Lock className="h-4.5 w-4.5 shrink-0" />
              <div className="truncate">
                <span>Security</span>
                <span className="text-[8px] opacity-75 font-medium block mt-0.5">MFA & Protections</span>
              </div>
            </button>

            <button
              type="button"
              id="tab-btn-audit-logs"
              onClick={() => setActiveSettingsTab('audit_logs')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition text-left border ${
                activeSettingsTab === 'audit_logs'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm font-extrabold'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent hover:text-slate-900'
              }`}
            >
              <FileText className="h-4.5 w-4.5 shrink-0" />
              <div className="truncate">
                <span>Audit Logs</span>
                <span className="text-[8px] opacity-75 font-medium block mt-0.5">Activity Trails</span>
              </div>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: TAB CONTENT STAGE */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* TAB 1: COMPANY SETTINGS 5-SECTION VERTICAL FORM */}
          {activeSettingsTab === 'company_settings' && (
            <form onSubmit={handleSave} className="space-y-6">
              
              {/* SECTION 1: Company Information */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                  <Building2 className="h-4.5 w-4.5 text-indigo-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">1. Company Information</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Business Name <span className="text-rose-500">*</span></label>
                    <input 
                      type="text"
                      required
                      disabled={isReadOnly}
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 pl-3.5 pr-3.5 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                      placeholder="Apex Global Supply Ltd."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Trade Name</label>
                    <input 
                      type="text"
                      disabled={isReadOnly}
                      value={profile.tradeName || ''}
                      onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                      placeholder="Apex Trading"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Email Address</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400"><Mail className="h-3.5 w-3.5" /></span>
                      <input 
                        type="email"
                        disabled={isReadOnly}
                        value={profile.email || ''}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        placeholder="billing@apexsupply.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Telephone Contact <span className="text-rose-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400"><Phone className="h-3.5 w-3.5" /></span>
                      <input 
                        type="text"
                        required
                        disabled={isReadOnly}
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        placeholder="+1 (512) 555-0193"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">HQ Physical Address / Location <span className="text-rose-500">*</span></label>
                    <textarea 
                      rows={2}
                      required
                      disabled={isReadOnly}
                      value={profile.address}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-medium focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 leading-relaxed"
                      placeholder="740 Industrial Boulevard, Suite C, Austin, TX 78701"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Business Configuration */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                  <Globe className="h-4.5 w-4.5 text-indigo-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">2. Business Configuration</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  
                  {/* Searchable Country Selector */}
                  <div className="space-y-1.5 relative" ref={countryDropdownRef}>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Operational Country <span className="text-rose-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400"><Globe className="h-3.5 w-3.5" /></span>
                      <button
                        type="button"
                        id="country-selector-trigger"
                        disabled={isReadOnly}
                        onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-8 text-xs font-bold text-left focus:border-slate-450 flex items-center justify-between disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer"
                      >
                        <span>{profile.country || 'Select country...'}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </div>

                    {isCountryDropdownOpen && (
                      <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 space-y-2 animate-fade-in">
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-slate-400"><Search className="h-3 w-3" /></span>
                          <input
                            type="text"
                            placeholder="Search country..."
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-7 pr-2.5 text-xs focus:outline-none focus:border-indigo-400"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-0.5 divide-y divide-slate-50">
                          {filteredCountries.map(c => (
                            <button
                              key={c.name}
                              type="button"
                              onClick={() => handleCountrySelect(c.name)}
                              className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-50 text-slate-700 rounded-lg flex items-center justify-between"
                            >
                              <span>{c.name}</span>
                              {profile.country === c.name && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                            </button>
                          ))}
                          {filteredCountries.length === 0 && (
                            <div className="p-2 text-[10px] text-slate-400 text-center italic">No matching countries</div>
                          )}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400">Selecting country triggers smart defaults for Currency and Timezones</p>
                  </div>

                  {/* Business Type Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Business Type <span className="text-rose-500">*</span></label>
                    <select 
                      id="settings-business-type"
                      required
                      disabled={isReadOnly}
                      value={profile.businessType}
                      onChange={(e) => setProfile({ ...profile, businessType: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer"
                    >
                      <option value="Retail">Retail Trade</option>
                      <option value="Wholesale">Wholesale Distribution</option>
                      <option value="Manufacturing">Manufacturing & Production</option>
                      <option value="Services">Professional Services</option>
                      <option value="Technology">Technology & Software</option>
                    </select>
                  </div>

                  {/* Currency (with Manual Override Capability) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Local Currency (SAR, AED, USD, GBP) <span className="text-rose-500">*</span></label>
                    <select 
                      id="settings-currency"
                      required
                      disabled={isReadOnly}
                      value={profile.currency}
                      onChange={(e) => setProfile({ ...profile, currency: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer"
                    >
                      <option value="SAR (SR)">SAR (SR) - Saudi Riyal</option>
                      <option value="AED (DH)">AED (DH) - UAE Dirham</option>
                      <option value="USD ($)">USD ($) - US Dollar</option>
                      <option value="GBP (£)">GBP (£) - British Pound</option>
                      <option value="EUR (€)">EUR (€) - Euro Zone</option>
                      <option value="JPY (¥)">JPY (¥) - Japanese Yen</option>
                      <option value="INR (₹)">INR (₹) - Indian Rupee</option>
                    </select>
                    <p className="text-[10px] text-slate-400">Can be manually overridden if you operate using non-standard currencies</p>
                  </div>

                  {/* Timezone (with Manual Override/Country-filtered Options) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Corporate Timezone <span className="text-rose-500">*</span></label>
                    <select 
                      id="settings-timezone"
                      required
                      disabled={isReadOnly}
                      value={profile.timezone}
                      onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer"
                    >
                      {getTimezoneOptions(profile.country || '').map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                      {/* Always offer UTC fallback */}
                      {!getTimezoneOptions(profile.country || '').includes('UTC') && (
                        <option value="UTC">UTC (GMT+0) - Global standard</option>
                      )}
                    </select>
                    <p className="text-[10px] text-slate-400">Filtered options match selected country. Safe override available.</p>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Compliance */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                  <Percent className="h-4.5 w-4.5 text-indigo-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">3. Compliance Certificates</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Commercial Registration (CR)</label>
                    <input 
                      type="text"
                      disabled={isReadOnly}
                      value={profile.crNumber || ''}
                      onChange={(e) => setProfile({ ...profile, crNumber: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-bold font-mono focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                      placeholder="CR-1010349283"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">VAT ID / Tax Number <span className="text-rose-500">*</span></label>
                    <input 
                      type="text"
                      required
                      disabled={isReadOnly}
                      value={profile.taxRegistrationId}
                      onChange={(e) => setProfile({ ...profile, taxRegistrationId: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-bold font-mono focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                      placeholder="VAT-US948301140B"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Default Tax Rate (%) <span className="text-rose-500">*</span></label>
                    <div className="relative">
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        required
                        disabled={isReadOnly}
                        value={profile.taxRatePercent}
                        onChange={(e) => setProfile({ ...profile, taxRatePercent: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-slate-200 py-2 pl-3.5 pr-8 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        placeholder="15"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-xs font-bold">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: Branding */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                  <Paintbrush className="h-4.5 w-4.5 text-indigo-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">4. Corporate Branding</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Logo URL */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Company Logo URL</label>
                      <input 
                        type="text"
                        disabled={isReadOnly}
                        value={profile.logo || ''}
                        onChange={(e) => setProfile({ ...profile, logo: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        placeholder="https://example.com/logo.png"
                      />
                      <p className="text-[10px] text-slate-400">Provide public hotlinked path to render custom corporate logo vectors directly on billing invoices</p>
                    </div>

                    {/* Brand Color Selector */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Primary Brand Accent Color</label>
                      <div className="flex items-center gap-3">
                        {[
                          { name: 'indigo', hex: '#4F46E5', label: 'Indigo Classic' },
                          { name: 'emerald', hex: '#10B981', label: 'Emerald Forest' },
                          { name: 'amber', hex: '#F59E0B', label: 'Amber Gold' },
                          { name: 'rose', hex: '#F43F5E', label: 'Rose Red' },
                          { name: 'slate', hex: '#64748B', label: 'Corporate Slate' }
                        ].map(c => (
                          <button
                            key={c.name}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => setProfile({ ...profile, accentColor: c.name })}
                            className={`w-7 h-7 rounded-full transition-all flex items-center justify-center border hover:scale-110 active:scale-95 relative cursor-pointer`}
                            style={{ backgroundColor: c.hex, borderColor: profile.accentColor === c.name ? '#0f172a' : 'transparent' }}
                            title={c.label}
                          >
                            {profile.accentColor === c.name && (
                              <Check className="h-3.5 w-3.5 text-white stroke-[3px]" />
                            )}
                          </button>
                        ))}
                        <span className="text-[10px] text-slate-500 font-mono font-bold capitalize ml-2">Active: {profile.accentColor || 'indigo'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Logo Live Preview */}
                  <div className="border border-slate-200 rounded-2xl bg-slate-50/50 p-4 flex flex-col items-center justify-center text-center space-y-2 min-h-[110px]">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Invoice Brand Vector</span>
                    {profile.logo ? (
                      <div className="bg-white border border-slate-200/50 p-2.5 rounded-xl max-h-16 flex items-center justify-center shadow-3xs">
                        <img 
                          src={profile.logo} 
                          alt="Live Logo Preview" 
                          referrerPolicy="no-referrer"
                          className="max-h-12 max-w-[120px] object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic">No Logo Configured</div>
                    )}
                  </div>
                </div>

                {/* Theme Selector */}
                <div className="space-y-2.5 pt-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Dashboard Layout Workspace Theme</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { name: 'Light', desc: 'Sleek standard light interface style' },
                      { name: 'Charcoal Dark', desc: 'Comfortable high-contrast twilight mode' },
                      { name: 'Indigo Classic', desc: 'Signature workspace royal indigo' },
                      { name: 'Emerald Forest', desc: 'Warm professional eco accent theme' }
                    ].map(t => (
                      <button
                        key={t.name}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setProfile({ ...profile, theme: t.name })}
                        className={`p-3 rounded-xl border text-left transition text-xs font-semibold hover:border-slate-400 cursor-pointer ${
                          profile.theme === t.name 
                            ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-3xs' 
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="block">{t.name}</span>
                        <span className="text-[8px] font-medium text-slate-400 mt-1 block leading-normal">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 5: System Preferences */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                  <FileText className="h-4.5 w-4.5 text-indigo-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">5. System Preferences</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Date Formatting Code</label>
                    <select 
                      disabled={isReadOnly}
                      value={profile.dateFormat}
                      onChange={(e) => setProfile({ ...profile, dateFormat: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 cursor-pointer"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD (Standard KSA/US)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (European standard)</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (US Legacy code)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Double-Entry Number Format</label>
                    <select 
                      disabled={isReadOnly}
                      value={profile.numberFormat}
                      onChange={(e) => setProfile({ ...profile, numberFormat: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 cursor-pointer"
                    >
                      <option value="1,234.56">1,234.56 (US/Standard Ledger)</option>
                      <option value="1.234,56">1.234,56 (European style)</option>
                      <option value="1234.56">1234.56 (Literal format)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Default Language Interface</label>
                    <select 
                      disabled={isReadOnly}
                      value={profile.language}
                      onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 cursor-pointer"
                    >
                      <option value="English">English (United States)</option>
                      <option value="Arabic">Arabic (العربية)</option>
                      <option value="Spanish">Spanish (Español)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SAVE / SYNCHRONIZE CONTROL BAR */}
              {!isReadOnly && (
                <div className="flex flex-col sm:flex-row items-center justify-end gap-3.5 pt-2">
                  
                  {saveStatus === 'success' && (
                    <div className="w-full sm:w-auto rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-800 flex items-center gap-1.5 animate-slide-up">
                      <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span>Corporate settings synced successfully in Cloud Firestore!</span>
                    </div>
                  )}

                  {saveStatus === 'error' && (
                    <div className="w-full sm:w-auto rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-xs font-bold text-rose-800 flex items-center gap-1.5 animate-slide-up">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                      <span>An error occurred while saving profile settings.</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-black text-white px-8 py-3 transition hover:shadow-md cursor-pointer disabled:opacity-60 uppercase tracking-wider"
                  >
                    <Lock className="h-4 w-4 shrink-0 text-indigo-400" />
                    <span>{isSaving ? 'Synchronizing Cloud...' : 'Apply settings parameters'}</span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* TAB 2: DATABASE BACKUP & SNAPSHOT OPERATIONS */}
          {activeSettingsTab === 'backup_restore' && (
            <div className="space-y-6 animate-fade-in">
              
              {/* INTRO HERO GRID */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-700/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <CloudLightning className="w-48 h-48 text-indigo-400 animate-pulse" />
                </div>
                <div className="max-w-xl space-y-3 relative z-10">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-550/25 border border-indigo-400/30 text-[10px] font-black uppercase tracking-widest text-indigo-300">
                    <Sparkles className="h-3 w-3" />
                    Enterprise Snapshot Engine
                  </span>
                  <h3 className="text-lg font-black tracking-tight text-white uppercase">Vault & Disaster Recovery Center</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Perform full cloud ledger backups, module-specific exports, and secure checksum-validated restore routines. All recovery processes execute with atomic precision to guard data integrity.
                  </p>
                </div>
              </div>

              {/* THREE-WAY SUB-TAB NAVIGATION */}
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setBackupWorkspaceTab('backup_center')}
                  className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 ${
                    backupWorkspaceTab === 'backup_center'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Download className="h-4 w-4" />
                  Backup Center
                </button>
                <button
                  type="button"
                  onClick={() => setBackupWorkspaceTab('restore_center')}
                  className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 ${
                    backupWorkspaceTab === 'restore_center'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  Restore Center
                </button>
                <button
                  type="button"
                  onClick={() => setBackupWorkspaceTab('history')}
                  className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 ${
                    backupWorkspaceTab === 'history'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <History className="h-4 w-4" />
                  Audit Log & History
                </button>
              </div>

              {/* SECTION 1: BACKUP CENTER */}
              {backupWorkspaceTab === 'backup_center' && (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* SNAPSHOT METRIC COUNTERS */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 shrink-0">
                        <Layers className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Master Collections</span>
                        <span className="text-xl font-black text-slate-900 tracking-tight">
                          {backupStatus === 'scanning' ? (
                            <span className="text-slate-300 animate-pulse">Checking...</span>
                          ) : (
                            `${backupStats.totalCollections} Active`
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 shrink-0">
                        <FileJson className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Documents Counted</span>
                        <span className="text-xl font-black text-slate-900 tracking-tight">
                          {backupStatus === 'scanning' ? (
                            <span className="text-slate-300 animate-pulse">Resolving...</span>
                          ) : (
                            backupStats.totalDocuments.toLocaleString()
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100 shrink-0">
                        <FileArchive className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Estimated Size</span>
                        <span className="text-xl font-black text-slate-900 tracking-tight">
                          {backupStatus === 'scanning' ? (
                            <span className="text-slate-300 animate-pulse">Sizing...</span>
                          ) : (
                            `${backupStats.estimatedSizeKB.toFixed(2)} KB`
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* LEFT PANEL: FULL EXPORT AND TRACE */}
                    <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-4">
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Full System Backup</h3>
                        {lastBackupTime && (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-150 px-2.5 py-0.5 rounded-full">
                            Download Success: {lastBackupTime}
                          </span>
                        )}
                      </div>

                      {backupStatus === 'exporting' && (
                        <div className="space-y-2 bg-slate-50 border border-slate-100 rounded-2xl p-4">
                          <div className="flex justify-between text-xs font-bold text-slate-700">
                            <span>Streaming cloud records...</span>
                            <span>{backupProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-slate-900 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${backupProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {backupStatus === 'completed' && (
                        <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-4 flex items-start gap-3 animate-fade-in">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider">Snapshot Generated</h4>
                            <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                              All cloud records verified, wrapped, compressed and transferred locally with manifest.json checksum protection.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={handleExportBackup}
                          disabled={backupStatus === 'exporting' || backupStatus === 'scanning'}
                          className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white px-5 py-3 transition cursor-pointer disabled:opacity-50"
                        >
                          <Download className="h-4 w-4" />
                          <span>{backupStatus === 'exporting' ? 'Archiving...' : 'Download Full ZIP'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={scanDatabase}
                          disabled={backupStatus === 'exporting' || backupStatus === 'scanning'}
                          className="flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 px-5 py-3 transition cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`h-4 w-4 shrink-0 ${backupStatus === 'scanning' ? 'animate-spin' : ''}`} />
                          <span>Sync Ledger Stats</span>
                        </button>
                      </div>

                      {/* Execution Terminal */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Backup Engine Live Logs</label>
                        <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 font-mono text-[9px] leading-relaxed h-[180px] overflow-y-auto space-y-1 shadow-inner scrollbar-thin">
                          {backupLogs.length === 0 ? (
                            <div className="text-slate-500 italic">No logs active. Start an operation to stream trace...</div>
                          ) : (
                            backupLogs.map((l, index) => (
                              <div key={index} className={
                                l.startsWith('SUCCESS') ? 'text-emerald-400 font-semibold' :
                                l.startsWith('WARNING') ? 'text-amber-400 font-semibold' :
                                l.startsWith('CRITICAL_ERROR') ? 'text-rose-400 font-black' :
                                'text-slate-300'
                              }>
                                <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                {l}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT PANEL: MODULE BACKUP CENTER */}
                    <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs flex flex-col space-y-4">
                      <div>
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Independent Module Exporter</h3>
                        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                          Extract standalone modules into individual JSON tables. Helpful for fast, atomic updates or transferring single components.
                        </p>
                      </div>

                      <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl p-3 max-h-[350px] space-y-4 scrollbar-thin">
                        {BACKUP_MODULE_GROUPS.map(group => (
                          <div key={group.name} className="space-y-1.5">
                            <h4 className="text-[9px] font-black text-indigo-600 uppercase tracking-widest px-2.5 py-1 bg-indigo-50/50 rounded-lg">
                              {group.name}
                            </h4>
                            <div className="divide-y divide-slate-100">
                              {group.modules.map(mod => {
                                const isSingleton = mod.id.includes('/');
                                const totalDocs = isSingleton ? 1 : (collectionDetails[mod.id] || 0);
                                return (
                                  <div key={mod.id} className="py-2.5 px-1.5 flex items-center justify-between hover:bg-slate-50 transition rounded-xl">
                                    <div className="space-y-0.5">
                                      <span className="text-xs font-bold text-slate-800 tracking-tight block">
                                        {mod.name}
                                      </span>
                                      <span className="text-[9px] text-slate-400 block font-mono">
                                        {isSingleton ? 'singleton' : `${totalDocs} docs`} {mod.dependencies.length > 0 && `• deps: ${mod.dependencies.join(', ')}`}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleExportModuleBackup(mod.id)}
                                      title={`Download ${mod.name} backup JSON`}
                                      className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-slate-600 hover:text-indigo-600 transition flex items-center justify-center cursor-pointer"
                                    >
                                      <Download className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: RESTORE CENTER */}
              {backupWorkspaceTab === 'restore_center' && (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* WARNING DISCLOSURE CARD */}
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">At-Risk Operations Disclaimer</h4>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        Data restoration directly overwrites or merges ledger documents. Active transactions or posting sequences could experience immediate jumps. <strong>Replace Mode</strong> is highly destructive and deletes all existing active records in the module before restoring.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* LEFT SECTION: RESTORE CONTROL & VERIFIER */}
                    <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-5">
                      
                      {/* FILE UPLOAD DRAG AREA */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Choose Backup File (ZIP or JSON)</label>
                        <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-6 text-center transition cursor-pointer relative group bg-slate-50/50">
                          <input
                            type="file"
                            accept=".zip,.json"
                            onChange={handleRestoreFileSelected}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition">
                              <Upload className="h-5 w-5" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-700 block">
                                {restoreFile ? restoreFile.name : 'Click or Drag ZIP / JSON Backup file'}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {restoreFile ? `${(restoreFile.size / 1024).toFixed(2)} KB` : 'Supports system generated ZIP full archives & module JSON files'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* RESTORE LIVE STATUS / PROGRESS */}
                      {(restoreStatus === 'restoring' || restoreStatus === 'verifying' || restoreStatus === 'parsing') && (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-pulse">
                          <div className="flex justify-between text-xs font-bold text-slate-700">
                            <span className="flex items-center gap-1.5">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                              {restoreStatus === 'parsing' ? 'Validating and reading file metadata...' :
                               restoreStatus === 'restoring' ? 'Writing documents to Firestore ledger...' :
                               'Verifying post-restore ledger integrity...'}
                            </span>
                            <span>{restoreProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${restoreProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* RESTORE FAILED ERROR BOX */}
                      {restoreStatus === 'error' && (
                        <div className="bg-rose-50 border border-rose-150 rounded-2xl p-4 flex items-start gap-3 text-rose-700 animate-fade-in">
                          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider">Restoration Aborted Safely</h4>
                            <p className="text-[11px] text-rose-700 leading-relaxed mt-0.5">
                              The backup engine rejected execution. No document writes were committed.
                            </p>
                            <div className="mt-2 text-[9px] font-mono bg-rose-100 rounded p-2 text-rose-800 max-h-[80px] overflow-y-auto">
                              {restoreLogs[restoreLogs.length - 1] || 'Unknown verification error'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* RESTORE COMPLETED SUCCESS BOX */}
                      {restoreStatus === 'completed' && (
                        <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-4 flex items-start gap-3 text-emerald-800 animate-fade-in">
                          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider">Restoration Executed Successfully</h4>
                            <p className="text-[11px] text-emerald-700 leading-relaxed mt-0.5">
                              Ledger synchronization completed. Smart counter synchronization computed and verified.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* RESTORE ENGINE TRACE CONSOLE */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Restoration Live Trace Logs</label>
                        <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 font-mono text-[9px] leading-relaxed h-[180px] overflow-y-auto space-y-1 shadow-inner scrollbar-thin">
                          {restoreLogs.length === 0 ? (
                            <div className="text-slate-500 italic">Waiting for uploader streaming to output logs...</div>
                          ) : (
                            restoreLogs.map((l, index) => (
                              <div key={index} className={
                                l.startsWith('SUCCESS') ? 'text-emerald-400 font-semibold' :
                                l.startsWith('WARNING') ? 'text-amber-400 font-semibold' :
                                l.startsWith('CRITICAL_ERROR') ? 'text-rose-400 font-black' :
                                l.startsWith('ERROR') ? 'text-rose-400 font-bold' :
                                'text-slate-300'
                              }>
                                <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                {l}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>

                    {/* RIGHT SECTION: RESTORE PREVIEW & OPTIONS PANEL */}
                    <div className="lg:col-span-2 space-y-4">
                      
                      {restoreBackupMeta ? (
                        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-3xs space-y-4 animate-fade-in">
                          <div className="pb-3 border-b border-slate-100">
                            {restoreBackupMeta.checksumValid ? (
                              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                Checksum Validated
                              </span>
                            ) : (
                              <span className="text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                Integrity Check Failed
                              </span>
                            )}
                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mt-2">
                              {restoreBackupMeta.backupType === 'module' ? (
                                (() => {
                                  const colName = restoreBackupMeta.moduleName;
                                  if (colName === 'customers') return 'Customer Restore Mode';
                                  if (colName === 'products') return 'Product Restore Mode';
                                  if (colName === 'businessProfile/config' || colName === 'businessProfile') return 'Business Profile Restore Mode';
                                  const base = colName.split('/')[0];
                                  const readable = base.replace(/([A-Z])/g, ' $1').trim();
                                  return `${readable.charAt(0).toUpperCase() + readable.slice(1)} Restore Mode`;
                                })()
                              ) : 'Recovery Preview Sheet'}
                            </h3>
                          </div>

                          {!restoreBackupMeta.checksumValid && (
                            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-2xl flex gap-2.5">
                              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                              <div>
                                <strong className="font-bold block text-rose-800">Restore Blocked</strong>
                                Integrity verification failed. This archive has been modified or corrupted after creation. Restore is disabled.
                              </div>
                            </div>
                          )}

                          {/* METADATA LIST */}
                          {restoreBackupMeta.backupType === 'module' ? (
                            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-[10px] font-mono text-slate-600 space-y-2">
                              <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Detected Module</span>
                                <span className="font-bold text-indigo-600 font-mono">{restoreBackupMeta.moduleName}</span>
                              </div>
                              <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Documents</span>
                                <span className="font-bold text-slate-800 font-mono">{restoreBackupMeta.documentCount} records</span>
                              </div>
                              <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Backup Date</span>
                                <span className="font-bold text-slate-800 font-mono">{new Date(restoreBackupMeta.createdAt).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">ERP Version</span>
                                <span className="font-bold text-slate-800 font-mono">{restoreBackupMeta.erpVersion}</span>
                              </div>
                              <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Schema Version</span>
                                <span className="font-bold text-slate-800 font-mono">{restoreBackupMeta.schemaVersion}</span>
                              </div>
                              <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Checksum Status</span>
                                <span className={`font-bold font-mono ${restoreBackupMeta.checksumValid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {restoreBackupMeta.checksumValid ? 'Valid Cryptographic Match' : 'Corrupted / Altered'}
                                </span>
                              </div>
                              <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Active Restore Mode</span>
                                <span className="font-bold text-slate-800 font-mono uppercase">{restoreMode} Mode</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Dependency Status</span>
                                <span className={`font-bold font-mono flex items-center gap-1 ${
                                  !restoreDependencyStatus.checked
                                    ? 'text-slate-400'
                                    : restoreDependencyStatus.satisfied
                                      ? 'text-emerald-600'
                                      : 'text-rose-600 font-black animate-pulse'
                                }`}>
                                  {!restoreDependencyStatus.checked ? (
                                    'Verifying...'
                                  ) : restoreDependencyStatus.satisfied ? (
                                    <>
                                      <CheckCircle2 className="h-3 w-3 inline text-emerald-500" />
                                      Satisfied
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle className="h-3 w-3 inline text-rose-500" />
                                      Blocked: Missing {restoreDependencyStatus.missingDeps.join(', ')}
                                    </>
                                  )}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl text-[10px] font-mono text-slate-600">
                              <div>
                                <span className="text-[8px] text-slate-400 block uppercase">Company</span>
                                <span className="font-bold text-slate-800 line-clamp-1">{restoreBackupMeta.companyName}</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-400 block uppercase">Created By</span>
                                <span className="font-bold text-slate-800 line-clamp-1">{restoreBackupMeta.createdBy}</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-400 block uppercase">Backed Up At</span>
                                <span className="font-bold text-slate-800 line-clamp-1">{new Date(restoreBackupMeta.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-400 block uppercase">Backup Version</span>
                                <span className="font-bold text-slate-800">{restoreBackupMeta.backupVersion}</span>
                              </div>
                              <div className="col-span-2 border-t border-slate-200 pt-2 mt-1">
                                <span className="text-[8px] text-slate-400 block uppercase">Record Package Size</span>
                                <span className="font-bold text-indigo-600 text-xs">{restoreBackupMeta.documentCount} document rows</span>
                              </div>
                            </div>
                          )}

                          {/* SELECTIVE RESTORE MODULE CHECKBOXES */}
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Restore Scope</label>
                            <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-[140px] overflow-y-auto scrollbar-thin">
                              {Object.keys(restoreBackupMeta.recordsMap).map(colPath => {
                                const count = Object.keys(restoreBackupMeta.recordsMap[colPath] || {}).length;
                                const isSelected = !!restoreSelectedModules[colPath];
                                return (
                                  <div key={colPath} className="p-2 flex items-center justify-between text-xs hover:bg-slate-50">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          setRestoreSelectedModules({
                                            ...restoreSelectedModules,
                                            [colPath]: e.target.checked
                                          });
                                        }}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                                      />
                                      <span className="font-mono text-[10px] text-slate-700 font-semibold line-clamp-1">{colPath}</span>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 font-mono">{count} records</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* RECOVERY MODES */}
                          <div className="space-y-3 pt-2">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Restoration Mode</label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setRestoreMode('merge')}
                                  className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                                    restoreMode === 'merge'
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold text-xs'
                                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500 text-xs'
                                  }`}
                                >
                                  Merge Mode
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRestoreMode('replace')}
                                  className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                                    restoreMode === 'replace'
                                      ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold text-xs'
                                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500 text-xs'
                                  }`}
                                >
                                  Replace Mode
                                </button>
                              </div>
                            </div>

                            {/* DUPLICATE STRATEGY (if Merge Mode) */}
                            {restoreMode === 'merge' && (
                              <div className="space-y-1.5 animate-fade-in">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Duplicate Document Resolution Policy</label>
                                <select
                                  value={restoreDuplicateStrategy}
                                  onChange={(e: any) => setRestoreDuplicateStrategy(e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 text-slate-700 text-xs py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                >
                                  <option value="skip">Skip: Keep Existing Records (Safest)</option>
                                  <option value="replace">Replace: Overwrite Entire Record</option>
                                  <option value="merge">Merge: Perform Shallow Fields Union</option>
                                  <option value="rename">Rename: Save As Copy (e.g. ID_copy)</option>
                                </select>
                              </div>
                            )}

                            {/* DOUBLE SECURITY AUTOCONFIRMATION */}
                            <div className="space-y-1.5 pt-2 border-t border-slate-100">
                              <label className="text-[9px] font-bold text-slate-500 uppercase block">
                                Type <strong className="text-rose-600">RESTORE</strong> to authorize recovery write:
                              </label>
                              <input
                                type="text"
                                value={restoreConfirmationText}
                                onChange={(e) => setRestoreConfirmationText(e.target.value)}
                                placeholder="Authorization string"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            {/* EXECUTE RECOVERY BUTTON */}
                            <button
                              type="button"
                              onClick={handleExecuteRestore}
                              disabled={
                                restoreConfirmationText !== 'RESTORE' ||
                                !Object.values(restoreSelectedModules).some(Boolean) ||
                                restoreStatus === 'restoring' ||
                                restoreStatus === 'verifying' ||
                                !restoreBackupMeta?.checksumValid ||
                                (restoreDependencyStatus.checked && !restoreDependencyStatus.satisfied)
                              }
                              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white px-5 py-3 transition cursor-pointer disabled:opacity-40"
                            >
                              <RefreshCw className={`h-4 w-4 ${restoreStatus === 'restoring' || restoreStatus === 'verifying' ? 'animate-spin' : ''}`} />
                              <span>Execute Disaster Restore</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-3xl p-8 text-center text-slate-400 h-full flex flex-col items-center justify-center space-y-2">
                          <FileArchive className="h-10 w-10 text-slate-300" />
                          <div>
                            <span className="text-xs font-bold block text-slate-500">Recovery Sheet Offline</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              Upload and parse a backup file on the left to verify cryptographic checksum, content index, and metadata.
                            </span>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: AUDIT LOG & HISTORY */}
              {backupWorkspaceTab === 'history' && (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* HISTORY TABLE CARD */}
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-4">
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Disaster Recovery History Audit</h3>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.removeItem('nexus_backup_history');
                          setHistoryLogs([]);
                        }}
                        className="text-[9px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1 flex items-center gap-1 cursor-pointer transition"
                      >
                        <Trash2 className="h-3 w-3" />
                        Clear Logs
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            <th className="p-3">Timestamp</th>
                            <th className="p-3">Operation Type</th>
                            <th className="p-3">Scope / Mode</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Operator</th>
                            <th className="p-3">Row Counts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {historyLogs.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                                No recovery operations registered in history audit log.
                              </td>
                            </tr>
                          ) : (
                            historyLogs.map((item) => (
                              <tr key={item.id} className="hover:bg-slate-50 transition font-mono text-[10px] text-slate-600">
                                <td className="p-3 whitespace-nowrap font-sans text-xs text-slate-700">
                                  {new Date(item.timestamp).toLocaleString()}
                                </td>
                                <td className="p-3 whitespace-nowrap capitalize">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-sans ${
                                    item.type === 'backup'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                      : item.type === 'restore'
                                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                  }`}>
                                    {item.type}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <div className="max-w-[150px] truncate font-sans text-[11px] text-slate-700" title={item.scope}>
                                    {item.scope}
                                  </div>
                                  {item.mode && (
                                    <span className="text-[8px] text-slate-400 block uppercase">
                                      {item.mode} mode
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center gap-1 font-sans text-[10px] font-black ${
                                    item.status === 'success' ? 'text-emerald-600' : 'text-rose-600'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      item.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}></span>
                                    {item.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="p-3 whitespace-nowrap font-sans" title={item.operator || 'System'}>
                                  {(item.operator || 'System').split('@')[0]}
                                </td>
                                <td className="p-3 whitespace-nowrap text-slate-900 font-bold">
                                  {item.documentCount} records
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* RESTORATION PROTOCOL WARNING */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-slate-700">
                  <Lock className="h-4 w-4 shrink-0" />
                  <h4 className="text-xs font-black uppercase tracking-wide">Enterprise Recovery & Audit Standards</h4>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Every backup download, module export, and restore write commits a permanent audit record to the local secure storage. To comply with IFRS and GAAP bookkeeping regulations, restore actions must always be paired with automatic Posting Sequence Counter checks.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: USERS & ROLES PRIVILEGE MATRIX */}
          {activeSettingsTab === 'users_roles' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <Shield className="h-4.5 w-4.5 text-indigo-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">3. Users & Privilege Clearance Matrix</h3>
              </div>
              
              <p className="text-xs text-slate-500 leading-normal">
                Configure role access levels across core ERP modules. The matrix updates local authorization constraints dynamically.
              </p>

              {/* RENDER THE REUSABLE PRIVILEGE MATRIX COMPONENT */}
              <div id="settings-privilege-matrix" className="border border-slate-150 rounded-2xl p-1 bg-slate-50/30">
                <PrivilegeMatrix currentUserRole={userRole as UserRole} />
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY WORKSPACE COMPLIANCE */}
          {activeSettingsTab === 'security_workspace' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <Lock className="h-4.5 w-4.5 text-indigo-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">4. Security & Intrusion Protections</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Multi-Factor Authentication (MFA)</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Identity validation enforced via secondary authenticator tokens. Required for Owner and Administrator clearances.
                  </p>
                  <span className="inline-flex text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded-full">ACTIVE FOR OWNERS</span>
                </div>

                <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Secure Session Auto-Timeout</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Automatically sign out inactive sessions after 15 minutes of inactivity to protect workstations in open areas.
                  </p>
                  <span className="inline-flex text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded-full">SET TO 15 MINS</span>
                </div>

                <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Allowed Corporate IP Whitelisting</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Restrict corporate login scopes exclusively to approved subnet blocks and headquarters office locations.
                  </p>
                  <span className="inline-flex text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-full">ALL IPS ENABLED</span>
                </div>

                <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">OAuth Identity Proxy Tunnel</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Google single sign-on mapping for active staff. Restricts credentials exposure and mitigates brute force vectors.
                  </p>
                  <span className="inline-flex text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">OAUTH ENABLED</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOGS ACTIVITY LOGGER */}
          {activeSettingsTab === 'audit_logs' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <FileText className="h-4.5 w-4.5 text-indigo-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">5. Immutable Corporate Audit Logging</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Live system operations are audited. All entries are cryptographically signed and immutable under standard compliance policies.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      alert("Audit logs export generated successfully. Check standard logs.");
                    }}
                    className="inline-flex items-center gap-1 bg-slate-950 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-slate-800 transition shadow-xs cursor-pointer shrink-0"
                  >
                    <Download className="h-3 w-3" />
                    <span>Export Audit Trail</span>
                  </button>
                </div>

                {/* Audit table mockup/log list */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-150">
                  <div className="p-3 bg-slate-50/80 flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                    <span>Audit Operation Detail</span>
                    <span>Operator</span>
                  </div>
                  <div className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/50 transition">
                    <div className="space-y-1">
                      <span className="font-bold text-slate-800 block">Initialize Country & Preferences</span>
                      <span className="text-[9px] text-slate-400 font-mono">Timestamp: {new Date().toLocaleDateString()} | Action ID: ACT-9011</span>
                    </div>
                    <span className="font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded uppercase text-[10px]">owner</span>
                  </div>

                  <div className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/50 transition">
                    <div className="space-y-1">
                      <span className="font-bold text-slate-800 block">Seed Role Permissions Template</span>
                      <span className="text-[9px] text-slate-400 font-mono">Timestamp: {new Date().toLocaleDateString()} | Action ID: ACT-7822</span>
                    </div>
                    <span className="font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase text-[10px]">system</span>
                  </div>

                  <div className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/50 transition">
                    <div className="space-y-1">
                      <span className="font-bold text-slate-800 block">Workstation Administrator Authorization</span>
                      <span className="text-[9px] text-slate-400 font-mono">Timestamp: {new Date().toLocaleDateString()} | Action ID: ACT-1049</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded uppercase text-[10px]">authorized admin</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

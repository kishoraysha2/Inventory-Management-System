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
  AlertTriangle,
  Barcode,
  X
} from 'lucide-react';
import { db, auth, logSystemActivity } from '../lib/firebase';
import { syncSequenceCounters } from '../lib/postingEngine';
import { MODULE_REGISTRY } from '../core/moduleRegistry';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { TranslationService } from '../services/translation/TranslationService';
import JSZip from 'jszip';

import { AppPermissions, UserRole } from '../hooks/usePermission';
import PrivilegeMatrix from './PrivilegeMatrix';
import CompanyProfileTab from '../features/settings/components/CompanyProfileTab';
import BackupRestoreTab from '../features/settings/components/BackupRestoreTab';
import { EnterpriseIdentityValidationService } from '../services/validation/EnterpriseIdentityValidationService';
import UsersRolesTab from '../features/settings/components/UsersRolesTab';
import SecurityTab from '../features/settings/components/SecurityTab';
import AuditLogsTab from '../features/settings/components/AuditLogsTab';
import BarcodeIntegrationTab from '../features/settings/components/BarcodeIntegrationTab';

interface CompanyProfile {
  name: string;
  companyNameArabic?: string;
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
  currencyName?: string;
  currencyCode?: string;
  currencySymbol?: string;
  currencyPosition?: string;
  decimalPrecision?: number;
  thousandsSeparator?: string;
  decimalSeparator?: string;
}

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: "Apex Global Supply Ltd.",
  companyNameArabic: "",
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
  language: "English",
  currencyName: "US Dollar",
  currencyCode: "USD",
  currencySymbol: "$",
  currencyPosition: "Before",
  decimalPrecision: 2,
  thousandsSeparator: ",",
  decimalSeparator: "."
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
  const [translationNotice, setTranslationNotice] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);

  const isReadOnly = !permissions.manageSettings;

  // --- SETTINGS NAVIGATION STATE ---
  // Defaulting activeSettingsTab to 'company_settings' as required by Settings list
  const [activeSettingsTab, setActiveSettingsTab] = useState<'company_settings' | 'backup_restore' | 'users_roles' | 'security_workspace' | 'audit_logs' | 'barcode_integration'>('company_settings');

  // --- REGIONAL SETTINGS PARAMETERS ---
  // Country selector state and helper logic are fully encapsulated within CompanyProfileTab.tsx

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
        await syncSequenceCounters(synchronizedSequences, setDoc);
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
            companyNameArabic: data.companyNameArabic || '',
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
            language: data.language || DEFAULT_COMPANY_PROFILE.language,
            currencyName: data.currencyName || DEFAULT_COMPANY_PROFILE.currencyName,
            currencyCode: data.currencyCode || DEFAULT_COMPANY_PROFILE.currencyCode,
            currencySymbol: data.currencySymbol || DEFAULT_COMPANY_PROFILE.currencySymbol,
            currencyPosition: data.currencyPosition || DEFAULT_COMPANY_PROFILE.currencyPosition,
            decimalPrecision: data.decimalPrecision !== undefined ? data.decimalPrecision : DEFAULT_COMPANY_PROFILE.decimalPrecision,
            thousandsSeparator: data.thousandsSeparator !== undefined ? data.thousandsSeparator : DEFAULT_COMPANY_PROFILE.thousandsSeparator,
            decimalSeparator: data.decimalSeparator || DEFAULT_COMPANY_PROFILE.decimalSeparator
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
        companyNameArabic: profile.companyNameArabic ? profile.companyNameArabic.trim() : '',
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
        language: profile.language ? profile.language.trim() : 'English',
        currencyName: profile.currencyName ? profile.currencyName.trim() : DEFAULT_COMPANY_PROFILE.currencyName,
        currencyCode: profile.currencyCode ? profile.currencyCode.trim() : DEFAULT_COMPANY_PROFILE.currencyCode,
        currencySymbol: profile.currencySymbol ? profile.currencySymbol.trim() : DEFAULT_COMPANY_PROFILE.currencySymbol,
        currencyPosition: profile.currencyPosition ? profile.currencyPosition.trim() : DEFAULT_COMPANY_PROFILE.currencyPosition,
        decimalPrecision: profile.decimalPrecision !== undefined ? Number(profile.decimalPrecision) : DEFAULT_COMPANY_PROFILE.decimalPrecision,
        thousandsSeparator: profile.thousandsSeparator !== undefined ? profile.thousandsSeparator : DEFAULT_COMPANY_PROFILE.thousandsSeparator,
        decimalSeparator: profile.decimalSeparator ? profile.decimalSeparator.trim() : DEFAULT_COMPANY_PROFILE.decimalSeparator
      };

      // Centralized Enterprise Identity Validation
      const validationResult = await EnterpriseIdentityValidationService.validateIdentity({
        name: cleanProfile.name,
        phone: cleanProfile.phone,
        email: cleanProfile.email,
        vatNumber: cleanProfile.taxRegistrationId,
        currentEntityId: 'config',
        currentCollection: 'businessProfile',
        localCompanyProfile: cleanProfile
      });

      if (!validationResult.isValid) {
        const firstError = Object.values(validationResult.errors)[0];
        setSaveStatus('error');
        alert(firstError || 'Duplicate identity parameters detected across enterprise.');
        setIsSaving(false);
        return;
      }

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

            <button
              type="button"
              id="tab-btn-barcode-integration"
              onClick={() => setActiveSettingsTab('barcode_integration')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition text-left border ${
                activeSettingsTab === 'barcode_integration'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm font-extrabold'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent hover:text-slate-900'
              }`}
            >
              <Barcode className="h-4.5 w-4.5 shrink-0 text-indigo-400" />
              <div className="truncate">
                <span>Barcode Integration</span>
                <span className="text-[8px] opacity-75 font-medium block mt-0.5">Local & Cloud Gateway</span>
              </div>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: TAB CONTENT STAGE */}
        <div className="lg:col-span-9 space-y-6">
          
          {activeSettingsTab === 'company_settings' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-4 shadow-3xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-widest block">
                    Company Name (Arabic)
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      setTranslationNotice(null);
                      const sourceName = (profile.name || profile.tradeName || '').trim();
                      if (!sourceName) {
                        setTranslationNotice({ type: 'warning', message: 'Please enter a Company Name first.' });
                        return;
                      }
                      const res = await TranslationService.translateToArabic(sourceName);
                      if (res.success && res.translatedText) {
                        setProfile(prev => ({ ...prev, companyNameArabic: res.translatedText }));
                        setTranslationNotice({ type: 'success', message: `Arabic name generated: ${res.translatedText}` });
                      } else {
                        setTranslationNotice({ type: 'warning', message: res.message || 'Translation not found in offline dictionary.' });
                      }
                    }}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition border border-indigo-100/80 cursor-pointer"
                  >
                    Generate Arabic
                  </button>
                </div>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    dir="rtl"
                    disabled={isReadOnly}
                    value={profile.companyNameArabic || ''}
                    onChange={(e) => setProfile({ ...profile, companyNameArabic: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 py-2.5 px-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 text-right font-sans"
                    placeholder="اسم الشركة بالعربية (اختياري)"
                  />
                  <p className="text-[10px] text-slate-400">Optional Arabic company title stored in business profile (companyNameArabic).</p>
                  
                  {translationNotice && (
                    <div className={`mt-2 text-[11px] font-semibold px-3 py-2 rounded-xl flex items-center justify-between border shadow-3xs transition-all ${
                      translationNotice.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                        : 'bg-amber-50 text-amber-800 border-amber-200/80'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {translationNotice.type === 'success' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                        <span>{translationNotice.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTranslationNotice(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <CompanyProfileTab
                profile={profile}
                setProfile={setProfile}
                isReadOnly={isReadOnly}
                isSaving={isSaving}
                saveStatus={saveStatus}
                handleSave={handleSave}
              />
            </div>
          )}

          {/* TAB 2: DATABASE BACKUP & SNAPSHOT OPERATIONS */}
          {activeSettingsTab === 'backup_restore' && (
            <BackupRestoreTab
              backupWorkspaceTab={backupWorkspaceTab}
              setBackupWorkspaceTab={setBackupWorkspaceTab}
              backupStatus={backupStatus}
              backupProgress={backupProgress}
              backupStats={backupStats}
              collectionDetails={collectionDetails}
              backupLogs={backupLogs}
              lastBackupTime={lastBackupTime}
              handleExportBackup={handleExportBackup}
              scanDatabase={scanDatabase}
              BACKUP_MODULE_GROUPS={BACKUP_MODULE_GROUPS}
              handleExportModuleBackup={handleExportModuleBackup}
              restoreFile={restoreFile}
              restoreBackupMeta={restoreBackupMeta}
              restoreProgress={restoreProgress}
              restoreStatus={restoreStatus}
              restoreLogs={restoreLogs}
              restoreSelectedModules={restoreSelectedModules}
              setRestoreSelectedModules={setRestoreSelectedModules}
              restoreDuplicateStrategy={restoreDuplicateStrategy}
              setRestoreDuplicateStrategy={setRestoreDuplicateStrategy}
              restoreMode={restoreMode}
              setRestoreMode={setRestoreMode}
              restoreConfirmationText={restoreConfirmationText}
              setRestoreConfirmationText={setRestoreConfirmationText}
              restoreDependencyStatus={restoreDependencyStatus}
              handleRestoreFileSelected={handleRestoreFileSelected}
              handleExecuteRestore={handleExecuteRestore}
              handleClearRestore={handleClearRestore}
              historyLogs={historyLogs}
              setHistoryLogs={setHistoryLogs}
            />
          )}

          {/* TAB 3: USERS & ROLES PRIVILEGE MATRIX */}
          {activeSettingsTab === 'users_roles' && (
            <UsersRolesTab userRole={userRole as UserRole} />
          )}

          {/* TAB 4: SECURITY WORKSPACE COMPLIANCE */}
          {activeSettingsTab === 'security_workspace' && (
            <SecurityTab />
          )}

          {/* TAB 5: AUDIT LOGS ACTIVITY LOGGER */}
          {activeSettingsTab === 'audit_logs' && (
            <AuditLogsTab />
          )}

          {/* TAB 6: BARCODE INTEGRATION LAYER (SPRINT 7) */}
          {activeSettingsTab === 'barcode_integration' && (
            <BarcodeIntegrationTab />
          )}

        </div>
      </div>
    </div>
  );
}

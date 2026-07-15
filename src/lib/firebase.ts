import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  getDocFromServer,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';

import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Check standard connection
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration: Client is offline.");
    }
  }
}

// Initial connection test
testConnection();

export async function logSystemActivity(action: string, details: string) {
  try {
    const logId = `syslog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const user = auth.currentUser?.email || 'System';
    const timestamp = new Date().toISOString();

    const payload = {
      id: logId,
      action,
      user,
      timestamp,
      details
    };

    await setDoc(doc(db, 'Logs', logId), payload);
    return logId;
  } catch (error) {
    console.error("Failed to write to system Logs: ", error);
  }
}

export interface FinancialAuditLog {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  referenceId: string | null;
  performedBy: string;
  userRole: string;
  customerId: string | null;
  supplierId: string | null;
  productId: string | null;
  amount: number;
  paymentType: string | null;
  previousState: string;
  newState: string;
  notes: string;

  // Legacy compatibility fields
  actionType?: 'SALE' | 'PURCHASE' | 'PAYMENT' | 'VOID' | 'SYSTEM';
  user?: string;
  beforeState?: string;
  afterState?: string;
  amountImpact?: {
    cash: number;
    stock: number;
    due: number;
  };
}

export async function logFinancialAudit(
  actionTypeOrParams: any,
  entityId?: string,
  beforeState?: any,
  afterState?: any,
  amountImpact?: { cash: number; stock: number; due: number }
): Promise<string | undefined> {
  try {
    const logId = `finlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const performedBy = auth.currentUser?.email || 'admin_01@nexus.erp';
    const timestamp = new Date().toISOString();

    let payload: FinancialAuditLog;

    if (actionTypeOrParams && typeof actionTypeOrParams === 'object') {
      const p = actionTypeOrParams;
      const act = p.action || 'SYSTEM';
      const entType = p.entityType || 'system';
      const prevStr = typeof p.previousState === 'string' ? p.previousState : JSON.stringify(p.previousState || {});
      const newStr = typeof p.newState === 'string' ? p.newState : JSON.stringify(p.newState || {});

      payload = {
        id: logId,
        timestamp,
        action: act,
        entityType: entType,
        entityId: p.entityId || '',
        referenceId: p.referenceId || null,
        performedBy,
        userRole: p.userRole || localStorage.getItem('demo_user_role') || 'viewer',
        customerId: p.customerId || null,
        supplierId: p.supplierId || null,
        productId: p.productId || null,
        amount: p.amount ?? 0,
        paymentType: p.paymentType || null,
        previousState: prevStr,
        newState: newStr,
        notes: p.notes || '',

        // Legacy compatibility
        actionType: (act.includes('SALE') ? 'SALE' : act.includes('PROCURE') ? 'PURCHASE' : act.includes('PAYMENT') ? 'PAYMENT' : 'SYSTEM') as any,
        user: performedBy,
        beforeState: prevStr,
        afterState: newStr,
        amountImpact: {
          cash: entType === 'payment' ? p.amount : (p.paymentType === 'Cash' ? p.amount : 0),
          stock: entType === 'sale' ? -p.amount : (entType === 'purchase' ? p.amount : 0),
          due: p.paymentType === 'Credit' ? p.amount : 0
        }
      };
    } else {
      // Legacy signature handling
      const actionType = actionTypeOrParams;
      const bState = beforeState || {};
      const aState = afterState || {};
      const amtImp = amountImpact || { cash: 0, stock: 0, due: 0 };

      const determinedEntityType = 
        actionType === 'SALE' ? 'sale' :
        actionType === 'PURCHASE' ? 'purchase' :
        actionType === 'PAYMENT' ? 'payment' : 'system';

      const determinedAction = 
        actionType === 'VOID' ? `VOID_${determinedEntityType.toUpperCase()}` : `CREATE_${determinedEntityType.toUpperCase()}`;

      const custId = bState.customerId || aState.customerId || null;
      const suppId = bState.supplierId || aState.supplierId || null;
      const prodId = bState.productId || aState.productId || null;
      const amt = bState.totalAmount || bState.amountPaid || aState.totalAmount || aState.amountPaid || 0;
      const payType = bState.paymentType || aState.paymentType || null;
      const prevStr = JSON.stringify(bState);
      const newStr = JSON.stringify(aState);

      payload = {
        id: logId,
        timestamp,
        action: determinedAction,
        entityType: determinedEntityType,
        entityId: entityId || '',
        referenceId: null,
        performedBy,
        userRole: localStorage.getItem('demo_user_role') || 'viewer',
        customerId: custId,
        supplierId: suppId,
        productId: prodId,
        amount: amt,
        paymentType: payType,
        previousState: prevStr,
        newState: newStr,
        notes: `Legacy financial audit log for action: ${actionType}`,

        // Legacy compatibility
        actionType,
        user: performedBy,
        beforeState: prevStr,
        afterState: newStr,
        amountImpact: amtImp
      };
    }

    await setDoc(doc(db, 'financialLogs', logId), payload);
    return logId;
  } catch (err) {
    console.error("Failed to write financial audit log:", err);
  }
}


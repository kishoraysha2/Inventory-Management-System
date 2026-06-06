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
  actionType: 'SALE' | 'PURCHASE' | 'PAYMENT' | 'VOID' | 'SYSTEM';
  entityId: string;
  user: string;
  timestamp: string;
  beforeState: string;
  afterState: string;
  amountImpact: {
    cash: number;
    stock: number;
    due: number;
  };
}

export async function logFinancialAudit(
  actionType: 'SALE' | 'PURCHASE' | 'PAYMENT' | 'VOID' | 'SYSTEM',
  entityId: string,
  beforeState: any,
  afterState: any,
  amountImpact: { cash: number; stock: number; due: number }
) {
  try {
    const logId = `finlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const user = auth.currentUser?.email || 'admin_01@nexus.erp';
    const timestamp = new Date().toISOString();

    const payload: FinancialAuditLog = {
      id: logId,
      actionType,
      entityId,
      user,
      timestamp,
      beforeState: JSON.stringify(beforeState || {}),
      afterState: JSON.stringify(afterState || {}),
      amountImpact
    };

    await setDoc(doc(db, 'financialLogs', logId), payload);
    return logId;
  } catch (err) {
    console.error("Failed to write financial audit log:", err);
  }
}


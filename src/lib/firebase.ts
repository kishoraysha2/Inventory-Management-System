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

const firebaseConfig = {
  apiKey: "AIzaSyB0-BmSBPwGcgtwuq3myaAQpZWWM7Rqt04",
  authDomain: "inventoryapp-f76ea.firebaseapp.com",
  projectId: "inventoryapp-f76ea",
  storageBucket: "inventoryapp-f76ea.firebasestorage.app",
  messagingSenderId: "260890658689",
  appId: "1:260890658689:web:9abaab791557a9365bca80",
  measurementId: "G-SG8402MGKS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});
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


import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const VALID_CATEGORIES = [
  'Verduras y hortalizas',
  'Frutas',
  'Tubérculos, raíces y plátanos',
  'Granos y cereales',
  'Lácteos y huevos',
  'Carnes',
  'Pescados',
  'Procesados',
  'Aseo y hogar',
  'Bebidas y otros',
] as const;

export type ProductCategory = (typeof VALID_CATEGORIES)[number];

export const VALID_UNITS = ['unid', 'kg', 'g', 'L', 'ml', 'lb', 'paq'] as const;
export type ProductUnit = (typeof VALID_UNITS)[number];

export const VALID_LOCATIONS = ['Alacena', 'Nevera', 'Congelador', 'Aseo'] as const;
export type StorageLocation = (typeof VALID_LOCATIONS)[number];

export const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export function sanitizeString(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const trimmed = (val ?? '').trim();
  const res = trimmed.length > 0 ? trimmed : fallback;
  return res.slice(0, maxLen);
}

export function sanitizeNumber(val: number | string | undefined | null, min = 0, max = 100000000): number {
  const parsed = typeof val === 'number' ? val : Number(val);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export type IdentityConflictField = 'phone' | 'email' | 'vatNumber' | 'name';

export interface IdentityConflict {
  conflictingCollection: string;
  entityType: string;
  documentId: string;
  displayName: string;
  conflictingField: IdentityConflictField;
  value: string;
}

export interface IdentityValidationParams {
  name?: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
  currentEntityId?: string;
  currentCollection?: string;
  
  // Optional in-memory / local state fallbacks
  localCustomers?: any[];
  localSuppliers?: any[];
  localUsers?: any[];
  localCompanyProfile?: any;
}

export interface IdentityValidationResult {
  isValid: boolean;
  errors: {
    name?: string;
    phone?: string;
    email?: string;
    vatNumber?: string;
  };
  conflicts: IdentityConflict[];
}

export interface IdentityCollectionDefinition {
  collectionName: string;
  entityType: string;
  idField: string;
  nameField: string;
  phoneFields: string[];
  emailFields: string[];
  vatFields: string[];
}

export const DEFAULT_IDENTITY_COLLECTIONS: IdentityCollectionDefinition[] = [
  {
    collectionName: 'customers',
    entityType: 'Customer',
    idField: 'id',
    nameField: 'name',
    phoneFields: ['phone', 'mobile'],
    emailFields: ['email'],
    vatFields: ['vatNumber', 'vat', 'taxRegistrationId']
  },
  {
    collectionName: 'suppliers',
    entityType: 'Supplier',
    idField: 'id',
    nameField: 'name',
    phoneFields: ['phone', 'mobile'],
    emailFields: ['email'],
    vatFields: ['vatNumber', 'vat', 'taxRegistrationId']
  },
  {
    collectionName: 'users',
    entityType: 'User',
    idField: 'uid',
    nameField: 'displayName',
    phoneFields: ['phone', 'phoneNumber'],
    emailFields: ['email'],
    vatFields: ['vatNumber', 'taxRegistrationId']
  },
  {
    collectionName: 'businessProfile',
    entityType: 'Company Profile',
    idField: 'id',
    nameField: 'name',
    phoneFields: ['phone'],
    emailFields: ['email'],
    vatFields: ['taxRegistrationId', 'vatNumber']
  }
];

export class EnterpriseIdentityValidationService {
  private static registeredCollections: IdentityCollectionDefinition[] = [...DEFAULT_IDENTITY_COLLECTIONS];

  /**
   * Register a new identity collection (e.g. employees, vendors, doctors, patients) for future expansion.
   */
  public static registerCollection(def: IdentityCollectionDefinition) {
    const index = this.registeredCollections.findIndex(c => c.collectionName === def.collectionName);
    if (index >= 0) {
      this.registeredCollections[index] = def;
    } else {
      this.registeredCollections.push(def);
    }
  }

  public static getRegisteredCollections(): IdentityCollectionDefinition[] {
    return [...this.registeredCollections];
  }

  /**
   * Normalization helpers
   */
  public static normalizePhone(phone?: string): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    if (!trimmed) return '';
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
  }

  public static normalizeEmail(email?: string): string {
    if (!email) return '';
    return email.trim().toLowerCase();
  }

  public static normalizeVat(vat?: string): string {
    if (!vat) return '';
    return vat.trim().toLowerCase().replace(/[\s\-]/g, '');
  }

  public static normalizeName(name?: string): string {
    if (!name) return '';
    return name.trim().toLowerCase();
  }

  /**
   * Main asynchronous cross-collection identity validation engine.
   */
  public static async validateIdentity(params: IdentityValidationParams): Promise<IdentityValidationResult> {
    const normName = this.normalizeName(params.name);
    const normPhone = this.normalizePhone(params.phone);
    const normEmail = this.normalizeEmail(params.email);
    const normVat = this.normalizeVat(params.vatNumber);

    const conflicts: IdentityConflict[] = [];
    const errors: IdentityValidationResult['errors'] = {};

    // Fast return if no target identity fields provided
    if (!normName && !normPhone && !normEmail && !normVat) {
      return { isValid: true, errors: {}, conflicts: [] };
    }

    for (const collDef of this.registeredCollections) {
      const items = await this.fetchCollectionDocs(collDef, params);

      for (const item of items) {
        const itemId = String(item[collDef.idField] || item.id || item.uid || 'config');

        // Ignore currently edited document during edit operations
        if (params.currentEntityId) {
          const sameCollection = params.currentCollection ? params.currentCollection === collDef.collectionName : true;
          if (sameCollection && itemId === params.currentEntityId) {
            continue;
          }
          // Special case for company profile where id is 'config'
          if (collDef.collectionName === 'businessProfile' && params.currentCollection === 'businessProfile') {
            continue;
          }
        }

        const displayName = String(
          item[collDef.nameField] || item.name || item.displayName || item.tradeName || item.email || collDef.entityType
        );

        // 1. Check Phone Number duplicate globally
        if (normPhone) {
          for (const field of collDef.phoneFields) {
            const rawVal = item[field];
            if (rawVal) {
              const itemNormPhone = this.normalizePhone(rawVal);
              const itemRawTrim = String(rawVal).trim();
              if (itemNormPhone === normPhone || itemRawTrim === params.phone?.trim()) {
                conflicts.push({
                  conflictingCollection: collDef.collectionName,
                  entityType: collDef.entityType,
                  documentId: itemId,
                  displayName,
                  conflictingField: 'phone',
                  value: String(rawVal)
                });
                break;
              }
            }
          }
        }

        // 2. Check Email Address duplicate globally
        if (normEmail) {
          for (const field of collDef.emailFields) {
            const rawVal = item[field];
            if (rawVal) {
              const itemNormEmail = this.normalizeEmail(rawVal);
              if (itemNormEmail === normEmail) {
                conflicts.push({
                  conflictingCollection: collDef.collectionName,
                  entityType: collDef.entityType,
                  documentId: itemId,
                  displayName,
                  conflictingField: 'email',
                  value: String(rawVal)
                });
                break;
              }
            }
          }
        }

        // 3. Check VAT / Tax Registration Number duplicate globally
        if (normVat) {
          for (const field of collDef.vatFields) {
            const rawVal = item[field];
            if (rawVal) {
              const itemNormVat = this.normalizeVat(rawVal);
              if (itemNormVat === normVat) {
                conflicts.push({
                  conflictingCollection: collDef.collectionName,
                  entityType: collDef.entityType,
                  documentId: itemId,
                  displayName,
                  conflictingField: 'vatNumber',
                  value: String(rawVal)
                });
                break;
              }
            }
          }
        }

        // 4. Check Name duplicate (within same collection or across)
        if (normName && params.currentCollection === collDef.collectionName) {
          const rawVal = item[collDef.nameField] || item.name;
          if (rawVal) {
            const itemNormName = this.normalizeName(rawVal);
            if (itemNormName === normName) {
              conflicts.push({
                conflictingCollection: collDef.collectionName,
                entityType: collDef.entityType,
                documentId: itemId,
                displayName,
                conflictingField: 'name',
                value: String(rawVal)
              });
            }
          }
        }
      }
    }

    // Build user-friendly error messages based on conflicts
    for (const conflict of conflicts) {
      if (conflict.conflictingField === 'phone' && !errors.phone) {
        if (conflict.conflictingCollection === params.currentCollection) {
          errors.phone = `${conflict.entityType} phone already exists.`;
        } else {
          errors.phone = `Phone number is already registered to ${conflict.entityType} '${conflict.displayName}'.`;
        }
      } else if (conflict.conflictingField === 'email' && !errors.email) {
        if (conflict.conflictingCollection === params.currentCollection) {
          errors.email = `${conflict.entityType} email address already exists.`;
        } else {
          errors.email = `Email address is already registered to ${conflict.entityType} '${conflict.displayName}'.`;
        }
      } else if (conflict.conflictingField === 'vatNumber' && !errors.vatNumber) {
        if (conflict.conflictingCollection === params.currentCollection) {
          errors.vatNumber = `${conflict.entityType} VAT number already exists.`;
        } else {
          errors.vatNumber = `VAT Number is already registered to ${conflict.entityType} '${conflict.displayName}'.`;
        }
      } else if (conflict.conflictingField === 'name' && !errors.name) {
        errors.name = `${conflict.entityType} name already exists.`;
      }
    }

    return {
      isValid: conflicts.length === 0,
      errors,
      conflicts
    };
  }

  /**
   * Helper to fetch documents for a collection from Firestore with local/memory fallbacks.
   */
  private static async fetchCollectionDocs(
    collDef: IdentityCollectionDefinition,
    params: IdentityValidationParams
  ): Promise<any[]> {
    const collectionName = collDef.collectionName;

    // 1. Check if provided in explicit local parameters
    if (collectionName === 'customers' && Array.isArray(params.localCustomers) && params.localCustomers.length > 0) {
      return params.localCustomers;
    }
    if (collectionName === 'suppliers' && Array.isArray(params.localSuppliers) && params.localSuppliers.length > 0) {
      return params.localSuppliers;
    }
    if (collectionName === 'users' && Array.isArray(params.localUsers) && params.localUsers.length > 0) {
      return params.localUsers;
    }
    if (collectionName === 'businessProfile' && params.localCompanyProfile) {
      return [{ id: 'config', ...params.localCompanyProfile }];
    }

    // 2. Fetch from Firestore if available
    try {
      if (collectionName === 'businessProfile') {
        const docRef = doc(db, 'businessProfile', 'config');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          return [{ id: snap.id, ...snap.data() }];
        }
      } else {
        const colRef = collection(db, collectionName);
        const snap = await getDocs(colRef);
        if (!snap.empty) {
          return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
      }
    } catch (e) {
      console.warn(`[EnterpriseIdentityValidationService] Firestore read failed for collection ${collectionName}, using local cache fallback.`, e);
    }

    // 3. Fallback to localStorage
    try {
      if (collectionName === 'customers') {
        const cached = localStorage.getItem('inventory_customers');
        if (cached) return JSON.parse(cached);
      } else if (collectionName === 'suppliers') {
        const cached = localStorage.getItem('inventory_suppliers');
        if (cached) return JSON.parse(cached);
      } else if (collectionName === 'businessProfile') {
        const cached = localStorage.getItem('invoice_company_profile');
        if (cached) return [{ id: 'config', ...JSON.parse(cached) }];
      }
    } catch (e) {
      // Ignore parse errors
    }

    return [];
  }
}

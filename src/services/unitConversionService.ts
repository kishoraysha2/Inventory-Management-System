import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UnitConversion } from '../types';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class UnitConversionService {
  private static COLLECTION_NAME = 'unitConversions';

  /**
   * Validates a conversion rule before saving.
   */
  public static validateConversion(
    data: Partial<UnitConversion>,
    existingConversions: UnitConversion[] = []
  ): ValidationResult {
    // 1. Check required fields
    if (!data.productId) {
      return { valid: false, error: 'Product selection is required.' };
    }
    if (!data.baseUnitCode || !data.baseUnitId) {
      return { valid: false, error: 'Product Base Unit is missing or invalid.' };
    }
    if (!data.alternateUnitCode || !data.alternateUnitId) {
      return { valid: false, error: 'Alternate Unit selection is required.' };
    }

    // 2. Prevent Base Unit = Alternate Unit
    if (
      data.baseUnitId === data.alternateUnitId ||
      data.baseUnitCode.trim().toUpperCase() === data.alternateUnitCode.trim().toUpperCase()
    ) {
      return { valid: false, error: 'Alternate Unit cannot be the same as Base Unit.' };
    }

    // 3. Prevent Conversion Factor <= 0
    const factor = Number(data.conversionFactor);
    if (isNaN(factor) || factor <= 0) {
      return { valid: false, error: 'Conversion Factor must be a positive number greater than 0.' };
    }

    // 4. Prevent duplicate conversion pairs for the same product
    const duplicate = existingConversions.find(
      (c) =>
        c.id !== data.id &&
        c.productId === data.productId &&
        (c.alternateUnitId === data.alternateUnitId ||
          c.alternateUnitCode.trim().toUpperCase() === data.alternateUnitCode?.trim().toUpperCase())
    );

    if (duplicate) {
      return {
        valid: false,
        error: `Conversion rule for Alternate Unit "${data.alternateUnitCode}" already exists for this product.`,
      };
    }

    return { valid: true };
  }

  /**
   * Fetches all unit conversions for a specific product.
   */
  public static async getConversionsByProduct(productId: string): Promise<UnitConversion[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('productId', '==', productId)
      );
      const querySnapshot = await getDocs(q);
      const list: UnitConversion[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as UnitConversion);
      });
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, this.COLLECTION_NAME);
      return [];
    }
  }

  /**
   * Fetches all unit conversions across the enterprise.
   */
  public static async getAllConversions(): Promise<UnitConversion[]> {
    try {
      const querySnapshot = await getDocs(collection(db, this.COLLECTION_NAME));
      const list: UnitConversion[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as UnitConversion);
      });
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, this.COLLECTION_NAME);
      return [];
    }
  }

  /**
   * Subscribes to real-time updates for unit conversions.
   */
  public static subscribeAllConversions(
    onData: (conversions: UnitConversion[]) => void,
    onError?: (err: any) => void
  ): () => void {
    const colRef = collection(db, this.COLLECTION_NAME);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: UnitConversion[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as UnitConversion);
        });
        onData(list);
      },
      (err) => {
        console.error('Error listening to unitConversions:', err);
        if (onError) onError(err);
      }
    );
  }

  /**
   * Creates a new unit conversion record.
   */
  public static async createConversion(
    data: Omit<UnitConversion, 'id' | 'createdAt' | 'updatedAt'>,
    existingConversions: UnitConversion[] = []
  ): Promise<UnitConversion> {
    const validation = this.validateConversion(data, existingConversions);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid unit conversion data.');
    }

    const id = doc(collection(db, this.COLLECTION_NAME)).id;
    const now = new Date().toISOString();

    const record: UnitConversion = {
      ...data,
      id,
      direction: data.direction || 'multiply',
      status: data.status || 'active',
      isActive: data.status === 'active',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, this.COLLECTION_NAME, id), record);
      return record;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${this.COLLECTION_NAME}/${id}`);
      throw error;
    }
  }

  /**
   * Updates an existing unit conversion record.
   */
  public static async updateConversion(
    id: string,
    updates: Partial<UnitConversion>,
    existingConversions: UnitConversion[] = []
  ): Promise<void> {
    const now = new Date().toISOString();
    const payload = {
      ...updates,
      updatedAt: now,
      ...(updates.status ? { isActive: updates.status === 'active' } : {}),
    };

    try {
      await updateDoc(doc(db, this.COLLECTION_NAME, id), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${this.COLLECTION_NAME}/${id}`);
      throw error;
    }
  }

  /**
   * Deletes a unit conversion record.
   */
  public static async deleteConversion(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, this.COLLECTION_NAME, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${this.COLLECTION_NAME}/${id}`);
      throw error;
    }
  }
}

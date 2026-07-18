export interface IRestoreService {
  /**
   * Resolves the module ID or name from a JSON filename.
   */
  resolveModuleNameFromFilename(filename: string, schemaList: string[]): string;

  /**
   * Validates if a restore checksum is correct.
   */
  validateRestoreChecksum(manifestChecksum: string | undefined, calculatedChecksum: string): boolean;
}

export class RestoreService implements IRestoreService {
  resolveModuleNameFromFilename(filename: string, schemaList: string[]): string {
    const baseName = filename.toLowerCase().replace('.json', '').replace('_backup', '');
    
    if (baseName === 'businessprofile') {
      return 'businessProfile/config';
    } else if (baseName === 'system') {
      return 'system/bootstrap';
    } else if (baseName === 'rolepermissions') {
      return 'rolePermissions';
    } else if (baseName === 'expensecategories') {
      return 'expenseCategories';
    } else if (baseName === 'chartofaccounts') {
      return 'chartOfAccounts';
    } else if (baseName === 'ledgerentries') {
      return 'ledgerEntries';
    } else if (baseName === 'cashledger') {
      return 'cashLedger';
    } else if (baseName === 'financiallogs') {
      return 'financialLogs';
    } else {
      const found = schemaList.find(
        s => s.toLowerCase() === baseName || s.toLowerCase().replace('/', '_') === baseName
      );
      return found || baseName;
    }
  }

  validateRestoreChecksum(manifestChecksum: string | undefined, calculatedChecksum: string): boolean {
    if (!manifestChecksum) {
      return true; // No checksum to validate, consider legacy success
    }
    return manifestChecksum === calculatedChecksum;
  }
}

export const restoreService = new RestoreService();

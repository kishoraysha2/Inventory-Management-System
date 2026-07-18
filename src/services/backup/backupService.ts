export interface IBackupService {
  /**
   * Calculates a 32-bit CRC checksum of a given data string.
   */
  calculateChecksum(dataStr: string): string;

  /**
   * Generates a backup manifest object.
   */
  generateManifest(params: {
    companyName: string;
    totalDocsCopied: number;
    totalCollsCopied: number;
    combinedDataString: string;
    createdBy: string;
    moduleList: string[];
    erpVersion?: string;
    schemaVersion?: string;
    backupVersion?: string;
  }): {
    erpVersion: string;
    schemaVersion: string;
    backupVersion: string;
    backupType: string;
    companyName: string;
    companyId: string;
    projectId: string;
    createdBy: string;
    createdAt: string;
    documentCount: number;
    collectionCount: number;
    moduleList: string[];
    checksum: string;
  };
}

export class BackupService implements IBackupService {
  calculateChecksum(dataStr: string): string {
    let hash = 0;
    for (let i = 0; i < dataStr.length; i++) {
      const char = dataStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'CRC-' + Math.abs(hash).toString(16).toUpperCase();
  }

  generateManifest(params: {
    companyName: string;
    totalDocsCopied: number;
    totalCollsCopied: number;
    combinedDataString: string;
    createdBy: string;
    moduleList: string[];
    erpVersion?: string;
    schemaVersion?: string;
    backupVersion?: string;
  }) {
    return {
      erpVersion: params.erpVersion || "6.3.6",
      schemaVersion: params.schemaVersion || "1.1",
      backupVersion: params.backupVersion || "1.0",
      backupType: "full",
      companyName: params.companyName || "Nexus Corporate",
      companyId: "nexus-erp-default",
      projectId: "nexus-erp-production",
      createdBy: params.createdBy || "System Admin",
      createdAt: new Date().toISOString(),
      documentCount: params.totalDocsCopied,
      collectionCount: params.totalCollsCopied,
      moduleList: params.moduleList,
      checksum: this.calculateChecksum(params.combinedDataString)
    };
  }
}

export const backupService = new BackupService();

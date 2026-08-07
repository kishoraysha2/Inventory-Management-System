import {
  IBarcodeProvider,
  IntegrationProviderMode,
  BarcodeIntegrationSettings,
  DEFAULT_BARCODE_SETTINGS,
  GenerateBarcodeRequest,
  PrintBarcodeRequest,
  SyncBarcodeRequest,
  BarcodeResponseModel,
  BarcodeHealthCheckResult,
} from '../../types/barcodeIntegration';
import { LocalBarcodeProvider } from './providers/LocalBarcodeProvider';
import { CloudBarcodeProvider } from './providers/CloudBarcodeProvider';
import { Product, BarcodeType } from '../../types';

const SETTINGS_STORAGE_KEY = 'nexus_erp_barcode_integration_settings';

export class BarcodeIntegrationService {
  private static instance: BarcodeIntegrationService | null = null;
  private settings: BarcodeIntegrationSettings;
  private localProvider: LocalBarcodeProvider;
  private cloudProvider: CloudBarcodeProvider;

  private constructor() {
    this.settings = BarcodeIntegrationService.loadSettings();
    this.localProvider = new LocalBarcodeProvider(this.settings);
    this.cloudProvider = new CloudBarcodeProvider(this.settings);
  }

  public static getInstance(): BarcodeIntegrationService {
    if (!BarcodeIntegrationService.instance) {
      BarcodeIntegrationService.instance = new BarcodeIntegrationService();
    }
    return BarcodeIntegrationService.instance;
  }

  public static loadSettings(): BarcodeIntegrationSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return {
          ...DEFAULT_BARCODE_SETTINGS,
          ...JSON.parse(stored),
        };
      }
    } catch (e) {
      console.error('Failed to load barcode integration settings from localStorage:', e);
    }
    return { ...DEFAULT_BARCODE_SETTINGS };
  }

  public static saveSettings(newSettings: Partial<BarcodeIntegrationSettings>): BarcodeIntegrationSettings {
    const current = BarcodeIntegrationService.loadSettings();
    const updated: BarcodeIntegrationSettings = {
      ...current,
      ...newSettings,
    };

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save barcode integration settings to localStorage:', e);
    }

    // Refresh singleton state if initialized
    if (BarcodeIntegrationService.instance) {
      BarcodeIntegrationService.instance.settings = updated;
      BarcodeIntegrationService.instance.localProvider = new LocalBarcodeProvider(updated);
      BarcodeIntegrationService.instance.cloudProvider = new CloudBarcodeProvider(updated);
    }

    return updated;
  }

  public getSettings(): BarcodeIntegrationSettings {
    return { ...this.settings };
  }

  public getActiveProvider(): IBarcodeProvider {
    // Default is LOCAL. Provider selection routing based on settings.
    if (this.settings.provider === 'CLOUD') {
      return this.cloudProvider;
    }
    return this.localProvider;
  }

  public async runHealthCheck(): Promise<BarcodeHealthCheckResult> {
    const provider = this.getActiveProvider();
    return await provider.healthCheck();
  }

  public createGenerateRequest(product: Product, quantity = 1, labelTemplate = 'STD_PRODUCT_38X25MM'): GenerateBarcodeRequest {
    return {
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode || '',
      barcodeType: (product.barcodeType as BarcodeType) || 'CODE128',
      labelTemplate,
      quantity,
      timestamp: new Date().toISOString(),
      source: product.barcodeSource || 'manual',
      version: product.barcodeVersion || 1,
    };
  }

  public createPrintRequest(product: Product, copies = 1, printerName = 'DEFAULT_LOCAL_THERMAL_PRINTER'): PrintBarcodeRequest {
    return {
      productId: product.id,
      barcode: product.barcode || '',
      barcodeType: (product.barcodeType as BarcodeType) || 'CODE128',
      copies,
      printerName,
      labelTemplate: 'STD_PRODUCT_38X25MM',
      timestamp: new Date().toISOString(),
    };
  }

  public createSyncRequest(product: Product, syncMode: 'push' | 'pull' | 'bidirectional' = 'push'): SyncBarcodeRequest {
    return {
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode || '',
      barcodeType: (product.barcodeType as BarcodeType) || 'CODE128',
      syncMode,
      timestamp: new Date().toISOString(),
      source: product.barcodeSource || 'manual',
    };
  }

  public async generateBarcode(request: GenerateBarcodeRequest): Promise<BarcodeResponseModel> {
    const provider = this.getActiveProvider();
    const prepared = provider.prepareGenerateRequest(request);
    const validation = provider.validatePayload(prepared);

    if (!validation.isValid) {
      return {
        success: false,
        provider: provider.getProviderMode(),
        operation: 'generate',
        message: `Validation Error: ${validation.errors?.join(' ')}`,
        timestamp: new Date().toISOString(),
        errorCode: 'INVALID_PAYLOAD',
      };
    }

    return await provider.executeGenerate(prepared);
  }

  public async printBarcode(request: PrintBarcodeRequest): Promise<BarcodeResponseModel> {
    const provider = this.getActiveProvider();
    const prepared = provider.preparePrintRequest(request);
    const validation = provider.validatePayload(prepared);

    if (!validation.isValid) {
      return {
        success: false,
        provider: provider.getProviderMode(),
        operation: 'print',
        message: `Validation Error: ${validation.errors?.join(' ')}`,
        timestamp: new Date().toISOString(),
        errorCode: 'INVALID_PAYLOAD',
      };
    }

    return await provider.executePrint(prepared);
  }

  public async syncBarcode(request: SyncBarcodeRequest): Promise<BarcodeResponseModel> {
    const provider = this.getActiveProvider();
    const prepared = provider.prepareSyncRequest(request);
    const validation = provider.validatePayload(prepared);

    if (!validation.isValid) {
      return {
        success: false,
        provider: provider.getProviderMode(),
        operation: 'sync',
        message: `Validation Error: ${validation.errors?.join(' ')}`,
        timestamp: new Date().toISOString(),
        errorCode: 'INVALID_PAYLOAD',
      };
    }

    return await provider.executeSync(prepared);
  }
}

import {
  IBarcodeProvider,
  IntegrationProviderMode,
  BarcodeHealthCheckResult,
  GenerateBarcodeRequest,
  PrintBarcodeRequest,
  SyncBarcodeRequest,
  BarcodeResponseModel,
  BarcodeIntegrationSettings,
} from '../../../types/barcodeIntegration';
import { BarcodeService } from '../../barcodeService';
import { BarcodeTransportManager } from '../transport/BarcodeTransportManager';

export class LocalBarcodeProvider implements IBarcodeProvider {
  private settings: BarcodeIntegrationSettings;
  private transportManager = BarcodeTransportManager.getInstance();

  constructor(settings: BarcodeIntegrationSettings) {
    this.settings = settings;
  }

  public getProviderMode(): IntegrationProviderMode {
    return 'LOCAL';
  }

  public async healthCheck(): Promise<BarcodeHealthCheckResult> {
    const transportHealth = await this.transportManager.runHealthCheck();

    return {
      provider: 'LOCAL',
      status: transportHealth.status,
      version: transportHealth.protocolVersion,
      latencyMs: transportHealth.latencyMs,
      details: transportHealth.details,
    };
  }

  public prepareGenerateRequest(request: GenerateBarcodeRequest): GenerateBarcodeRequest {
    return {
      ...request,
      barcode: BarcodeService.normalizeBarcode(request.barcode),
      timestamp: request.timestamp || new Date().toISOString(),
      labelTemplate: request.labelTemplate || 'STD_PRODUCT_38X25MM',
      quantity: Math.max(1, request.quantity || 1),
    };
  }

  public preparePrintRequest(request: PrintBarcodeRequest): PrintBarcodeRequest {
    return {
      ...request,
      barcode: BarcodeService.normalizeBarcode(request.barcode),
      timestamp: request.timestamp || new Date().toISOString(),
      copies: Math.max(1, request.copies || 1),
      printerName: request.printerName || 'DEFAULT_LOCAL_THERMAL_PRINTER',
      labelTemplate: request.labelTemplate || 'STD_PRODUCT_38X25MM',
    };
  }

  public prepareSyncRequest(request: SyncBarcodeRequest): SyncBarcodeRequest {
    return {
      ...request,
      barcode: BarcodeService.normalizeBarcode(request.barcode),
      timestamp: request.timestamp || new Date().toISOString(),
      syncMode: request.syncMode || 'push',
    };
  }

  public validatePayload(payload: any): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!payload) {
      return { isValid: false, errors: ['Payload cannot be null or undefined.'] };
    }

    if (!payload.productId) {
      errors.push('Product ID is required.');
    }

    if (!payload.barcode) {
      errors.push('Barcode value is required.');
    } else {
      const formatVal = BarcodeService.validateFormat(payload.barcode, payload.barcodeType || 'CODE128');
      if (!formatVal.isValid && formatVal.error) {
        errors.push(formatVal.error);
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  public async executeGenerate(request: GenerateBarcodeRequest): Promise<BarcodeResponseModel> {
    const prepared = this.prepareGenerateRequest(request);
    const validation = this.validatePayload(prepared);

    if (!validation.isValid) {
      return {
        success: false,
        provider: 'LOCAL',
        operation: 'generate',
        message: `Local Provider Validation Failed: ${validation.errors?.join(' ')}`,
        timestamp: new Date().toISOString(),
        errorCode: 'VALIDATION_ERROR',
      };
    }

    // Route request via Transport Manager contract envelope
    const protocolRes = await this.transportManager.sendRequest('GenerateBarcode', prepared);

    return {
      success: protocolRes.success,
      provider: 'LOCAL',
      operation: 'generate',
      message: protocolRes.success
        ? `[LOCAL IPC TRANSPORT] Generate Request ACK for SKU ${prepared.sku}. Protocol Envelope Validated.`
        : protocolRes.errorMessage || 'Local IPC Generation Failed.',
      payload: protocolRes.payload || prepared,
      timestamp: protocolRes.timestamp,
      errorCode: protocolRes.errorCode,
    };
  }

  public async executePrint(request: PrintBarcodeRequest): Promise<BarcodeResponseModel> {
    const prepared = this.preparePrintRequest(request);
    const validation = this.validatePayload(prepared);

    if (!validation.isValid) {
      return {
        success: false,
        provider: 'LOCAL',
        operation: 'print',
        message: `Local Provider Print Validation Failed: ${validation.errors?.join(' ')}`,
        timestamp: new Date().toISOString(),
        errorCode: 'VALIDATION_ERROR',
      };
    }

    const protocolRes = await this.transportManager.sendRequest('PrintBarcode', prepared);

    return {
      success: protocolRes.success,
      provider: 'LOCAL',
      operation: 'print',
      message: protocolRes.success
        ? `[LOCAL IPC TRANSPORT] Print Job ACK (${prepared.copies} copies) on ${prepared.printerName}.`
        : protocolRes.errorMessage || 'Local IPC Print Job Failed.',
      payload: protocolRes.payload || prepared,
      timestamp: protocolRes.timestamp,
      errorCode: protocolRes.errorCode,
    };
  }

  public async executeSync(request: SyncBarcodeRequest): Promise<BarcodeResponseModel> {
    const prepared = this.prepareSyncRequest(request);
    const validation = this.validatePayload(prepared);

    if (!validation.isValid) {
      return {
        success: false,
        provider: 'LOCAL',
        operation: 'sync',
        message: `Local Provider Sync Validation Failed: ${validation.errors?.join(' ')}`,
        timestamp: new Date().toISOString(),
        errorCode: 'VALIDATION_ERROR',
      };
    }

    const protocolRes = await this.transportManager.sendRequest('SyncBarcode', prepared);

    return {
      success: protocolRes.success,
      provider: 'LOCAL',
      operation: 'sync',
      message: protocolRes.success
        ? `[LOCAL IPC TRANSPORT] Sync ACK (${prepared.syncMode.toUpperCase()}) for Barcode ${prepared.barcode}.`
        : protocolRes.errorMessage || 'Local IPC Sync Failed.',
      payload: protocolRes.payload || prepared,
      timestamp: protocolRes.timestamp,
      errorCode: protocolRes.errorCode,
    };
  }
}


import {
  BarcodeProtocolResponse,
  GenerateBarcodeRequestDTO,
  GenerateBarcodeResponseDTO,
  PrintBarcodeRequestDTO,
  PrintBarcodeResponseDTO,
  CapabilityResponseDTO,
  PingResponseDTO,
  CURRENT_PROTOCOL_VERSION,
} from '../../../types/barcodeProtocol';
import {
  LocalHTTPClientConfig,
  ValidateBarcodeRequestDTO,
  ValidateBarcodeResponseDTO,
} from '../../../types/barcodeLocalClient';
import { HTTPRequestBuider } from './HTTPRequestBuider';
import { HTTPResponseParser } from './HTTPResponseParser';
import { ClientAuditLogger } from './ClientAuditLogger';

export class LocalBarcodeHTTPClient {
  private config: LocalHTTPClientConfig;
  private auditLogger = ClientAuditLogger.getInstance();

  constructor(config?: Partial<LocalHTTPClientConfig>) {
    const host = config?.host || '127.0.0.1';
    const port = config?.port || 9123;
    const baseUrl = config?.baseUrl || `http://${host}:${port}`;

    this.config = {
      host,
      port,
      baseUrl,
      timeoutMs: config?.timeoutMs || 5000,
      retryCount: config?.retryCount || 3,
    };
  }

  public getConfig(): LocalHTTPClientConfig {
    return { ...this.config };
  }

  public setConfig(newConfig: Partial<LocalHTTPClientConfig>): void {
    if (newConfig.host || newConfig.port) {
      const host = newConfig.host || this.config.host;
      const port = newConfig.port || this.config.port;
      this.config.baseUrl = newConfig.baseUrl || `http://${host}:${port}`;
    }
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Universal Request Execution Routine
   */
  private async execute<TReq = any, TRes = any>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: TReq,
    customTimeoutMs?: number
  ): Promise<BarcodeProtocolResponse<TRes>> {
    const startMs = Date.now();
    const reqObj = HTTPRequestBuider.buildRequest(
      {
        method,
        endpoint,
        body,
        timeoutMs: customTimeoutMs || this.config.timeoutMs,
      },
      this.config.baseUrl
    );

    try {
      const response = await fetch(reqObj.url, reqObj.fetchInit);
      reqObj.clearTimer();
      const durationMs = Date.now() - startMs;

      const parsed = await HTTPResponseParser.parseResponse<TRes>(
        response,
        durationMs,
        reqObj.requestId,
        CURRENT_PROTOCOL_VERSION
      );

      this.auditLogger.logTransaction(
        endpoint,
        durationMs,
        parsed.success ? 'SUCCESS' : 'FAILED',
        reqObj.requestId,
        reqObj.correlationId,
        parsed.errorCode
      );

      return parsed;
    } catch (err: any) {
      reqObj.clearTimer();
      const durationMs = Date.now() - startMs;

      const translated = HTTPResponseParser.translateNetworkException<TRes>(
        err,
        durationMs,
        reqObj.requestId,
        CURRENT_PROTOCOL_VERSION
      );

      this.auditLogger.logTransaction(
        endpoint,
        durationMs,
        'FAILED',
        reqObj.requestId,
        reqObj.correlationId,
        translated.errorCode
      );

      return translated;
    }
  }

  // --- Supported Endpoints ---

  /** GET /health */
  public async getHealth(): Promise<BarcodeProtocolResponse> {
    return this.execute('GET', '/health');
  }

  /** GET /status */
  public async getStatus(): Promise<BarcodeProtocolResponse> {
    return this.execute('GET', '/status');
  }

  /** GET /version */
  public async getVersion(): Promise<BarcodeProtocolResponse<{ version: string; protocolVersion: string }>> {
    return this.execute('GET', '/version');
  }

  /** GET /capabilities */
  public async getCapabilities(): Promise<BarcodeProtocolResponse<CapabilityResponseDTO>> {
    return this.execute('GET', '/capabilities');
  }

  /** POST /barcode/generate */
  public async generateBarcode(
    payload: GenerateBarcodeRequestDTO
  ): Promise<BarcodeProtocolResponse<GenerateBarcodeResponseDTO>> {
    return this.execute<GenerateBarcodeRequestDTO, GenerateBarcodeResponseDTO>('POST', '/barcode/generate', payload);
  }

  /** POST /barcode/validate */
  public async validateBarcode(
    payload: ValidateBarcodeRequestDTO
  ): Promise<BarcodeProtocolResponse<ValidateBarcodeResponseDTO>> {
    return this.execute<ValidateBarcodeRequestDTO, ValidateBarcodeResponseDTO>('POST', '/barcode/validate', payload);
  }

  /** POST /print */
  public async printBarcode(
    payload: PrintBarcodeRequestDTO
  ): Promise<BarcodeProtocolResponse<PrintBarcodeResponseDTO>> {
    return this.execute<PrintBarcodeRequestDTO, PrintBarcodeResponseDTO>('POST', '/print', payload, 15000);
  }

  /** POST /ping */
  public async ping(): Promise<BarcodeProtocolResponse<PingResponseDTO>> {
    return this.execute('POST', '/ping', { timestamp: new Date().toISOString() });
  }

  /** GET /inventory/products */
  public async getProducts(): Promise<BarcodeProtocolResponse> {
    return this.execute('GET', '/inventory/products');
  }

  /** GET /inventory/categories */
  public async getCategories(): Promise<BarcodeProtocolResponse> {
    return this.execute('GET', '/inventory/categories');
  }

  /** GET /inventory/brands */
  public async getBrands(): Promise<BarcodeProtocolResponse> {
    return this.execute('GET', '/inventory/brands');
  }

  /** GET /inventory/units */
  public async getUnits(): Promise<BarcodeProtocolResponse> {
    return this.execute('GET', '/inventory/units');
  }

  /** GET /inventory/warehouses */
  public async getWarehouses(): Promise<BarcodeProtocolResponse> {
    return this.execute('GET', '/inventory/warehouses');
  }
}

import { IBarcodeTransport } from '../../../../types/barcodeTransport';
import { BarcodeMessageEnvelope, BarcodeProtocolResponse, CURRENT_PROTOCOL_VERSION } from '../../../../types/barcodeProtocol';
import { ConnectorClientManager } from '../../http/ConnectorClientManager';
import { LocalBarcodeHTTPClient } from '../../http/LocalBarcodeHTTPClient';

export class LocalHTTPTransport implements IBarcodeTransport {
  private clientManager = ConnectorClientManager.getInstance();
  private httpClient: LocalBarcodeHTTPClient;

  constructor() {
    this.httpClient = this.clientManager.getHTTPClient();
  }

  public getTransportType() {
    return 'LOCAL_HTTP' as const;
  }

  public isAvailable(): boolean {
    return true; // Available for Local HTTP communication
  }

  public async connect(): Promise<boolean> {
    return this.clientManager.checkHealthAndConnect();
  }

  public async disconnect(): Promise<void> {
    this.clientManager.resetConnectionState();
  }

  public async send<TReq = any, TRes = any>(
    envelope: BarcodeMessageEnvelope<TReq>
  ): Promise<BarcodeProtocolResponse<TRes>> {
    const op = envelope.operation;

    switch (op) {
      case 'GenerateBarcode':
        return (await this.httpClient.generateBarcode(envelope.payload as any)) as unknown as BarcodeProtocolResponse<TRes>;

      case 'PrintBarcode':
        return (await this.httpClient.printBarcode(envelope.payload as any)) as unknown as BarcodeProtocolResponse<TRes>;

      case 'HealthCheck':
        return (await this.httpClient.getHealth()) as unknown as BarcodeProtocolResponse<TRes>;

      case 'GetCapabilities':
        return (await this.httpClient.getCapabilities()) as unknown as BarcodeProtocolResponse<TRes>;

      case 'Ping':
        return (await this.httpClient.ping()) as unknown as BarcodeProtocolResponse<TRes>;

      case 'INVENTORY:GetProducts':
      case 'GetProducts':
        return (await this.httpClient.getProducts()) as unknown as BarcodeProtocolResponse<TRes>;

      case 'INVENTORY:GetCategories':
      case 'GetCategories':
        return (await this.httpClient.getCategories()) as unknown as BarcodeProtocolResponse<TRes>;

      case 'INVENTORY:GetBrands':
      case 'GetBrands':
        return (await this.httpClient.getBrands()) as unknown as BarcodeProtocolResponse<TRes>;

      case 'INVENTORY:GetUnits':
      case 'GetUnits':
        return (await this.httpClient.getUnits()) as unknown as BarcodeProtocolResponse<TRes>;

      case 'INVENTORY:GetWarehouses':
      case 'GetWarehouses':
        return (await this.httpClient.getWarehouses()) as unknown as BarcodeProtocolResponse<TRes>;

      default:
        return {
          success: false,
          errorCode: 'NOT_SUPPORTED',
          errorMessage: `Local HTTP Transport: Operation '${op}' is not supported.`,
          provider: 'LOCAL',
          durationMs: 0,
          protocolVersion: CURRENT_PROTOCOL_VERSION,
          requestId: envelope.requestId,
          timestamp: new Date().toISOString(),
        };
    }
  }

  public async ping(): Promise<number> {
    const start = Date.now();
    const res = await this.httpClient.ping();
    return res.durationMs || Date.now() - start;
  }
}

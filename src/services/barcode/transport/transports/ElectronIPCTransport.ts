import { IBarcodeTransport } from '../../../../types/barcodeTransport';
import { BarcodeMessageEnvelope, BarcodeProtocolResponse } from '../../../../types/barcodeProtocol';
import { BarcodeProtocolService } from '../../protocol/BarcodeProtocolService';
import { DesktopDetector } from '../DesktopDetector';
import { ElectronIPCBridge } from '../../ipc/ElectronIPCBridge';

export class ElectronIPCTransport implements IBarcodeTransport {
  private connected = false;
  private protocolService = BarcodeProtocolService.getInstance();

  public getTransportType() {
    return 'ELECTRON_IPC' as const;
  }

  public isAvailable(): boolean {
    return DesktopDetector.isDesktop() || ElectronIPCBridge.isBridgeAvailable();
  }

  public async connect(): Promise<boolean> {
    // Lazy initialization of bridge upon explicit connect
    if (typeof window !== 'undefined') {
      ElectronIPCBridge.initializeBridge();
    }

    if (!this.isAvailable()) {
      this.connected = false;
      return false;
    }

    this.connected = true;
    return true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
  }

  public async send<TReq = any, TRes = any>(
    envelope: BarcodeMessageEnvelope<TReq>
  ): Promise<BarcodeProtocolResponse<TRes>> {
    // Security validation
    const validation = this.protocolService.validateEnvelope(envelope);
    if (!validation.isValid) {
      return this.protocolService.createErrorResponse(
        validation.error || 'INVALID_PROTOCOL',
        validation.message || 'Validation failed',
        envelope.requestId
      );
    }

    // Performance rule: Lazy initialization on usage
    if (typeof window !== 'undefined' && !ElectronIPCBridge.isBridgeAvailable()) {
      ElectronIPCBridge.initializeBridge();
    }

    // Check availability
    if (!this.isAvailable() || typeof window === 'undefined' || !(window as any).NexusBarcode) {
      return this.protocolService.createErrorResponse(
        'DESKTOP_NOT_INSTALLED',
        'Desktop Barcode Suite not available in web mode. Graceful degradation active.',
        envelope.requestId
      );
    }

    const nexusBarcode = (window as any).NexusBarcode;

    try {
      switch (envelope.operation) {
        case 'GenerateBarcode':
          return await nexusBarcode.generateBarcode(envelope);
        case 'PrintBarcode':
          return await nexusBarcode.printBarcode(envelope);
        case 'HealthCheck':
          return await nexusBarcode.healthCheck(envelope);
        case 'GetTemplates':
          return await nexusBarcode.getTemplates(envelope);
        case 'GetPrinters':
          return await nexusBarcode.getPrinters(envelope);
        case 'GetCapabilities':
          return await nexusBarcode.getCapabilities(envelope);
        case 'Ping':
          return await nexusBarcode.ping(envelope);
        case 'INVENTORY:GetProducts':
        case 'GetProducts':
          return await nexusBarcode.getProducts(envelope);
        case 'INVENTORY:GetCategories':
        case 'GetCategories':
          return await nexusBarcode.getCategories(envelope);
        case 'INVENTORY:GetBrands':
        case 'GetBrands':
          return await nexusBarcode.getBrands(envelope);
        case 'INVENTORY:GetUnits':
        case 'GetUnits':
          return await nexusBarcode.getUnits(envelope);
        case 'INVENTORY:GetWarehouses':
        case 'GetWarehouses':
          return await nexusBarcode.getWarehouses(envelope);
        default:
          return await nexusBarcode.generateBarcode(envelope);
      }
    } catch (error: any) {
      return this.protocolService.createErrorResponse(
        'IPC_FAILURE',
        `Electron IPC Bridge Execution Error: ${error.message || 'Unknown IPC Exception'}`,
        envelope.requestId
      );
    }
  }

  public async ping(): Promise<number> {
    const start = Date.now();
    if (!this.isAvailable()) return 0;

    const envelope = this.protocolService.wrapEnvelope('Ping', { sentAt: new Date().toISOString() }, 'IPC');
    const res = await this.send(envelope);

    if (res.success && res.durationMs !== undefined) {
      return res.durationMs;
    }

    return Date.now() - start;
  }
}

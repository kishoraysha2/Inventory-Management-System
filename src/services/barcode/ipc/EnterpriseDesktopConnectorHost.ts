import {
  BarcodeMessageEnvelope,
  BarcodeProtocolResponse,
  CURRENT_PROTOCOL_VERSION,
  GenerateBarcodeRequestDTO,
  GenerateBarcodeResponseDTO,
  PrintBarcodeRequestDTO,
  PrintBarcodeResponseDTO,
  GetTemplatesRequestDTO,
  GetTemplatesResponseDTO,
  GetPrintersRequestDTO,
  GetPrintersResponseDTO,
  CapabilityResponseDTO,
  PingRequestDTO,
  PingResponseDTO,
} from '../../../types/barcodeProtocol';
import { ConnectorHostHealth, HostLicenseState } from '../../../types/barcodeConnectorHost';
import { IPCHealthCheckResult } from '../../../types/barcodeBridge';
import { ConnectorResponseBuilder } from './ConnectorResponseBuilder';
import { ConnectorAuditLogger } from './ConnectorAuditLogger';
import { EnterpriseMasterCatalogConnectorService } from '../catalog/EnterpriseMasterCatalogConnectorService';

export class EnterpriseDesktopConnectorHost {
  private static instance: EnterpriseDesktopConnectorHost | null = null;
  private startTime = Date.now();
  private connectorVersion = '1.3.0';
  private isConnectorReady = true;
  private isSuiteConnected = true;
  private licenseState: HostLicenseState = 'VALID';

  // Anti-replay / Duplicate Request Cache (Limit 1000 items)
  private processedRequestIds: Set<string> = new Set();
  private maxCacheSize = 1000;

  private auditLogger = ConnectorAuditLogger.getInstance();
  private catalogService = EnterpriseMasterCatalogConnectorService.getInstance();

  private constructor() {}

  /**
   * Singleton Accessor with Lazy Initialization
   */
  public static getInstance(): EnterpriseDesktopConnectorHost {
    if (!EnterpriseDesktopConnectorHost.instance) {
      EnterpriseDesktopConnectorHost.instance = new EnterpriseDesktopConnectorHost();
    }
    return EnterpriseDesktopConnectorHost.instance;
  }

  /**
   * Main Desktop Connector Host Pipeline:
   * 1. Check Payload & Malformation
   * 2. Validate Request ID & Correlation ID
   * 3. Anti-Replay Duplicate Request Check
   * 4. Protocol Version Validation
   * 5. Checksum Security Verification
   * 6. License State Verification
   * 7. Router Dispatch
   * 8. Response Builder Execution & Audit Logging
   */
  public async handleIPCRequest<TReq = any, TRes = any>(
    channel: string,
    envelope: BarcodeMessageEnvelope<TReq>
  ): Promise<BarcodeProtocolResponse<TRes>> {
    const startMs = Date.now();

    // 1. Validate Payload Structure & Request ID
    if (!envelope || typeof envelope !== 'object') {
      const durationMs = Date.now() - startMs;
      const response = ConnectorResponseBuilder.buildFailure<TRes>(
        'INVALID_PAYLOAD',
        'Desktop Connector Host: Payload envelope is null or malformed.',
        durationMs,
        'REQ-UNKNOWN',
        CURRENT_PROTOCOL_VERSION
      );
      this.auditLogger.logTransaction('UNKNOWN', durationMs, 'FAILED', 'REQ-UNKNOWN', 'INVALID_PAYLOAD');
      return response;
    }

    const requestId = envelope.requestId?.trim();
    if (!requestId) {
      const durationMs = Date.now() - startMs;
      const response = ConnectorResponseBuilder.buildFailure<TRes>(
        'INVALID_PAYLOAD',
        'Desktop Connector Host: Request ID is missing or blank.',
        durationMs,
        `REQ-ERR-${Date.now()}`,
        envelope.protocolVersion || CURRENT_PROTOCOL_VERSION
      );
      this.auditLogger.logTransaction(envelope.operation || channel, durationMs, 'FAILED', 'REQ-ERR', 'INVALID_PAYLOAD');
      return response;
    }

    const correlationId = envelope.correlationId?.trim();
    if (!correlationId) {
      const durationMs = Date.now() - startMs;
      const response = ConnectorResponseBuilder.buildFailure<TRes>(
        'INVALID_PAYLOAD',
        'Desktop Connector Host: Correlation ID is missing or blank.',
        durationMs,
        requestId,
        envelope.protocolVersion || CURRENT_PROTOCOL_VERSION
      );
      this.auditLogger.logTransaction(envelope.operation || channel, durationMs, 'FAILED', requestId, 'INVALID_PAYLOAD');
      return response;
    }

    // 2. Anti-Replay / Duplicate Request Check
    if (this.processedRequestIds.has(requestId)) {
      const durationMs = Date.now() - startMs;
      const response = ConnectorResponseBuilder.buildFailure<TRes>(
        'INVALID_PAYLOAD',
        `Security Replay Violation: Request ID ${requestId} has already been executed by Desktop Connector Host.`,
        durationMs,
        requestId,
        envelope.protocolVersion || CURRENT_PROTOCOL_VERSION
      );
      this.auditLogger.logTransaction(envelope.operation || channel, durationMs, 'FAILED', requestId, 'INVALID_PAYLOAD');
      return response;
    }

    // Register request in anti-replay cache
    this.trackProcessedRequestId(requestId);

    // 3. Protocol Version Validation
    if (envelope.protocolVersion !== CURRENT_PROTOCOL_VERSION) {
      const durationMs = Date.now() - startMs;
      const response = ConnectorResponseBuilder.buildProtocolError(
        `Protocol Version Mismatch: Host expects ${CURRENT_PROTOCOL_VERSION}, received ${envelope.protocolVersion}`,
        durationMs,
        requestId,
        envelope.protocolVersion
      );
      this.auditLogger.logTransaction(envelope.operation || channel, durationMs, 'FAILED', requestId, 'PROTOCOL_MISMATCH');
      return response;
    }

    // 4. Security Checksum Validation
    const checksum = envelope.metadata?.checksum;
    if (checksum && checksum !== 'NEXUS-CHECKSUM-OK') {
      const durationMs = Date.now() - startMs;
      const response = ConnectorResponseBuilder.buildChecksumError(
        'Security Violation: Payload digital checksum verification failed at Desktop Connector Host.',
        durationMs,
        requestId,
        envelope.protocolVersion
      );
      this.auditLogger.logTransaction(envelope.operation || channel, durationMs, 'FAILED', requestId, 'CHECKSUM_FAILURE');
      return response;
    }

    // 5. License State Verification
    if (this.licenseState === 'INVALID' || this.licenseState === 'EXPIRED') {
      const durationMs = Date.now() - startMs;
      const response = ConnectorResponseBuilder.buildLicenseError(
        `MZ Barcode Suite License Error: Host state is ${this.licenseState}. Execution halted.`,
        durationMs,
        requestId,
        envelope.protocolVersion
      );
      this.auditLogger.logTransaction(envelope.operation || channel, durationMs, 'FAILED', requestId, 'LICENSE_INVALID');
      return response;
    }

    // 6. Connector Host Operation Routing
    try {
      let resultPayload: any;
      const targetDomain = envelope.targetDomain || (envelope.payload && (envelope.payload as any).targetDomain);
      const action = envelope.action || (envelope.payload && (envelope.payload as any).action);
      const op = envelope.operation || action || this.mapChannelToOperation(channel);

      // Support domain-scoped actions like targetDomain="INVENTORY", action="GetProducts"
      const normalizedOp = (targetDomain === 'INVENTORY' && action)
        ? `INVENTORY:${action}`
        : op;

      switch (normalizedOp) {
        case 'INVENTORY:GetProducts':
        case 'GetProducts': {
          resultPayload = await this.catalogService.getProducts(envelope.requestId, envelope.clientSource);
          break;
        }

        case 'INVENTORY:GetCategories':
        case 'GetCategories': {
          resultPayload = await this.catalogService.getCategories();
          break;
        }

        case 'INVENTORY:GetBrands':
        case 'GetBrands': {
          resultPayload = await this.catalogService.getBrands();
          break;
        }

        case 'INVENTORY:GetUnits':
        case 'GetUnits': {
          resultPayload = await this.catalogService.getUnits();
          break;
        }

        case 'INVENTORY:GetWarehouses':
        case 'GetWarehouses': {
          resultPayload = await this.catalogService.getWarehouses();
          break;
        }

        case 'GenerateBarcode': {
          resultPayload = this.handleGenerateBarcode(envelope.payload as any);
          break;
        }

        case 'PrintBarcode': {
          resultPayload = this.handlePrintBarcode(envelope.payload as any);
          break;
        }

        case 'HealthCheck': {
          const latency = Date.now() - startMs;
          resultPayload = this.handleHealthCheck(latency);
          break;
        }

        case 'GetTemplates': {
          resultPayload = this.handleGetTemplates(envelope.payload as any);
          break;
        }

        case 'GetPrinters': {
          resultPayload = this.handleGetPrinters(envelope.payload as any);
          break;
        }

        case 'GetCapabilities': {
          resultPayload = this.handleGetCapabilities();
          break;
        }

        case 'Ping': {
          resultPayload = this.handlePing(startMs);
          break;
        }

        default: {
          const durationMs = Date.now() - startMs;
          const response = ConnectorResponseBuilder.buildUnsupportedOperation(
            `Unsupported Desktop Connector Host Operation: ${op}`,
            durationMs,
            requestId,
            CURRENT_PROTOCOL_VERSION
          );
          this.auditLogger.logTransaction(op, durationMs, 'FAILED', requestId, 'NOT_SUPPORTED');
          return response;
        }
      }

      const durationMs = Date.now() - startMs;
      const successResponse = ConnectorResponseBuilder.buildSuccess<TRes>(
        resultPayload,
        durationMs,
        requestId,
        CURRENT_PROTOCOL_VERSION
      );

      this.auditLogger.logTransaction(op, durationMs, 'SUCCESS', requestId);
      return successResponse;
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      const errorResponse = ConnectorResponseBuilder.buildFailure<TRes>(
        'IPC_FAILURE',
        `Desktop Connector Host Internal Processing Exception: ${err.message || 'Unknown Exception'}`,
        durationMs,
        requestId,
        CURRENT_PROTOCOL_VERSION
      );
      this.auditLogger.logTransaction(envelope.operation || channel, durationMs, 'FAILED', requestId, 'IPC_FAILURE');
      return errorResponse;
    }
  }

  /**
   * Connector Host Health & Diagnostics
   */
  public getConnectorHealth(): ConnectorHostHealth {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const caps = this.handleGetCapabilities();

    return {
      connectorReady: this.isConnectorReady,
      connectorVersion: this.connectorVersion,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      licenseState: this.licenseState,
      provider: 'LOCAL',
      activeTransport: 'IPC',
      supportedBarcodeTypes: caps.supportedBarcodeTypes,
      supportedLabelTemplates: caps.supportedLabelSizes,
      supportedPrinterTypes: caps.supportedPrinters,
      processedRequestsCount: this.processedRequestIds.size,
      uptimeSeconds: uptime,
      timestamp: new Date().toISOString(),
    };
  }

  // --- Configuration Mutators ---
  public setLicenseState(state: HostLicenseState): void {
    this.licenseState = state;
  }

  public setConnectorReady(ready: boolean): void {
    this.isConnectorReady = ready;
  }

  public getAuditLogs() {
    return this.auditLogger.getLogs();
  }

  public getAuditMetrics() {
    return this.auditLogger.getMetrics();
  }

  // --- Private Handler Routines ---
  private handleGenerateBarcode(req: GenerateBarcodeRequestDTO): GenerateBarcodeResponseDTO {
    const val = req.barcode || req.sku || 'NEXUS-ERP-DEFAULT';
    const type = req.barcodeType || 'CODE128';
    const svgDataUrl = this.generateBarcodeStubSvg(val, type);

    return {
      barcodeValue: val,
      barcodeType: type,
      renderedFormat: svgDataUrl,
      generatedAt: new Date().toISOString(),
      status: 'success',
    };
  }

  private handlePrintBarcode(req: PrintBarcodeRequestDTO): PrintBarcodeResponseDTO {
    return {
      jobId: `DESK-HOST-PRINT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      copies: req.copies || 1,
      printerName: req.printerName || 'MZ Thermal Printer ZD421',
      spoolStatus: 'spooled',
      timestamp: new Date().toISOString(),
    };
  }

  private handleHealthCheck(latencyMs: number): IPCHealthCheckResult {
    return {
      status: this.isConnectorReady ? 'online' : 'offline',
      version: CURRENT_PROTOCOL_VERSION,
      latencyMs,
      details: 'Enterprise Desktop Connector Host Operational (Sprint 13 Active)',
      desktopConnected: true,
      suiteConnected: this.isSuiteConnected,
      connectorConnected: this.isConnectorReady,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      provider: 'LOCAL',
      latency: latencyMs,
      licenseState: this.licenseState,
      suiteVersion: '3.5.0',
      connectorVersion: this.connectorVersion,
    };
  }

  private handleGetTemplates(req?: GetTemplatesRequestDTO): GetTemplatesResponseDTO {
    return {
      templates: [
        { id: 'STD_PRODUCT_38X25MM', name: 'Standard Product (38x25mm)', widthMm: 38, heightMm: 25, isDefault: true },
        { id: 'COMPACT_RETAIL_30X15MM', name: 'Compact Retail (30x15mm)', widthMm: 30, heightMm: 15, isDefault: false },
        { id: 'SHIPPING_PALLET_100X150MM', name: 'Shipping Pallet (100x150mm)', widthMm: 100, heightMm: 150, isDefault: false },
        { id: 'JEWELRY_TAG_50X10MM', name: 'Jewelry Tag (50x10mm)', widthMm: 50, heightMm: 10, isDefault: false },
      ],
    };
  }

  private handleGetPrinters(req?: GetPrintersRequestDTO): GetPrintersResponseDTO {
    return {
      printers: [
        { name: 'MZ Thermal Printer ZD421', isDefault: true, status: 'ready', supportedDpi: [203, 300] },
        { name: 'Zebra ZT411 Industrial', isDefault: false, status: 'ready', supportedDpi: [203, 300, 600] },
        { name: 'Dymo LabelWriter 450 Turbo', isDefault: false, status: 'ready', supportedDpi: [300] },
      ],
    };
  }

  private handleGetCapabilities(): CapabilityResponseDTO {
    return {
      supportedBarcodeTypes: ['CODE128', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'QR_CODE', 'DATA_MATRIX'],
      supportedLabelSizes: ['38x25mm', '30x15mm', '100x150mm', '50x10mm'],
      supportedPrinters: ['MZ Thermal Printer ZD421', 'Zebra ZT411 Industrial', 'Dymo LabelWriter 450 Turbo'],
      supportedDPI: [203, 300, 600],
      supportsQR: true,
      supportsDataMatrix: true,
      supportsPDF417: true,
      supportsUSBScanner: true,
      supportsCamera: true,
      supportsBatchPrinting: true,
      supportsPreview: true,
      version: this.connectorVersion,
      maxBatchSize: 5000,
    };
  }

  private handlePing(startMs: number): PingResponseDTO {
    return {
      receivedAt: new Date().toISOString(),
      roundtripMs: Date.now() - startMs,
    };
  }

  // --- Helper Routines ---
  private trackProcessedRequestId(requestId: string): void {
    this.processedRequestIds.add(requestId);
    if (this.processedRequestIds.size > this.maxCacheSize) {
      // Remove oldest entries
      const firstVal = this.processedRequestIds.values().next().value;
      if (firstVal) {
        this.processedRequestIds.delete(firstVal);
      }
    }
  }

  private mapChannelToOperation(channel: string): string {
    if (channel.startsWith('barcode:inventory:')) {
      const action = channel.replace('barcode:inventory:', '');
      const formattedAction = action.charAt(0).toUpperCase() + action.slice(1);
      return `INVENTORY:${formattedAction}`;
    }
    if (channel.startsWith('barcode:')) {
      const part = channel.replace('barcode:', '');
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    return channel;
  }

  /**
   * Barcode Stub SVG Data URL (Sprint 13 Placeholder)
   */
  private generateBarcodeStubSvg(value: string, type: string): string {
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80" viewBox="0 0 220 80">
      <rect width="220" height="80" fill="#ffffff" rx="4" />
      <text x="10" y="18" font-family="monospace" font-size="10" fill="#2563eb" font-weight="bold">${type} [DESKTOP-CONNECTOR-HOST]</text>
      <g fill="#0f172a">
        <rect x="12" y="26" width="3" height="36" />
        <rect x="18" y="26" width="1" height="36" />
        <rect x="22" y="26" width="4" height="36" />
        <rect x="29" y="26" width="2" height="36" />
        <rect x="34" y="26" width="5" height="36" />
        <rect x="42" y="26" width="2" height="36" />
        <rect x="47" y="26" width="1" height="36" />
        <rect x="51" y="26" width="3" height="36" />
        <rect x="57" y="26" width="6" height="36" />
        <rect x="66" y="26" width="2" height="36" />
        <rect x="71" y="26" width="4" height="36" />
        <rect x="78" y="26" width="1" height="36" />
        <rect x="82" y="26" width="3" height="36" />
        <rect x="88" y="26" width="2" height="36" />
        <rect x="93" y="26" width="5" height="36" />
        <rect x="101" y="26" width="1" height="36" />
        <rect x="105" y="26" width="4" height="36" />
        <rect x="112" y="26" width="2" height="36" />
        <rect x="117" y="26" width="3" height="36" />
        <rect x="123" y="26" width="1" height="36" />
        <rect x="127" y="26" width="5" height="36" />
        <rect x="135" y="26" width="2" height="36" />
        <rect x="140" y="26" width="4" height="36" />
        <rect x="147" y="26" width="2" height="36" />
        <rect x="152" y="26" width="1" height="36" />
        <rect x="156" y="26" width="3" height="36" />
        <rect x="162" y="26" width="5" height="36" />
        <rect x="170" y="26" width="2" height="36" />
        <rect x="175" y="26" width="4" height="36" />
        <rect x="182" y="26" width="2" height="36" />
        <rect x="187" y="26" width="5" height="36" />
        <rect x="195" y="26" width="2" height="36" />
        <rect x="200" y="26" width="3" height="36" />
      </g>
      <text x="110" y="73" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="#0f172a">${value}</text>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }
}

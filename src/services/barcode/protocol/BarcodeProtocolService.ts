import {
  CURRENT_PROTOCOL_VERSION,
  MINIMUM_PROTOCOL_VERSION,
  MAXIMUM_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  ProtocolVersionNegotiation,
  BarcodeOperation,
  BarcodeMessageEnvelope,
  BarcodeMessageMetadata,
  BarcodeProtocolResponse,
  BarcodeErrorCode,
  CapabilityResponseDTO,
  BarcodeTimeoutPolicy,
  DEFAULT_TIMEOUT_POLICY,
  BarcodeCommunicationState,
  BarcodeDiagnosticModel,
  TransportType,
  GetTemplatesResponseDTO,
  GetPrintersResponseDTO,
} from '../../../types/barcodeProtocol';

export class BarcodeProtocolService {
  private static instance: BarcodeProtocolService | null = null;
  private state: BarcodeCommunicationState = 'READY';
  private timeoutPolicy: BarcodeTimeoutPolicy = { ...DEFAULT_TIMEOUT_POLICY };

  private diagnostics: BarcodeDiagnosticModel = {
    lastError: null,
    lastSuccess: {
      operation: 'HealthCheck',
      timestamp: new Date().toISOString(),
    },
    lastRequest: null,
    latencyMs: 1,
    retryCount: 0,
    heartbeatTime: new Date().toISOString(),
    communicationState: 'READY',
  };

  private constructor() {}

  public static getInstance(): BarcodeProtocolService {
    if (!BarcodeProtocolService.instance) {
      BarcodeProtocolService.instance = new BarcodeProtocolService();
    }
    return BarcodeProtocolService.instance;
  }

  // ============================================================================
  // SECTION 1: VERSION NEGOTIATION
  // ============================================================================
  public negotiateVersion(clientVersion: string): ProtocolVersionNegotiation {
    const isSupported = SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion);
    const agreed = isSupported ? clientVersion : CURRENT_PROTOCOL_VERSION;

    return {
      clientVersion,
      serverVersion: CURRENT_PROTOCOL_VERSION,
      agreedVersion: agreed,
      isCompatible: isSupported,
      supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    };
  }

  // ============================================================================
  // SECTION 2: ENVELOPE CREATION & VALIDATION
  // ============================================================================
  public wrapEnvelope<T>(
    operation: BarcodeOperation,
    payload: T,
    transportType: TransportType = 'IPC',
    customCorrelationId?: string
  ): BarcodeMessageEnvelope<T> {
    const reqId = `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const corrId = customCorrelationId || `CORR-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Security placeholders (Section 13)
    const metadata: BarcodeMessageMetadata = {
      transportType,
      authToken: 'AUTH-PREP-BEARER-SPINT8-SECURE-TOKEN',
      digitalSignature: `SIG-SHA256-${Date.now()}-NEXUS`,
      checksum: `CHK-${Math.random().toString(36).substring(2, 10)}`,
      nonce: `NONCE-${Math.random().toString(36).substring(2, 10)}`,
      validatedAt: timestamp,
    };

    const isDomainScoped = typeof operation === 'string' && operation.includes(':');
    let targetDomain: string | undefined;
    let action: string | undefined;

    if (isDomainScoped) {
      const parts = (operation as string).split(':');
      targetDomain = parts[0];
      action = parts[1];
    }

    const envelope: BarcodeMessageEnvelope<T> = {
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      requestId: reqId,
      correlationId: corrId,
      timestamp,
      sender: 'NexusERP',
      receiver: 'MZBarcodeSuite',
      operation,
      payload,
      metadata,
      targetDomain,
      action,
      clientSource: 'NexusERP_DesktopConnector',
    };

    // Update diagnostic tracking
    this.diagnostics.lastRequest = {
      requestId: reqId,
      operation,
      timestamp,
    };
    this.diagnostics.heartbeatTime = timestamp;

    return envelope;
  }

  public validateEnvelope(envelope: BarcodeMessageEnvelope): { isValid: boolean; error?: BarcodeErrorCode; message?: string } {
    if (!envelope || !envelope.protocolVersion) {
      return { isValid: false, error: 'INVALID_PROTOCOL', message: 'Missing protocol version in message envelope.' };
    }

    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(envelope.protocolVersion)) {
      return {
        isValid: false,
        error: 'INVALID_PROTOCOL',
        message: `Protocol version ${envelope.protocolVersion} is not supported. Minimum required: ${MINIMUM_PROTOCOL_VERSION}.`,
      };
    }

    if (!envelope.requestId || !envelope.operation) {
      return { isValid: false, error: 'INVALID_PAYLOAD', message: 'Missing mandatory envelope headers (requestId or operation).' };
    }

    return { isValid: true };
  }

  // ============================================================================
  // SECTION 4 & 5: RESPONSE CREATION & ERROR CODES
  // ============================================================================
  public createSuccessResponse<T>(
    operation: BarcodeOperation,
    payload: T,
    requestId: string,
    durationMs = 2
  ): BarcodeProtocolResponse<T> {
    const timestamp = new Date().toISOString();
    this.state = 'CONNECTED';

    this.diagnostics.lastSuccess = {
      operation,
      timestamp,
    };
    this.diagnostics.latencyMs = durationMs;
    this.diagnostics.communicationState = 'CONNECTED';

    return {
      success: true,
      provider: 'LOCAL',
      durationMs,
      payload,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      requestId,
      timestamp,
    };
  }

  public createErrorResponse<T = any>(
    errorCode: BarcodeErrorCode,
    errorMessage: string,
    requestId: string,
    provider: 'LOCAL' | 'CLOUD' = 'LOCAL',
    durationMs = 0
  ): BarcodeProtocolResponse<T> {
    const timestamp = new Date().toISOString();
    this.state = 'ERROR';

    this.diagnostics.lastError = {
      code: errorCode,
      message: errorMessage,
      timestamp,
    };
    this.diagnostics.communicationState = 'ERROR';

    return {
      success: false,
      errorCode,
      errorMessage,
      provider,
      durationMs,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      requestId,
      timestamp,
    };
  }

  // ============================================================================
  // SECTION 6: CAPABILITY DISCOVERY
  // ============================================================================
  public getCapabilities(): CapabilityResponseDTO {
    return {
      supportedBarcodeTypes: ['CODE128', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'QR_CODE', 'DATA_MATRIX'],
      supportedLabelSizes: ['38x25mm', '50x25mm', '100x50mm', 'A4_Sheet_24Labels', 'Custom_Thermal'],
      supportedPrinters: ['Thermal Zebra ZD421 (Default)', 'Thermal TSC TE200', 'EPSON POS Receipt Printer', 'Virtual PDF Spooler'],
      supportedDPI: [203, 300, 600],
      supportsQR: true,
      supportsDataMatrix: true,
      supportsPDF417: true,
      supportsUSBScanner: true,
      supportsCamera: true,
      supportsBatchPrinting: true,
      supportsPreview: true,
      version: CURRENT_PROTOCOL_VERSION,
      maxBatchSize: 500,
    };
  }

  // ============================================================================
  // SECTION 3: TEMPLATES & PRINTERS CONTRACT DISCOVERY
  // ============================================================================
  public getTemplates(): GetTemplatesResponseDTO {
    return {
      templates: [
        { id: 'TPL-38X25', name: 'Standard Product Tag (38x25mm)', widthMm: 38, heightMm: 25, isDefault: true },
        { id: 'TPL-50X25', name: 'Jewelry / Small Item Tag (50x25mm)', widthMm: 50, heightMm: 25, isDefault: false },
        { id: 'TPL-100X50', name: 'Shipping Box Label (100x50mm)', widthMm: 100, heightMm: 50, isDefault: false },
        { id: 'TPL-A4-24', name: 'A4 Grid Sheet (24 Labels)', widthMm: 210, heightMm: 297, isDefault: false },
      ],
    };
  }

  public getPrinters(): GetPrintersResponseDTO {
    return {
      printers: [
        { name: 'Zebra ZD421 Direct Thermal', isDefault: true, status: 'ready', supportedDpi: [203, 300] },
        { name: 'TSC TE200 Desktop Printer', isDefault: false, status: 'ready', supportedDpi: [203] },
        { name: 'Network PDF Virtual Spooler', isDefault: false, status: 'ready', supportedDpi: [300, 600] },
      ],
    };
  }

  // ============================================================================
  // SECTION 8 & 9: STATE & TIMEOUT POLICY
  // ============================================================================
  public getState(): BarcodeCommunicationState {
    return this.state;
  }

  public setState(newState: BarcodeCommunicationState) {
    this.state = newState;
    this.diagnostics.communicationState = newState;
  }

  public getTimeoutPolicy(): BarcodeTimeoutPolicy {
    return { ...this.timeoutPolicy };
  }

  public updateTimeoutPolicy(policy: Partial<BarcodeTimeoutPolicy>) {
    this.timeoutPolicy = { ...this.timeoutPolicy, ...policy };
  }

  // ============================================================================
  // SECTION 10: DIAGNOSTIC MODEL
  // ============================================================================
  public getDiagnostics(): BarcodeDiagnosticModel {
    return { ...this.diagnostics };
  }
}

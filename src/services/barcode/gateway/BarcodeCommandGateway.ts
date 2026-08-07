import {
  BarcodeOperation,
  BarcodeProtocolResponse,
  CURRENT_PROTOCOL_VERSION,
  BarcodeErrorCode,
} from '../../../types/barcodeProtocol';
import {
  QueuedCommandItem,
  CommandPriority,
  CommandRetryPolicy,
  GatewayTelemetryModel,
} from '../../../types/barcodeGateway';
import { BarcodeTransportManager } from '../transport/BarcodeTransportManager';
import { BarcodeProtocolService } from '../protocol/BarcodeProtocolService';
import { DesktopDetector } from '../transport/DesktopDetector';

export class BarcodeCommandGateway {
  private static instance: BarcodeCommandGateway | null = null;

  private transportManager = BarcodeTransportManager.getInstance();
  private protocolService = BarcodeProtocolService.getInstance();

  private commandQueue: QueuedCommandItem[] = [];
  private retryPolicy: CommandRetryPolicy = {
    mode: 'NONE',
    maxAttempts: 3,
    initialDelayMs: 200,
    backoffFactor: 2,
  };

  private telemetry: GatewayTelemetryModel = {
    commandsSent: 0,
    commandsCompleted: 0,
    commandsFailed: 0,
    totalLatencyMs: 0,
    averageLatencyMs: 0,
    lastCommand: null,
    lastResponse: null,
  };

  private constructor() {}

  public static getInstance(): BarcodeCommandGateway {
    if (!BarcodeCommandGateway.instance) {
      BarcodeCommandGateway.instance = new BarcodeCommandGateway();
    }
    return BarcodeCommandGateway.instance;
  }

  // ============================================================================
  // SECTION 3: Command Validation
  // ============================================================================
  public validateCommand(
    operation: BarcodeOperation,
    payload: any,
    requestId?: string,
    correlationId?: string,
    protocolVersion: string = CURRENT_PROTOCOL_VERSION
  ): { isValid: boolean; errorCode?: BarcodeErrorCode; message?: string } {
    // Protocol Version Validation
    const versionCheck = this.protocolService.negotiateVersion(protocolVersion);
    if (!versionCheck.isCompatible) {
      return {
        isValid: false,
        errorCode: 'INVALID_PROTOCOL',
        message: `Incompatible protocol version '${protocolVersion}'. Required '${CURRENT_PROTOCOL_VERSION}'.`,
      };
    }

    // Supported Operations Validation
    const supportedOps: string[] = [
      'GenerateBarcode',
      'PrintBarcode',
      'SyncBarcode',
      'HealthCheck',
      'GetCapabilities',
      'GetPrinters',
      'GetTemplates',
      'Ping',
      'GetProducts',
      'GetCategories',
      'GetBrands',
      'GetUnits',
      'GetWarehouses',
      'INVENTORY:GetProducts',
      'INVENTORY:GetCategories',
      'INVENTORY:GetBrands',
      'INVENTORY:GetUnits',
      'INVENTORY:GetWarehouses',
    ];

    if (!supportedOps.includes(operation)) {
      return {
        isValid: false,
        errorCode: 'NOT_SUPPORTED',
        message: `Operation '${operation}' is not supported by BarcodeCommandGateway.`,
      };
    }

    // Payload Validation
    if (payload === undefined || payload === null || typeof payload !== 'object') {
      return {
        isValid: false,
        errorCode: 'INVALID_PAYLOAD',
        message: 'Command payload must be a non-null JSON object.',
      };
    }

    // Security check placeholder (Sender/Receiver/Token)
    if (requestId && requestId.trim() === '') {
      return {
        isValid: false,
        errorCode: 'INVALID_PAYLOAD',
        message: 'Request ID cannot be empty string.',
      };
    }

    return { isValid: true };
  }

  // ============================================================================
  // SECTION 1 & 2: Command Dispatch (Execute Single Command)
  // ============================================================================
  public async executeCommand<TReq = any, TRes = any>(
    operation: BarcodeOperation,
    payload: TReq,
    priority: CommandPriority = 'NORMAL',
    correlationId?: string
  ): Promise<BarcodeProtocolResponse<TRes>> {
    const startTime = Date.now();
    const generatedCorrelationId = correlationId || `CORR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const generatedRequestId = `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Telemetry: track sent
    this.telemetry.commandsSent++;
    this.telemetry.lastCommand = {
      operation,
      requestId: generatedRequestId,
      timestamp: new Date().toISOString(),
    };

    // 1. Validate Command
    const validation = this.validateCommand(operation, payload, generatedRequestId, generatedCorrelationId);
    if (!validation.isValid) {
      this.telemetry.commandsFailed++;
      const errResponse = this.protocolService.createErrorResponse<TRes>(
        validation.errorCode || 'INVALID_PAYLOAD',
        validation.message || 'Validation failed before dispatch',
        generatedRequestId
      );
      this.recordTelemetryResponse(false, Date.now() - startTime, validation.errorCode);
      return errResponse;
    }

    // 3. Queue Item Preparation
    const queueItem: QueuedCommandItem<TReq> = {
      id: generatedRequestId,
      operation,
      payload,
      priority,
      queuedAt: new Date().toISOString(),
      correlationId: generatedCorrelationId,
      retryPolicy: { ...this.retryPolicy },
      status: 'PROCESSING',
    };

    this.enqueue(queueItem);

    // 4. Dispatch through Transport Manager
    try {
      const response = await this.transportManager.sendRequest<TReq, TRes>(operation, payload);
      const durationMs = Date.now() - startTime;

      if (response.success) {
        this.telemetry.commandsCompleted++;
        queueItem.status = 'COMPLETED';
        this.recordTelemetryResponse(true, durationMs);
      } else {
        this.telemetry.commandsFailed++;
        queueItem.status = 'FAILED';
        this.recordTelemetryResponse(false, durationMs, response.errorCode);
      }

      this.dequeue(queueItem.id);
      return response;
    } catch (e: any) {
      const durationMs = Date.now() - startTime;
      this.telemetry.commandsFailed++;
      queueItem.status = 'FAILED';
      this.recordTelemetryResponse(false, durationMs, 'UNKNOWN_ERROR');
      this.dequeue(queueItem.id);

      return this.protocolService.createErrorResponse<TRes>(
        'UNKNOWN_ERROR',
        e.message || 'Unexpected exception during gateway dispatch.',
        generatedRequestId
      );
    }
  }

  // ============================================================================
  // SECTION 6: Bulk & Priority Queue Execution
  // ============================================================================
  public async executeBulkCommands(
    commands: Array<{ operation: BarcodeOperation; payload: any; priority?: CommandPriority }>
  ): Promise<BarcodeProtocolResponse[]> {
    const results: BarcodeProtocolResponse[] = [];

    // Sort by priority (CRITICAL > HIGH > NORMAL > LOW)
    const priorityWeight: Record<CommandPriority, number> = {
      CRITICAL: 4,
      HIGH: 3,
      NORMAL: 2,
      LOW: 1,
    };

    const sortedCommands = [...commands].sort(
      (a, b) => (priorityWeight[b.priority || 'NORMAL'] || 2) - (priorityWeight[a.priority || 'NORMAL'] || 2)
    );

    for (const cmd of sortedCommands) {
      const res = await this.executeCommand(cmd.operation, cmd.payload, cmd.priority || 'NORMAL');
      results.push(res);
    }

    return results;
  }

  // ============================================================================
  // SECTION 5: Retry Policy Configuration
  // ============================================================================
  public getRetryPolicy(): CommandRetryPolicy {
    return { ...this.retryPolicy };
  }

  public setRetryPolicy(policy: Partial<CommandRetryPolicy>): void {
    this.retryPolicy = { ...this.retryPolicy, ...policy };
  }

  // ============================================================================
  // SECTION 6: Queue State & Management
  // ============================================================================
  public getQueueStatus(): {
    queueSize: number;
    pendingCount: number;
    processingCount: number;
    items: QueuedCommandItem[];
  } {
    return {
      queueSize: this.commandQueue.length,
      pendingCount: this.commandQueue.filter((i) => i.status === 'PENDING').length,
      processingCount: this.commandQueue.filter((i) => i.status === 'PROCESSING').length,
      items: [...this.commandQueue],
    };
  }

  public clearQueue(): void {
    this.commandQueue = [];
  }

  private enqueue(item: QueuedCommandItem): void {
    this.commandQueue.push(item);
  }

  private dequeue(id: string): void {
    this.commandQueue = this.commandQueue.filter((i) => i.id !== id);
  }

  // ============================================================================
  // SECTION 7: Telemetry Tracking
  // ============================================================================
  public getTelemetry(): GatewayTelemetryModel {
    return { ...this.telemetry };
  }

  public resetTelemetry(): void {
    this.telemetry = {
      commandsSent: 0,
      commandsCompleted: 0,
      commandsFailed: 0,
      totalLatencyMs: 0,
      averageLatencyMs: 0,
      lastCommand: null,
      lastResponse: null,
    };
  }

  private recordTelemetryResponse(success: boolean, durationMs: number, errorCode?: BarcodeErrorCode): void {
    this.telemetry.totalLatencyMs += durationMs;
    const completedOrFailed = this.telemetry.commandsCompleted + this.telemetry.commandsFailed;
    this.telemetry.averageLatencyMs =
      completedOrFailed > 0 ? Math.round(this.telemetry.totalLatencyMs / completedOrFailed) : 0;

    this.telemetry.lastResponse = {
      success,
      durationMs,
      timestamp: new Date().toISOString(),
      errorCode,
    };
  }
}

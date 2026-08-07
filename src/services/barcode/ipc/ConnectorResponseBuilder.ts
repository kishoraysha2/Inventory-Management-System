import {
  BarcodeProtocolResponse,
  BarcodeErrorCode,
  CURRENT_PROTOCOL_VERSION,
} from '../../../types/barcodeProtocol';

export class ConnectorResponseBuilder {
  /**
   * Builds a standardized Success Response
   */
  public static buildSuccess<T = any>(
    payload: T,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION,
    message = 'Success'
  ): BarcodeProtocolResponse<T> {
    return {
      success: true,
      status: 'success',
      data: payload,
      message,
      provider: 'LOCAL',
      durationMs,
      payload,
      protocolVersion,
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Builds a standardized Failure Response
   */
  public static buildFailure<T = any>(
    errorCode: BarcodeErrorCode,
    errorMessage: string,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse<T> {
    return {
      success: false,
      status: 'error',
      message: errorMessage,
      errorCode,
      errorMessage,
      provider: 'LOCAL',
      durationMs,
      protocolVersion,
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Standardized Protocol Error Response
   */
  public static buildProtocolError(
    message: string,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse {
    return this.buildFailure('PROTOCOL_MISMATCH', message, durationMs, requestId, protocolVersion);
  }

  /**
   * Standardized Checksum Error Response
   */
  public static buildChecksumError(
    message: string,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse {
    return this.buildFailure('CHECKSUM_FAILURE', message, durationMs, requestId, protocolVersion);
  }

  /**
   * Standardized License Invalid Response
   */
  public static buildLicenseError(
    message: string,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse {
    return this.buildFailure('LICENSE_INVALID', message, durationMs, requestId, protocolVersion);
  }

  /**
   * Standardized Provider Offline Response
   */
  public static buildProviderOffline(
    message: string,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse {
    return this.buildFailure('PROVIDER_OFFLINE', message, durationMs, requestId, protocolVersion);
  }

  /**
   * Standardized Timeout Response
   */
  public static buildTimeout(
    message: string,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse {
    return this.buildFailure('TIMEOUT', message, durationMs, requestId, protocolVersion);
  }

  /**
   * Standardized Unsupported Operation Response
   */
  public static buildUnsupportedOperation(
    message: string,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse {
    return this.buildFailure('NOT_SUPPORTED', message, durationMs, requestId, protocolVersion);
  }
}

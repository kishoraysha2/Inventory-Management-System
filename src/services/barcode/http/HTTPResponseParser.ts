import { BarcodeProtocolResponse, BarcodeErrorCode, CURRENT_PROTOCOL_VERSION } from '../../../types/barcodeProtocol';

export class HTTPResponseParser {
  /**
   * Parses an HTTP Response object into a BarcodeProtocolResponse.
   */
  public static async parseResponse<T = any>(
    response: Response,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): Promise<BarcodeProtocolResponse<T>> {
    try {
      const contentType = response.headers.get('content-type') || '';
      let jsonBody: any = null;

      if (contentType.includes('application/json')) {
        jsonBody = await response.json();
      } else {
        const textBody = await response.text();
        try {
          jsonBody = JSON.parse(textBody);
        } catch {
          jsonBody = { rawText: textBody };
        }
      }

      if (!response.ok) {
        return this.translateHTTPError(response.status, jsonBody, durationMs, requestId, protocolVersion);
      }

      // If jsonBody is already a BarcodeProtocolResponse envelope
      if (jsonBody && typeof jsonBody === 'object' && 'success' in jsonBody) {
        return {
          ...jsonBody,
          durationMs: durationMs || jsonBody.durationMs || 0,
          requestId: requestId || jsonBody.requestId,
        };
      }

      // Direct payload response
      return {
        success: true,
        provider: 'LOCAL',
        durationMs,
        payload: jsonBody as T,
        protocolVersion,
        requestId,
        timestamp: new Date().toISOString(),
      };
    } catch (e: any) {
      return {
        success: false,
        errorCode: 'INVALID_RESPONSE',
        errorMessage: 'Local HTTP Connector: Invalid or malformed response returned by server.',
        provider: 'LOCAL',
        durationMs,
        protocolVersion,
        requestId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Translates network and HTTP status errors into standardized Enterprise Barcode error responses.
   */
  public static translateHTTPError<T = any>(
    status: number,
    body: any,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse<T> {
    let errorCode: BarcodeErrorCode = 'SERVER_ERROR';
    let errorMessage = `HTTP ${status}: Server request failed.`;

    if (body?.errorMessage) {
      errorMessage = body.errorMessage;
    }

    if (body?.errorCode) {
      errorCode = body.errorCode;
    } else {
      switch (status) {
        case 400:
          errorCode = 'INVALID_PAYLOAD';
          errorMessage = body?.message || 'HTTP 400: Invalid payload or request structure.';
          break;
        case 404:
          errorCode = 'NOT_SUPPORTED';
          errorMessage = body?.message || 'HTTP 404: Endpoint operation not supported on connector host.';
          break;
        case 408:
          errorCode = 'HTTP_TIMEOUT';
          errorMessage = 'HTTP 408: Request timeout on Local Connector Server.';
          break;
        case 502:
        case 503:
        case 504:
          errorCode = 'CONNECTOR_OFFLINE';
          errorMessage = 'HTTP 503: MZ Barcode Suite Local Connector Server is offline or unreachable.';
          break;
        default:
          errorCode = 'SERVER_ERROR';
          errorMessage = body?.message || `HTTP ${status}: Local Connector internal error.`;
          break;
      }
    }

    return {
      success: false,
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
   * Translates raw Javascript/Network exceptions (AbortError, TypeError, Failed to fetch)
   */
  public static translateNetworkException<T = any>(
    error: any,
    durationMs: number,
    requestId: string,
    protocolVersion = CURRENT_PROTOCOL_VERSION
  ): BarcodeProtocolResponse<T> {
    let errorCode: BarcodeErrorCode = 'CONNECTOR_OFFLINE';
    let errorMessage = 'Local Connector Client: Host server connection failed or unreachable.';

    if (error?.name === 'AbortError') {
      errorCode = 'HTTP_TIMEOUT';
      errorMessage = 'Local Connector Client: Request timed out after 5000ms threshold.';
    } else if (error?.message && error.message.toLowerCase().includes('protocol')) {
      errorCode = 'INVALID_PROTOCOL';
      errorMessage = `Local Connector Client: ${error.message}`;
    }

    return {
      success: false,
      errorCode,
      errorMessage,
      provider: 'LOCAL',
      durationMs,
      protocolVersion,
      requestId,
      timestamp: new Date().toISOString(),
    };
  }
}

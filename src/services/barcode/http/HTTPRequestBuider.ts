import { CURRENT_PROTOCOL_VERSION } from '../../../types/barcodeProtocol';

export interface HTTPRequestOptions {
  method: 'GET' | 'POST';
  endpoint: string;
  body?: any;
  headers?: Record<string, string>;
  timeoutMs?: number;
  requestId?: string;
  correlationId?: string;
}

export class HTTPRequestBuider {
  public static buildRequest(options: HTTPRequestOptions, baseUrl: string) {
    const requestId = options.requestId || `REQ-CLIENT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const correlationId = options.correlationId || `CORR-CLIENT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const timeoutMs = options.timeoutMs || 5000;

    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    const fullUrl = `${baseUrl.replace(/\/$/, '')}${options.endpoint.startsWith('/') ? options.endpoint : `/${options.endpoint}`}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Protocol-Version': CURRENT_PROTOCOL_VERSION,
      'X-Request-ID': requestId,
      'X-Correlation-ID': correlationId,
      'X-Checksum': 'NEXUS-CHECKSUM-OK',
      ...(options.headers || {}),
    };

    const fetchInit: RequestInit = {
      method: options.method,
      headers,
      signal: controller.signal,
    };

    if (options.body && options.method === 'POST') {
      fetchInit.body = JSON.stringify(options.body);
    }

    return {
      url: fullUrl,
      fetchInit,
      requestId,
      correlationId,
      timerId,
      clearTimer: () => clearTimeout(timerId),
    };
  }
}

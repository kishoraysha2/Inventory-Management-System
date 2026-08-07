import { IBarcodeTransport } from '../../../../types/barcodeTransport';
import { BarcodeMessageEnvelope, BarcodeProtocolResponse } from '../../../../types/barcodeProtocol';
import { BarcodeProtocolService } from '../../protocol/BarcodeProtocolService';

export class NamedPipeTransport implements IBarcodeTransport {
  private protocolService = BarcodeProtocolService.getInstance();

  public getTransportType() {
    return 'NAMED_PIPES' as const;
  }

  public isAvailable(): boolean {
    return false; // Placeholder
  }

  public async connect(): Promise<boolean> {
    return false;
  }

  public async disconnect(): Promise<void> {}

  public async send<TReq = any, TRes = any>(
    envelope: BarcodeMessageEnvelope<TReq>
  ): Promise<BarcodeProtocolResponse<TRes>> {
    return this.protocolService.createErrorResponse(
      'NOT_SUPPORTED',
      'Named Pipe Transport is a placeholder in Sprint 9.',
      envelope.requestId
    );
  }

  public async ping(): Promise<number> {
    return 0;
  }
}

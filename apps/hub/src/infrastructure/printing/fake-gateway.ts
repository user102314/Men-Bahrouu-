import type {
  PrinterGateway,
  PrinterTarget,
  SendOptions,
} from "../../application/printer-gateway.js";

export interface CapturedPrint {
  host: string;
  port: number;
  data: Buffer;
}

export class FakePrinterGateway implements PrinterGateway {
  readonly sent: CapturedPrint[] = [];
  readonly offline = new Set<string>();

  async send(target: PrinterTarget, data: Buffer, options: SendOptions): Promise<void> {
    void options;
    if (this.offline.has(`${target.host}:${target.port}`)) {
      throw new Error("printer offline");
    }
    this.sent.push({ host: target.host, port: target.port, data: Buffer.from(data) });
  }
}

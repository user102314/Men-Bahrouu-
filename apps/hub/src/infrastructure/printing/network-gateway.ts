import net from "node:net";

import type {
  PrinterGateway,
  PrinterTarget,
  SendOptions,
} from "../../application/printer-gateway.js";

export class EscPosNetworkGateway implements PrinterGateway {
  send(target: PrinterTarget, data: Buffer, options: SendOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: target.host, port: target.port });
      let settled = false;
      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        reject(error);
      };
      const connectTimer = setTimeout(
        () => fail(new Error("connect timeout")),
        options.connectTimeoutMs,
      );
      socket.once("error", (error) => fail(error));
      socket.once("connect", () => {
        clearTimeout(connectTimer);
        socket.setTimeout(options.writeTimeoutMs);
        socket.write(data, (error) => {
          if (error) {
            fail(error);
            return;
          }
          socket.end();
          settled = true;
          resolve();
        });
      });
      socket.once("timeout", () => fail(new Error("write timeout")));
    });
  }
}

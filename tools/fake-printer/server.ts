import { createServer, type Socket } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeTicket } from "../../apps/hub/src/domain/printing/ticket-text.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");
const fail = process.argv.includes("--fail");
const ports = process.argv.filter((arg) => /^\d+$/.test(arg)).map((arg) => Number(arg));
const listenPorts = ports.length > 0 ? ports : [9101, 9102];

mkdirSync(outDir, { recursive: true });

for (const port of listenPorts) {
  const server = createServer((socket) => accept(socket, port));
  server.listen(port, "127.0.0.1", () => {
    console.log(`Fake printer listening on 127.0.0.1:${port}${fail ? " (failing)" : ""}`);
  });
}

function accept(socket: Socket, port: number): void {
  if (fail) {
    socket.destroy();
    console.log(`Port ${port}: connection refused to simulate a fault`);
    return;
  }
  const chunks: Buffer[] = [];
  socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  socket.on("end", () => {
    const data = Buffer.concat(chunks);
    const text = decodeTicket(data);
    const file = join(outDir, `${port}-${Date.now()}.txt`);
    writeFileSync(file, text, "utf8");
    console.log(`\n----- ticket ${port} -----\n${text}\n----- cut -----\n`);
  });
}

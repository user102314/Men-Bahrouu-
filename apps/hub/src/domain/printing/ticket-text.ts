import type { StationKind, TicketPayload } from "@resto/shared";

const ESC = 0x1b;
const GS = 0x1d;

/** CP858 bytes for the French letters used on preparation tickets. */
const PC858: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  å: 0x86,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ì: 0x8d,
  Ä: 0x8e,
  É: 0x90,
  æ: 0x91,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  ÿ: 0x98,
  Ö: 0x99,
  Ü: 0x9a,
  ø: 0x9b,
  "£": 0x9c,
  Ø: 0x9d,
  "×": 0xd8,
  "°": 0xf8,
  Ÿ: 0x9f,
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  Ê: 0xd2,
  Ë: 0xd3,
  È: 0xd4,
  Á: 0xb5,
  Â: 0xb6,
  À: 0xb7,
  "©": 0xb8,
  "¢": 0xbd,
  "¥": 0xbe,
  Î: 0xd7,
  Ô: 0xe2,
  Û: 0xea,
  Ù: 0xeb,
};

const FROM_PC858 = new Map(Object.entries(PC858).map(([char, byte]) => [byte, char]));

export interface TicketRenderer {
  render(ticket: TicketPayload, columns: number): Buffer;
}

export const textTicketRenderer: TicketRenderer = {
  render: renderTicket,
};

export function renderTicket(ticket: TicketPayload, columns = 48): Buffer {
  const chunks: Buffer[] = [Buffer.from([ESC, 0x40, ESC, 0x74, 19])];
  const title = ticket.stationKind === "KITCHEN" ? "CUISINE" : "BAR";
  chunks.push(align(1), size(0x11), line(title, columns), size(0x00));
  chunks.push(line("=".repeat(Math.min(columns, 32)), columns));
  const banner = bannerFor(ticket.type);
  if (banner) {
    const reversed = ticket.type === "VOID";
    if (reversed) {
      chunks.push(Buffer.from([GS, 0x42, 1]));
    }
    chunks.push(line(banner, columns));
    if (reversed) {
      chunks.push(Buffer.from([GS, 0x42, 0]));
    }
  }
  if (ticket.redirectedFrom) {
    chunks.push(line(`DEPUIS ${label(ticket.redirectedFrom)}`, columns));
  }
  chunks.push(size(0x11), line(`N° ${ticket.orderNumber}`, columns));
  chunks.push(line(ticket.tableLabel ? `TABLE ${ticket.tableLabel}` : "A EMPORTER", columns), size(0x00), align(0));
  chunks.push(line("-".repeat(columns), columns));
  for (const item of ticket.lines) {
    chunks.push(size(0x01), line(`${item.quantity} x ${item.nameFr}`, columns), size(0x00));
    if (item.note) {
      chunks.push(line(`  ${item.note}`, columns));
    }
    chunks.push(line("", columns));
  }
  if (ticket.orderNote) {
    chunks.push(line(`Note: ${ticket.orderNote}`, columns));
  }
  chunks.push(line("-".repeat(columns), columns));
  chunks.push(line(`${formatTunis(ticket.createdAtIso)}  ${ticket.serverName}`, columns));
  chunks.push(Buffer.from([0x0a, 0x0a, GS, 0x56, 66, 0]));
  return Buffer.concat(chunks);
}

/** Visible text with ESC/POS commands removed, for logs and tests. */
export function decodeTicket(data: Buffer): string {
  const chars: string[] = [];
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index] ?? 0;
    if (byte === ESC || byte === GS) {
      index += commandWidth(byte, data[index + 1] ?? 0) - 1;
      continue;
    }
    if (byte === 0x0a) {
      chars.push("\n");
      continue;
    }
    if (byte === 0x0d) {
      continue;
    }
    chars.push(FROM_PC858.get(byte) ?? (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ""));
  }
  return chars.join("");
}

function commandWidth(lead: number, command: number): number {
  if (lead === GS && command === 0x56) {
    return 4;
  }
  if (lead === ESC && command === 0x40) {
    return 2;
  }
  return 3;
}

function bannerFor(type: TicketPayload["type"]): string | null {
  if (type === "ADD") {
    return "*** AJOUT ***";
  }
  if (type === "VOID") {
    return "*** ANNULATION ***";
  }
  if (type === "REPRINT") {
    return "*** DUPLICATA ***";
  }
  return null;
}

function label(kind: StationKind): string {
  return kind === "KITCHEN" ? "CUISINE" : "BAR";
}

function line(value: string, columns: number): Buffer {
  const clipped = [...value].slice(0, columns).join("");
  return Buffer.concat([encodePc858(clipped), Buffer.from([0x0a])]);
}

function encodePc858(value: string): Buffer {
  const bytes: number[] = [];
  for (const char of value) {
    if (char === "œ" || char === "Œ") {
      bytes.push(...(char === "œ" ? [0x6f, 0x65] : [0x4f, 0x45]));
      continue;
    }
    const code = char.codePointAt(0) ?? 0x3f;
    if (code >= 32 && code < 127) {
      bytes.push(code);
      continue;
    }
    bytes.push(PC858[char] ?? 0x3f);
  }
  return Buffer.from(bytes);
}

function align(mode: 0 | 1): Buffer {
  return Buffer.from([ESC, 0x61, mode]);
}

function size(mode: number): Buffer {
  return Buffer.from([GS, 0x21, mode]);
}

function formatTunis(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Tunis",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Dishes created only for today's specials live in this category, apart from the standing menu. */
export const DAILY_CATEGORY_ID = "0199c0a0-0000-7000-8000-00000000030e";

const RAND_A_MAX = 0xfff;

let lastTimestamp = -1;
let sequence = 0;

/** RFC 9562 UUID v7. Successive calls sort in creation order, including within the same millisecond. */
export function newId(now = Date.now()): string {
  let timestamp = now;
  if (timestamp === lastTimestamp) {
    sequence += 1;
    if (sequence > RAND_A_MAX) {
      timestamp += 1;
      sequence = 0;
    }
  } else if (timestamp < lastTimestamp) {
    timestamp = lastTimestamp + 1;
    sequence = 0;
  } else {
    sequence = randomInt(RAND_A_MAX + 1);
  }
  lastTimestamp = timestamp;

  const bytes = randomBytes(16);
  bytes[0] = Number((BigInt(timestamp) >> 40n) & 0xffn);
  bytes[1] = Number((BigInt(timestamp) >> 32n) & 0xffn);
  bytes[2] = Number((BigInt(timestamp) >> 24n) & 0xffn);
  bytes[3] = Number((BigInt(timestamp) >> 16n) & 0xffn);
  bytes[4] = Number((BigInt(timestamp) >> 8n) & 0xffn);
  bytes[5] = Number(BigInt(timestamp) & 0xffn);
  bytes[6] = ((sequence >> 8) & 0x0f) | 0x70;
  bytes[7] = sequence & 0xff;
  const byte8 = bytes[8] ?? 0;
  bytes[8] = (byte8 & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const webCrypto = (globalThis as { crypto?: { getRandomValues(array: Uint8Array): Uint8Array } })
    .crypto;
  if (!webCrypto) {
    throw new Error("Web Crypto is required to generate ids");
  }
  webCrypto.getRandomValues(bytes);
  return bytes;
}

function randomInt(exclusiveMax: number): number {
  const buffer = randomBytes(2);
  const first = buffer[0] ?? 0;
  const second = buffer[1] ?? 0;
  return ((first << 8) | second) % exclusiveMax;
}

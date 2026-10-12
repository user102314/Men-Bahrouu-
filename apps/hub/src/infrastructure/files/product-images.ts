import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ProductImageType = keyof typeof EXTENSIONS;

const MAX_BYTES = 1_500_000;

export function productImageDirectory(): string {
  return fileURLToPath(new URL("../../../data/product-images/", import.meta.url));
}

export function decodeProductImage(contentType: string, dataBase64: string): { type: ProductImageType; bytes: Buffer } {
  if (!isProductImageType(contentType)) {
    throw new Error("INVALID_IMAGE");
  }
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES || !matchesMagic(contentType, bytes)) {
    throw new Error("INVALID_IMAGE");
  }
  return { type: contentType, bytes };
}

export async function writeProductImage(id: string, type: ProductImageType, bytes: Buffer): Promise<void> {
  const directory = productImageDirectory();
  await mkdir(directory, { recursive: true });
  await removeProductImage(id);
  await writeFile(join(directory, fileName(id, type)), bytes);
}

export async function readProductImage(id: string, type: ProductImageType): Promise<Buffer> {
  return readFile(join(productImageDirectory(), fileName(id, type)));
}

export async function removeProductImage(id: string): Promise<void> {
  const directory = productImageDirectory();
  await Promise.all(
    Object.values(EXTENSIONS).map(async (extension) => {
      await unlink(join(directory, `${id}.${extension}`)).catch(() => undefined);
    }),
  );
}

function isProductImageType(value: string): value is ProductImageType {
  return value in EXTENSIONS;
}

function fileName(id: string, type: ProductImageType): string {
  return `${id}.${EXTENSIONS[type]}`;
}

function matchesMagic(type: ProductImageType, bytes: Buffer): boolean {
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

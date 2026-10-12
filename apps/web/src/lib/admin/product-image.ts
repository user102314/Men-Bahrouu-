const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProductImageBody = {
  contentType: (typeof TYPES)[number];
  dataBase64: string;
};

export async function fileToImageBody(file: File): Promise<ProductImageBody> {
  if (!TYPES.includes(file.type as (typeof TYPES)[number]) || file.size === 0 || file.size > 1_500_000) {
    throw new Error("INVALID_IMAGE");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return { contentType: file.type as ProductImageBody["contentType"], dataBase64: btoa(binary) };
}

import argon2 from "argon2";

/** argon2id hash used for both PINs and passwords. */
export function hashSecret(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifySecret(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

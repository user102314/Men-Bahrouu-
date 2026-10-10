/** Development database commands drop data and, on reset, regenerate device tokens. */
export function assertNotProduction(nodeEnv: string | undefined, command: string): void {
  if (nodeEnv === "production") {
    throw new Error(
      `Refusing to ${command} while NODE_ENV=production. Never run this against a live restaurant database.`,
    );
  }
}

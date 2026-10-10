import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive(),
  SITE_ID: z.uuid(),
  CORS_ORIGINS: z.string().min(1),
  SESSION_WAITER_CASHIER_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(12 * 60 * 60),
  SESSION_ADMIN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 60 * 60),
  LOCKOUT_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCKOUT_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60),
  BUSINESS_DAY_CUTOFF_HOUR: z.coerce.number().int().min(0).max(23).default(5),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  siteId: string;
  corsOrigins: readonly string[];
  waiterSessionSeconds: number;
  adminSessionSeconds: number;
  lockoutAttempts: number;
  lockoutSeconds: number;
  businessDayCutoffHour: number;
  nodeEnv: "development" | "test" | "production";
  version: string;
}

export function loadConfig(env: NodeJS.ProcessEnv, version = "0.0.0"): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }
  const corsOrigins = parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (corsOrigins.length === 0 || corsOrigins.includes("*")) {
    throw new Error(
      "Invalid configuration: CORS_ORIGINS must list explicit origins and must not contain *",
    );
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    jwtSecret: parsed.data.JWT_SECRET,
    port: parsed.data.PORT,
    siteId: parsed.data.SITE_ID,
    corsOrigins,
    waiterSessionSeconds: parsed.data.SESSION_WAITER_CASHIER_SECONDS,
    adminSessionSeconds: parsed.data.SESSION_ADMIN_SECONDS,
    lockoutAttempts: parsed.data.LOCKOUT_ATTEMPTS,
    lockoutSeconds: parsed.data.LOCKOUT_SECONDS,
    businessDayCutoffHour: parsed.data.BUSINESS_DAY_CUTOFF_HOUR,
    nodeEnv: parsed.data.NODE_ENV,
    version,
  };
}

import postgres, { type Sql } from "postgres";

export function openDatabase(quietNotices = false): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return postgres(url, {
    max: 1,
    ...(quietNotices ? { onnotice: () => undefined } : {}),
  });
}

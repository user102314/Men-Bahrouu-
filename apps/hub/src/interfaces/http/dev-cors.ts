/** Local-network pages may call the hub only while it runs in development. */
export function isDevelopmentLanOrigin(origin: string): boolean {
  return (
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/.test(origin) ||
    /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(origin)
  );
}

export function corsOriginOption(nodeEnv: string, explicit: readonly string[]) {
  if (nodeEnv !== "development") {
    return [...explicit];
  }
  return (origin: string | undefined, callback: (error: null, allow: boolean) => void) => {
    callback(null, !origin || explicit.includes(origin) || isDevelopmentLanOrigin(origin));
  };
}

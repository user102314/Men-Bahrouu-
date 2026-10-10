/** Hub on the same machine as the page, unless VITE_HUB_URL is set. */
export function hubUrl(): string {
  const configured = import.meta.env.VITE_HUB_URL;
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, "");
  }
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3000";
  }
  return `http://${window.location.hostname}:3000`;
}

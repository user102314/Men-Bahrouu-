const KEY = "resto.floor";

export interface FloorSession {
  token: string;
  role: "WAITER" | "CASHIER";
  displayName: string;
}

export function loadFloorSession(): FloorSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as FloorSession;
    if (parsed.role !== "WAITER" && parsed.role !== "CASHIER") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveFloorSession(session: FloorSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearFloorSession(): void {
  sessionStorage.removeItem(KEY);
}

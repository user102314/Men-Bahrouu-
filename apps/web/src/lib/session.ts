import type { Role } from "@resto/shared";
import { useSyncExternalStore } from "react";

const KEY = "resto.access";

export interface Session {
  token: string;
  role: Role;
  userId: string;
  displayName: string;
  expiresAt: number;
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function browserStorage(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

export function homeFor(role: Role): string {
  if (role === "WAITER") {
    return "/waiter";
  }
  if (role === "CASHIER") {
    return "/cashier";
  }
  return "/admin";
}

export function sessionFromToken(token: string, displayName: string): Session | null {
  const part = token.split(".")[1];
  if (!part) {
    return null;
  }
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as {
      sub?: string;
      role?: string;
      exp?: number;
    };
    if (!json.sub || !json.exp) {
      return null;
    }
    if (json.role !== "WAITER" && json.role !== "CASHIER" && json.role !== "ADMIN") {
      return null;
    }
    return {
      token,
      role: json.role,
      userId: json.sub,
      displayName,
      expiresAt: json.exp * 1000,
    };
  } catch {
    return null;
  }
}

export function loadSession(): Session | null {
  const raw = browserStorage()?.getItem(KEY);
  if (!raw) {
    return null;
  }
  try {
    const session = JSON.parse(raw) as Session;
    if (session.expiresAt <= Date.now()) {
      browserStorage()?.removeItem(KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  browserStorage()?.setItem(KEY, JSON.stringify(session));
  emit();
}

export function clearSession(): void {
  browserStorage()?.removeItem(KEY);
  emit();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, loadSession, () => null);
}

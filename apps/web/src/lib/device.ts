import { useSyncExternalStore } from "react";

const KEY = "resto.device";
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readDevice(): string | null {
  const value = browserStorage()?.getItem(KEY);
  return value && value.length > 0 ? value : null;
}

export function writeDevice(token: string): void {
  browserStorage()?.setItem(KEY, token);
  emit();
}

export function clearDevice(): void {
  browserStorage()?.removeItem(KEY);
  emit();
}

export function subscribeDevice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeviceToken(): string | null {
  return useSyncExternalStore(subscribeDevice, readDevice, () => null);
}

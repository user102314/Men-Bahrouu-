const prefix = "resto.draft.";

export function readDraft(key: string): string | null {
  try {
    return sessionStorage.getItem(prefix + key);
  } catch {
    return null;
  }
}

export function saveDraft(key: string, orderId: string): void {
  try {
    sessionStorage.setItem(prefix + key, orderId);
  } catch {
    /* the next tap creates a new id */
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(prefix + key);
  } catch {
    /* ignore */
  }
}

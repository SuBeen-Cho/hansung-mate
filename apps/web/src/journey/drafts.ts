import { useEffect, useState } from "react";

export const ACADEMIC_DRAFT_KEY = "hansung-ieum-academic-draft-v1";
export const SPACE_DRAFT_KEY = "hansung-ieum-space-draft-v1";
export function readDraft<T>(key: string, valid: (value: unknown) => value is T): T | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value?.version === 1 && valid(value.data) ? value.data : null;
  } catch {
    return null;
  }
}
export function clearDrafts() {
  try {
    localStorage.removeItem(ACADEMIC_DRAFT_KEY);
    localStorage.removeItem(SPACE_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
/** Small, versioned drafts. Signatures/PDF bytes are deliberately excluded. */
export function useDraftStorage(key: string, data: unknown, active: boolean) {
  const [error, setError] = useState(false);
  const serialized = JSON.stringify(data);
  useEffect(() => {
    try {
      if (active)
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            savedAt: new Date().toISOString(),
            data: JSON.parse(serialized),
          }),
        );
      else localStorage.removeItem(key);
      setError(false);
    } catch {
      setError(true);
    }
  }, [key, serialized, active]);
  return error;
}

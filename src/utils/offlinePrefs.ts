/**
 * Per-module offline preferences.
 *
 * "Keep offline" is a deliberate user choice, so it must outrank automatic
 * cleanup: a module marked here is never evicted by the LRU pass, even when
 * the cache is over budget. Without this distinction, downloading a module for
 * a journey and then browsing the library could silently undo the download.
 *
 * Stored in localStorage rather than IndexedDB: it is a handful of ids, it is
 * needed synchronously during render, and it must survive the audio cache
 * being cleared.
 */

const KEEP_OFFLINE_KEY = "greek_dialogos_keep_offline_modules";

/** Soft cap on total cached audio before LRU eviction runs. */
export const AUDIO_CACHE_BUDGET_BYTES = 250 * 1024 * 1024; // 250 MB

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEEP_OFFLINE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  try {
    localStorage.setItem(KEEP_OFFLINE_KEY, JSON.stringify([...new Set(ids)]));
  } catch (err) {
    console.warn("Could not persist offline preferences:", err);
  }
}

export function getKeepOfflineIds(): string[] {
  return read();
}

export function isKeptOffline(moduleId: string): boolean {
  return read().includes(moduleId);
}

export function setKeptOffline(moduleId: string, keep: boolean): string[] {
  const current = read();
  const next = keep
    ? [...current, moduleId]
    : current.filter((id) => id !== moduleId);
  write(next);
  return next;
}

/** Human-readable byte size for storage readouts. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

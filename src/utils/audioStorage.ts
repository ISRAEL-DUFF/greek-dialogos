/**
 * Client-side IndexedDB Audio Cache and Storage Engine
 * Stores synthesized audio base64/blobs for instant 0ms playback and offline study.
 */

import { VoiceName } from "../types";

const DB_NAME = "AncientGreekAudioCacheDB";
const DB_VERSION = 1;
const STORE_NAME = "audio_records";

export interface AudioRecord {
  key: string;            // unique composite key: `${moduleId}__line_${lineId}__voice_${voice}`
  moduleId: string;
  lineId: number;
  voice: VoiceName | string;
  audioBase64: string;
  mimeType: string;
  text?: string;
  createdAt: number;
  /** Updated on every cache hit; drives LRU eviction. Absent on records written before eviction existed. */
  lastAccessedAt?: number;
}

/** Per-module rollup returned by getStorageStats. */
export interface ModuleStorageStat {
  moduleId: string;
  clips: number;
  bytes: number;
  oldestAccess: number;
}

export interface StorageStats {
  totalClips: number;
  totalBytes: number;
  perModule: ModuleStorageStat[];
  /** From the Storage API; null when the browser does not expose an estimate. */
  quotaBytes: number | null;
  usageBytes: number | null;
  /** True when the browser has granted persistent storage for this origin. */
  persisted: boolean;
}

/**
 * base64 inflates bytes by 4/3. Close enough for a storage readout, and far
 * cheaper than decoding every clip to measure it exactly.
 */
function approximateBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

class AudioStorageManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        return reject(new Error("IndexedDB is not supported in this browser"));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("moduleId", "moduleId", { unique: false });
          store.createIndex("lineKey", ["moduleId", "lineId"], { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error("IndexedDB open error:", request.error);
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Cache key.
   *
   * `variant` distinguishes renderings of the same line in the same voice that
   * differ in how they were synthesized — currently plain vs. contextual
   * delivery (docs/FIX-PLAN.md P1-9). Contextual audio depends on the
   * preceding line, so without this the cache would serve audio generated
   * under a context that no longer applies after an edit.
   *
   * The empty default keeps keys byte-identical to those written before
   * variants existed, so no already-cached audio is orphaned.
   */
  private makeKey(moduleId: string, lineId: number, voice: string, variant = ""): string {
    const base = `${moduleId}__line_${lineId}__voice_${voice}`;
    return variant ? `${base}__v_${variant}` : base;
  }

  /**
   * Get cached audio for a specific module, line, and voice
   */
  public async getCachedAudio(
    moduleId: string,
    lineId: number,
    voice: string,
    variant = ""
  ): Promise<{ audioBase64: string; mimeType: string } | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const key = this.makeKey(moduleId, lineId, voice, variant);
        const request = store.get(key);

        request.onsuccess = () => {
          const record: AudioRecord | undefined = request.result;
          if (record && record.audioBase64) {
            // Record the hit for LRU eviction. Deliberately not awaited: a
            // failed bookkeeping write must never fail a cache read.
            this.touch(key);
            resolve({
              audioBase64: record.audioBase64,
              mimeType: record.mimeType || "audio/pcm;rate=24000",
            });
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          resolve(null);
        };
      });
    } catch (err) {
      console.warn("Error getting cached audio from IndexedDB:", err);
      return null;
    }
  }

  /**
   * Save synthesized audio into cache
   */
  public async saveCachedAudio(
    moduleId: string,
    lineId: number,
    voice: string,
    audioBase64: string,
    mimeType: string,
    text?: string,
    variant = ""
  ): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const key = this.makeKey(moduleId, lineId, voice, variant);

        const record: AudioRecord = {
          key,
          moduleId,
          lineId,
          voice,
          audioBase64,
          mimeType,
          text,
          createdAt: Date.now(),
        };

        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.warn("Failed to put audio into IndexedDB:", request.error);
          reject(request.error);
        };
      });
    } catch (err) {
      console.warn("Error saving audio to IndexedDB:", err);
    }
  }

  /**
   * Get all cached audio clips for an entire module (keyed by lineId)
   */
  public async getModuleAudioMap(
    moduleId: string
  ): Promise<Record<number, { audioBase64: string; mimeType: string; voice: string }>> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("moduleId");
        const request = index.getAll(IDBKeyRange.only(moduleId));

        request.onsuccess = () => {
          const records: AudioRecord[] = request.result || [];
          const audioMap: Record<number, { audioBase64: string; mimeType: string; voice: string }> = {};

          for (const rec of records) {
            audioMap[rec.lineId] = {
              audioBase64: rec.audioBase64,
              mimeType: rec.mimeType,
              voice: rec.voice,
            };
          }

          resolve(audioMap);
        };

        request.onerror = () => {
          resolve({});
        };
      });
    } catch (err) {
      console.warn("Error getting module audio map:", err);
      return {};
    }
  }

  /**
   * Check which lines of a module are already cached
   */
  public async getCachedLineIds(
    moduleId: string,
    speakerVoices?: Record<string, string>,
    moduleSpeakers?: { name: string; defaultVoice: string }[]
  ): Promise<Set<number>> {
    try {
      const audioMap = await this.getModuleAudioMap(moduleId);
      return new Set(Object.keys(audioMap).map((k) => Number(k)));
    } catch {
      return new Set();
    }
  }

  /**
   * Import multiple audio records for a module into IndexedDB
   */
  public async importModuleAudioMap(
    moduleId: string,
    audioMap: Record<number, { audioBase64: string; mimeType: string; voice: string; text?: string }>
  ): Promise<number> {
    try {
      const db = await this.getDB();
      let importedCount = 0;

      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        const lineIds = Object.keys(audioMap);
        if (lineIds.length === 0) {
          return resolve(0);
        }

        for (const strId of lineIds) {
          const lineId = Number(strId);
          const item = audioMap[lineId];
          if (item && item.audioBase64) {
            const key = this.makeKey(moduleId, lineId, item.voice || "Fenrir");
            const record: AudioRecord = {
              key,
              moduleId,
              lineId,
              voice: item.voice || "Fenrir",
              audioBase64: item.audioBase64,
              mimeType: item.mimeType || "audio/pcm;rate=24000",
              text: item.text,
              createdAt: Date.now(),
            };
            store.put(record);
            importedCount++;
          }
        }

        transaction.oncomplete = () => {
          resolve(importedCount);
        };

        transaction.onerror = () => {
          console.warn("Transaction error importing audio map:", transaction.error);
          resolve(importedCount);
        };
      });
    } catch (err) {
      console.warn("Error importing audio map:", err);
      return 0;
    }
  }

  /**
   * Delete all cached audio for a specific module
   */
  public async deleteModuleAudio(moduleId: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("moduleId");
        const request = index.openCursor(IDBKeyRange.only(moduleId));

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => resolve();
      });
    } catch (err) {
      console.warn("Error deleting module audio:", err);
    }
  }

  /**
   * Clear all audio cache
   */
  public async clearAllAudio(): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      });
    } catch (err) {
      console.warn("Error clearing audio cache:", err);
    }
  }

  /**
   * Get total number of cached tracks
   */
  /**
   * Update a record's last-access time. Fire and forget.
   */
  private touch(key: string): void {
    this.getDB()
      .then((db) => {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          const record: AudioRecord | undefined = req.result;
          if (record) {
            record.lastAccessedAt = Date.now();
            store.put(record);
          }
        };
      })
      .catch(() => {
        /* bookkeeping only */
      });
  }

  /**
   * Ask the browser to make this origin's storage persistent.
   *
   * Without this, everything cached here is evictable: browsers clear an
   * origin's storage wholesale under pressure, so a user who downloaded a
   * module for a journey can lose all of it with no warning. Offline study is
   * a stated goal, so this is requested before the first bulk download.
   *
   * Returns the resulting persisted state. A false result is not an error -
   * some browsers grant persistence only after an engagement threshold, and
   * the app must keep working either way.
   */
  public async requestPersistentStorage(): Promise<boolean> {
    try {
      if (typeof navigator === "undefined" || !navigator.storage) return false;
      if (typeof navigator.storage.persisted === "function") {
        const already = await navigator.storage.persisted();
        if (already) return true;
      }
      if (typeof navigator.storage.persist === "function") {
        return await navigator.storage.persist();
      }
      return false;
    } catch (err) {
      console.warn("Persistent storage request failed:", err);
      return false;
    }
  }

  /** Whether persistent storage is currently granted. */
  public async isPersisted(): Promise<boolean> {
    try {
      if (typeof navigator === "undefined" || !navigator.storage?.persisted) return false;
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }

  /**
   * Size of the audio cache, overall and per module, plus the browser's own
   * quota estimate. Users cannot manage an offline library they cannot see.
   */
  public async getStorageStats(): Promise<StorageStats> {
    let quotaBytes: number | null = null;
    let usageBytes: number | null = null;
    try {
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        quotaBytes = estimate.quota ?? null;
        usageBytes = estimate.usage ?? null;
      }
    } catch {
      /* estimate is advisory */
    }

    const persisted = await this.isPersisted();
    const empty: StorageStats = {
      totalClips: 0,
      totalBytes: 0,
      perModule: [],
      quotaBytes,
      usageBytes,
      persisted,
    };

    try {
      const db = await this.getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], "readonly");
        const request = tx.objectStore(STORE_NAME).getAll();

        request.onsuccess = () => {
          const records: AudioRecord[] = request.result || [];
          const byModule = new Map<string, ModuleStorageStat>();
          let totalBytes = 0;

          for (const record of records) {
            const bytes = approximateBytes(record.audioBase64 || "");
            totalBytes += bytes;
            const stat = byModule.get(record.moduleId) || {
              moduleId: record.moduleId,
              clips: 0,
              bytes: 0,
              oldestAccess: Number.MAX_SAFE_INTEGER,
            };
            stat.clips += 1;
            stat.bytes += bytes;
            stat.oldestAccess = Math.min(
              stat.oldestAccess,
              record.lastAccessedAt ?? record.createdAt ?? 0
            );
            byModule.set(record.moduleId, stat);
          }

          resolve({
            totalClips: records.length,
            totalBytes,
            perModule: [...byModule.values()].sort((a, b) => b.bytes - a.bytes),
            quotaBytes,
            usageBytes,
            persisted,
          });
        };

        request.onerror = () => resolve(empty);
      });
    } catch (err) {
      console.warn("Failed to compute storage stats:", err);
      return empty;
    }
  }

  /**
   * Drop cached audio belonging to modules that no longer exist.
   *
   * Deleting a custom module leaves its clips behind; they are unreachable but
   * still consume the origin's quota, which brings eviction of everything else
   * closer.
   */
  public async pruneOrphans(knownModuleIds: string[]): Promise<number> {
    const known = new Set(knownModuleIds);
    try {
      const db = await this.getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        let removed = 0;

        request.onsuccess = () => {
          for (const record of (request.result || []) as AudioRecord[]) {
            if (!known.has(record.moduleId)) {
              store.delete(record.key);
              removed++;
            }
          }
        };

        tx.oncomplete = () => resolve(removed);
        tx.onerror = () => resolve(removed);
      });
    } catch (err) {
      console.warn("Failed to prune orphaned audio:", err);
      return 0;
    }
  }

  /**
   * Evict least-recently-used clips until the cache fits within maxBytes.
   *
   * Modules the user explicitly marked for offline use are never evicted:
   * automatic cleanup must not silently undo a deliberate download. If the
   * protected modules alone exceed the budget, nothing further is removed and
   * the caller is told how little was freed.
   */
  public async evictLeastRecentlyUsed(
    maxBytes: number,
    protectedModuleIds: string[] = []
  ): Promise<{ removedClips: number; freedBytes: number }> {
    const protectedIds = new Set(protectedModuleIds);
    try {
      const db = await this.getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        let removedClips = 0;
        let freedBytes = 0;

        request.onsuccess = () => {
          const records = ((request.result || []) as AudioRecord[]).map((r) => ({
            record: r,
            bytes: approximateBytes(r.audioBase64 || ""),
            access: r.lastAccessedAt ?? r.createdAt ?? 0,
          }));

          let total = records.reduce((sum, r) => sum + r.bytes, 0);
          if (total <= maxBytes) return;

          const evictable = records
            .filter((r) => !protectedIds.has(r.record.moduleId))
            .sort((a, b) => a.access - b.access); // oldest access first

          for (const candidate of evictable) {
            if (total <= maxBytes) break;
            store.delete(candidate.record.key);
            total -= candidate.bytes;
            freedBytes += candidate.bytes;
            removedClips++;
          }
        };

        tx.oncomplete = () => resolve({ removedClips, freedBytes });
        tx.onerror = () => resolve({ removedClips, freedBytes });
      });
    } catch (err) {
      console.warn("Eviction failed:", err);
      return { removedClips: 0, freedBytes: 0 };
    }
  }

  public async getCacheCount(): Promise<number> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }
}

export const audioStorage = new AudioStorageManager();

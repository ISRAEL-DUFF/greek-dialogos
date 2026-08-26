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

/**
 * Cache for Ask AI philological explanations (docs/FIX-PLAN.md D5, P1-7).
 *
 * Two reasons, and the second is the one users notice: previously-asked
 * questions stay readable offline, and nobody re-pays for an answer they
 * already received.
 *
 * Keyed by module id plus normalized question. Explanations are interpreted in
 * the context of a specific module, so a stored answer belongs to that module
 * and must be discarded when the module's text changes - see invalidateModule,
 * which the importer calls when a custom module is re-imported.
 */

const DB_NAME = "AncientGreekExplanationCacheDB";
const DB_VERSION = 1;
const STORE_NAME = "explanations";

export interface ExplanationRecord {
  key: string;
  moduleId: string;
  question: string;
  answer: string;
  provider: string;
  createdAt: number;
}

/** Collapse whitespace and case so trivially different phrasings share an entry. */
function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").toLowerCase();
}

function makeKey(moduleId: string, question: string): string {
  const normalized = normalizeQuestion(question);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `${moduleId}__q_${(hash >>> 0).toString(36)}`;
}

class ExplanationCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        return reject(new Error("IndexedDB is not supported in this browser"));
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("moduleId", "moduleId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  public async get(moduleId: string, question: string): Promise<ExplanationRecord | null> {
    try {
      const db = await this.getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], "readonly");
        const request = tx.objectStore(STORE_NAME).get(makeKey(moduleId, question));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  public async save(
    moduleId: string,
    question: string,
    answer: string,
    provider: string
  ): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction([STORE_NAME], "readwrite");
        tx.objectStore(STORE_NAME).put({
          key: makeKey(moduleId, question),
          moduleId,
          question: question.trim(),
          answer,
          provider,
          createdAt: Date.now(),
        } satisfies ExplanationRecord);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.warn("Could not cache explanation:", err);
    }
  }

  /**
   * Drop every cached answer for a module.
   *
   * Called when a custom module is re-imported: its text has changed, so
   * answers written against the old text are no longer about the same passage.
   */
  public async invalidateModule(moduleId: string): Promise<number> {
    try {
      const db = await this.getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.index("moduleId").openCursor(IDBKeyRange.only(moduleId));
        let removed = 0;
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            removed++;
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve(removed);
        tx.onerror = () => resolve(removed);
      });
    } catch {
      return 0;
    }
  }

  public async count(): Promise<number> {
    try {
      const db = await this.getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], "readonly");
        const request = tx.objectStore(STORE_NAME).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }
}

export const explanationCache = new ExplanationCache();

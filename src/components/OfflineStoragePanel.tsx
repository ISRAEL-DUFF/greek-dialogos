import React, { useCallback, useEffect, useState } from "react";
import { HardDrive, Trash2, ShieldCheck, ShieldAlert, RefreshCw, Loader2 } from "lucide-react";
import { AncientGreekModule } from "../types";
import { audioStorage, StorageStats } from "../utils/audioStorage";
import {
  formatBytes,
  getKeepOfflineIds,
  setKeptOffline,
  AUDIO_CACHE_BUDGET_BYTES,
} from "../utils/offlinePrefs";

interface OfflineStoragePanelProps {
  modules: AncientGreekModule[];
  currentModuleId: string;
  onStorageChanged?: () => void;
}

/**
 * Offline library management.
 *
 * Users cannot manage a downloaded library they cannot see: before this,
 * cached audio accumulated invisibly with no size readout, no way to remove a
 * single module's clips, and no indication of whether the browser considered
 * that storage durable.
 */
export const OfflineStoragePanel: React.FC<OfflineStoragePanelProps> = ({
  modules,
  currentModuleId,
  onStorageChanged,
}) => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [keepOffline, setKeepOfflineIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await audioStorage.getStorageStats());
      setKeepOfflineIds(getKeepOfflineIds());
    } catch (err) {
      console.warn("Could not read storage stats:", err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, currentModuleId]);

  const titleFor = (moduleId: string) =>
    modules.find((m) => m.id === moduleId)?.titleEn ||
    modules.find((m) => m.id === moduleId)?.title ||
    moduleId;

  const handleDeleteModuleAudio = async (moduleId: string) => {
    setBusy(moduleId);
    try {
      await audioStorage.deleteModuleAudio(moduleId);
      await refresh();
      onStorageChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const handleToggleKeep = (moduleId: string) => {
    setKeepOfflineIds(setKeptOffline(moduleId, !keepOffline.includes(moduleId)));
  };

  const handleRequestPersistence = async () => {
    setBusy("persist");
    try {
      await audioStorage.requestPersistentStorage();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!stats) return null;

  const budgetUsed = Math.min(100, Math.round((stats.totalBytes / AUDIO_CACHE_BUDGET_BYTES) * 100));

  return (
    <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E1D8] pb-2">
        <div className="flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5 text-[#8B7355]" />
          <span className="text-[10px] uppercase font-sans font-bold tracking-[0.2em] text-[#2D2A26]">
            Offline Library
          </span>
          <span className="text-[10px] font-mono text-[#5C564E]">
            {stats.totalClips} clips · {formatBytes(stats.totalBytes)}
            {stats.quotaBytes ? ` of ${formatBytes(stats.quotaBytes)} available` : ""}
          </span>
        </div>

        <button
          onClick={refresh}
          className="flex items-center gap-1 px-2 py-1 border border-[#E5E1D8] text-[10px] uppercase font-sans font-bold tracking-wider text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] cursor-pointer"
          title="Recalculate storage usage"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* Durability. Without persistence the browser may clear this origin's
          storage wholesale under pressure, losing every download at once. */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 border text-[10px] font-sans ${
          stats.persisted
            ? "border-[#2D2A26] bg-[#F7F5F0] text-[#2D2A26]"
            : "border-[#8B7355] bg-[#FBF7EF] text-[#5C564E]"
        }`}
      >
        <span className="flex items-center gap-1.5">
          {stats.persisted ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-[#8B7355]" />
              Storage is persistent — downloads survive browser cleanup.
            </>
          ) : (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-[#8B7355]" />
              Storage is not persistent — the browser may clear downloads when space runs low.
            </>
          )}
        </span>
        {!stats.persisted && (
          <button
            onClick={handleRequestPersistence}
            disabled={busy === "persist"}
            className="px-2 py-1 border border-[#2D2A26] uppercase font-bold tracking-wider hover:bg-[#2D2A26] hover:text-[#F7F5F0] cursor-pointer disabled:opacity-50"
          >
            {busy === "persist" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Request"}
          </button>
        )}
      </div>

      {/* Budget bar */}
      <div className="space-y-1">
        <div className="h-1.5 w-full bg-[#E5E1D8]">
          <div className="h-full bg-[#8B7355]" style={{ width: `${budgetUsed}%` }} />
        </div>
        <div className="text-[9px] font-mono text-[#5C564E]">
          {budgetUsed}% of the {formatBytes(AUDIO_CACHE_BUDGET_BYTES)} cache budget. Beyond it,
          least-recently-played clips are removed first — except modules kept offline.
        </div>
      </div>

      {stats.perModule.length === 0 ? (
        <p className="text-[10px] font-sans text-[#5C564E]">
          No audio downloaded yet. Use “Cache All Audio” to make a module playable offline.
        </p>
      ) : (
        <ul className="space-y-1">
          {stats.perModule.map((stat) => {
            const kept = keepOffline.includes(stat.moduleId);
            return (
              <li
                key={stat.moduleId}
                className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 border border-[#E5E1D8]"
              >
                <span className="text-[11px] font-sans text-[#2D2A26] truncate max-w-[45%]">
                  {titleFor(stat.moduleId)}
                </span>
                <span className="text-[10px] font-mono text-[#5C564E]">
                  {stat.clips} clips · {formatBytes(stat.bytes)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleKeep(stat.moduleId)}
                    className={`px-2 py-0.5 border text-[9px] uppercase font-sans font-bold tracking-wider cursor-pointer ${
                      kept
                        ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                        : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26]"
                    }`}
                    title={
                      kept
                        ? "Protected from automatic cleanup"
                        : "Protect this module's audio from automatic cleanup"
                    }
                  >
                    {kept ? "Kept offline" : "Keep offline"}
                  </button>
                  <button
                    onClick={() => handleDeleteModuleAudio(stat.moduleId)}
                    disabled={busy === stat.moduleId}
                    className="flex items-center gap-1 px-2 py-0.5 border border-[#E5E1D8] text-[9px] uppercase font-sans font-bold tracking-wider text-[#5C564E] hover:border-red-700 hover:text-red-800 cursor-pointer disabled:opacity-50"
                    title="Delete this module's downloaded audio"
                  >
                    {busy === stat.moduleId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

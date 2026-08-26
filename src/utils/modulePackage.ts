/**
 * Utilities for exporting and importing Ancient Greek study modules with full embedded audio clips.
 */

import { AncientGreekModule, ModuleExportPackage, LibraryExportPackage, CachedAudioExportItem } from "../types";
import { audioStorage } from "./audioStorage";

/**
 * Trigger download of a JSON object as a file in the user's browser
 */
export function downloadJsonFile(data: any, filename: string): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export a single module with all of its cached audio clips into a complete portable JSON package
 */
export async function exportModuleWithAudio(
  mod: AncientGreekModule,
  includeAudio = true
): Promise<ModuleExportPackage> {
  let audioMap: Record<number, CachedAudioExportItem> | undefined = undefined;

  if (includeAudio) {
    const rawAudioMap = await audioStorage.getModuleAudioMap(mod.id);
    const mapped: Record<number, CachedAudioExportItem> = {};

    for (const [lineIdStr, item] of Object.entries(rawAudioMap)) {
      const lineId = Number(lineIdStr);
      const line = mod.lines.find((l) => l.id === lineId);
      mapped[lineId] = {
        audioBase64: item.audioBase64,
        mimeType: item.mimeType,
        voice: item.voice,
        text: line?.greekText,
      };
    }

    if (Object.keys(mapped).length > 0) {
      audioMap = mapped;
    }
  }

  const pkg: ModuleExportPackage = {
    formatVersion: "2.0",
    packageType: "single-module",
    exportedAt: new Date().toISOString(),
    module: mod,
    audioMap,
  };

  return pkg;
}

/**
 * Export all custom / library modules and their cached audio clips
 */
export async function exportLibraryWithAudio(
  modules: AncientGreekModule[],
  includeAudio = true
): Promise<LibraryExportPackage> {
  const audioMaps: Record<string, Record<number, CachedAudioExportItem>> = {};

  if (includeAudio) {
    for (const mod of modules) {
      const rawAudioMap = await audioStorage.getModuleAudioMap(mod.id);
      if (Object.keys(rawAudioMap).length > 0) {
        audioMaps[mod.id] = rawAudioMap;
      }
    }
  }

  const pkg: LibraryExportPackage = {
    formatVersion: "2.0",
    packageType: "library-backup",
    exportedAt: new Date().toISOString(),
    modules,
    audioMaps: Object.keys(audioMaps).length > 0 ? audioMaps : undefined,
  };

  return pkg;
}

export interface ParsedImportResult {
  success: boolean;
  error?: string;
  type: "single" | "library" | "legacy";
  modules: AncientGreekModule[];
  totalAudioTracks: number;
  audioMaps: Record<string, Record<number, CachedAudioExportItem>>;
}

/**
 * Parse and validate an imported JSON string or object
 */
export function parseImportPayload(rawJson: string | object): ParsedImportResult {
  try {
    let parsed: any = rawJson;
    if (typeof rawJson === "string") {
      parsed = JSON.parse(rawJson);
    }

    if (!parsed || typeof parsed !== "object") {
      return { success: false, error: "Invalid JSON format: payload is not an object", type: "legacy", modules: [], totalAudioTracks: 0, audioMaps: {} };
    }

    // Case 1: Library Export Package
    if (parsed.packageType === "library-backup" && Array.isArray(parsed.modules)) {
      const validModules = parsed.modules.filter(isValidModuleStructure);
      if (validModules.length === 0) {
        return { success: false, error: "No valid module definitions found in library package", type: "library", modules: [], totalAudioTracks: 0, audioMaps: {} };
      }

      const audioMaps = parsed.audioMaps || {};
      let totalAudioTracks = 0;
      for (const mId of Object.keys(audioMaps)) {
        totalAudioTracks += Object.keys(audioMaps[mId] || {}).length;
      }

      return {
        success: true,
        type: "library",
        modules: validModules,
        totalAudioTracks,
        audioMaps,
      };
    }

    // Case 2: Single Module Export Package
    if (parsed.packageType === "single-module" && parsed.module && isValidModuleStructure(parsed.module)) {
      const mod = parsed.module as AncientGreekModule;
      const audioMap = parsed.audioMap || {};
      const totalAudioTracks = Object.keys(audioMap).length;

      return {
        success: true,
        type: "single",
        modules: [mod],
        totalAudioTracks,
        audioMaps: {
          [mod.id]: audioMap,
        },
      };
    }

    // Case 3: Array of raw modules
    if (Array.isArray(parsed)) {
      const validModules = parsed.filter(isValidModuleStructure);
      if (validModules.length === 0) {
        return { success: false, error: "Array does not contain valid Ancient Greek module objects", type: "legacy", modules: [], totalAudioTracks: 0, audioMaps: {} };
      }
      return {
        success: true,
        type: "library",
        modules: validModules,
        totalAudioTracks: 0,
        audioMaps: {},
      };
    }

    // Case 4: Single raw AncientGreekModule object
    if (isValidModuleStructure(parsed)) {
      const mod = parsed as AncientGreekModule;
      // Check if it has embedded audioMap even without package wrapper
      const audioMap = (parsed as any).audioMap || {};
      const totalAudioTracks = Object.keys(audioMap).length;

      return {
        success: true,
        type: "single",
        modules: [mod],
        totalAudioTracks,
        audioMaps: {
          [mod.id]: audioMap,
        },
      };
    }

    return {
      success: false,
      error: "JSON does not match a recognizable Ancient Greek module format (must have title, speakers, lines).",
      type: "legacy",
      modules: [],
      totalAudioTracks: 0,
      audioMaps: {},
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to parse JSON",
      type: "legacy",
      modules: [],
      totalAudioTracks: 0,
      audioMaps: {},
    };
  }
}

/**
 * Basic structural validation for AncientGreekModule
 */
function isValidModuleStructure(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.title !== "string" || !obj.title) return false;
  if (!Array.isArray(obj.lines) || obj.lines.length === 0) return false;
  
  // Check that lines have greekText and words
  const firstLine = obj.lines[0];
  if (!firstLine || typeof firstLine.greekText !== "string") return false;

  return true;
}

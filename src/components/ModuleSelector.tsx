import React, { useState } from "react";
import { BookOpen, Plus, Sparkles, Trash2, Check, ChevronDown, Layers, Feather, UserCheck, Flame, Download, HardDrive } from "lucide-react";
import { AncientGreekModule } from "../types";
import { BUILTIN_MODULES, deleteStoredCustomModule } from "../data/dialogueData";
import { audioStorage } from "../utils/audioStorage";

interface ModuleSelectorProps {
  currentModule: AncientGreekModule;
  customModules: AncientGreekModule[];
  onSelectModule: (mod: AncientGreekModule) => void;
  onOpenImporter: () => void;
  onCustomModulesChange: () => void;
  onExportModule?: (mod: AncientGreekModule) => void;
  onExportLibrary?: () => void;
}

export const ModuleSelector: React.FC<ModuleSelectorProps> = ({
  currentModule,
  customModules,
  onSelectModule,
  onOpenImporter,
  onCustomModulesChange,
  onExportModule,
  onExportLibrary,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const allModules = [...BUILTIN_MODULES, ...customModules];

  const handleDeleteModule = async (e: React.MouseEvent, moduleId: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to remove this custom module and its cached audio from your library?")) {
      deleteStoredCustomModule(moduleId);
      await audioStorage.deleteModuleAudio(moduleId);
      onCustomModulesChange();
      if (currentModule.id === moduleId) {
        onSelectModule(BUILTIN_MODULES[0]);
      }
    }
  };

  const getGenreIcon = (genre: string) => {
    switch (genre) {
      case "fable":
        return <Feather className="w-3.5 h-3.5 text-[#8B7355]" />;
      case "philosophy":
        return <Flame className="w-3.5 h-3.5 text-[#8B7355]" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-[#8B7355]" />;
    }
  };

  return (
    <div className="relative">
      
      {/* Selector Bar Header */}
      <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        {/* Current Active Module Overview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.25em] flex items-center gap-1.5">
              {getGenreIcon(currentModule.genre)}
              <span>Active Study Module • {currentModule.genre.toUpperCase()}</span>
            </span>
            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 border border-[#E5E1D8] bg-[#F7F5F0] text-[#5C564E]">
              {currentModule.difficulty}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-serif text-[#2D2A26] font-normal truncate">
            {currentModule.title}
          </h2>
          <p className="text-xs font-serif italic text-[#5C564E] truncate mt-0.5">
            {currentModule.titleEn} • {currentModule.author}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            id="btn-switch-module-dropdown"
            onClick={() => setIsOpen(!isOpen)}
            className="flex-1 sm:flex-none flex items-center justify-between sm:justify-start gap-2 px-3.5 py-2 border border-[#2D2A26] bg-[#F7F5F0] hover:bg-[#FFFFFF] text-[#2D2A26] text-xs uppercase font-sans font-bold tracking-wider transition-all cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Library ({allModules.length})</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>

          <button
            id="btn-open-importer"
            onClick={onOpenImporter}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2D2A26] text-[#F7F5F0] border border-[#2D2A26] text-xs uppercase font-sans font-bold tracking-wider hover:bg-[#8B7355] transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Import / AI</span>
          </button>
        </div>

      </div>

      {/* Expanded Library Drawer / Dropdown */}
      {isOpen && (
        <div className="absolute z-20 top-full left-0 right-0 mt-2 bg-[#FFFFFF] border-2 border-[#2D2A26] shadow-xl p-4 sm:p-5 space-y-4 animate-in fade-in duration-150">
          
          <div className="flex items-center justify-between pb-3 border-b border-[#E5E1D8]">
            <div>
              <h3 className="text-sm font-serif font-bold text-[#2D2A26]">
                Manuscript & Module Library
              </h3>
              <p className="text-[11px] font-sans text-[#5C564E]">
                Select a classical dialogue, fable, speech, or AI-generated text to study with interactive audio.
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[10px] uppercase font-sans font-bold text-[#5C564E] hover:text-[#2D2A26] cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
            {allModules.map((mod) => {
              const isSelected = mod.id === currentModule.id;
              const isCustom = !BUILTIN_MODULES.some((b) => b.id === mod.id);

              return (
                <div
                  key={mod.id}
                  onClick={() => {
                    onSelectModule(mod);
                    setIsOpen(false);
                  }}
                  className={`p-3.5 border-2 text-left transition-all cursor-pointer flex flex-col justify-between relative group ${
                    isSelected
                      ? "border-[#2D2A26] bg-[#F7F5F0]"
                      : "border-[#E5E1D8] bg-[#FFFFFF] hover:border-[#2D2A26]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 border border-[#2D2A26] bg-[#FFFFFF] text-[#2D2A26]">
                          {mod.genre}
                        </span>
                        {isCustom && (
                          <span className="text-[9px] uppercase font-sans font-bold px-1.5 py-0.5 bg-[#8B7355] text-[#F7F5F0]">
                            Custom
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[#5C564E]">
                        {mod.lines.length} lines • {mod.difficulty}
                      </span>
                    </div>

                    <h4 className="text-sm font-serif font-bold text-[#2D2A26] mt-1 line-clamp-1">
                      {mod.title}
                    </h4>
                    <p className="text-xs font-serif italic text-[#5C564E] line-clamp-1">
                      {mod.titleEn}
                    </p>
                    <p className="text-[11px] font-sans text-[#5C564E] mt-1.5 line-clamp-2 leading-relaxed">
                      {mod.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-[#E5E1D8]/80 text-[10px] font-sans">
                    <span className="text-[#8B7355] font-semibold truncate max-w-[130px]">
                      {mod.speakers.map((s) => s.nameEn).join(" & ")}
                    </span>
                    
                    <div className="flex items-center gap-1.5">
                      {onExportModule && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportModule(mod);
                          }}
                          title="Export Module with Audio (.json)"
                          className="p-1 text-[#5C564E] hover:text-[#2D2A26] hover:bg-[#E5E1D8] transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isCustom && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteModule(e, mod.id)}
                          title="Delete Custom Module"
                          className="p-1 text-red-700 hover:text-red-950 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isSelected ? (
                        <span className="flex items-center gap-1 text-[#2D2A26] font-bold">
                          <Check className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="text-[#5C564E] group-hover:text-[#2D2A26] uppercase font-bold tracking-wider">
                          Select →
                        </span>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#E5E1D8] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {onExportLibrary && (
                <button
                  type="button"
                  onClick={() => onExportLibrary()}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[#8B7355] bg-[#F7F5F0] text-[11px] font-sans font-bold uppercase tracking-wider text-[#2D2A26] hover:bg-[#8B7355] hover:text-[#F7F5F0] transition-all cursor-pointer"
                  title="Export all builtin and custom modules with all cached audio into a backup JSON file"
                >
                  <Download className="w-3 h-3 text-[#8B7355]" />
                  <span>Backup Full Library (.json)</span>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                onOpenImporter();
                setIsOpen(false);
              }}
              className="flex items-center gap-1 px-3.5 py-1.5 bg-[#2D2A26] text-[#F7F5F0] text-xs font-sans font-bold uppercase tracking-wider hover:bg-[#8B7355] transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Import / Generate Text</span>
            </button>
          </div>

        </div>
      )}

    </div>
  );
};

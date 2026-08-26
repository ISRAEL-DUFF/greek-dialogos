import React, { useState } from "react";
import { X, Volume2, BookOpen } from "lucide-react";
import { WordGloss, DialogueLine } from "../types";

interface WordGlossModalProps {
  word: WordGloss | null;
  line: DialogueLine | null;
  onClose: () => void;
  onPlayWordTTS: (word: string) => Promise<void>;
}

export const WordGlossModal: React.FC<WordGlossModalProps> = ({
  word,
  line,
  onClose,
  onPlayWordTTS,
}) => {
  const [isPlayingWord, setIsPlayingWord] = useState(false);

  if (!word || !line) return null;

  const handlePlay = async () => {
    try {
      setIsPlayingWord(true);
      await onPlayWordTTS(word.greek);
    } catch (err) {
      console.error(err);
    } finally {
      setIsPlayingWord(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2A26]/70 backdrop-blur-xs">
      <div className="bg-[#FFFFFF] max-w-lg w-full border-2 border-[#2D2A26] shadow-none overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#2D2A26] text-[#F7F5F0] px-6 py-4 flex items-center justify-between border-b border-[#2D2A26]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-[#8B7355] text-[#F7F5F0] text-xs font-serif font-bold flex items-center justify-center">
              Ω
            </span>
            <h3 className="font-serif font-normal text-base tracking-wide uppercase">
              Morphological Analysis
            </h3>
          </div>
          <button
            id="close-word-modal"
            onClick={onClose}
            className="text-[#E5E1D8] hover:text-[#FFFFFF] p-1 border border-transparent hover:border-[#8B7355] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 font-sans">
          
          {/* Main Word Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E1D8]">
            <div>
              <div className="text-3xl font-serif font-normal text-[#2D2A26] tracking-wide">
                {word.greek}
              </div>
              <div className="text-xs font-mono text-[#5C564E] mt-0.5">
                Pronunciation: <span className="font-bold text-[#8B7355]">{word.transliteration}</span>
              </div>
            </div>

            <button
              id="btn-modal-tts-word"
              onClick={handlePlay}
              disabled={isPlayingWord}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] text-[10px] uppercase tracking-widest font-sans font-bold hover:bg-transparent hover:text-[#2D2A26] transition-all cursor-pointer disabled:opacity-50"
            >
              {isPlayingWord ? (
                <span className="w-3 h-3 border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span>{isPlayingWord ? "Pronouncing..." : "Pronounce"}</span>
            </button>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            
            {/* Lemma / Root */}
            <div className="p-3 bg-[#F7F5F0] border border-[#E5E1D8]">
              <span className="text-[9px] font-bold text-[#8B7355] uppercase tracking-[0.25em] block">
                Dictionary Headword (Lemma)
              </span>
              <span className="text-sm font-serif font-bold text-[#2D2A26] mt-1 block">
                {word.root}
              </span>
            </div>

            {/* Part of Speech */}
            <div className="p-3 bg-[#F7F5F0] border border-[#E5E1D8]">
              <span className="text-[9px] font-bold text-[#8B7355] uppercase tracking-[0.25em] block">
                Part of Speech
              </span>
              <span className="text-xs font-sans font-semibold text-[#2D2A26] mt-1 block uppercase tracking-wider">
                {word.partOfSpeech}
              </span>
            </div>

          </div>

          {/* Definition */}
          <div className="p-3.5 bg-[#F7F5F0] border border-[#E5E1D8]">
            <span className="text-[9px] font-bold text-[#8B7355] uppercase tracking-[0.25em] block mb-1">
              Contextual Definition & Meaning
            </span>
            <p className="text-[#2D2A26] font-serif text-sm leading-relaxed">
              {word.meaning}
            </p>
          </div>

          {/* Grammatical Breakdown */}
          <div className="p-3.5 bg-[#FAFAF7] border border-[#E5E1D8]">
            <span className="text-[9px] font-bold text-[#5C564E] uppercase tracking-[0.25em] block mb-1">
              Inflection & Syntactic Role
            </span>
            <p className="text-[#5C564E] text-xs font-sans leading-relaxed">
              {word.grammarDetails}
            </p>
          </div>

          {/* Source Line Context */}
          <div className="pt-2 text-[11px] font-sans text-[#5C564E] flex items-center justify-between border-t border-[#E5E1D8]">
            <span>Speaker: <strong className="text-[#2D2A26]">{line.speaker}</strong></span>
            <span className="font-mono text-[10px]">Manuscript Line #{line.id}</span>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-[#F7F5F0] px-6 py-3 border-t border-[#E5E1D8] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] text-[10px] uppercase tracking-widest font-sans font-bold hover:bg-transparent hover:text-[#2D2A26] transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
};

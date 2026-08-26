import React, { useState } from "react";
import { AncientGreekModule, SyntaxPoint, PhilologicalNote } from "../types";
import { 
  BookOpen, 
  Landmark, 
  Sparkles, 
  Layers, 
  Volume2, 
  Quote, 
  HelpCircle, 
  ChevronRight, 
  Send, 
  Loader2, 
  Info,
  CheckCircle2,
  FileText
} from "lucide-react";

interface LinguisticNotesProps {
  currentModule: AncientGreekModule;
}

type SubTab = "context" | "syntax" | "commentary" | "phonology" | "ask-ai";

export const LinguisticNotes: React.FC<LinguisticNotesProps> = ({ currentModule }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("context");
  
  // Interactive AI Philological Inquiry State
  const [inquiryText, setInquiryText] = useState("");
  const [inquiryResponse, setInquiryResponse] = useState<string | null>(null);
  const [isLoadingInquiry, setIsLoadingInquiry] = useState(false);

  const commentary = currentModule.commentary;
  const historical = commentary?.historicalContext;
  const syntaxPoints = commentary?.grammaticalSyntax || [];
  const philologicalNotes = commentary?.philologicalNotes || [];
  const dialectNotes = commentary?.dialectNotes || "Classical Attic Greek standard prose (5th–4th century BCE).";

  const handleAskAI = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inquiryText.trim() || isLoadingInquiry) return;

    setIsLoadingInquiry(true);
    setInquiryResponse(null);

    try {
      const res = await fetch("/api/gemini/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phrase: `[Text: ${currentModule.title} / Ref: ${currentModule.stephanusRef || "Standard"}] ${inquiryText.trim()}`,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to consult Gemini Philologist");
      }

      const data = await res.json();
      setInquiryResponse(data.text);
    } catch (err: any) {
      setInquiryResponse(`Error: ${err?.message || "Could not retrieve philological response."}`);
    } finally {
      setIsLoadingInquiry(false);
    }
  };

  const setSampleQuery = (text: string) => {
    setInquiryText(text);
    setActiveSubTab("ask-ai");
  };

  return (
    <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-6 shadow-none space-y-6">
      
      {/* Module Overview Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E5E1D8]">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.25em]">
              Philological & Syntactic Apparatus
            </span>
            <span className="text-[#E5E1D8]">•</span>
            <span className="px-2 py-0.5 bg-[#F7F5F0] border border-[#E5E1D8] text-[9px] font-mono font-bold uppercase text-[#2D2A26]">
              {currentModule.genre}
            </span>
            <span className="px-2 py-0.5 bg-[#F7F5F0] border border-[#E5E1D8] text-[9px] font-mono font-bold uppercase text-[#8B7355]">
              {currentModule.difficulty}
            </span>
            {currentModule.stephanusRef && (
              <span className="text-[10px] font-mono text-[#5C564E] bg-[#F7F5F0] px-2 py-0.5 border border-[#E5E1D8]">
                {currentModule.stephanusRef}
              </span>
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif text-[#2D2A26] leading-tight">
            {currentModule.title}
          </h2>
          <p className="text-xs text-[#5C564E] font-sans mt-1">
            {currentModule.titleEn} {currentModule.author ? `— ${currentModule.author}` : ""}
          </p>
        </div>

        {/* Quick Query CTA */}
        <button
          onClick={() => setActiveSubTab("ask-ai")}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2D2A26] bg-[#F7F5F0] text-[#2D2A26] text-xs font-sans font-bold uppercase tracking-wider hover:bg-[#2D2A26] hover:text-[#F7F5F0] transition-all cursor-pointer self-start lg:self-center"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#8B7355]" />
          <span>Ask AI Philologist</span>
        </button>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-[#E5E1D8] pb-3 text-xs font-sans font-bold uppercase tracking-wider">
        <button
          onClick={() => setActiveSubTab("context")}
          className={`flex items-center gap-1.5 px-3.5 py-2 border transition-all cursor-pointer ${
            activeSubTab === "context"
              ? "bg-[#2D2A26] text-[#F7F5F0] border-[#2D2A26]"
              : "bg-[#F7F5F0] text-[#5C564E] border-[#E5E1D8] hover:border-[#2D2A26] hover:text-[#2D2A26]"
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Historical Context</span>
        </button>

        <button
          onClick={() => setActiveSubTab("syntax")}
          className={`flex items-center gap-1.5 px-3.5 py-2 border transition-all cursor-pointer ${
            activeSubTab === "syntax"
              ? "bg-[#2D2A26] text-[#F7F5F0] border-[#2D2A26]"
              : "bg-[#F7F5F0] text-[#5C564E] border-[#E5E1D8] hover:border-[#2D2A26] hover:text-[#2D2A26]"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Grammatical Syntax ({syntaxPoints.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("commentary")}
          className={`flex items-center gap-1.5 px-3.5 py-2 border transition-all cursor-pointer ${
            activeSubTab === "commentary"
              ? "bg-[#2D2A26] text-[#F7F5F0] border-[#2D2A26]"
              : "bg-[#F7F5F0] text-[#5C564E] border-[#E5E1D8] hover:border-[#2D2A26] hover:text-[#2D2A26]"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Philological Notes ({philologicalNotes.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("phonology")}
          className={`flex items-center gap-1.5 px-3.5 py-2 border transition-all cursor-pointer ${
            activeSubTab === "phonology"
              ? "bg-[#2D2A26] text-[#F7F5F0] border-[#2D2A26]"
              : "bg-[#F7F5F0] text-[#5C564E] border-[#E5E1D8] hover:border-[#2D2A26] hover:text-[#2D2A26]"
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Reconstructed Phonetics</span>
        </button>

        <button
          onClick={() => setActiveSubTab("ask-ai")}
          className={`flex items-center gap-1.5 px-3.5 py-2 border transition-all cursor-pointer ${
            activeSubTab === "ask-ai"
              ? "bg-[#8B7355] text-[#F7F5F0] border-[#8B7355]"
              : "bg-[#F7F5F0] text-[#8B7355] border-[#E5E1D8] hover:border-[#8B7355]"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Inquiry</span>
        </button>
      </div>

      {/* TAB 1: HISTORICAL & CULTURAL CONTEXT */}
      {activeSubTab === "context" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Setting & Period */}
            <div className="p-5 bg-[#F7F5F0] border border-[#E5E1D8] space-y-2.5">
              <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                Chronology & Setting
              </span>
              <h3 className="font-serif text-[#2D2A26] text-lg">
                {historical?.period || "Classical Antiquity"}
              </h3>
              <p className="text-xs text-[#5C564E] leading-relaxed">
                {historical?.historicalSetting || currentModule.description}
              </p>
            </div>

            {/* Authorial Background */}
            <div className="p-5 bg-[#F7F5F0] border border-[#E5E1D8] space-y-2.5">
              <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                Authorial & Literary Provenance
              </span>
              <h3 className="font-serif text-[#2D2A26] text-lg">
                {currentModule.author || "Traditional Literary Transmission"}
              </h3>
              <p className="text-xs text-[#5C564E] leading-relaxed">
                {historical?.authorialBackground || "Transmitted through the Hellenic manuscript tradition and modern critical editions."}
              </p>
            </div>

            {/* Cultural & Philosophical Significance */}
            <div className="p-5 bg-[#F7F5F0] border border-[#E5E1D8] space-y-2.5 md:col-span-2">
              <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                Civic, Cultural & Philosophical Significance
              </span>
              <p className="text-xs text-[#2D2A26] leading-relaxed">
                {historical?.culturalSignificance || currentModule.description}
              </p>
              
              {historical?.stephanusOrBekkerNote && (
                <div className="mt-3 pt-3 border-t border-[#E5E1D8] flex items-start gap-2 text-[11px] text-[#5C564E] font-mono">
                  <Info className="w-4 h-4 text-[#8B7355] shrink-0 mt-0.5" />
                  <span><strong>Citation Apparatus:</strong> {historical.stephanusOrBekkerNote}</span>
                </div>
              )}
            </div>

            {/* Dialect Summary Card */}
            <div className="p-5 bg-[#FAFAF7] border-2 border-[#2D2A26] md:col-span-2 space-y-2">
              <span className="text-[10px] uppercase font-sans font-bold text-[#2D2A26] tracking-widest block">
                Dialectal Characteristics of this Passage
              </span>
              <p className="text-xs text-[#5C564E] leading-relaxed font-sans">
                {dialectNotes}
              </p>
            </div>

          </div>
        </div>
      )}

      {/* TAB 2: GRAMMATICAL SYNTAX */}
      {activeSubTab === "syntax" && (
        <div className="space-y-4 animate-fadeIn">
          {syntaxPoints.length === 0 ? (
            <div className="p-8 text-center bg-[#F7F5F0] border border-[#E5E1D8] space-y-3">
              <p className="text-xs text-[#5C564E] font-sans">
                No custom syntax points were bundled with this module. Use the AI Philologist to generate instant grammatical breakdowns.
              </p>
              <button
                onClick={() => setSampleQuery(`Analyze the grammatical syntax and main clauses of ${currentModule.title}`)}
                className="px-4 py-2 bg-[#2D2A26] text-[#F7F5F0] text-xs font-sans font-bold uppercase tracking-wider"
              >
                Analyze Syntax with AI
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {syntaxPoints.map((pt, idx) => (
                <div 
                  key={idx} 
                  className="p-4 bg-[#F7F5F0] border border-[#E5E1D8] hover:border-[#2D2A26] transition-all space-y-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-[#2D2A26] text-[#F7F5F0] flex items-center justify-center font-mono font-bold text-[10px]">
                      0{idx + 1}
                    </span>
                    <h3 className="font-serif text-[#2D2A26] text-base font-normal">
                      {pt.title}
                    </h3>
                  </div>

                  {/* Greek Example */}
                  <div className="p-2.5 bg-[#FFFFFF] border border-[#E5E1D8] space-y-1">
                    <div className="font-serif text-[#2D2A26] text-base font-medium">
                      «{pt.greekExample}»
                    </div>
                    {pt.transliteration && (
                      <div className="text-[11px] font-mono text-[#8B7355]">
                        {pt.transliteration}
                      </div>
                    )}
                  </div>

                  {/* Explanation */}
                  <p className="text-xs text-[#5C564E] leading-relaxed">
                    {pt.explanation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PHILOLOGICAL COMMENTARY */}
      {activeSubTab === "commentary" && (
        <div className="space-y-4 animate-fadeIn">
          {philologicalNotes.length === 0 ? (
            <div className="p-8 text-center bg-[#F7F5F0] border border-[#E5E1D8] space-y-3">
              <p className="text-xs text-[#5C564E] font-sans">
                No custom philological notes found for this module.
              </p>
              <button
                onClick={() => setSampleQuery(`Provide philological and rhetorical commentary on the key terms in ${currentModule.title}`)}
                className="px-4 py-2 bg-[#2D2A26] text-[#F7F5F0] text-xs font-sans font-bold uppercase tracking-wider"
              >
                Generate Philological Commentary with AI
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {philologicalNotes.map((note, idx) => (
                <div 
                  key={idx} 
                  className="p-4 bg-[#F7F5F0] border border-[#E5E1D8] hover:border-[#2D2A26] transition-all space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E1D8] pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-[#2D2A26] text-base font-bold">
                        {note.greekTerm}
                      </span>
                      {note.citation && (
                        <span className="text-[10px] font-mono text-[#5C564E] bg-[#FFFFFF] px-2 py-0.5 border border-[#E5E1D8]">
                          {note.citation}
                        </span>
                      )}
                    </div>
                    {note.rhetoricalDevice && (
                      <span className="px-2 py-0.5 bg-[#8B7355] text-[#F7F5F0] text-[9px] font-sans font-bold uppercase tracking-wider">
                        {note.rhetoricalDevice}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#5C564E] leading-relaxed font-sans">
                    {note.commentary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: RECONSTRUCTED ATTIC PHONOLOGY */}
      {activeSubTab === "phonology" && (
        <div className="space-y-5 animate-fadeIn">
          <div className="p-4 bg-[#F7F5F0] border-2 border-[#2D2A26] space-y-3">
            <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 bg-[#2D2A26] text-[#F7F5F0] flex items-center justify-center font-mono font-bold text-[10px]">
                  Ω
                </span>
                <h3 className="font-serif text-[#2D2A26] text-base font-normal">
                  Reconstructed Attic / Erasmian Pronunciation Standards
                </h3>
              </div>
              <span className="px-2 py-0.5 bg-[#8B7355] text-[#F7F5F0] font-mono text-[9px] font-bold uppercase">
                TTS Phonetic Engine
              </span>
            </div>
            
            <p className="text-xs text-[#5C564E] leading-relaxed font-sans">
              To bypass Modern Greek sound shifts (iotacism, fricativization of voiced stops), our speech engine transforms polytonic Ancient Greek into specialized Latin phonetic cues prior to Gemini 3.1 Flash audio synthesis:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="p-3 bg-[#FFFFFF] border border-[#E5E1D8] space-y-1">
                <span className="text-[10px] font-bold uppercase font-sans text-[#8B7355] block">
                  1. Diphthongs
                </span>
                <ul className="space-y-1 text-[11px] font-mono text-[#2D2A26]">
                  <li>αι → <span className="font-bold text-[#8B7355]">ai</span> (eye)</li>
                  <li>ει → <span className="font-bold text-[#8B7355]">ei</span> (ay)</li>
                  <li>οι → <span className="font-bold text-[#8B7355]">oi</span> (oil)</li>
                  <li>ου → <span className="font-bold text-[#8B7355]">ou</span> (boot)</li>
                  <li>αυ/ευ → <span className="font-bold text-[#8B7355]">au / eu</span></li>
                </ul>
              </div>

              <div className="p-3 bg-[#FFFFFF] border border-[#E5E1D8] space-y-1">
                <span className="text-[10px] font-bold uppercase font-sans text-[#8B7355] block">
                  2. Open Vowels
                </span>
                <ul className="space-y-1 text-[11px] font-mono text-[#2D2A26]">
                  <li>η → <span className="font-bold text-[#8B7355]">eh</span> (air/ate)</li>
                  <li>ω → <span className="font-bold text-[#8B7355]">oh</span> (boat)</li>
                  <li>υ → <span className="font-bold text-[#8B7355]">u</span> (pure /u/ or /y/)</li>
                  <li>α, ε, ι, ο preserved</li>
                </ul>
              </div>

              <div className="p-3 bg-[#FFFFFF] border border-[#E5E1D8] space-y-1">
                <span className="text-[10px] font-bold uppercase font-sans text-[#8B7355] block">
                  3. Hard Plosives
                </span>
                <ul className="space-y-1 text-[11px] font-mono text-[#2D2A26]">
                  <li>β → <span className="font-bold text-[#8B7355]">b</span> (not modern 'v')</li>
                  <li>γ → <span className="font-bold text-[#8B7355]">g</span> (not modern 'gh')</li>
                  <li>δ → <span className="font-bold text-[#8B7355]">d</span> (not modern 'th')</li>
                  <li>ζ → <span className="font-bold text-[#8B7355]">zd</span> (cluster)</li>
                </ul>
              </div>

              <div className="p-3 bg-[#FFFFFF] border border-[#E5E1D8] space-y-1">
                <span className="text-[10px] font-bold uppercase font-sans text-[#8B7355] block">
                  4. Aspirates
                </span>
                <ul className="space-y-1 text-[11px] font-mono text-[#2D2A26]">
                  <li>Rough ( ̔ ) → <span className="font-bold text-[#8B7355]">h-</span> (ἵνα→hina)</li>
                  <li>θ → <span className="font-bold text-[#8B7355]">th</span> (t + h)</li>
                  <li>φ → <span className="font-bold text-[#8B7355]">ph</span> (p + h)</li>
                  <li>χ → <span className="font-bold text-[#8B7355]">kh</span> (k + h)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INTERACTIVE AI PHILOLOGICAL INQUIRY */}
      {activeSubTab === "ask-ai" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="p-4 bg-[#F7F5F0] border border-[#E5E1D8] space-y-3">
            <div>
              <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                Interactive Socratic & Philological Consult
              </span>
              <h3 className="font-serif text-[#2D2A26] text-lg">
                Ask Gemini Hellenist about this text
              </h3>
              <p className="text-xs text-[#5C564E] font-sans mt-0.5">
                Inquire about complex syntactic clauses, particle nuance (*γοῦν*, *καίτοι*, *δή*), historical background, or LSJ dictionary etymologies for <strong>{currentModule.title}</strong>.
              </p>
            </div>

            {/* Sample query pills */}
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-[10px] font-mono font-bold text-[#5C564E] self-center">Prompt ideas:</span>
              <button
                type="button"
                onClick={() => setInquiryText("Explain the difference between knowledge and opinion in this text.")}
                className="text-[10px] font-mono px-2 py-0.5 bg-[#FFFFFF] border border-[#E5E1D8] text-[#2D2A26] hover:border-[#2D2A26] cursor-pointer"
              >
                Knowledge vs Opinion
              </button>
              <button
                type="button"
                onClick={() => setInquiryText("Parse the grammatical syntax and mood of the verbs in line 1.")}
                className="text-[10px] font-mono px-2 py-0.5 bg-[#FFFFFF] border border-[#E5E1D8] text-[#2D2A26] hover:border-[#2D2A26] cursor-pointer"
              >
                Line 1 Verb Parsing
              </button>
              <button
                type="button"
                onClick={() => setInquiryText("What rhetorical device is being employed in the address to the listeners?")}
                className="text-[10px] font-mono px-2 py-0.5 bg-[#FFFFFF] border border-[#E5E1D8] text-[#2D2A26] hover:border-[#2D2A26] cursor-pointer"
              >
                Rhetorical Address
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleAskAI} className="flex gap-2 pt-2">
              <input
                type="text"
                value={inquiryText}
                onChange={(e) => setInquiryText(e.target.value)}
                placeholder="e.g., Explain the use of the optative or why the vocative is used here..."
                className="flex-1 px-3 py-2 bg-[#FFFFFF] border border-[#2D2A26] text-xs font-sans focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoadingInquiry || !inquiryText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#2D2A26] text-[#F7F5F0] text-xs font-sans font-bold uppercase tracking-wider hover:bg-[#8B7355] transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoadingInquiry ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Consult</span>
                  </>
                )}
              </button>
            </form>

            {/* Inquiry Output */}
            {inquiryResponse && (
              <div className="mt-4 p-4 bg-[#FFFFFF] border-2 border-[#2D2A26] space-y-2">
                <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase text-[#8B7355]">
                    Gemini Philological Analysis
                  </span>
                  <span className="text-[10px] font-mono text-[#5C564E]">
                    Ref: {currentModule.title}
                  </span>
                </div>
                <div className="text-xs text-[#2D2A26] leading-relaxed whitespace-pre-line font-sans">
                  {inquiryResponse}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

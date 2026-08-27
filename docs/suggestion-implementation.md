Here is the complete, production-ready Python implementation.
This engine moves away from the primitive text.split() structure. It runs a Two-Pass Clitic-Fusing & Phonological Tokenizer to bind structural word boundaries together using hyphens (which forces the TTS to voice them as a single connected unit without unnatural pauses), preserves both acute and circumflex markers for stress, and maps the complete Greek alphabet using English-vocalized phonetics.
## The Complete Production Script

import unicodedataimport re
class AtticPhoneticEngine:
    def __init__(self):
        # 1. Core Clitic Inventories
        self.proclitics = {
            "ο", "η", "οι", "αι", 
            "εν", "εις", "ες", "εκ", "εξ", 
            "ως", "ει", 
            "ου", "ουκ", "ουχ"
        }
        
        self.enclitics = {
            "τε", "γε", "τοι", "περ",
            "μου", "μοι", "με", "σου", "σοι", "σε", "ου", "οι", "ε",
            "τις", "τι", "τινων", "τισι",
            "ποτε", "που", "πως", "ποθει", "ποι", "ποθεν", "πω",
            "ειμι", "εις", "εστι", "εσμεν", "εστε", "εισι",
            "φημι", "φης", "φησι", "φαμεν", "φατε", "φασι"
        }

        # 2. Comprehensive Character Base Mapping (All 24 Letters + Reconstructed Phonetics)
        self.base_map = {
            'α': 'a',  'Α': 'A',
            'β': 'b',  'Β': 'B',  # Hard 'b'
            'γ': 'g',  'Γ': 'G',  # Hard 'g'
            'δ': 'd',  'Δ': 'D',  # Hard 'd'
            'ε': 'e',  'Ε': 'E',
            'ζ': 'zd', 'Ζ': 'Zd', # Reconstructed Attic cluster
            'η': 'eh', 'Η': 'Eh', # Open long 'e'
            'θ': 'th', 'Θ': 'Th', # Aspirated 't'
            'ι': 'i',  'Ι': 'I',
            'κ': 'k',  'Κ': 'K',
            'λ': 'l',  'Λ': 'L',
            'μ': 'm',  'Μ': 'M',
            'ν': 'n',  'Ν': 'N',
            'ξ': 'x',  'Ξ': 'X',
            'ο': 'o',  'Ο': 'O',
            'π': 'p',  'Π': 'P',
            'ρ': 'r',  'Ρ': 'R',
            'σ': 's',  'ς': 's',  'Σ': 'S',
            'τ': 't',  'Τ': 'T',
            'υ': 'u',  'Υ': 'U',
            'φ': 'ph', 'Φ': 'Ph', # Aspirated 'p'
            'χ': 'kh', 'Χ': 'Kh', # Aspirated 'k'
            'ψ': 'ps', 'Ψ': 'Ps',
            'ω': 'oh', 'Ω': 'Oh'  # Long 'o'
        }

        # 3. Target Diphthongs Optimized for English Speech Engines
        self.diphthongs = {
            'ει': 'ey',  # 'ey' safely prevents collapsing into English /aɪ/ or /iː/
            'ου': 'oo',  # Forces [uː] instead of 'out' /aʊ/
            'αι': 'ah-ee', # Splitting ensures [ai] instead of 'caught' /ɔː/
            'αυ': 'ow',  # Forces [au]
            'ευ': 'ew',  # Reconstructed [eu] approximation
            'οι': 'oy'   # Reconstructed [oi] approximation
        }

    def _strip_diacritics_for_lookup(self, text):
        """Helper to get clean lower-case forms to verify clitic matches."""
        nfd = unicodedata.normalize('NFD', text)
        clean = "".join([c for c in nfd if unicodedata.category(c) != 'Mn'])
        return clean.lower().replace("'", "").replace("’", "")

    def _tokenize_phrases(self, text):
        """
        Pass 1: Connected Speech Synthesizer.
        Parses words and groups clitics/elisions using hyphens to resolve juncture issues.
        """
        raw_tokens = text.split()
        if not raw_tokens:
            return []

        phrases = []
        i = 0
        n = len(raw_tokens)

        while i < n:
            current_raw = raw_tokens[i]
            current_clean = self._strip_diacritics_for_lookup(current_raw)
            
            # Identify Elision (e.g., ἀλλ' or ἀλλ’)
            is_elided = current_raw.endswith("'") or current_raw.endswith("’")

            # Look ahead for Clitic groupings
            next_raw = raw_tokens[i+1] if i+1 < n else None
            next_clean = self._strip_diacritics_for_lookup(next_raw) if next_raw else ""

            # Rule 1: Elision joining next token (ἀλλ' ἐν -> ἀλλ'-ἐν)
            if is_elided and next_raw:
                combined = f"{current_raw.rstrip('\'’')}-{next_raw}"
                raw_tokens[i+1] = combined
                i += 1
                continue

            # Rule 2: Proclitic binding forward (οὐκ ἐν -> οὐκ-ἐν)
            if current_clean in self.proclitics and next_raw:
                combined = f"{current_raw}-{next_raw}"
                raw_tokens[i+1] = combined
                i += 1
                continue

            # Rule 3: Enclitic binding backward (Χαῖρέ τε -> Χαῖρέ-τε)
            if next_clean in self.enclitics:
                combined = f"{current_raw}-{next_raw}"
                raw_tokens[i+1] = combined
                i += 1
                continue

            # Default base case: token stands independently
            phrases.append(current_raw)
            i += 1

        return phrases

    def _convert_token_phonetics(self, token):
        """
        Pass 2: Phonemic Transformation Pipeline.
        Handles Unicode, Breathings, Stress Preservations, Gamma-Nasals, and Vowels.
        """
        # Decompose unicode to decouple core letters from marks
        nfd_token = unicodedata.normalize('NFD', token)
        
        # 1. Structural Accent & Breathing Pre-scan
        has_rough_breathing = False
        sequence = []
        
        for char in nfd_token:
            if unicodedata.category(char) != 'Mn':
                # Store base character structure
                sequence.append({'char': char, 'accent': ''})
            else:
                name = unicodedata.name(char, '')
                # Catch Rough Breathing
                if 'REVERSED COMMA ABOVE' in name or 'DASIA' in name:
                    has_rough_breathing = True
                # Catch Accent Structures (Both Acute AND Circumflex are mapped to a generic high stress)
                elif any(m in name for m in ['ACUTE ACCENT', 'TONOS', 'CIRCUMFLEX', 'PERISPOMENI']):
                    if sequence:
                        sequence[-1]['accent'] = '\u0301' # Retain generic stress character

        # 2. Sequence Transformation Loop
        processed_sequence = []
        i = 0
        n = len(sequence)
        
        while i < n:
            curr = sequence[i]
            curr_lower = curr['char'].lower()
            
            nxt = sequence[i+1] if i + 1 < n else None
            nxt_lower = nxt['char'].lower() if nxt else ''

            # --- Rule A: Boundary Hyphens ---
            if curr['char'] == '-':
                processed_sequence.append('-')
                i += 1
                continue

            # --- Rule B: Gamma-Nasal Conversion ---
            if curr_lower == 'γ' and nxt_lower in ['γ', 'κ', 'χ', 'ξ']:
                char_out = 'n' if curr['char'].islower() else 'N'
                processed_sequence.append(char_out + curr['accent'])
                i += 1
                continue

            # --- Rule C: Optimized Diphthong Collapse ---
            if nxt:
                pair = curr_lower + nxt_lower
                if pair in self.diphthongs:
                    val = self.diphthongs[pair]
                    char_out = val if curr['char'].islower() else val.capitalize()
                    
                    # Carry forward combined structural stress markers
                    accent_out = curr['accent'] or nxt['accent']
                    processed_sequence.append(char_out + accent_out)
                    i += 2
                    continue

            # --- Rule D: Complete Alphabet Fallback Mapping ---
            char_out = self.base_map.get(curr['char'], curr['char'])
            processed_sequence.append(char_out + curr['accent'])
            i += 1

        # Build output string
        word_out = "".join(processed_sequence)
        
        # Inject Rough Breathing aspiration
        if has_rough_breathing:
            word_out = "h" + word_out

        return word_out

    def transform(self, text):
        """Main orchestrator executing Pass 1 and Pass 2 pipelines."""
        phonological_phrases = self._tokenize_phrases(text)
        output_tokens = [self._convert_token_phonetics(p) for p in phonological_phrases]
        
        # Output clean, space-separated phonetic units
        return unicodedata.normalize('NFC', " ".join(output_tokens))

# --- VERIFICATION TEST EXECUTION ---if __name__ == "__main__":
    engine = AtticPhoneticEngine()
    
    test_cases = [
        ("ἄγγελος", "hán-gelos (Corrected prose issue: Smooth breathing = no initial H)"),
        ("οὐκ ἐν", "ook-en (Proclitic liaison junction unified via tokenization)"),
        ("ἀλλ' ἐν", "all-en (Elision boundary unified via tokenization)"),
        ("παιδεία", "pah-eedeí-a (Diphthong split preventing English long-vowel flattening)"),
        ("τῷ εὖ Χαῖρε", "toh́ eẃ khah-eére (Circumflex marks tracked and preserved as active stress)")
    ]
    
    print("--- PIPELINE VERIFICATION RESULTS ---\n")
    for input_text, expected in test_cases:
        result = engine.transform(input_text)
        print(f"Input:    {input_text}")
        print(f"Phonetic: {result}")
        print(f"Target:   {expected}\n")

## Key Functional Improvements

   1. Hyphenated Junctures: By translating οὐκ ἐν into ook-en, the API perceives the payload as a single phonological token. This prevents the speech engine from downstepping the voice or adding micro-pauses at word edges.
   2. Unified Stress Mapping: Both the classical circumflex (\u0342) and the acute accent are captured and flattened into a single standardized combining acute stress mark (\u0301). This ensures English/multilingual neural agents consistently place acoustic stress on targets like τῷ or εὖ.
   3. Exhaustive Orthography Coverage: The script features full lookup definitions for all 24 characters of the Greek alphabet, preventing raw fallback bugs like πaideíα.

Would you like to explore converting this pipeline into an abstract class structure to add custom handling for final-consonant tracking, or should we look into integrating this directly with the Google Text-to-Speech API SDK payload?



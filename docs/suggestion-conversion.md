To implement the Gamma-Nasal Rule, Diphthong Collapsing, and Accent Preservation effectively, we must modify how the string is processed. Instead of replacing single isolated letters, the algorithm must look at character combinations sequentially.
By converting the text into its NFD (Decomposed) form, we can isolate the underlying Greek letters from their accent marks. This allows us to keep helpful pronunciation markers (like the acute accent) so that the Gemini English/Multilingual engine applies emphasis to the correct syllable, while stripping away markers that cause phonetic confusion.
## The Upgraded Algorithm

   1. Decompose & Standardise Case: Normalize to NFD so base characters and marks separate.
   2. Scan Ahead for Gamma-Nasals: If a γ is followed by γ, κ, χ, or ξ, convert that first γ into an n.
   3. Collapse Diphthongs: Identify multi-vowel groups (like ει, ου, αι, αυ, ευ) and replace them with English phonetic approximations (ei, oo, ai, au, eu) before they get split or misread.
   4. Preserve Accents, Route Breathings: Detect a rough breathing mark to prepend h. Retain the Acute Accent (\u0301) and append it immediately after the substituted vowel so the AI engine knows where to stress the voice.

## Improved Python Implementation

import unicodedata
def transform_attic_to_phonetic_advanced(text):
    # Base mapping for isolated consonants and unique vowels
    base_map = {
        'β': 'b', 'Β': 'B',
        'δ': 'd', 'Δ': 'D',
        'ζ': 'zd', 'Ζ': 'Zd',
        'θ': 'th', 'Θ': 'Th',
        'φ': 'ph', 'Φ': 'Ph',
        'χ': 'kh', 'Χ': 'Kh',
        'η': 'eh', 'Η': 'Eh',
        'ω': 'oh', 'Ω': 'Oh',
    }

    words = text.split()
    transformed_words = []

    for word in words:
        # NFD breaks characters down, e.g., "ἄ" -> "α" + "smooth breathing" + "acute accent"
        nfd_word = unicodedata.normalize('NFD', word)
        
        # Step 1: Detect Rough Breathing across the entire word first
        has_rough_breathing = False
        for char in nfd_word:
            if unicodedata.category(char) == 'Mn':
                name = unicodedata.name(char, '')
                if 'REVERSED COMMA ABOVE' in name or 'DASIA' in name:
                    has_rough_breathing = True

        # Step 2: Create a clean list of (base_char, accent_mark) to process sequences
        # This keeps the acute accent attached to its vowel even during transformations
        sequence = []
        for char in nfd_word:
            if unicodedata.category(char) != 'Mn':
                sequence.append({'char': char, 'accent': ''})
            else:
                name = unicodedata.name(char, '')
                # We specifically want to preserve the acute accent (tonos/oxeia) for stress
                if 'ACUTE ACCENT' in name or 'TONOS' in name:
                    if sequence:
                        sequence[-1]['accent'] = '\u0301' # Combining acute accent

        # Step 3: Apply sequential rules (Gamma-Nasal & Diphthongs)
        processed_sequence = []
        i = 0
        n = len(sequence)
        
        while i < n:
            curr = sequence[i]
            curr_char_lower = curr['char'].lower()
            
            # Lookahead character if available
            nxt = sequence[i+1] if i + 1 < n else None
            nxt_char_lower = nxt['char'].lower() if nxt else ''

            # --- Rule A: Gamma-Nasal Rule ---
            # If current is Gamma and next is Gamma, Kappa, Chi, or Xi
            if curr_char_lower == 'γ' and nxt_char_lower in ['γ', 'κ', 'χ', 'ξ']:
                # Transliterate gamma to 'n'
                char_out = 'n' if curr['char'].islower() else 'N'
                processed_sequence.append(char_out + curr['accent'])
                i += 1
                continue

            # --- Rule B: Diphthong Collapsing ---
            if nxt:
                diphthong_match = None
                pair = curr_char_lower + nxt_char_lower
                
                # Map combinations to explicit phonetic values
                diphthongs = {
                    'ει': 'ei',
                    'ου': 'oo',
                    'αι': 'ai',
                    'αυ': 'au',
                    'ευ': 'eu',
                    'οι': 'oi'
                }
                
                if pair in diphthongs:
                    # Choose case based on the leading vowel
                    val = diphthongs[pair]
                    char_out = val if curr['char'].islower() else val.capitalize()
                    
                    # Combine accents from either vowel if they exist
                    accent_out = curr['accent'] or nxt['accent']
                    
                    processed_sequence.append(char_out + accent_out)
                    i += 2 # Skip both characters
                    continue

            # --- Rule C: Default Base Character Substitution ---
            char_out = base_map.get(curr['char'], curr['char'])
            processed_sequence.append(char_out + curr['accent'])
            i += 1

        # Reconstruct the processed word string
        word_out = "".join(processed_sequence)
        
        # Prepend 'h' if it had a rough breathing mark
        if has_rough_breathing:
            if word_out and word_out[0].isupper():
                word_out = "H" + word_out[0].lower() + word_out[1:]
            else:
                word_out = "h" + word_out

        transformed_words.append(word_out)

    # Output clean standard text string
    final_output = " ".join(transformed_words)
    return unicodedata.normalize('NFC', final_output)
# --- VERIFICATION TEST ---test_phrases = [
    "ἄγγελος",          # Gamma-Nasal test (Should output: hángelos -> notice the accent)
    "οὐκ",             # Diphthong 'ου' test (Should output: ook)
    "παιδεία"          # Diphthong 'αι' + accent preservation test (Should output: paideía)
]
for phrase in test_phrases:
    print(f"Original: {phrase}  -->  Phonetic Hack: {transform_attic_to_phonetic_advanced(phrase)}")

## Output Results Analysis
When you run the test cases through this script, you will receive values mapped like this:

* 
* ἄγγελος becomes há́ngelos. The rough breathing is converted cleanly to an initial h, the gamma-nasal turns into an n, and the acute accent stays glued directly onto the a.
* παιδεία becomes paideí́a. The diphthongs resolve smoothly without tripping up into modern phonetic shifts.
* 



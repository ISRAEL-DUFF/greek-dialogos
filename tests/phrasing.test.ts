/**
 * Tests for phonological phrasing (pass 1) and seam joining (pass 2).
 *
 * The "regressions guarded" block pins three failures found in an externally
 * proposed implementation. All three came from fusing Greek words BEFORE
 * transcribing them, which severs the link between a word and its own
 * diacritics. They are kept as tests because the bugs are easy to reintroduce
 * by "simplifying" the pipeline back into a single pass.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { groupPhonologicalWords, isProclitic, isEnclitic, isProsodicallyWeak } from "../src/utils/phrasing";
import { convertToSpokenForm } from "../src/utils/phoneticConverter";

const groupsOf = (text: string) =>
  groupPhonologicalWords(text).map((g) => g.words.join("+"));

describe("clitic recognition uses the accent, not just the letters", () => {
  test("unaccented indefinite τις is enclitic", () => {
    assert.equal(isEnclitic("τις"), true);
  });

  test("accented interrogative τίς is NOT enclitic", () => {
    assert.equal(isEnclitic("τίς"), false);
  });

  test("unaccented indefinite ποι is enclitic; interrogative ποῖ is not", () => {
    assert.equal(isEnclitic("ποι"), true);
    assert.equal(isEnclitic("ποῖ"), false);
  });

  test("unaccented ἐστι is enclitic; accented ἔστι is not", () => {
    assert.equal(isEnclitic("ἐστι"), true);
    assert.equal(isEnclitic("ἔστι"), false);
  });

  test("nominative article is proclitic, oblique forms are not", () => {
    assert.equal(isProclitic("οἱ"), true);
    assert.equal(isProclitic("τῷ"), false, "τῷ is accented and not in the proclitic list");
  });

  test("οὐκ is proclitic", () => {
    assert.equal(isProclitic("οὐκ"), true);
  });
});

describe("grouping", () => {
  test("a proclitic joins the word after it", () => {
    assert.deepEqual(groupsOf("οἱ ἄνθρωποι"), ["οἱ+ἄνθρωποι"]);
  });

  test("an enclitic joins the word before it", () => {
    assert.deepEqual(groupsOf("ἄνθρωπός τις"), ["ἄνθρωπός+τις"]);
  });

  test("an elided word joins what follows", () => {
    assert.deepEqual(groupsOf("ἀλλ' ἐν"), ["ἀλλ'+ἐν"]);
  });

  test("independent words stay separate", () => {
    assert.deepEqual(groupsOf("λόγος ἀγαθός"), ["λόγος", "ἀγαθός"]);
  });

  test("an accented interrogative is not swept into the previous group", () => {
    // The failure this prevents: binding τίς backwards as though it were the
    // enclitic indefinite.
    assert.deepEqual(groupsOf("ἄνθρωπος τίς"), ["ἄνθρωπος", "τίς"]);
  });

  test("groups never cross phrase-final punctuation", () => {
    assert.deepEqual(groupsOf("φίλε! Ποῖ βαδίζεις;"), ["φίλε!", "Ποῖ", "βαδίζεις;"]);
  });

  test("groups are bounded in size", () => {
    for (const g of groupPhonologicalWords("οἱ ἐν τῷ ἐν τῷ ἐν τῷ ἄνθρωποι")) {
      assert.ok(g.words.length <= 4, `group of ${g.words.length} exceeds the cap`);
    }
  });

  test("every word survives grouping exactly once, in order", () => {
    const line = "Οὐκ ἐν τῷ πολλῷ τὸ εὖ, ἀλλ' ἐν τῷ εὖ τὸ πολύ.";
    const flat = groupPhonologicalWords(line).flatMap((g) => g.words);
    assert.deepEqual(flat, line.split(/\s+/));
  });
});

describe("seam joining", () => {
  test("consonant + vowel resyllabifies", () => {
    assert.equal(convertToSpokenForm("οὐκ ἐν"), "ooken");
  });

  test("the elision apostrophe does not survive into speech", () => {
    const out = convertToSpokenForm("ἀλλ' ἐν");
    assert.equal(out, "allen");
    assert.ok(!out.includes("'"));
  });

  test("groups are separated by a single space", () => {
    assert.equal(convertToSpokenForm("οἱ ἄνθρωποι λόγος"), "hoianthrohpoi logos");
  });

  test("phrasing can be disabled, reproducing the previous behaviour", () => {
    assert.equal(convertToSpokenForm("οὐκ ἐν", { phrasing: false }), "ook en");
  });
});

describe("regressions guarded", () => {
  test("an aspirate never migrates to a neighbouring word", () => {
    // αὐτοῦ carries SMOOTH breathing; the rough breathing belongs to οὗ.
    // Fusing before transcribing produced "howtoo-oo", aspirating αὐτοῦ.
    const out = convertToSpokenForm("αὐτοῦ οὗ");
    assert.equal(out, "autoo hoo");
    assert.ok(!out.startsWith("h"), "aspirate leaked onto the first word");
  });

  test("a capitalized word keeps its capital when aspirated", () => {
    assert.equal(convertToSpokenForm("Ἑλλάς"), "Hellas");
    assert.equal(convertToSpokenForm("Ῥώμη"), "Hrohmeh");
  });

  test("fusion does not cross a sentence boundary", () => {
    const out = convertToSpokenForm("ὦ φίλε! Ποῖ βαδίζεις;");
    assert.ok(!/phile!Poi|phile!-Poi/i.test(out), `fused across "!": ${out}`);
  });
});

describe("fusion never invents a phoneme", () => {
  test("a long-vowel digraph is not fused onto a following vowel", () => {
    // ἐγώ transcribes to "egoh" and εἰμι to "eimi". Fusing gives "egoheimi",
    // which reads as an aspirate on a word that has SMOOTH breathing.
    const out = convertToSpokenForm("Ἐγώ εἰμι", { phrasing: true, preserveAccents: true });
    assert.ok(!/heimi/i.test(out), `fusion invented an aspirate: ${out}`);
    assert.equal(out, "Egóh eimi");
  });

  test("a genuine aspirate still fuses", () => {
    // ὁ carries real rough breathing, so "ho" + noun is correct.
    assert.equal(convertToSpokenForm("ὁ μῦθος", { phrasing: true }), "homuthos");
  });

  test("a capital inside a fused token is lowered", () => {
    // "HoBoréas" risks being read as an initialism.
    assert.equal(convertToSpokenForm("Ὁ Βορέας", { phrasing: true }), "Hoboreas");
  });
});

describe("stress marking", () => {
  test("acute and circumflex are marked as stress", () => {
    assert.equal(convertToSpokenForm("πολύ", { preserveAccents: true }), "polú");
    // A lexical word with a circumflex. The dative article τῷ used to stand
    // here, which tested the wrong thing: it is a function word, and function
    // words are exactly what must never carry the mark.
    assert.equal(convertToSpokenForm("σῶμα", { preserveAccents: true }), "sóhma");
  });

  test("the grave is NOT marked — it is a suppressed accent", () => {
    assert.equal(convertToSpokenForm("τὸ", { preserveAccents: true }), "to");
    // τὸν binds forward now, so the pair fuses; the point stands either way —
    // the grave leaves no mark while the noun keeps its own.
    assert.equal(convertToSpokenForm("τὸν λόγον", { preserveAccents: true }), "tonlógon");
    assert.equal(
      convertToSpokenForm("τὸν λόγον", { preserveAccents: true, phrasing: false }),
      "ton lógon"
    );
  });

  test("a prosodically weak word never takes the mark", () => {
    // The article is bound to its noun; marking it would put the prominence
    // on the wrong word.
    assert.equal(convertToSpokenForm("τῷ", { preserveAccents: true }), "toh");
    assert.equal(convertToSpokenForm("καὶ", { preserveAccents: true }), "kai");
  });

  test("accents are off by default", () => {
    assert.equal(convertToSpokenForm("πολύ"), "polu");
  });
});

describe("stress density", () => {
  const line = "Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;";
  const marks = (s: string) => (s.normalize("NFD").match(/́/g) || []).length;

  test("'all' marks every accented word", () => {
    const out = convertToSpokenForm(line, { phrasing: true, preserveAccents: true, stressDensity: "all" });
    assert.ok(marks(out) >= 3, out);
  });

  test("'phrase' gives one nuclear stress per sentence", () => {
    // Two sentences here, so two marks — not one per word.
    const out = convertToSpokenForm(line, { phrasing: true, preserveAccents: true, stressDensity: "phrase" });
    assert.equal(marks(out), 2, out);
  });

  test("'none' marks nothing", () => {
    const out = convertToSpokenForm(line, { phrasing: true, preserveAccents: true, stressDensity: "none" });
    assert.equal(marks(out), 0, out);
  });

  test("a comma does not start a new intonational phrase", () => {
    // "Χαῖρε, ὦ φίλε!" is one phrase; splitting on the comma would give
    // Χαῖρε its own nucleus and a three-word greeting two prominences.
    const out = convertToSpokenForm("Χαῖρε, ὦ φίλε!", { phrasing: true, preserveAccents: true, stressDensity: "phrase" });
    assert.equal(marks(out), 1, out);
  });

  test("ὦ never carries stress, though it is written with a circumflex", () => {
    for (const d of ["all", "phrase"] as const) {
      const out = convertToSpokenForm("ὦ φίλε", { phrasing: true, preserveAccents: true, stressDensity: d });
      assert.ok(/\boh\b/.test(out), `ὦ was stressed at density ${d}: ${out}`);
    }
  });

  test("phrasing still applies with no stress marks at all", () => {
    assert.equal(convertToSpokenForm("οὐκ ἐν", { phrasing: true, stressDensity: "none" }), "ooken");
  });
});


describe("prosodically weak words bind to their neighbours", () => {
  const groups = (t: string) => groupPhonologicalWords(t).map((g) => g.words.join("+"));

  // These words carry accents, so they are not clitics and the unaccented test
  // rejects them. They are still bound in speech, which left sentences built
  // from function words completely ungrouped.
  test("the oblique article binds forward despite its accent", () => {
    assert.deepEqual(groups("τὴν ἀνθρωπίνην"), ["τὴν+ἀνθρωπίνην"]);
    assert.deepEqual(groups("τοῦ ὅλου"), ["τοῦ+ὅλου"]);
  });

  test("καί binds forward", () => {
    assert.deepEqual(groups("καὶ τὰ παθήματα"), ["καὶ+τὰ+παθήματα"]);
  });

  test("a postpositive particle binds back", () => {
    assert.deepEqual(groups("πρῶτον μὲν"), ["πρῶτον+μὲν"]);
    assert.deepEqual(groups("λέγει γάρ"), ["λέγει+γάρ"]);
  });

  test("the sentence that exposed the gap now groups", () => {
    const line =
      "Ἐρυξίμαχε πρῶτον μὲν δεῖ ὑμᾶς μαθεῖν τὴν ἀνθρωπίνην φύσιν καὶ τὰ παθήματα αὐτῆς";
    const g = groups(line);
    assert.equal(line.split(/\s+/).length, 13);
    assert.ok(g.length < 13, `still ungrouped: ${JSON.stringify(g)}`);
    assert.ok(g.includes("πρῶτον+μὲν"), JSON.stringify(g));
    assert.ok(g.includes("τὴν+ἀνθρωπίνην"), JSON.stringify(g));
  });

  test("the accent still decides for true clitics", () => {
    // The relaxed test must not leak into the clitic lists, or τίς / τις breaks.
    assert.deepEqual(groups("τίς ἐστιν;"), ["τίς", "ἐστιν;"]);
    assert.deepEqual(groups("ἄνθρωπός τις ἦλθεν"), ["ἄνθρωπός+τις", "ἦλθεν"]);
  });

  test("a group still never crosses phrase-final punctuation", () => {
    assert.deepEqual(groups("φίλε! καὶ σύ"), ["φίλε!", "καὶ+σύ"]);
  });
});

describe("stress density applies without phrasing", () => {
  // With phrasing off this used to return early, so every density produced the
  // same fully accented string and the control did nothing.
  const line = "Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;";
  const opts = (stressDensity: "all" | "phrase" | "none") =>
    convertToSpokenForm(line, { phrasing: false, preserveAccents: true, stressDensity });
  const marks = (s: string) => (s.normalize("NFD").match(/\u0301/g) || []).length;

  test("the three densities differ", () => {
    assert.equal(new Set([opts("all"), opts("phrase"), opts("none")]).size, 3);
  });

  test("none strips every mark, all keeps the most", () => {
    assert.equal(marks(opts("none")), 0);
    assert.ok(marks(opts("all")) > marks(opts("phrase")), opts("all"));
  });
});

describe("homographs the bare-form lists would otherwise conflate", () => {
  const g = (t: string) => groupPhonologicalWords(t).map((x) => x.words.join("+"));

  // Membership alone is too blunt for these: binding a noun or a verb as
  // though it were a particle is worse than leaving a particle unbound.
  test("ἆρα opens a question; ἄρα is the postpositive", () => {
    assert.equal(isProsodicallyWeak("ἆρα"), false);
    assert.equal(isProsodicallyWeak("ἄρα"), true);
    // and it keeps its own stress mark
    assert.ok(
      convertToSpokenForm("Ἆρα οὖν", { preserveAccents: true, stressDensity: "all" }).includes("Á"),
      convertToSpokenForm("Ἆρα οὖν", { preserveAccents: true, stressDensity: "all" })
    );
  });

  test("ἀλλά is the conjunction; ἄλλα is a noun", () => {
    assert.equal(isProsodicallyWeak("ἀλλά"), true);
    assert.equal(isProsodicallyWeak("ἄλλα"), false);
    assert.deepEqual(g("ἄλλα λέγει"), ["ἄλλα", "λέγει"]);
  });

  test("a word already gated by the unaccented rule is not re-listed", () => {
    // Listing "ει" among the weak proclitics bound εἶ ("you are") to its
    // complement exactly as though it were εἰ ("if").
    assert.equal(isProsodicallyWeak("εἰ"), true);
    assert.equal(isProsodicallyWeak("εἶ"), false);
    assert.deepEqual(g("εἶ σοφός"), ["εἶ", "σοφός"]);
    assert.equal(isProsodicallyWeak("ἡ"), true);
    assert.equal(isProsodicallyWeak("ἤ"), false);
  });
});

describe("seams", () => {
  test("an aspirate meeting a rough breathing writes one h, not two", () => {
    // οὐχ is aspirated *because* of the following rough breathing.
    assert.equal(convertToSpokenForm("οὐχ αὑτὴ", { phrasing: true }), "ookhauteh");
  });

  test("a long-vowel digraph keeps the following h", () => {
    // "eh"/"oh" are vowels; dropping their h would delete the vowel itself.
    assert.ok(convertToSpokenForm("τῇ ἡμέρᾳ", { phrasing: true }).includes("hehmera"));
  });
});

describe("a group is never left entirely without prominence", () => {
  const eras = (t: string) =>
    convertToSpokenForm(t, { phrasing: true, preserveAccents: true, stressDensity: "all" });
  const marked = (s: string) => /[́]/.test(s.normalize("NFD"));

  // An oxytone content word takes a grave before a following word, so the
  // subject of a clause could end up with no prominence at all.
  test("a grave is promoted when nothing else in the group can be marked", () => {
    // Normalised: the transcriber emits a combining acute, so a composed
    // literal here would differ by encoding while looking identical.
    const nfc = (t: string) => eras(t).normalize("NFC");
    assert.equal(nfc("ὁ Ζεὺς"), "hozéus".normalize("NFC"));
    assert.equal(nfc("οὐχ αὑτὴ"), "ookhautéh".normalize("NFC"));
  });

  test("the grave stays unmarked when a live accent is present", () => {
    // The long-standing rule is unchanged wherever it has an alternative.
    assert.equal(eras("τὸν λόγον").normalize("NFC"), "tonlógon".normalize("NFC"));
    assert.ok(!marked("to"), "sanity");
  });

  test("an all-weak group stays silent — there is nothing to promote", () => {
    assert.equal(eras("ἐπεὶ δὲ"), "epeide");
  });

  test("only one word is rescued, the rightmost", () => {
    const out = eras("ὁ Ζεὺς");
    assert.equal((out.normalize("NFD").match(/́/g) || []).length, 1, out);
  });
});

describe("elision marks, all of them", () => {
  const g = (t: string) => groupPhonologicalWords(t).map((x) => x.words.join("+"));

  // The set was written out four times across the codebase and had drifted:
  // every copy listed U+1FBD KORONIS, none listed U+1FBF PSILI, which is
  // visually near-identical and just as common. `Ἆρ᾿ οἶσθα` was not recognised
  // as elided, and the bare mark reached the speech engine.
  test("every elision mark fuses the word with what follows", () => {
    for (const mark of ["'", "’", "᾽", "᾿", "ʼ"]) {
      assert.deepEqual(g(`Ἆρ${mark} οἶσθα`), [`Ἆρ${mark}+οἶσθα`], `mark U+${mark.codePointAt(0)!.toString(16)}`);
    }
  });

  test("the mark never reaches the transcription", () => {
    for (const mark of ["'", "’", "᾽", "᾿", "ʼ"]) {
      const out = convertToSpokenForm(`Ἆρ${mark} οἶσθα`, { phrasing: true });
      assert.ok(!out.includes(mark), `${mark} survived: ${out}`);
    }
  });
});

describe("a form that is both proclitic and enclitic reads as proclitic", () => {
  const g = (t: string) => groupPhonologicalWords(t).map((x) => x.words.join("+"));

  test("οὐ leans forward onto what it negates, not back onto the noun", () => {
    // `βασιλεὺς οὐ μόνον` fused all three, dragging the negative backwards.
    assert.deepEqual(g("βασιλεὺς οὐ μόνον"), ["βασιλεὺς", "οὐ+μόνον"]);
  });

  test("an unambiguous enclitic still leans back", () => {
    assert.deepEqual(g("ἄνθρωπός τις"), ["ἄνθρωπός+τις"]);
    assert.deepEqual(g("λέγε μοι"), ["λέγε+μοι"]);
    assert.deepEqual(g("σοφός ἐστιν"), ["σοφός+ἐστιν"]);
  });
});

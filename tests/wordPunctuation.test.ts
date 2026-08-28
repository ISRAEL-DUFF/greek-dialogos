/**
 * The reading views render `line.words`, which the generator supplies without
 * punctuation. These check that it is restored from `greekText` without ever
 * inventing any.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { wordAffixes } from "../src/utils/wordPunctuation";

const w = (...gs: string[]) => gs.map((greek) => ({ greek }));
const render = (text: string, words: { greek: string }[]) =>
  wordAffixes(text, words)
    .map((a, i) => a.before + words[i].greek + a.after)
    .join(" ");

describe("punctuation is restored", () => {
  test("a comma and a full stop", () => {
    const words = w("Χαῖρε", "ὦ", "φίλε");
    assert.equal(render("Χαῖρε, ὦ φίλε.", words), "Χαῖρε, ὦ φίλε.");
  });

  test("the Greek question mark", () => {
    const words = w("Ἆρα", "οὖν", "ἔτεμεν", "ἕκαστον");
    assert.equal(render("Ἆρα οὖν ἔτεμεν ἕκαστον;", words), "Ἆρα οὖν ἔτεμεν ἕκαστον;");
  });

  test("the ano teleia, which carries a clause break", () => {
    const words = w("Πάνυ", "μὲν", "οὖν", "ἐπεὶ", "δὲ");
    assert.equal(render("Πάνυ μὲν οὖν· ἐπεὶ δὲ", words), "Πάνυ μὲν οὖν· ἐπεὶ δὲ");
  });

  test("guillemets sit on the right sides", () => {
    const a = wordAffixes("«τί οὖν;»", w("τί", "οὖν"));
    assert.equal(a[0].before, "«");
    assert.equal(a[1].after, ";»");
  });

  test("the word itself is never altered", () => {
    // It feeds dictionary lookup and the gloss.
    const words = w("Χαῖρε", "ὦ", "φίλε");
    wordAffixes("Χαῖρε, ὦ φίλε.", words);
    assert.deepEqual(words.map((x) => x.greek), ["Χαῖρε", "ὦ", "φίλε"]);
  });
});

describe("it refuses rather than guesses", () => {
  test("a different word count yields no punctuation", () => {
    const a = wordAffixes("Χαῖρε, ὦ φίλε.", w("Χαῖρε", "φίλε"));
    assert.deepEqual(a, [{ before: "", after: "" }, { before: "", after: "" }]);
  });

  test("words that do not match the sentence yield none", () => {
    const a = wordAffixes("Χαῖρε, ὦ φίλε.", w("ἄλλο", "ὦ", "φίλε"));
    assert.ok(a.every((x) => x.before === "" && x.after === ""));
  });

  test("empty input is safe", () => {
    assert.deepEqual(wordAffixes("", w("τί")), [{ before: "", after: "" }]);
    assert.deepEqual(wordAffixes("τί;", []), []);
  });

  test("an elided word keeps its apostrophe and still aligns", () => {
    const words = w("ἀλλ", "οὐ");
    assert.equal(render("ἀλλ’ οὐ", words), "ἀλλ’ οὐ");
  });
});

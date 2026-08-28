import { convertToSpokenForm } from "../src/utils/phoneticConverter.js";
import { convertToIPAForm } from "../src/utils/ipaConverter.js";
import { groupPhonologicalWords } from "../src/utils/phrasing.js";

const cases = [
  "Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;",
  "Ἔστι δὴ οὖν τοῦ ὅλου ἐπιθυμία καὶ δίωξις Ἔρως καλούμενος.",
  "λέγε μοι· τί ποιεῖς;",
  "ὁ μέν ἐστι σοφός, ὁ δὲ οὔ.",
  "Πῶς δὲ ἔχει, ὦ Ἀριστόφανες; λέγε ἡμῖν.",
  "ἀλλ’ οὐ τοῦτο· ἕτερον δέ τι.",
  "εἶπεν· «τί οὖν;»",
];
const punct = (s: string) => (s.match(/[,.;·!?«»’]/g) || []).join("");

for (const c of cases) {
  const e = convertToSpokenForm(c, { phrasing: true, preserveAccents: true, stressDensity: "all" });
  const i = convertToIPAForm(c, { phrasing: true, stressDensity: "all" });
  const inP = punct(c), eP = punct(e), iP = punct(i);
  const ok = (a: string) => (a === inP ? "ok " : "LOST");
  console.log(`\nin    ${c}`);
  console.log(`eras  ${e}`);
  console.log(`ipa   ${i}`);
  console.log(`      in[${inP}] eras[${eP}]${ok(eP)} ipa[${iP}]${ok(iP)}`);
}

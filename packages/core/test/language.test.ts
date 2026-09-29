import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LANGUAGES,
  baseLanguage,
  getLanguage,
  isAutoLanguage,
  isRightToLeft,
  languageLabel,
  normalizeLanguageTag,
  resolveLanguage,
  sameBaseLanguage,
} from "../src/language.ts";

test("resolves region and alias variants to canonical tags", () => {
  const cases: [string, string][] = [
    ["zh", "zh-Hans"],
    ["zh-CN", "zh-Hans"],
    ["zh_cn", "zh-Hans"],
    ["中文", "zh-Hans"],
    ["简体中文", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
    ["繁體中文", "zh-Hant"],
    ["en", "en-US"],
    ["EN_us", "en-US"],
    ["英语", "en-US"],
    ["en-GB", "en-GB"],
    ["ja", "ja"],
    ["jp", "ja"],
    ["日本語", "ja"],
    ["ko", "ko"],
    ["kr", "ko"],
    ["français", "fr"],
    ["Spanish", "es"],
    ["portugues", "pt-BR"],
    ["de-DE", "de"],
    ["ru", "ru"],
    ["ar-SA", "ar"],
    ["  ja  ", "ja"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeLanguageTag(input), expected, `resolveLanguage(${input})`);
  }
});

test("rejects unknown languages and the auto sentinel", () => {
  assert.equal(resolveLanguage("auto"), undefined);
  assert.equal(resolveLanguage("klingon"), undefined);
  assert.equal(resolveLanguage(""), undefined);
  assert.equal(resolveLanguage(null), undefined);
  assert.equal(resolveLanguage(undefined), undefined);
  assert.equal(isAutoLanguage("auto"), true);
  assert.equal(isAutoLanguage(undefined), true);
  assert.equal(isAutoLanguage("zh"), false);
});

test("derives base languages and compares language families", () => {
  assert.equal(baseLanguage("zh-Hant"), "zh");
  assert.equal(baseLanguage("en-GB"), "en");
  assert.equal(sameBaseLanguage("zh-Hans", "zh-Hant"), true);
  assert.equal(sameBaseLanguage("en-US", "en-GB"), true);
  assert.equal(sameBaseLanguage("ja", "zh-Hans"), false);
});

test("exposes display metadata", () => {
  assert.equal(languageLabel("zh-Hans"), "简体中文");
  assert.equal(languageLabel("zh-Hans", "en"), "Chinese (Simplified)");
  assert.equal(languageLabel("nope"), "nope");
  assert.equal(isRightToLeft("ar"), true);
  assert.equal(isRightToLeft("en-US"), false);
  assert.equal(getLanguage("JA")?.tag, "ja");
});

test("language registry has unique canonical tags", () => {
  const tags = LANGUAGES.map((language) => language.tag);
  assert.equal(new Set(tags).size, tags.length);
  for (const language of LANGUAGES) {
    assert.ok(language.scripts.length > 0, `${language.tag} needs at least one script`);
  }
});

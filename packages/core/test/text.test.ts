import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chunkText,
  cleanModelOutput,
  protectText,
  splitSentences,
  textStats,
  truncate,
} from "../src/text.ts";

test("protects code, urls, variables and markup, then restores exactly", () => {
  const input = [
    "Run `npm install` inside {{projectDir}} before continuing.",
    "See https://example.com/docs for details.",
    "Write to support@example.com or edit <b>config</b>.",
    "```js",
    "const answer = 42;",
    "```",
  ].join("\n");

  const protectedText = protectText(input);
  assert.equal(protectedText.restore(protectedText.text), input);
  assert.ok(!protectedText.text.includes("npm install"));
  assert.ok(!protectedText.text.includes("https://example.com/docs"));
  assert.ok(protectedText.tokens.some((token) => token.kind === "code-fence"));
  assert.ok(protectedText.tokens.some((token) => token.kind === "url"));
  assert.ok(protectedText.tokens.some((token) => token.kind === "template-var"));
});

test("restores placeholders that a model reflowed with extra spaces", () => {
  const protectedText = protectText("Run `npm install` now.");
  const modelOutput = protectedText.text.replace("\uE000", "\uE000 ").replace("\uE001", " \uE001");
  assert.equal(protectedText.restore(modelOutput), "Run `npm install` now.");
});

test("restores plain-style placeholders", () => {
  const protectedText = protectText("Visit https://example.com now.", { style: "plain" });
  assert.ok(protectedText.text.includes("[[T"));
  assert.equal(protectedText.restore(protectedText.text), "Visit https://example.com now.");
});

test("keeps newlines around fenced code blocks", () => {
  const input = "Before\n```\ncode\n```\nafter";
  const protectedText = protectText(input);
  assert.equal(protectedText.text.startsWith("Before\n"), true);
  assert.equal(protectedText.restore(protectedText.text), input);
});

test("splits sentences without losing characters", () => {
  const cases = [
    "Hello world. This is a test.",
    "Mr. Smith went home. He was tired.",
    "第一句。第二句！第三句？",
    "Line one\nLine two\n\nNew paragraph。",
    "Version 1.5 is out! Upgrade now.",
    "He said “你好。” and left.",
    "No terminator here",
    "   \n\n  ",
  ];
  for (const input of cases) {
    const units = splitSentences(input);
    const rebuilt = units.map((unit) => unit.text + unit.trailing).join("");
    assert.equal(rebuilt, input, `round trip failed for ${JSON.stringify(input)}`);
  }
});

test("does not split on abbreviations or decimals", () => {
  const units = splitSentences("Mr. Smith paid 3.5 dollars. He left.");
  assert.equal(units.length, 2);
  assert.equal(units[0]?.text, "Mr. Smith paid 3.5 dollars.");
});

test("chunks long text without losing a single character", () => {
  const paragraph =
    "This is a fairly long English paragraph that should be split into several smaller chunks. " +
    "It contains multiple sentences so the splitter has real boundaries to work with. " +
    "Numbers like 3.14 and abbreviations such as e.g. should survive intact.";
  const text = [paragraph, paragraph, paragraph].join("\n\n");
  for (const size of [80, 120, 200, 400]) {
    const chunks = chunkText(text, size);
    assert.equal(chunks.join(""), text, `lossy chunking at size ${size}`);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= size, `chunk exceeded ${size}: ${chunk.length}`);
    }
  }
});

test("chunks CJK text without punctuation boundaries", () => {
  const text = "这是一段没有任何标点符号的很长的中文文本".repeat(10);
  const chunks = chunkText(text, 40);
  assert.equal(chunks.join(""), text);
  for (const chunk of chunks) assert.ok(chunk.length <= 40);
});

test("returns the original text when it already fits", () => {
  assert.deepEqual(chunkText("short", 100), ["short"]);
  assert.deepEqual(chunkText("short", 0), ["short"]);
});

test("cleans model output wrappers", () => {
  assert.equal(cleanModelOutput("```\n你好\n```"), "你好");
  assert.equal(cleanModelOutput("```json\n你好\n```"), "你好");
  assert.equal(cleanModelOutput("Translation: 你好"), "你好");
  assert.equal(cleanModelOutput("译文：你好"), "你好");
  assert.equal(cleanModelOutput('"你好"'), "你好");
  assert.equal(cleanModelOutput("  Hello world  "), "Hello world");
});

test("counts text statistics for both scripts", () => {
  const stats = textStats("Hello 世界\nsecond line");
  assert.equal(stats.lines, 2);
  assert.equal(stats.words, 5);
  assert.ok(stats.characters > stats.charactersWithoutSpaces);
});

test("truncates with an ellipsis", () => {
  assert.equal(truncate("abcdef", 4), "abc…");
  assert.equal(truncate("abc", 4), "abc");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeScripts, describeDetection, detectLanguage } from "../src/detect.ts";

test("detects CJK languages by script", () => {
  assert.equal(detectLanguage("你好，世界！这是一段中文文本。").language, "zh-Hans");
  assert.equal(detectLanguage("這是一段繁體中文的測試文本").language, "zh-Hant");
  assert.equal(detectLanguage("こんにちは、これはテストです。").language, "ja");
  assert.equal(detectLanguage("안녕하세요, 좋은 아침입니다.").language, "ko");
  assert.equal(detectLanguage("日本語のテスト").language, "ja");
});

test("detects non-Latin scripts", () => {
  assert.equal(detectLanguage("Привет, как дела сегодня?").language, "ru");
  assert.equal(detectLanguage("Привіт, як справи сьогодні?").language, "uk");
  assert.equal(detectLanguage("مرحبا بالعالم، كيف حالك اليوم؟").language, "ar");
  assert.equal(detectLanguage("שלום עולם, מה שלומך היום?").language, "he");
  assert.equal(detectLanguage("สวัสดีชาวโลก ยินดีต้อนรับ").language, "th");
  assert.equal(detectLanguage("नमस्ते दुनिया, आप कैसे हैं?").language, "hi");
  assert.equal(detectLanguage("Καλημέρα κόσμε, τι κάνετε σήμερα;").language, "el");
});

test("detects latin languages with meaningful confidence", () => {
  const english = detectLanguage("The quick brown fox jumps over the lazy dog and runs away.");
  assert.equal(english.language, "en-US");
  assert.ok(english.confidence > 0.6, `confidence was ${english.confidence}`);

  assert.equal(detectLanguage("Bonjour, comment allez-vous aujourd'hui ?").language, "fr");
  assert.equal(detectLanguage("Hallo, wie geht es dir heute?").language, "de");
  assert.equal(detectLanguage("Hola, ¿cómo estás hoy?").language, "es");
  assert.equal(detectLanguage("Olá, como você está hoje?").language, "pt-BR");
  assert.equal(detectLanguage("Xin chào, bạn có khỏe không?").language, "vi");
  assert.equal(detectLanguage("Merhaba, bugün nasılsın?").language, "tr");
});

test("falls back when the evidence is too thin", () => {
  const result = detectLanguage("zz", { fallback: "ja", minConfidence: 0.6 });
  assert.equal(result.method, "fallback");
  assert.equal(result.language, "ja");
});

test("labels thin evidence as a fallback instead of claiming a confident guess", () => {
  const short = detectLanguage("hello world", { minConfidence: 0.6 });
  assert.equal(short.method, "fallback");
  assert.ok(short.confidence < 0.6);

  const sentence = detectLanguage(
    "The report is ready and it should be reviewed before the meeting.",
    { minConfidence: 0.6 },
  );
  assert.equal(sentence.method, "heuristic");
  assert.equal(sentence.language, "en-US");
  assert.ok(sentence.confidence >= 0.6);
});

test("restricts candidates to the expected languages", () => {
  const result = detectLanguage("你好，世界", { expected: ["ja", "en-US"] });
  assert.equal(result.language, "ja");
});

test("reports script shares for diagnostics", () => {
  const analysis = analyzeScripts("Hello 世界");
  assert.equal(analysis.letters, 7);
  assert.ok((analysis.shares.Latin ?? 0) > 0.7);
  assert.ok((analysis.shares.Han ?? 0) > 0.2);
});

test("describes detections for the UI", () => {
  const description = describeDetection(detectLanguage("你好，世界"));
  assert.match(description, /zh-Hans/u);
  assert.match(description, /%/u);
});

test("handles empty and symbol-only input without throwing", () => {
  assert.equal(detectLanguage("").confidence, 0);
  assert.equal(detectLanguage("123 456 789").confidence, 0);
});

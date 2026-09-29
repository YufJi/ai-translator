import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIG_VERSION, DEFAULT_SETTINGS, type AppConfig, type TranslationSettings } from "../src/config.ts";
import { Translator } from "../src/engine.ts";
import { isTranslatorError } from "../src/errors.ts";
import { createFakeProvider } from "./helpers.ts";

function makeConfig(settings: Partial<TranslationSettings> = {}): AppConfig {
  return {
    version: CONFIG_VERSION,
    providers: [
      {
        id: "test-provider",
        kind: "openai-compatible",
        model: "test-model",
        baseUrl: "https://api.test/v1",
        apiKey: "sk-test",
      },
    ],
    activeProviderId: "test-provider",
    settings: {
      ...structuredClone(DEFAULT_SETTINGS),
      detectStrategy: "heuristic",
      chunkSize: 200,
      ...settings,
    },
  };
}

function marker(context: { system: string; user: string }): string {
  const target = /into (.+?)\./.exec(context.system)?.[1] ?? "unknown";
  return `<${target}>${context.user}`;
}

test("translates and reports the detected source language", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  const result = await translator.translate("The quick brown fox jumps over the lazy dog.");
  assert.equal(result.source.language, "en-US");
  assert.equal(result.source.detected, true);
  assert.equal(result.source.method, "heuristic");
  assert.equal(result.target, "zh-Hans");
  assert.match(result.text, /^<Chinese \(Simplified\)>/u);
  assert.equal(result.providerId, "test-provider");
  assert.equal(result.model, "test-model");
  assert.equal(result.chunkCount, 1);
  assert.equal(result.usage?.totalTokens, 12);
  assert.equal(fake.requests.length, 1);
  assert.equal(fake.requests[0]?.headers["authorization"], "Bearer sk-test");
});

test("honours an explicit source language without detection", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  const result = await translator.translate("你好世界", { from: "zh", to: "en" });
  assert.equal(result.source.method, "declared");
  assert.equal(result.source.language, "zh-Hans");
  assert.equal(result.target, "en-US");
});

test("skips translation when source and target share a base language", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  const result = await translator.translate(
    "The report is ready and it should be reviewed before the meeting.",
    { to: "en-GB" },
  );
  assert.equal(result.skipped, true);
  assert.equal(fake.requests.length, 0);
});

test("does not skip when the detected language is only a low-confidence fallback", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  const result = await translator.translate("zz", { to: "en-US" });
  assert.equal(result.skipped, false);
  assert.ok(result.source.confidence < DEFAULT_SETTINGS.detectConfidenceThreshold);
  assert.equal(result.source.method, "fallback");
  assert.equal(fake.requests.length, 1);
});

test("caches identical requests", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  const first = await translator.translate("Hello world, this is a test.");
  const second = await translator.translate("Hello world, this is a test.");
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.text, first.text);
  assert.equal(fake.requests.length, 1);
  assert.equal(translator.cacheStats().hits, 1);
  translator.clearCache();
  assert.equal(translator.cacheStats().size, 0);
});

test("restores placeholders around protected spans", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  const input = "Install `npm i` into {{dir}} then open https://example.com/docs.";
  const result = await translator.translate(input);
  assert.ok(result.text.includes("`npm i`"), result.text);
  assert.ok(result.text.includes("{{dir}}"), result.text);
  assert.ok(result.text.includes("https://example.com/docs"), result.text);
  const sent = String(fake.requests[0]?.body === undefined ? "" : JSON.stringify(fake.requests[0].body));
  assert.ok(!sent.includes("npm i"), "code should not reach the model");
});

test("chunks long text and rebuilds the full result", async () => {
  const fake = createFakeProvider({ marker: (context) => `[T]${context.user}` });
  const translator = new Translator({ config: makeConfig({ chunkSize: 200 }), fetchImpl: fake.fetchImpl });
  const paragraph =
    "Translation quality depends on context. Shorter requests keep the prompt focused and predictable. " +
    "Long documents must therefore be split before they are sent to the model. ";
  const result = await translator.translate(paragraph.repeat(4));
  assert.ok(result.chunkCount > 1, `expected multiple chunks, got ${result.chunkCount}`);
  assert.equal(result.text.split("[T]").length - 1, result.chunkCount);
  assert.equal(fake.requests.length, result.chunkCount);
  assert.equal(
    result.text.replaceAll("[T]", "").replace(/[ \n]+/g, " ").trim(),
    paragraph.repeat(4).replace(/[ \n]+/g, " ").trim(),
  );
});

test("uses a single JSON batch request when batchMode is json", async () => {
  const fake = createFakeProvider({ marker: (context) => `[T]${context.user}` });
  const translator = new Translator({
    config: makeConfig({ chunkSize: 200, batchMode: "json" }),
    fetchImpl: fake.fetchImpl,
  });
  const paragraph =
    "Translation quality depends on context. Shorter requests keep the prompt focused and predictable. " +
    "Long documents must therefore be split before they are sent to the model. ";
  const result = await translator.translate(paragraph.repeat(4));
  assert.ok(result.chunkCount > 1);
  assert.equal(fake.requests.length, 1);
  assert.ok(fake.requests[0]?.body?.response_format);
  assert.equal(result.text.split("[json]").length - 1, result.chunkCount);
});

test("falls back to per-segment requests when the JSON batch is malformed", async () => {
  const fake = createFakeProvider();
  const originalFetch = fake.fetchImpl;
  let batchCalls = 0;
  const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (body?.response_format) {
      batchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  const translator = new Translator({
    config: makeConfig({ chunkSize: 200, batchMode: "json" }),
    fetchImpl: flaky,
  });
  const paragraph =
    "Translation quality depends on context. Shorter requests keep the prompt focused and predictable. " +
    "Long documents must therefore be split before they are sent to the model. ";
  const result = await translator.translate(paragraph.repeat(4));
  assert.equal(batchCalls, 1);
  assert.ok(result.warnings.some((warning) => warning.includes("json batch fell back")));
  assert.equal(result.text.split("[out]").length - 1, result.chunkCount);
});

test("passes tone, domain and glossary through to the prompt", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  await translator.translate("Deploy the cluster.", {
    tone: "technical",
    domain: "Kubernetes",
    glossary: [{ source: "cluster", target: "集群" }],
    context: "A DevOps runbook.",
  });
  const system = (fake.requests[0]?.body?.messages as { role: string; content: string }[])[0]!.content;
  assert.match(system, /precise technical terminology/u);
  assert.match(system, /Domain \/ subject matter: Kubernetes/u);
  assert.match(system, /"cluster" → "集群"/u);
  assert.match(system, /A DevOps runbook\./u);
});

test("asks the provider to identify weak signals when hybrid detection is enabled", async () => {
  const fake = createFakeProvider({ marker, detectAnswer: "ja" });
  const translator = new Translator({
    config: makeConfig({ detectStrategy: "hybrid", detectConfidenceThreshold: 0.9 }),
    fetchImpl: fake.fetchImpl,
  });
  const result = await translator.translate("zz");
  assert.equal(result.source.method, "llm");
  assert.equal(result.source.language, "ja");
  assert.ok(
    fake.requests.some((request) =>
      JSON.stringify(request.body ?? {}).includes("language identification engine"),
    ),
  );
});

test("skips provider detection when the strategy is heuristic", async () => {
  const fake = createFakeProvider({ marker, detectAnswer: "ja" });
  const translator = new Translator({
    config: makeConfig({ detectStrategy: "heuristic", detectConfidenceThreshold: 0.9 }),
    fetchImpl: fake.fetchImpl,
  });
  const result = await translator.translate("zz");
  assert.notEqual(result.source.method, "llm");
  assert.equal(
    fake.requests.filter((request) =>
      JSON.stringify(request.body ?? {}).includes("language identification engine"),
    ).length,
    0,
  );
});

test("passes non-linguistic input straight through", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  const result = await translator.translate("🙂🙂");
  assert.equal(result.text, "🙂🙂");
  assert.equal(fake.requests.length, 0);
});

test("retries once when the model damages placeholders", async () => {
  let attempts = 0;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    attempts += 1;
    const messages = (JSON.parse(String(init?.body)) as { messages: { content: string }[] }).messages;
    const user = messages[messages.length - 1]!.content;
    const content = attempts === 1 ? "translated" : `[ok]${user}`;
    return new Response(JSON.stringify({ model: "m", choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const translator = new Translator({ config: makeConfig(), fetchImpl });
  const result = await translator.translate("Open `index.html` in the browser.");
  assert.equal(attempts, 2);
  assert.ok(result.text.includes("`index.html`"), result.text);
  assert.ok(result.warnings.some((warning) => warning.includes("placeholder")));
});

test("requires a provider for translation", async () => {
  const translator = new Translator({
    config: { version: CONFIG_VERSION, providers: [], activeProviderId: null, settings: structuredClone(DEFAULT_SETTINGS) },
  });
  await assert.rejects(
    () => translator.translate("hello"),
    (error: unknown) => isTranslatorError(error) && error.code === "provider_not_found",
  );
});

test("streams deltas and a final result", async () => {
  const fake = createFakeProvider({ marker: () => "你好世界" });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  let text = "";
  let finished = false;
  for await (const event of translator.streamTranslate("Hello world, how are you?")) {
    if (event.type === "delta") text += event.text;
    if (event.type === "done") {
      finished = true;
      assert.equal(event.result.text, "你好世界");
      assert.equal(event.result.source.language, "en-US");
    }
  }
  assert.equal(text, "你好世界");
  assert.equal(finished, true);
});

test("translates arrays with bounded concurrency", async () => {
  const fake = createFakeProvider({ marker });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  const results = await translator.translate(["Hello there friend.", "Goodbye for now."], { concurrency: 2 });
  assert.equal(results.length, 2);
  assert.ok(results[0]!.text.startsWith("<Chinese (Simplified)>"));
  assert.equal(fake.requests.length, 2);
});

test("exposes provider models and health", async () => {
  const fake = createFakeProvider();
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  assert.deepEqual(await translator.listModels(), ["fake-model", "fake-model-mini"]);
  const health = await translator.checkProvider();
  assert.equal(health.ok, true);
});

test("surfaces provider failures as TranslatorError", async () => {
  const fake = createFakeProvider({ failWith: { status: 429, message: "rate limited" } });
  const translator = new Translator({ config: makeConfig(), fetchImpl: fake.fetchImpl });
  await assert.rejects(
    () => translator.translate("Hello world."),
    (error: unknown) => isTranslatorError(error) && error.code === "rate_limited",
  );
});

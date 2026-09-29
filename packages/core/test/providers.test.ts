import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicProvider } from "../src/providers/anthropic.ts";
import { GoogleProvider } from "../src/providers/google.ts";
import { MockProvider } from "../src/providers/mock.ts";
import { OpenAiCompatibleProvider, extractOpenAiText } from "../src/providers/openai-compatible.ts";
import { joinUrl, normalizeUsage } from "../src/providers/http.ts";
import { createProvider, providerConfigFromPreset, testProvider, uniqueProviderId } from "../src/providers/registry.ts";
import { isTranslatorError } from "../src/errors.ts";
import { createFakeProvider, jsonResponse, sseResponse } from "./helpers.ts";

test("openai-compatible chat sends an authenticated chat completion request", async () => {
  const fake = createFakeProvider({ marker: () => "你好" });
  const provider = new OpenAiCompatibleProvider({
    id: "openai",
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-secret",
    fetchImpl: fake.fetchImpl,
  });
  const result = await provider.chat([{ role: "user", content: "hello" }], { temperature: 0.1 });
  assert.equal(result.text, "你好");
  assert.equal(result.model, "fake-model");
  assert.equal(result.usage?.totalTokens, 12);
  const request = fake.requests[0]!;
  assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(request.headers["authorization"], "Bearer sk-secret");
  assert.equal(request.body?.model, "gpt-4o-mini");
  assert.equal(request.body?.temperature, 0.1);
  assert.equal(request.body?.stream, undefined);
});

test("openai-compatible surfaces HTTP failures as typed errors", async () => {
  const fake = createFakeProvider({ failWith: { status: 401, message: "Invalid API key" } });
  const provider = new OpenAiCompatibleProvider({
    id: "openai",
    model: "gpt-4o-mini",
    apiKey: "bad",
    fetchImpl: fake.fetchImpl,
  });
  await assert.rejects(
    () => provider.chat([{ role: "user", content: "hi" }]),
    (error: unknown) => {
      assert.ok(isTranslatorError(error));
      assert.equal(error.code, "auth_failed");
      assert.equal(error.status, 401);
      assert.match(error.message, /Invalid API key/);
      return true;
    },
  );
});

test("openai-compatible streams deltas", async () => {
  const fake = createFakeProvider({ marker: () => "你好，世界" });
  const provider = new OpenAiCompatibleProvider({
    id: "openai",
    model: "gpt-4o-mini",
    fetchImpl: fake.fetchImpl,
  });
  let text = "";
  let done = false;
  for await (const chunk of provider.stream([{ role: "user", content: "hello" }])) {
    text += chunk.delta;
    if (chunk.done) done = true;
  }
  assert.equal(text, "你好，世界");
  assert.equal(done, true);
  assert.equal(fake.requests[0]?.body?.stream, true);
});

test("openai-compatible lists models", async () => {
  const fake = createFakeProvider();
  const provider = new OpenAiCompatibleProvider({ id: "openai", model: "m", fetchImpl: fake.fetchImpl });
  assert.deepEqual(await provider.listModels(), ["fake-model", "fake-model-mini"]);
});

test("openai-compatible requires a model", async () => {
  const provider = new OpenAiCompatibleProvider({ id: "openai", model: "" });
  await assert.rejects(() => provider.chat([{ role: "user", content: "hi" }]), /no model configured/);
});

test("openai content parts are flattened", () => {
  assert.equal(extractOpenAiText("plain"), "plain");
  assert.equal(extractOpenAiText([{ type: "text", text: "a" }, { text: "b" }]), "ab");
  assert.equal(extractOpenAiText(undefined), "");
});

test("anthropic sends a messages request with a system prompt", async () => {
  const fake = createFakeProvider({ marker: () => "ok" });
  const original = fake.fetchImpl;
  const calls: Record<string, unknown>[] = [];
  const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: init?.headers, body: init?.body });
    if (String(input).includes("/v1/messages")) {
      return jsonResponse({
        model: "claude-3-5-haiku-latest",
        content: [{ type: "text", text: "译文" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 4, output_tokens: 6 },
      });
    }
    return original(input, init);
  }) as typeof fetch;
  const anthropic = new AnthropicProvider({
    id: "anthropic",
    model: "claude-3-5-haiku-latest",
    apiKey: "sk-ant",
    fetchImpl: wrapped,
  });
  const result = await anthropic.chat([
    { role: "system", content: "You translate." },
    { role: "user", content: "hello" },
  ]);
  assert.equal(result.text, "译文");
  assert.equal(result.finishReason, "end_turn");
  assert.equal(result.usage?.totalTokens, 10);
  const request = calls[0]!;
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  const headers = request.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "sk-ant");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(String(request.body)) as Record<string, unknown>;
  assert.equal(body.system, "You translate.");
  assert.equal(body.max_tokens, 4096);
  assert.deepEqual(body.messages, [{ role: "user", content: "hello" }]);
});

test("google sends a generateContent request and parses candidates", async () => {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    if (String(input).endsWith("/models")) {
      return jsonResponse({ models: [{ name: "models/gemini-2.0-flash" }, { name: "models/gemini-1.5-pro" }] });
    }
    return jsonResponse({
      candidates: [{ content: { parts: [{ text: "你好" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
    });
  }) as typeof fetch;
  const provider = new GoogleProvider({
    id: "google",
    model: "gemini-2.0-flash",
    apiKey: "goog-key",
    fetchImpl,
  });
  const result = await provider.chat([
    { role: "system", content: "Translate." },
    { role: "user", content: "hello" },
  ]);
  assert.equal(result.text, "你好");
  assert.equal(result.usage?.totalTokens, 7);
  assert.equal(
    calls[0]!.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
  );
  assert.equal(calls[0]!.headers["x-goog-api-key"], "goog-key");
  assert.deepEqual(calls[0]!.body.systemInstruction, { parts: [{ text: "Translate." }] });
  assert.equal(await provider.listModels().then((models) => models[0]), "gemini-2.0-flash");
});

test("google streaming appends SSE candidates", async () => {
  const fetchImpl = (async () =>
    sseResponse([
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "你" }] } }] })}\n\n`,
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "好" }] } }] })}\n\n`,
    ])) as unknown as typeof fetch;
  const provider = new GoogleProvider({ id: "google", model: "gemini-2.0-flash", apiKey: "k", fetchImpl });
  let text = "";
  for await (const chunk of provider.stream([{ role: "user", content: "hi" }])) text += chunk.delta;
  assert.equal(text, "你好");
});

test("mock provider translates from its dictionary and streams", async () => {
  const provider = new MockProvider({ id: "mock", model: "mock-1", latencyMs: 0 });
  const result = await provider.chat([
    { role: "system", content: "Translate the user's text from English (en-US) into Chinese (Simplified)." },
    { role: "user", content: "hello world" },
  ]);
  assert.equal(result.text, "你好，世界");
  let streamed = "";
  for await (const chunk of provider.stream(
    [
      { role: "system", content: "Translate the user's text from English (en-US) into Chinese (Simplified)." },
      { role: "user", content: "hello world" },
    ],
    {},
  )) {
    streamed += chunk.delta;
  }
  assert.equal(streamed, "你好，世界");
});

test("registry builds the right provider class per kind", () => {
  assert.ok(createProvider({ id: "a", kind: "openai-compatible", model: "m" }) instanceof OpenAiCompatibleProvider);
  assert.ok(createProvider({ id: "b", kind: "anthropic", model: "m" }) instanceof AnthropicProvider);
  assert.ok(createProvider({ id: "c", kind: "google", model: "m" }) instanceof GoogleProvider);
  assert.ok(createProvider({ id: "d", kind: "mock", model: "mock-1" }) instanceof MockProvider);
});

test("presets seed provider configs with unique ids", () => {
  const first = providerConfigFromPreset("deepseek", []);
  assert.equal(first.id, "deepseek");
  assert.equal(first.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(first.kind, "openai-compatible");
  const second = providerConfigFromPreset("deepseek", [first]);
  assert.equal(second.id, "deepseek-2");
  assert.equal(uniqueProviderId([{ id: "x", kind: "mock", model: "m" }], "x"), "x-2");
  assert.throws(() => providerConfigFromPreset("nope", []), /Unknown provider preset/);
});

test("testProvider reports health for good and bad endpoints", async () => {
  const good = createFakeProvider();
  const healthy = await testProvider(
    { id: "openai", kind: "openai-compatible", model: "m", apiKey: "k" },
    { fetchImpl: good.fetchImpl },
  );
  assert.equal(healthy.ok, true);
  assert.equal(healthy.models?.length, 2);

  const bad = createFakeProvider({ failWith: { status: 500, message: "boom" } });
  const unhealthy = await testProvider(
    { id: "openai", kind: "openai-compatible", model: "m", apiKey: "k" },
    { fetchImpl: bad.fetchImpl },
  );
  assert.equal(unhealthy.ok, false);
  assert.equal(unhealthy.code, "server_error");
});

test("http helpers normalize urls and usage payloads", () => {
  assert.equal(joinUrl("https://api.test/v1/", "/chat/completions"), "https://api.test/v1/chat/completions");
  assert.equal(joinUrl("https://api.test/v1", "https://other/x"), "https://other/x");
  assert.deepEqual(normalizeUsage({ prompt_tokens: 1, completion_tokens: 2 }), {
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
  });
  assert.equal(normalizeUsage({}), undefined);
  assert.equal(normalizeUsage(null), undefined);
});

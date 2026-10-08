import assert from "node:assert/strict";
import { test } from "node:test";
import { formatGlossaryText, parseGlossaryText, shortcutLabel } from "../src/format.ts";

test("names the shortcut key that is printed on the keyboard", () => {
  for (const platform of ["MacIntel", "darwin", "iPhone"]) {
    assert.equal(shortcutLabel(platform), "⌥⇧T", platform);
  }
  for (const platform of ["Win32", "Linux x86_64", ""]) {
    assert.equal(shortcutLabel(platform), "Alt+Shift+T", platform);
  }
});

test("glossary text converts to entries and back", () => {
  const text = "cluster = 集群\nprompt = 提示词\n# comment\nbroken line";
  assert.deepEqual(parseGlossaryText(text), [
    { source: "cluster", target: "集群" },
    { source: "prompt", target: "提示词" },
  ]);
  assert.equal(formatGlossaryText(parseGlossaryText(text)), "cluster = 集群\nprompt = 提示词");
});


import { AUTO_LANGUAGE, LANGUAGES, type LanguageTag, languageLabel } from "./language.ts";

export type Tone =
  | "neutral"
  | "formal"
  | "informal"
  | "technical"
  | "marketing"
  | "academic"
  | "literal";

export const TONES: readonly Tone[] = [
  "neutral",
  "formal",
  "informal",
  "technical",
  "marketing",
  "academic",
  "literal",
];

export const TONE_INSTRUCTIONS: Record<Tone, string> = {
  neutral: "",
  formal: "Use a formal, respectful register (written business style).",
  informal: "Use a casual, conversational register suitable for chat.",
  technical: "Use precise technical terminology; keep API, CLI, and config identifiers in the original form.",
  marketing: "Use vivid, persuasive marketing copy that reads natively in the target language.",
  academic: "Use an academic register with precise, neutral scholarly wording.",
  literal: "Translate literally and closely follow the source structure, even if the result sounds slightly unnatural.",
};

export interface GlossaryEntry {
  source: string;
  target: string;
  caseSensitive?: boolean;
  note?: string;
}

export interface PromptOptions {
  source: LanguageTag | typeof AUTO_LANGUAGE;
  target: LanguageTag;
  detectedSource?: LanguageTag;
  tone?: Tone;
  domain?: string;
  audience?: string;
  glossary?: readonly GlossaryEntry[];
  context?: string;
  preserveFormatting?: boolean;
  systemPromptOverride?: string;
  extraInstructions?: string;
  sourceLanguageName?: string;
  targetLanguageName?: string;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

export interface BatchPromptResult extends BuiltPrompt {
  segments: string[];
}

export const PLACEHOLDER_HINT = "\uE000";

function languagePhrase(tag: LanguageTag | typeof AUTO_LANGUAGE, detected?: LanguageTag): string {
  const effective = tag === AUTO_LANGUAGE ? detected : tag;
  if (!effective || effective === AUTO_LANGUAGE) return "the source language (auto-detect it)";
  return `${languageLabel(effective, "en")} (${effective})`;
}

function glossaryBlock(glossary: readonly GlossaryEntry[] | undefined): string {
  const entries = (glossary ?? []).filter((entry) => entry.source && entry.target);
  if (entries.length === 0) return "";
  const lines = entries.map((entry) => {
    const suffix = entry.note ? ` (${entry.note})` : "";
    const flag = entry.caseSensitive ? " [case-sensitive]" : "";
    return `- "${entry.source}"${flag} → "${entry.target}"${suffix}`;
  });
  return [
    "Terminology constraints — whenever a source term below appears, you MUST use the mandated translation exactly:",
    ...lines,
  ].join("\n");
}

export function buildSystemPrompt(options: PromptOptions): string {
  if (options.systemPromptOverride?.trim()) {
    return options.systemPromptOverride.trim();
  }
  const sourceLabel = options.sourceLanguageName
    ? `${options.sourceLanguageName} (${options.source})`
    : languagePhrase(options.source, options.detectedSource);
  const targetLabel = options.targetLanguageName
    ? `${options.targetLanguageName} (${options.target})`
    : languageLabel(options.target, "en");

  const rules: string[] = [
    "Output only the translation. Never add explanations, prefaces, notes, alternatives, or commentary.",
    "Preserve the original meaning, intent, and level of detail. Render idioms with natural equivalents instead of word-for-word literals.",
    "Keep placeholder tokens such as \uE0000\uE001 or [[T0]] byte-for-byte identical: never translate, reorder, split, renumber, or drop them.",
    `Write natural, idiomatic ${targetLabel}; do not keep source-language word order when it reads awkwardly.`,
    "Do not translate proper nouns, brand names, product names, code identifiers, or file paths unless an established translation exists.",
    `If the text is already written in ${targetLabel}, return it unchanged.`,
  ];

  if (options.preserveFormatting !== false) {
    rules.push(
      "Preserve markdown structure, headings, list markers, numbering, punctuation style, and line breaks exactly as they appear.",
    );
  }
  if (options.source === AUTO_LANGUAGE) {
    const hint = options.detectedSource
      ? `The source language was auto-detected as ${options.detectedSource}. If the text is in fact a different language, translate from that language instead.`
      : "Detect the source language yourself before translating.";
    rules.push(hint);
  }
  if (options.tone && TONE_INSTRUCTIONS[options.tone]) {
    rules.push(TONE_INSTRUCTIONS[options.tone]);
  }
  if (options.domain) rules.push(`Domain / subject matter: ${options.domain}.`);
  if (options.audience) rules.push(`Target audience: ${options.audience}.`);
  if (options.extraInstructions) rules.push(options.extraInstructions.trim());

  const sections = [
    `You are a professional translator. Translate the user's text from ${sourceLabel} into ${targetLabel}.`,
    rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n"),
  ];
  const glossary = glossaryBlock(options.glossary);
  if (glossary) sections.push(glossary);
  if (options.context?.trim()) {
    sections.push(
      `Background context (for reference only — do NOT translate or repeat it):\n${options.context.trim()}`,
    );
  }
  return sections.join("\n\n");
}

export function buildTranslationPrompt(options: PromptOptions & { text: string }): BuiltPrompt {
  return {
    system: buildSystemPrompt(options),
    user: options.text,
  };
}

export function buildBatchPrompt(
  options: PromptOptions & { segments: readonly string[] },
): BatchPromptResult {
  const segments = [...options.segments];
  const base = buildSystemPrompt(options);
  const system = [
    base,
    [
      `You will receive a JSON array of ${segments.length} strings.`,
      "Translate every element independently, keeping the array order intact.",
      'Respond with strict JSON of the form {"translations": ["...", "..."]} with exactly the same number of elements.',
      "Do not merge, split, reorder, or omit elements. Do not add markdown fences around the JSON.",
    ].join(" "),
  ].join("\n\n");
  return { system, user: JSON.stringify(segments), segments };
}

export interface DetectionPromptOptions {
  candidates?: readonly LanguageTag[];
  text: string;
}

export function buildDetectionPrompt(options: DetectionPromptOptions): BuiltPrompt {
  const candidates = options.candidates?.length
    ? options.candidates
    : LANGUAGES.map((language) => language.tag);
  const system = [
    "You are a language identification engine.",
    "Read the user's text and reply with exactly one language tag from the allowed list, and nothing else.",
    "Never explain, translate, or add punctuation.",
    `Allowed tags: ${candidates.join(", ")}.`,
  ].join(" ");
  return { system, user: options.text };
}

export function parseBatchResponse(raw: string, expected: number): string[] {
  const trimmed = raw.trim().replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "").trim();
  const attempt = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };
  let parsed = attempt(trimmed);
  if (parsed === undefined) {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) parsed = attempt(trimmed.slice(start, end + 1));
  }
  const array = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { translations?: unknown })?.translations)
      ? (parsed as { translations: unknown[] }).translations
      : undefined;
  if (!array) {
    throw new Error("Batch translation response was not valid JSON");
  }
  if (array.length !== expected) {
    throw new Error(
      `Batch translation returned ${array.length} items but ${expected} were requested`,
    );
  }
  return array.map((item) => (typeof item === "string" ? item : String(item ?? "")));
}

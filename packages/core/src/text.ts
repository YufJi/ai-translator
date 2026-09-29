export interface PlaceholderToken {
  id: string;
  value: string;
  kind: string;
}

export interface ProtectOptions {
  style?: "pua" | "plain";
  protectCode?: boolean;
  protectUrls?: boolean;
  protectVariables?: boolean;
  protectMarkup?: boolean;
}

export interface ProtectedText {
  text: string;
  tokens: PlaceholderToken[];
  restore: (output: string) => string;
}

const PUA_OPEN = "\uE000";
const PUA_CLOSE = "\uE001";
const PLAIN_OPEN = "[[T";
const PLAIN_CLOSE = "]]";

interface ProtectRule {
  kind: string;
  pattern: RegExp;
}

const CODE_FENCE = /(?<=\n|^)( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\1\2[ \t]*(?=\n|$)|$)/g;
const INLINE_CODE = /`[^`\n]+`/g;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)]/gi;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const MARKUP = /<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*?)?\/?>/g;
const PRINTF_INDEXED = /%\d+\$[sdif]/g;
const PRINTF_SIMPLE = /%(?:\.\d+)?[sdif%]/g;
const TEMPLATE_VAR = /\{\{[\s\S]{0,120}?\}\}|\$\{[^{}\n]{1,120}\}|\{[A-Za-z_][\w.]{0,60}\}|\{0\}/g;
const ICU_PLURAL = /\{[^{}]*,\s*(?:plural|select|selectordinal)\b[\s\S]{0,200}?\}/g;
const EMOJI_ZWJ = /(?:\p{Extended_Pictographic}\u200D)+\p{Extended_Pictographic}/gu;

function escapeForCharacterClass(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function protectText(input: string, options: ProtectOptions = {}): ProtectedText {
  const style = options.style ?? "pua";
  const open = style === "pua" ? PUA_OPEN : PLAIN_OPEN;
  const close = style === "pua" ? PUA_CLOSE : PLAIN_CLOSE;
  const tokens: PlaceholderToken[] = [];

  const rules: ProtectRule[] = [];
  if (options.protectCode !== false) {
    rules.push({ kind: "code-fence", pattern: CODE_FENCE });
    rules.push({ kind: "inline-code", pattern: INLINE_CODE });
  }
  if (options.protectVariables !== false) {
    rules.push({ kind: "icu-plural", pattern: ICU_PLURAL });
    rules.push({ kind: "template-var", pattern: TEMPLATE_VAR });
    rules.push({ kind: "printf", pattern: PRINTF_INDEXED });
    rules.push({ kind: "printf", pattern: PRINTF_SIMPLE });
  }
  if (options.protectUrls !== false) {
    rules.push({ kind: "url", pattern: URL });
    rules.push({ kind: "email", pattern: EMAIL });
  }
  if (options.protectMarkup !== false) {
    rules.push({ kind: "markup", pattern: MARKUP });
  }
  rules.push({ kind: "emoji", pattern: EMOJI_ZWJ });

  let text = input;
  for (const rule of rules) {
    text = text.replace(rule.pattern, (match) => {
      const id = String(tokens.length);
      tokens.push({ id, value: match, kind: rule.kind });
      return `${open}${id}${close}`;
    });
  }

  const restorePattern =
    style === "pua"
      ? new RegExp(`${PUA_OPEN}\\s*(\\d+)\\s*${PUA_CLOSE}`, "g")
      : new RegExp(`${escapeForCharacterClass(PLAIN_OPEN)}\\s*(\\d+)\\s*${escapeForCharacterClass(PLAIN_CLOSE)}`, "g");
  const fallbackPattern = new RegExp(
    `${escapeForCharacterClass(PLAIN_OPEN)}\\s*(\\d+)\\s*${escapeForCharacterClass(PLAIN_CLOSE)}|${PUA_OPEN}\\s*(\\d+)\\s*${PUA_CLOSE}`,
    "g",
  );

  const swap = (output: string): string =>
    output.replace(style === "pua" ? restorePattern : fallbackPattern, (match, ...groups) => {
      const raw = (groups[0] ?? groups[1]) as string | undefined;
      const token = raw === undefined ? undefined : tokens[Number(raw)];
      return token ? token.value : match;
    });

  return {
    text,
    tokens,
    restore: swap,
  };
}

export function countPlaceholders(text: string): number {
  const matches = text.match(new RegExp(`${PUA_OPEN}\\s*(\\d+)\\s*${PUA_CLOSE}`, "g"));
  const plain = text.match(/\[\[T\s*(\d+)\s*\]\]/g);
  return (matches?.length ?? 0) + (plain?.length ?? 0);
}

export interface SentenceUnit {
  text: string;
  trailing: string;
}

const STRONG_TERMINATORS = new Set(["。", "！", "？", "…", ".", "!", "?", "\u2028", "\u2029", "\n"]);
const CLOSERS = new Set(["」", "』", "】", "）》", "）", ")", "]", "}", "”", "’", '"', "'", "»", "›"]);
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "eg", "ie",
  "fig", "no", "vol", "approx", "dept", "est", "inc", "ltd", "co", "corp", "al", "ca", "cf",
  "min", "max", "sec", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct",
  "nov", "dec",
]);

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function endsWithAbbreviation(fragment: string): boolean {
  const match = /([A-Za-z.]{1,12})$/.exec(fragment);
  if (!match) return false;
  const raw = match[1]!.toLowerCase().replace(/\.$/, "");
  if (raw.includes(".")) {
    return ABBREVIATIONS.has(raw) || /^[a-z]\.[a-z]$/.test(raw);
  }
  return ABBREVIATIONS.has(raw);
}

export function splitSentences(input: string): SentenceUnit[] {
  const units: SentenceUnit[] = [];
  let buffer = "";
  let index = 0;
  const pushUnit = (): void => {
    if (buffer.length === 0) return;
    let cut = buffer.length;
    while (cut > 0 && /\s/.test(buffer[cut - 1]!)) cut -= 1;
    const text = buffer.slice(0, cut);
    const trailing = buffer.slice(cut);
    if (text.length === 0) {
      const previous = units[units.length - 1];
      if (previous) previous.trailing += trailing;
      else units.push({ text, trailing });
    } else {
      units.push({ text, trailing });
    }
    buffer = "";
  };

  while (index < input.length) {
    const char = input[index]!;
    buffer += char;
    index += 1;

    if (!STRONG_TERMINATORS.has(char)) continue;
    if (char === ".") {
      const previous = input[index - 2];
      const next = input[index];
      if (isDigit(previous) && isDigit(next)) continue;
      if (next !== undefined && !/[\s"'’”)\]}»›]/.test(next) && !CLOSERS.has(next) && next !== "\n") {
        continue;
      }
      if (endsWithAbbreviation(buffer)) continue;
    }
    while (index < input.length && CLOSERS.has(input[index]!)) {
      buffer += input[index]!;
      index += 1;
    }
    while (index < input.length && /[。！？…!?]/.test(input[index]!)) {
      buffer += input[index]!;
      index += 1;
    }
    while (index < input.length && /[ \t]/.test(input[index]!)) {
      buffer += input[index]!;
      index += 1;
    }
    if (char === "\n" && index < input.length && input[index] === "\n") {
      while (index < input.length && input[index] === "\n") {
        buffer += input[index]!;
        index += 1;
      }
    }
    pushUnit();
  }
  pushUnit();
  return units;
}

function hardSplit(fragment: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = fragment;
  while (rest.length > maxChars) {
    const floor = Math.floor(maxChars * 0.5);
    let cut = rest.lastIndexOf(" ", maxChars - 1);
    if (cut < floor) cut = rest.lastIndexOf("\u3000", maxChars - 1);
    if (cut < floor) {
      pieces.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
      continue;
    }
    pieces.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces;
}

export function chunkText(input: string, maxChars: number): string[] {
  if (!Number.isFinite(maxChars) || maxChars <= 0 || input.length <= maxChars) return [input];
  const units = splitSentences(input);
  const chunks: string[] = [];
  let current = "";
  let pending = "";
  const flush = (): void => {
    if (current.length > 0) chunks.push(current);
    current = "";
  };
  const append = (fragment: string): void => {
    for (const piece of hardSplit(fragment, maxChars)) {
      if (current.length + piece.length > maxChars) flush();
      current += piece;
    }
  };
  for (const unit of units) {
    append(pending + unit.text);
    pending = "";
    if (current.length + unit.trailing.length > maxChars) {
      flush();
      pending = unit.trailing;
      continue;
    }
    current += unit.trailing;
  }
  append(pending);
  flush();
  return chunks.length > 0 ? chunks : [input];
}

const LEADING_LABEL =
  /^\s*(?:translation|translated text|translated|output|result|译文|翻译|翻译结果|訳文|翻訳|번역)\s*[:：]\s*/i;
const LEADING_FENCE = /^\s*```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```\s*$/;

export function cleanModelOutput(raw: string): string {
  let output = raw.trim();
  const fence = LEADING_FENCE.exec(output);
  if (fence) output = fence[1]!.trim();
  output = output.replace(LEADING_LABEL, "");
  if (output.length > 1) {
    const first = output[0]!;
    const last = output[output.length - 1]!;
    const pairs: Record<string, string> = { '"': '"', "'": "'", "“": "”", "「": "」", "『": "』" };
    if (pairs[first] === last && !output.slice(1, -1).includes(last)) {
      output = output.slice(1, -1);
    }
  }
  return output.trim();
}

export interface TextStats {
  characters: number;
  charactersWithoutSpaces: number;
  words: number;
  lines: number;
}

export function textStats(text: string): TextStats {
  const characters = [...text].length;
  const charactersWithoutSpaces = [...text.replace(/\s/gu, "")].length;
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu);
  const latinWords = text.match(/[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]+/gu);
  return {
    characters,
    charactersWithoutSpaces,
    words: (latinWords?.length ?? 0) + (cjk?.length ?? 0),
    lines: text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length,
  };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

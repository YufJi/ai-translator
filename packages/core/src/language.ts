export type ScriptName =
  | "Han"
  | "Hiragana"
  | "Katakana"
  | "Hangul"
  | "Latin"
  | "Cyrillic"
  | "Arabic"
  | "Hebrew"
  | "Greek"
  | "Thai"
  | "Devanagari";

export const AUTO_LANGUAGE = "auto";
export type AutoLanguage = typeof AUTO_LANGUAGE;
export type LanguageTag = string;

export interface LanguageDef {
  readonly tag: LanguageTag;
  readonly name: string;
  readonly englishName: string;
  readonly nativeName: string;
  readonly scripts: readonly ScriptName[];
  readonly rtl?: boolean;
  readonly aliases: readonly string[];
}

export const LANGUAGES: readonly LanguageDef[] = [
  {
    tag: "zh-Hans",
    name: "简体中文",
    englishName: "Chinese (Simplified)",
    nativeName: "简体中文",
    scripts: ["Han"],
    aliases: ["zh", "zh-cn", "zh-sg", "zh-hans", "chs", "cn", "中文", "简体", "简体中文", "汉语", "普通话"],
  },
  {
    tag: "zh-Hant",
    name: "繁体中文",
    englishName: "Chinese (Traditional)",
    nativeName: "繁體中文",
    scripts: ["Han"],
    aliases: ["zh-tw", "zh-hk", "zh-mo", "zh-hant", "cht", "tw", "hk", "繁体", "繁体中文", "繁體", "繁體中文"],
  },
  {
    tag: "en-US",
    name: "英语（美国）",
    englishName: "English (United States)",
    nativeName: "English (US)",
    scripts: ["Latin"],
    aliases: ["en", "en-us", "en_us", "english", "us", "america", "american english", "英语", "美式英语", "英文"],
  },
  {
    tag: "en-GB",
    name: "英语（英国）",
    englishName: "English (United Kingdom)",
    nativeName: "English (UK)",
    scripts: ["Latin"],
    aliases: ["en-gb", "en-uk", "british english", "英式英语"],
  },
  {
    tag: "ja",
    name: "日语",
    englishName: "Japanese",
    nativeName: "日本語",
    scripts: ["Hiragana", "Katakana", "Han"],
    aliases: ["jp", "ja-jp", "japanese", "日本語", "日语", "日文"],
  },
  {
    tag: "ko",
    name: "韩语",
    englishName: "Korean",
    nativeName: "한국어",
    scripts: ["Hangul", "Han"],
    aliases: ["kr", "ko-kr", "korean", "한국어", "韩语", "韩文"],
  },
  {
    tag: "fr",
    name: "法语",
    englishName: "French",
    nativeName: "Français",
    scripts: ["Latin"],
    aliases: ["fr-fr", "french", "français", "francais", "法语", "法文"],
  },
  {
    tag: "de",
    name: "德语",
    englishName: "German",
    nativeName: "Deutsch",
    scripts: ["Latin"],
    aliases: ["de-de", "german", "deutsch", "德语", "德文"],
  },
  {
    tag: "es",
    name: "西班牙语",
    englishName: "Spanish",
    nativeName: "Español",
    scripts: ["Latin"],
    aliases: ["es-es", "es-419", "spanish", "español", "espanol", "西班牙语", "西班牙文"],
  },
  {
    tag: "pt-BR",
    name: "葡萄牙语（巴西）",
    englishName: "Portuguese (Brazil)",
    nativeName: "Português (Brasil)",
    scripts: ["Latin"],
    aliases: ["pt", "pt-br", "pt_br", "portuguese", "português", "portugues", "葡萄牙语", "葡语"],
  },
  {
    tag: "it",
    name: "意大利语",
    englishName: "Italian",
    nativeName: "Italiano",
    scripts: ["Latin"],
    aliases: ["it-it", "italian", "italiano", "意大利语"],
  },
  {
    tag: "ru",
    name: "俄语",
    englishName: "Russian",
    nativeName: "Русский",
    scripts: ["Cyrillic"],
    aliases: ["ru-ru", "russian", "русский", "俄语", "俄文"],
  },
  {
    tag: "uk",
    name: "乌克兰语",
    englishName: "Ukrainian",
    nativeName: "Українська",
    scripts: ["Cyrillic"],
    aliases: ["uk-ua", "ukrainian", "українська", "乌克兰语"],
  },
  {
    tag: "ar",
    name: "阿拉伯语",
    englishName: "Arabic",
    nativeName: "العربية",
    scripts: ["Arabic"],
    rtl: true,
    aliases: ["ar-sa", "ar-eg", "arabic", "العربية", "阿拉伯语"],
  },
  {
    tag: "he",
    name: "希伯来语",
    englishName: "Hebrew",
    nativeName: "עברית",
    scripts: ["Hebrew"],
    rtl: true,
    aliases: ["iw", "he-il", "hebrew", "עברית", "希伯来语"],
  },
  {
    tag: "hi",
    name: "印地语",
    englishName: "Hindi",
    nativeName: "हिन्दी",
    scripts: ["Devanagari"],
    aliases: ["hi-in", "hindi", "हिन्दी", "印地语"],
  },
  {
    tag: "th",
    name: "泰语",
    englishName: "Thai",
    nativeName: "ไทย",
    scripts: ["Thai"],
    aliases: ["th-th", "thai", "ไทย", "泰语"],
  },
  {
    tag: "vi",
    name: "越南语",
    englishName: "Vietnamese",
    nativeName: "Tiếng Việt",
    scripts: ["Latin"],
    aliases: ["vi-vn", "vietnamese", "tiếng việt", "越南语"],
  },
  {
    tag: "id",
    name: "印尼语",
    englishName: "Indonesian",
    nativeName: "Bahasa Indonesia",
    scripts: ["Latin"],
    aliases: ["id-id", "in", "indonesian", "bahasa indonesia", "印尼语"],
  },
  {
    tag: "ms",
    name: "马来语",
    englishName: "Malay",
    nativeName: "Bahasa Melayu",
    scripts: ["Latin"],
    aliases: ["ms-my", "malay", "bahasa melayu", "马来语"],
  },
  {
    tag: "tr",
    name: "土耳其语",
    englishName: "Turkish",
    nativeName: "Türkçe",
    scripts: ["Latin"],
    aliases: ["tr-tr", "turkish", "türkçe", "土耳其语"],
  },
  {
    tag: "nl",
    name: "荷兰语",
    englishName: "Dutch",
    nativeName: "Nederlands",
    scripts: ["Latin"],
    aliases: ["nl-nl", "dutch", "nederlands", "荷兰语"],
  },
  {
    tag: "pl",
    name: "波兰语",
    englishName: "Polish",
    nativeName: "Polski",
    scripts: ["Latin"],
    aliases: ["pl-pl", "polish", "polski", "波兰语"],
  },
  {
    tag: "sv",
    name: "瑞典语",
    englishName: "Swedish",
    nativeName: "Svenska",
    scripts: ["Latin"],
    aliases: ["sv-se", "swedish", "svenska", "瑞典语"],
  },
  {
    tag: "da",
    name: "丹麦语",
    englishName: "Danish",
    nativeName: "Dansk",
    scripts: ["Latin"],
    aliases: ["da-dk", "danish", "dansk", "丹麦语"],
  },
  {
    tag: "nb",
    name: "挪威语",
    englishName: "Norwegian",
    nativeName: "Norsk",
    scripts: ["Latin"],
    aliases: ["no", "no-no", "nn", "norwegian", "norsk", "挪威语"],
  },
  {
    tag: "fi",
    name: "芬兰语",
    englishName: "Finnish",
    nativeName: "Suomi",
    scripts: ["Latin"],
    aliases: ["fi-fi", "finnish", "suomi", "芬兰语"],
  },
  {
    tag: "cs",
    name: "捷克语",
    englishName: "Czech",
    nativeName: "Čeština",
    scripts: ["Latin"],
    aliases: ["cs-cz", "czech", "čeština", "cestina", "捷克语"],
  },
  {
    tag: "ro",
    name: "罗马尼亚语",
    englishName: "Romanian",
    nativeName: "Română",
    scripts: ["Latin"],
    aliases: ["ro-ro", "romanian", "română", "romana", "罗马尼亚语"],
  },
  {
    tag: "hu",
    name: "匈牙利语",
    englishName: "Hungarian",
    nativeName: "Magyar",
    scripts: ["Latin"],
    aliases: ["hu-hu", "hungarian", "magyar", "匈牙利语"],
  },
  {
    tag: "el",
    name: "希腊语",
    englishName: "Greek",
    nativeName: "Ελληνικά",
    scripts: ["Greek"],
    aliases: ["el-gr", "greek", "ελληνικά", "希腊语"],
  },
];

const BY_TAG = new Map<string, LanguageDef>();
const BY_ALIAS = new Map<string, LanguageDef>();

export function normalizeLanguageId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[()（）]/g, " ")
    .replace(/[_–—]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

for (const def of LANGUAGES) {
  BY_TAG.set(def.tag.toLowerCase(), def);
  BY_ALIAS.set(def.tag.toLowerCase(), def);
  const base = def.tag.split("-")[0]!.toLowerCase();
  if (!BY_ALIAS.has(base)) BY_ALIAS.set(base, def);
  for (const alias of def.aliases) {
    const key = normalizeLanguageId(alias);
    if (!BY_ALIAS.has(key)) BY_ALIAS.set(key, def);
  }
}

const TAG_OVERRIDES = new Map<string, string>([["zh-hans-cn", "zh-Hans"]]);

export function resolveLanguage(input: string | null | undefined): LanguageDef | undefined {
  if (!input) return undefined;
  const key = normalizeLanguageId(input);
  if (!key || key === AUTO_LANGUAGE) return undefined;
  const overridden = TAG_OVERRIDES.get(key);
  if (overridden) return BY_TAG.get(overridden.toLowerCase());
  const exact = BY_ALIAS.get(key);
  if (exact) return exact;
  const base = key.split("-")[0]!;
  return BY_ALIAS.get(base);
}

export function normalizeLanguageTag(input: string): LanguageTag {
  return resolveLanguage(input)?.tag ?? input;
}

export function getLanguage(tag: LanguageTag): LanguageDef | undefined {
  return BY_TAG.get(tag.toLowerCase());
}

export function requireLanguage(tag: LanguageTag): LanguageDef {
  const def = getLanguage(tag);
  if (!def) throw new Error(`Unsupported language: ${tag}`);
  return def;
}

export function baseLanguage(tag: LanguageTag): string {
  return (getLanguage(tag)?.tag ?? tag).split("-")[0]!.toLowerCase();
}

export function sameBaseLanguage(a: LanguageTag, b: LanguageTag): boolean {
  return baseLanguage(a) === baseLanguage(b);
}

export function isRightToLeft(tag: LanguageTag): boolean {
  return getLanguage(tag)?.rtl === true;
}

export function languageLabel(tag: LanguageTag, locale: "zh" | "en" = "zh"): string {
  const def = getLanguage(tag);
  if (!def) return tag;
  return locale === "zh" ? def.name : def.englishName;
}

export function languagesForScript(script: ScriptName): LanguageDef[] {
  return LANGUAGES.filter((def) => def.scripts.includes(script));
}

export function isAutoLanguage(input: string | null | undefined): boolean {
  if (!input) return true;
  return normalizeLanguageId(input) === AUTO_LANGUAGE;
}

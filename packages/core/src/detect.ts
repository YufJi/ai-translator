import {
  baseLanguage,
  type LanguageTag,
  type ScriptName,
  resolveLanguage,
} from "./language.ts";

export interface DetectionCandidate {
  language: LanguageTag;
  score: number;
}

export type DetectionMethod = "heuristic" | "llm" | "fallback" | "declared";

export interface DetectionResult {
  language: LanguageTag;
  confidence: number;
  candidates: DetectionCandidate[];
  method: DetectionMethod;
  scriptShares: Partial<Record<ScriptName, number>>;
}

export interface DetectOptions {
  fallback?: LanguageTag;
  minConfidence?: number;
  maxCandidates?: number;
  expected?: readonly LanguageTag[];
  sampleLimit?: number;
}

export const DEFAULT_FALLBACK_LANGUAGE: LanguageTag = "en-US";
export const DEFAULT_MIN_CONFIDENCE = 0.6;

const SCRIPT_PATTERNS: readonly (readonly [ScriptName, RegExp])[] = [
  ["Hiragana", /\p{Script=Hiragana}/u],
  ["Katakana", /\p{Script=Katakana}/u],
  ["Hangul", /\p{Script=Hangul}/u],
  ["Han", /\p{Script=Han}/u],
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Thai", /\p{Script=Thai}/u],
  ["Devanagari", /\p{Script=Devanagari}/u],
];

const LETTER_PATTERN = /\p{L}/u;
const DEFAULT_SAMPLE_LIMIT = 4000;

const SIMPLIFIED_ONLY = new Set(
  "这们为说时会对发现关于学应该认识让见长门问间样点头实际无论语词译汉编织开关电话车东马鸟鱼龙龟贝页风飞术书买卖乐习页".split(
    "",
  ),
);

const TRADITIONAL_ONLY = new Set(
  "這們為說時會對發現關於學應該認識讓見長門問間樣點頭實際無論語詞譯漢編織開關電話車東馬鳥魚龍龜貝頁風飛術書買賣樂習".split(
    "",
  ),
);

const UKRAINIAN_MARKERS = /[іїєґ]/iu;

interface LatinProfile {
  language: LanguageTag;
  markers?: string;
  stopwords: readonly string[];
}

const LATIN_PROFILES: readonly LatinProfile[] = [
  {
    language: "en-US",
    stopwords: [
      "the", "of", "and", "to", "in", "is", "that", "it", "for", "was", "with", "as", "his",
      "on", "be", "at", "by", "this", "had", "not", "are", "but", "from", "or", "have", "an",
      "they", "you", "we", "will", "would", "there", "their", "what", "about", "if", "can",
      "which", "when", "all", "your", "how", "each", "she", "he", "do", "does", "been",
      "over", "into", "than", "then", "them", "these", "those", "up", "down", "out", "no",
      "so", "just", "now", "only", "also", "more", "some", "any", "such", "very", "one",
      "get", "got", "make", "made", "go", "went", "much", "many", "after", "before",
      "because", "while", "where", "here", "who", "its", "our", "us", "him", "her", "me",
      "my", "should", "could", "may", "might", "must", "were", "has", "did", "during",
      "between", "under", "again", "other", "same", "both", "most", "too", "why", "let",
      "say", "said", "see", "seen", "came", "come", "know", "think", "take", "give", "find",
      "tell", "work", "try", "leave", "call", "still", "even", "back", "way",
    ],
  },
  {
    language: "es",
    markers: "ñ¿¡",
    stopwords: [
      "el", "la", "de", "que", "y", "a", "en", "un", "ser", "se", "no", "haber", "por", "con",
      "su", "para", "como", "estar", "tener", "le", "lo", "todo", "pero", "más", "hacer", "o",
      "poder", "decir", "este", "ir", "otro", "ese", "la", "si", "me", "ya", "ver", "porque",
      "dar", "cuando", "él", "muy", "sin", "vez", "mucho", "saber", "qué", "sobre", "mi",
    ],
  },
  {
    language: "fr",
    markers: "çœ",
    stopwords: [
      "le", "de", "un", "être", "et", "à", "il", "avoir", "ne", "je", "son", "que", "se",
      "qui", "ce", "dans", "en", "du", "elle", "au", "de", "ce", "le", "pour", "pas", "que",
      "vous", "par", "sur", "faire", "plus", "dire", "me", "on", "mon", "lui", "nous", "comme",
      "mais", "pouvoir", "avec", "tout", "y", "aller", "voir", "en", "bien", "où", "sans",
      "les", "des", "est", "une", "cette", "sont", "aux", "leur",
    ],
  },
  {
    language: "de",
    markers: "ß",
    stopwords: [
      "der", "die", "und", "in", "den", "von", "zu", "das", "mit", "sich", "des", "auf", "für",
      "ist", "im", "dem", "nicht", "ein", "eine", "als", "auch", "es", "an", "werden", "aus",
      "er", "hat", "dass", "sie", "nach", "wird", "bei", "einer", "um", "am", "sind", "noch",
      "wie", "einem", "über", "einen", "so", "zum", "war", "haben", "nur", "oder", "aber",
      "vor", "zur", "bis", "mehr", "durch", "man", "sein", "wurde", "sei", "dieser", "kann",
    ],
  },
  {
    language: "it",
    markers: "ìòù",
    stopwords: [
      "il", "di", "che", "e", "la", "per", "un", "in", "non", "con", "una", "essere", "si",
      "da", "come", "a", "anche", "del", "questo", "ha", "più", "lo", "ma", "le", "suo", "o",
      "questo", "fare", "sono", "ho", "ci", "tutto", "quando", "molto", "dei", "gli", "della",
      "nel", "alla", "sul", "era", "sua", "suoi",
    ],
  },
  {
    language: "pt-BR",
    markers: "ãõ",
    stopwords: [
      "de", "a", "o", "que", "e", "do", "da", "em", "um", "para", "é", "com", "não", "uma",
      "os", "no", "se", "na", "por", "mais", "as", "dos", "como", "mas", "foi", "ao", "ele",
      "das", "tem", "à", "seu", "sua", "ou", "ser", "quando", "muito", "há", "nos", "já",
      "está", "eu", "também", "só", "pelo", "pela", "até", "isso",
    ],
  },
  {
    language: "nl",
    markers: "ë",
    stopwords: [
      "de", "en", "van", "ik", "te", "dat", "die", "in", "een", "hij", "het", "niet", "zijn",
      "is", "was", "op", "aan", "met", "als", "voor", "had", "er", "maar", "om", "hem", "dan",
      "zou", "of", "wat", "mijn", "men", "dit", "zo", "door", "over", "ze", "zich", "bij",
      "ook", "tot", "je", "mij", "uit", "der", "daar", "haar", "naar", "heb", "hoe",
    ],
  },
  {
    language: "vi",
    markers: "ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ",
    stopwords: [
      "và", "của", "có", "là", "không", "được", "cho", "trong", "người", "những", "này",
      "một", "với", "để", "trên", "khi", "các", "đã", "như", "từ", "đến", "sẽ", "về", "nhưng",
      "hay", "thì", "vào", "ra", "nếu", "vì", "hơn", "cũng", "tôi", "bạn", "chúng",
    ],
  },
  {
    language: "id",
    stopwords: [
      "yang", "dan", "di", "itu", "dengan", "untuk", "tidak", "ini", "dari", "dalam", "akan",
      "pada", "juga", "saya", "ke", "karena", "tersebut", "bisa", "ada", "mereka", "lebih",
      "kata", "tahun", "sudah", "atau", "saat", "harus", "oleh", "seperti", "kita", "anda",
      "apakah", "bagaimana", "tetapi", "adalah", "agar", "setelah", "belum",
    ],
  },
  {
    language: "ms",
    stopwords: [
      "yang", "dan", "di", "itu", "dengan", "untuk", "tidak", "ini", "dari", "dalam", "akan",
      "pada", "juga", "saya", "ke", "kerana", "tersebut", "boleh", "ada", "mereka", "lebih",
      "kata", "tahun", "sudah", "atau", "saat", "mesti", "oleh", "seperti", "kita", "anda",
      "adakah", "bagaimana", "tetapi", "adalah", "supaya", "selepas", "belum",
    ],
  },
  {
    language: "tr",
    markers: "ıİşŞğĞ",
    stopwords: [
      "bir", "ve", "bu", "da", "de", "için", "ile", "çok", "daha", "olarak", "var", "ama",
      "ben", "sen", "o", "biz", "siz", "onlar", "ne", "nasıl", "neden", "eğer", "ki", "değil",
      "gibi", "kadar", "sonra", "önce", "her", "kendi", "bütün", "şey", "yok", "oldu",
    ],
  },
  {
    language: "pl",
    markers: "łżśęćąźńŁŻŚĘĆĄŹŃ",
    stopwords: [
      "nie", "to", "się", "jest", "i", "że", "na", "w", "z", "do", "ale", "jak", "po", "tak",
      "dla", "od", "ma", "go", "tylko", "już", "czy", "może", "być", "mieć", "kiedy", "bardzo",
      "jego", "jej", "ich", "tego", "tym", "przez", "oraz", "gdzie", "który", "która",
    ],
  },
  {
    language: "sv",
    markers: "åÅ",
    stopwords: [
      "och", "att", "det", "som", "en", "på", "är", "av", "för", "med", "till", "den", "har",
      "de", "inte", "om", "ett", "han", "men", "var", "jag", "sig", "från", "vi", "så", "kan",
      "när", "år", "efter", "upp", "vid", "eller", "hur", "ska", "också", "här",
    ],
  },
  {
    language: "da",
    markers: "æøÆØ",
    stopwords: [
      "og", "i", "jeg", "det", "at", "en", "den", "til", "er", "som", "på", "de", "med", "han",
      "af", "for", "ikke", "der", "var", "mig", "sig", "men", "et", "har", "om", "vi", "så",
      "kan", "når", "efter", "op", "ved", "eller", "hvordan", "skal", "også", "her", "hun",
    ],
  },
  {
    language: "nb",
    markers: "æøÆØ",
    stopwords: [
      "og", "i", "jeg", "det", "at", "en", "et", "den", "til", "er", "som", "på", "de", "med",
      "han", "av", "for", "ikke", "der", "var", "meg", "seg", "men", "har", "om", "vi", "så",
      "kan", "når", "etter", "opp", "ved", "eller", "hvordan", "skal", "også", "her", "hun",
      "hva", "blir",
    ],
  },
  {
    language: "fi",
    stopwords: [
      "ja", "on", "ei", "se", "että", "oli", "en", "hän", "ne", "joka", "niin", "kun", "mutta",
      "myös", "jos", "sen", "kuin", "ole", "vain", "voi", "vielä", "mitä", "tämä", "josta",
      "sitä", "kaikki", "nyt", "sitten", "ollut", "tai",
    ],
  },
  {
    language: "cs",
    markers: "řŘěĚůŮžŽšŠčČ",
    stopwords: [
      "a", "se", "na", "je", "že", "o", "v", "s", "z", "do", "to", "ale", "jak", "po", "tak",
      "pro", "od", "má", "ho", "jen", "už", "nebo", "být", "mít", "když", "velmi", "jeho",
      "její", "jejich", "toho", "tím", "přes", "nebo", "kde", "který", "která", "není",
    ],
  },
  {
    language: "ro",
    markers: "șȘțȚăĂ",
    stopwords: [
      "și", "de", "la", "în", "a", "este", "cu", "pe", "nu", "o", "ce", "care", "un", "se",
      "din", "pentru", "să", "mai", "are", "ca", "dar", "sau", "dacă", "când", "foarte", "lui",
      "ei", "lor", "acest", "această", "fost", "sunt", "era", "prin",
    ],
  },
  {
    language: "hu",
    markers: "őŐűŰ",
    stopwords: [
      "a", "az", "és", "hogy", "nem", "is", "egy", "meg", "van", "mint", "de", "ha", "csak",
      "már", "ez", "volt", "még", "el", "ki", "be", "fel", "le", "át", "mert", "vagy", "aki",
      "amely", "majd", "több", "lehet", "kell", "nagyon", "itt",
    ],
  },
];

export interface ScriptAnalysis {
  letters: number;
  counts: Partial<Record<ScriptName, number>>;
  shares: Partial<Record<ScriptName, number>>;
}

export function analyzeScripts(text: string, sampleLimit = DEFAULT_SAMPLE_LIMIT): ScriptAnalysis {
  const sample = text.length > sampleLimit ? text.slice(0, sampleLimit) : text;
  const counts: Partial<Record<ScriptName, number>> = {};
  let letters = 0;
  for (const char of sample) {
    if (!LETTER_PATTERN.test(char)) continue;
    for (const [script, pattern] of SCRIPT_PATTERNS) {
      if (pattern.test(char)) {
        counts[script] = (counts[script] ?? 0) + 1;
        letters += 1;
        break;
      }
    }
  }
  const shares: Partial<Record<ScriptName, number>> = {};
  if (letters > 0) {
    for (const [script, count] of Object.entries(counts) as [ScriptName, number][]) {
      shares[script] = count / letters;
    }
  }
  return { letters, counts, shares };
}

function hanVariant(text: string): { language: LanguageTag; confidence: number } {
  let simplified = 0;
  let traditional = 0;
  for (const char of text) {
    if (SIMPLIFIED_ONLY.has(char)) simplified += 1;
    else if (TRADITIONAL_ONLY.has(char)) traditional += 1;
  }
  if (simplified === 0 && traditional === 0) return { language: "zh-Hans", confidence: 0.72 };
  const total = simplified + traditional;
  const confidence = Math.min(0.97, 0.66 + 0.3 * (Math.abs(simplified - traditional) / total));
  return simplified >= traditional
    ? { language: "zh-Hans", confidence }
    : { language: "zh-Hant", confidence };
}

function tokenizeLatin(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{Script=Latin}\p{M}']+/u)
    .filter(Boolean);
}

function scoreLatinProfiles(text: string): DetectionCandidate[] {
  const tokens = tokenizeLatin(text);
  if (tokens.length === 0) return [];
  const tokenSet = new Set(tokens);
  const lowercase = text.toLowerCase();
  const results: DetectionCandidate[] = [];
  for (const profile of LATIN_PROFILES) {
    let hits = 0;
    for (const word of profile.stopwords) {
      if (tokenSet.has(word)) hits += 1;
    }
    const density = hits / Math.max(4, Math.min(tokens.length, 60));
    let markerScore = 0;
    if (profile.markers) {
      let markerHits = 0;
      for (const char of profile.markers) {
        if (lowercase.includes(char.toLowerCase())) markerHits += 1;
      }
      markerScore = markerHits > 0 ? Math.min(1, markerHits / 3) : 0;
      if (profile.language === "de" && lowercase.includes("ß")) markerScore = 1;
    }
    const score = density * 0.75 + markerScore * 0.25;
    if (score > 0) results.push({ language: profile.language, score });
  }
  return results.sort((a, b) => b.score - a.score);
}

function confidenceFromCandidates(candidates: DetectionCandidate[], letters: number): number {
  const top = candidates[0];
  if (!top || top.score <= 0) return 0.2;
  const runnerUp = candidates[1]?.score ?? 0;
  const margin = (top.score - runnerUp) / top.score;
  const evidence = Math.min(1, top.score / 0.35);
  const lengthFactor = Math.min(1, letters / 24);
  const raw = 0.32 + 0.4 * margin + 0.16 * evidence + 0.12 * lengthFactor;
  return Math.max(0.2, Math.min(0.96, raw));
}

function restrict(
  candidates: DetectionCandidate[],
  expected: readonly LanguageTag[] | undefined,
): DetectionCandidate[] {
  if (!expected || expected.length === 0) return candidates;
  const allowed = new Set(expected.map((tag) => baseLanguage(tag)));
  const filtered = candidates.filter((candidate) => allowed.has(baseLanguage(candidate.language)));
  return filtered.length > 0 ? filtered : candidates;
}

function finalize(
  result: DetectionResult,
  options: DetectOptions,
): DetectionResult {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const fallback = options.fallback ?? DEFAULT_FALLBACK_LANGUAGE;
  if (result.confidence >= minConfidence || result.method === "declared") return result;
  const resolvedFallback = resolveLanguage(fallback)?.tag ?? DEFAULT_FALLBACK_LANGUAGE;
  return {
    ...result,
    method: "fallback",
    candidates: [{ language: resolvedFallback, score: 0 }, ...result.candidates],
    language: resolvedFallback,
    confidence: result.language === resolvedFallback ? result.confidence : 0.35,
  };
}

export function detectLanguage(text: string, options: DetectOptions = {}): DetectionResult {
  const { letters, shares } = analyzeScripts(text, options.sampleLimit);
  const maxCandidates = options.maxCandidates ?? 4;
  const empty = (algorithmFallback: LanguageTag): DetectionResult =>
    finalize(
      {
        language: algorithmFallback,
        confidence: 0,
        candidates: [],
        method: "heuristic",
        scriptShares: shares,
      },
      options,
    );

  if (letters === 0) return empty(options.fallback ?? DEFAULT_FALLBACK_LANGUAGE);

  const kana = (shares.Hiragana ?? 0) + (shares.Katakana ?? 0);
  const hangul = shares.Hangul ?? 0;
  const han = shares.Han ?? 0;
  const cyrillic = shares.Cyrillic ?? 0;
  const latin = shares.Latin ?? 0;

  if (kana >= 0.02) {
    const confidence = Math.min(0.97, 0.82 + Math.min(0.15, kana));
    const candidates = restrict(
      [
        { language: "ja", score: 0.9 },
        { language: "zh-Hans", score: han },
        { language: "ko", score: hangul },
      ],
      options.expected,
    ).slice(0, maxCandidates);
    return finalize(
      {
        language: candidates[0]?.language ?? "ja",
        confidence,
        candidates,
        method: "heuristic",
        scriptShares: shares,
      },
      options,
    );
  }

  if (hangul >= 0.15) {
    const candidates = restrict(
      [
        { language: "ko", score: 0.9 },
        { language: "ja", score: kana },
        { language: "zh-Hans", score: han },
      ],
      options.expected,
    ).slice(0, maxCandidates);
    return finalize(
      {
        language: candidates[0]?.language ?? "ko",
        confidence: Math.min(0.97, 0.85 + Math.min(0.12, hangul)),
        candidates,
        method: "heuristic",
        scriptShares: shares,
      },
      options,
    );
  }

  if (han >= 0.3) {
    const variant = hanVariant(text);
    const confidence = Math.max(variant.confidence, Math.min(0.95, 0.6 + han * 0.4));
    const candidates = restrict(
      [
        { language: variant.language, score: han },
        { language: variant.language === "zh-Hans" ? "zh-Hant" : "zh-Hans", score: han * 0.4 },
        { language: "ja", score: kana },
      ],
      options.expected,
    ).slice(0, maxCandidates);
    return finalize(
      {
        language: candidates[0]?.language ?? variant.language,
        confidence,
        candidates,
        method: "heuristic",
        scriptShares: shares,
      },
      options,
    );
  }

  if (cyrillic >= 0.3) {
    const ukrainian = UKRAINIAN_MARKERS.test(text);
    const detected: LanguageTag = ukrainian ? "uk" : "ru";
    const candidates = restrict(
      [
        { language: detected, score: cyrillic },
        { language: ukrainian ? "ru" : "uk", score: cyrillic * 0.5 },
      ],
      options.expected,
    ).slice(0, maxCandidates);
    return finalize(
      {
        language: candidates[0]?.language ?? detected,
        confidence: ukrainian ? 0.9 : Math.min(0.93, 0.7 + cyrillic * 0.3),
        candidates,
        method: "heuristic",
        scriptShares: shares,
      },
      options,
    );
  }

  const scriptOnly: readonly (readonly [ScriptName, LanguageTag, number])[] = [
    ["Greek", "el", 0.3],
    ["Arabic", "ar", 0.4],
    ["Hebrew", "he", 0.35],
    ["Thai", "th", 0.35],
    ["Devanagari", "hi", 0.35],
  ];
  for (const [script, language, threshold] of scriptOnly) {
    const share = shares[script] ?? 0;
    if (share >= threshold) {
      const candidates = restrict([{ language, score: share }], options.expected).slice(
        0,
        maxCandidates,
      );
      return finalize(
        {
          language: candidates[0]?.language ?? language,
          confidence: Math.min(0.95, 0.72 + share * 0.25),
          candidates,
          method: "heuristic",
          scriptShares: shares,
        },
        options,
      );
    }
  }

  if (latin > 0 || letters > 0) {
    const candidates = restrict(scoreLatinProfiles(text), options.expected).slice(0, maxCandidates);
    if (candidates.length > 0) {
      return finalize(
        {
          language: candidates[0]!.language,
          confidence: confidenceFromCandidates(candidates, letters),
          candidates,
          method: "heuristic",
          scriptShares: shares,
        },
        options,
      );
    }
  }

  return empty(options.fallback ?? DEFAULT_FALLBACK_LANGUAGE);
}

export function describeDetection(result: DetectionResult): string {
  const percent = Math.round(result.confidence * 100);
  const alternatives = result.candidates
    .slice(1, 3)
    .map((candidate) => candidate.language)
    .join(", ");
  const suffix = alternatives ? ` (also: ${alternatives})` : "";
  return `${result.language} · ${result.method} · ${percent}%${suffix}`;
}

// Lightweight Sindhi-aware search helpers for family names, places and kinship terms.
// The app intentionally does not bundle a large language corpus in the browser.
// Instead we normalize Sindhi Arabic-script text and Roman-Sindhi spelling variants,
// then use a small genealogy-focused alias seed for common places/relationship terms.

const ARABIC_DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu;
const FORMAT_MARKS_RE = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;
const PUNCT_RE = /[^\p{L}\p{N}\s]/gu;

const CHAR_NORMALIZATION = new Map([
  ["أ", "ا"], ["إ", "ا"], ["ٱ", "ا"], ["آ", "ا"],
  ["ك", "ڪ"],
  ["ي", "ي"], ["ى", "ي"], ["ئ", "ي"], ["ے", "ي"],
  ["ؤ", "و"],
  ["ۀ", "ه"], ["ة", "ه"], ["ہ", "ه"], ["ھ", "ه"],
]);

// Deliberately approximate. Search only needs a stable phonetic key, not a
// publication-quality transliteration. Vowels are later reduced in the key.
const SINDHI_TO_ROMAN = {
  "ا":"a", "ب":"b", "ٻ":"b", "ڀ":"bh", "پ":"p",
  "ت":"t", "ٿ":"th", "ٽ":"t", "ٺ":"th", "ث":"s",
  "ج":"j", "ڄ":"j", "چ":"ch", "ڇ":"ch", "ح":"h", "خ":"kh",
  "د":"d", "ڌ":"dh", "ڏ":"d", "ڊ":"d", "ڍ":"dh", "ذ":"z",
  "ر":"r", "ڙ":"r", "ز":"z", "س":"s", "ش":"sh", "ص":"s", "ض":"z",
  "ط":"t", "ظ":"z", "ع":"a", "غ":"gh", "ف":"f", "ڦ":"ph",
  "ق":"q", "ڪ":"k", "ک":"kh", "گ":"g", "ڳ":"g", "ڱ":"ng",
  "ل":"l", "م":"m", "ن":"n", "ڻ":"n", "ڃ":"ny",
  "و":"w", "ه":"h", "ء":"", "ي":"i",
};

export const SINDHI_PLACE_ALIASES = [
  ["Sindh", "Sind", "سنڌ"],
  ["Karachi", "ڪراچي"],
  ["Hyderabad", "Hyderabad Sindh", "حيدرآباد"],
  ["Sukkur", "Sakkar", "سکر"],
  ["Shikarpur", "Shikarpur Sindh", "شڪارپور"],
  ["Larkana", "Larkano", "لاڙڪاڻو"],
  ["Khairpur", "خيرپور"],
  ["Mirpur Khas", "Mirpurkhas", "ميرپور خاص", "ميرپورخاص"],
  ["Jacobabad", "Jacob Abad", "جيڪب آباد"],
  ["Thatta", "ٺٽو"],
  ["Badin", "بدين"],
  ["Dadu", "دادو"],
  ["Nawabshah", "Shaheed Benazirabad", "نوابشاهه", "شهيد بينظيرآباد"],
  ["Rohri", "روهڙي"],
  ["Sehwan", "Sehwan Sharif", "سيوهڻ", "سيوهڻ شريف"],
  ["Kotri", "ڪوٽڙي"],
  ["Umerkot", "Umar Kot", "عمرڪوٽ"],
  ["Kandhkot", "Kandh Kot", "ڪنڌڪوٽ"],
  ["Kashmore", "ڪشمور"],
  ["Ghotki", "گهوٽڪي"],
];

export const SINDHI_KINSHIP_ALIASES = {
  father: ["father", "dad", "baba", "abba", "pita", "پيءُ", "پيء", "بابا", "ابا"],
  mother: ["mother", "mom", "mum", "amma", "maa", "ماءُ", "ماء", "امڙ", "اما"],
  brother: ["brother", "bhau", "bhai", "ڀاءُ", "ڀاء"],
  sister: ["sister", "bhen", "behen", "ڀيڻ"],
  son: ["son", "putar", "beta", "پٽ"],
  daughter: ["daughter", "dhee", "beti", "ڌيءُ", "ڌيء"],
  husband: ["husband", "ghot", "pati", "مڙس"],
  wife: ["wife", "gharwari", "patni", "زال"],
  partner: ["partner", "spouse", "ساٿي"],
  grandfather: ["grandfather", "grandpa", "dado", "dada", "nana", "ڏاڏو", "نانا"],
  grandmother: ["grandmother", "grandma", "dadi", "nani", "ڏاڏي", "ناني"],
  uncle: ["uncle", "chacha", "mama", "چاچو", "مامو"],
  aunt: ["aunt", "aunty", "maasi", "chachi", "mami", "چاچي", "مامي"],
};

const normalizeChars = (value) => [...value].map((char) => CHAR_NORMALIZATION.get(char) || char).join("");

export function normalizeSearchText(value) {
  return normalizeChars(String(value || "").normalize("NFKC"))
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(/[ـ]/gu, "")
    .replace(FORMAT_MARKS_RE, "")
    .replace(PUNCT_RE, " ")
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ")
    .trim();
}

export function transliterateSindhiForSearch(value) {
  const normalized = normalizeSearchText(value);
  return [...normalized].map((char) => SINDHI_TO_ROMAN[char] ?? char).join("");
}

export function romanPhoneticKey(value) {
  let roman = transliterateSindhiForSearch(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  roman = roman
    .replace(/chh/g, "ch")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/(?:bh|ph)/g, "b")
    .replace(/(?:dh|th)/g, "d")
    .replace(/jh/g, "j")
    .replace(/q/g, "k")
    .replace(/[vw]/g, "w")
    .replace(/[z]/g, "s")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/[aeiouy]/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return roman;
}

const aliasIndex = (() => {
  const groups = [...SINDHI_PLACE_ALIASES, ...Object.values(SINDHI_KINSHIP_ALIASES)];
  const index = new Map();
  groups.forEach((group) => {
    const values = [...new Set(group.flatMap((item) => [normalizeSearchText(item), romanPhoneticKey(item)]).filter(Boolean))];
    values.forEach((key) => index.set(key, values));
  });
  return index;
})();

function expandedKeys(value) {
  const normalized = normalizeSearchText(value);
  const phonetic = romanPhoneticKey(value);
  const keys = new Set([normalized, phonetic].filter(Boolean));
  for (const key of [...keys]) {
    const aliases = aliasIndex.get(key);
    if (aliases) aliases.forEach((alias) => keys.add(alias));
  }
  return [...keys];
}

function compact(value) {
  return String(value || "").replace(/\s+/g, "");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return prev[b.length];
}

function closePhoneticMatch(a, b) {
  const left = compact(a);
  const right = compact(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) >= 3;
  if (Math.min(left.length, right.length) < 5) return false;
  const distance = levenshtein(left, right);
  const similarity = 1 - distance / Math.max(left.length, right.length);
  return similarity >= 0.82;
}

export function sindhiAwareIncludes(value, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const text = normalizeSearchText(value);
  if (text.includes(q)) return true;

  const valueKeys = expandedKeys(value);
  const queryKeys = expandedKeys(query);
  return queryKeys.some((queryKey) => valueKeys.some((valueKey) => {
    if (!queryKey || !valueKey) return false;
    if (valueKey.includes(queryKey)) return true;
    return closePhoneticMatch(valueKey, queryKey);
  }));
}


export function canonicalPlaceSearchQuery(value) {
  const normalized = normalizeSearchText(value);
  const phonetic = romanPhoneticKey(value);
  for (const group of SINDHI_PLACE_ALIASES) {
    const hit = group.some((alias) => {
      const aliasNormalized = normalizeSearchText(alias);
      return aliasNormalized === normalized || romanPhoneticKey(alias) === phonetic;
    });
    if (hit) return group[0];
  }
  return String(value || "").trim();
}

export function matchesAnyField(query, fields) {
  if (!String(query || "").trim()) return true;
  return fields.filter(Boolean).some((field) => sindhiAwareIncludes(field, query));
}

export function getSearchMatchKind(value, query) {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || !normalizedValue) return null;
  if (normalizedValue.includes(normalizedQuery)) return "direct";
  return sindhiAwareIncludes(value, query) ? "variant" : null;
}

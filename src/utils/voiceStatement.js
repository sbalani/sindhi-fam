import { normalizeSearchText, SINDHI_KINSHIP_ALIASES } from "./sindhiSearch.js";

const relationPatterns = [
  [/father(?:'s)? older brother|father(?:'s)? brother|uncle|hermano (?:mayor )?de mi padre|(?:بابا|ابا|پيءُ?|پيء)\s+جو\s+(?:ڀاءُ?|ڀاء|چاچو)/iu, "brother", "father"],
  [/mother(?:'s)? (?:older |younger )?brother|maternal uncle|(?:اما|امڙ|ماءُ?|ماء)\s+جو\s+(?:ڀاءُ?|ڀاء|مامو)/iu, "brother", "mother"],
  [/father(?:'s)? sister|aunt|(?:بابا|ابا|پيءُ?|پيء)\s+جي\s+(?:ڀيڻ|چاچي)/iu, "sister", "father"],
  [/mother(?:'s)? sister|maternal aunt|(?:اما|امڙ|ماءُ?|ماء)\s+جي\s+(?:ڀيڻ|مامي)/iu, "sister", "mother"],
  [/\bmother\b/i, "mother", "self"],
  [/\bfather\b/i, "father", "self"],
  [/\bbrother\b/i, "brother", "self"],
  [/\bsister\b/i, "sister", "self"],
  [/\bson\b/i, "son", "self"],
  [/\bdaughter\b/i, "daughter", "self"],
];

const sindhiRelation = (text) => {
  const normalized = normalizeSearchText(text);
  const order = ["grandfather", "grandmother", "father", "mother", "brother", "sister", "son", "daughter", "husband", "wife", "partner", "uncle", "aunt"];
  for (const key of order) {
    const aliases = SINDHI_KINSHIP_ALIASES[key] || [];
    if (aliases.some((alias) => {
      const token = normalizeSearchText(alias);
      return token && normalized.includes(token);
    })) return key;
  }
  return "";
};

const cleanCapturedName = (value) => String(value || "")
  .replace(/\s+(?:آهي|هو|هئي|aahe|ahe|and|y)$/iu, "")
  .replace(/[،,.!?؟]+$/gu, "")
  .trim();

export const parseFamilyStatement = (text) => {
  const cleaned = String(text || "").trim();
  const called = cleaned.match(/(?:called|named|was called|se llamaba|se llama|नाम था|(?:جو|جي)?\s*نالو)\s+([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){0,2})/iu);
  const lived = cleaned.match(/(?:lived|lives|moved)\s+(?:in|to)\s+([\p{L} .'-]+?)(?:[,.]|$|\s+and\s+)|(?:vivía|vive|se mudó)\s+(?:en|a)\s+([\p{L} .'-]+?)(?:[,.]|$|\s+y\s+)/iu);
  const born = cleaned.match(/born\s+in\s+([\p{L} .'-]+?)(?:[,.]|$|\s+and\s+)|(?:nació|nacido|nacida)\s+en\s+([\p{L} .'-]+?)(?:[,.]|$|\s+y\s+)/iu);
  const year = cleaned.match(/(?:born\s+(?:in\s+)?|naci[oó]\s+en\s+)(18\d{2}|19\d{2}|20\d{2})/i);
  const pattern = relationPatterns.find(([regex]) => regex.test(cleaned));
  const fallbackSindhiRelation = pattern ? "" : sindhiRelation(cleaned);
  const name = cleanCapturedName(called?.[1]);
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    statement: cleaned,
    relation: pattern?.[1] || fallbackSindhiRelation,
    anchorHint: pattern?.[2] || "self",
    firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "",
    surname: parts.length > 1 ? parts.at(-1) : "",
    birthYear: year?.[1] || "",
    birthPlaceText: (born?.[1] || born?.[2] || "").trim(),
    livedInText: (lived?.[1] || lived?.[2] || "").trim(),
  };
};

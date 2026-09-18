import { normalizeSearchText } from "./sindhiSearch.js";

export const NAME_ALIAS_KINDS = [
  { value: "sindhi_script", label: "Sindhi-script name" },
  { value: "roman", label: "Roman spelling" },
  { value: "former", label: "Former / earlier name" },
  { value: "historical", label: "Historical spelling" },
  { value: "other", label: "Other" },
];

const ALLOWED_KINDS = new Set(NAME_ALIAS_KINDS.map((item) => item.value));

export function normalizeNameAlias(alias) {
  const name = String(alias?.name || "").trim().replace(/\s+/g, " ");
  const kind = ALLOWED_KINDS.has(alias?.kind) ? alias.kind : "other";
  return { name, kind };
}

export function cleanNameAliases(aliases = []) {
  const cleaned = [];
  const seen = new Set();
  for (const raw of Array.isArray(aliases) ? aliases : []) {
    const alias = normalizeNameAlias(raw);
    if (!alias.name) continue;
    if (alias.name.length > 160) throw new Error("Alternate names must be 160 characters or fewer.");
    const key = normalizeSearchText(alias.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(alias);
  }
  if (cleaned.length > 20) throw new Error("You can store up to 20 alternate names for one person.");
  return cleaned;
}

export function aliasLabel(kind) {
  return NAME_ALIAS_KINDS.find((item) => item.value === kind)?.label || "Alternate name";
}

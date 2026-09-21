const MAX_IMPORT_PEOPLE = 50;
const MAX_IMPORT_RELATIONSHIPS = 100;

const relationshipVariant = (relationship) => {
  if (relationship.type === "parent") {
    return ["biological", "adoptive", "step", "guardian"].includes(relationship.variant)
      ? relationship.variant
      : null;
  }
  if (relationship.type === "sibling") {
    if (relationship.variant === "step") throw new Error("Step-sibling imports need parent context before they can be saved.");
    return relationship.variant === "half" ? "half" : "reported";
  }
  return null;
};

export function buildVoiceImportPayload(draft) {
  if (!draft?.narratorTempId || !draft?.importId) throw new Error("Interpret the family story again before saving it.");

  const people = (draft.people || []).filter((person) => person.isNarrator || person.status === "confirmed");
  const includedIds = new Set(people.map((person) => person.tempId));
  const narrator = people.find((person) => person.tempId === draft.narratorTempId && person.existingId);
  if (!narrator) throw new Error("The selected narrator is no longer available.");
  if (people.length < 2) throw new Error("Confirm at least one relative before importing.");
  if (people.length > MAX_IMPORT_PEOPLE) throw new Error(`A voice import can contain at most ${MAX_IMPORT_PEOPLE} people.`);

  const currentYear = new Date().getFullYear();
  const personPayload = people.map((person) => {
    const age = Number(person.age);
    const statedBirthYear = Number(person.birthYear);
    const birthYear = Number.isInteger(statedBirthYear) && statedBirthYear >= 1000 && statedBirthYear <= currentYear
      ? statedBirthYear
      : Number.isInteger(age) && age >= 0 && age <= 125
        ? currentYear - age
        : null;
    const firstName = person.isPlaceholder ? "Unknown" : String(person.firstName || "").trim();
    const surname = String(person.surname || narrator.surname || "Unknown").trim();
    if (!person.existingId && (!firstName || !surname)) throw new Error("Every confirmed person needs a first name and surname.");

    return {
      temp_id: person.tempId,
      existing_id: person.existingId || null,
      first_name: firstName,
      surname,
      gender: person.gender || "unspecified",
      birth_year: birthYear,
      birth_approximate: Boolean(!statedBirthYear && birthYear),
      birth_place: String(person.birthLocation || "").trim() || null,
      lived_in: String(person.location || "").trim() || null,
      is_placeholder: Boolean(person.isPlaceholder),
      placeholder_label: person.isPlaceholder ? (person.placeholderLabel || person.relationToNarrator || "Unknown relative") : null,
      provenance_note: person.isNarrator ? null : `Voice family import: ${String(person.evidence || draft.transcript || "User-confirmed family statement").trim()}`,
    };
  });

  const relationships = (draft.relationships || [])
    .filter((relationship) => relationship.status === "confirmed" && includedIds.has(relationship.from) && includedIds.has(relationship.to))
    .map((relationship) => ({
      from_temp_id: relationship.from,
      to_temp_id: relationship.to,
      relationship_type: relationship.type,
      variant: relationshipVariant(relationship),
      confidence: "reported",
      provenance_note: `Voice family import: ${String(relationship.evidence || draft.transcript || "User-confirmed family statement").trim()}`,
    }));

  if (!relationships.length) throw new Error("Confirm at least one relationship before importing.");
  if (relationships.length > MAX_IMPORT_RELATIONSHIPS) throw new Error(`A voice import can contain at most ${MAX_IMPORT_RELATIONSHIPS} relationships.`);
  const connectedIds = new Set(relationships.flatMap((relationship) => [relationship.from_temp_id, relationship.to_temp_id]));
  if (people.some((person) => !person.isNarrator && !connectedIds.has(person.tempId))) {
    throw new Error("Every confirmed person needs a confirmed relationship.");
  }

  return {
    narratorId: narrator.existingId,
    people: personPayload,
    relationships,
    idempotencyKey: draft.importId,
  };
}

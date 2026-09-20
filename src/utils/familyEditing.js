const relationshipYear = (value, label) => {
  if (value === "" || value === null || value === undefined) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1800 || year > 2100) {
    throw new Error(`${label} must be a year between 1800 and 2100.`);
  }
  return year;
};

export const makeEmptyParentLink = () => ({
  key: crypto.randomUUID(),
  relationshipId: null,
  mode: "existing",
  personId: "",
  variant: "biological",
  confidence: "reported",
  provenanceNote: "",
  placeholderLabel: "",
  placeholderGender: "unspecified",
});

export const ensureTwoParentRows = (links = []) => {
  const rows = links.map((link) => ({
    ...link,
    key: link.key || crypto.randomUUID(),
  }));
  while (rows.length < 2) rows.push(makeEmptyParentLink());
  return rows;
};

const connectionPerson = (link, fallbackLabel) =>
  link.mode === "placeholder"
    ? {
        placeholder: {
          label: link.placeholderLabel?.trim() || fallbackLabel,
          gender: link.placeholderGender || "unspecified",
        },
      }
    : { person_id: link.personId };

export function connectionBundleFromForm(form, member, relationships) {
  const parents = (form.parentLinks || [])
    .filter((link) => link.mode === "placeholder" || link.personId)
    .map((link) => ({
      ...connectionPerson(link, `Unknown parent of ${form.firstName}`),
      variant: link.variant || "unspecified",
      confidence: link.confidence || "reported",
      provenance_note: link.provenanceNote?.trim() || null,
    }));
  const partners = (form.partnerLinks || [])
    .filter((link) => link.mode === "placeholder" || link.personId)
    .map((link) => {
      const startYear = relationshipYear(link.startYear, "Partnership start year");
      const endYear = relationshipYear(link.endYear, "Partnership end year");
      if (startYear && endYear && startYear > endYear) {
        throw new Error("A relationship end year cannot be before its start year.");
      }
      const status = endYear ? "former" : link.variant || "unspecified";
      if (status === "current" && endYear) {
        throw new Error("A current partnership cannot have an end year.");
      }
      return {
        ...connectionPerson(link, `Unknown ${link.type === "partner" ? "partner" : "spouse"} of ${form.firstName}`),
        type: link.type === "partner" ? "partner" : "spouse",
        start_year: startYear,
        end_year: endYear,
        status,
        confidence: link.confidence || "reported",
        provenance_note: link.provenanceNote?.trim() || null,
        also_parent_of_anchor: Boolean(link.alsoParentOfAnchor),
      };
    });
  const siblings = member
    ? relationships
        .filter(
          (relationship) =>
            relationship.type === "sibling" &&
            (relationship.from === member.id || relationship.to === member.id),
        )
        .map((relationship) => ({
          person_id:
            relationship.from === member.id ? relationship.to : relationship.from,
          variant: relationship.variant === "half" ? "half" : "reported",
          confidence: relationship.confidence || "reported",
          provenance_note: relationship.provenanceNote || null,
        }))
    : [];
  return { parents, partners, siblings };
}

export function primaryConnectionFromForm(form, relation) {
  const startYear = ["spouse", "partner"].includes(relation.type)
    ? relationshipYear(form.marriageYear, "Relationship start year")
    : null;
  const endYear = ["spouse", "partner"].includes(relation.type)
    ? relationshipYear(form.relationshipEndYear, "Relationship end year")
    : null;
  if (startYear && endYear && startYear > endYear) {
    throw new Error("A relationship end year cannot be before its start year.");
  }
  return {
    type: relation.type,
    direction: relation.direction,
    variant:
      relation.type === "parent"
        ? form.parentVariant || "unspecified"
        : relation.type === "sibling"
          ? "reported"
          : null,
    start_year: startYear,
    end_year: endYear,
    status: ["spouse", "partner"].includes(relation.type)
      ? endYear
        ? "former"
        : form.partnershipVariant || "unspecified"
      : "unspecified",
  };
}

export function relationshipRpcArgs(personA, personB, type, options = {}) {
  return {
    p_person_a_id: personA,
    p_person_b_id: personB,
    p_relationship_type: type,
    p_variant: options.variant || null,
    p_start_year: options.startYear ? Number(options.startYear) : null,
    p_end_year: options.endYear ? Number(options.endYear) : null,
    p_status: options.status || "unspecified",
  };
}

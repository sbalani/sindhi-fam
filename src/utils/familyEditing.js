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

const parentLinkFromRelationship = (relationship, key = relationship.id) => ({
  key,
  relationshipId: key === relationship.id ? relationship.id : null,
  mode: "existing",
  personId: relationship.from,
  variant: relationship.variant || "biological",
  confidence: relationship.confidence || "reported",
  provenanceNote: relationship.provenanceNote || "",
  placeholderLabel: "",
  placeholderGender: "unspecified",
});

export const parentLinksForMember = (personId, relationships) => {
  const directParents = relationships.filter(
    (relationship) => relationship.type === "parent" && relationship.to === personId,
  );
  if (directParents.length) return directParents.map((relationship) => parentLinkFromRelationship(relationship));

  const siblingIds = new Set(
    relationships
      .filter(
        (relationship) =>
          relationship.type === "sibling" &&
          relationship.variant !== "half" &&
          (relationship.from === personId || relationship.to === personId),
      )
      .map((relationship) => relationship.from === personId ? relationship.to : relationship.from),
  );
  const seen = new Set();
  return relationships
    .filter((relationship) => relationship.type === "parent" && siblingIds.has(relationship.to))
    .filter((relationship) => {
      if (seen.has(relationship.from)) return false;
      seen.add(relationship.from);
      return true;
    })
    .slice(0, 2)
    .map((relationship) => parentLinkFromRelationship(relationship, `suggested-sibling-${relationship.id}`));
};

const connectionPerson = (link, fallbackLabel) =>
  link.mode === "placeholder"
    ? {
        placeholder: {
          label: link.placeholderLabel?.trim() || fallbackLabel,
          gender: link.placeholderGender || "unspecified",
        },
      }
    : link.mode === "new"
      ? {
          new_person: {
            first_name: link.newPerson?.firstName?.trim(),
            surname: link.newPerson?.surname?.trim(),
            nickname: link.newPerson?.nickname?.trim() || null,
            maiden_name: link.newPerson?.maidenName?.trim() || null,
            gender: link.newPerson?.gender || "unspecified",
            birth_date: link.newPerson?.birthDate || null,
          },
        }
      : { person_id: link.personId };

const relationshipVariant = (type, value) =>
  type === "parent" && (!value || value === "unspecified") ? null : value || null;

export function connectionBundleFromForm(form, member, relationships, primary = null) {
  const parents = (form.parentLinks || [])
    .filter((link) => link.mode === "placeholder" || link.personId)
    .filter(
      (link) =>
        !(
          primary?.type === "parent" &&
          primary.direction === "from-anchor" &&
          link.mode !== "placeholder" &&
          link.personId === form.anchorId
        ),
    )
    .map((link) => ({
      ...connectionPerson(link, `Unknown parent of ${form.firstName}`),
      variant: relationshipVariant("parent", link.variant),
      confidence: link.confidence || "reported",
      provenance_note: link.provenanceNote?.trim() || null,
    }));
  const partners = (form.partnerLinks || [])
    .filter((link) => link.mode === "placeholder" || link.mode === "new" || link.personId)
    .map((link) => {
      if (link.mode === "new" && (!link.newPerson?.firstName?.trim() || !link.newPerson?.surname?.trim())) {
        throw new Error("A new spouse or partner needs a first name and surname.");
      }
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
        ? relationshipVariant("parent", form.parentVariant)
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
    confidence: form.relationshipConfidence || "reported",
    provenance_note: form.relationshipProvenanceNote?.trim() || null,
  };
}

export function relationshipRpcArgs(personA, personB, type, options = {}) {
  return {
    person_a_id: personA,
    person_b_id: personB,
    relationship_type: type,
    variant: relationshipVariant(type, options.variant),
    start_year: options.startYear ? Number(options.startYear) : null,
    end_year: options.endYear ? Number(options.endYear) : null,
    status: options.status || "unspecified",
    confidence: options.confidence || "reported",
    provenance_note: options.provenanceNote?.trim() || null,
  };
}

export const relationSwitchValues = (relation) => ({
  marriageYear: "",
  relationshipEndYear: "",
  partnershipVariant: ["spouse", "partner"].includes(relation)
    ? "current"
    : "unspecified",
});

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJson(item)]),
  );
};

export const correctionPayloadChanged = (current, proposed) =>
  JSON.stringify(canonicalJson(current)) !== JSON.stringify(canonicalJson(proposed));

export const correctionSubmissionOutcome = (requestId) =>
  requestId
    ? { suggested: true, requestId }
    : { noChanges: true, message: "No changes to submit." };

export const loadConnectionSnapshots = async (client, rows) => {
  if (!rows.length) return rows;
  const snapshotResult = await client.rpc("get_managed_relationship_snapshots", {
    p_member_ids: rows.map((row) => row.id),
  });
  if (snapshotResult.error) throw snapshotResult.error;
  const snapshots = new Map(
    (snapshotResult.data || []).map((snapshot) => [snapshot.member_id, snapshot]),
  );
  return rows.map((row) => ({
    ...row,
    _relationship_hash: snapshots.get(row.id)?.content_hash || null,
    _connection_snapshot: snapshots.get(row.id)?.connections || null,
  }));
};

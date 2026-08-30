export const parentIdsFor = (personId, relationships) =>
  relationships
    .filter((relationship) => relationship.type === "parent" && relationship.to === personId)
    .map((relationship) => relationship.from);

export const childIdsFor = (personId, relationships) =>
  relationships
    .filter((relationship) => relationship.type === "parent" && relationship.from === personId)
    .map((relationship) => relationship.to);

export const partnerIdsFor = (personId, relationships) =>
  relationships
    .filter(
      (relationship) =>
        ["spouse", "partner"].includes(relationship.type) &&
        (relationship.from === personId || relationship.to === personId),
    )
    .map((relationship) =>
      relationship.from === personId ? relationship.to : relationship.from,
    );

export const siblingDetailsFor = (personId, relationships) => {
  const myParentRelationships = relationships.filter(
    (relationship) => relationship.type === "parent" && relationship.to === personId,
  );
  const myParentIds = new Set(myParentRelationships.map((relationship) => relationship.from));
  const candidateIds = new Set();

  relationships.forEach((relationship) => {
    if (relationship.type === "parent" && myParentIds.has(relationship.from)) {
      candidateIds.add(relationship.to);
    }
    if (
      relationship.type === "sibling" &&
      (relationship.from === personId || relationship.to === personId)
    ) {
      candidateIds.add(
        relationship.from === personId ? relationship.to : relationship.from,
      );
    }
  });

  candidateIds.delete(personId);
  return [...candidateIds].map((id) => {
    const theirParents = relationships.filter(
      (relationship) => relationship.type === "parent" && relationship.to === id,
    );
    const shared = theirParents
      .map((theirRelationship) => {
        const mine = myParentRelationships.find(
          (relationship) => relationship.from === theirRelationship.from,
        );
        if (!mine) return null;
        const variants = [
          mine.variant || "unspecified",
          theirRelationship.variant || "unspecified",
        ];
        return {
          parentId: theirRelationship.from,
          stepLike: variants.some((value) => ["step", "guardian"].includes(value)),
        };
      })
      .filter(Boolean);
    const directReported = relationships.some(
      (relationship) =>
        relationship.type === "sibling" &&
        ((relationship.from === personId && relationship.to === id) ||
          (relationship.from === id && relationship.to === personId)),
    );
    const familyShared = shared.filter((item) => !item.stepLike);

    return {
      id,
      sharedParentIds: familyShared.map((item) => item.parentId),
      kind:
        familyShared.length >= 2
          ? "full"
          : familyShared.length === 1
            ? "half"
            : shared.some((item) => item.stepLike)
              ? "step"
              : directReported
                ? "reported"
                : "reported",
    };
  });
};

export const siblingKindBetween = (personAId, personBId, relationships) =>
  siblingDetailsFor(personAId, relationships).find((item) => item.id === personBId)?.kind || null;

export const shortestRelationshipPath = (startId, targetId, relationships) => {
  if (!startId || !targetId) return [];
  if (startId === targetId) return [startId];
  const adjacency = new Map();
  relationships.forEach((relationship) => {
    if (!adjacency.has(relationship.from)) adjacency.set(relationship.from, []);
    if (!adjacency.has(relationship.to)) adjacency.set(relationship.to, []);
    adjacency.get(relationship.from).push(relationship.to);
    adjacency.get(relationship.to).push(relationship.from);
  });
  const queue = [[startId]];
  const seen = new Set([startId]);
  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    for (const next of adjacency.get(current) || []) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === targetId) return nextPath;
      seen.add(next);
      queue.push(nextPath);
    }
  }
  return [];
};

export const relationSummary = (personId, people, relationships) => {
  const byId = new Map(people.map((person) => [person.id, person]));
  const parentIds = parentIdsFor(personId, relationships);
  const children = childIdsFor(personId, relationships);
  const siblings = siblingDetailsFor(personId, relationships);
  const partners = partnerIdsFor(personId, relationships);
  return {
    parents: parentIds.map((id) => byId.get(id)).filter(Boolean),
    children: children.map((id) => byId.get(id)).filter(Boolean),
    siblings: siblings
      .map((item) => ({ ...item, person: byId.get(item.id) }))
      .filter((item) => item.person),
    partners: partners.map((id) => byId.get(id)).filter(Boolean),
  };
};

export const deriveBranchLabel = (personId, selfId, people, relationships) => {
  if (!personId || !selfId) return "Family";
  if (personId === selfId) return "You";
  const selfParents = parentIdsFor(selfId, relationships);
  if (selfParents.includes(personId)) {
    const person = people.find((item) => item.id === personId);
    if (person?.gender === "female") return "Mother's branch";
    if (person?.gender === "male") return "Father's branch";
    return "Parent branch";
  }
  const path = shortestRelationshipPath(selfId, personId, relationships);
  if (!path.length) return "Connected family";
  const firstHop = people.find((person) => person.id === path[1]);
  if (selfParents.includes(firstHop?.id)) {
    if (firstHop?.gender === "female") return "Mother's branch";
    if (firstHop?.gender === "male") return "Father's branch";
    return `${firstHop?.firstName || "Parent"}'s branch`;
  }
  const firstRelation = relationships.find(
    (relationship) =>
      (relationship.from === selfId && relationship.to === firstHop?.id) ||
      (relationship.to === selfId && relationship.from === firstHop?.id),
  );
  if (["spouse", "partner"].includes(firstRelation?.type)) return "Partner's branch";
  if (siblingDetailsFor(selfId, relationships).some((item) => item.id === firstHop?.id))
    return "Sibling branch";
  return path.length === 2 ? "Immediate family" : "Extended family";
};

export const deriveGenerationLevels = (rootId, people, relationships) => {
  const levels = rootId ? { [rootId]: 0 } : {};
  for (let pass = 0; pass < people.length; pass += 1) {
    relationships.forEach((relationship) => {
      const fromLevel = levels[relationship.from];
      const toLevel = levels[relationship.to];
      const distance = relationship.type === "parent" ? 1 : 0;
      if (fromLevel !== undefined && toLevel === undefined)
        levels[relationship.to] = fromLevel - distance;
      if (toLevel !== undefined && fromLevel === undefined)
        levels[relationship.from] = toLevel + distance;
    });
  }
  people.forEach((person) => {
    levels[person.id] ??= 0;
  });
  return levels;
};

export const dedupePeopleForDisplay = (people) => {
  const seen = new Set();
  return people.filter((person) => {
    const key = person.linkedUserId
      ? `user:${person.linkedUserId}`
      : person.personIdentityId
        ? `identity:${person.personIdentityId}`
        : `member:${person.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

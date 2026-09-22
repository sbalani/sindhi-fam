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

const personSortKey = (person) =>
  `${person?.surname || ""}\u0000${person?.firstName || person?.name || ""}\u0000${person?.id || ""}`.toLocaleLowerCase();

export const surnameSuggestionsFor = (anchorId, relationValue, people, relationships) => {
  const byId = new Map(people.map((person) => [person.id, person]));
  const anchor = byId.get(anchorId);
  if (!anchor) return [];
  const parents = parentIdsFor(anchorId, relationships).map((id) => byId.get(id));
  const partners = partnerIdsFor(anchorId, relationships).map((id) => byId.get(id));
  const relation = relationValue || "";
  const candidates = relation === "father" || relation === "mother" || relation === "parent"
    ? [anchor, ...parents, ...partners]
    : relation === "son" || relation === "daughter" || relation === "child"
      ? [anchor, ...partners, ...parents]
      : relation === "brother" || relation === "sister" || relation === "sibling"
        ? [anchor, ...parents, ...partners]
        : [anchor, ...partners, ...parents];
  const seen = new Set();
  return candidates.flatMap((person) => {
    const surnames = [person?.surname, person?.maidenName]
      .map((surname) => surname?.trim())
      .filter(Boolean);
    return surnames.filter((surname) => {
      const key = surname.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
};

export const buildTraditionalTreeLayout = (people, relationships, levels = {}) => {
  const visibleIds = new Set(people.map((person) => person.id));
  const displayParents = new Map(people.map((person) => [person.id, new Set()]));
  relationships.forEach((relationship) => {
    if (relationship.type === "parent") displayParents.get(relationship.to)?.add(relationship.from);
    if (relationship.type === "child") displayParents.get(relationship.from)?.add(relationship.to);
  });
  for (let pass = 0; pass < people.length; pass += 1) {
    relationships.forEach((relationship) => {
      if (relationship.type !== "sibling") return;
      const fromParents = displayParents.get(relationship.from);
      const toParents = displayParents.get(relationship.to);
      if (!fromParents || !toParents) return;
      if (!fromParents.size) toParents.forEach((parentId) => fromParents.add(parentId));
      if (!toParents.size) fromParents.forEach((parentId) => toParents.add(parentId));
    });
  }

  const childIds = (personId) => new Set(
    relationships
      .filter((relationship) => relationship.type === "parent" && relationship.from === personId)
      .map((relationship) => relationship.to),
  );
  const partnershipRank = { current: 0, unspecified: 1, former: 2 };
  const partnershipCandidates = relationships
    .filter((relationship) =>
      ["spouse", "partner"].includes(relationship.type) &&
      visibleIds.has(relationship.from) &&
      visibleIds.has(relationship.to) &&
      (levels[relationship.from] ?? 0) === (levels[relationship.to] ?? 0),
    )
    .map((relationship) => {
      const fromChildren = childIds(relationship.from);
      const sharedChildren = [...childIds(relationship.to)].filter((id) => fromChildren.has(id)).length;
      return { relationship, sharedChildren };
    })
    .sort((left, right) =>
      (partnershipRank[left.relationship.status || "unspecified"] ?? 1) -
        (partnershipRank[right.relationship.status || "unspecified"] ?? 1) ||
      right.sharedChildren - left.sharedChildren ||
      [left.relationship.from, left.relationship.to].sort().join(":").localeCompare(
        [right.relationship.from, right.relationship.to].sort().join(":"),
      ),
    );
  const byId = new Map(people.map((person) => [person.id, person]));
  const assignedUnit = new Map();
  const units = [];
  partnershipCandidates.forEach(({ relationship }) => {
    if (assignedUnit.has(relationship.from) || assignedUnit.has(relationship.to)) return;
    const members = [byId.get(relationship.from), byId.get(relationship.to)]
      .filter(Boolean)
      .sort((left, right) => personSortKey(left).localeCompare(personSortKey(right)));
    const id = `couple:${members.map((person) => person.id).join(":")}`;
    const unit = { id, members, level: levels[members[0].id] ?? 0 };
    units.push(unit);
    members.forEach((person) => assignedUnit.set(person.id, id));
  });
  [...people]
    .sort((left, right) => personSortKey(left).localeCompare(personSortKey(right)))
    .forEach((person) => {
      if (assignedUnit.has(person.id)) return;
      units.push({ id: person.id, members: [person], level: levels[person.id] ?? 0 });
      assignedUnit.set(person.id, person.id);
    });

  const areSiblings = (personAId, personBId) =>
    relationships.some((relationship) =>
      relationship.type === "sibling" &&
      ((relationship.from === personAId && relationship.to === personBId) ||
        (relationship.from === personBId && relationship.to === personAId)),
    ) || [...(displayParents.get(personAId) || [])].some((parentId) =>
      displayParents.get(personBId)?.has(parentId),
    );
  const relatedTo = (unit, personId) => unit.members.some((member) => areSiblings(member.id, personId));
  const orderUnits = (generationUnits) => {
    const remaining = new Set(generationUnits.map((unit) => unit.id));
    const ordered = [];
    while (remaining.size) {
      const available = generationUnits.filter((unit) => remaining.has(unit.id));
      const anchor = available.find((unit) => unit.members.length === 2) || available[0];
      const left = anchor.members[0]
        ? available.filter((unit) => unit.id !== anchor.id && relatedTo(unit, anchor.members[0].id))
        : [];
      const leftIds = new Set(left.map((unit) => unit.id));
      const right = anchor.members[1]
        ? available.filter((unit) =>
            unit.id !== anchor.id && !leftIds.has(unit.id) && relatedTo(unit, anchor.members[1].id),
          )
        : [];
      [...left, anchor, ...right].forEach((unit) => {
        if (!remaining.has(unit.id)) return;
        ordered.push(unit);
        remaining.delete(unit.id);
      });
    }
    return ordered;
  };
  const rows = Object.entries(units.reduce((result, unit) => {
    result[unit.level] ||= [];
    result[unit.level].push(unit);
    return result;
  }, {}))
    .map(([level, generationUnits]) => ({ level: Number(level), units: orderUnits(generationUnits) }))
    .sort((left, right) => left.level - right.level);

  const edges = [];
  const edgesByKey = new Map();
  units.forEach((childUnit) => {
    childUnit.members.forEach((child) => {
      displayParents.get(child.id)?.forEach((parentId) => {
        const parentUnitId = assignedUnit.get(parentId);
        if (!parentUnitId || parentUnitId === childUnit.id) return;
        const key = `parent:${parentUnitId}:${childUnit.id}`;
        const pathKey = [parentId, child.id].sort().join(":");
        if (edgesByKey.has(key)) {
          const edge = edgesByKey.get(key);
          edge.pathKeys.push(pathKey);
          if (edge.fromPersonId !== parentId) edge.fromPersonId = null;
          if (edge.toPersonId !== child.id) edge.toPersonId = null;
          return;
        }
        const edge = {
          key,
          from: parentUnitId,
          to: childUnit.id,
          fromPersonId: parentId,
          toPersonId: child.id,
          kind: "parent",
          pathKeys: [pathKey],
        };
        edges.push(edge);
        edgesByKey.set(key, edge);
      });
    });
  });
  partnershipCandidates.forEach(({ relationship }) => {
    const from = assignedUnit.get(relationship.from);
    const to = assignedUnit.get(relationship.to);
    if (!from || !to || from === to) return;
    const pair = [from, to].sort();
    const key = `partner:${pair[0]}:${pair[1]}`;
    const pathKey = [relationship.from, relationship.to].sort().join(":");
    if (edgesByKey.has(key)) {
      edgesByKey.get(key).pathKeys.push(pathKey);
      return;
    }
    const edge = {
      key,
      from,
      to,
      fromPersonId: relationship.from,
      toPersonId: relationship.to,
      kind: "partner",
      pathKeys: [pathKey],
    };
    edges.push(edge);
    edgesByKey.set(key, edge);
  });
  return { rows, edges };
};

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

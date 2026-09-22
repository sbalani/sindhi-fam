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

const familyColors = ["#4c8276", "#bd8d4c", "#766079", "#596987", "#bd7258", "#a86c77"];

const familyColorIndex = (key) => {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % familyColors.length;
};

const familyColorFor = (key, avoid = "") => {
  let index = familyColorIndex(key);
  if (familyColors[index] === avoid) index = (index + 1) % familyColors.length;
  return familyColors[index];
};

export const directConnectionIdsFor = (personId, relationships) => new Set(
  relationships.flatMap((relationship) => {
    if (relationship.from === personId) return [relationship.to];
    if (relationship.to === personId) return [relationship.from];
    return [];
  }),
);

const rowPositions = (rows) => {
  const positions = new Map();
  rows.forEach((row) => {
    let cursor = 0;
    row.units.forEach((unit) => {
      const width = unit.members.length === 2 ? 2.2 : 1;
      positions.set(unit.id, cursor + width / 2);
      cursor += width + 0.25;
    });
  });
  return positions;
};

export const traditionalLayoutMetrics = (rows, edges) => {
  const positions = rowPositions(rows);
  const parentEdges = edges.filter((edge) => edge.kind === "parent");
  let crossings = 0;
  for (let leftIndex = 0; leftIndex < parentEdges.length; leftIndex += 1) {
    const left = parentEdges[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < parentEdges.length; rightIndex += 1) {
      const right = parentEdges[rightIndex];
      if (
        left.fromLevel !== right.fromLevel ||
        left.toLevel !== right.toLevel ||
        left.from === right.from ||
        left.to === right.to
      ) continue;
      const sourceOrder = positions.get(left.from) - positions.get(right.from);
      const targetOrder = positions.get(left.to) - positions.get(right.to);
      if (sourceOrder * targetOrder < 0) crossings += 1;
    }
  }
  const span = parentEdges.reduce(
    (total, edge) => total + Math.abs((positions.get(edge.from) || 0) - (positions.get(edge.to) || 0)),
    0,
  );
  return { crossings, span };
};

const improvesLayout = (candidate, current) =>
  candidate.crossings < current.crossings ||
  (candidate.crossings === current.crossings && candidate.span < current.span - 0.001);

const birthSortKey = (person) => {
  const date = person?.birthDate || (person?.birthYear ? `${person.birthYear}-12-31` : "9999-12-31");
  return `${date}\u0000${personSortKey(person)}`;
};

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
      if (relationship.type !== "sibling" || relationship.variant === "half") return;
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
    const id = `couple:${[relationship.from, relationship.to].sort().join(":")}`;
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

  const siblingIds = new Map(people.map((person) => [person.id, new Set()]));
  relationships.forEach((relationship) => {
    if (relationship.type !== "sibling") return;
    siblingIds.get(relationship.from)?.add(relationship.to);
    siblingIds.get(relationship.to)?.add(relationship.from);
  });
  const childrenByParent = new Map();
  displayParents.forEach((parents, childId) => parents.forEach((parentId) => {
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(childId);
  }));
  childrenByParent.forEach((children) => children.forEach((personAId, index) => {
    children.slice(index + 1).forEach((personBId) => {
      siblingIds.get(personAId)?.add(personBId);
      siblingIds.get(personBId)?.add(personAId);
    });
  }));
  const areSiblings = (personAId, personBId) => siblingIds.get(personAId)?.has(personBId);
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
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const parentLinks = [];
  const parentLinkKeys = new Set();
  units.forEach((childUnit) => {
    childUnit.members.forEach((child) => {
      displayParents.get(child.id)?.forEach((parentId) => {
        const from = assignedUnit.get(parentId);
        if (!from || from === childUnit.id) return;
        const key = `${from}:${childUnit.id}`;
        if (parentLinkKeys.has(key)) return;
        parentLinkKeys.add(key);
        parentLinks.push({
          key: `parent:${key}`,
          kind: "parent",
          from,
          to: childUnit.id,
          fromLevel: unitById.get(from)?.level,
          toLevel: childUnit.level,
        });
      });
    });
  });
  const scoreRows = () => traditionalLayoutMetrics(rows, parentLinks);
  const restoreOrder = (row, order) => {
    row.units.splice(0, row.units.length, ...order);
  };
  const sweepRow = (row, adjacentRow) => {
    const before = [...row.units];
    const currentPositions = rowPositions(rows);
    const adjacentIds = new Set(adjacentRow.units.map((unit) => unit.id));
    const stableOrder = new Map(before.map((unit, index) => [unit.id, index]));
    const medianConnection = (unit) => {
      const connected = parentLinks.flatMap((edge) => {
        if (edge.from === unit.id && adjacentIds.has(edge.to)) return [currentPositions.get(edge.to)];
        if (edge.to === unit.id && adjacentIds.has(edge.from)) return [currentPositions.get(edge.from)];
        return [];
      }).sort((left, right) => left - right);
      if (!connected.length) return Number.POSITIVE_INFINITY;
      const middle = Math.floor(connected.length / 2);
      return connected.length % 2
        ? connected[middle]
        : (connected[middle - 1] + connected[middle]) / 2;
    };
    const currentScore = scoreRows();
    row.units.sort((left, right) =>
      medianConnection(left) - medianConnection(right) || stableOrder.get(left.id) - stableOrder.get(right.id),
    );
    if (!improvesLayout(scoreRows(), currentScore)) restoreOrder(row, before);
  };
  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 1; index < rows.length; index += 1) sweepRow(rows[index], rows[index - 1]);
    for (let index = rows.length - 2; index >= 0; index -= 1) sweepRow(rows[index], rows[index + 1]);
  }
  rows.forEach((row) => {
    let currentScore = scoreRows();
    for (let index = 0; index < row.units.length - 1; index += 1) {
      [row.units[index], row.units[index + 1]] = [row.units[index + 1], row.units[index]];
      const candidateScore = scoreRows();
      if (improvesLayout(candidateScore, currentScore)) currentScore = candidateScore;
      else {
        [row.units[index], row.units[index + 1]] = [row.units[index + 1], row.units[index]];
      }
    }
  });

  const positions = rowPositions(rows);
  const memberTargets = (unit, member) => relationships.flatMap((relationship) => {
      if (relationship.from !== member.id && relationship.to !== member.id) return [];
      const otherId = relationship.from === member.id ? relationship.to : relationship.from;
      const otherUnit = assignedUnit.get(otherId);
      if (!otherUnit || otherUnit === unit.id || !positions.has(otherUnit)) return [];
      return [positions.get(otherUnit)];
    });
  const memberOrientationScore = (unit, members) => {
    const targets = members.map((member) => memberTargets(unit, member));
    const inversions = targets[0].reduce(
      (total, leftTarget) => total + targets[1].filter((rightTarget) => leftTarget > rightTarget).length,
      0,
    );
    const distance = members.reduce((total, member, index) => {
      const memberX = positions.get(unit.id) + (index === 0 ? -0.28 : 0.28);
      return total + targets[index].reduce((sum, target) => sum + Math.abs(memberX - target), 0);
    }, 0);
    return { inversions, distance };
  };
  units.filter((unit) => unit.members.length === 2).forEach((unit) => {
    const reversed = [...unit.members].reverse();
    const currentScore = memberOrientationScore(unit, unit.members);
    const reversedScore = memberOrientationScore(unit, reversed);
    if (
      reversedScore.inversions < currentScore.inversions ||
      (reversedScore.inversions === currentScore.inversions &&
        reversedScore.distance < currentScore.distance - 0.001)
    ) {
      unit.members = reversed;
    }
  });

  rows.forEach((row) => row.units.forEach((unit) => {
    const incoming = parentLinks
      .filter((edge) => edge.to === unit.id)
      .map((edge) => unitById.get(edge.from))
      .filter((parentUnit) => parentUnit?.familyColor)
      .sort((left, right) => left.id.localeCompare(right.id));
    const natalUnit = incoming[0];
    if (!natalUnit) {
      unit.familyColor = familyColorFor(unit.id);
      return;
    }
    if (unit.members.length === 1) {
      unit.familyColor = natalUnit.familyColor;
      return;
    }
    const childUnits = parentLinks
      .filter((edge) => edge.from === natalUnit.id)
      .map((edge) => unitById.get(edge.to))
      .filter(Boolean)
      .sort((left, right) => {
        const leftChild = left.members
          .filter((member) => displayParents.get(member.id)?.has(natalUnit.members[0].id) ||
            (natalUnit.members[1] && displayParents.get(member.id)?.has(natalUnit.members[1].id)))
          .sort((a, b) => birthSortKey(a).localeCompare(birthSortKey(b)))[0] || left.members[0];
        const rightChild = right.members
          .filter((member) => displayParents.get(member.id)?.has(natalUnit.members[0].id) ||
            (natalUnit.members[1] && displayParents.get(member.id)?.has(natalUnit.members[1].id)))
          .sort((a, b) => birthSortKey(a).localeCompare(birthSortKey(b)))[0] || right.members[0];
        return birthSortKey(leftChild).localeCompare(birthSortKey(rightChild));
      });
    unit.familyColor = childUnits[0]?.id === unit.id
      ? natalUnit.familyColor
      : familyColorFor(unit.id, natalUnit.familyColor);
  }));

  const edges = [];
  const edgesByKey = new Map();
  units.forEach((childUnit) => {
    childUnit.members.forEach((child) => {
      displayParents.get(child.id)?.forEach((parentId) => {
        const parentUnitId = assignedUnit.get(parentId);
        if (!parentUnitId || parentUnitId === childUnit.id) return;
        const key = `parent:${parentUnitId}:${childUnit.id}`;
        const pathKey = [parentId, child.id].sort().join(":");
        const connections = relationships.filter((relationship) =>
          (relationship.type === "parent" && relationship.from === parentId && relationship.to === child.id) ||
          (relationship.type === "child" && relationship.from === child.id && relationship.to === parentId),
        ).map((relationship) => ({
          id: relationship.id || `${relationship.type}:${relationship.from}:${relationship.to}`,
          personIds: [relationship.from, relationship.to],
          type: relationship.type,
        }));
        if (edgesByKey.has(key)) {
          const edge = edgesByKey.get(key);
          edge.pathKeys.push(pathKey);
          edge.connections.push(...connections);
          if (edge.fromPersonId !== parentId) edge.fromPersonId = null;
          if (edge.toPersonId !== child.id) edge.toPersonId = null;
          return;
        }
        const edge = {
          key,
          from: parentUnitId,
          to: childUnit.id,
          fromLevel: units.find((unit) => unit.id === parentUnitId)?.level,
          toLevel: childUnit.level,
          fromPersonId: parentId,
          toPersonId: child.id,
          kind: "parent",
          pathKeys: [pathKey],
          connections,
          familyColor: unitById.get(parentUnitId)?.familyColor,
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
    const connection = {
      id: relationship.id || `${relationship.type}:${relationship.from}:${relationship.to}`,
      personIds: [relationship.from, relationship.to],
      type: relationship.type,
    };
    if (edgesByKey.has(key)) {
      edgesByKey.get(key).pathKeys.push(pathKey);
      edgesByKey.get(key).connections.push(connection);
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
      connections: [connection],
      familyColor: unitById.get(pair[0])?.familyColor,
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
    const directSibling = relationships.find(
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
               : directSibling?.variant === "half"
                 ? "half"
                 : directSibling
                   ? "reported"
                 : "reported",
    };
  });
};

export const parentConnectorLane = (fromY, toY, index, total) => {
  if (total <= 1) return fromY + (toY - fromY) / 2;
  const ratio = 0.28 + (0.44 * index) / (total - 1);
  return fromY + (toY - fromY) * ratio;
};

export const assignParentConnectorLanes = (measurements) => {
  const lanes = new Map();
  const generationGroups = new Map();
  measurements.forEach((measurement) => {
    const generationKey = `${measurement.fromLevel}:${measurement.toLevel}`;
    if (!generationGroups.has(generationKey)) generationGroups.set(generationKey, []);
    generationGroups.get(generationKey).push(measurement);
  });
  generationGroups.forEach((generation) => {
    const byParentUnit = new Map();
    generation.forEach((measurement) => {
      if (!byParentUnit.has(measurement.from)) byParentUnit.set(measurement.from, []);
      byParentUnit.get(measurement.from).push(measurement);
    });
    const parentUnits = [...byParentUnit.entries()].sort(([, left], [, right]) =>
      Math.min(...left.map((item) => item.fromX)) - Math.min(...right.map((item) => item.fromX)),
    );
    const fromY = Math.max(...generation.map((measurement) => measurement.fromY));
    const toY = Math.min(...generation.map((measurement) => measurement.toY));
    parentUnits.forEach(([, edges], index) => {
      const lane = parentConnectorLane(fromY, toY, index, parentUnits.length);
      edges.forEach((edge) => lanes.set(edge.key, lane));
    });
  });
  return lanes;
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

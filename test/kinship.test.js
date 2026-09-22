import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parentIdsFor,
  parentConnectorLane,
  assignParentConnectorLanes,
  siblingDetailsFor,
  shortestRelationshipPath,
  deriveBranchLabel,
  dedupePeopleForDisplay,
  buildTraditionalTreeLayout,
  surnameSuggestionsFor,
} from '../src/utils/kinship.js';

const rel = (from, to, type='parent', variant='biological') => ({ from, to, type, variant });

test('parent direction is parent -> child', () => {
  const relationships = [rel('mother','child'), rel('father','child')];
  assert.deepEqual(parentIdsFor('child', relationships).sort(), ['father','mother']);
  assert.deepEqual(parentIdsFor('mother', relationships), []);
});

test('full sibling derives from two shared parents', () => {
  const relationships = [rel('m','a'), rel('f','a'), rel('m','b'), rel('f','b')];
  assert.equal(siblingDetailsFor('a', relationships).find((item) => item.id === 'b')?.kind, 'full');
});

test('half sibling derives from exactly one shared parent', () => {
  const relationships = [rel('m','a'), rel('f1','a'), rel('m','b'), rel('f2','b')];
  const sibling = siblingDetailsFor('a', relationships).find((item) => item.id === 'b');
  assert.equal(sibling?.kind, 'half');
  assert.deepEqual(sibling?.sharedParentIds, ['m']);
});

test('explicit half sibling remains half when shared parents are not recorded', () => {
  const relationships = [rel('a', 'b', 'sibling', 'half')];
  assert.equal(siblingDetailsFor('a', relationships).find((item) => item.id === 'b')?.kind, 'half');
});

test('step sibling is not mistaken for biological half sibling', () => {
  const relationships = [rel('p','a','parent','step'), rel('p','b','parent','step')];
  assert.equal(siblingDetailsFor('a', relationships).find((item) => item.id === 'b')?.kind, 'step');
});

test('semantic sibling count deduplicates explicit and shared-parent paths', () => {
  const relationships = [
    rel('m', 'a'),
    rel('m', 'b'),
    rel('a', 'b', 'sibling', 'reported'),
    rel('a', 'c', 'sibling', 'reported'),
  ];
  assert.deepEqual(siblingDetailsFor('a', relationships).map((item) => item.id).sort(), ['b', 'c']);
});

test('remarriage preserves multiple partner paths', () => {
  const relationships = [rel('p','s1','spouse'), rel('p','s2','spouse'), rel('p','c1'), rel('s1','c1'), rel('p','c2'), rel('s2','c2')];
  assert.deepEqual(shortestRelationshipPath('s1','s2',relationships), ['s1','p','s2']);
});

test('branch is derived relative to self rather than stored family_side', () => {
  const people = [
    { id:'me', firstName:'Me', gender:'unspecified' },
    { id:'mom', firstName:'Mum', gender:'female' },
    { id:'uncle', firstName:'Uncle', gender:'male' },
  ];
  const relationships = [rel('mom','me'), rel('grandma','mom'), rel('grandma','uncle')];
  assert.equal(deriveBranchLabel('uncle','me',people,relationships), "Mother's branch");
});

test('display de-duplication uses linked account identity', () => {
  const people = [
    { id:'a', linkedUserId:'u1', personIdentityId:'i1' },
    { id:'b', linkedUserId:'u1', personIdentityId:'i2' },
    { id:'c', linkedUserId:null, personIdentityId:'i3' },
  ];
  assert.deepEqual(dedupePeopleForDisplay(people).map((person) => person.id), ['a','c']);
});

test('traditional layout keeps a current couple together with each sibling branch outside', () => {
  const people = [
    { id: 'a-sibling', firstName: 'A sibling', surname: 'One' },
    { id: 'a', firstName: 'A', surname: 'One' },
    { id: 'b', firstName: 'B', surname: 'Two' },
    { id: 'b-sibling', firstName: 'B sibling', surname: 'Two' },
  ];
  const relationships = [
    rel('a', 'b', 'spouse'),
    rel('a', 'a-sibling', 'sibling'),
    rel('b', 'b-sibling', 'sibling'),
  ];
  const { rows } = buildTraditionalTreeLayout(people, relationships, {});
  assert.deepEqual(rows[0].units.map((unit) => unit.members.map((person) => person.id)), [
    ['a-sibling'],
    ['a', 'b'],
    ['b-sibling'],
  ]);
});

test('traditional layout pairs only one current partner and preserves remarriage edge', () => {
  const people = ['p', 'current', 'former'].map((id) => ({ id, firstName: id, surname: 'Family' }));
  const relationships = [
    { ...rel('p', 'former', 'spouse'), status: 'former' },
    { ...rel('p', 'current', 'spouse'), status: 'current' },
  ];
  const { rows, edges } = buildTraditionalTreeLayout(people, relationships, {});
  assert.ok(rows[0].units.some((unit) => unit.members.map((person) => person.id).sort().join(':') === 'current:p'));
  assert.ok(edges.some((edge) => edge.kind === 'partner'));
});

test('traditional edges retain the actual partner or parent card endpoint', () => {
  const people = ['parent', 'partner', 'child'].map((id) => ({ id, firstName: id, surname: 'Family' }));
  const relationships = [rel('parent', 'partner', 'spouse'), rel('parent', 'child')];
  const { edges } = buildTraditionalTreeLayout(people, relationships, { parent: 0, partner: 0, child: 1 });
  const parentEdge = edges.find((edge) => edge.kind === 'parent');
  assert.equal(parentEdge.fromPersonId, 'parent');
  assert.equal(parentEdge.toPersonId, 'child');
});

test('half sibling display does not copy the other sibling parent set', () => {
  const people = ['parent', 'a', 'b'].map((id) => ({ id, firstName: id, surname: 'Family' }));
  const relationships = [rel('parent', 'a'), rel('a', 'b', 'sibling', 'half')];
  const { edges } = buildTraditionalTreeLayout(people, relationships, { parent: -1, a: 0, b: 0 });
  assert.ok(edges.some((edge) => edge.toPersonId === 'a'));
  assert.ok(!edges.some((edge) => edge.toPersonId === 'b'));
});

test('traditional rows group children beneath their recorded parent units', () => {
  const people = ['p1', 'p2', 'c1', 'c2'].map((id) => ({ id, firstName: id, surname: 'Family' }));
  const relationships = [rel('p1', 'c1'), rel('p2', 'c2')];
  const { rows } = buildTraditionalTreeLayout(people, relationships, { p1: -1, p2: -1, c1: 0, c2: 0 });
  const parentOrder = rows[0].units.map((unit) => unit.members[0].id);
  const childOrder = rows[1].units.map((unit) => unit.members[0].id);
  assert.equal(childOrder[parentOrder.indexOf('p1')], 'c1');
  assert.equal(childOrder[parentOrder.indexOf('p2')], 'c2');
});

test('parent connectors use separate lanes within one generation gap', () => {
  assert.notEqual(parentConnectorLane(100, 300, 0, 3), parentConnectorLane(100, 300, 1, 3));
  assert.equal(parentConnectorLane(100, 300, 0, 1), 200);
});

test('children of one parent unit share a lane while unrelated parent units do not', () => {
  const lanes = assignParentConnectorLanes([
    { key: 'a-1', from: 'parents-a', fromLevel: -1, toLevel: 0, fromX: 100, fromY: 220, toY: 400 },
    { key: 'a-2', from: 'parents-a', fromLevel: -1, toLevel: 0, fromX: 100, fromY: 220, toY: 400 },
    { key: 'b-1', from: 'parents-b', fromLevel: -1, toLevel: 0, fromX: 500, fromY: 250, toY: 400 },
  ]);
  assert.equal(lanes.get('a-1'), lanes.get('a-2'));
  assert.notEqual(lanes.get('a-1'), lanes.get('b-1'));
});

test('surname suggestions follow the selected anchor instead of the signed-in family', () => {
  const people = [
    { id: 'me', firstName: 'Me', surname: 'Self' },
    { id: 'anchor', firstName: 'Anchor', surname: 'Branch' },
    { id: 'partner', firstName: 'Partner', surname: 'PartnerSurname', maidenName: 'Earlier' },
  ];
  const relationships = [rel('anchor', 'partner', 'spouse')];
  assert.deepEqual(
    surnameSuggestionsFor('anchor', 'daughter', people, relationships),
    ['Branch', 'PartnerSurname', 'Earlier'],
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parentIdsFor,
  siblingDetailsFor,
  shortestRelationshipPath,
  deriveBranchLabel,
  dedupePeopleForDisplay,
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

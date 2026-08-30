import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePersonForm } from '../src/utils/validation.js';

const base = () => ({
  firstName:'  Soham ', surname:' Vaswani ', birthDate:'', birthYear:'1999', deathDate:'', deathYear:'',
  marriageYear:'', livedLocations:[],
});

test('person validation trims names and normalizes birth year', () => {
  const value = validatePersonForm(base());
  assert.equal(value.firstName, 'Soham');
  assert.equal(value.surname, 'Vaswani');
  assert.equal(value.birthYear, 1999);
});

test('death cannot predate birth', () => {
  const form = base();
  form.deathYear = '1990';
  assert.throws(() => validatePersonForm(form), /Death year cannot be before birth year/);
});

test('duplicate structured residences are rejected', () => {
  const form = base();
  form.livedLocations = [
    { providerId:'x', display:'Pune, India', startYear:'2000', endYear:'2002' },
    { providerId:'x', display:'Pune, India', startYear:'2003', endYear:'2004' },
  ];
  assert.throws(() => validatePersonForm(form), /listed more than once/);
});

test('residence cannot end before birth', () => {
  const form = base();
  form.livedLocations = [{ providerId:'x', display:'Pune, India', startYear:'1980', endYear:'1985' }];
  assert.throws(() => validatePersonForm(form), /ends before the recorded birth year|starts before/);
});

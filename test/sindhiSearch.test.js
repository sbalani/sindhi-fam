import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSearchText,
  romanPhoneticKey,
  sindhiAwareIncludes,
  matchesAnyField,
  canonicalPlaceSearchQuery,
} from '../src/utils/sindhiSearch.js';

test('normalizes Sindhi diacritics and Arabic character variants', () => {
  assert.equal(normalizeSearchText('سُـکّر'), 'سکر');
  assert.equal(normalizeSearchText('آباد'), 'اباد');
});

test('Roman spelling variants can match Sindhi-script Sukkur', () => {
  assert.equal(sindhiAwareIncludes('سکر، سنڌ', 'Sukkur'), true);
  assert.equal(sindhiAwareIncludes('Sukkur, Sindh', 'سکر'), true);
  assert.equal(sindhiAwareIncludes('Sukkur', 'Sakkar'), true);
});

test('Hyderabad matches across script', () => {
  assert.equal(sindhiAwareIncludes('حيدرآباد، سنڌ', 'Hyderabad'), true);
  assert.equal(sindhiAwareIncludes('Hyderabad, Sindh', 'حيدرآباد'), true);
});

test('common Sindhi place aliases are recognized', () => {
  assert.equal(sindhiAwareIncludes('Shaheed Benazirabad', 'نوابشاهه'), true);
  assert.equal(sindhiAwareIncludes('Larkana', 'لاڙڪاڻو'), true);
});

test('phonetic key tolerates common Roman variation without making tiny tokens fuzzy', () => {
  assert.equal(romanPhoneticKey('Mirchandani').startsWith('mrc'), true);
  assert.equal(sindhiAwareIncludes('Mirchandani', 'مرچنداڻي'), true);
  assert.equal(sindhiAwareIncludes('Rajan', 'Ram'), false);
});

test('search can match across multiple person fields', () => {
  assert.equal(matchesAnyField('شڪارپور', ['Mohan Advani', 'Shikarpur, Sindh']), true);
  assert.equal(matchesAnyField('Pune', ['Mohan Advani', 'Shikarpur, Sindh']), false);
});


test('known Sindhi-script place queries are canonicalized for the geocoder', () => {
  assert.equal(canonicalPlaceSearchQuery('سکر'), 'Sukkur');
  assert.equal(canonicalPlaceSearchQuery('حيدرآباد'), 'Hyderabad');
  assert.equal(canonicalPlaceSearchQuery('Amsterdam'), 'Amsterdam');
});

test('explicit alternate names participate in person-field search', () => {
  const fields = ['Ramesh Nanwani', 'Nanwani', 'رميش نانواڻي'];
  assert.equal(matchesAnyField('رميش نانواڻي', fields), true);
  assert.equal(matchesAnyField('Ramesh Nanwani', fields), true);
});

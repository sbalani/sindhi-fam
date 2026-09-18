export const VOICE_LANGUAGES = {
  en: { label: 'English', locale: 'en-US' },
  es: { label: 'Español', locale: 'es-ES' },
  sd: { label: 'سنڌي', locale: 'sd-PK' },
}

const REL = {
  father: { label: 'Father', gender: 'male', type: 'parent', dir: 'to' },
  mother: { label: 'Mother', gender: 'female', type: 'parent', dir: 'to' },
  stepfather: { label: 'Stepfather', gender: 'male', type: 'parent', dir: 'to', variant: 'step' },
  stepmother: { label: 'Stepmother', gender: 'female', type: 'parent', dir: 'to', variant: 'step' },
  adoptive_father: { label: 'Adoptive father', gender: 'male', type: 'parent', dir: 'to', variant: 'adoptive' },
  adoptive_mother: { label: 'Adoptive mother', gender: 'female', type: 'parent', dir: 'to', variant: 'adoptive' },
  brother: { label: 'Brother', gender: 'male', type: 'sibling', dir: 'sym' },
  sister: { label: 'Sister', gender: 'female', type: 'sibling', dir: 'sym' },
  half_brother: { label: 'Half-brother', gender: 'male', type: 'sibling', dir: 'sym', variant: 'half' },
  half_sister: { label: 'Half-sister', gender: 'female', type: 'sibling', dir: 'sym', variant: 'half' },
  stepbrother: { label: 'Stepbrother', gender: 'male', type: 'sibling', dir: 'sym', variant: 'step' },
  stepsister: { label: 'Stepsister', gender: 'female', type: 'sibling', dir: 'sym', variant: 'step' },
  son: { label: 'Son', gender: 'male', type: 'parent', dir: 'from' },
  daughter: { label: 'Daughter', gender: 'female', type: 'parent', dir: 'from' },
  husband: { label: 'Husband', gender: 'male', type: 'spouse', dir: 'sym' },
  wife: { label: 'Wife', gender: 'female', type: 'spouse', dir: 'sym' },
  partner: { label: 'Partner', gender: 'unspecified', type: 'partner', dir: 'sym' },
  grandfather: { label: 'Grandfather', gender: 'male', extended: 'grandparent' },
  grandmother: { label: 'Grandmother', gender: 'female', extended: 'grandparent' },
  uncle: { label: 'Uncle', gender: 'male', extended: 'uncle' },
  aunt: { label: 'Aunt', gender: 'female', extended: 'uncle' },
}

const TOKENS = {
  en: {
    half_brother: 'half[- ]brother', half_sister: 'half[- ]sister', stepbrother: 'step[- ]?brother', stepsister: 'step[- ]?sister',
    stepfather: 'step[- ]?father|stepdad', stepmother: 'step[- ]?mother|stepmom|stepmum',
    adoptive_father: 'adoptive father|adopted father', adoptive_mother: 'adoptive mother|adopted mother',
    father: 'father|dad|daddy', mother: 'mother|mom|mum|mommy|mummy', brother: 'brother', sister: 'sister',
    son: 'son', daughter: 'daughter', husband: 'husband', wife: 'wife', partner: 'partner|spouse',
    grandfather: 'grandfather|grandpa|granddad', grandmother: 'grandmother|grandma|granny', uncle: 'uncle', aunt: 'aunt|aunty|auntie',
  },
  es: {
    half_brother: 'medio hermano|hermanastro de sangre', half_sister: 'media hermana|hermanastra de sangre',
    stepbrother: 'hermanastro', stepsister: 'hermanastra', stepfather: 'padrastro', stepmother: 'madrastra',
    adoptive_father: 'padre adoptivo', adoptive_mother: 'madre adoptiva',
    father: 'padre|papá|papa', mother: 'madre|mamá|mama', brother: 'hermano', sister: 'hermana',
    son: 'hijo', daughter: 'hija', husband: 'marido|esposo', wife: 'esposa|mujer', partner: 'pareja|cónyuge|conyuge',
    grandfather: 'abuelo', grandmother: 'abuela', uncle: 'tío|tio', aunt: 'tía|tia',
  },
  sd: {
    half_brother: 'half[- ]brother|اڌ ڀاءُ|اڌ ڀاء', half_sister: 'half[- ]sister|اڌ ڀيڻ',
    stepbrother: 'step[- ]?brother', stepsister: 'step[- ]?sister', stepfather: 'step[- ]?father', stepmother: 'step[- ]?mother',
    adoptive_father: 'adoptive father', adoptive_mother: 'adoptive mother',
    father: 'پيءُ|پيء|بابا|ابا|baba|abba|pita', mother: 'ماءُ|ماء|امڙ|اما|amma|maa',
    brother: 'ڀاءُ|ڀاء|bhau|bhai', sister: 'ڀيڻ|bhen|behen', son: 'پٽ|putar|beta', daughter: 'ڌيءُ|ڌيء|dhee|beti',
    husband: 'مڙس|ghot|pati', wife: 'زال|gharwari|patni', partner: 'ساٿي|partner',
    grandfather: 'ڏاڏو|نانا|dado|nana', grandmother: 'ڏاڏي|ناني|dadi|nani', uncle: 'چاچو|مامو|chacha|mama', aunt: 'چاچي|مامي|maasi|aunt',
  },
}

const alt = (lang) => Object.values(TOKENS[lang] || TOKENS.en).join('|')
const tokenKey = (lang, token) => Object.entries(TOKENS[lang] || TOKENS.en)
  .find(([, pattern]) => new RegExp(`^(?:${pattern})$`, 'iu').test(String(token || '').trim().toLowerCase()))?.[0]

const splitName = (full, fallback = 'Unknown') => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Unknown', surname: fallback }
  if (parts.length === 1) return { firstName: parts[0], surname: fallback }
  return { firstName: parts.slice(0, -1).join(' '), surname: parts.at(-1) }
}

const stripLeadingFillers = (value, lang) => {
  if (lang === 'es') return value.replace(/^(?:también|tambien|además|ademas)\s+/iu, '')
  if (lang === 'sd') return value
  return value.replace(/^(?:also|actually|basically)\s+/iu, '')
}

const cleanName = (raw, lang) => {
  let value = String(raw || '').replace(/^[\s,:-]+|[\s,.!?؟;:-]+$/gu, '').trim()
  value = stripLeadingFillers(value, lang)
  if (lang === 'en' && /^from\b/iu.test(value)) return ''
  const breaker = lang === 'es'
    ? /\s*(?:,|\by\s+(?:tiene|vive|vivía|vivia|nació|nacio)|\bque\s+(?:tiene|vive|nació|nacio)|\b(?:él|ella)\s+(?:tiene|vive|nació|nacio)|\b(?:tiene|vive|vivía|vivia|nació|nacio)\b)/iu
    : lang === 'sd'
      ? /\s*(?:,|،|\s+آهي\b|\s+هو\b|\s+هئي\b|\band\s+(?:he|she)\b)/iu
      : /\s*(?:,|\b(?:and\s+)?(?:he|she|they)\s*(?:'s|'re|is|are|was|were|lives?|lived|was\s+born)|\bwho\s+(?:is|was|lives?|lived)|\b(?:born|living)\s+in\b|\bi\s+(?:repeat|mean|said|think)\b|\b(?:let\s+me\s+repeat|repeat)\b)/iu
  value = value.split(breaker)[0].trim()
  return value.slice(0, 140)
}

const factsFrom = (text) => {
  const sentence = String(text || '')
  const age = sentence.match(/\b(?:he|she|they)\s*(?:'s|is|was|are|were)\s+(\d{1,3})\s*(?:years? old)?\b/i)?.[1]
    || sentence.match(/\b(?:is|aged?)\s+(\d{1,3})\s*(?:years? old)?\b/i)?.[1]
    || sentence.match(/\b(?:tiene|tenía|tenia)\s+(\d{1,3})\s+años\b/i)?.[1]
    || sentence.match(/(\d{1,3})\s*سال/u)?.[1]
  const location = sentence.match(/\b(?:he|she|they)\s*(?:'s\s+)?(?:currently\s+)?(?:lives?|living|lived)\s+in\s+([^,.;]+?)(?=\s+(?:and|but|then|he|she|they|i\b|my\b)|[,.!?]|$)/i)?.[1]
    || sentence.match(/\b(?:lives?|lived|living)\s+in\s+([^,.;]+?)(?=\s+(?:and|but|then|he|she|they|i\b|my\b)|[,.!?]|$)/i)?.[1]
    || sentence.match(/\b(?:vive|vivía|vivia|viviendo)\s+en\s+([^,.;]+?)(?=\s+(?:y|pero|él|ella|yo\b|mi\b)|[,.!?]|$)/i)?.[1]
    || ''
  const birthLocation = sentence.match(/\b(?:he|she|they)\s*(?:was|were)?\s*born\s+in\s+(?!\d{4}\b)([^,.;]+?)(?=\s+(?:and|but|then|he|she|they|i\b|my\b)|[,.!?]|$)/i)?.[1]
    || sentence.match(/\b(?:was\s+)?born\s+in\s+(?!\d{4}\b)([^,.;]+?)(?=\s+(?:and|but|then|he|she|they|i\b|my\b)|[,.!?]|$)/i)?.[1]
    || sentence.match(/\bnac(?:ió|io)\s+en\s+(?!\d{4}\b)([^,.;]+?)(?=\s+(?:y|pero|él|ella|yo\b|mi\b)|[,.!?]|$)/i)?.[1]
    || ''
  const birthYear = Number(sentence.match(/\b(?:born|nac(?:ió|io))\s+(?:in|en)\s+((?:18|19|20)\d{2})\b/i)?.[1]) || null
  return { age: age ? Number(age) : null, location: location.trim(), birthLocation: birthLocation.trim(), birthYear }
}

const narratorFactsFrom = (text, language) => {
  const value = String(text || '')
  if (language === 'es') {
    const location = value.match(/\b(?:yo\s+)?(?:actualmente\s+)?(?:vivo|estoy\s+viviendo)\s+en\s+([^,.;]+?)(?=\s+(?:y|pero|mi\b|tengo\b)|[,.!?]|$)/iu)?.[1] || ''
    const birthLocation = value.match(/\b(?:yo\s+)?nac(?:í|i)\s+en\s+([^,.;]+?)(?=\s+(?:y|pero|mi\b|tengo\b)|[,.!?]|$)/iu)?.[1] || ''
    const age = value.match(/\b(?:yo\s+)?tengo\s+(\d{1,3})\s+años\b/iu)?.[1]
    return { age: age ? Number(age) : null, location: location.trim(), birthLocation: birthLocation.trim(), birthYear: null }
  }
  if (language === 'sd') return { age: null, location: '', birthLocation: '', birthYear: null }
  const location = value.match(/\b(?:i\s*(?:'m|am)\s+)?(?:currently\s+)?(?:living|live)\s+in\s+([^,.;]+?)(?=\s+(?:and|but|my\b|i\s+have\b)|[,.!?]|$)/iu)?.[1] || ''
  const birthLocation = value.match(/\bi\s+was\s+born\s+in\s+([^,.;]+?)(?=\s+(?:and|but|my\b|i\s+have\b)|[,.!?]|$)/iu)?.[1] || ''
  const age = value.match(/\bi\s*(?:'m|am)\s+(\d{1,3})\s*(?:years? old)?\b/iu)?.[1]
  return { age: age ? Number(age) : null, location: location.trim(), birthLocation: birthLocation.trim(), birthYear: null }
}

const band = (c) => c >= .88 ? 'high' : c >= .7 ? 'medium' : 'low'
export const draftPersonName = (p) => p?.isPlaceholder ? (p.placeholderLabel || p.relationToNarrator) : [p?.firstName, p?.surname !== 'Unknown' ? p?.surname : ''].filter(Boolean).join(' ')

export const VOICE_RELATION_CHOICES = [
  ['unknown', 'Not sure / choose relation'],
  ['father', 'Father'], ['mother', 'Mother'], ['son', 'Son'], ['daughter', 'Daughter'],
  ['brother', 'Brother'], ['sister', 'Sister'], ['half_brother', 'Half-brother'], ['half_sister', 'Half-sister'],
  ['stepbrother', 'Stepbrother'], ['stepsister', 'Stepsister'], ['stepfather', 'Stepfather'], ['stepmother', 'Stepmother'],
  ['adoptive_father', 'Adoptive father'], ['adoptive_mother', 'Adoptive mother'],
  ['husband', 'Husband'], ['wife', 'Wife'], ['partner', 'Partner'],
  ['maternal_grandfather', 'Maternal grandfather'], ['maternal_grandmother', 'Maternal grandmother'],
  ['paternal_grandfather', 'Paternal grandfather'], ['paternal_grandmother', 'Paternal grandmother'],
  ['grandfather', 'Grandfather (side unknown)'], ['grandmother', 'Grandmother (side unknown)'],
  ['maternal_uncle', 'Maternal uncle'], ['maternal_aunt', 'Maternal aunt'],
  ['paternal_uncle', 'Paternal uncle'], ['paternal_aunt', 'Paternal aunt'],
  ['uncle', 'Uncle (side unknown)'], ['aunt', 'Aunt (side unknown)'],
].map(([value, label]) => ({ value, label }))

export const relationChoiceForPerson = (person) => {
  if (person?.relationOverride) return person.relationOverride
  const label = String(person?.relationToNarrator || '').toLowerCase()
  const key = person?.relationKey
  if (label.includes('maternal uncle')) return 'maternal_uncle'
  if (label.includes('paternal uncle')) return 'paternal_uncle'
  if (label.includes('maternal aunt')) return 'maternal_aunt'
  if (label.includes('paternal aunt')) return 'paternal_aunt'
  if (label.includes('maternal grandfather')) return 'maternal_grandfather'
  if (label.includes('maternal grandmother')) return 'maternal_grandmother'
  if (label.includes('paternal grandfather')) return 'paternal_grandfather'
  if (label.includes('paternal grandmother')) return 'paternal_grandmother'
  if (key && VOICE_RELATION_CHOICES.some(option => option.value === key)) return key
  if (label.includes('half-sister')) return 'half_sister'
  if (label.includes('half-brother')) return 'half_brother'
  if (label.includes('stepsister')) return 'stepsister'
  if (label.includes('stepbrother')) return 'stepbrother'
  if (label.includes('stepmother')) return 'stepmother'
  if (label.includes('stepfather')) return 'stepfather'
  if (label.includes('adoptive mother')) return 'adoptive_mother'
  if (label.includes('adoptive father')) return 'adoptive_father'
  if (label.includes('grandmother')) return 'grandmother'
  if (label.includes('grandfather')) return 'grandfather'
  if (label.includes('uncle')) return 'uncle'
  if (label.includes('aunt')) return 'aunt'
  return VOICE_RELATION_CHOICES.find(option => option.label.toLowerCase() === label)?.value || 'unknown'
}

export function overrideDraftRelation(draft, tempId, choice) {
  if (!draft || !tempId || !choice) return draft
  const narratorId = draft.narratorTempId
  let people = draft.people.map(person => ({ ...person }))
  let relationships = draft.relationships.map(relationship => ({ ...relationship }))
  const target = people.find(person => person.tempId === tempId)
  if (!target || target.isNarrator) return draft

  relationships = relationships.filter(r => r.from !== tempId && r.to !== tempId)

  if (choice === 'unknown') {
    const updatedPeople = people.map(person => person.tempId === tempId ? {
      ...person,
      relationOverride: 'unknown',
      relationKey: 'unknown',
      relationToNarrator: 'Relationship not specified',
      confidence: 1,
      confidenceBand: 'high',
      userCorrected: true,
    } : person)
    return { ...draft, people: updatedPeople, relationships }
  }

  // Remove interpreter-only bridge placeholders left behind by the old mapping.
  let changed = true
  while (changed) {
    changed = false
    const removable = new Set(people.filter(person => {
      if (!person.isPlaceholder || person.tempId === narratorId || person.tempId === tempId) return false
      const support = person.supportPlaceholder || /^Unknown parent for /i.test(person.relationToNarrator || '') || /Needed to represent/i.test(person.evidence || '')
      if (!support) return false
      const degree = relationships.filter(r => r.from === person.tempId || r.to === person.tempId).length
      return degree <= 1
    }).map(person => person.tempId))
    if (removable.size) {
      people = people.filter(person => !removable.has(person.tempId))
      relationships = relationships.filter(r => !removable.has(r.from) && !removable.has(r.to))
      changed = true
    }
  }

  let seq = 1
  const nextPersonId = () => {
    let id
    do { id = `manual:${tempId}:${seq++}` } while (people.some(person => person.tempId === id))
    return id
  }
  let relSeq = 1
  const nextRelId = () => `manual-rel:${tempId}:${Date.now()}:${relSeq++}`
  const addRel = (from, to, type, variant = null) => {
    relationships.push({
      id: nextRelId(), from, to, type, variant,
      evidence: 'Relationship corrected by the user during voice review.',
      confidence: 1, confidenceBand: 'high', status: 'pending', userCorrected: true,
    })
  }
  const findDirectParent = (key) => people.find(person => {
    if (person.tempId === tempId) return false
    const direct = relationships.some(r => r.type === 'parent' && r.from === person.tempId && r.to === narratorId)
    return direct && person.relationKey === key
  })
  const ensureParent = (key = '') => {
    if (key) {
      const existing = findDirectParent(key)
      if (existing) return existing.tempId
    }
    const gender = key === 'mother' ? 'female' : key === 'father' ? 'male' : 'unspecified'
    const label = key === 'mother' ? 'Mother' : key === 'father' ? 'Father' : `Unknown parent for ${choice.replaceAll('_', ' ')}`
    const id = nextPersonId()
    people.push({
      tempId: id, existingId: null, firstName: 'Unknown', surname: target.surname || 'Unknown',
      gender, relationKey: key || 'parent', relationToNarrator: label,
      evidence: 'Needed to represent a user-corrected extended relationship without inventing a named person.',
      confidence: 1, confidenceBand: 'high', status: 'pending', isNarrator: false, isPlaceholder: true,
      placeholderLabel: label, supportPlaceholder: true, age: null, location: '', birthLocation: '', birthYear: null,
    })
    addRel(id, narratorId, 'parent')
    return id
  }
  const setTarget = (relationKey, label, gender) => {
    people = people.map(person => person.tempId === tempId ? {
      ...person, relationKey, relationOverride: choice, relationToNarrator: label,
      gender: gender || person.gender, confidence: 1, confidenceBand: 'high', userCorrectedRelation: true,
    } : person)
  }

  const direct = REL[choice]
  if (direct && !direct.extended) {
    setTarget(choice, direct.label, direct.gender)
    if (direct.dir === 'to') addRel(tempId, narratorId, direct.type, direct.variant || null)
    else if (direct.dir === 'from') addRel(narratorId, tempId, direct.type, direct.variant || null)
    else addRel(tempId, narratorId, direct.type, direct.variant || null)
    return { ...draft, people, relationships }
  }

  const extended = {
    maternal_grandfather: ['mother', 'parent', 'Maternal grandfather', 'male'],
    maternal_grandmother: ['mother', 'parent', 'Maternal grandmother', 'female'],
    paternal_grandfather: ['father', 'parent', 'Paternal grandfather', 'male'],
    paternal_grandmother: ['father', 'parent', 'Paternal grandmother', 'female'],
    maternal_uncle: ['mother', 'sibling', 'Maternal uncle', 'male'],
    maternal_aunt: ['mother', 'sibling', 'Maternal aunt', 'female'],
    paternal_uncle: ['father', 'sibling', 'Paternal uncle', 'male'],
    paternal_aunt: ['father', 'sibling', 'Paternal aunt', 'female'],
    grandfather: ['', 'parent', 'Grandfather', 'male'],
    grandmother: ['', 'parent', 'Grandmother', 'female'],
    uncle: ['', 'sibling', 'Uncle', 'male'],
    aunt: ['', 'sibling', 'Aunt', 'female'],
  }[choice]
  if (!extended) return { ...draft, people, relationships }
  const [side, type, label, gender] = extended
  const parentId = ensureParent(side)
  setTarget(choice, label, gender)
  addRel(tempId, parentId, type)
  return { ...draft, people, relationships }
}

const isEmptyFacts = (facts) => !facts || (!facts.age && !facts.location && !facts.birthLocation && !facts.birthYear)

const makeClauseStartRegex = (language) => {
  const relationAlt = alt(language)
  if (language === 'es') {
    return new RegExp(`(?:\\bmi\\s+(?:${relationAlt})\\b|\\b(?:el|la)\\s+(?:${relationAlt})\\s+de\\s+mi\\s+(?:${relationAlt})\\b|\\btengo\\s+(?:un|una)\\s+(?:${relationAlt})\\b|\\bsu\\s+(?:${relationAlt})\\b|\\b(?:yo\\s+)?(?:actualmente\\s+)?(?:vivo|estoy\\s+viviendo)\\s+en\\b|\\b(?:yo\\s+)?nac(?:í|i)\\s+en\\b|\\b(?:yo\\s+)?tengo\\s+\\d{1,3}\\s+años\\b)`, 'giu')
  }
  if (language === 'sd') {
    return new RegExp(`(?:(?:منهنجو|منهنجي|منھنجو|منھنجي|munhjo|munhji|muhnjo|muhnji|my)\\s+(?:${relationAlt})\\b)`, 'giu')
  }
  return new RegExp(`(?:\\bmy\\s+(?:${relationAlt})\\b|\\bi\\s+have\\s+(?:(?:a|an|the)\\s+)?(?:${relationAlt})\\b|\\b(?:his|her|their)\\s+(?:${relationAlt})\\b|\\bi\\s*(?:'m|am)\\s+(?:currently\\s+)?(?:living|live)\\s+in\\b|\\bi\\s+was\\s+born\\s+in\\b|\\bi\\s*(?:'m|am)\\s+\\d{1,3}\\b)`, 'giu')
}

const splitIntoClauses = (transcript, language) => {
  const text = String(transcript || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return []

  const starts = []
  const re = makeClauseStartRegex(language)
  let match
  while ((match = re.exec(text)) !== null) starts.push(match.index)

  if (!starts.length) return text.split(/(?<=[.!?؟])\s+|\s*;\s*/u).map(s => s.trim()).filter(Boolean)

  const clauses = []
  if (starts[0] > 0) {
    const preamble = text.slice(0, starts[0]).trim().replace(/^[,.!?;:\s]+|[,.!?;:\s]+$/g, '')
    if (preamble) clauses.push(preamble)
  }
  for (let i = 0; i < starts.length; i += 1) {
    const raw = text.slice(starts[i], starts[i + 1] ?? text.length).trim()
    const clause = raw.replace(/^[,.!?;:\s]+|[,.!?;:\s]+$/g, '').trim()
    if (clause) clauses.push(clause)
  }
  return clauses
}

const parseEnglishChainStart = (clause) => {
  const relationAlt = alt('en')
  let rest = clause.trim()
  if (!/^my\s+/iu.test(rest)) return null
  rest = rest.replace(/^my\s+/iu, '')
  const chain = []
  for (let guard = 0; guard < 5; guard += 1) {
    const m = rest.match(new RegExp(`^(${relationAlt})\\b`, 'iu'))
    if (!m) break
    const key = tokenKey('en', m[1])
    if (!key) break
    chain.push(key)
    rest = rest.slice(m[0].length)
    const possessive = rest.match(/^\s*['’]s\s*/u)
    if (!possessive) break
    rest = rest.slice(possessive[0].length)
  }
  return chain.length ? { chain, rest: rest.trim() } : null
}

const parseSpanishOfMy = (clause) => {
  const relationAlt = alt('es')
  const m = clause.match(new RegExp(`^(?:el|la)?\\s*(${relationAlt})\\s+de\\s+mi\\s+(${relationAlt})\\b(.*)$`, 'iu'))
  if (!m) return null
  const outer = tokenKey('es', m[1])
  const inner = tokenKey('es', m[2])
  return outer && inner ? { chain: [inner, outer], rest: m[3].trim() } : null
}

const parseDirectStart = (clause, language) => {
  const relationAlt = alt(language)
  if (language === 'es') {
    const special = parseSpanishOfMy(clause)
    if (special) return special
    const m = clause.match(new RegExp(`^mi\\s+(${relationAlt})\\b(.*)$`, 'iu'))
    if (!m) return null
    const key = tokenKey(language, m[1])
    return key ? { chain: [key], rest: m[2].trim() } : null
  }
  if (language === 'sd') {
    const m = clause.match(new RegExp(`^(?:منهنجو|منهنجي|منھنجو|منھنجي|munhjo|munhji|muhnjo|muhnji|my)\\s+(${relationAlt})\\b(.*)$`, 'iu'))
    if (!m) return null
    const key = tokenKey(language, m[1])
    return key ? { chain: [key], rest: m[2].trim() } : null
  }
  return parseEnglishChainStart(clause)
}

const extractNameAndFacts = (rest, language) => {
  const original = String(rest || '').trim()
  let value = original
  const narrativeOnly = language === 'es'
    ? /^(?:se\s+casó|se\s+caso|volvió\s+a\s+casarse|vive|vivía|nació|tuvo|tiene|era)\b/iu
    : language === 'sd'
      ? /^(?:lives?|living|born|married|remarried|divorced)\b/iu
      : /^(?:remarried|married|divorced|separated|lives?|living|lived|moved|born|works?|worked|has|had)\b/iu
  if (narrativeOnly.test(value)) return { name: '', facts: factsFrom(value) }

  if (language === 'es') {
    value = value.replace(/^(?:se\s+llamaba|se\s+llama|cuyo\s+nombre\s+es|llamado|llamada|es|era)\s+/iu, '')
  } else if (language === 'sd') {
    value = value.replace(/^(?:آهي|هو|هئي|is\s+called|was\s+called|called|named|is|was|aahe|ahe)\s*/iu, '')
  } else {
    value = value.replace(/^(?:whose\s+name\s+(?:is|was)\s+|name\s+(?:is|was)\s+|is\s+called\s+|was\s+called\s+|is\s+named\s+|was\s+named\s+|called\s+|named\s+|is\s+|was\s+)/iu, '')
  }
  value = stripLeadingFillers(value, language)
  const name = cleanName(value, language)
  const rejectedAsNarrative = language === 'en' && /^(?:called|named|but|not|repeat|remarried|married|divorced|separated|living|lives?|moved|born)\b/iu.test(name)
  return { name: rejectedAsNarrative ? '' : name, facts: factsFrom(original) }
}

const relationLabelFromChain = (chain, lastGender, fallback) => {
  if (chain.length < 2) return fallback
  const [a, b] = chain
  const side = a === 'mother' ? 'Maternal' : a === 'father' ? 'Paternal' : ''
  if (side && ['brother', 'sister'].includes(b)) return `${side} ${b === 'brother' ? 'uncle' : 'aunt'}`
  if (side && ['father', 'mother'].includes(b)) return `${side} ${b === 'father' ? 'grandfather' : 'grandmother'}`
  if (['brother', 'sister'].includes(a) && ['son', 'daughter'].includes(b)) return b === 'son' ? 'Nephew' : 'Niece'
  if (['son', 'daughter'].includes(a) && ['son', 'daughter'].includes(b)) return lastGender === 'male' ? 'Grandson' : lastGender === 'female' ? 'Granddaughter' : 'Grandchild'
  return fallback
}

export function interpretFamilyStory({ transcript, language = 'en', narrator, people = [] }) {
  let pSeq = 1, rSeq = 1
  const narratorTempId = `existing:${narrator.id}`
  const draftPeople = [{
    tempId: narratorTempId, existingId: narrator.id, firstName: narrator.firstName, surname: narrator.surname,
    gender: narrator.gender || 'unspecified', relationToNarrator: 'Narrator', confidence: 1, confidenceBand: 'high',
    evidence: 'Selected as the person speaking.', status: 'confirmed', isNarrator: true, isPlaceholder: false,
    age: narrator.ageReported || null, location: narrator.livedIn || '', birthLocation: narrator.birthPlace || '', birthYear: narrator.birthYear ? Number(narrator.birthYear) : null,
  }]
  const draftRelationships = []
  const cache = new Map()
  const existingByName = new Map(people.map(p => [p.name?.toLowerCase(), p]).filter(([n]) => n))
  const getPerson = (id) => draftPeople.find(p => p.tempId === id)

  const mergeFacts = (id, facts, evidence) => {
    if (!id || isEmptyFacts(facts)) return
    const p = getPerson(id)
    if (!p) return
    if (facts.age != null) p.age = facts.age
    if (facts.location) p.location = facts.location
    if (facts.birthLocation) p.birthLocation = facts.birthLocation
    if (facts.birthYear) p.birthYear = facts.birthYear
    if (evidence && p.evidence && !p.evidence.includes(evidence)) p.evidence = `${p.evidence} ${evidence}`.trim()
  }

  const addRelationship = (from, to, type, evidence, confidence, variant = null) => {
    const symmetric = ['sibling', 'spouse', 'partner'].includes(type)
    const duplicate = draftRelationships.some(r => r.type === type && ((r.from === from && r.to === to) || (symmetric && r.from === to && r.to === from)))
    if (duplicate || !from || !to || from === to) return
    draftRelationships.push({ id: `r${rSeq++}`, from, to, type, variant, evidence, confidence, confidenceBand: band(confidence), status: 'pending' })
  }

  const addPerson = ({ name, relationKey, relationToNarrator, gender, evidence, confidence, facts = {}, placeholder = false, fallbackSurname }) => {
    const existing = name ? existingByName.get(name.toLowerCase()) : null
    if (existing && existing.id !== narrator.id) {
      const id = `existing:${existing.id}`
      if (!getPerson(id)) draftPeople.push({
        tempId: id, existingId: existing.id, firstName: existing.firstName, surname: existing.surname, gender: existing.gender || gender,
        relationKey, relationToNarrator, evidence, confidence: Math.max(confidence, .95), confidenceBand: 'high', status: 'pending', isNarrator: false, isPlaceholder: false,
        age: existing.ageReported || facts.age || null, location: existing.livedIn || facts.location || '', birthLocation: existing.birthPlace || facts.birthLocation || '', birthYear: existing.birthYear ? Number(existing.birthYear) : facts.birthYear || null,
      })
      else mergeFacts(id, facts, evidence)
      return id
    }
    const parts = splitName(name, fallbackSurname || narrator.surname || 'Unknown')
    const id = `p${pSeq++}`
    draftPeople.push({
      tempId: id, existingId: null, firstName: placeholder ? 'Unknown' : parts.firstName, surname: parts.surname,
      gender, relationKey, relationToNarrator, evidence, confidence, confidenceBand: band(confidence), status: 'pending', isNarrator: false, isPlaceholder: placeholder,
      placeholderLabel: placeholder ? relationToNarrator : '', age: facts.age || null, location: facts.location || '', birthLocation: facts.birthLocation || '', birthYear: facts.birthYear || null,
    })
    return id
  }

  const addRelative = (anchorId, relationKey, { name = '', evidence = '', confidence = .86, facts = {}, sideHint = '' } = {}) => {
    const meta = REL[relationKey]
    if (!meta || !anchorId) return null
    const anchor = getPerson(anchorId)
    if (meta.extended) {
      let parentId
      if (sideHint === 'mother' || sideHint === 'father') {
        parentId = addRelative(anchorId, sideHint, {
          evidence: `Needed to represent ${meta.label.toLowerCase()} using direct graph relationships.`,
          confidence: .66,
        })
      } else {
        // Keep an unspecified branch separate for each extended relation.
        // “My grandmother … my uncle …” does not prove that both are on the
        // same maternal/paternal side, so reusing one placeholder would invent
        // a relationship the narrator never stated.
        parentId = addPerson({
          name: '',
          relationKey: 'parent',
          relationToNarrator: anchorId === narratorTempId ? `Unknown parent for ${meta.label.toLowerCase()}` : `Unknown parent of ${draftPersonName(anchor)}`,
          gender: 'unspecified',
          evidence: `Needed to represent ${meta.label.toLowerCase()} without assuming a maternal or paternal side.`,
          confidence: .55,
          placeholder: true,
          fallbackSurname: anchor?.surname,
        })
        addRelationship(parentId, anchorId, 'parent', evidence, .55)
      }
      const label = anchorId === narratorTempId
        ? `${sideHint === 'father' ? 'Paternal' : sideHint === 'mother' ? 'Maternal' : ''} ${meta.label}`.trim()
        : `${meta.label} of ${draftPersonName(anchor)}`
      const id = addPerson({ name, relationKey, relationToNarrator: label, gender: meta.gender, evidence, confidence, facts, placeholder: !name, fallbackSurname: getPerson(parentId)?.surname })
      addRelationship(id, parentId, meta.extended === 'grandparent' ? 'parent' : 'sibling', evidence, confidence)
      return id
    }
    const key = `${anchorId}:${relationKey}`
    let id = (!name && cache.get(key)) || null
    if (!id) {
      const label = anchorId === narratorTempId ? meta.label : `${meta.label} of ${draftPersonName(anchor)}`
      id = addPerson({ name, relationKey, relationToNarrator: label, gender: meta.gender, evidence, confidence, facts, placeholder: !name, fallbackSurname: anchor?.surname })
      if (!name || ['father', 'mother'].includes(relationKey)) cache.set(key, id)
    } else mergeFacts(id, facts, evidence)
    if (meta.dir === 'to') addRelationship(id, anchorId, meta.type, evidence, confidence, meta.variant || null)
    else if (meta.dir === 'from') addRelationship(anchorId, id, meta.type, evidence, confidence, meta.variant || null)
    else addRelationship(id, anchorId, meta.type, evidence, confidence, meta.variant || null)
    return id
  }

  const addChain = (chain, name, evidence, facts, confidence = .93, startingAnchor = narratorTempId) => {
    if (!chain?.length) return null
    let anchorId = startingAnchor
    for (let i = 0; i < chain.length; i += 1) {
      const key = chain[i]
      const isLast = i === chain.length - 1
      const sideHint = i > 0 && ['mother', 'father'].includes(chain[i - 1]) ? chain[i - 1] : ''
      anchorId = addRelative(anchorId, key, {
        name: isLast ? name : '',
        evidence,
        confidence: isLast ? confidence : Math.min(confidence, .78),
        facts: isLast ? facts : {},
        sideHint,
      })
      if (!anchorId) return null
    }
    const person = getPerson(anchorId)
    if (person) {
      let label = relationLabelFromChain(chain, person.gender, person.relationToNarrator)
      if (startingAnchor !== narratorTempId && chain.length === 1) {
        const anchor = getPerson(startingAnchor)
        const key = chain[0]
        const side = anchor?.relationKey === 'mother' ? 'Maternal' : anchor?.relationKey === 'father' ? 'Paternal' : ''
        if (side && ['brother', 'sister'].includes(key)) label = `${side} ${key === 'brother' ? 'uncle' : 'aunt'}`
        else if (side && ['father', 'mother'].includes(key)) label = `${side} ${key === 'father' ? 'grandfather' : 'grandmother'}`
        else if (['brother', 'sister'].includes(anchor?.relationKey) && ['son', 'daughter'].includes(key)) label = key === 'son' ? 'Nephew' : 'Niece'
      }
      person.relationToNarrator = label
    }
    return anchorId
  }

  let lastId = narratorTempId
  const warnings = []
  const clauses = splitIntoClauses(transcript, language)
  const relationAlt = alt(language)

  for (const clause of clauses) {
    const sentence = clause.trim()
    if (!sentence) continue
    let matched = false

    const narratorFacts = narratorFactsFrom(sentence, language)
    const isNarratorFact = language === 'es'
      ? /^(?:yo\s+)?(?:(?:actualmente\s+)?(?:vivo|estoy\s+viviendo)\s+en|nac(?:í|i)\s+en|tengo\s+\d{1,3}\s+años)\b/iu.test(sentence)
      : language === 'en'
        ? /^i\s*(?:(?:'m|am)\s+(?:(?:currently\s+)?(?:living|live)\s+in|\d{1,3}\b)|was\s+born\s+in)/iu.test(sentence)
        : false
    if (isNarratorFact) {
      mergeFacts(narratorTempId, narratorFacts, sentence)
      lastId = narratorTempId
      matched = true
    }

    if (!matched && language === 'en') {
      const have = sentence.match(new RegExp(`^i\\s+have\\s+(?:(?:a|an|the)\\s+)?(${relationAlt})\\b(.*)$`, 'iu'))
      if (have) {
        const key = tokenKey('en', have[1])
        let rest = have[2].trim().replace(/^(?:whose\s+name\s+(?:is|was)|who\s+(?:is|was)\s+(?:called|named)|called|named|is|was)\s+/iu, '')
        rest = stripLeadingFillers(rest, language)
        const name = cleanName(rest, language)
        if (key && name) {
          lastId = addChain([key], name, sentence, factsFrom(rest), .91)
          matched = true
        }
      }
    }

    if (!matched && language === 'es') {
      const have = sentence.match(new RegExp(`^tengo\\s+(?:un|una)\\s+(${relationAlt})\\b(.*)$`, 'iu'))
      if (have) {
        const key = tokenKey('es', have[1])
        let rest = have[2].trim().replace(/^(?:que\s+se\s+llama|cuyo\s+nombre\s+es|llamado|llamada|se\s+llama|es)\s+/iu, '')
        rest = stripLeadingFillers(rest, language)
        const name = cleanName(rest, language)
        if (key && name) {
          lastId = addChain([key], name, sentence, factsFrom(rest), .91)
          matched = true
        }
      }
    }


    if (!matched && language === 'en') {
      const remarriage = sentence.match(/^(?:my\s+)?(father|dad|mother|mom|mum)\s+(?:re)?married\s+(?:to\s+)?(?:(?:a|an)\s+)?(?:(woman|girl|man|boy|person|someone)\s+)?(?:named|called|whose\s+name\s+is)\s+(.+)$/iu)
      if (remarriage) {
        const parentKey = /mother|mom|mum/iu.test(remarriage[1]) ? 'mother' : 'father'
        const parentId = addChain([parentKey], '', sentence, {}, .76)
        const name = cleanName(remarriage[3], 'en')
        const genderWord = (remarriage[2] || '').toLowerCase()
        const spouseKey = /woman|girl/.test(genderWord) ? 'wife' : /man|boy/.test(genderWord) ? 'husband' : 'partner'
        if (parentId && name) {
          const spouseId = addChain([spouseKey], name, sentence, factsFrom(remarriage[3]), .86, parentId)
          const spouse = getPerson(spouseId)
          const parent = getPerson(parentId)
          if (spouse && parent) spouse.relationToNarrator = `${draftPersonName(parent)}'s ${spouseKey === 'wife' ? 'wife' : spouseKey === 'husband' ? 'husband' : 'partner'}`
          lastId = spouseId || parentId
          matched = true
        }
      }
    }

    if (!matched && language === 'en') {
      const pronoun = sentence.match(new RegExp(`^(?:his|her|their)\\s+(${relationAlt})\\b(.*)$`, 'iu'))
      if (pronoun) {
        const key = tokenKey('en', pronoun[1])
        const { name, facts } = extractNameAndFacts(pronoun[2], 'en')
        if (key && name && lastId) {
          lastId = addChain([key], name, sentence, facts, .79, lastId)
          matched = true
        }
      }
    }

    if (!matched && language === 'es') {
      const pronoun = sentence.match(new RegExp(`^su\\s+(${relationAlt})\\b(.*)$`, 'iu'))
      if (pronoun) {
        const key = tokenKey('es', pronoun[1])
        const { name, facts } = extractNameAndFacts(pronoun[2], 'es')
        if (key && name && lastId) {
          lastId = addChain([key], name, sentence, facts, .77, lastId)
          matched = true
        }
      }
    }

    if (!matched) {
      const direct = parseDirectStart(sentence, language)
      if (direct) {
        const { name, facts } = extractNameAndFacts(direct.rest, language)
        if (name || direct.chain.length) {
          lastId = addChain(direct.chain, name, sentence, facts, name ? (language === 'sd' ? .82 : .94) : .72)
          matched = true
        }
      }
    }

    // A standalone follow-up such as "he's 54 and was born in Madrid" belongs
    // to the most recently introduced relative, unless it explicitly says "I".
    if (!matched && lastId !== narratorTempId) {
      const followFacts = factsFrom(sentence)
      const looksLikeFollowUp = language === 'es'
        ? /^(?:él|ella|tiene|vive|vivía|vivia|nació|nacio)\b/iu.test(sentence)
        : language === 'en'
          ? /^(?:he|she|they)\b|^(?:born|living|lives?|lived)\b/iu.test(sentence)
          : false
      if (looksLikeFollowUp && !isEmptyFacts(followFacts)) {
        mergeFacts(lastId, followFacts, sentence)
        matched = true
      }
    }

    if (!matched) {
      // Do not flag harmless conversational filler as a mapping error.
      const filler = language === 'en'
        ? /^(?:okay|ok|well|so|right|yeah|yes|no|um|uh|i\s+am\s+still\s+home)\b/iu.test(sentence)
        : language === 'es'
          ? /^(?:vale|bueno|pues|sí|si|no|eh)\b/iu.test(sentence)
          : false
      if (!filler) warnings.push(`Could not confidently map: “${sentence}”`)
    }
  }

  if (draftPeople.length === 1) warnings.unshift('No family relationships were confidently extracted. Edit the transcript and try a clearer relationship sentence.')
  return { transcript, language, narratorTempId, people: draftPeople, relationships: draftRelationships, warnings: [...new Set(warnings)], createdAt: new Date().toISOString() }
}

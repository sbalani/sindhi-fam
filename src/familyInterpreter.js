export const VOICE_LANGUAGES = {
  en: { label: 'English', locale: 'en-US' },
  es: { label: 'Español', locale: 'es-ES' },
  sd: { label: 'سنڌي', locale: 'sd-PK' },
}

const REL = {
  father: { label: 'Father', gender: 'male', type: 'parent', dir: 'to' },
  mother: { label: 'Mother', gender: 'female', type: 'parent', dir: 'to' },
  brother: { label: 'Brother', gender: 'male', type: 'sibling', dir: 'sym' },
  sister: { label: 'Sister', gender: 'female', type: 'sibling', dir: 'sym' },
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
    father: 'father|dad', mother: 'mother|mom|mum', brother: 'brother', sister: 'sister',
    son: 'son', daughter: 'daughter', husband: 'husband', wife: 'wife', partner: 'partner|spouse',
    grandfather: 'grandfather|grandpa', grandmother: 'grandmother|grandma', uncle: 'uncle', aunt: 'aunt|aunty|auntie',
  },
  es: {
    father: 'padre|papá|papa', mother: 'madre|mamá|mama', brother: 'hermano', sister: 'hermana',
    son: 'hijo', daughter: 'hija', husband: 'marido|esposo', wife: 'esposa|mujer', partner: 'pareja|cónyuge|conyuge',
    grandfather: 'abuelo', grandmother: 'abuela', uncle: 'tío|tio', aunt: 'tía|tia',
  },
  sd: {
    father: 'پيءُ|پيء|بابا|ابا|baba|abba|pita', mother: 'ماءُ|ماء|امڙ|اما|amma|maa',
    brother: 'ڀاءُ|ڀاء|bhau|bhai', sister: 'ڀيڻ|bhen|behen', son: 'پٽ|putar|beta', daughter: 'ڌيءُ|ڌيء|dhee|beti',
    husband: 'مڙس|ghot|pati', wife: 'زال|gharwari|patni', partner: 'ساٿي|partner',
    grandfather: 'ڏاڏو|نانا|dado|nana', grandmother: 'ڏاڏي|ناني|dadi|nani', uncle: 'چاچو|مامو|chacha|mama', aunt: 'چاچي|مامي|maasi|aunt',
  },
}

const alt = (lang) => Object.values(TOKENS[lang] || TOKENS.en).join('|')
const tokenKey = (lang, token) => Object.entries(TOKENS[lang] || TOKENS.en)
  .find(([, pattern]) => new RegExp(`^(?:${pattern})$`, 'iu').test(token.trim().toLowerCase()))?.[0]

const splitName = (full, fallback = 'Unknown') => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Unknown', surname: fallback }
  if (parts.length === 1) return { firstName: parts[0], surname: fallback }
  return { firstName: parts.slice(0, -1).join(' '), surname: parts.at(-1) }
}

const cleanName = (raw, lang) => {
  let value = String(raw || '').replace(/^[\s,:-]+|[\s,.!?؟;:-]+$/gu, '').trim()
  const breaker = lang === 'es'
    ? /\s*(?:,|\by\s+(?:tiene|vive|vivía|nació)|\bque\s+(?:tiene|vive|nació))\b/i
    : lang === 'sd'
      ? /\s*(?:,|،|\s+آهي\b|\s+هو\b|\s+هئي\b|\band\s+(?:he|she)\b)/iu
      : /\s*(?:,|\band\s+(?:he|she|they)\b|\b(?:he|she|they)\s+(?:is|was|lives?|lived)\b|\bwho\s+)/i
  value = value.split(breaker)[0].trim()
  return value.slice(0, 140)
}

const factsFrom = (sentence) => {
  const age = sentence.match(/\b(?:is|aged?)\s+(\d{1,3})\s*(?:years? old)?\b/i)?.[1]
    || sentence.match(/\btiene\s+(\d{1,3})\s+años\b/i)?.[1]
    || sentence.match(/(\d{1,3})\s*سال/u)?.[1]
  const location = sentence.match(/\b(?:lives?|lived|living)\s+in\s+([^,.;]+?)(?=\s+(?:and|but)\b|[,.!?]|$)/i)?.[1]
    || sentence.match(/\b(?:vive|vivía|vivia)\s+en\s+([^,.;]+?)(?=\s+(?:y|pero)\b|[,.!?]|$)/i)?.[1]
    || ''
  const birthLocation = sentence.match(/\b(?:was\s+)?born\s+in\s+(?!\d{4}\b)([^,.;]+?)(?=\s+(?:and|but)\b|[,.!?]|$)/i)?.[1]
    || sentence.match(/\bnac(?:ió|io)\s+en\s+(?!\d{4}\b)([^,.;]+?)(?=\s+(?:y|pero)\b|[,.!?]|$)/i)?.[1]
    || ''
  const birthYear = Number(sentence.match(/\b(?:born|nac(?:ió|io))\s+(?:in|en)\s+((?:18|19|20)\d{2})\b/i)?.[1]) || null
  return { age: age ? Number(age) : null, location: location.trim(), birthLocation: birthLocation.trim(), birthYear }
}

const band = (c) => c >= .88 ? 'high' : c >= .7 ? 'medium' : 'low'
export const draftPersonName = (p) => p?.isPlaceholder ? (p.placeholderLabel || p.relationToNarrator) : [p?.firstName, p?.surname !== 'Unknown' ? p?.surname : ''].filter(Boolean).join(' ')

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

  const addRelationship = (from, to, type, evidence, confidence) => {
    const symmetric = ['sibling', 'spouse', 'partner'].includes(type)
    const duplicate = draftRelationships.some(r => r.type === type && ((r.from === from && r.to === to) || (symmetric && r.from === to && r.to === from)))
    if (duplicate || !from || !to || from === to) return
    draftRelationships.push({ id: `r${rSeq++}`, from, to, type, evidence, confidence, confidenceBand: band(confidence), status: 'pending' })
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
    if (!meta) return null
    const anchor = getPerson(anchorId)
    if (meta.extended) {
      let parentId
      if (sideHint === 'mother' || sideHint === 'father') {
        parentId = addRelative(anchorId, sideHint, {
          evidence: `Needed to represent ${meta.label.toLowerCase()} using direct graph relationships.`,
          confidence: .66,
        })
      } else {
        // A plain "grandfather" or "uncle" does not tell us which side of
        // the family it belongs to. Keep that uncertainty visible instead of
        // inventing a maternal/paternal side.
        const placeholderKey = `${anchorId}:unknown-parent`
        parentId = cache.get(placeholderKey)
        if (!parentId) {
          parentId = addPerson({
            name: '',
            relationKey: 'parent',
            relationToNarrator: anchorId === narratorTempId ? 'Unknown parent' : `Unknown parent of ${draftPersonName(anchor)}`,
            gender: 'unspecified',
            evidence: `Needed to represent ${meta.label.toLowerCase()} without assuming a maternal or paternal side.`,
            confidence: .55,
            placeholder: true,
            fallbackSurname: anchor?.surname,
          })
          addRelationship(parentId, anchorId, 'parent', evidence, .55)
          cache.set(placeholderKey, parentId)
        }
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
    }
    if (meta.dir === 'to') addRelationship(id, anchorId, meta.type, evidence, confidence)
    else if (meta.dir === 'from') addRelationship(anchorId, id, meta.type, evidence, confidence)
    else addRelationship(id, anchorId, meta.type, evidence, confidence)
    return id
  }

  let lastId = narratorTempId
  const warnings = []
  const sentences = String(transcript || '').replace(/\r/g, '\n').split(/(?<=[.!?؟])\s+|\n+|\s*;\s*/u).map(s => s.trim()).filter(Boolean)
  const relationAlt = alt(language)

  for (const sentence of sentences) {
    const facts = factsFrom(sentence)
    let matched = false, m
    if (language === 'en') {
      m = sentence.match(new RegExp(`\\bmy\\s+(${relationAlt})['’]s\\s+(${relationAlt})\\s+(?:is|was|is called|was called|is named|was named)\\s+(.+)$`, 'iu'))
      if (m) {
        const first = tokenKey(language, m[1]), second = tokenKey(language, m[2]), name = cleanName(m[3], language)
        if (first && second && name) {
          const anchor = addRelative(narratorTempId, first, { evidence: sentence, confidence: .78 })
          lastId = addRelative(anchor, second, { name, evidence: sentence, confidence: .84, facts, sideHint: first })
          const p = getPerson(lastId)
          if (p && ['brother', 'sister'].includes(second) && ['mother', 'father'].includes(first)) p.relationToNarrator = `${first === 'mother' ? 'Maternal' : 'Paternal'} ${second === 'brother' ? 'uncle' : 'aunt'}`
          matched = true
        }
      }
      if (!matched) {
        m = sentence.match(new RegExp(`\\bmy\\s+(${relationAlt})(?:['’]s\\s+name)?\\s+(?:is|was|is called|was called|is named|was named)\\s+(.+)$`, 'iu'))
        if (m) { const key = tokenKey(language, m[1]), name = cleanName(m[2], language); if (key && name) { lastId = addRelative(narratorTempId, key, { name, evidence: sentence, confidence: .93, facts }); matched = true } }
      }
      if (!matched) {
        m = sentence.match(new RegExp(`^(?:his|her|their)\\s+(${relationAlt})\\s+(?:is|was|is called|was called|is named|was named)\\s+(.+)$`, 'iu'))
        if (m) { const key = tokenKey(language, m[1]), name = cleanName(m[2], language); if (key && name) { lastId = addRelative(lastId, key, { name, evidence: sentence, confidence: .76, facts }); matched = true } }
      }
    } else if (language === 'es') {
      m = sentence.match(new RegExp(`(?:el|la)?\\s*(${relationAlt})\\s+de\\s+mi\\s+(${relationAlt})\\s+(?:se llama|se llamaba|es|era)\\s+(.+)$`, 'iu'))
      if (m) {
        const second = tokenKey(language, m[1]), first = tokenKey(language, m[2]), name = cleanName(m[3], language)
        if (first && second && name) { const anchor = addRelative(narratorTempId, first, { evidence: sentence, confidence: .78 }); lastId = addRelative(anchor, second, { name, evidence: sentence, confidence: .84, facts, sideHint: first }); const p = getPerson(lastId); if (p && ['brother', 'sister'].includes(second)) p.relationToNarrator = first === 'mother' ? 'Tío/Tía materno' : 'Tío/Tía paterno'; matched = true }
      }
      if (!matched) {
        m = sentence.match(new RegExp(`\\bmi\\s+(${relationAlt})\\s+(?:se llama|se llamaba|es|era)\\s+(.+)$`, 'iu'))
        if (m) { const key = tokenKey(language, m[1]), name = cleanName(m[2], language); if (key && name) { lastId = addRelative(narratorTempId, key, { name, evidence: sentence, confidence: .93, facts }); matched = true } }
      }
      if (!matched) {
        m = sentence.match(new RegExp(`^su\\s+(${relationAlt})\\s+(?:se llama|se llamaba|es|era)\\s+(.+)$`, 'iu'))
        if (m) { const key = tokenKey(language, m[1]), name = cleanName(m[2], language); if (key && name) { lastId = addRelative(lastId, key, { name, evidence: sentence, confidence: .75, facts }); matched = true } }
      }
    } else {
      m = sentence.match(new RegExp(`(?:منهنجو|منهنجي|منھنجو|منھنجي)\\s+(${relationAlt})\\s+(.+?)\\s+(?:آهي|هو|هئي|آھن|آهن)[.!؟]?$`, 'iu'))
      if (!m) m = sentence.match(new RegExp(`\\b(?:munhjo|munhji|muhnjo|muhnji|my)\\s+(${relationAlt})\\s+(?:is|aahe|ahe)?\\s*(.+)$`, 'iu'))
      if (m) { const key = tokenKey(language, m[1]), name = cleanName(m[2], language); if (key && name) { lastId = addRelative(narratorTempId, key, { name, evidence: sentence, confidence: .8, facts }); matched = true } }
    }
    if (!matched) warnings.push(`Could not confidently map: “${sentence}”`)
  }

  if (draftPeople.length === 1) warnings.unshift('No family relationships were confidently extracted. Edit the transcript and try a clearer relationship sentence.')
  return { transcript, language, narratorTempId, people: draftPeople, relationships: draftRelationships, warnings: [...new Set(warnings)], createdAt: new Date().toISOString() }
}

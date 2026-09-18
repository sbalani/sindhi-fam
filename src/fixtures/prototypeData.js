export const seedPeople = [
  { id: 'me', name: 'Anika Advani', firstName: 'Anika', surname: 'Advani', birthYear: '1991', birthPlace: 'Mumbai', livedIn: 'London', side: 'You', status: 'confirmed', initials: 'AA', color: 'terracotta' },
  { id: 'mother', name: 'Leena Mirchandani', firstName: 'Leena', surname: 'Mirchandani', maidenName: 'Mirchandani', birthYear: '1963', birthPlace: 'Ulhasnagar', livedIn: 'Mumbai', side: "Mother's side", status: 'confirmed', initials: 'LM', color: 'saffron' },
  { id: 'father', name: 'Rajan Advani', firstName: 'Rajan', surname: 'Advani', birthYear: '1959', birthPlace: 'Ajmer', livedIn: 'Mumbai', side: "Father's side", status: 'confirmed', initials: 'RA', color: 'indigo' },
  { id: 'nani', name: 'Kamla Mirchandani', firstName: 'Kamla', surname: 'Mirchandani', maidenName: 'Chandiramani', birthYear: '1934', birthPlace: 'Hyderabad, Sindh', livedIn: 'Ulhasnagar', side: "Mother's side", status: 'confirmed', initials: 'KM', color: 'rose' },
  { id: 'dada', name: 'Mohan Advani', firstName: 'Mohan', surname: 'Advani', birthYear: '1929', birthPlace: 'Shikarpur, Sindh', livedIn: 'Ajmer', side: "Father's side", status: 'confirmed', initials: 'MA', color: 'teal' },
  { id: 'aunt', name: 'Sonia Makhija', firstName: 'Sonia', surname: 'Makhija', maidenName: 'Advani', birthYear: '1962', birthPlace: 'Ajmer', livedIn: 'Pune', side: "Father's side", status: 'confirmed', initials: 'SM', color: 'plum' },
]

export const seedRelationships = [
  { id: 'r1', from: 'mother', to: 'me', type: 'parent' },
  { id: 'r2', from: 'father', to: 'me', type: 'parent' },
  { id: 'r3', from: 'nani', to: 'mother', type: 'parent' },
  { id: 'r4', from: 'dada', to: 'father', type: 'parent' },
  { id: 'r5', from: 'father', to: 'aunt', type: 'sibling' },
  { id: 'r6', from: 'mother', to: 'father', type: 'spouse' },
  { id: 'r7', from: 'mother', to: 'father', type: 'distant cousin' },
]

export const suggestions = [
  { id: 's1', name: 'Dev Advani', initials: 'DA', details: 'Born 1957 · Ajmer · now in Toronto', score: 92, shared: ['Advani', 'Ajmer', 'Mohan Advani'], relation: "Possible father's cousin", color: 'blue' },
  { id: 's2', name: 'Neeta Chandiramani', initials: 'NC', details: 'Born 1938 · Hyderabad, Sindh · now in Pune', score: 84, shared: ['Chandiramani', 'Hyderabad, Sindh'], relation: "Possible grandmother's cousin", color: 'rose' },
  { id: 's3', name: 'Arun Mirchandani', initials: 'AM', details: 'Born 1960 · Ulhasnagar · now in Dubai', score: 76, shared: ['Mirchandani', 'Ulhasnagar'], relation: "Possible mother's cousin", color: 'green' },
]

export const surnames = [
  { name: 'Advani', count: 14, place: 'Shikarpur' },
  { name: 'Mirchandani', count: 9, place: 'Hyderabad' },
  { name: 'Chandiramani', count: 6, place: 'Hyderabad' },
  { name: 'Makhija', count: 3, place: 'Sukkur' },
]

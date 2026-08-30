const MIN_YEAR = 1800;

export const currentYear = () => new Date().getFullYear();

export const normalizeName = (value) => value.trim().replace(/\s+/g, " ");

export const validateYear = (value, label, { allowBlank = true, min = MIN_YEAR, max = currentYear() } = {}) => {
  if ((value === "" || value === null || value === undefined) && allowBlank) return null;
  const text = String(value).trim();
  if (!/^\d{4}$/.test(text)) throw new Error(`${label} must be a four-digit year.`);
  const year = Number(text);
  if (year < min || year > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return year;
};

export const validatePersonForm = (form) => {
  const firstName = normalizeName(form.firstName || "");
  const surname = normalizeName(form.surname || "");
  if (!firstName || !surname) throw new Error("First name and surname are required.");
  if (firstName.length > 100 || surname.length > 100) throw new Error("Names must be 100 characters or fewer.");

  const today = new Date();
  let birthYear = null;
  if (form.birthDate) {
    const parsed = new Date(`${form.birthDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime()) || parsed > today || parsed.getFullYear() < MIN_YEAR)
      throw new Error("Enter a valid date of birth.");
    birthYear = parsed.getFullYear();
  } else if (form.birthYear) {
    birthYear = validateYear(form.birthYear, "Birth year");
  }

  let deathYear = null;
  if (form.deathDate) {
    const parsed = new Date(`${form.deathDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime()) || parsed > today || parsed.getFullYear() < MIN_YEAR)
      throw new Error("Enter a valid date of death.");
    deathYear = parsed.getFullYear();
  } else if (form.deathYear) {
    deathYear = validateYear(form.deathYear, "Death year");
  }
  if (birthYear && deathYear && deathYear < birthYear)
    throw new Error("Death year cannot be before birth year.");
  if (!deathYear && form.privacyLevel === "match_clues" && birthYear && currentYear() - birthYear < 18)
    throw new Error("Living minors cannot be exposed to cross-family matching clues.");

  const seenLocations = new Set();
  const livedLocations = (form.livedLocations || []).map((location) => {
    const key = `${location.providerId || location.display}`.toLowerCase();
    if (seenLocations.has(key)) throw new Error(`${location.display} is listed more than once as a residence.`);
    seenLocations.add(key);
    const startYear = validateYear(location.startYear, `From year for ${location.display}`);
    const endYear = validateYear(location.endYear, `To year for ${location.display}`);
    if (startYear && endYear && startYear > endYear)
      throw new Error(`The From year for ${location.display} cannot be after its To year.`);
    if (birthYear && endYear && endYear < birthYear)
      throw new Error(`${location.display} ends before the recorded birth year.`);
    if (birthYear && startYear && startYear < birthYear - 1)
      throw new Error(`${location.display} starts before the recorded birth year.`);
    return { ...location, startYear, endYear };
  });

  const marriageYear = validateYear(form.marriageYear, "Marriage/partnership year");
  if (birthYear && marriageYear && marriageYear < birthYear + 12)
    throw new Error("The relationship year appears to be earlier than a plausible age.");

  return {
    firstName,
    surname,
    birthYear,
    deathYear,
    marriageYear,
    livedLocations,
  };
};

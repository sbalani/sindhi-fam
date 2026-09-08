const coordinate = (location, primary, legacy) => {
  const raw = location?.[primary] ?? location?.[legacy];
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export const locationPoint = (location) => {
  const latitude = coordinate(location, "latitude", "lat");
  const longitude = coordinate(location, "longitude", "lon");
  return latitude === null || longitude === null
    ? null
    : { latitude, longitude };
};

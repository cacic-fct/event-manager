/** Historical sources store the place name and details in one field. */
export function transferLocationData(combinedLocation: string | null) {
  const location = combinedLocation?.trim() || null;
  if (location === 'Evento on-line') {
    return {
      isVirtual: true,
      locationName: null,
      locationDescription: null,
      latitude: null,
      longitude: null,
    };
  }
  const separator = location?.indexOf(' - ') ?? -1;
  return {
    isVirtual: false,
    locationName: (separator < 0 ? location : location?.slice(0, separator))?.trim() || null,
    locationDescription: separator < 0 ? null : location?.slice(separator + 3).trim() || null,
  };
}

/** A compact display label for event location snapshots, including older combined descriptions. */
export function formatEventLocation(location: {
  locationName?: string | null;
  locationDescription?: string | null;
  isVirtual?: boolean;
}): string | null {
  if (location.isVirtual) return 'Evento on-line';
  const parts = [location.locationName?.trim(), location.locationDescription?.trim()].filter(Boolean);
  return parts.join(' - ') || null;
}

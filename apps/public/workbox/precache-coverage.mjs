/** Fail the build if a lazy application chunk would be unavailable offline. */
export function assertApplicationChunksPrecached(applicationFiles, manifest) {
  const precachedUrls = new Set(manifest.map((entry) => entry.url));
  const missing = applicationFiles.filter((file) => !precachedUrls.has(`/app/${file}`));
  if (missing.length > 0) {
    throw new Error(`Application chunks missing from the offline precache: ${missing.join(', ')}`);
  }
}

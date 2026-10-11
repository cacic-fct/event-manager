export function assertApplicationChunksPrecached(
  applicationFiles: readonly string[],
  manifest: readonly { url: string; revision?: string | null }[],
): void;

export function filterCacicSentryLog<T>(log: T, diagnosticsEnabled: boolean, isDevelopment: boolean): T | null {
  return !isDevelopment && diagnosticsEnabled ? log : null;
}

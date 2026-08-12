export function buildBullMqJobId(namespace: string, ...parts: readonly (string | number)[]): string {
  return [namespace, ...parts].map((part) => encodeURIComponent(String(part))).join('-');
}

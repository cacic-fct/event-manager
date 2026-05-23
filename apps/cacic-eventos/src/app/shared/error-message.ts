export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}

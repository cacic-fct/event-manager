export async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

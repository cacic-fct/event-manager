import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('backend background worker test inventory', () => {
  const sourceFiles = walk(__dirname);
  it('keeps every queue processor and scheduler next to a focused test', () => {
    const uncovered = sourceFiles
      .filter((file) => /\.(processor|scheduler)\.ts$/.test(file) && !file.endsWith('.spec.ts'))
      .filter((file) => !sourceFiles.includes(file.replace(/\.ts$/, '.spec.ts')))
      .map(relativeToApp);

    expect(uncovered).toEqual([]);
  });
});

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function relativeToApp(file: string): string {
  return file.slice(__dirname.length + 1);
}

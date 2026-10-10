import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const storyFilePattern = /(?:\.stories\.(?:js|jsx|ts|tsx)|\.mdx)$/;

function hasStories(directory) {
  if (!existsSync(directory)) {
    return false;
  }
  return readdirSync(directory, { withFileTypes: true }).some((entry) =>
    entry.isDirectory()
      ? hasStories(join(directory, entry.name))
      : entry.isFile() && storyFilePattern.test(entry.name),
  );
}

/**
 * Every library catalog belongs to public unless Nx explicitly scopes it to
 * admin/backend. A shared library used only by admin/backend can opt into the
 * admin catalog with the `storybook:admin` project tag.
 */
export function getLibraryStoryGlobs(audience, repositoryRoot = process.cwd()) {
  const librariesRoot = join(repositoryRoot, 'libs');
  return readdirSync(librariesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const libraryRoot = join(librariesRoot, entry.name);
      const projectPath = join(libraryRoot, 'project.json');
      const project = existsSync(projectPath) ? JSON.parse(readFileSync(projectPath, 'utf8')) : {};
      const tags = project.tags ?? [];
      const adminOnly = tags.some((tag) => ['scope:admin', 'scope:backend', 'storybook:admin'].includes(tag));
      const sourceRoot = project.sourceRoot ? join(repositoryRoot, project.sourceRoot) : join(libraryRoot, 'src');

      if ((audience === 'admin') !== adminOnly || !hasStories(sourceRoot)) {
        return [];
      }

      const sourcePath = relative(repositoryRoot, sourceRoot).replaceAll('\\', '/');
      return [`../../../${sourcePath}/**/*.@(mdx|stories.@(js|jsx|ts|tsx))`];
    });
}

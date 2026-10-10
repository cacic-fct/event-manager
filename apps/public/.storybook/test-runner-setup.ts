import { getStoryContext, setPreVisit } from '@storybook/test-runner';

const viewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1280, height: 900 },
};

// Install the hook through Jest setup: Storybook's config loader calls
// module.register(), which is unsupported inside the Jest sandbox on Node 26.
setPreVisit(async (page, story) => {
  // The runner waits for the root element, which can precede story-index setup.
  await page.waitForFunction(() => {
    const preview = (window as unknown as {
      __STORYBOOK_PREVIEW__?: { storyStore?: { loadStory?: unknown } };
    }).__STORYBOOK_PREVIEW__;
    try {
      return typeof preview?.storyStore?.loadStory === 'function';
    } catch {
      return false;
    }
  }, undefined, { timeout: 10_000 });
  const context = await getStoryContext(page, story) as Awaited<ReturnType<typeof getStoryContext>> & {
    storyGlobals?: Record<string, unknown>;
  };
  const globals = context.storyGlobals ?? {};
  // Storybook's theme global changes Material tokens. Match browser media
  // queries too, so CSS and motion-dependent shared components see that theme.
  await page.emulateMedia({
    colorScheme: globals['theme'] === 'dark' ? 'dark' : 'light',
    reducedMotion: globals['motion'] === 'reduced' ? 'reduce' : 'no-preference',
  });
  const viewportName: unknown = context.parameters['viewport']?.defaultViewport;
  const viewport = typeof viewportName === 'string' && Object.prototype.hasOwnProperty.call(viewports, viewportName)
    ? viewports[viewportName as keyof typeof viewports]
    : viewports.desktop;
  await page.setViewportSize(viewport);
});

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import {
  SET_CURRENT_STORY,
  PLAY_FUNCTION_THREW_EXCEPTION,
  STORY_ERRORED,
  STORY_FINISHED,
  STORY_THREW_EXCEPTION,
} from 'storybook/internal/core-events';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.STORYBOOK_URL ?? 'http://localhost:4400' },
    grep: { type: 'string' },
    globals: { type: 'string' },
    workers: { type: 'string', default: '4' },
    timeout: { type: 'string', default: '60000' },
    report: { type: 'string' },
    'strict-a11y': { type: 'boolean', default: false },
  },
});

const baseUrl = new URL(values.url.endsWith('/') ? values.url : `${values.url}/`);
const iframeUrl = new URL('iframe.html?viewMode=story', baseUrl);
if (values.globals) iframeUrl.searchParams.set('globals', values.globals);
const concurrency = Number(values.workers);
const timeout = Number(values.timeout);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 || !Number.isFinite(timeout) || timeout <= 0) {
  throw new Error('Use 1–8 workers and a positive timeout in milliseconds.');
}

const response = await fetch(new URL('index.json', baseUrl));
if (!response.ok) throw new Error(`Cannot read the Storybook index: HTTP ${response.status}`);
const { entries } = await response.json();
const filter = values.grep ? new RegExp(values.grep, 'i') : null;
const stories = Object.values(entries).filter((entry) =>
  entry.type === 'story' && entry.tags.includes('test') &&
  (!filter || [entry.title, entry.name, entry.id].some((value) => filter.test(value))),
);
if (!stories.length) throw new Error('No test stories match this catalog/filter.');

const browser = await chromium.launch();
const results = [];
let nextStory = 0;

async function runStory(story) {
  // Story fixtures and browser mocks cannot leak into the next example.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.setDefaultTimeout(timeout);
  try {
    await page.goto(iframeUrl.href, { timeout });
    await page.waitForFunction(() => {
      const preview = window.__STORYBOOK_PREVIEW__;
      // A preview without a selected story can defer creating its story store.
      // Selecting the first story through the channel initializes that store.
      return Boolean(preview?.channel);
    }, undefined, { timeout });

    // Use Storybook's own completion reports, including play and a11y results.
    // This avoids transforming stories or injecting a second test runtime.
    const result = await page.evaluate(({ id, events, timeoutMs }) => new Promise((resolve, reject) => {
      const channel = window.__STORYBOOK_PREVIEW__.channel;
      const subscriptions = [];
      let playError;
      const cleanup = () => {
        window.clearTimeout(timer);
        for (const [event, listener] of subscriptions) channel.off(event, listener);
      };
      const finish = (result) => {
        cleanup();
        resolve(result);
      };
      const listen = (event, listener) => {
        subscriptions.push([event, listener]);
        channel.on(event, listener);
      };
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Story did not finish within ${timeoutMs}ms: ${id}`));
      }, timeoutMs);

      listen(events.finished, (report) => {
        if (report.storyId === id) finish({ ...report, error: playError });
      });
      listen(events.playErrored, (error) => { playError = error.message ?? String(error); });
      for (const event of [events.errored, events.threw]) {
        listen(event, (error) => finish({ storyId: id, status: 'error', error: error.message ?? error.description ?? String(error) }));
      }
      channel.emit(events.select, { storyId: id });
    }), {
      id: story.id,
      timeoutMs: timeout,
      events: { select: SET_CURRENT_STORY, finished: STORY_FINISHED, errored: STORY_ERRORED, threw: STORY_THREW_EXCEPTION, playErrored: PLAY_FUNCTION_THREW_EXCEPTION },
    });

    const accessibility = result.reporters?.find((reporter) => reporter.type === 'a11y');
    const violations = accessibility?.result?.violations ?? [];
    const accessibilityError = accessibility?.result?.error;
    if (!result.error && accessibilityError) {
      result.error = `Accessibility check failed: ${accessibilityError.message ?? accessibilityError.name ?? 'unknown error'}`;
    }
    if (!result.error && violations.length > 0) {
      result.error = `Accessibility violations: ${violations.map((violation) => violation.id).join(', ')}`;
    }
    const passed = result.status === 'success' && !result.error && browserErrors.length === 0 &&
      violations.length === 0 && (!values['strict-a11y'] || Boolean(accessibility));
    if (values['strict-a11y'] && !accessibility && !result.error) {
      result.error = 'Storybook did not report an accessibility check.';
    }
    if (browserErrors.length) {
      result.error = [result.error, ...browserErrors].filter(Boolean).join('\n');
    }
    return { id: story.id, title: story.title, name: story.name, passed, ...result };
  } catch (error) {
    return { id: story.id, title: story.title, name: story.name, passed: false, error: error.message };
  } finally {
    await context.close();
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(concurrency, stories.length) }, async () => {
    while (nextStory < stories.length) {
      const story = stories[nextStory++];
      const result = await runStory(story);
      results.push(result);
      if (!result.passed) console.error(`FAIL ${story.id}: ${(result.error ?? 'Storybook reported a failed interaction or accessibility check.').split('\n')[0]}`);
      if (results.length % 25 === 0) console.log(`Checked ${results.length}/${stories.length} stories.`);
    }
  }));
} finally {
  await browser.close();
}

results.sort((left, right) => left.id.localeCompare(right.id));
if (values.report) writeFileSync(values.report, JSON.stringify(results, null, 2));
const failed = results.filter((result) => !result.passed);
const accessibilityWarnings = results.filter((result) => result.reporters?.some((reporter) => reporter.type === 'a11y' && reporter.status === 'warning'));
console.log(`${results.length - failed.length}/${results.length} Storybook browser tests passed; ${accessibilityWarnings.length} existing a11y warnings.`);
if (failed.length) process.exitCode = 1;

import { waitForPortOpen } from '@nx/node/utils';

declare global {
  var __TEARDOWN_MESSAGE__: string | undefined;
}

module.exports = async function () {
  console.log('\nSetting up...\n');

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await waitForPortOpen(port, { host });

  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};

export {};

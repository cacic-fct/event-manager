import { killPort } from '@nx/node/utils';

declare global {
  var __TEARDOWN_MESSAGE__: string | undefined;
}

module.exports = async function () {
  if (process.env.E2E_STOP_SERVER === 'true') {
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    await killPort(port);
  }

  console.log(globalThis.__TEARDOWN_MESSAGE__ ?? '\nTearing down...\n');
};

export {};

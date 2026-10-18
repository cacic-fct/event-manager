import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let contract;

/** Load the application's actual schema, without maintaining a second export contract. */
export function loadTransferContract() {
  if (contract) return contract;
  const sharedDirectory = fileURLToPath(new URL('../../libs/shared-data-transfer/src/lib/', import.meta.url));
  const { register } = require('@swc-node/register/register');
  const unregister = register(
    { target: 9 },
    { matcher: (filename) => filename.startsWith(sharedDirectory) && filename.endsWith('.ts') },
  );
  try {
    contract = {
      ...require(`${sharedDirectory}schema-helpers.ts`),
      ...require(`${sharedDirectory}schema.ts`),
      ...require(`${sharedDirectory}validation.ts`),
      ...require(`${sharedDirectory}person-data.ts`),
    };
    return contract;
  } finally {
    unregister();
  }
}

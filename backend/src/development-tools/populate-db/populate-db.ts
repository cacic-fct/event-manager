import * as create_users from './create-users/create-users';
import * as create_events from './create-events/create-events';

const isRunningOnEmulator = process.env.FUNCTIONS_EMULATOR && process.env.FIRESTORE_EMULATOR_HOST;

if (isRunningOnEmulator) {
  exports.create_users = create_users;
  exports.create_events = create_events;
}

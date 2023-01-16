import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { applicationDefault, initializeApp } from 'firebase-admin/app';

initializeApp({
  credential: applicationDefault(),
});

import * as populate_db from './development-tools/populate-db/populate-db';
import * as claims from './claims/claims';
import * as firestore_triggers from './firestore-triggers/firestore-triggers';
import * as user_utils from './utils/user/user-utils';
import * as certificates from './certificates/issue-certificate';

exports.populate_db = populate_db;
exports.claims = claims;
exports.firestore_triggers = firestore_triggers;
exports.user_utils = user_utils;
exports.certificates = certificates;

// Attribution: amiregelz
// https://stackoverflow.com/questions/36759627/firebase-login-as-other-user/71808501#71808501
// TODO: FIX THIS
exports.impersonate = functions.https.onCall((data, context) => {
  if (context.app == undefined) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.'
    );
  }
  // Check if request is made by an admin
  if (!context.auth) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }
  if (context.auth.token.role !== 1000) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called by an admin.');
  }
  const remoteConfig = admin.remoteConfig();

  // Get whitelist array as string from remote config
  return remoteConfig.getTemplate().then((template) => {
    // @ts-ignore
    const whitelist: string = template.parameters.adminWhitelist.defaultValue?.value;

    if (context.auth?.uid) {
      return admin
        .auth()
        .getUser(context.auth.uid)
        .then((userRecord) => {
          if (userRecord.email && whitelist.includes(userRecord.email)) {
            const userId = data.uid;
            return admin
              .auth()
              .createCustomToken(userId)
              .then((customToken) => {
                return {
                  token: customToken,
                };
              });
          } else {
            throw new functions.https.HttpsError('failed-precondition', 'You are not whitelisted.');
          }
        })
        .catch((error) => {
          return { message: `${error}` };
        });
    }

    throw new functions.https.HttpsError('failed-precondition', 'Your uid was not provided.');
  });
});

import { applicationDefault, initializeApp } from 'firebase-admin/app';

import { setGlobalOptions } from 'firebase-functions/v2/options';

initializeApp({
  credential: applicationDefault(),
});

setGlobalOptions({ region: 'southamerica-east1' });

import * as populate_db from './development-tools/populate-db/populate-db';
import * as claims from './claims/claims';
import * as firestore_triggers from './firestore-triggers/firestore-triggers';
import * as user_utils from './utils/user/user-utils';
import * as certificates from './certificates/issue-certificate';

import * as moveCertificates from './unused/move-certificates';

exports.populate_db = populate_db;
exports.claims = claims;
exports.firestore_triggers = firestore_triggers;
exports.user_utils = user_utils;
exports.certificates = certificates;
exports.moveCertificates = moveCertificates;

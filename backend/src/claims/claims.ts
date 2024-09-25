import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { MainReturnType } from './../shared/return-types';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import { log } from 'firebase-functions/logger';

exports.addAdminRole = onCall(async (request): Promise<MainReturnType> => {
  const data = request.data;
  const context = request;
  const remoteConfig = getRemoteConfig();

  if (context.app === undefined) {
    throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
  }

  // Check if request is made by an admin
  if (!context.auth) {
    throw new HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }

  if (context.auth.token.role !== 1000) {
    throw new HttpsError('failed-precondition', 'The function must be called by an admin.');
  }

  // Get whitelist array as string from remote config
  const template = await remoteConfig.getTemplate();

  // @ts-expect-error
  const blacklist: string = template.parameters.adminBlacklist.defaultValue?.value;
  // Check if email is included in whitelist array
  if (blacklist.includes(data.email)) {
    throw new HttpsError('failed-precondition', 'You cannot add this user.');
  }

  // Get user and add custom claim (admin)
  try {
    const user = await getAuth().getUserByEmail(data.email);
    getAuth().setCustomUserClaims(user.uid, {
      role: 1000,
    });
    const db = getFirestore();
    const document = db.doc('claims/admin');

    document.set({ admins: FieldValue.arrayUnion(data.email) }, { merge: true });
    log('User ' + data.email + ' has been made an admin by ' + context.auth.uid);

    return {
      message: `${data.email} has been made an admin`,
      success: true,
    };
  } catch (error) {
    return {
      message: `${error}`,
      success: false,
    };
  }
});

exports.removeAdminRole = onCall(async (request): Promise<MainReturnType> => {
  const data = request.data;
  const context = request;
  const remoteConfig = getRemoteConfig();

  if (context.app === undefined) {
    throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
  }

  if (!context.auth) {
    throw new HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }

  if (context.auth.token.role !== 1000) {
    throw new HttpsError('failed-precondition', 'The function must be called by an admin.');
  }

  // Get whitelist array as string from remote config
  const template = await remoteConfig.getTemplate();

  // @ts-expect-error
  const whitelist: string = template.parameters.adminWhitelist.defaultValue?.value;
  // Check if email is included in whitelist array
  if (whitelist.includes(data.email)) {
    throw new HttpsError('failed-precondition', 'You cannot remove this user.');
  }
  try {
    const user = await getAuth().getUserByEmail(data.email);
    getAuth().setCustomUserClaims(user.uid, {
      role: undefined,
    });
    const db = getFirestore();
    const document = db.doc('claims/admin');

    // Get admin array from document
    document.get().then((doc) => {
      const admins = doc.data()?.admins;
      if (admins === undefined) {
        return;
      }
      // Remove admin from array
      admins.splice(admins.indexOf(data.email), 1);
      // Update document with new array
      return document.update({ admins });
    });

    log('User ' + data.email + ' has been demoted from admin by ' + context.auth.uid);

    return {
      message: `Success! ${data.email} has been demoted from admin`,
      success: true,
    };
  } catch (error) {
    return {
      message: `An error has occured: ${error}`,
      success: false,
    };
  }
});

exports.addProfessorRole = onCall(async (request): Promise<MainReturnType> => {
  const data = request.data;
  const context = request;
  const db = getFirestore();

  if (context.app === undefined) {
    throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
  }

  if (!context.auth) {
    throw new HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }

  if (context.auth.token.role >= 3000) {
    throw new HttpsError('failed-precondition', 'User is already a professor or has a greater role.');
  }

  const remoteConfig = getRemoteConfig();

  // Get professors array as string from remote config
  return remoteConfig
    .getTemplate()
    .then((template) => {
      // @ts-expect-error
      const professors: string = template.parameters.professors.defaultValue?.value;

      // Check if email is included in professors array
      if (!professors.includes(data.email)) {
        return {
          message: `${data.email} is not a professor`,
          success: false,
        };
      }

      return getAuth()
        .getUserByEmail(data.email)
        .then((user) => {
          return getAuth().setCustomUserClaims(user.uid, {
            role: 3000,
          });
        })
        .then(() => {
          const document = db.doc('claims/professor');

          document.set({ professors: FieldValue.arrayUnion(data.email) }, { merge: true });

          return {
            message: `${data.email} has been made a professor`,
            success: true,
          };
        })
        .catch((error) => {
          return {
            message: `${error}`,
            success: false,
          };
        });
    })
    .catch((error) => {
      return {
        message: `${error}`,
        success: false,
      };
    });
});

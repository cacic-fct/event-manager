import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp({
  credential: applicationDefault(),
});

// Attribution: The Net Ninja
// https://youtube.com/watch?v=VvcBqPua2DI&list=PL4cUxeGkcC9jUPIes_B8vRjn1_GaplOPQ

exports.addAdminRole = functions.https.onCall((data, context) => {
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

  // Get user and add custom claim (admin)
  return getAuth()
    .getUserByEmail(data.email)
    .then((user) => {
      return getAuth().setCustomUserClaims(user.uid, {
        role: 1000,
      });
    })
    .then(() => {
      const firestore = admin.firestore();
      const document = firestore.doc('claims/admin');

      // Get admin array from document
      document.get().then((doc) => {
        if (doc.exists) {
          // Add user email to array
          const adminArray = doc.data()?.admins;
          adminArray.push(data.email);
          document.set({
            admins: adminArray,
          });
        } else {
          // If array doesn't exist, create it
          document.set({
            admins: [data.email],
          });
        }
      });

      return {
        message: `${data.email} has been made an admin`,
      };
    })
    .catch((error) => {
      return {
        message: `${error}`,
      };
    });
});

exports.removeAdminRole = functions.https.onCall((data, context) => {
  if (context.app == undefined) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.'
    );
  }

  if (!context.auth) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }

  if (context.auth.token.role !== 1000) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called by an admin.');
  }

  const whitelist = ['renan.yudi@unesp.br', 'willian.murayama@unesp.br', 'gc.tomiasi@unesp.br'];

  if (whitelist.includes(data.email)) {
    throw new functions.https.HttpsError('failed-precondition', 'You cannot remove this user.');
  }

  return getAuth()
    .getUserByEmail(data.email)
    .then((user) => {
      return getAuth().setCustomUserClaims(user.uid, {
        role: undefined,
      });
    })
    .then(() => {
      const firestore = admin.firestore();
      const document = firestore.doc('claims/admin');

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

      return {
        message: `Success! ${data.email} has been demoted from admin`,
      };
    })
    .catch((error) => {
      return {
        message: `An error occured: ${error}`,
      };
    });
});

import { getAuth } from 'firebase-admin/auth';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import {
  adminData,
  adminDataFirestoreDocument,
  undergraduateData,
  undergraduateDataFirestoreDocument,
  professorData,
  professorDataFirestoreDocument,
  externalData,
  externalDataFirestoreDocument,
} from './user-data';

exports.createAdminUser = functions.https.onCall(() => {
  const firestore = admin.firestore();

  getAuth()
    .importUsers([adminData])
    .then(() => {
      console.log('Sucessfully created admin user');
      getAuth()
        .setCustomUserClaims(adminData.uid, {
          role: 1000,
        })
        .catch((error) => {
          console.error('Error setting custom claims for admin user:', error);
        });

      firestore
        .collection('claims')
        .doc('admin')
        .set(
          {
            admins: FieldValue.arrayUnion(adminData.uid),
          },
          { merge: true }
        )
        .catch((error) => {
          console.error('Error writing admin claim to database:', error);
        });

      firestore
        .collection('users')
        .doc(adminData.uid)
        .set(adminDataFirestoreDocument)
        .catch((error) => {
          console.error('Error writing admin data to database:', error);
        });
    });
  return { success: true };
});

exports.createUndergraduateUser = functions.https.onCall(() => {
  const firestore = admin.firestore();

  getAuth()
    .importUsers([undergraduateData])
    .then(() => {
      console.log('Successfully created undergraduate user');
      firestore
        .collection('users')
        .doc(undergraduateData.uid)
        .set(undergraduateDataFirestoreDocument)
        .catch((error) => {
          console.error('Error writing undergraduate data to database:', error);
        });
    })
    .catch((error) => {
      console.error('Error creating undergraduate user:', error);
    });
  return { success: true };
});

exports.createProfessorUser = functions.https.onCall(() => {
  const firestore = admin.firestore();

  getAuth()
    .importUsers([professorData])
    .then(() => {
      console.log('Successfully created professor user');
      getAuth()
        .setCustomUserClaims(adminData.uid, {
          role: 1000,
        })
        .catch((error) => {
          console.error('Error setting custom claims for professor user:', error);
        });

      firestore
        .collection('claims')
        .doc('professor')
        .set(
          {
            professors: FieldValue.arrayUnion(professorData.uid),
          },
          { merge: true }
        )
        .catch((error) => {
          console.error('Error writing professor claim to database:', error);
        });

      firestore
        .collection('users')
        .doc(professorData.uid)
        .set(professorDataFirestoreDocument)
        .catch((error) => {
          console.error('Error writing professor data to database:', error);
        });
    })
    .catch((error) => {
      console.error('Error creating professor user:', error);
    });
  return { success: true };
});

exports.createExternalUser = functions.https.onCall(() => {
  const firestore = admin.firestore();

  getAuth()
    .importUsers([externalData])
    .then(() => {
      console.log('Successfully created external user');
      firestore
        .collection('users')
        .doc(externalData.uid)
        .set(externalDataFirestoreDocument)
        .catch((error) => {
          console.error('Error writing external user data to database:', error);
        });
    })
    .catch((error) => {
      console.error('Error creating external user:', error);
    });
  return { success: true };
});

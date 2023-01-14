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
import { MainReturnType } from '../../../shared/return-types';

exports.createAdminUser = functions.https.onCall(async (): Promise<MainReturnType> => {
  const firestore = admin.firestore();
  try {
    await getAuth().importUsers([adminData]);
    console.log('Sucessfully created admin user');
    await getAuth().setCustomUserClaims(adminData.uid, {
      role: 1000,
    });
    await firestore
      .collection('claims')
      .doc('admin')
      .set(
        {
          admins: FieldValue.arrayUnion(adminData.uid),
        },
        { merge: true }
      );
    await firestore.collection('users').doc(adminData.uid).set(adminDataFirestoreDocument);
    return { success: true, message: 'Successfully created admin user' };
  } catch (error) {
    console.error('Error creating admin user:', error);
    return { success: false, message: 'Error creating admin user' };
  }
});

exports.createUndergraduateUser = functions.https.onCall(async (): Promise<MainReturnType> => {
  const firestore = admin.firestore();

  try {
    await getAuth().importUsers([undergraduateData]);
    console.log('Successfully created undergraduate user');
    await firestore.collection('users').doc(undergraduateData.uid).set(undergraduateDataFirestoreDocument);
  } catch (error) {
    console.error('Error creating undergraduate user:', error);
    return { success: false, message: 'Error creating undergraduate user' };
  }
  return { success: true, message: 'Successfully created undergraduate user' };
});

exports.createProfessorUser = functions.https.onCall(async (): Promise<MainReturnType> => {
  const firestore = admin.firestore();

  try {
    await getAuth().importUsers([professorData]);
    await getAuth().setCustomUserClaims(adminData.uid, {
      role: 1000,
    });
    await firestore
      .collection('claims')
      .doc('professor')
      .set(
        {
          professors: FieldValue.arrayUnion(professorData.uid),
        },
        { merge: true }
      );
    await firestore.collection('users').doc(professorData.uid).set(professorDataFirestoreDocument);
  } catch (error) {
    console.error(error);
    return { success: false, message: 'Error creating professor user' };
  }
  return { success: true, message: 'Successfully created professor user' };
});

exports.createExternalUser = functions.https.onCall(async (): Promise<MainReturnType> => {
  const firestore = admin.firestore();

  try {
    await getAuth().importUsers([externalData]);
    console.log('Successfully created external user');
    await firestore.collection('users').doc(externalData.uid).set(externalDataFirestoreDocument);
  } catch (error) {
    console.error('Error creating external user:', error);
    return { success: false, message: 'Error creating external user' };
  }
  return { success: true, message: 'Successfully created external user' };
});

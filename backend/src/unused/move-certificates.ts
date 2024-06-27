import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { MainReturnType } from '../shared/return-types';

exports.moveCertificates = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (context): Promise<MainReturnType> => {
  if (!context.auth) {
    throw new HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }

  if (context.app === undefined) {
    throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
  }

  if (context.auth.token.role >= 3000) {
    throw new HttpsError('failed-precondition', 'The function must be called by an authorized role.');
  }

  const db = getFirestore();

  const errors: {
    userCertificateID: string;
    error: any;
  }[] = [];

  // Move certificate from /certificates/eventID/userCertificateID/[admin,private,public]
  // To /certificates/eventID/certificateID/userCertificateID with subcollections [userCertificateDocAdmin,userCertificateDocPrivate]
  // The content of the public subcollection is moved to the userCertificateID document root
  //
  // Get all eventID documents
  // /certificates/*
  db.collection('certificates')
    .get()
    .then((querySnapshot) => {
      // For each eventID document in /certificates
      querySnapshot.forEach((eventIDDocument) => {
        // Get all userCertificateID documents
        eventIDDocument.ref.listCollections().then((collections) => {
          // For each userCertificateID document in /certificates/eventID
          collections.forEach(async (userCertificateID) => {
            try {
              // Get the public document
              await userCertificateID
                .doc('public')
                .get()
                .then(async (publicDoc) => {
                  if (!publicDoc.data()) {
                    console.log('No public document found for userCertificateID', userCertificateID.id);
                    errors.push({
                      userCertificateID: userCertificateID.id,
                      error: 'No public document found for userCertificateID',
                    });
                    return;
                  }

                  // Get certificateID from publicCollection
                  const certificateID: string = publicDoc.data()?.certificateID as string;

                  // Create a new document in /certificates/eventID/certificateID/userCertificateID
                  const newUserCertificateDoc = eventIDDocument.ref.collection(certificateID).doc(userCertificateID.id);

                  // Move the content of the document to the userCertificate document
                  await newUserCertificateDoc.set(publicDoc.data()!);

                  // Get the admin document
                  await userCertificateID
                    .doc('admin')
                    .get()
                    .then(async (adminDoc) => {
                      if (!adminDoc.data()) {
                        console.log('No admin document found for userCertificateID', userCertificateID.id);
                        errors.push({
                          userCertificateID: userCertificateID.id,
                          error: 'No admin document found for userCertificateID',
                        });
                        return;
                      }

                      // Move the content of the document to the newUserCertificateDoc/userCertificateDocAdmin/data document
                      await newUserCertificateDoc
                        .collection('userCertificateDocAdmin')
                        .doc('data')
                        .set(adminDoc.data()!);

                      // Delete the admin document
                      await adminDoc.ref.delete();
                    });

                  // Get the private document
                  await userCertificateID
                    .doc('private')
                    .get()
                    .then(async (privateDoc) => {
                      if (!privateDoc.data()) {
                        console.log('No private document found for userCertificateID', userCertificateID.id);
                        errors.push({
                          userCertificateID: userCertificateID.id,
                          error: 'No private document found for userCertificateID',
                        });
                        return;
                      }

                      // Write uid field to the new userCertificate document root
                      await newUserCertificateDoc.set({ uid: privateDoc.data()!.uid as string }, { merge: true });

                      // Delete the uid field from the private document
                      await privateDoc.ref.update({ uid: FieldValue.delete() });

                      // Move the content of the document to the newUserCertificateDoc/userCertificateDocPrivate/data document
                      await newUserCertificateDoc
                        .collection('userCertificateDocPrivate')
                        .doc('data')
                        .set(privateDoc.data()!);

                      const userDoc = db.collection('users').doc(privateDoc.data()!.uid as string);

                      // Move /users/{uid}/certificates/majorEvents/{eventID}/{userCertificateID}
                      // to /users/{uid}/userCertificates/majorEvents/{eventID}/{certificateID}/{userCertificateID}
                      await userDoc
                        .collection('certificates')
                        .doc('majorEvents')
                        .collection(eventIDDocument.id)
                        .doc(userCertificateID.id)
                        .delete();

                      await userDoc.collection('certificates').doc('majorEvents').delete();

                      await userDoc.collection('userCertificates').doc('majorEvents').set({
                        null: null,
                      });

                      await userDoc
                        .collection('userCertificates')
                        .doc('majorEvents')
                        .collection(eventIDDocument.id)
                        .doc(certificateID)
                        .set({
                          certificateReference: db.doc(
                            `certificates/${eventIDDocument.id}/${certificateID}/${userCertificateID.id}`,
                          ),
                          certificateDoc: userCertificateID.id,
                        });

                      // Delete the private document
                      await privateDoc.ref.delete();
                    });

                  // Delete the public document
                  await publicDoc.ref.delete();
                });
            } catch (error) {
              console.log(error);
              errors.push({
                userCertificateID: userCertificateID.id,
                error: error,
              });
            }
          });
        });
      });
    });

  // Rename subcollections
  // /majorEvents/{majorEventID}/certificates to /majorEvents/{majorEventID}/majorEventCertificates
  // /majorEvents/{majorEventID}/certificates/{certificateID}/admin to /majorEvents/{majorEventID}/majorEventCertificates/{certificateID}/certificateDataAdmin
  //
  // Get all majorEvents
  db.collection('majorEvents')
    .get()
    .then((querySnapshot) => {
      // For each majorEvent document in /majorEvents
      querySnapshot.forEach((majorEventDocument) => {
        // Get all certificateID documents
        majorEventDocument.ref
          .collection('certificates')
          .get()
          .then((collections) => {
            // For each certificateID document in /majorEvents/majorEventID/certificates
            collections.forEach(async (certificateID) => {
              try {
                // TODO: Review
                // Move document from /majorEvents/{majorEventID}/certificates to /majorEvents/{majorEventID}/majorEventCertificates
                await majorEventDocument.ref
                  .collection('majorEventCertificates')
                  .doc(certificateID.id)
                  .set(certificateID.data());

                const newDocument = majorEventDocument.ref.collection('majorEventCertificates').doc(certificateID.id);

                // Rename the admin subcollection
                await certificateID.ref
                  .collection('admin')
                  .doc('data')
                  .get()
                  .then(async (adminDoc) => {
                    await newDocument.collection('certificateDataAdmin').doc(adminDoc.id).set(adminDoc.data()!);

                    await adminDoc.ref.delete();
                  });

                await certificateID.ref.delete();
              } catch (error) {
                console.log(error);
                errors.push({
                  userCertificateID: certificateID.id,
                  error: error,
                });
              }
            });
          });
      });
    });

  if (errors.length > 0) {
    return {
      message: 'Certificates moved with errors',
      success: false,
      data: errors,
    };
  }

  return {
    message: 'Certificates moved successfully',
    success: true,
  };
});

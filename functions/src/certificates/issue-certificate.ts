import { Timestamp } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { MainReturnType } from './../shared/return-types';
import { deleteCollection } from './../shared/firestore.utils';

exports.issueMajorEventCertificate = functions
  .region('southamerica-east1')
  .runWith({
    timeoutSeconds: 540,
    memory: '1GB',
  })
  .https.onCall(async (data: MajorEventCertificateData, context): Promise<MainReturnType & { data?: any[] }> => {
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

    const firestore = admin.firestore();

    const majorEventID: string = data.majorEventID;

    // Return error if major event doesn't exist
    const majorEvent = await firestore.doc(`majorEvents/${majorEventID}`).get();
    if (!majorEvent.exists) {
      throw new functions.https.HttpsError('not-found', 'Major event not found.');
    }

    const majorEventData = majorEvent.data();
    // if majorEventData.currentTask.certificateID doesn't match certificateID, return error
    if (majorEventData?.tasks?.certificateID !== data.certificateData.certificateID) {
      throw new functions.https.HttpsError(
        'already-exists',
        `Certificate '${majorEventData?.tasks.certificateID}' is being issued.`
      );
    }

    const certificate = await firestore
      .doc(`majorEvents/${majorEventID}/certificates/${data.certificateData.certificateID}`)
      .get();

    const certificateAdmin = await firestore
      .doc(`majorEvents/${majorEventID}/certificates/${data.certificateData.certificateID}/admin/data`)
      .get();

    if (certificate.exists) {
      // Check to whom the certificate was issued
      const issuedTo = certificateAdmin.data()?.issuedTo as {
        toPayer: boolean;
        toNonSubscriber: boolean;
        toNonPayer: boolean;
        toList: string[];
      };

      // If the certificate was issued to the same people, return error
      if (
        issuedTo.toPayer === data.certificateData.issuedTo.toPayer &&
        issuedTo.toNonSubscriber === data.certificateData.issuedTo.toNonSubscriber &&
        issuedTo.toNonPayer === data.certificateData.issuedTo.toNonPayer
      ) {
        // If not resuming a certificate, return error
        if (!majorEventData?.tasks) {
          throw new functions.https.HttpsError('already-exists', 'Certificate already exists.');
        }
      }

      // If certificate is issuing to person already on list, return error
      if (issuedTo.toList.length > 0) {
        for (const newUid of data.certificateData.issuedTo.toList) {
          if (issuedTo.toList.includes(newUid)) {
            throw new functions.https.HttpsError('already-exists', `Certificate already exists to ${newUid}.`);
          }
        }
      }

      if (!majorEventData?.tasks) {
        // If certificate is issuing to new people, add them to the list
        await certificateAdmin.ref.update({
          issuedTo: {
            toPayer: data.certificateData.issuedTo.toPayer,
            toNonSubscriber: data.certificateData.issuedTo.toNonSubscriber,
            toNonPayer: data.certificateData.issuedTo.toNonPayer,
            toList: FieldValue.arrayUnion(...data.certificateData.issuedTo.toList),
          },
        });
      }
    }

    // If certificate doesn't exist, create it
    else {
      await firestore.doc(`certificates/${majorEventID}`).set({
        null: null,
      });

      await certificate.ref.set({
        certificateName: data.certificateData.certificateName,
        certificateTemplate: data.certificateData.certificateTemplate,
        certificateContent: data.certificateData.content,
        eventType: data.certificateData.event,
        participationType: data.certificateData.participation,
        extraText: data.certificateData.extraText,
      });

      certificateAdmin.ref.set({
        issuedTo: {
          toPayer: data.certificateData.issuedTo.toPayer,
          toNonSubscriber: data.certificateData.issuedTo.toNonSubscriber,
          toNonPayer: data.certificateData.issuedTo.toNonPayer,
          toList: data.certificateData.issuedTo.toList,
        },
        firstIssuedOn: FieldValue.serverTimestamp(),
        firstIssuedBy: context.auth.uid,
      });
    }

    const eventInfoCache: EventCacheObject = {};

    majorEvent.data()?.events.forEach((eventID: string) => {
      firestore
        .doc(`events/${eventID}`)
        .get()
        .then((event) => {
          if (event.exists) {
            const data = event.data();
            if (data) {
              const eventInfo = {
                eventName: data.name,
                creditHours: data.creditHours,
                eventStartDate: data.eventStartDate,
                eventType: data.eventType,
                eventGroup: data.eventGroup,
              };
              eventInfoCache[eventID] = eventInfo;
            }
          }
        });
    });

    let iStored = 0;
    let failed = [];

    if (majorEventData.currentTask) {
      deleteCollection(firestore, `certificates/${majorEventID}/${majorEventData.currentTask.documentID}`, 10);
      await firestore
        .doc(
          `users/${majorEventData.currentTask.uid}/certificates/majorEvents/${majorEventID}/${majorEventData.currentTask.documentID}`
        )
        .delete();
      iStored = majorEventData.currentTask.index;
      failed = majorEventData.currentTaskFailedList;
      await firestore.doc(`certificates/${majorEventID}/${majorEventData.currentTask.documentID}`).delete();
    }

    if (data.certificateData.issuedTo.toPayer) {
      const subscriptionList = await firestore
        .collection(`majorEvents/${majorEventID}/subscriptions`)
        .where('payment.status', '==', 2)
        .get();

      for (let i = iStored; i < subscriptionList.docs.length; i++) {
        const attendance = subscriptionList.docs[i];
        const uid = attendance.id;
        const documentID = firestore.collection('dummy').doc().id;
        majorEvent.ref.set(
          {
            currentTask: {
              task: 'Issuing certificate',
              uid: uid,
              documentID: documentID,
              index: i,
              certificateID: data.certificateData.certificateID,
            },
          },
          { merge: true }
        );
        const result = await issueCertificate(data.certificateData, uid, majorEventID, context.auth.uid, documentID);
        if (!result.success) {
          failed.push({ uid: uid, error: result.message });
          majorEvent.ref.set(
            {
              currentTaskFailedList: FieldValue.arrayUnion({ uid: uid, error: result.message }),
            },
            { merge: true }
          );
        }
      }
    }

    majorEvent.ref.set(
      {
        currentTask: FieldValue.delete(),
        currentTaskFailedList: FieldValue.delete(),
      },
      { merge: true }
    );

    if (failed.length > 0) {
      // Store failed in database
      await firestore
        .doc(`majorEvents/${majorEventID}/certificates/${data.certificateData.certificateID}/admin/data`)
        .set(
          {
            failed: failed,
          },
          { merge: true }
        );

      return {
        success: false,
        message: 'Some certificates were not issued.',
        data: failed,
      };
    }

    return {
      success: true,
      message: 'Certificates issued successfully.',
    };
  });

const issueCertificate = async (
  certificateData: CertificateData,
  userUID: string,
  eventID: string,
  adminUID: string,
  documentID: string
) => {
  const firestore = admin.firestore();
  const auth = getAuth();

  try {
    auth.getUser(userUID);
  } catch {
    return {
      success: false,
      message: 'User not found.',
    };
  }

  // Check if user already has certificate with same ID
  const certificate = await firestore
    .doc(`users/${userUID}/certificates/majorEvents/${eventID}/${certificateData.certificateID}`)
    .get();

  if (certificate.exists) {
    return {
      success: false,
      message: 'Certificate already issued.',
    };
  }

  const userData = (await firestore.doc(`users/${userUID}`).get()).data();

  if (!userData) {
    return {
      success: false,
      message: 'User data not found.',
    };
  }

  let userDocumentFormat;

  if (!userData.cpf) {
    return {
      success: false,
      message: 'User document not found.',
    };
  }

  if (!userData.fullName) {
    return {
      success: false,
      message: 'User fullName not found.',
    };
  }

  if (userData.cpf.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)) {
    // Censor first 3 digits
    userDocumentFormat = userData.cpf.replace(/\d{3}\./, '•••.');
    // Censor last 2 digits
    userDocumentFormat = userDocumentFormat.replace(/-\d{2}/, '-••');
  }

  const eventsUserAttended: string[] = await geteventsUserAttended(eventID, userUID);

  if (eventsUserAttended.length === 0) {
    return {
      success: false,
      message: 'User did not attend any events.',
    };
  }

  try {
    // Create certificate
    await firestore.doc(`certificates/${eventID}/${documentID}/public`).set({
      fullName: userData.fullName,
      document: userDocumentFormat,
      issueDate: new Timestamp(certificateData.issueDate.seconds, certificateData.issueDate.nanoseconds),
      certificateID: certificateData.certificateID,
      attendedEvents: eventsUserAttended,
    });

    await firestore.doc(`certificates/${eventID}/${documentID}/private`).set({
      document: userData.cpf,
      uid: userUID,
    });

    await firestore.doc(`certificates/${eventID}/${documentID}/admin`).set({
      actualIssueDate: FieldValue.serverTimestamp(),
      issuedBy: adminUID,
    });

    await firestore.doc(`users/${userUID}/certificates/majorEvents`).set({
      null: null,
    });

    await firestore.doc(`users/${userUID}/certificates/majorEvents/${eventID}/${documentID}`).set({
      publicReference: firestore.doc(`certificates/${eventID}/${documentID}/public`),
      certificateID: certificateData.certificateID,
    });
  } catch (error) {
    return {
      success: false,
      message: error,
    };
  }

  return {
    success: true,
    message: 'Certificate issued successfully.',
  };
};

const geteventsUserAttended = async (majorEventID: string, userUID: string): Promise<string[]> => {
  const firestore = admin.firestore();
  const majorEventRef = firestore.doc(`majorEvents/${majorEventID}`);

  const userSubscription = (await majorEventRef.collection('subscriptions').doc(userUID).get()).data();
  if (!userSubscription) {
    return [];
  }

  const subscribedToEvents = userSubscription.subscribedToEvents;

  const eventsUserAttended = [];

  // For every event user is subscribed to, check if user doc is in attendance
  for (const eventID of subscribedToEvents) {
    const attendance = await firestore.doc(`events/${eventID}/attendance/${userUID}`).get();
    if (attendance.exists) {
      eventsUserAttended.push(eventID);
    }
  }

  return eventsUserAttended;
};

interface MajorEventCertificateData {
  majorEventID: string;
  issuer: string;
  certificateData: CertificateData;
}

interface CertificateData {
  certificateName: string;
  certificateID: string;
  certificateTemplate: string;
  issueDate: Timestamp;
  extraText: string | null;
  participation: {
    type: string;
    custom?: string | null;
  };
  event: {
    type: string;
    custom?: string | null;
  };
  content: {
    type: string;
    custom?: string | null;
  };
  issuedTo: {
    toPayer: boolean;
    toNonSubscriber: boolean;
    toNonPayer: boolean;
    toList: string[];
  };
}

interface EventCacheObject {
  [eventID: string]: EventCache;
}

interface EventCache {
  eventStartDate: Timestamp;
  eventName: string;
  creditHours: number;
  eventType: string;
  eventGroup?: {
    groupDisplayName: string;
    groupEventIDs: string[];
    mainEventID: string;
  } | null;
}

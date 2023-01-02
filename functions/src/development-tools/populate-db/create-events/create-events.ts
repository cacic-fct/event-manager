import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { paidMajorEvent } from './major-event-data';
import {
  event_data,
  event2_data,
  group_event,
  paidMajorEvent_event1,
  paidMajorEvent_event2,
  paidMajorEvent_group_event,
} from './event-data';

exports.createPaidMajorEvent = functions.https.onCall(() => {
  const firestore = admin.firestore();

  firestore.collection('majorEvents').doc('paidMajorEvent').set(paidMajorEvent, { merge: true });

  firestore.collection('events').doc('paidMajorEvent-event1').set(paidMajorEvent_event1, { merge: true });
  firestore.collection('events').doc('paidMajorEvent-event2').set(paidMajorEvent_event2, { merge: true });

  for (let i = 1; i <= 2; i++) {
    firestore
      .collection('events')
      .doc(`paidMajorEvent-group-event${i}`)
      .set(paidMajorEvent_group_event(i), { merge: true });
  }
  return { success: true };
});

exports.createEventGroup = functions.https.onCall(() => {
  const firestore = admin.firestore();

  for (let i = 1; i <= 2; i++) {
    firestore.collection('events').doc(`group-event${i}`).set(group_event(i), { merge: true });
  }

  return { success: true };
});

exports.createEvent = functions.https.onCall(() => {
  const firestore = admin.firestore();

  firestore.collection('events').doc(`event`).set(event_data, { merge: true });
  firestore.collection('events').doc(`event2`).set(event2_data, { merge: true });
  return { success: true };
});

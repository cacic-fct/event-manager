import { paidMajorEvent } from './major-event-data';
import {
  event_data,
  event2_data,
  group_event,
  paidMajorEvent_event1,
  paidMajorEvent_event2,
  paidMajorEvent_group_event,
} from './event-data';
import { MainReturnType } from '../../../shared/return-types';

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

exports.createPaidMajorEvent = onCall(async (): Promise<MainReturnType> => {
  const db = getFirestore();

  await db.collection('majorEvents').doc('paidMajorEvent').set(paidMajorEvent, { merge: true });

  await db.collection('events').doc('paidMajorEvent-event1').set(paidMajorEvent_event1, { merge: true });
  await db.collection('events').doc('paidMajorEvent-event2').set(paidMajorEvent_event2, { merge: true });

  for (let i = 1; i <= 2; i++) {
    await db
      .collection('events')
      .doc(`paidMajorEvent-group-event${i}`)
      .set(paidMajorEvent_group_event(i), { merge: true });
  }
  return { success: true, message: 'Successfully created paid major event' };
});

exports.createEventGroup = onCall(async (): Promise<MainReturnType> => {
  const db = getFirestore();

  for (let i = 1; i <= 2; i++) {
    await db.collection('events').doc(`group-event${i}`).set(group_event(i), { merge: true });
  }

  return { success: true, message: 'Successfully created event group' };
});

exports.createEvent = onCall(async (): Promise<MainReturnType> => {
  const db = getFirestore();

  await db.collection('events').doc(`event`).set(event_data, { merge: true });
  await db.collection('events').doc(`event2`).set(event2_data, { merge: true });
  return { success: true, message: 'Successfully created event' };
});

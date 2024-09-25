import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';

exports.createEventSubscription = onDocumentCreated(
  `events/{eventId}/subscriptions/{userId}`,
  async (context): Promise<void> => {
    const db = getFirestore();
    const eventRef = db.collection('events').doc(context.params.eventId);
    const event = await eventRef.get();
    const numberOfSubscriptions = event.data()?.numberOfSubscriptions;
    if (numberOfSubscriptions === undefined) {
      return;
    }
    eventRef.update({ numberOfSubscriptions: FieldValue.increment(1) });
  },
);

exports.createMajorEventSubscription = onDocumentCreated(
  `majorEvents/{eventId}/subscriptions/{userId}`,
  async (context): Promise<void> => {
    const db = getFirestore();

    const snapshot = context.data;

    if (!snapshot) {
      console.error('No data associated with the event');
      return;
    }

    const data = snapshot.data();

    // For each event in subscribedToEvents array, increment the numberOfSubscriptions of the corresponding event
    data.subscribedToEvents.forEach((event: string) => {
      const document = db.doc(`events/${event}`);
      document.update({
        numberOfSubscriptions: FieldValue.increment(1),
      });
    });
  },
);

exports.updateMajorEventSubscription = onDocumentUpdated(
  `majorEvents/{eventId}/subscriptions/{userId}`,
  async (context): Promise<void> => {
    const snapshot = context.data;
    const db = getFirestore();

    if (!snapshot) {
      console.error('No data associated with the event');
      return;
    }

    const beforeChange = snapshot.before.data();
    const afterChange = snapshot.after.data();

    if (beforeChange.subscribedToEvents !== afterChange.subscribedToEvents) {
      // previouslySelectedEvents - eventsSelectedID = events that were removed
      const removedEvents = beforeChange.subscribedToEvents.filter(
        (event: string) => !afterChange.subscribedToEvents.includes(event),
      );

      // eventsSelectedID - previouslySelectedEvents = events that were added
      const addedEvents = afterChange.subscribedToEvents.filter(
        (event: string) => !beforeChange.subscribedToEvents.includes(event),
      );

      // For every removed event, decrement the number of subscribed users
      removedEvents.forEach((event: string) => {
        const document = db.doc(`events/${event}`);
        document.update({
          numberOfSubscriptions: FieldValue.increment(-1),
        });
      });

      // For every added event, increment the number of subscribed users
      addedEvents.forEach((event: string) => {
        const document = db.doc(`events/${event}`);
        document.update({
          numberOfSubscriptions: FieldValue.increment(1),
        });
      });
    }
  },
);

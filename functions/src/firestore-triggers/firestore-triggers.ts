import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

exports.createEventSubscription = functions
  .region('southamerica-east1')
  .firestore.document(`events/{eventId}/subscriptions/{userId}`)
  .onCreate(async (snap, context): Promise<void> => {
    const eventRef = admin.firestore().collection('events').doc(context.params.eventId);
    const event = await eventRef.get();
    const numberOfSubscriptions = event.data()?.numberOfSubscriptions;
    if (numberOfSubscriptions === undefined) {
      return;
    }
    eventRef.update({ numberOfSubscriptions: FieldValue.increment(1) });
  });

exports.createMajorEventSubscription = functions
  .region('southamerica-east1')
  .firestore.document(`majorEvents/{eventId}/subscriptions/{userId}`)
  .onCreate(async (snap, context): Promise<void> => {
    const data = snap.data();

    // For each array in subscribedToEvents, increment the numberOfSubscriptions
    data.subscribedToEvents.forEach((event: string) => {
      const document = admin.firestore().doc(`events/${event}`);
      document.update({
        numberOfSubscriptions: FieldValue.increment(1),
      });
    });
  });

exports.updateMajorEventSubscription = functions
  .region('southamerica-east1')
  .firestore.document(`majorEvents/{eventId}/subscriptions/{userId}`)
  .onUpdate(async (change, context): Promise<void> => {
    const beforeChange = change.before.data();
    const afterChange = change.after.data();

    if (beforeChange.subscribedToEvents !== afterChange.subscribedToEvents) {
      // previouslySelectedEvents - eventsSelectedID = events that were removed
      const removedEvents = beforeChange.subscribedToEvents.filter(
        (event: string) => !afterChange.subscribedToEvents.includes(event)
      );

      // eventsSelectedID - previouslySelectedEvents = events that were added
      const addedEvents = afterChange.subscribedToEvents.filter(
        (event: string) => !beforeChange.subscribedToEvents.includes(event)
      );

      // For every removed event, decrement the number of subscribed users
      removedEvents.forEach((event: string) => {
        const document = admin.firestore().doc(`events/${event}`);
        document.update({
          numberOfSubscriptions: FieldValue.increment(-1),
        });
      });

      // For every added event, increment the number of subscribed users
      addedEvents.forEach((event: string) => {
        const document = admin.firestore().doc(`events/${event}`);
        document.update({
          numberOfSubscriptions: FieldValue.increment(1),
        });
      });
    }
  });

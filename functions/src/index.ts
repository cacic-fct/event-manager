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
        if (doc.exists && doc.data()?.admins) {
          // Add user email to array
          const adminArray = doc.data()?.admins;
          adminArray.push(data.email);
          document.set({
            admins: adminArray,
          });
        } else {
          // If document or array don't exist, create them
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

  const remoteConfig = admin.remoteConfig();

  // Get whitelist array as string from remote config
  return remoteConfig.getTemplate().then((template) => {
    // @ts-ignore
    const whitelist: string = template.parameters.adminWhitelist.defaultValue?.value;

    // Check if email is included in whitelist array
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
          message: `An error has occured: ${error}`,
        };
      });
  });
});

exports.getUserUid = functions.https.onCall((data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }

  if (context.app == undefined) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.'
    );
  }

  if (context.auth.token.role >= 3000) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called by an authorized role.');
  }

  if (data.string === '') {
    return { message: 'Invalid argument: A string must be provided.' };
  }

  if (data.string.includes('@')) {
    return getAuth()
      .getUserByEmail(data.string)
      .then((user) => {
        return {
          uid: user.uid,
        };
      })
      .catch((error) => {
        return { message: `${error}` };
      });
  }
  // Remove spaces from the string
  data.string = data.string.replace(/\s/g, '');

  // Check if input has only one '+' and numbers
  const isNumeric: boolean = /^\+?\d+$/.test(data.string);

  // Check if string only has numbers
  if (!isNumeric) {
    return { message: 'Invalid argument: Invalid input' };
  }

  if (data.string.length < 11 || data.string.length > 14) {
    return { message: 'Invalid argument: Invalid input' };
  }

  if (data.string.length === 11) {
    data.string = `+55${data.string}`;
  } else if (data.string.length === 13) {
    data.string = `+${data.string}`;
  }

  return getAuth()
    .getUserByPhoneNumber(data.string)
    .then((user) => {
      return {
        uid: user.uid,
      };
    })
    .catch((error) => {
      return { message: `${error}` };
    });
});

exports.createEventSubscription = functions.firestore
  .document(`events/{eventId}/subscriptions/{userId}`)
  .onCreate(async (snap, context) => {
    const eventRef = admin.firestore().collection('events').doc(context.params.eventId);
    const event = await eventRef.get();
    const numberOfSubscriptions = event.data()?.numberOfSubscriptions;
    if (numberOfSubscriptions === undefined) {
      return;
    }
    eventRef.update({ numberOfSubscriptions: admin.firestore.FieldValue.increment(1) });
  });

exports.createMajorEventSubscription = functions.firestore
  .document(`majorEvents/{eventId}/subscriptions/{userId}`)
  .onCreate(async (snap, context) => {
    const data = snap.data();

    // For each array in subscribedToEvents, increment the numberOfSubscriptions
    data.subscribedToEvents.forEach((event: string) => {
      const document = admin.firestore().doc(`events/${event}`);
      document.update({
        numberOfSubscriptions: admin.firestore.FieldValue.increment(1),
      });
    });
  });

exports.updateMajorEventSubscription = functions.firestore
  .document(`majorEvents/{eventId}/subscriptions/{userId}`)
  .onUpdate(async (change, context) => {
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
          numberOfSubscriptions: admin.firestore.FieldValue.increment(-1),
        });
      });

      // For every added event, increment the number of subscribed users
      addedEvents.forEach((event: string) => {
        const document = admin.firestore().doc(`events/${event}`);
        document.update({
          numberOfSubscriptions: admin.firestore.FieldValue.increment(1),
        });
      });
    }
  });

exports.addProfessorRole = functions.https.onCall((data, context) => {
  if (context.app == undefined) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.'
    );
  }

  if (!context.auth) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }

  if (context.auth.token.role >= 3000) {
    throw new functions.https.HttpsError('failed-precondition', 'User is already a professor or has a greater role.');
  }

  const remoteConfig = admin.remoteConfig();

  // Get professors array as string from remote config
  return remoteConfig
    .getTemplate()
    .then((template) => {
      // @ts-ignore
      const professors: string = template.parameters.professors.defaultValue?.value;

      // Check if email is included in professors array
      if (!professors.includes(data.email)) {
        return {
          message: `${data.email} is not a professor`,
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
          const firestore = admin.firestore();
          const document = firestore.doc('claims/professor');

          // Get professor3000 array from document
          document.get().then((doc) => {
            if (doc.exists && doc.data()?.professor3000) {
              // Add user email to array
              const professor3000Array = doc.data()?.professor3000;
              professor3000Array.push(data.email);
              document.set({
                professor3000: professor3000Array,
              });
            } else {
              // If document or array don't exist, create them
              document.set({
                professor3000: [data.email],
              });
            }
          });
          return {
            message: `${data.email} has been made a professor`,
          };
        })
        .catch((error) => {
          return {
            message: `${error}`,
          };
        });
    })
    .catch((error) => {
      return {
        message: `${error}`,
      };
    });
});

// Attribution: amiregelz
// https://stackoverflow.com/questions/36759627/firebase-login-as-other-user/71808501#71808501
exports.impersonate = functions.https.onCall((data, context) => {
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
  const remoteConfig = admin.remoteConfig();

  // Get whitelist array as string from remote config
  return remoteConfig.getTemplate().then((template) => {
    // @ts-ignore
    const whitelist: string = template.parameters.adminWhitelist.defaultValue?.value;

    if (context.auth?.uid) {
      return admin
        .auth()
        .getUser(context.auth.uid)
        .then((userRecord) => {
          if (userRecord.email && whitelist.includes(userRecord.email)) {
            const userId = data.uid;
            return admin
              .auth()
              .createCustomToken(userId)
              .then((customToken) => {
                return {
                  token: customToken,
                };
              });
          } else {
            throw new functions.https.HttpsError('failed-precondition', 'You are not whitelisted.');
          }
        })
        .catch((error) => {
          return { message: `${error}` };
        });
    }

    throw new functions.https.HttpsError('failed-precondition', 'Your uid was not provided.');
  });
});

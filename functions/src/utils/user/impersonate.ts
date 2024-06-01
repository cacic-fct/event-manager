//  TODO: Fix this - Doesn't work

// Attribution: amiregelz
// https://stackoverflow.com/questions/36759627/firebase-login-as-other-user/71808501#71808501
/*exports.impersonate = functions.https.onCall((data, context) => {
  if (context.app===undefined) {
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
    // @ts-expect-error
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
});*/

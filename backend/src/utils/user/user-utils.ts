import { getAuth } from 'firebase-admin/auth';
import { StringDataReturnType } from '../../shared/return-types';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Attribution: The Net Ninja
// https://youtube.com/watch?v=VvcBqPua2DI&list=PL4cUxeGkcC9jUPIes_B8vRjn1_GaplOPQ

exports.getUserUid = onCall(async (context): Promise<StringDataReturnType> => {
  const data = context.data;

  if (!context.auth) {
    throw new HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }

  if (context.app === undefined) {
    throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
  }

  if (context.auth.token.role >= 3000) {
    throw new HttpsError('failed-precondition', 'The function must be called by an authorized role.');
  }

  if (data.string === '') {
    return { message: 'Invalid argument: A string must be provided.', success: false, data: null };
  }

  if (!data.string.includes('@')) {
    return { message: 'Invalid argument: A valid email must be provided.', success: false, data: null };
  }

  try {
    const user = await getAuth().getUserByEmail(data.string);
    return {
      data: user.uid,
      success: true,
      message: 'User found by email',
    };
  } catch (error) {
    return { message: `${error}`, success: false, data: null };
  }
});

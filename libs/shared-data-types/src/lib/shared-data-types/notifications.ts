export type NovuSubscriberSession = {
  applicationIdentifier: string;
  subscriberId: string;
  subscriberHash: string;
  apiUrl?: string;
  socketUrl?: string;
  socketPath?: string;
  pushIntegrationIdentifier?: string | null;
  vapidPublicKey?: string | null;
};

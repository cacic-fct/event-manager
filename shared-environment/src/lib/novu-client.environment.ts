export type NovuClientEnvironment = {
  applicationIdentifier: string | null;
  pushIntegrationIdentifier: string | null;
  vapidPublicKey: string | null;
};

export const novuClientEnvironment: NovuClientEnvironment = {
  applicationIdentifier: null,
  pushIntegrationIdentifier: null,
  vapidPublicKey: null,
};

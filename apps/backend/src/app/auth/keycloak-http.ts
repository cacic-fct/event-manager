import type { AxiosRequestConfig } from 'axios';

export const keycloakJsonHeaders = {
  accept: 'application/json',
  'accept-encoding': 'identity',
};

export const keycloakFormHeaders = {
  ...keycloakJsonHeaders,
  'content-type': 'application/x-www-form-urlencoded',
};

export const keycloakJsonResponse = {
  responseType: 'json',
  transitional: { silentJSONParsing: false },
} satisfies AxiosRequestConfig;

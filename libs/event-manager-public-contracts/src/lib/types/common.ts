export type DateTimeString = string;

export type EventTargetType = 'event' | 'event-group' | 'major-event';
export type CertificateScope = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT' | 'OTHER';
export type EventType = 'MINICURSO' | 'PALESTRA' | 'OTHER';
export type ContactType = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'OTHER';

export type GraphqlVariable = string | number | boolean | null | undefined | readonly string[] | object;
export type GraphqlVariables = Record<string, GraphqlVariable>;

export interface GraphqlError {
  message: string;
}

export interface GraphqlResponse<TData> {
  data?: TData;
  errors?: GraphqlError[];
}

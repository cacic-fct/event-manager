import { addDays, addHours } from 'date-fns';
import { timestampFromDate } from '../../../shared/date.utils';

export const paidMajorEvent_event1 = {
  name: 'Minicurso - Evento 1 - Grande evento pago',
  description: 'Pertence ao Grande evento pago',
  shortDescription: 'Pertence ao Grande evento pago',
  course: '12',
  slotsAvailable: 100,
  numberOfSubscriptions: 0,
  icon: '⚛️',
  eventStartDate: timestampFromDate(addDays(new Date(), 4)),
  eventEndDate: timestampFromDate(addHours(addDays(new Date(), 4), 1)),
  location: {
    description: 'FCT-Unesp',
    lat: -22.12153,
    lon: -51.40769,
  },
  button: {
    text: 'Visite nosso site',
    url: 'https://google.com',
  },
  eventType: 'minicurso',
  public: true,
  inMajorEvent: 'paidMajorEvent',
  issueCertificate: true,
  collectAttendance: true,
  createdBy: 'populate-db',
  createdOn: timestampFromDate(new Date()),
  allowSubscription: false,
};

export const paidMajorEvent_event2 = {
  name: 'Palestra - Evento 2 - Grande evento pago',
  description: 'Pertence ao Grande evento pago',
  shortDescription: 'Pertence ao Grande evento pago',
  course: '12',
  slotsAvailable: 100,
  numberOfSubscriptions: 0,
  icon: '🎨',
  eventStartDate: timestampFromDate(addDays(new Date(), 4)),
  eventEndDate: timestampFromDate(addHours(addDays(new Date(), 4), 1)),
  location: {
    description: 'FCT-Unesp',
    lat: -22.12153,
    lon: -51.40769,
  },
  button: {
    text: 'Visite nosso site',
    url: 'https://google.com',
  },
  eventType: 'palestra',
  public: true,
  inMajorEvent: 'paidMajorEvent',
  issueCertificate: true,
  collectAttendance: true,
  createdBy: 'populate-db',
  createdOn: timestampFromDate(new Date()),
  allowSubscription: false,
};

export const event_data = {
  name: 'Evento com inscrição aberta',
  description: 'Evento individual',
  shortDescription: 'Evento individual',
  course: '12',
  icon: '🎮',
  eventStartDate: timestampFromDate(addDays(new Date(), 1)),
  eventEndDate: timestampFromDate(addHours(addDays(new Date(), 1), 1)),
  location: {
    description: 'FCT-Unesp',
    lat: -22.12153,
    lon: -51.40769,
  },
  button: {
    text: 'Visite nosso site',
    url: 'https://google.com',
  },
  public: true,
  issueCertificate: true,
  collectAttendance: true,
  createdBy: 'populate-db',
  createdOn: timestampFromDate(new Date()),
  allowSubscription: true,
};

export const event2_data = {
  name: 'Evento sem data de término',
  description: 'Evento individual',
  shortDescription: 'Evento individual',
  course: '12',
  icon: '🤨',
  eventStartDate: timestampFromDate(addDays(new Date(), 1)),
  eventEndDate: null,
  location: {
    description: 'FCT-Unesp',
    lat: -22.12153,
    lon: -51.40769,
  },
  button: {
    text: 'Visite nosso site',
    url: 'https://google.com',
  },
  public: true,
  issueCertificate: true,
  collectAttendance: true,
  createdBy: 'populate-db',
  createdOn: timestampFromDate(new Date()),
};

export const group_event = (i: number) => {
  return {
    name: `Evento ${i} do grupo`,
    description: 'Pertence ao grupo de eventos',
    shortDescription: 'Pertence ao grupo de eventos',
    course: '12',
    slotsAvailable: 100,
    icon: '😸',
    numberOfSubscriptions: 0,
    eventStartDate: timestampFromDate(addDays(new Date(), 3 + i)),
    eventEndDate: timestampFromDate(addHours(addDays(new Date(), 3 + i), 1)),
    location: {
      description: 'FCT-Unesp',
      lat: -22.12153,
      lon: -51.40769,
    },
    button: {
      text: 'Visite nosso site',
      url: 'https://google.com',
    },
    eventType: 'minicurso',
    public: true,
    issueCertificate: true,
    collectAttendance: true,
    createdBy: 'populate-db',
    createdOn: timestampFromDate(new Date()),
    allowSubscription: false,
    eventGroup: {
      groupEventIDs: ['group-event1', 'group-event2'],
      groupDisplayName: 'Grupo de eventos',
      mainEventID: 'paidMajorEvent-event1',
    },
  };
};

export const paidMajorEvent_group_event = (i: number) => {
  return {
    name: `Minicurso - Evento ${i} - Grande evento pago`,
    description: 'Pertence ao Grande evento pago',
    shortDescription: 'Pertence ao Grande evento pago',
    course: '12',
    slotsAvailable: 100,
    icon: '🧑‍💻',
    numberOfSubscriptions: 0,
    eventStartDate: timestampFromDate(addDays(new Date(), 3 + i)),
    eventEndDate: timestampFromDate(addHours(addDays(new Date(), 3 + i), 1)),
    location: {
      description: 'FCT-Unesp',
      lat: -22.12153,
      lon: -51.40769,
    },
    button: {
      text: 'Visite nosso site',
      url: 'https://google.com',
    },
    eventType: 'minicurso',
    public: true,
    inMajorEvent: 'paidMajorEvent',
    issueCertificate: true,
    collectAttendance: true,
    createdBy: 'populate-db',
    createdOn: timestampFromDate(new Date()),
    allowSubscription: false,
    eventGroup: {
      groupEventIDs: ['paidMajorEvent-event1', 'paidMajorEvent-event2'],
      groupDisplayName: 'Grupo de eventos do Grande evento pago',
      mainEventID: 'paidMajorEvent-event1',
    },
  };
};

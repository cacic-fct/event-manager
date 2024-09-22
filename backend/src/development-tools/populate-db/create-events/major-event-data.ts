import { addDays } from 'date-fns';
import { timestampFromDate } from '../../../shared/date.utils';

export const paidMajorEvent = {
  name: 'Grande evento pago',
  course: '12',
  description: 'Futuro grande evento pago gerado automaticamente com inscrição aberta.',
  eventStartDate: timestampFromDate(addDays(new Date(), 4)),
  eventEndDate: timestampFromDate(addDays(new Date(), 6)),
  subscriptionStartDate: timestampFromDate(new Date()),
  subscriptionEndDate: timestampFromDate(addDays(new Date(), 2)),
  maxCourses: 2,
  maxLectures: 2,
  price: {
    students: 20,
    otherStudents: 20,
    professors: 20,
  },
  paymentInfo: {
    chavePix: 'chave@pix.com',
    bankName: 'Banco',
    name: 'Nome do beneficiário',
    document: '000.000.000-00',
    agency: '1234',
    accountNumber: '0000000000',
    additionalPaymentInformation: 'Pagável presencialmente',
  },
  button: {
    text: 'Visite nosso site',
    url: 'https://google.com',
  },
  public: true,
  createdBy: 'populate-db',
  createdOn: timestampFromDate(new Date()),
  events: [
    'paidMajorEvent-event1',
    'paidMajorEvent-event2',
    'paidMajorEvent-group-event1',
    'paidMajorEvent-group-event2',
  ],
};

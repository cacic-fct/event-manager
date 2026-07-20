import { fakerPT_BR as faker } from '@faker-js/faker';
import type { EventAttendanceCsvImportAmbiguousValue, Person } from '@cacic-fct/event-manager-admin-contracts';

faker.seed(20260704);

export const attendanceResolutionStoryPeople: Person[] = [
  buildStoryPerson({
    id: 'document-person',
    identityDocument: '119.999.999-75',
    phone: null,
  }),
  buildStoryPerson({
    id: 'phone-person',
    phone: '+55 (11) 99999-9975',
  }),
  buildStoryPerson({
    id: 'long-document-person',
    name: 'Carolina Mariana de Albuquerque Vasconcelos',
    identityDocument: '219.123.456-92',
    academicId: '202612345678',
    phone: '+55 (21) 91234-5692',
  }),
  buildStoryPerson({
    id: 'long-phone-person',
    name: 'Daniel Henrique Souza Nascimento',
    email: null,
    phone: '+5521912345692',
    identityDocument: null,
    academicId: null,
  }),
];

export const attendanceResolutionStoryAmbiguousValues: EventAttendanceCsvImportAmbiguousValue[] = [
  {
    value: '11999999975',
    candidates: attendanceResolutionStoryPeople.slice(0, 2),
  },
  {
    value: '21912345692',
    candidates: attendanceResolutionStoryPeople.slice(2, 4),
  },
];

function buildStoryPerson(overrides: Partial<Person> & { id: string }): Person {
  const { id, ...personOverrides } = overrides;
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return {
    id,
    name: `${firstName} ${lastName}`,
    email: faker.internet.email({ firstName, lastName }).toLocaleLowerCase('pt-BR'),
    phone: `+55 (${faker.helpers.arrayElement(['11', '18', '21'])}) 9${faker.string.numeric(4)}-${faker.string.numeric(4)}`,
    identityDocument: `${faker.string.numeric(3)}.${faker.string.numeric(3)}.${faker.string.numeric(3)}-${faker.string.numeric(2)}`,
    academicId: faker.string.numeric(6),
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    ...personOverrides,
  };
}

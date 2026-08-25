import type { PublicEventForm } from '@cacic-fct/event-manager-public-contracts';
import {
  createPublicEventForm,
  createPublicEventFormLink,
} from '@cacic-fct/event-manager-public-testing';
import type { SubscriptionFormContext } from './subscription-flow.models';

type SubscriptionFormContextFixtureOverrides = Partial<Omit<SubscriptionFormContext, 'form'>> & {
  form?: PublicEventForm;
};

export function createSubscriptionFormContextFixture(
  overrides: SubscriptionFormContextFixtureOverrides = {},
): SubscriptionFormContext {
  const targetType = overrides.targetType ?? 'MAJOR_EVENT';
  const targetId = overrides.targetId ?? 'major-1';
  const linkId = overrides.linkId ?? `link-${targetId}`;
  const form =
    overrides.form ??
    createPublicEventForm({
      id: `form-${targetId}`,
      links: [
        createPublicEventFormLink({
          id: linkId,
          formId: `form-${targetId}`,
          targetType,
          eventId: targetType === 'EVENT' ? targetId : null,
          majorEventId: targetType === 'MAJOR_EVENT' ? targetId : null,
        }),
      ],
    });

  return {
    form,
    targetType,
    targetId,
    targetName: overrides.targetName ?? (targetType === 'EVENT' ? 'Oficina de Angular' : 'SECOMPP'),
    linkId,
    requiredInSubscriptionFlow: overrides.requiredInSubscriptionFlow ?? true,
    initialAnswers: overrides.initialAnswers ?? [],
    submitted: overrides.submitted ?? false,
    editable: overrides.editable ?? true,
  };
}

export function createSubscriptionFlowFormFixtures(): SubscriptionFormContext[] {
  const majorEventForm = createPublicEventForm({
    id: 'form-shirt',
    name: 'Camiseta do evento',
    links: [
      createPublicEventFormLink({
        id: 'link-shirt',
        formId: 'form-shirt',
        targetType: 'MAJOR_EVENT',
        eventId: null,
        majorEventId: 'major-1',
        displayOrder: 0,
      }),
    ],
  });
  const eventForm = createPublicEventForm({
    id: 'form-meal',
    name: 'Preferências da atividade',
    description: 'Informe uma preferência para a atividade selecionada.',
    elementsJson: JSON.stringify([
      {
        id: 'meal',
        type: 'singleChoice',
        title: 'Precisa de opção vegetariana?',
        required: true,
        options: [
          { id: 'yes', label: 'Sim' },
          { id: 'no', label: 'Não' },
        ],
      },
    ]),
    links: [
      createPublicEventFormLink({
        id: 'link-meal',
        formId: 'form-meal',
        targetType: 'EVENT',
        eventId: 'event-1',
        majorEventId: null,
        displayOrder: 1,
      }),
    ],
  });

  return [
    createSubscriptionFormContextFixture({
      form: majorEventForm,
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      targetName: 'SECOMPP',
      linkId: 'link-shirt',
    }),
    createSubscriptionFormContextFixture({
      form: eventForm,
      targetType: 'EVENT',
      targetId: 'event-1',
      targetName: 'Oficina de Angular',
      linkId: 'link-meal',
    }),
  ];
}

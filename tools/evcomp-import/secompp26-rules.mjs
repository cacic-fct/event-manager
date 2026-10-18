import { toAmountInCents, toSourceBoolean } from './core.mjs';

const AFTER_NAME = 'After da SECOMPP26';
const MAIN_NAMES = new Set(['secompp26', 'secompp 2026', 'secompp 2026 - semana da computação de presidente prudente']);

const normalizedName = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
const sourceId = (value) => String(value);

/** Keep the source snapshot immutable and isolate the event-specific migration rules. */
export function prepareSecompp26Snapshot(source) {
  const ignoredEvents = source.events.filter((event) => normalizedName(event.name) === 'evento de teste');
  const ignoredEventIds = new Set(ignoredEvents.map((event) => sourceId(event.sourceId)));
  const ignoredActivityIds = new Set(
    source.activities
      .filter((activity) => ignoredEventIds.has(sourceId(activity.sourceEventId)))
      .map((activity) => sourceId(activity.sourceId)),
  );
  const ignoredRegistrations = source.registrations.filter((row) => ignoredEventIds.has(sourceId(row.sourceEventId)));
  const ignoredRegistrationIds = new Set(ignoredRegistrations.map((row) => sourceId(row.sourceId)));
  const afterEvents = source.events.filter((event) => normalizedName(event.name) === normalizedName(AFTER_NAME));
  if (afterEvents.length > 1) throw new Error('More than one After da SECOMPP26 event exists in the source.');
  const afterEvent = afterEvents[0];
  let after;
  if (afterEvent) {
    const mainEvents = source.events.filter((event) => MAIN_NAMES.has(normalizedName(event.name)));
    if (mainEvents.length !== 1) throw new Error('After da SECOMPP26 requires one unambiguous SECOMPP26 main event.');
    const activities = source.activities.filter((row) => sourceId(row.sourceEventId) === sourceId(afterEvent.sourceId));
    const modalities = source.modalities.filter((row) => sourceId(row.sourceEventId) === sourceId(afterEvent.sourceId));
    if (activities.length !== 1 || modalities.length !== 1) {
      throw new Error('The SECOMPP26 After rule requires exactly one source activity and one ticket modality.');
    }
    after = {
      event: afterEvent,
      mainEvent: mainEvents[0],
      activity: activities[0],
      modality: modalities[0],
      registrations: source.registrations.filter(
        (row) => sourceId(row.sourceEventId) === sourceId(afterEvent.sourceId),
      ),
    };
  }
  const excludedEventIds = new Set([...ignoredEventIds, ...(after ? [sourceId(after.event.sourceId)] : [])]);
  const retainedRegistrations = source.registrations.filter(
    (row) => !excludedEventIds.has(sourceId(row.sourceEventId)),
  );
  const selectsAfter = (row) => after && sourceId(row.sourceActivityId) === sourceId(after.activity.sourceId);
  const snapshot = {
    ...source,
    events: source.events.filter((event) => !excludedEventIds.has(sourceId(event.sourceId))),
    activities: source.activities
      .filter((row) => !ignoredActivityIds.has(sourceId(row.sourceId)))
      .map((row) =>
        after && sourceId(row.sourceId) === sourceId(after.activity.sourceId)
          ? { ...row, name: AFTER_NAME, sourceEventId: after.mainEvent.sourceId }
          : row,
      ),
    modalities: source.modalities.filter((row) => !excludedEventIds.has(sourceId(row.sourceEventId))),
    registrations: retainedRegistrations.map((row) => (selectsAfter(row) ? { ...row, sourceActivityId: null } : row)),
    attendances: source.attendances.filter((row) => !ignoredActivityIds.has(sourceId(row.sourceActivityId))),
    lecturers: source.lecturers.filter((row) => !ignoredActivityIds.has(sourceId(row.sourceActivityId))),
    ...(source.payments
      ? {
          payments: source.payments.filter((row) => !ignoredRegistrationIds.has(sourceId(row.sourceRegistrationId))),
        }
      : {}),
  };
  return {
    snapshot,
    after,
    report: {
      ignoredTestEvent: {
        events: ignoredEvents.length,
        activities: ignoredActivityIds.size,
        modalities: source.modalities.filter((row) => ignoredEventIds.has(sourceId(row.sourceEventId))).length,
        registrations: ignoredRegistrationIds.size,
        registrationActivityRows: ignoredRegistrations.length,
        attendances: source.attendances.length - snapshot.attendances.length,
        lecturers: source.lecturers.length - snapshot.lecturers.length,
        payments: (source.payments ?? []).filter((row) =>
          ignoredRegistrationIds.has(sourceId(row.sourceRegistrationId)),
        ).length,
      },
      ...(after
        ? {
            after: {
              sourceRegistrations: new Set(after.registrations.map((row) => sourceId(row.sourceId))).size,
              removedActivitySelections: retainedRegistrations.filter(selectsAfter).length,
            },
          }
        : {}),
    },
  };
}

/** A purchase issues its own ticket; no After subscription or invented main enrollment is emitted. */
export function createAfterTicketResources(after, registrations, paymentRows, options) {
  const { eventId, resourceId, resolvePerson, report } = options;
  const configId = resourceId('ticket-config', after.event.sourceId);
  const amountCents = toAmountInCents(after.modality.amount);
  if (amountCents <= 0 || !after.modality.name?.trim() || after.modality.name.trim().length > 100) {
    throw new Error('The After ticket price option needs a positive amount and a label of at most 100 characters.');
  }
  const resources = [
    {
      kind: 'ticket-config',
      id: configId,
      data: {
        eventId,
        enabled: true,
        displayName: AFTER_NAME,
        issueOnEventSubscription: false,
        issueOnMajorEventSubscription: false,
        includedPriceTierIds: [],
        recipientSubscriptionRequirement: 'ANY',
        recipientAllowedPriceTierIds: [],
        recipientRequiresUnesp: false,
        recipientAcademicIdPrefixes: [],
        recipientCourseCodes: [],
        recipientRequiresAccountManagerVerification: false,
        purchaseEnabled: false,
        purchaseRequiresUnesp: false,
        purchaseRequiresAccountManagerVerification: false,
        purchaseAcademicIdPrefixes: [],
        purchaseCourseCodes: [],
        purchaseVisiblePriceTierIds: [],
        expirationMode: 'EVENT_END',
      },
    },
    {
      kind: 'ticket-price-option',
      id: resourceId('ticket-price-option', after.modality.sourceId),
      data: { ticketConfigId: configId, priceTierId: null, label: after.modality.name.trim(), amountCents },
    },
  ];
  const mainRegistrations = options.mainRegistrations;
  const buyers = new Set();
  const summary = {
    ...report.rules.after,
    purchases: 0,
    withConfirmedMainRegistration: 0,
    withUnconfirmedMainRegistration: 0,
    withoutMainRegistration: 0,
    unapprovedRegistrations: 0,
  };
  for (const row of registrations) {
    const payments = paymentRows.get(sourceId(row.sourceId)) ?? [];
    const status = payments.length === 1 ? String(payments[0].status).trim().toUpperCase() : '';
    if (!toSourceBoolean(row.active) || !['APROVADO', 'ISENTO'].includes(status)) {
      summary.unapprovedRegistrations += 1;
      report.issues.push({
        code: 'after_registration_not_approved',
        sourceKind: 'registration',
        sourceId: sourceId(row.sourceId),
        skipped: true,
        message:
          'After payment is not confirmed. No approved purchase or ticket was exported; review this registration manually.',
      });
      continue;
    }
    if (sourceId(row.sourceModalityId) !== sourceId(after.modality.sourceId)) {
      throw new Error('An After registration references an unexpected ticket modality.');
    }
    const person = resolvePerson(row.sourcePersonId);
    if (!person) throw new Error('An approved After buyer has no usable participant reference.');
    const identity = JSON.stringify(Object.entries(person).sort(([left], [right]) => left.localeCompare(right)));
    if (buyers.has(identity)) throw new Error('More than one approved After registration resolves to the same buyer.');
    buyers.add(identity);
    const purchasedAt = new Date(row.createdAt);
    const expiresAt = new Date(after.activity.endDate);
    if (
      !row.createdAt ||
      !Number.isFinite(purchasedAt.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      purchasedAt > new Date() ||
      purchasedAt >= expiresAt
    ) {
      throw new Error('An After registration has no valid historical purchase timestamp before ticket expiration.');
    }
    resources.push({
      kind: 'ticket-purchase',
      id: resourceId('ticket-purchase', row.sourceId),
      data: {
        eventId,
        person,
        amountCents: status === 'ISENTO' ? 0 : toAmountInCents(row.appliedAmount),
        priceTierName: after.modality.name.trim(),
        purchasedAt: purchasedAt.toISOString(),
      },
    });
    const main = mainRegistrations.filter((item) => sourceId(item.sourcePersonId) === sourceId(row.sourcePersonId));
    if (main.some((item) => toSourceBoolean(item.active))) summary.withConfirmedMainRegistration += 1;
    else if (main.length) summary.withUnconfirmedMainRegistration += 1;
    else summary.withoutMainRegistration += 1;
    summary.purchases += 1;
  }
  report.rules.after = summary;
  return resources;
}

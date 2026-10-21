import { createHash } from 'node:crypto';
import { assertConfig, toAmountInCents, toSourceBoolean } from './core.mjs';
import { loadTransferContract } from './transfer-validation.mjs';
import { createAfterTicketResources, prepareSecompp26Snapshot } from './secompp26-rules.mjs';

const UUID_NAMESPACE_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const RESOURCE_ORDER = new Map([
  ['major-event', 0],
  ['event', 1],
  ['major-event-price', 2],
  ['price-tier', 3],
  ['ticket-config', 4],
  ['ticket-price-option', 5],
  ['major-event-subscription', 6],
  ['ticket-purchase', 7],
  ['event-attendance', 8],
]);

/**
 * Convert an EvComp snapshot into dependency-ordered, schema-validated transfer files.
 * Explicit target mappings can reuse existing catalog or person records.
 */
export function exportTransferDocuments(snapshot, options = {}) {
  const contract = loadTransferContract();
  const config =
    options.config ??
    Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'maxResources' && key !== 'maxBytes'));
  const sourceNamespace = options.sourceNamespace ?? config.sourceNamespace ?? 'evcomp';
  const maxResources = options.maxResources ?? contract.TRANSFER_MAX_RESOURCES;
  const maxBytes = options.maxBytes ?? contract.TRANSFER_MAX_BYTES;
  validateOptions(sourceNamespace, maxResources, maxBytes, contract);
  assertConfig({ ...config, sourceNamespace });
  validateSnapshot(snapshot);
  const originalSnapshot = snapshot;
  const rules = prepareSecompp26Snapshot(snapshot);
  snapshot = rules.snapshot;
  if (rules.after && !contract.TRANSFER_RESOURCE_SCHEMAS['ticket-purchase']) {
    throw new Error('The current JSON importer does not support standalone After ticket purchases.');
  }

  const report = {
    sourceNamespace,
    sourceCounts: Object.fromEntries(
      ['people', 'events', 'activities', 'modalities', 'registrations', 'attendances', 'lecturers', 'payments'].map(
        (name) => [name, Array.isArray(originalSnapshot[name]) ? originalSnapshot[name].length : 0],
      ),
    ),
    exportedCounts: {},
    skippedCounts: {},
    issues: [],
    rules: rules.report,
  };
  const mappings = readMappings(config);
  const catalogMappingsAreExplicit = config.eventMappings !== undefined || config.activityMappings !== undefined;
  if (rules.after && catalogMappingsAreExplicit) {
    throw new Error(
      'The SECOMPP26 After conversion requires automatic catalog export; explicit catalog mappings need manual review.',
    );
  }
  if (mappings.modality.size > 0 && !catalogMappingsAreExplicit) {
    throw new Error('modalityMappings require explicit eventMappings or activityMappings.');
  }
  const sourceEvents = indexUnique(snapshot.events, 'events');
  const sourceActivities = indexUnique(snapshot.activities, 'activities');
  const sourceModalities = indexUnique(snapshot.modalities, 'modalities');
  const people = indexUnique(snapshot.people, 'people');
  const paymentRows = groupPaymentRows(snapshot.payments ?? [], report);
  const registrationRows = groupRegistrations(snapshot.registrations);
  report.sourceCounts.registrationActivityRows = report.sourceCounts.registrations;
  report.sourceCounts.registrations = groupRegistrations(originalSnapshot.registrations).size;
  report.paymentSummary = summarizeSourcePayments(originalSnapshot);
  const resources = [];
  const eventIdsBySource = new Map();
  const activityIdsBySource = new Map();
  const modalityIdsBySource = new Map();
  const personReferences = new Map();
  const reportedPersonIssues = new Set();

  if (!catalogMappingsAreExplicit) {
    for (const event of sourceEvents.values()) {
      const sourceId = sourceKey(event.sourceId, 'event');
      const id = mappings.event.get(sourceId) ?? deterministicUuid(sourceNamespace, 'major-event', sourceId);
      eventIdsBySource.set(sourceId, id);
      const modalities = [...sourceModalities.values()].filter(
        (modality) => String(modality.sourceEventId) === sourceId,
      );
      resources.push({
        kind: 'major-event',
        id,
        data: {
          name: requiredName(event.name, `EvComp event ${sourceId}`),
          startDate: requiredDateTime(event.startDate, `EvComp event ${sourceId} startDate`),
          endDate: requiredDateTime(event.endDate, `EvComp event ${sourceId} endDate`),
          description: nullableText(event.description, `EvComp event ${sourceId} description`),
          subscriptionStartDate: nullableDateTime(
            event.subscriptionStartDate,
            `EvComp event ${sourceId} subscriptionStartDate`,
          ),
          subscriptionEndDate: nullableDateTime(
            event.subscriptionEndDate,
            `EvComp event ${sourceId} subscriptionEndDate`,
          ),
          ...(optionalText(event.link, `EvComp event ${sourceId} link`) === null
            ? {}
            : { buttonLink: optionalText(event.link, `EvComp event ${sourceId} link`) }),
          isPaymentRequired: modalities.some((modality) => amountInCents(modality.amount, 'modality amount') > 0),
        },
      });
    }

    for (const activity of sourceActivities.values()) {
      const sourceId = sourceKey(activity.sourceId, 'activity');
      const parentSourceId = sourceKey(activity.sourceEventId, `activity ${sourceId} event`);
      const majorEventId = eventIdsBySource.get(parentSourceId);
      if (!majorEventId) throw new Error(`EvComp activity ${sourceId} references unknown event ${parentSourceId}.`);
      const id = mappings.activity.get(sourceId) ?? deterministicUuid(sourceNamespace, 'event', sourceId);
      activityIdsBySource.set(sourceId, id);
      const parent = sourceEvents.get(parentSourceId);
      resources.push({
        kind: 'event',
        id,
        data: {
          name: requiredName(activity.name, `EvComp activity ${sourceId}`),
          startDate: requiredDateTime(activity.startDate, `EvComp activity ${sourceId} startDate`),
          endDate: requiredDateTime(activity.endDate, `EvComp activity ${sourceId} endDate`),
          type: 'OTHER',
          creditMinutes: nullableCount(activity.durationInMinutes, `EvComp activity ${sourceId} duration`),
          description: nullableText(activity.description, `EvComp activity ${sourceId} description`),
          locationDescription: nullableText(activity.location, `EvComp activity ${sourceId} location`),
          majorEventId,
          allowSubscription: true,
          subscriptionStartDate: nullableDateTime(
            parent?.subscriptionStartDate,
            `EvComp event ${parentSourceId} subscriptionStartDate`,
          ),
          subscriptionEndDate: nullableDateTime(
            parent?.subscriptionEndDate,
            `EvComp event ${parentSourceId} subscriptionEndDate`,
          ),
          slots: nullableCount(activity.slots, `EvComp activity ${sourceId} slots`),
          shouldCollectAttendance: true,
          ...(rules.after && String(activity.sourceId) === String(rules.after.activity.sourceId)
            ? {
                allowSubscription: false,
                autoSubscribe: false,
                shouldIssueCertificate: false,
              }
            : {}),
        },
      });
    }

    const modalitiesByEvent = groupRows([...sourceModalities.values()], 'sourceEventId', 'modalities');
    for (const [sourceEventId, modalities] of modalitiesByEvent) {
      const majorEventId = eventIdsBySource.get(sourceEventId);
      if (!majorEventId) throw new Error(`EvComp modalities reference unknown event ${sourceEventId}.`);
      const priceId = deterministicUuid(sourceNamespace, 'major-event-price', sourceEventId);
      resources.push({ kind: 'major-event-price', id: priceId, data: { majorEventId, type: 'TIERED' } });
      for (const modality of modalities) {
        const sourceId = sourceKey(modality.sourceId, 'modality');
        if (String(modality.sourceEventId) !== sourceEventId) {
          throw new Error(`EvComp modality ${sourceId} is grouped under the wrong event.`);
        }
        const tierId = deterministicUuid(sourceNamespace, 'price-tier', sourceId);
        modalityIdsBySource.set(sourceId, tierId);
        resources.push({
          kind: 'price-tier',
          id: tierId,
          data: {
            priceId,
            name: requiredName(modality.name, `EvComp modality ${sourceId}`),
            value: amountInCents(modality.amount, `EvComp modality ${sourceId} amount`),
            includesEventRegistration: true,
            includesSportsRegistration: false,
          },
        });
      }
    }
  } else {
    for (const event of sourceEvents.values()) {
      const sourceId = sourceKey(event.sourceId, 'event');
      const targetId = mappings.event.get(sourceId);
      if (targetId) eventIdsBySource.set(sourceId, targetId);
    }
    for (const activity of sourceActivities.values()) {
      const sourceId = sourceKey(activity.sourceId, 'activity');
      const targetId = mappings.activity.get(sourceId);
      if (targetId) activityIdsBySource.set(sourceId, targetId);
    }
    for (const modality of sourceModalities.values()) {
      const sourceId = sourceKey(modality.sourceId, 'modality');
      const targetId = mappings.modality.get(sourceId);
      if (targetId) modalityIdsBySource.set(sourceId, targetId);
    }
  }

  if (rules.after) {
    const afterResources = createAfterTicketResources(
      rules.after,
      [...groupRegistrations(rules.after.registrations).values()],
      paymentRows,
      {
        eventId: activityIdsBySource.get(String(rules.after.activity.sourceId)),
        resourceId: (kind, sourceId) => deterministicUuid(sourceNamespace, kind, sourceId),
        resolvePerson: (sourcePersonId) =>
          personReference(sourcePersonId, people, mappings.person, personReferences, report, reportedPersonIssues),
        report,
        mainRegistrations: [...registrationRows.values()].filter(
          (row) => String(row.sourceEventId) === String(rules.after.mainEvent.sourceId),
        ),
      },
    );
    resources.push(...afterResources);
  }

  const subscriptionCandidates = [];
  for (const registration of registrationRows.values()) {
    const registrationPayments = paymentRows.get(String(registration.sourceId)) ?? [];
    const subscriptionStatus = targetSubscriptionStatus(registration, registrationPayments);
    if (!subscriptionStatus) {
      addIssue(
        report,
        'inactive_registration_skipped',
        'registration',
        registration.sourceId,
        'The source registration is inactive and has no supported payment state; it was omitted instead of ' +
          'guessing whether it was canceled.',
        true,
      );
      continue;
    }

    const sourceId = sourceKey(registration.sourceId, 'registration');
    const sourceEventId = sourceKey(registration.sourceEventId, `registration ${sourceId} event`);
    const majorEventId = eventIdsBySource.get(sourceEventId);
    if (!majorEventId) {
      addIssue(
        report,
        'unmapped_registration_event',
        'registration',
        sourceId,
        `No target major event is available for source event ${sourceEventId}; the registration was omitted.`,
        true,
      );
      continue;
    }

    const person = personReference(
      registration.sourcePersonId,
      people,
      mappings.person,
      personReferences,
      report,
      reportedPersonIssues,
    );
    if (!person) {
      addIssue(
        report,
        'registration_person_unavailable',
        'registration',
        sourceId,
        'No usable participant reference is available; the registration was omitted.',
        true,
      );
      continue;
    }

    const selectedEventIds = [];
    for (const sourceActivityId of [...registration.activityIds].sort(compareText)) {
      const eventId = activityIdsBySource.get(sourceActivityId);
      if (eventId) selectedEventIds.push(eventId);
      else
        addIssue(
          report,
          'unmapped_activity_subscription',
          'registration',
          sourceId,
          `Source activity ${sourceActivityId} has no target event mapping; that activity selection was omitted.`,
          true,
        );
    }
    const uniqueEventIds = [...new Set(selectedEventIds)].sort(compareText);
    if (uniqueEventIds.length > contract.TRANSFER_MAX_RESOURCES) {
      addIssue(
        report,
        'too_many_activity_selections',
        'registration',
        sourceId,
        `The registration selects more than ${contract.TRANSFER_MAX_RESOURCES} activities and was omitted.`,
        true,
      );
      continue;
    }

    const paymentTier = registrationPaymentTier(
      registration,
      sourceEventId,
      sourceModalities,
      modalityIdsBySource,
      mappings.modality,
      catalogMappingsAreExplicit,
      report,
    );
    if (registration.sourceModalityId != null && !paymentTier.available) {
      addIssue(
        report,
        'unmapped_registration_modality',
        'registration',
        sourceId,
        'The selected modality has no portable target price tier; the registration was omitted.',
        true,
      );
      continue;
    }

    subscriptionCandidates.push({
      sourceId,
      sourceEventId,
      majorEventId,
      sourcePersonId: registration.sourcePersonId,
      person,
      selectedEventIds: uniqueEventIds,
      paymentTier: paymentTier.name,
      subscriptionStatus,
      payment:
        subscriptionStatus === 'CONFIRMED'
          ? paymentEvidence(registration, registrationPayments, report)
          : {
              status: singlePaymentStatus(registrationPayments),
            },
      createdAt: registration.createdAt,
    });
  }

  const selectedSubscriptions = selectUniqueSubscriptions(subscriptionCandidates, report);
  for (const registration of selectedSubscriptions) {
    const data = {
      majorEventId: registration.majorEventId,
      person: registration.person,
      subscriptionStatus: registration.subscriptionStatus,
      selectedEventIds: registration.selectedEventIds,
      ...(registration.paymentTier ? { paymentTier: registration.paymentTier } : {}),
      ...(registration.payment.amountPaid === undefined ? {} : { amountPaid: registration.payment.amountPaid }),
    };
    resources.push({
      kind: 'major-event-subscription',
      id: deterministicUuid(sourceNamespace, 'major-event-subscription', registration.sourceId),
      data,
    });
  }

  const attendances = selectUniqueAttendances(
    snapshot.attendances,
    activityIdsBySource,
    people,
    mappings.person,
    personReferences,
    report,
    reportedPersonIssues,
  );
  for (const attendance of attendances) {
    resources.push({
      kind: 'event-attendance',
      id: deterministicUuid(sourceNamespace, 'event-attendance', attendance.sourceId),
      data: {
        eventId: attendance.eventId,
        person: attendance.person,
        attendedAt: attendance.attendedAt,
        status: attendance.present ? 'PRESENT' : 'ABSENT',
      },
    });
  }

  addUnsupportedDataIssues(snapshot, report);
  if (registrationRows.size > 0) {
    const timestampCount = [...registrationRows.values()].filter((row) => row.createdAt != null).length;
    if (timestampCount > 0) {
      report.issues.push({
        code: 'registration_timestamps_not_exported',
        count: timestampCount,
        message: 'The transfer schema has no registration-created timestamp field; those source dates were omitted.',
      });
    }
  }

  const sortedResources = resources.sort((left, right) => {
    const order = RESOURCE_ORDER.get(left.kind) - RESOURCE_ORDER.get(right.kind);
    return order || compareText(left.id, right.id);
  });
  assertUniqueResourceIds(sortedResources);
  report.exportedCounts = countResourceKinds(sortedResources);
  report.personSummary = summarizeExportedPeople(sortedResources, contract);
  report.registrationStatusCounts = countRegistrationStatuses(sortedResources);
  report.paymentSummary.amountPaidExported = selectedSubscriptions.filter(
    (registration) => registration.payment.amountPaid !== undefined,
  ).length;
  report.paymentSummary.approvedAmountsExported = selectedSubscriptions.filter(
    (registration) => registration.payment.status === 'APROVADO' && registration.payment.amountPaid !== undefined,
  ).length;
  report.paymentSummary.exemptAmountsExported = selectedSubscriptions.filter(
    (registration) => registration.payment.status === 'ISENTO' && registration.payment.amountPaid === 0,
  ).length;
  report.paymentSummary.includedWithoutAmount = selectedSubscriptions.filter(
    (registration) => registration.payment.amountPaid === undefined,
  ).length;
  report.paymentSummary.ticketPurchaseAmountsExported = sortedResources.filter(
    (resource) => resource.kind === 'ticket-purchase',
  ).length;
  report.skippedCounts = countSkippedIssues(report.issues);
  const documents = splitResources(sortedResources, contract, maxResources, maxBytes);
  report.documentCount = documents.length;
  report.documents = documents.map(({ name, document }) => ({ name, resourceCount: document.resources.length }));
  return { documents, report };
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('EvComp transfer snapshot must be an object.');
  }
  for (const field of ['people', 'events', 'activities', 'modalities', 'registrations', 'attendances', 'lecturers']) {
    if (!Array.isArray(snapshot[field])) throw new Error(`EvComp transfer snapshot must contain a ${field} array.`);
  }
  if (snapshot.payments !== undefined && !Array.isArray(snapshot.payments)) {
    throw new Error('EvComp transfer snapshot payments must be an array when present.');
  }
}

function validateOptions(sourceNamespace, maxResources, maxBytes, contract) {
  if (typeof sourceNamespace !== 'string' || !sourceNamespace.trim() || sourceNamespace !== sourceNamespace.trim()) {
    throw new Error('sourceNamespace must be a nonempty, trimmed string.');
  }
  if (!Number.isSafeInteger(maxResources) || maxResources < 1 || maxResources > contract.TRANSFER_MAX_RESOURCES) {
    throw new Error(`maxResources must be between 1 and ${contract.TRANSFER_MAX_RESOURCES}.`);
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > contract.TRANSFER_MAX_BYTES) {
    throw new Error(`maxBytes must be between 1 and ${contract.TRANSFER_MAX_BYTES}.`);
  }
}

function readMappings(config) {
  return {
    event: readMapping(config.eventMappings, 'sourceEventId', 'targetMajorEventId', 'eventMappings'),
    activity: readMapping(config.activityMappings, 'sourceActivityId', 'targetEventId', 'activityMappings'),
    modality: readMapping(config.modalityMappings, 'sourceModalityId', 'targetPriceTierId', 'modalityMappings'),
    person: readMapping(config.personMappings, 'sourcePersonId', 'targetPersonId', 'personMappings'),
  };
}

function readMapping(rows, sourceField, targetField, label) {
  if (rows === undefined) return new Map();
  if (!Array.isArray(rows)) throw new Error(`${label} must be an array.`);
  const result = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${label} entries must be objects.`);
    const sourceId = sourceKey(row[sourceField], `${label}.${sourceField}`);
    const targetId = sourceKey(row[targetField], `${label}.${targetField}`);
    if (result.has(sourceId)) throw new Error(`Duplicate ${label} source ID: ${sourceId}`);
    result.set(sourceId, targetId);
  }
  return result;
}

function indexUnique(rows, label) {
  const indexed = new Map();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`EvComp ${label}[${index}] must be an object.`);
    }
    const id = sourceKey(row.sourceId, `${label}[${index}].sourceId`);
    if (indexed.has(id)) throw new Error(`Duplicate EvComp ${label} source ID: ${id}`);
    indexed.set(id, row);
  }
  return indexed;
}

function groupRows(rows, field, label) {
  const grouped = new Map();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`EvComp ${label}[${index}] must be an object.`);
    }
    const key = sourceKey(row[field], `${label}[${index}].${field}`);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

function groupPaymentRows(rows, report) {
  const grouped = new Map();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`EvComp payments[${index}] must be an object.`);
    }
    if (row.sourceRegistrationId == null || String(row.sourceRegistrationId).trim() === '') {
      report.issues.push({
        code: 'orphan_payment_row',
        sourceKind: 'payment',
        ...(row.sourceId == null ? {} : { sourceId: String(row.sourceId) }),
        message: 'A payment row has no source registration and was not linked to a subscription.',
      });
      continue;
    }
    const key = String(row.sourceRegistrationId);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

function groupRegistrations(rows) {
  const grouped = new Map();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`EvComp registrations[${index}] must be an object.`);
    }
    const sourceId = sourceKey(row.sourceId, `registrations[${index}].sourceId`);
    const current = grouped.get(sourceId);
    if (!current) {
      grouped.set(sourceId, {
        ...row,
        sourceId,
        activityIds: new Set(row.sourceActivityId == null ? [] : [String(row.sourceActivityId)]),
      });
      continue;
    }
    for (const field of [
      'sourcePersonId',
      'sourceEventId',
      'sourceModalityId',
      'sourceModalityEventId',
      'modalityName',
      'appliedAmount',
      'active',
    ]) {
      if (!valuesEqual(current[field], row[field])) {
        throw new Error(`EvComp registration ${sourceId} has conflicting ${field} values across activity rows.`);
      }
    }
    if (row.sourceActivityId != null) current.activityIds.add(String(row.sourceActivityId));
    if (
      row.createdAt != null &&
      (current.createdAt == null || dateMillis(row.createdAt) < dateMillis(current.createdAt))
    ) {
      current.createdAt = row.createdAt;
    }
  }
  return grouped;
}

function registrationPaymentTier(
  registration,
  sourceEventId,
  modalities,
  tierIds,
  explicitTierMappings,
  explicitMode,
  report,
) {
  if (registration.sourceModalityId == null) return { available: true, name: null };
  const sourceModalityId = String(registration.sourceModalityId);
  if (registration.sourceModalityEventId != null && String(registration.sourceModalityEventId) !== sourceEventId) {
    throw new Error(`EvComp registration ${registration.sourceId} uses a modality from another event.`);
  }
  const modality = modalities.get(sourceModalityId);
  if (!tierIds.has(sourceModalityId)) return { available: false, name: null };
  const name = requiredName(
    registration.modalityName ?? modality?.name,
    `EvComp registration ${registration.sourceId} modality`,
  );
  if (explicitMode && explicitTierMappings.has(sourceModalityId)) {
    report.issues.push({
      code: 'mapped_price_tier_name_unverified',
      sourceKind: 'modality',
      sourceId: sourceModalityId,
      message:
        'The mapped target price tier ID is known, but the transfer contract stores a payment tier by name. ' +
        'The source modality name was retained and must match the target tier name.',
    });
  }
  const sameName = [...modalities.values()].filter(
    (entry) => String(entry.sourceEventId) === sourceEventId && String(entry.name ?? '').trim() === name,
  );
  if (!explicitMode && sameName.length > 1) {
    report.issues.push({
      code: 'ambiguous_source_price_tier_name',
      sourceKind: 'registration',
      sourceId: String(registration.sourceId),
      message:
        'More than one source price tier has this name; the payment tier name was omitted to avoid selecting ' +
        'the wrong tier.',
    });
    return { available: true, name: null };
  }
  return { available: true, name };
}

function paymentEvidence(registration, paymentRows, report) {
  if (paymentRows.length !== 1) {
    addIssue(
      report,
      paymentRows.length === 0 ? 'payment_status_unavailable' : 'payment_status_ambiguous',
      'registration',
      registration.sourceId,
      paymentRows.length === 0
        ? 'No payment status is available; the active registration is included without an amount paid.'
        : 'Multiple payment rows exist; the active registration is included without an amount paid.',
    );
    return { status: singlePaymentStatus(paymentRows) };
  }
  const status = String(paymentRows[0].status ?? '')
    .trim()
    .toUpperCase();
  if (status === 'APROVADO') {
    try {
      if (registration.appliedAmount == null) throw new Error('missing');
      return {
        status,
        amountPaid: amountInCents(
          registration.appliedAmount,
          `EvComp registration ${registration.sourceId} applied amount`,
        ),
      };
    } catch {
      addIssue(
        report,
        'approved_amount_unavailable',
        'registration',
        registration.sourceId,
        'Payment approval is recorded, but the applied amount is missing or invalid; no amount paid was exported.',
      );
      return { status };
    }
  }
  if (status === 'ISENTO') {
    if (registration.appliedAmount != null) {
      try {
        if (
          amountInCents(registration.appliedAmount, `EvComp registration ${registration.sourceId} applied amount`) > 0
        ) {
          addIssue(
            report,
            'exempt_applied_amount_mismatch',
            'registration',
            registration.sourceId,
            'The payment status is ISENTO while the applied amount is nonzero; amount paid was exported as zero.',
          );
        }
      } catch {
        addIssue(
          report,
          'exempt_applied_amount_invalid',
          'registration',
          registration.sourceId,
          'The source applied amount is invalid; amount paid was exported as zero from the ISENTO status.',
        );
      }
    }
    return { status, amountPaid: 0 };
  }
  addIssue(
    report,
    status ? 'payment_not_approved' : 'payment_status_unavailable',
    'registration',
    registration.sourceId,
    `Payment status ${status || '(empty)'} does not prove an amount paid; the active registration is ` +
      'included without one.',
  );
  return { status };
}

function targetSubscriptionStatus(registration, paymentRows) {
  if (toSourceBoolean(registration.active)) return 'CONFIRMED';
  if (paymentRows.length !== 1) return null;
  const payment = paymentRows[0];
  const status = String(payment.status ?? '')
    .trim()
    .toUpperCase();
  if (status === 'PENDENTE') return payment.submittedAt == null ? 'WAITING_RECEIPT_UPLOAD' : 'RECEIPT_UNDER_REVIEW';
  if (status === 'RECUSADO') return 'REJECTED_GENERIC';
  return null;
}

function singlePaymentStatus(paymentRows) {
  return paymentRows.length === 1
    ? String(paymentRows[0].status ?? '')
        .trim()
        .toUpperCase()
    : undefined;
}

function summarizeSourcePayments(snapshot) {
  if (!Array.isArray(snapshot.payments)) {
    return {
      sourceRows: null,
      submittedRecords: null,
      statusCounts: null,
      proofContentExported: 0,
    };
  }
  const statusCounts = {};
  for (const payment of snapshot.payments) {
    const status =
      String(payment.status ?? '')
        .trim()
        .toUpperCase() || '(EMPTY)';
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  return {
    sourceRows: snapshot.payments.length,
    submittedRecords: snapshot.payments.filter((payment) => payment.submittedAt != null).length,
    statusCounts,
    proofContentExported: 0,
  };
}

function selectUniqueSubscriptions(candidates, report) {
  const winners = new Map();
  for (const candidate of candidates) {
    const personKey = personReferenceKey(candidate.person, candidate.sourcePersonId);
    const key = `${candidate.majorEventId}\0${personKey}`;
    const existing = winners.get(key);
    if (!existing) {
      winners.set(key, candidate);
      continue;
    }
    const candidateTime = safeDateMillis(candidate.createdAt);
    const existingTime = safeDateMillis(existing.createdAt);
    const replace =
      candidateTime > existingTime ||
      (candidateTime === existingTime && compareText(candidate.sourceId, existing.sourceId) > 0);
    const winner = replace ? candidate : existing;
    winners.set(key, winner);
    report.issues.push({
      code: 'duplicate_source_registration',
      sourceKind: 'registration',
      sourceId: replace ? existing.sourceId : candidate.sourceId,
      message:
        'Multiple source registrations resolve to the same person and major event; only the most recent ' +
        'registration was exported.',
      skipped: true,
    });
  }
  return [...winners.values()].sort((left, right) => compareText(left.sourceId, right.sourceId));
}

function selectUniqueAttendances(
  rows,
  activityIds,
  people,
  personMappings,
  personReferences,
  report,
  reportedPersonIssues,
) {
  const winners = new Map();
  for (const row of rows) {
    const sourceId = sourceKey(row.sourceId, 'attendance');
    const sourceActivityId = sourceKey(row.sourceActivityId, `attendance ${sourceId} activity`);
    const eventId = activityIds.get(sourceActivityId);
    if (!eventId) {
      addIssue(
        report,
        'unmapped_attendance_activity',
        'attendance',
        sourceId,
        `Source activity ${sourceActivityId} has no target event mapping; the attendance was omitted.`,
        true,
      );
      continue;
    }
    const person = personReference(
      row.sourcePersonId,
      people,
      personMappings,
      personReferences,
      report,
      reportedPersonIssues,
    );
    if (!person) {
      addIssue(
        report,
        'attendance_person_unavailable',
        'attendance',
        sourceId,
        'No usable participant reference is available; the attendance was omitted.',
        true,
      );
      continue;
    }
    let attendedAt;
    try {
      attendedAt = requiredDateTime(row.recordedAt, `EvComp attendance ${sourceId} recordedAt`);
    } catch {
      addIssue(
        report,
        'invalid_attendance_timestamp',
        'attendance',
        sourceId,
        'The attendance timestamp is invalid; the attendance was omitted.',
        true,
      );
      continue;
    }
    let present;
    try {
      present = toSourceBoolean(row.present);
    } catch {
      addIssue(
        report,
        'invalid_attendance_status',
        'attendance',
        sourceId,
        'The attendance status is invalid; the attendance was omitted.',
        true,
      );
      continue;
    }
    const candidate = { sourceId, eventId, person, attendedAt, present };
    const key = `${eventId}\0${personReferenceKey(person, row.sourcePersonId)}`;
    const existing = winners.get(key);
    if (!existing) {
      winners.set(key, candidate);
      continue;
    }
    const replace =
      Date.parse(candidate.attendedAt) > Date.parse(existing.attendedAt) ||
      (candidate.attendedAt === existing.attendedAt && compareText(candidate.sourceId, existing.sourceId) > 0);
    if (replace) winners.set(key, candidate);
    report.issues.push({
      code: 'duplicate_attendance',
      sourceKind: 'attendance',
      sourceId: replace ? existing.sourceId : candidate.sourceId,
      message:
        'Multiple source attendance rows resolve to the same person and event; only the latest attendance ' +
        'was exported.',
      skipped: true,
    });
  }
  return [...winners.values()].sort(
    (left, right) => compareText(left.eventId, right.eventId) || compareText(left.sourceId, right.sourceId),
  );
}

function personReference(sourcePersonId, people, personMappings, cache, report, reportedIssues) {
  if (sourcePersonId == null) return null;
  const key = String(sourcePersonId);
  if (cache.has(key)) return cache.get(key);
  const mappedId = personMappings.get(key);
  if (mappedId) {
    const reference = { id: mappedId };
    cache.set(key, reference);
    return reference;
  }
  const source = people.get(key);
  if (!source) {
    if (!reportedIssues.has(key)) {
      reportedIssues.add(key);
      report.issues.push({
        code: 'source_person_unavailable',
        sourceKind: 'person',
        message: 'A referenced person is absent from the filtered source snapshot.',
      });
    }
    cache.set(key, null);
    return null;
  }
  const reference = {};
  const name = validName(source.name);
  const email = validEmail(source.email);
  const academicId = validIdentifier(source.academicId, 40);
  if (name) reference.name = name;
  if (email) reference.email = email;
  if (academicId) reference.academicId = academicId;
  if (!email && source.email != null && String(source.email).trim()) {
    report.issues.push({
      code: 'invalid_source_person_email',
      sourceKind: 'person',
      message: 'A source email is invalid or too long and was omitted from the person reference.',
    });
  }
  if (!academicId && source.academicId != null && String(source.academicId).trim()) {
    report.issues.push({
      code: 'invalid_source_person_academic_id',
      sourceKind: 'person',
      message: 'A source academic ID is empty or exceeds the transfer limit and was omitted.',
    });
  }
  if (Object.keys(reference).length > 0) {
    const error = loadTransferContract().transferPersonDataError(reference);
    if (error) {
      report.issues.push({
        code: 'person_creation_data_incomplete',
        sourceKind: 'person',
        sourceId: key,
        message: 'Participant data needs review in Dados JSON before a missing person can be created.',
        reason: error,
      });
    }
  }
  const result = Object.keys(reference).length === 0 ? null : reference;
  cache.set(key, result);
  return result;
}

function summarizeExportedPeople(resources, contract) {
  const references = new Map();
  for (const resource of resources) {
    const person = resource.data.person;
    if (person) references.set(personReferenceKey(person), person);
  }
  const people = [...references.values()];
  const explicitlyMapped = people.filter((person) => person.id).length;
  const withCreationData = people.filter((person) => !person.id && !contract.transferPersonDataError(person)).length;
  return {
    referenced: people.length,
    explicitlyMapped,
    withCreationData,
    requiringDataReview: people.length - explicitlyMapped - withCreationData,
  };
}

function addUnsupportedDataIssues(snapshot, report) {
  if (snapshot.lecturers.length > 0) {
    report.issues.push({
      code: 'lecturers_not_exported',
      count: snapshot.lecturers.length,
      message: 'Activity lecturer assignments have no corresponding resource in the transfer schema and were omitted.',
    });
  }
  const activitiesWithLecturerHours = snapshot.activities.filter(
    (activity) => Number(activity.lecturerDurationInMinutes ?? 0) > 0,
  ).length;
  if (activitiesWithLecturerHours > 0) {
    report.issues.push({
      code: 'lecturer_hours_not_exported',
      count: activitiesWithLecturerHours,
      message: 'Lecturer-specific activity hours have no corresponding transfer field and were omitted.',
    });
  }
  report.issues.push({
    code: 'payment_proof_content_not_exported',
    count: report.paymentSummary.submittedRecords,
    countLabel: 'payment rows with submittedAt',
    message: Array.isArray(snapshot.payments)
      ? 'Payment statuses and submission dates are summarized, but receipt files and proof contents are absent ' +
        'from the source snapshot and cannot be transferred.'
      : 'The source snapshot has no payment records; receipt files and proof contents are not included ' +
        'in the transfer schema.',
  });
  report.issues.push({
    code: 'issued_certificates_not_exported',
    count: Array.isArray(snapshot.certificates) ? snapshot.certificates.length : null,
    message: 'Issued certificate records have no corresponding resource in the transfer schema and were omitted.',
  });
}

function splitResources(resources, contract, maxResources, maxBytes) {
  const documents = [];
  let chunk = [];
  const documentFor = (rows) => ({
    $schema: contract.TRANSFER_SCHEMA_ID,
    format: contract.TRANSFER_FORMAT,
    version: contract.TRANSFER_VERSION,
    resources: rows,
  });
  const bytesFor = (rows) => Buffer.byteLength(`${JSON.stringify(documentFor(rows), null, 2)}\n`);
  const append = (currentResources) => {
    const name = `evcomp-transfer-${String(documents.length + 1).padStart(3, '0')}.json`;
    const document = documentFor(currentResources);
    contract.parseTransferDocument(document);
    documents.push({ name, document });
  };

  // A new price table needs its first tier in the same executable plan. Keep
  // ticket configuration and pricing together as well, including historical catalogs.
  const bundledChildren = new Set();
  const units = [];
  for (const resource of resources) {
    if (bundledChildren.has(resource)) continue;
    let children = [];
    if (resource.kind === 'ticket-config') {
      children = resources.filter(
        (row) => row.kind === 'ticket-price-option' && row.data.ticketConfigId === resource.id,
      );
    } else if (resource.kind === 'major-event-price') {
      const firstTier = resources.find((row) => row.kind === 'price-tier' && row.data.priceId === resource.id);
      if (firstTier) children = [firstTier];
    }
    for (const child of children) bundledChildren.add(child);
    units.push([resource, ...children]);
  }

  for (const unit of units) {
    if (unit.length > maxResources || bytesFor(unit) > maxBytes) {
      const label =
        unit.length === 1
          ? `single ${unit[0].kind} resource`
          : unit[0].kind === 'major-event-price'
            ? 'price table and its first tier'
            : 'ticket configuration and its price options';
      throw new Error(`The ${label} must fit in one import file; increase the resource/byte limits.`);
    }
    // Purchases run before subscriptions inside one backend transaction. Keep this phase in
    // a later file so the original SECOMPP26 subscriptions are applied before the After purchase.
    if (unit[0].kind === 'ticket-purchase' && chunk.some((row) => row.kind === 'major-event-subscription')) {
      append(chunk);
      chunk = [];
    }
    const candidate = [...chunk, ...unit];
    const tooManyResources = candidate.length > maxResources;
    const tooManyBytes = bytesFor(candidate) > maxBytes;
    if (chunk.length > 0 && (tooManyResources || tooManyBytes)) {
      append(chunk);
      chunk = unit;
    } else {
      chunk = candidate;
    }
  }
  if (chunk.length > 0) append(chunk);
  return documents;
}

function assertUniqueResourceIds(resources) {
  const seen = new Set();
  for (const resource of resources) {
    const identity = `${resource.kind}:${resource.id}`;
    if (seen.has(identity)) throw new Error(`Duplicate transfer identity ${identity}.`);
    seen.add(identity);
  }
}

function countResourceKinds(resources) {
  const counts = {};
  for (const resource of resources) counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
  return counts;
}

function countRegistrationStatuses(resources) {
  const counts = {};
  for (const resource of resources) {
    if (resource.kind !== 'major-event-subscription') continue;
    const status = resource.data.subscriptionStatus;
    if (typeof status === 'string') counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function countSkippedIssues(issues) {
  const counts = {};
  for (const issue of issues) {
    if (!issue.sourceKind || issue.skipped !== true) continue;
    counts[issue.sourceKind] = (counts[issue.sourceKind] ?? 0) + (issue.count ?? 1);
  }
  return counts;
}

function addIssue(report, code, sourceKind, sourceId, message, skipped = false) {
  report.issues.push({ code, sourceKind, sourceId: String(sourceId), message, ...(skipped ? { skipped: true } : {}) });
}

function sourceKey(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing ${label} source ID.`);
  }
  return String(value);
}

function deterministicUuid(sourceNamespace, kind, sourceId) {
  const namespaceBytes = Buffer.from(UUID_NAMESPACE_DNS.replaceAll('-', ''), 'hex');
  const name = Buffer.from(JSON.stringify([sourceNamespace, kind, String(sourceId)]), 'utf8');
  const digest = createHash('sha1').update(namespaceBytes).update(name).digest().subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requiredName(value, label) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 300) throw new Error(`${label} must have a name of 1 to 300 characters.`);
  return name;
}

function validName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= 300 ? name : '';
}

function optionalText(value, label) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const text = value.trim();
  if (text.length > 2048) throw new Error(`${label} exceeds the transfer text limit.`);
  return text || null;
}

function nullableText(value, label) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const text = value.trim();
  if (text.length > 50000) throw new Error(`${label} exceeds the transfer text limit.`);
  return text || null;
}

function requiredDateTime(value, label) {
  if (value == null) throw new Error(`${label} is required.`);
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid.`);
  return date.toISOString();
}

function nullableDateTime(value, label) {
  return value == null ? null : requiredDateTime(value, label);
}

function nullableCount(value, label) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2147483647) {
    throw new Error(`${label} is outside the transfer integer range.`);
  }
  return parsed;
}

function amountInCents(value, label) {
  try {
    return toAmountInCents(value);
  } catch {
    throw new Error(`${label} is not a valid nonnegative amount.`);
  }
}

function validEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return email.length <= 300 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : '';
}

function validIdentifier(value, maxLength) {
  if (value == null) return '';
  const identifier = String(value).trim();
  return identifier.length > 0 && identifier.length <= maxLength ? identifier : '';
}

function personReferenceKey(reference, sourcePersonId) {
  if (reference.id) return `id:${reference.id}`;
  const identity = Object.entries(reference).sort(([left], [right]) => compareText(left, right));
  if (identity.length > 0) return JSON.stringify(identity);
  return `source:${String(sourcePersonId)}`;
}

function valuesEqual(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return String(left) === String(right);
}

function dateMillis(value) {
  return safeDateMillis(value);
}

function safeDateMillis(value) {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareText(left, right) {
  return String(left).localeCompare(String(right));
}

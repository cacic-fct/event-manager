import assert from 'node:assert/strict';
import test from 'node:test';
import { exportTransferDocuments } from './transfer-export.mjs';
import { loadTransferContract } from './transfer-validation.mjs';

const uuid = (suffix) => `00000000-0000-7000-8000-${String(suffix).padStart(12, '0')}`;

function snapshot(overrides = {}) {
  const now = new Date();
  const at = (hours = 0) => new Date(now.getTime() + hours * 60 * 60 * 1000);
  return {
    people: [
      { sourceId: 1, name: 'Ada Example', email: 'ADA@example.test', academicId: 'A-100' },
      { sourceId: 2, name: 'Bia Example', email: 'bia@example.test', academicId: 'B-200' },
      { sourceId: 3, name: 'Caio Example', email: 'caio@example.test', academicId: 'C-300' },
      { sourceId: 4, name: 'Dani Example', email: 'dani@example.test', academicId: 'D-400' },
    ],
    events: [
      {
        sourceId: 10,
        name: 'Source major event',
        description: 'Source event description',
        startDate: at(24),
        endDate: at(72),
        subscriptionStartDate: at(-48),
        subscriptionEndDate: at(12),
        link: 'https://example.test/event',
      },
    ],
    activities: [
      {
        sourceId: 20,
        sourceEventId: 10,
        name: 'First activity',
        description: 'First activity description',
        startDate: at(25),
        endDate: at(26),
        location: 'Room A',
        slots: 25,
        durationInMinutes: 60,
        lecturerDurationInMinutes: 45,
      },
      {
        sourceId: 21,
        sourceEventId: 10,
        name: 'Second activity',
        description: null,
        startDate: at(27),
        endDate: at(28),
        location: null,
        slots: null,
        durationInMinutes: null,
        lecturerDurationInMinutes: null,
      },
    ],
    modalities: [
      { sourceId: 30, sourceEventId: 10, name: 'Student', amount: '19.90' },
      { sourceId: 31, sourceEventId: 10, name: 'Exempt', amount: '0.00' },
    ],
    registrations: [
      {
        sourceId: 40,
        sourcePersonId: 1,
        sourceEventId: 10,
        sourceModalityId: 30,
        sourceModalityEventId: 10,
        modalityName: 'Student',
        appliedAmount: '19.90',
        createdAt: at(-24),
        active: 1,
        sourceActivityId: 20,
      },
      {
        sourceId: 40,
        sourcePersonId: 1,
        sourceEventId: 10,
        sourceModalityId: 30,
        sourceModalityEventId: 10,
        modalityName: 'Student',
        appliedAmount: '19.90',
        createdAt: at(-24),
        active: 1,
        sourceActivityId: 21,
      },
      {
        sourceId: 41,
        sourcePersonId: 2,
        sourceEventId: 10,
        sourceModalityId: 31,
        sourceModalityEventId: 10,
        modalityName: 'Exempt',
        appliedAmount: '0.00',
        createdAt: at(-12),
        active: '1',
        sourceActivityId: null,
      },
      {
        sourceId: 42,
        sourcePersonId: 3,
        sourceEventId: 10,
        sourceModalityId: 30,
        sourceModalityEventId: 10,
        modalityName: 'Student',
        appliedAmount: '19.90',
        createdAt: at(-6),
        active: 0,
        sourceActivityId: 20,
      },
      {
        sourceId: 43,
        sourcePersonId: 4,
        sourceEventId: 10,
        sourceModalityId: 30,
        sourceModalityEventId: 10,
        modalityName: 'Student',
        appliedAmount: '19.90',
        createdAt: at(-2),
        active: 0,
        sourceActivityId: 21,
      },
    ],
    attendances: [
      { sourceId: 50, sourcePersonId: 1, sourceActivityId: 20, recordedAt: at(26), present: 1 },
      { sourceId: 51, sourcePersonId: 2, sourceActivityId: 21, recordedAt: at(28), present: 0 },
    ],
    lecturers: [{ sourcePersonId: 3, sourceActivityId: 20 }],
    payments: [
      { sourceId: 60, sourceRegistrationId: 40, status: 'APROVADO', submittedAt: at(-25), evaluatedAt: at(-24) },
      { sourceId: 61, sourceRegistrationId: 41, status: 'ISENTO', submittedAt: null, evaluatedAt: at(-12) },
      { sourceId: 62, sourceRegistrationId: 42, status: 'PENDENTE', submittedAt: null, evaluatedAt: null },
      { sourceId: 63, sourceRegistrationId: 43, status: 'RECUSADO', submittedAt: at(-2), evaluatedAt: at(-1) },
    ],
    ...overrides,
  };
}

function allResources(result) {
  return result.documents.flatMap(({ document }) => document.resources);
}

function secomppSnapshot() {
  const base = snapshot();
  const at = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);
  const main = { ...base.events[0], name: 'SECOMPP 2026 - Semana da Computação de Presidente Prudente' };
  const after = { ...main, sourceId: 30, name: 'After da SECOMPP26', startDate: at(96), endDate: at(120) };
  const testEvent = { ...main, sourceId: 50, name: 'Evento de Teste' };
  const afterActivity = {
    ...base.activities[0],
    sourceId: 22,
    sourceEventId: 30,
    name: 'Happily Ever After',
    startDate: at(97),
    endDate: at(103),
  };
  const testActivity = { ...base.activities[0], sourceId: 60, sourceEventId: 50, name: 'Ignored activity' };
  const registration = (id, personId, eventId, modalityId, activityId, active = 1) => ({
    sourceId: id,
    sourcePersonId: personId,
    sourceEventId: eventId,
    sourceModalityId: modalityId,
    sourceModalityEventId: eventId,
    modalityName: eventId === 30 ? 'After' : 'Test',
    appliedAmount: eventId === 30 ? '30.00' : '0.00',
    sourceActivityId: activityId,
    active,
    createdAt: at(-3),
  });
  const payment = (id, status) => ({
    sourceId: id,
    sourceRegistrationId: id,
    status,
    submittedAt: status === 'APROVADO' ? at(-2) : null,
    evaluatedAt: status === 'APROVADO' ? at(-1) : null,
  });
  return {
    ...base,
    people: [
      ...base.people,
      { sourceId: 5, name: 'Enzo Example', email: 'enzo@example.test' },
      { sourceId: 6, name: 'Fernanda Example', email: 'fernanda@example.test' },
      { sourceId: 7, name: 'Test Person', email: 'ignored@example.test' },
    ],
    events: [main, after, testEvent],
    activities: [...base.activities, afterActivity, testActivity],
    modalities: [
      ...base.modalities,
      { sourceId: 32, sourceEventId: 30, name: 'After', amount: '30.00' },
      { sourceId: 33, sourceEventId: 50, name: 'Test', amount: '0.00' },
    ],
    registrations: [
      ...base.registrations
        .filter((row) => row.sourceId === 40 || row.sourceId === 41)
        .map((row) => (row.sourceId === 41 ? { ...row, active: 0 } : row)),
      registration(70, 1, 30, 32, 22),
      registration(71, 2, 30, 32, 22),
      registration(72, 5, 30, 32, 22),
      registration(73, 6, 30, 32, 22, 0),
      registration(80, 7, 50, 33, 60),
    ],
    payments: [
      base.payments[0],
      payment(41, 'PENDENTE'),
      payment(70, 'APROVADO'),
      payment(71, 'APROVADO'),
      payment(72, 'APROVADO'),
      payment(73, 'PENDENTE'),
      payment(80, 'ISENTO'),
    ],
    attendances: [
      base.attendances[0],
      { sourceId: 90, sourcePersonId: 7, sourceActivityId: 60, recordedAt: at(-1), present: 1 },
    ],
    lecturers: [...base.lecturers, { sourcePersonId: 7, sourceActivityId: 60 }],
  };
}

test('applies SECOMPP26 rules without changing main tiers or granting subscriptions to After-only buyers', () => {
  const source = secomppSnapshot();
  const original = structuredClone(source);
  const result = exportTransferDocuments(source);
  assert.deepEqual(source, original);
  const resources = allResources(result);
  const majors = resources.filter((row) => row.kind === 'major-event');
  assert.equal(majors.length, 1);
  const mainId = majors[0].id;
  const after = resources.find((row) => row.kind === 'event' && row.data.name === 'After da SECOMPP26');
  assert.equal(after.data.majorEventId, mainId);
  assert.equal(after.data.allowSubscription, false);
  assert.equal(after.data.autoSubscribe, false);
  const config = resources.find((row) => row.kind === 'ticket-config');
  assert.equal(config.data.eventId, after.id);
  assert.equal(config.data.issueOnMajorEventSubscription, false);
  assert.equal(config.data.issueOnEventSubscription, false);
  assert.equal(config.data.recipientSubscriptionRequirement, 'ANY');
  assert.equal(config.data.purchaseEnabled, false);
  assert.deepEqual(config.data.includedPriceTierIds, []);
  assert.equal(resources.filter((row) => row.kind === 'price-tier').length, 2);
  const option = resources.find((row) => row.kind === 'ticket-price-option');
  assert.deepEqual(option.data, { ticketConfigId: config.id, priceTierId: null, label: 'After', amountCents: 3000 });
  const subscriptions = resources.filter((row) => row.kind === 'major-event-subscription');
  assert.equal(subscriptions.length, 2);
  const paid = subscriptions.find((row) => row.data.person.email === 'ada@example.test');
  assert.equal(paid.data.paymentTier, 'Student');
  assert.equal(paid.data.amountPaid, 1990);
  assert.equal(paid.data.subscriptionStatus, 'CONFIRMED');
  assert.equal(paid.data.selectedEventIds.includes(after.id), false);
  const pending = subscriptions.find((row) => row.data.person.email === 'bia@example.test');
  assert.equal(pending.data.paymentTier, 'Exempt');
  assert.equal(pending.data.subscriptionStatus, 'WAITING_RECEIPT_UPLOAD');
  assert.equal(
    subscriptions.some((row) => row.data.person.email === 'enzo@example.test'),
    false,
  );
  const purchases = resources.filter((row) => row.kind === 'ticket-purchase');
  assert.equal(purchases.length, 3);
  for (const purchase of purchases) {
    assert.equal(purchase.data.eventId, after.id);
    assert.equal(purchase.data.amountCents, 3000);
    assert.equal(purchase.data.priceTierName, 'After');
    assert.ok(purchase.data.person.name);
    assert.ok(purchase.data.purchasedAt);
  }
  assert.equal(
    purchases.some((row) => row.data.person.email === 'fernanda@example.test'),
    false,
  );
  assert.equal(
    resources.some((row) => row.kind === 'event-subscription' || row.kind === 'event-ticket'),
    false,
  );
  assert.equal(JSON.stringify(resources).includes('ignored@example.test'), false);
  assert.equal(JSON.stringify(resources).includes('Evento de Teste'), false);
  assert.equal(result.report.rules.ignoredTestEvent.registrations, 1);
  assert.equal(result.report.rules.ignoredTestEvent.attendances, 1);
  assert.deepEqual(result.report.rules.after, {
    sourceRegistrations: 4,
    removedActivitySelections: 0,
    purchases: 3,
    withConfirmedMainRegistration: 1,
    withUnconfirmedMainRegistration: 1,
    withoutMainRegistration: 1,
    unapprovedRegistrations: 1,
  });
  assert.equal(result.report.skippedCounts.registration, 1);
  assert.equal(result.report.personSummary.referenced, 3);
  assert.equal(result.report.paymentSummary.ticketPurchaseAmountsExported, 3);
});

test('never turns a main registration selection of After into an After event subscription', () => {
  const source = secomppSnapshot();
  source.registrations.push({ ...source.registrations.find((row) => row.sourceId === 40), sourceActivityId: 22 });
  const result = exportTransferDocuments(source);
  const resources = allResources(result);
  const after = resources.find((row) => row.kind === 'event' && row.data.name === 'After da SECOMPP26');
  const paid = resources.find(
    (row) => row.kind === 'major-event-subscription' && row.data.person.email === 'ada@example.test',
  );
  assert.equal(paid.data.selectedEventIds.includes(after.id), false);
  assert.equal(paid.data.selectedEventIds.length, 2);
  assert.equal(paid.data.paymentTier, 'Student');
  assert.equal(resources.filter((row) => row.kind === 'ticket-purchase').length, 3);
  assert.equal(result.report.rules.after.removedActivitySelections, 1);
});

test('imports original main subscriptions in earlier files than After purchases, including tiny batches', () => {
  for (const maxResources of [2, 3, 500]) {
    const result = exportTransferDocuments(secomppSnapshot(), { maxResources });
    const subscriptionFiles = [];
    const purchaseFiles = [];
    const known = new Set();
    result.documents.forEach(({ document }, index) => {
      document.resources.forEach((row) => known.add(row.id));
      for (const row of document.resources) {
        if (row.kind === 'major-event-subscription') subscriptionFiles.push(index);
        if (row.kind === 'ticket-purchase') purchaseFiles.push(index);
        if (row.kind === 'ticket-config') {
          assert.ok(
            document.resources.some(
              (option) => option.kind === 'ticket-price-option' && option.data.ticketConfigId === row.id,
            ),
          );
        }
        if (row.kind === 'major-event-price') {
          assert.ok(document.resources.some((tier) => tier.kind === 'price-tier' && tier.data.priceId === row.id));
        }
        for (const field of ['eventId', 'majorEventId', 'priceId', 'ticketConfigId']) {
          if (row.data[field]) assert.ok(known.has(row.data[field]));
        }
      }
    });
    assert.ok(Math.max(...subscriptionFiles) < Math.min(...purchaseFiles));
  }
  assert.throws(
    () => exportTransferDocuments(secomppSnapshot(), { maxResources: 1 }),
    /price table and its first tier must fit in one import file/,
  );
  assert.throws(
    () => exportTransferDocuments(secomppSnapshot(), { maxBytes: 1200 }),
    /ticket configuration and its price options must fit in one import file/,
  );
});

test('stops when After cannot be represented without guessing its parent, price or purchase history', () => {
  const noParent = secomppSnapshot();
  noParent.events = noParent.events.filter((row) => row.sourceId !== 10);
  assert.throws(() => exportTransferDocuments(noParent), /one unambiguous SECOMPP26 main event/);
  const ambiguous = secomppSnapshot();
  ambiguous.activities.push({ ...ambiguous.activities.find((row) => row.sourceId === 22), sourceId: 23 });
  assert.throws(() => exportTransferDocuments(ambiguous), /exactly one source activity/);
  const badDate = secomppSnapshot();
  badDate.registrations.find((row) => row.sourceId === 70).createdAt = null;
  assert.throws(() => exportTransferDocuments(badDate), /historical purchase timestamp/);
  assert.throws(() => exportTransferDocuments(secomppSnapshot(), { eventMappings: [] }), /automatic catalog export/);
});

test('exports structured locations directly in version 1 documents', () => {
  const source = snapshot();
  source.activities[0].location = 'Auditório - Bloco 5 - Térreo';
  source.activities[1].location = 'Evento on-line';
  const result = exportTransferDocuments(source);
  for (const { document } of result.documents) {
    assert.equal(document.version, 1);
    assert.equal(document.$schema, 'urn:cacic:event-data:v1');
  }
  const events = allResources(result).filter((row) => row.kind === 'event');
  const physicalEvent = events.find((row) => row.data.name === source.activities[0].name);
  const onlineEvent = events.find((row) => row.data.name === source.activities[1].name);
  assert.equal(physicalEvent.data.locationName, 'Auditório');
  assert.equal(physicalEvent.data.locationDescription, 'Bloco 5 - Térreo');
  assert.equal(physicalEvent.data.isVirtual, false);
  assert.equal(onlineEvent.data.locationName, null);
  assert.equal(onlineEvent.data.locationDescription, null);
  assert.equal(onlineEvent.data.isVirtual, true);
});

test('exports catalog, modality tiers, active registrations, activity selections, and attendance', () => {
  const source = snapshot();
  const result = exportTransferDocuments(source, { sourceNamespace: 'evcomp-test' });
  const resources = allResources(result);
  const { parseTransferDocument } = loadTransferContract();

  assert.equal(result.documents.length, 1);
  assert.equal(parseTransferDocument(result.documents[0].document), result.documents[0].document);
  assert.equal(resources.filter((item) => item.kind === 'major-event').length, 1);
  assert.equal(resources.filter((item) => item.kind === 'event').length, 2);
  assert.equal(resources.filter((item) => item.kind === 'major-event-price').length, 1);
  assert.equal(resources.filter((item) => item.kind === 'price-tier').length, 2);
  assert.equal(resources.filter((item) => item.kind === 'major-event-subscription').length, 4);
  assert.equal(resources.filter((item) => item.kind === 'event-attendance').length, 2);

  const majorEvent = resources.find((item) => item.kind === 'major-event');
  assert.equal(majorEvent.data.name, 'Source major event');
  assert.equal(majorEvent.data.isPaymentRequired, true);
  assert.equal(majorEvent.data.buttonLink, 'https://example.test/event');
  assert.equal(resources.find((item) => item.kind === 'major-event-price').data.majorEventId, majorEvent.id);

  const activityIds = new Map(
    resources.filter((item) => item.kind === 'event').map((item) => [item.data.name, item.id]),
  );
  for (const event of resources.filter((item) => item.kind === 'event')) {
    assert.equal(event.data.majorEventId, majorEvent.id);
    assert.equal(event.data.type, 'OTHER');
    assert.equal(event.data.allowSubscription, true);
  }
  const studentTier = resources.find((item) => item.kind === 'price-tier' && item.data.name === 'Student');
  assert.equal(studentTier.data.value, 1990);
  assert.equal(studentTier.data.includesEventRegistration, true);
  assert.equal(studentTier.data.includesSportsRegistration, false);

  const subscriptions = resources.filter((item) => item.kind === 'major-event-subscription');
  const paid = subscriptions.find(
    (item) => item.data.paymentTier === 'Student' && item.data.subscriptionStatus === 'CONFIRMED',
  );
  assert.equal(paid.data.subscriptionStatus, 'CONFIRMED');
  assert.equal(paid.data.amountPaid, 1990);
  assert.deepEqual(
    [...paid.data.selectedEventIds].sort(),
    [activityIds.get('First activity'), activityIds.get('Second activity')].sort(),
  );
  assert.equal('paymentDate' in paid.data, false);
  assert.equal('createdAt' in paid.data, false);
  assert.deepEqual(paid.data.person, { name: 'Ada Example', email: 'ada@example.test', academicId: 'A-100' });

  const exempt = subscriptions.find((item) => item.data.paymentTier === 'Exempt');
  assert.equal(exempt.data.amountPaid, 0);
  assert.deepEqual(exempt.data.selectedEventIds, []);
  assert.ok(subscriptions.some((item) => item.data.subscriptionStatus === 'REJECTED_GENERIC'));
  assert.ok(subscriptions.some((item) => item.data.subscriptionStatus === 'WAITING_RECEIPT_UPLOAD'));
  assert.deepEqual(result.report.registrationStatusCounts, {
    CONFIRMED: 2,
    WAITING_RECEIPT_UPLOAD: 1,
    REJECTED_GENERIC: 1,
  });

  const attendance = resources.filter((item) => item.kind === 'event-attendance');
  assert.deepEqual(new Set(attendance.map((item) => item.data.status)), new Set(['PRESENT', 'ABSENT']));
  assert.equal(
    attendance.find((item) => item.data.status === 'PRESENT').data.eventId,
    activityIds.get('First activity'),
  );
  assert.equal(
    resources.some((item) => item.kind === 'event-subscription'),
    false,
  );

  const issueCodes = new Set(result.report.issues.map((issue) => issue.code));
  assert.equal(issueCodes.has('inactive_registration_skipped'), false);
  assert.ok(issueCodes.has('lecturers_not_exported'));
  assert.ok(issueCodes.has('lecturer_hours_not_exported'));
  assert.ok(issueCodes.has('payment_proof_content_not_exported'));
  assert.ok(issueCodes.has('issued_certificates_not_exported'));
  assert.equal(JSON.stringify(result.report).includes('ada@example.test'), false);
  assert.equal(result.report.paymentSummary.sourceRows, 4);
  assert.equal(result.report.paymentSummary.submittedRecords, 2);
  assert.equal(result.report.paymentSummary.approvedAmountsExported, 1);
  assert.equal(result.report.paymentSummary.exemptAmountsExported, 1);
  assert.deepEqual(result.report.skippedCounts, {});
  assert.equal(result.report.sourceCounts.registrations, 4);
  assert.equal(result.report.sourceCounts.registrationActivityRows, 5);

  const repeated = exportTransferDocuments(source, { sourceNamespace: 'evcomp-test' });
  assert.deepEqual(repeated.documents, result.documents);
  const differentNamespace = allResources(exportTransferDocuments(source, { sourceNamespace: 'evcomp-other' }));
  assert.notEqual(differentNamespace.find((item) => item.kind === 'major-event').id, majorEvent.id);
});

test('uses concrete deterministic references across split files in dependency order', () => {
  const result = exportTransferDocuments(snapshot(), {
    sourceNamespace: 'evcomp-split',
    maxResources: 2,
  });
  const locationById = new Map();
  for (const [fileIndex, { document }] of result.documents.entries()) {
    for (const resource of document.resources) locationById.set(resource.id, fileIndex);
  }
  assert.ok(result.documents.length > 1);
  for (const [fileIndex, { document }] of result.documents.entries()) {
    for (const resource of document.resources) {
      const references = [
        resource.data.majorEventId,
        resource.data.priceId,
        resource.data.eventId,
        ...(resource.data.selectedEventIds ?? []),
      ].filter((value) => typeof value === 'string');
      for (const reference of references) {
        if (locationById.has(reference)) assert.ok(locationById.get(reference) <= fileIndex);
      }
      assert.ok(document.resources.length <= 2);
    }
  }
  const { TRANSFER_MAX_BYTES, TRANSFER_MAX_RESOURCES } = loadTransferContract();
  for (const { document } of result.documents) {
    assert.ok(document.resources.length <= TRANSFER_MAX_RESOURCES);
    assert.ok(Buffer.byteLength(`${JSON.stringify(document, null, 2)}\n`) <= TRANSFER_MAX_BYTES);
  }
});

test('uses explicit target mappings without exporting catalog records or leaking mapped person details', () => {
  const source = snapshot();
  const config = {
    sourceNamespace: 'evcomp-mapped',
    eventMappings: [{ sourceEventId: 10, targetMajorEventId: uuid(101) }],
    activityMappings: [
      { sourceActivityId: 20, targetEventId: uuid(201) },
      { sourceActivityId: 21, targetEventId: uuid(202) },
    ],
    modalityMappings: [
      { sourceModalityId: 30, targetPriceTierId: uuid(301) },
      { sourceModalityId: 31, targetPriceTierId: uuid(302) },
    ],
    personMappings: [{ sourcePersonId: 1, targetPersonId: uuid(401) }],
  };
  const resources = allResources(exportTransferDocuments(source, config));
  assert.equal(
    resources.some((item) => ['major-event', 'event', 'major-event-price', 'price-tier'].includes(item.kind)),
    false,
  );
  const mapped = resources.find(
    (item) => item.kind === 'major-event-subscription' && item.data.person.id === uuid(401),
  );
  assert.equal(mapped.data.majorEventId, uuid(101));
  assert.deepEqual(mapped.data.selectedEventIds.sort(), [uuid(201), uuid(202)].sort());
  assert.equal(mapped.data.paymentTier, 'Student');
  assert.equal('email' in mapped.data.person, false);
  assert.equal(resources.find((item) => item.kind === 'event-attendance').data.eventId, uuid(201));
});

test('embeds consistent creation-ready participants across split registrations and attendance', () => {
  const source = snapshot();
  source.people[0].name = '  Ada   Example  ';
  source.people.push({ sourceId: 5, name: 'Unreferenced Person', email: 'unused@example.test' });
  const result = exportTransferDocuments(source, { maxResources: 2 });
  const { transferPersonDataError } = loadTransferContract();
  const referencesByEmail = new Map();
  for (const { document } of result.documents) {
    for (const resource of document.resources) {
      const person = resource.data.person;
      if (!person) continue;
      assert.equal(transferPersonDataError(person), undefined);
      if (referencesByEmail.has(person.email)) {
        assert.deepEqual(person, referencesByEmail.get(person.email));
      }
      referencesByEmail.set(person.email, person);
    }
  }
  assert.equal(referencesByEmail.get('ada@example.test').name, 'Ada Example');
  assert.equal(referencesByEmail.has('unused@example.test'), false);
  assert.deepEqual(result.report.personSummary, {
    referenced: 4,
    explicitlyMapped: 0,
    withCreationData: 4,
    requiringDataReview: 0,
  });
});

test('includes creation data for participants referenced only by attendance', () => {
  const source = snapshot({ registrations: [], payments: [] });
  const result = exportTransferDocuments(source);
  const attendance = allResources(result).find(
    (item) => item.kind === 'event-attendance' && item.data.person.email === 'ada@example.test',
  );
  assert.deepEqual(attendance.data.person, {
    name: 'Ada Example',
    email: 'ada@example.test',
    academicId: 'A-100',
  });
  assert.equal(result.report.personSummary.withCreationData, 2);
});

test('reports incomplete creation data without inventing identifiers or discarding matchable participants', () => {
  const source = snapshot();
  source.people[0].name = 'Ada';
  source.people[1].name = '';
  source.people[2] = { sourceId: 3, name: 'Caio Example', email: 'invalid', academicId: '' };
  source.people[3] = { sourceId: 4, name: 'Dani Example', email: 'invalid', academicId: 'D-400' };
  const result = exportTransferDocuments(source);
  const subscriptions = allResources(result).filter((item) => item.kind === 'major-event-subscription');
  assert.equal(subscriptions.length, 4);
  const ada = subscriptions.find((item) => item.data.person.email === 'ada@example.test').data.person;
  assert.equal(ada.name, 'Ada');
  const bia = subscriptions.find((item) => item.data.person.email === 'bia@example.test').data.person;
  assert.equal('name' in bia, false);
  const caio = subscriptions.find((item) => item.data.person.name === 'Caio Example').data.person;
  assert.deepEqual(caio, { name: 'Caio Example' });
  const dani = subscriptions.find((item) => item.data.person.name === 'Dani Example').data.person;
  assert.deepEqual(dani, { name: 'Dani Example', academicId: 'D-400' });
  assert.equal(result.report.personSummary.requiringDataReview, 3);
  assert.equal(result.report.personSummary.withCreationData, 1);
  assert.equal(result.report.issues.filter((issue) => issue.code === 'person_creation_data_incomplete').length, 3);
});

test('explicit person mappings stay ID-only even when source creation data is incomplete', () => {
  const source = snapshot();
  source.people[0] = { sourceId: 1, name: '', email: '', academicId: '' };
  const result = exportTransferDocuments(source, {
    personMappings: [{ sourcePersonId: 1, targetPersonId: uuid(401) }],
  });
  const mapped = allResources(result).filter((item) => item.data.person?.id === uuid(401));
  assert.equal(mapped.length, 2);
  for (const item of mapped) assert.deepEqual(item.data.person, { id: uuid(401) });
  assert.equal(result.report.personSummary.explicitlyMapped, 1);
  assert.equal(result.report.personSummary.withCreationData, 3);
  assert.equal(
    result.report.issues.some((issue) => issue.code === 'person_creation_data_incomplete'),
    false,
  );
});

test('does not infer payment from applied amount and reports inactive registrations', () => {
  const source = snapshot({ payments: [] });
  const result = exportTransferDocuments(source);
  const subscriptions = allResources(result).filter((item) => item.kind === 'major-event-subscription');
  const student = subscriptions.find((item) => item.data.paymentTier === 'Student');
  assert.equal(student.data.subscriptionStatus, 'CONFIRMED');
  assert.equal('amountPaid' in student.data, false);
  assert.ok(result.report.issues.some((issue) => issue.code === 'payment_status_unavailable'));
  assert.ok(result.report.issues.some((issue) => issue.code === 'inactive_registration_skipped'));
  assert.equal(
    subscriptions.some((item) => item.data.subscriptionStatus === 'WAITING_RECEIPT_UPLOAD'),
    false,
  );
  assert.deepEqual(result.report.skippedCounts, { registration: 2 });
});

test('keeps separate people when shared email is disambiguated by academic ID', () => {
  const source = snapshot({
    people: [
      { sourceId: 1, name: 'First Person', email: 'shared@example.test', academicId: 'A-100' },
      { sourceId: 2, name: 'Second Person', email: 'shared@example.test', academicId: 'B-200' },
    ],
    registrations: [
      {
        sourceId: 70,
        sourcePersonId: 1,
        sourceEventId: 10,
        sourceModalityId: null,
        createdAt: new Date(),
        active: true,
        sourceActivityId: null,
      },
      {
        sourceId: 71,
        sourcePersonId: 2,
        sourceEventId: 10,
        sourceModalityId: null,
        createdAt: new Date(),
        active: true,
        sourceActivityId: null,
      },
    ],
    attendances: [],
    payments: [],
  });
  const subscriptions = allResources(exportTransferDocuments(source)).filter(
    (item) => item.kind === 'major-event-subscription',
  );
  assert.equal(subscriptions.length, 2);
  assert.deepEqual(subscriptions.map((item) => item.data.person.academicId).sort(), ['A-100', 'B-200']);
});

test('splits by the pretty-printed byte limit and rejects mappings that cannot resolve the catalog safely', () => {
  const source = snapshot({
    events: [{ ...snapshot().events[0], description: 'x'.repeat(400) }],
  });
  const result = exportTransferDocuments(source, { maxBytes: 1200 });
  assert.ok(result.documents.length > 1);
  for (const { document } of result.documents) {
    assert.ok(Buffer.byteLength(`${JSON.stringify(document, null, 2)}\n`) <= 1200);
  }
  assert.throws(
    () =>
      exportTransferDocuments(snapshot(), {
        modalityMappings: [{ sourceModalityId: 30, targetPriceTierId: uuid(301) }],
      }),
    /require explicit eventMappings or activityMappings/,
  );
});

test('reports the discarded registration and attendance for either duplicate order', () => {
  for (const newerFirst of [false, true]) {
    const source = snapshot();
    const registration = source.registrations[0];
    const attendance = source.attendances[0];
    const newerRegistration = {
      ...registration,
      sourceId: 90,
      sourceActivityId: null,
      createdAt: new Date(Date.now() - 3_600_000),
    };
    const newerAttendance = { ...attendance, sourceId: 91, recordedAt: new Date(Date.now() + 100 * 3_600_000) };
    source.registrations = newerFirst ? [newerRegistration, registration] : [registration, newerRegistration];
    source.attendances = newerFirst ? [newerAttendance, attendance] : [attendance, newerAttendance];
    const result = exportTransferDocuments(source, { sourceNamespace: 'evcomp-test' });
    for (const [code, sourceId] of [
      ['duplicate_source_registration', '40'],
      ['duplicate_attendance', '50'],
    ]) {
      assert.deepEqual(
        result.report.issues
          .filter((issue) => issue.code === code)
          .map((issue) => ({ sourceId: issue.sourceId, skipped: issue.skipped })),
        [{ sourceId, skipped: true }],
      );
    }
    const resources = allResources(result);
    assert.deepEqual(resources.find((row) => row.kind === 'major-event-subscription').data.selectedEventIds, []);
    assert.equal(
      resources.find((row) => row.kind === 'event-attendance').data.attendedAt,
      newerAttendance.recordedAt.toISOString(),
    );
  }
});

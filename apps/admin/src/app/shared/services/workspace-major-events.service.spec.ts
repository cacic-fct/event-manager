import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { MajorEvent, MajorEventInput } from '../../graphql/models';
import { PublicationApiService } from '../../graphql/publishing-api.service';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';

describe('WorkspaceMajorEventsService', () => {
  let service: WorkspaceMajorEventsService;
  let lastPayload: MajorEventInput | null;
  let api: {
    createMajorEvent: ReturnType<typeof vi.fn>;
    getMajorEvent: ReturnType<typeof vi.fn>;
    updateMajorEvent: ReturnType<typeof vi.fn>;
    listMajorEvents: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    lastPayload = null;
    api = {
      createMajorEvent: vi.fn((payload: MajorEventInput) => {
        lastPayload = payload;
        return of(createMajorEvent(payload));
      }),
      getMajorEvent: vi.fn(),
      updateMajorEvent: vi.fn((id: string, payload: MajorEventInput) => {
        lastPayload = payload;
        return of(createMajorEvent({ ...payload, id }));
      }),
      listMajorEvents: vi.fn(() => of([])),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspaceMajorEventsService,
        { provide: MajorEventApiService, useValue: api },
        { provide: EventApiService, useValue: { listEvents: vi.fn(() => of([])) } },
        { provide: PublicationApiService, useValue: { setPublicationState: vi.fn(() => of({ ok: true })) } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: WorkspacePermissionsService, useValue: { hasAll: vi.fn(() => true) } },
      ],
    }).compileComponents();

    service = TestBed.inject(WorkspaceMajorEventsService);
    service.majorEventForm.patchValue({
      name: 'SECOMPP26',
      emoji: '😀',
      startDate: '2026-05-15T00:00',
      endDate: '2026-05-20T00:00',
      isPaymentRequired: true,
    });
  });

  it('posts a single price entered as a number input value', async () => {
    service.priceTiers.at(0).controls.value.setValue(40 as unknown as string);

    await service.saveMajorEvent();

    expect(lastPayload?.price).toEqual({
      type: 'SINGLE',
      tiers: [{ name: 'Preço único', value: 4000 }],
    });
  });

  it('posts tiered participant prices', async () => {
    service.majorEventForm.controls.priceType.setValue('TIERED');
    service.priceTiers.at(0).setValue({ name: 'Aluno', value: '40' });
    service.addPriceTier();
    service.priceTiers.at(1).setValue({ name: 'Professor', value: '60.50' });

    await service.saveMajorEvent();

    expect(lastPayload?.price).toEqual({
      type: 'TIERED',
      tiers: [
        { name: 'Aluno', value: 4000 },
        { name: 'Professor', value: 6050 },
      ],
    });
  });

  it('loads the stored single price into the edit form', async () => {
    api.getMajorEvent.mockReturnValue(
      of(
        createMajorEvent({
          id: 'major-event-1',
          name: 'SECOMPP26',
          emoji: '😀',
          startDate: '2026-05-15T03:00:00.000Z',
          endDate: '2026-05-20T03:00:00.000Z',
          isPaymentRequired: true,
          price: {
            type: 'SINGLE',
            tiers: [{ name: 'Preço único', value: 3000 }],
          },
        }),
      ),
    );

    await service.pickMajorEventById('major-event-1');

    expect(service.majorEventForm.controls.priceType.value).toBe('SINGLE');
    expect(service.priceTiers.length).toBe(1);
    expect(service.priceTiers.at(0).getRawValue()).toEqual({ name: 'Preço único', value: '30.00' });
  });

  it('loads the stored tiered prices into the edit form', async () => {
    api.getMajorEvent.mockReturnValue(
      of(
        createMajorEvent({
          id: 'major-event-1',
          name: 'SECOMPP26',
          emoji: '😀',
          startDate: '2026-05-15T03:00:00.000Z',
          endDate: '2026-05-20T03:00:00.000Z',
          isPaymentRequired: true,
          price: {
            type: 'TIERED',
            tiers: [
              { name: 'Aluno', value: 3000 },
              { name: 'Professor', value: 6050 },
            ],
          },
        }),
      ),
    );

    await service.pickMajorEventById('major-event-1');

    expect(service.majorEventForm.controls.priceType.value).toBe('TIERED');
    expect(service.priceTiers.getRawValue()).toEqual([
      { name: 'Aluno', value: '30.00' },
      { name: 'Professor', value: '60.50' },
    ]);
  });
});

function createMajorEvent(input: MajorEventInput): MajorEvent {
  return {
    id: input.id ?? 'major-event-1',
    name: input.name ?? 'Major event',
    emoji: input.emoji ?? '😀',
    startDate: input.startDate ?? '2026-05-15T03:00:00.000Z',
    endDate: input.endDate ?? '2026-05-20T03:00:00.000Z',
    description: input.description,
    subscriptionStartDate: input.subscriptionStartDate,
    subscriptionEndDate: input.subscriptionEndDate,
    maxCoursesPerAttendee: input.maxCoursesPerAttendee,
    maxLecturesPerAttendee: input.maxLecturesPerAttendee,
    buttonText: input.buttonText,
    buttonLink: input.buttonLink,
    contactInfo: input.contactInfo,
    contactType: input.contactType,
    isPaymentRequired: input.isPaymentRequired ?? false,
    publicationState: 'DRAFT',
    shouldIssueCertificateForNonPayingAttendees: input.shouldIssueCertificateForNonPayingAttendees ?? false,
    shouldIssueCertificateForNonSubscribedAttendees: input.shouldIssueCertificateForNonSubscribedAttendees ?? false,
    additionalPaymentInfo: input.additionalPaymentInfo,
    paymentInfo: null,
    majorEventPrices: input.price
      ? [
          {
            id: 'major-event-price-1',
            type: input.price.type,
            tiers: input.price.tiers.map((tier, index) => ({
              id: `price-tier-${index + 1}`,
              name: tier.name,
              value: tier.value,
            })),
          },
        ]
      : [],
    createdAt: '2026-05-15T03:00:00.000Z',
    updatedAt: '2026-05-15T03:00:00.000Z',
  };
}

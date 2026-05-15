import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { MajorEvent, MajorEventInput } from '../../graphql/models';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';

describe('WorkspaceMajorEventsService', () => {
  let service: WorkspaceMajorEventsService;
  let lastPayload: MajorEventInput | null;
  let api: {
    createMajorEvent: ReturnType<typeof vi.fn>;
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
        { provide: EventApiService, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
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
    shouldIssueCertificateForNonPayingAttendees: input.shouldIssueCertificateForNonPayingAttendees ?? false,
    shouldIssueCertificateForNonSubscribedAttendees: input.shouldIssueCertificateForNonSubscribedAttendees ?? false,
    additionalPaymentInfo: input.additionalPaymentInfo,
    paymentInfo: null,
    majorEventPrices: [],
    createdAt: '2026-05-15T03:00:00.000Z',
    updatedAt: '2026-05-15T03:00:00.000Z',
  };
}

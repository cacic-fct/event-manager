import '@angular/compiler';
import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PrizeDrawApiService } from '../graphql/prize-draw-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrizeDrawPageComponent } from './prize-draw-page.component';

describe('PrizeDrawPageComponent', () => {
  let api: {
    get: ReturnType<typeof vi.fn>;
    eligibleEntries: ReturnType<typeof vi.fn>;
    spin: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let feedback: { error: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<PrizeDrawPageComponent>;

  beforeEach(async () => {
    api = {
      get: vi.fn(() => of(drawFixture())),
      eligibleEntries: vi.fn(() => of(entriesFixture())),
      spin: vi.fn(() => of(spinResult())),
    };
    dialog = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };
    feedback = { error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PrizeDrawPageComponent],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: PrizeDrawApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
        { provide: AdminFeedbackService, useValue: feedback },
        { provide: PermissionsService, useValue: { has: vi.fn(() => true) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (name: string) => (name === 'drawId' ? 'draw-1' : null) },
              queryParamMap: { get: () => null },
            },
          },
        },
      ],
    })
      .overrideComponent(PrizeDrawPageComponent, { set: { template: '' } })
      .compileComponents();
    fixture = TestBed.createComponent(PrizeDrawPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads the draw and roster, computes the next planned label, and shortens reel names', () => {
    const component = fixture.componentInstance;
    expect(component.draw()?.id).toBe('draw-1');
    expect(component.entries()).toEqual(entriesFixture());
    expect(component.reelNames()).toEqual(['Ada L.', 'Convidada']);
    expect(component.canDraw()).toBe(true);
    expect(component.nextSpinLabel()).toBe('Primeiro prêmio');
    expect(component.loading()).toBe(false);
  });

  it('submits reduced-motion intent, presents the result, and reloads a real committed spin', async () => {
    const component = fixture.componentInstance;
    component.reducedMotion.set(true);

    await component.run(false);

    expect(api.spin).toHaveBeenCalledWith({ drawId: 'draw-1', demo: false, reducedMotion: true });
    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          result: spinResult(),
          reducedMotion: true,
          publicDrawUrl: expect.stringContaining('/app/draws/event/event-1#draw-draw-1'),
        }),
      }),
    );
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.eligibleEntries).toHaveBeenCalledTimes(2);
    expect(component.requesting()).toBe(false);
  });

  it('does not reload after a demo and contains backend rejection before presentation', async () => {
    const component = fixture.componentInstance;
    api.spin.mockReturnValueOnce(of(spinResult({ demo: true, spinId: null, sequence: null })));
    await component.run(true);
    expect(api.get).toHaveBeenCalledOnce();

    api.spin.mockReturnValueOnce(throwError(() => new Error('conflict')));
    await component.run(false);
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(feedback.error).toHaveBeenCalledWith(
      expect.any(Error),
      'O backend não confirmou o resultado. Nenhuma animação foi iniciada.',
    );
    expect(component.requesting()).toBe(false);
  });

  it('blocks operation after the configured limit or when the roster is empty', () => {
    const component = fixture.componentInstance;
    component.draw.set(drawFixture({ spins: [{ id: 'spin-1', undoneAt: null }] }));
    expect(component.canDraw()).toBe(false);
    component.draw.set(drawFixture({ eligibleEntrantCount: 0 }));
    expect(component.canDraw()).toBe(false);
  });
});

function entriesFixture() {
  return [
    { identityKey: 'person:1', personId: 'person-1', displayName: 'Ada Lovelace', weight: 1, sources: ['ATTENDANCE'] },
    { identityKey: 'manual:1', personId: null, displayName: 'Convidada', weight: 1, sources: ['MANUAL'] },
  ] as never;
}

function drawFixture(patch: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: 'draw-1',
    title: 'Kit CACiC',
    description: null,
    target: { type: 'EVENT', id: 'event-1', name: 'Evento' },
    includePresent: true,
    includeSubscribers: false,
    includeManualEntries: true,
    chanceMode: 'EQUAL',
    spinLimit: 1,
    removeWinnerAfterDraw: true,
    defaultSpeed: 'INSTANT',
    dramaticCountdownSeconds: 3,
    notifyWinner: false,
    frozenAt: null,
    unfrozenAt: null,
    revision: 1,
    plannedSpins: [
      { id: 'planned-1', position: 1, description: 'Primeiro prêmio', speed: 'INSTANT', countdownSeconds: null },
    ],
    manualEntries: [],
    weightOverrides: [],
    excludedPeople: [],
    spins: [],
    eligibleEntrantCount: 2,
    eligibleTotalWeight: 2,
    eligibleDuplicateEntryCount: 0,
    createdAt: now,
    updatedAt: now,
    ...patch,
  } as never;
}

function spinResult(patch: Record<string, unknown> = {}) {
  return {
    demo: false,
    drawId: 'draw-1',
    spinId: 'spin-1',
    sequence: 1,
    drawTitle: 'Kit CACiC',
    spinDescription: 'Primeiro prêmio',
    winnerFullName: 'Ada Lovelace',
    winnerReelName: 'Ada L.',
    winnerReelIndex: 0,
    reelNames: ['Ada L.', 'Convidada'],
    speed: 'INSTANT',
    countdownMs: 0,
    reelDurationMs: 0,
    preRevealPauseMs: 0,
    hasMoreSpins: false,
    ...patch,
  } as never;
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { EventTargetPickerComponent } from './event-target-picker.component';
import { createAdminEvent, createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import { Subject, of } from 'rxjs';

describe('EventTargetPickerComponent', () => {
  let fixture: ComponentFixture<EventTargetPickerComponent>;
  let eventApi: { listEvents: ReturnType<typeof vi.fn> };
  let majorEventApi: { listMajorEvents: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    eventApi = { listEvents: vi.fn(() => of([])) };
    majorEventApi = { listMajorEvents: vi.fn(() => of([])) };

    await TestBed.configureTestingModule({
      imports: [EventTargetPickerComponent],
      providers: [
        { provide: EventApiService, useValue: eventApi },
        { provide: MajorEventApiService, useValue: majorEventApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventTargetPickerComponent);
    fixture.componentRef.setInput('targetType', 'EVENT');
    fixture.componentRef.setInput('label', 'Evento');
    fixture.detectChanges();
  });

  it('pages beyond the first twenty targets and emits the selected owner or link target', async () => {
    fixture.componentRef.setInput('includePast', true);
    const firstPage = Array.from({ length: 21 }, (_, index) =>
      createAdminEvent({ id: `event-${index}`, name: `Evento ${index}` }),
    );
    const overlap = firstPage[20];
    if (!overlap) throw new Error('Expected the first page lookahead target.');
    const secondPageTarget = createAdminEvent({ id: 'event-21', name: 'Evento 21' });
    eventApi.listEvents
      .mockReturnValueOnce(of(firstPage))
      .mockReturnValueOnce(of([overlap, secondPageTarget]));
    const selection = vi.fn();
    fixture.componentInstance.targetChange.subscribe(selection);

    await fixture.componentInstance.search();
    expect(eventApi.listEvents).toHaveBeenNthCalledWith(1, { query: undefined, skip: 0, take: 21 });
    expect(fixture.componentInstance.pagination.hasNextPage()).toBe(true);

    await fixture.componentInstance.nextPage();
    expect(eventApi.listEvents).toHaveBeenNthCalledWith(2, { query: undefined, skip: 20, take: 21 });
    expect(fixture.componentInstance.results()).toEqual([overlap, secondPageTarget]);

    fixture.componentInstance.select(secondPageTarget);
    expect(selection).toHaveBeenCalledWith({ id: 'event-21', name: 'Evento 21', emoji: secondPageTarget.emoji });
  });

  it('ignores a stale target search when a newer query completes first', async () => {
    fixture.componentRef.setInput('includePast', true);
    const staleResponse = new Subject<ReturnType<typeof createAdminEvent>[]>();
    const currentTarget = createAdminEvent({ id: 'event-current', name: 'Atual' });
    const currentResponse = new Subject<ReturnType<typeof createAdminEvent>[]>();
    eventApi.listEvents.mockReturnValueOnce(staleResponse).mockReturnValueOnce(currentResponse);

    fixture.componentInstance.query.setValue('antigo', { emitEvent: false });
    const staleSearch = fixture.componentInstance.search();
    fixture.componentInstance.query.setValue('atual', { emitEvent: false });
    const currentSearch = fixture.componentInstance.search();

    currentResponse.next([currentTarget]);
    currentResponse.complete();
    await currentSearch;
    staleResponse.next([createAdminEvent({ id: 'event-stale', name: 'Antigo' })]);
    staleResponse.complete();
    await staleSearch;

    expect(fixture.componentInstance.results()).toEqual([currentTarget]);
  });

  it('starts a new query from the first page after paging', async () => {
    fixture.componentRef.setInput('includePast', true);
    eventApi.listEvents
      .mockReturnValueOnce(of(Array.from({ length: 21 }, (_, index) => createAdminEvent({ id: `event-${index}` }))))
      .mockReturnValueOnce(of([createAdminEvent({ id: 'event-21', name: 'Evento 21' })]))
      .mockReturnValueOnce(of([createAdminEvent({ id: 'event-search', name: 'Resultado da busca' })]));

    await fixture.componentInstance.search();
    await fixture.componentInstance.nextPage();
    fixture.componentInstance.query.setValue('resultado', { emitEvent: false });
    await fixture.componentInstance.applySearch();

    expect(eventApi.listEvents).toHaveBeenNthCalledWith(3, { query: 'resultado', skip: 0, take: 21 });
    expect(fixture.componentInstance.pagination.pageIndex()).toBe(0);
  });

  it('uses the same bounded search contract for major-event targets', async () => {
    fixture.componentRef.setInput('includePast', true);
    const target = createAdminMajorEvent({ id: 'major-event-21', name: 'Grande evento 21' });
    majorEventApi.listMajorEvents.mockReturnValueOnce(of([target]));
    fixture.componentRef.setInput('targetType', 'MAJOR_EVENT');
    fixture.detectChanges();

    await fixture.componentInstance.search();

    expect(majorEventApi.listMajorEvents).toHaveBeenCalledWith({ query: undefined, skip: 0, take: 21 });
    expect(fixture.componentInstance.results()).toEqual([target]);
  });

  it('returns focus to the persistent selection toggle after choosing a target', async () => {
    const target = createAdminEvent({ id: 'event-focus', name: 'Evento com foco' });
    fixture.componentInstance.select(target);
    await Promise.resolve();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('button'));
  });

  it('includes historical targets for prize draws while retaining the form default', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const event = createAdminEvent({ id: 'past-event', startDate: past, endDate: past });
    eventApi.listEvents.mockReturnValue(of([event]));
    await fixture.componentInstance.search();
    expect(fixture.componentInstance.results()).toEqual([]);
    fixture.componentRef.setInput('includePast', true);
    await fixture.componentInstance.applySearch();
    expect(fixture.componentInstance.results()).toEqual([event]);
  });
});

import { FormControl, FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { flushAsync } from '../testing/async-test-helpers';
import { AttendancesService } from './attendances.service';
import { AttendancesPageComponent } from './attendances-page.component';

describe('AttendancesPageComponent', () => {
  const params = new BehaviorSubject(convertToParamMap({}));
  let fixture: ComponentFixture<AttendancesPageComponent>;
  let workspace: {
    majorEventAttendanceForm: FormGroup<{ majorEventId: FormControl<string> }>;
    closeAttendanceLiveStream: ReturnType<typeof vi.fn>;
    selectAttendanceEventById: ReturnType<typeof vi.fn>;
    selectMajorEventAttendancesById: ReturnType<typeof vi.fn>;
    selectMajorEventUserAttendanceById: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    params.next(convertToParamMap({}));
    workspace = {
      majorEventAttendanceForm: new FormGroup({ majorEventId: new FormControl('', { nonNullable: true }) }),
      closeAttendanceLiveStream: vi.fn(),
      selectAttendanceEventById: vi.fn(),
      selectMajorEventAttendancesById: vi.fn(),
      selectMajorEventUserAttendanceById: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AttendancesPageComponent],
      providers: [
        { provide: AttendancesService, useValue: workspace },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    })
      .overrideComponent(AttendancesPageComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(AttendancesPageComponent);
    fixture.detectChanges();
  });

  it('loads the actual event or major event from compatible deep links', async () => {
    params.next(convertToParamMap({ eventId: 'selected-event' }));
    await flushAsync();
    expect(fixture.componentInstance.context()).toEqual({ kind: 'event', id: 'selected-event' });
    expect(workspace.selectAttendanceEventById).toHaveBeenCalledWith('selected-event');
    params.next(convertToParamMap({ majorEventId: 'selected-major' }));
    await flushAsync();
    expect(fixture.componentInstance.context()).toEqual({ kind: 'major-event', id: 'selected-major' });
    expect(workspace.selectMajorEventAttendancesById).toHaveBeenCalledWith('selected-major', false);
  });

  it('loads a person bookmark after the major event without rewriting the route', async () => {
    params.next(convertToParamMap({ majorEventId: 'selected-major', personId: 'off-page-person' }));
    await flushAsync();
    expect(workspace.selectMajorEventUserAttendanceById).toHaveBeenCalledWith('selected-major', 'off-page-person');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    params.next(convertToParamMap({ majorEventId: 'selected-major' }));
    await flushAsync();
    expect(workspace.selectMajorEventAttendancesById).toHaveBeenCalledTimes(2);
    expect(workspace.selectMajorEventUserAttendanceById).toHaveBeenCalledOnce();
  });

  it('starts with a context choice instead of automatically selecting an entity category', () => {
    expect(fixture.componentInstance.context()).toBeNull();
    expect(workspace.selectAttendanceEventById).not.toHaveBeenCalled();
    expect(workspace.selectMajorEventAttendancesById).not.toHaveBeenCalled();
  });

  it('closes the attendance live stream when the tab is destroyed', () => {
    workspace.closeAttendanceLiveStream.mockClear();
    fixture.destroy();

    expect(workspace.closeAttendanceLiveStream).toHaveBeenCalledOnce();
  });
});

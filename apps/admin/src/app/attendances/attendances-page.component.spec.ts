import { FormControl, FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AttendancesService } from './attendances.service';
import { AttendancesPageComponent } from './attendances-page.component';

describe('AttendancesPageComponent', () => {
  let fixture: ComponentFixture<AttendancesPageComponent>;
  let workspace: {
    majorEventAttendanceForm: FormGroup<{ majorEventId: FormControl<string> }>;
    closeAttendanceLiveStream: ReturnType<typeof vi.fn>;
    selectAttendanceEventById: ReturnType<typeof vi.fn>;
    selectMajorEventAttendancesById: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    workspace = {
      majorEventAttendanceForm: new FormGroup({ majorEventId: new FormControl('', { nonNullable: true }) }),
      closeAttendanceLiveStream: vi.fn(),
      selectAttendanceEventById: vi.fn(),
      selectMajorEventAttendancesById: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AttendancesPageComponent],
      providers: [
        { provide: AttendancesService, useValue: workspace },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
      ],
    })
      .overrideComponent(AttendancesPageComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(AttendancesPageComponent);
    fixture.detectChanges();
  });

  it('closes the attendance live stream when the tab is destroyed', () => {
    fixture.destroy();

    expect(workspace.closeAttendanceLiveStream).toHaveBeenCalledOnce();
  });
});

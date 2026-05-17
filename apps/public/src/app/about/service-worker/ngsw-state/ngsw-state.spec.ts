import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NgswState } from './ngsw-state';

describe('NgswState', () => {
  let component: NgswState;
  let fixture: ComponentFixture<NgswState>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgswState],
      providers: [
        {
          provide: MatDialogRef,
          useValue: {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            close: () => {},
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NgswState);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

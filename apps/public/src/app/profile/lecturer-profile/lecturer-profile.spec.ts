import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { AttendancesApiService, LecturerProfile } from '../attendances/attendances-api.service';
import { LecturerProfileComponent } from './lecturer-profile';

const profile: LecturerProfile = {
  id: 'lecturer-profile-1',
  personId: 'person-1',
  displayName: 'Grace Hopper',
  biography: 'Pesquisadora e educadora.',
  publishGoogleUserPicture: true,
  googleUserPicture: 'https://example.com/grace.png',
  email: 'grace@example.com',
  whatsapp: '+5518999999999',
};

describe('LecturerProfileComponent', () => {
  let fixture: ComponentFixture<LecturerProfileComponent>;
  let component: LecturerProfileComponent;
  const upsertCurrentUserLecturerProfile = vi.fn();

  beforeEach(async () => {
    upsertCurrentUserLecturerProfile.mockReturnValue(of(profile));

    await TestBed.configureTestingModule({
      imports: [LecturerProfileComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal({
              preferredUsername: 'grace',
              claims: {
                name: 'Grace Hopper',
                picture: 'https://example.com/google.png',
              },
            }),
          },
        },
        {
          provide: AttendancesApiService,
          useValue: {
            getCurrentUserLecturerProfile: () => of(profile),
            upsertCurrentUserLecturerProfile,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LecturerProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('starts in read-only mode and enters editing through the edit button', () => {
    expect(component.isEditing()).toBe(false);

    component.edit();

    expect(component.isEditing()).toBe(true);
    expect(component.form.controls.displayName.value).toBe('Grace Hopper');
  });

  it('normalizes WhatsApp before saving', () => {
    component.edit();
    component.form.setValue({
      displayName: 'Grace Hopper',
      biography: 'Pesquisadora e educadora.',
      publishGoogleUserPicture: true,
      email: 'grace@example.com',
      whatsapp: '(18) 99999-9999',
    });

    component.save();

    expect(upsertCurrentUserLecturerProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsapp: '+5518999999999',
      }),
    );
  });
});

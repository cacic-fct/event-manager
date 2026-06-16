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
  googleUserPicture: 'https://lh3.googleusercontent.com/a/ACg8ocK=s96-c',
  email: 'grace@example.com',
  whatsapp: '+5518999999999',
};

const updatedProfile: LecturerProfile = {
  ...profile,
  displayName: 'Grace Brewster Hopper',
  biography: 'Criadora de linguagens e educadora.',
  email: 'hopper@example.com',
  whatsapp: '+5511888888888',
};

describe('LecturerProfileComponent', () => {
  let fixture: ComponentFixture<LecturerProfileComponent>;
  let component: LecturerProfileComponent;
  const upsertCurrentUserLecturerProfile = vi.fn();

  beforeEach(async () => {
    upsertCurrentUserLecturerProfile.mockReturnValue(of(updatedProfile));

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

  it('saves an empty biography as null', () => {
    component.edit();
    component.form.setValue({
      displayName: 'Grace Hopper',
      biography: '   ',
      publishGoogleUserPicture: true,
      email: 'grace@example.com',
      whatsapp: '',
    });

    component.save();

    expect(upsertCurrentUserLecturerProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        biography: null,
      }),
    );
  });

  it('requests higher quality Google profile pictures for preview display', () => {
    expect(component.googlePictureUrl('https://lh3.googleusercontent.com/a/ACg8ocK=s96-c')).toBe(
      'https://lh3.googleusercontent.com/a/ACg8ocK=s512-c',
    );
    expect(component.googlePictureUrl('https://lh3.googleusercontent.com/a-/ALV-UjV/s256/photo.jpg')).toBe(
      'https://lh3.googleusercontent.com/a-/ALV-UjV/s512/photo.jpg',
    );
  });

  it('updates the read-only preview after saving edited data', async () => {
    component.edit();
    component.form.setValue({
      displayName: 'Grace Brewster Hopper',
      biography: 'Criadora de linguagens e educadora.',
      publishGoogleUserPicture: true,
      email: 'hopper@example.com',
      whatsapp: '+55 11 88888-8888',
    });

    component.save();
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(component.isEditing()).toBe(false);
    expect(component.profilePreview()).toEqual(updatedProfile);
    expect(compiled.textContent).toContain('Grace Brewster Hopper');
    expect(compiled.textContent).toContain('Criadora de linguagens e educadora.');
    expect(compiled.textContent).toContain('hopper@example.com');
  });
});

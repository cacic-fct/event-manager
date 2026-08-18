import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SportsAthletePreparationPanel } from './athlete-preparation-panel';

describe('SportsAthletePreparationPanel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SportsAthletePreparationPanel, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows joining instructions and game identity fields only for the configured mode', () => {
    const fixture = TestBed.createComponent(SportsAthletePreparationPanel);
    fixture.componentRef.setInput('profiles', [
      {
        registrationMemberId: 'member-1',
        categoryId: 'category-1',
        categoryName: 'Valorant',
        categoryEmoji: '🎮',
        athleteIdentifierMode: 'GAME_ACCOUNT',
        joiningInstructions: 'Entre no lobby 15 minutos antes.',
        gameNickname: 'Rena',
        gameAccountName: 'Rena#BR1',
        gameAccountUrl: null,
      },
      {
        registrationMemberId: 'member-2',
        categoryId: 'category-2',
        categoryName: 'Futsal',
        categoryEmoji: '⚽',
        athleteIdentifierMode: 'SHIRT_NUMBER',
        joiningInstructions: 'Chegue uniformizado.',
        gameNickname: null,
        gameAccountName: null,
        gameAccountUrl: null,
      },
    ]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Prepare-se para jogar');
    expect(text).toContain('Valorant');
    expect(text).toContain('Futsal');
    expect(fixture.nativeElement.querySelectorAll('form')).toHaveLength(1);
  });

  it('requires the nickname and account name and accepts only HTTPS account links', () => {
    const fixture = TestBed.createComponent(SportsAthletePreparationPanel);
    const profile = {
      registrationMemberId: 'member-1',
      categoryId: 'category-1',
      categoryName: 'Valorant',
      categoryEmoji: '🎮',
      athleteIdentifierMode: 'GAME_ACCOUNT' as const,
      joiningInstructions: null,
      gameNickname: null,
      gameAccountName: null,
      gameAccountUrl: null,
    };
    fixture.componentRef.setInput('profiles', [profile]);
    fixture.detectChanges();

    const form = fixture.componentInstance.formFor(profile);
    expect(form.invalid).toBe(true);
    form.patchValue({ gameNickname: 'Rena', gameAccountName: 'Rena#BR1', gameAccountUrl: 'http://example.com' });
    expect(form.invalid).toBe(true);
    form.controls.gameAccountUrl.setValue('https://example.com/rena');
    expect(form.valid).toBe(true);
  });
});

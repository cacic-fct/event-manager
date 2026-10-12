import { TestBed } from '@angular/core/testing';
import { createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { SubscriptionTierSelection } from './tier-selection';

describe('tier benefits', () => {
  it('lists included benefits and keeps sports out of non-tournament events', async () => {
    await TestBed.configureTestingModule({ imports: [SubscriptionTierSelection] }).compileComponents();
    const fixture = TestBed.createComponent(SubscriptionTierSelection);
    fixture.componentRef.setInput('majorEvent', createPublicMajorEvent({ sportsTournament: null }));
    fixture.componentRef.setInput('tiers', [
      {
        id: 'participant',
        name: 'Participante',
        value: 3000,
        includesEventRegistration: true,
        includesSportsRegistration: false,
      },
    ]);
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Inscrição em eventos');
    expect(content).not.toMatch(/esport|torneio|não inclui/i);
  });

  it('shows only the grand-event benefit for a participation-only tier', async () => {
    await TestBed.configureTestingModule({ imports: [SubscriptionTierSelection] }).compileComponents();
    const fixture = TestBed.createComponent(SubscriptionTierSelection);
    fixture.componentRef.setInput('majorEvent', createPublicMajorEvent({ sportsTournament: { id: 'tournament' } }));
    fixture.componentRef.setInput('tiers', [
      {
        id: 'participant',
        name: 'Participante',
        value: 0,
        includesEventRegistration: false,
        includesSportsRegistration: false,
      },
    ]);
    fixture.componentRef.setInput('selectedName', 'Participante');
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Inscrição no grande evento');
    expect(content).toContain('Gratuito');
    expect(content).toContain('Esta modalidade não inclui inscrição em eventos.');
    expect(content).not.toMatch(/esport|torneio/i);
  });

  it('explains an empty whitelist and displays custom zero and unlimited quotas', async () => {
    await TestBed.configureTestingModule({ imports: [SubscriptionTierSelection] }).compileComponents();
    const fixture = TestBed.createComponent(SubscriptionTierSelection);
    fixture.componentRef.setInput('majorEvent', createPublicMajorEvent({ sportsTournament: null }));
    fixture.componentRef.setInput('events', []);
    fixture.componentRef.setInput('tiers', [
      {
        id: 'restricted',
        name: 'Sem eventos',
        value: 0,
        includesEventRegistration: true,
        includesSportsRegistration: false,
        restrictEventSelection: true,
        allowedEventIds: [],
        customizeSubscriptionLimits: true,
        maxCoursesPerAttendee: 0,
        maxLecturesPerAttendee: null,
        maxUncategorizedPerAttendee: 1,
      },
    ]);
    fixture.componentRef.setInput('selectedName', 'Sem eventos');
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Esta modalidade não tem eventos disponíveis para seleção.');
    expect(content).toContain('minicursos: não permitidos.');
    expect(content).toContain('palestras: sem limite.');
    expect(content).toContain('outros eventos: até 1.');
    expect(content).toContain('Esta modalidade não tem eventos disponíveis. Escolha outra modalidade para continuar.');
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

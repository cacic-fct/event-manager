import { TestBed } from '@angular/core/testing';
import { EmojiService, SubscriptionEventOptionComponent } from '@cacic-fct/shared-angular';

describe('SubscriptionEventOptionComponent', () => {
  it('shows a warning below the event and emits checkbox selection changes', async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionEventOptionComponent],
      providers: [{ provide: EmojiService, useValue: { getTwemojiUrl: () => '/emoji.svg' } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubscriptionEventOptionComponent);
    const selectionChange = vi.fn();
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    fixture.componentRef.setInput('option', {
      id: 'event-1',
      name: 'Atividade de exemplo',
      emoji: '🧠',
      description: 'Minicurso',
      startDate,
      endDate,
      availabilityLine: '2 vagas disponíveis. Próxima posição para nova inscrição na fila: 4',
    });
    fixture.componentRef.setInput('warningReason', 'Palestrante inscrito no próprio evento');
    fixture.componentInstance.selectionChange.subscribe(selectionChange);
    fixture.detectChanges();

    const warningLine = fixture.nativeElement.querySelector('.warning-reason') as HTMLElement;
    expect(warningLine.textContent).toContain('Palestrante inscrito no próprio evento');
    expect(warningLine.querySelector('mat-icon')?.textContent).toBe('warning');

    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.disabled).toBe(false);
    checkbox.click();
    fixture.detectChanges();

    expect(selectionChange).toHaveBeenCalledWith(true);
    expect(fixture.nativeElement.querySelector('.info-button')).toBeNull();
  });

  it('renders the INFO action only when requested', async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionEventOptionComponent],
      providers: [{ provide: EmojiService, useValue: { getTwemojiUrl: () => '/emoji.svg' } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubscriptionEventOptionComponent);
    fixture.componentRef.setInput('option', {
      id: 'event-1',
      name: 'Atividade de exemplo',
      emoji: '🧠',
      description: 'Minicurso',
      startDate: null,
      endDate: null,
      availabilityLine: 'Vagas ilimitadas',
    });
    fixture.componentRef.setInput('showInfoButton', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.info-button')).not.toBeNull();
  });
});

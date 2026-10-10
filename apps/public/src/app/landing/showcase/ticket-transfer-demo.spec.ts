import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TicketTransferDemoComponent } from './ticket-transfer-demo';

describe('TicketTransferDemoComponent', () => {
  let fixture: ComponentFixture<TicketTransferDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TicketTransferDemoComponent] }).compileComponents();

    fixture = TestBed.createComponent(TicketTransferDemoComponent);
    fixture.detectChanges();
  });

  function buttonNamed(name: string): HTMLButtonElement {
    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes(name));

    expect(button).toBeDefined();
    return button as HTMLButtonElement;
  }

  function renderedText(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  async function settleRender(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function expectFocusedHeading(text: string): void {
    const activeElement = (fixture.nativeElement as HTMLElement).ownerDocument.activeElement;
    expect(activeElement?.tagName).toBe('H3');
    expect(activeElement?.textContent).toContain(text);
  }

  it('shows both real-style identity summaries through distinct, focused transfer states', async () => {
    const component = fixture.componentInstance;
    const accepted = vi.fn();
    const back = vi.fn();
    const acceptedSubscription = component.accepted.subscribe(accepted);
    const backSubscription = component.back.subscribe(back);

    expect(fixture.nativeElement.querySelectorAll('app-ticket-person-summary')).toHaveLength(2);
    expect(renderedText()).toContain('MC');
    expect(renderedText()).toContain('RA');
    expect(renderedText()).toContain('Marina Costa');
    expect(renderedText()).toContain('Rafael Almeida');
    expect(renderedText()).toContain('às 14:00, no Auditório');
    expect(renderedText()).not.toContain('Auditório central');

    buttonNamed('Enviar bilhete').click();
    await settleRender();
    expect(component.step()).toBe('pending');
    expect(renderedText()).toContain('Pedido enviado');
    expect(renderedText()).toContain('Aguardando resposta.');
    expect(renderedText()).toContain('Marina Costa');
    expect(renderedText()).toContain('Rafael Almeida');
    expectFocusedHeading('Pedido enviado');

    buttonNamed('Ver recebimento').click();
    await settleRender();
    expect(component.step()).toBe('recipient');
    expect(renderedText()).toContain('Marina Costa quer transferir este bilhete');
    expect(renderedText()).toContain('Rafael Almeida');
    expectFocusedHeading('Marina Costa quer transferir este bilhete');

    buttonNamed('Receber bilhete').click();
    await settleRender();
    expect(component.step()).toBe('received');
    expect(renderedText()).toContain('Bilhete recebido');
    expect(renderedText()).toContain('Marina Costa');
    expect(renderedText()).toContain('Rafael Almeida');
    expectFocusedHeading('Bilhete recebido');
    expect(accepted).toHaveBeenCalledOnce();

    buttonNamed('Voltar à carteira').click();
    expect(back).toHaveBeenCalledOnce();
    acceptedSubscription.unsubscribe();
    backSubscription.unsubscribe();
  });

  it('opens the recipient view from an incoming notification', async () => {
    fixture.componentRef.setInput('incoming', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.step()).toBe('recipient');
    expect(renderedText()).toContain('Marina Costa quer transferir este bilhete');
    expect(renderedText()).toContain('Marina Costa');
    expect(renderedText()).toContain('Rafael Almeida');
    expect(fixture.nativeElement.querySelectorAll('app-ticket-person-summary')).toHaveLength(2);
    expectFocusedHeading('Marina Costa quer transferir este bilhete');
  });
});

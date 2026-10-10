import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReceiptDemoComponent } from './receipt-demo';

describe('ReceiptDemoComponent', () => {
  let fixture: ComponentFixture<ReceiptDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReceiptDemoComponent] }).compileComponents();
    fixture = TestBed.createComponent(ReceiptDemoComponent);
    fixture.detectChanges();
  });

  it('selects a supported file in the rendered form, emits submission, and exposes the pending state', () => {
    const submitted = vi.fn();
    const back = vi.fn();
    fixture.componentInstance.receiptSubmitted.subscribe(submitted);
    fixture.componentInstance.back.subscribe(back);

    expect(sendButton().disabled).toBe(true);
    clickButton('Voltar ao Meu dia');
    expect(back).toHaveBeenCalledOnce();

    const file = new File(['receipt'], 'comprovante.pdf', { type: 'application/pdf' });
    const readFile = vi.fn().mockResolvedValue('receipt contents');
    Object.defineProperty(file, 'text', { value: readFile });
    chooseFile(file);

    expect(fixture.nativeElement.textContent).toContain('comprovante.pdf');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(sendButton().disabled).toBe(false);

    sendButton().click();
    fixture.detectChanges();

    expect(submitted).toHaveBeenCalledOnce();
    expect(readFile).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Aguardando validação');
    expect(fixture.nativeElement.textContent).toContain('Comprovante enviado.');
  });

  it('shows validation errors and keeps submission disabled for unsupported and oversized files', () => {
    chooseFile(new File(['receipt'], 'comprovante.txt', { type: 'text/plain' }));

    expect(alertText()).toContain('PDF ou imagem');
    expect(sendButton().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('comprovante.txt');

    const oversized = new File(['receipt'], 'comprovante-grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { configurable: true, value: 15 * 1024 * 1024 + 1 });
    chooseFile(oversized);

    expect(alertText()).toContain('até 15 MB');
    expect(sendButton().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('comprovante-grande.pdf');
  });

  function chooseFile(file: File): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('Receipt file input is missing');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  function sendButton(): HTMLButtonElement {
    return buttonNamed('Enviar comprovante');
  }

  function clickButton(label: string): void {
    buttonNamed(label).click();
    fixture.detectChanges();
  }

  function buttonNamed(label: string): HTMLButtonElement {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim().includes(label));
    if (!button) throw new Error(`Receipt button not found: ${label}`);
    return button;
  }

  function alertText(): string {
    return fixture.nativeElement.querySelector('[role="alert"]')?.textContent?.trim() ?? '';
  }
});

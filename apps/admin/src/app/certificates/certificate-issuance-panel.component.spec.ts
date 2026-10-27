import { TestBed } from '@angular/core/testing';
import { CertificateIssuancePanelComponent } from './certificate-issuance-panel.component';

describe('CertificateIssuancePanelComponent', () => {
  async function setup() {
    await TestBed.configureTestingModule({ imports: [CertificateIssuancePanelComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CertificateIssuancePanelComponent);
    fixture.componentRef.setInput('saved', true);
    fixture.componentRef.setInput('canIssue', true);
    fixture.componentRef.setInput('canReissue', true);
    fixture.detectChanges();
    const requested = vi.fn();
    fixture.componentInstance.issuanceRequested.subscribe(requested);
    return { fixture, component: fixture.componentInstance, requested };
  }

  it('issues immediately by default and carries the scoped notification choice', async () => {
    const { fixture, requested, component } = await setup();
    component['model'].update((value) => ({ ...value, notifyRecipients: false }));
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((element) =>
      element.textContent.includes('Emitir e publicar agora'),
    );
    button.click();
    expect(requested).toHaveBeenCalledWith({ scheduledAt: undefined, reissue: false, notifyRecipients: false });
  });

  it('keeps immediate reissuance available without entering a schedule', async () => {
    const { fixture, requested } = await setup();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((element) =>
      element.textContent.includes('Reemitir agora'),
    );
    button.click();
    expect(requested).toHaveBeenCalledWith({ scheduledAt: undefined, reissue: true, notifyRecipients: true });
  });

  it('rejects an empty or past schedule without emitting a request', async () => {
    const { fixture, component, requested } = await setup();
    component['model'].set({ timing: 'SCHEDULE', scheduledAt: '', notifyRecipients: true });
    component['request'](false);
    fixture.detectChanges();
    expect(requested).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('data e hora futuras');
    component['model'].update((value) => ({ ...value, scheduledAt: new Date(Date.now() - 60_000).toISOString() }));
    component['request'](false);
    expect(requested).not.toHaveBeenCalled();
  });

  it('converts the selected date and time to an absolute timestamp', async () => {
    const { component, requested } = await setup();
    const future = new Date(Date.now() + 60 * 60_000);
    component['model'].set({ timing: 'SCHEDULE', scheduledAt: future.toISOString(), notifyRecipients: true });
    component['request'](false);
    expect(requested).toHaveBeenCalledWith({
      scheduledAt: future.toISOString(),
      reissue: false,
      notifyRecipients: true,
    });
  });
});

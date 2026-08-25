import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { createPublicEvent, createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { EmojiService } from '../../../shared/emoji.service';
import { createSubscriptionFlowFormFixtures } from './subscription-flow.fixtures';
import { createSubscriptionFlowDraft, subscriptionFormKey } from './subscription-flow.models';
import { SubscriptionReviewDialog, type SubscriptionReviewDialogData } from './subscription-review-dialog';

registerLocaleData(localePt);

describe('SubscriptionReviewDialog', () => {
  it('renders a compact read-only summary and confirms without editing answers', async () => {
    const forms = createSubscriptionFlowFormFixtures();
    const draft = createSubscriptionFlowDraft(forms, true);
    draft.answersByKey[subscriptionFormKey(forms[0])] = [{ elementId: 'shirt-size', value: 'm' }];
    draft.answersByKey[subscriptionFormKey(forms[1])] = [{ elementId: 'meal', value: 'yes' }];
    const close = vi.fn();
    const data: SubscriptionReviewDialogData = {
      majorEvent: createPublicMajorEvent({ id: 'major-1', name: 'SECOMPP', emoji: '🎓' }),
      events: [createPublicEvent({ id: 'event-1', name: 'Oficina de Angular', emoji: '🧩' })],
      forms,
      draft,
      paymentTier: 'Estudante',
      requireImageLicenseAgreement: true,
    };

    await TestBed.configureTestingModule({
      imports: [SubscriptionReviewDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
        { provide: EmojiService, useValue: { getTwemojiUrl: () => '/emoji.svg' } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubscriptionReviewDialog);
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('Oficina de Angular');
    expect(content).toContain('Tamanho da camiseta');
    expect(content).toContain('M');
    expect(content).toContain('Precisa de opção vegetariana?');
    expect(content).toContain('Sim');
    expect(content).toContain('Contrato de concessão de licença');
    expect(fixture.nativeElement.querySelector('lib-event-form-renderer')).toBeNull();

    fixture.componentInstance.confirm();
    expect(close).toHaveBeenCalledWith({ confirmed: true });
  });
});

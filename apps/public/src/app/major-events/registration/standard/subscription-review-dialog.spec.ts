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

  it('renders missing and empty option answers without crashing', async () => {
    const [fixtureForm] = createSubscriptionFlowFormFixtures();
    const form = {
      ...fixtureForm,
      form: {
        ...fixtureForm.form,
        elementsJson: JSON.stringify([
          { id: 'missing-options', type: 'singleChoice', title: 'Opção antiga' },
          { id: 'empty-answer', type: 'multipleChoice', title: 'Seleção vazia' },
        ]),
      },
    };
    const draft = createSubscriptionFlowDraft([form], false);
    draft.answersByKey[subscriptionFormKey(form)] = [
      { elementId: 'missing-options', value: 'legacy-option' },
      { elementId: 'empty-answer', value: [] },
    ];
    const data: SubscriptionReviewDialogData = {
      majorEvent: createPublicMajorEvent({ id: 'major-1', name: 'SECOMPP' }),
      events: [],
      forms: [form],
      draft,
      paymentTier: null,
      requireImageLicenseAgreement: false,
    };

    await TestBed.configureTestingModule({
      imports: [SubscriptionReviewDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: EmojiService, useValue: { getTwemojiUrl: () => '/emoji.svg' } },
      ],
    }).compileComponents();

    const component = TestBed.createComponent(SubscriptionReviewDialog).componentInstance;
    expect(component.answerRows(form).map((row) => row.answer)).toEqual(['legacy-option', 'Sem resposta']);
  });
});

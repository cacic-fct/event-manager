import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SubscriptionFormFlow } from './subscription-form-flow';
import { createSubscriptionFlowFormFixtures } from './subscription-flow.fixtures';
import { createSubscriptionFlowDraft, subscriptionFormKey } from './subscription-flow.models';

type AnswerState = 'empty' | 'prefilled' | 'submitted-readonly';

interface SubscriptionFormFlowStoryArgs {
  answerState: AnswerState;
  formCount: number;
  requireLicenseAgreement: boolean;
  licenseAccepted: boolean;
  longContent: boolean;
}

const defaultArgs: SubscriptionFormFlowStoryArgs = {
  answerState: 'empty',
  formCount: 2,
  requireLicenseAgreement: true,
  licenseAccepted: false,
  longContent: false,
};

const meta: Meta<SubscriptionFormFlowStoryArgs> = {
  component: SubscriptionFormFlow,
  title: 'CACiC Eventos/Major Events/Registration/Standard/Form Flow',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    answerState: { control: 'select', options: ['empty', 'prefilled', 'submitted-readonly'] },
    formCount: { control: { type: 'range', min: 1, max: 2, step: 1 } },
    requireLicenseAgreement: { control: 'boolean' },
    licenseAccepted: { control: 'boolean' },
    longContent: { control: 'boolean' },
  },
  render: (args) => {
    const forms = createSubscriptionFlowFormFixtures().slice(0, args.formCount);
    if (args.longContent) {
      forms[0] = {
        ...forms[0],
        targetName: 'Congresso interdisciplinar universitário de tecnologia, ciência, cultura e acessibilidade',
        form: {
          ...forms[0].form,
          name: 'Informações complementares para participação nas atividades do grande evento',
          description:
            'Preencha com atenção. Estas informações serão usadas pela organização durante toda a programação.',
        },
      };
    }
    const draft = createSubscriptionFlowDraft(forms, args.licenseAccepted);
    if (args.answerState !== 'empty') {
      draft.answersByKey[subscriptionFormKey(forms[0])] = [{ elementId: 'shirt-size', value: 'm' }];
      if (forms[1]) {
        draft.answersByKey[subscriptionFormKey(forms[1])] = [{ elementId: 'meal', value: 'yes' }];
      }
    }
    if (args.answerState === 'submitted-readonly') {
      forms.forEach((form) => {
        form.submitted = true;
        form.editable = false;
      });
    }

    return {
      props: {
        forms,
        requireImageLicenseAgreement: args.requireLicenseAgreement,
        imageLicenseAgreementAccepted: args.licenseAccepted,
        initialDraft: draft,
        backToSelection: fn(),
        reviewRequested: fn(),
      },
    };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<SubscriptionFormFlowStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Camiseta do evento' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /Continuar/i }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('Responda as perguntas obrigatórias');
    await userEvent.click(canvas.getByRole('radio', { name: 'M' }));
    await userEvent.click(canvas.getByRole('button', { name: /Continuar/i }));
    await expect(canvas.getByRole('heading', { name: 'Preferências da atividade' })).toBeVisible();
  },
};

export const PreservesAnswersWhenReturning: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'G' }));
    await userEvent.click(canvas.getByRole('button', { name: /Continuar/i }));
    await userEvent.click(canvas.getByRole('button', { name: /Voltar/i }));
    await expect(canvas.getByRole('radio', { name: 'G' })).toBeChecked();
  },
};

export const SubmittedReadOnly: Story = {
  args: { answerState: 'submitted-readonly', licenseAccepted: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Resposta já enviada/)).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'M' })).toBeDisabled();
  },
};

export const ContractOnly: Story = {
  args: { formCount: 1, answerState: 'prefilled', requireLicenseAgreement: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Continuar/i }));
    await expect(canvas.getByRole('heading', { name: 'Contrato de concessão de licença' })).toBeVisible();
  },
};

export const LongContentMobileDark: Story = {
  args: { longContent: true },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Congresso interdisciplinar universitário/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Alterar eventos/i })).toBeVisible();
  },
};

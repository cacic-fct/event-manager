import { Component, inject, provideAppInitializer } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, convertToParamMap, provideRouter, withDisabledInitialNavigation, withHashLocation } from '@angular/router';
import { applicationConfig } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import type { CertificateFolder, CertificateTemplate } from '@cacic-fct/event-manager-admin-contracts';
import { filter, map, of, startWith } from 'rxjs';
import { CertificatesService } from './certificates.service';
import { CertificateApiService } from '../graphql/certificate-api.service';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  createCertificateTemplatesStoryHandler,
  type CertificateTemplatesStoryOptions,
} from '../../../.storybook/storybook-mocks';
import { CertificatesPageComponent } from './certificates-page.component';
import { PermissionsService } from '../permissions/permissions.service';

@Component({ template: '' })
class CertificateStoryRouteComponent {}

function standaloneCertificateRoute() {
  const router = inject(Router);
  return { paramMap: router.events.pipe(
    filter((event) => event instanceof NavigationEnd),
    map(() => {
      const segments = router.parseUrl(router.url).root.children['primary']?.segments ?? [];
      return convertToParamMap({ targetType: segments[1]?.path, targetId: segments[2]?.path, configId: segments[3]?.path });
    }),
    startWith(convertToParamMap({})),
  ) };
}

function initializeStandaloneFolderStory(): Promise<void> {
  const certificates = inject(CertificatesService);
  return certificates.loadInitialData().then(() => certificates.selectTargetByRoute(null, null, null));
}

interface CertificatesPageStoryArgs extends CertificateTemplatesStoryOptions {
  longContent: boolean;
}

const defaultArgs: CertificatesPageStoryArgs = {
  state: 'ready',
  count: 6,
  latencyMs: 120,
  namePrefix: 'Modelo de certificado',
  inactiveEvery: 4,
  longContent: false,
};

const folderStoryTimestamp = new Date().toISOString();
const standaloneCertificateFolder: CertificateFolder = {
  id: 'certificate-folder-story',
  name: 'Atividades complementares',
  emoji: '🏅',
  createdAt: folderStoryTimestamp,
  createdById: 'storybook-admin',
  updatedAt: folderStoryTimestamp,
  updatedById: 'storybook-admin',
  deletedAt: null,
};
const standaloneCertificateTemplate: CertificateTemplate = {
  id: 'certificate-template-story',
  name: 'Modelo de certificado',
  description: 'Modelo para certificados avulsos.',
  isActive: true,
  certificateFieldsJson: '{}',
  createdAt: folderStoryTimestamp,
  createdById: 'storybook-admin',
  updatedAt: folderStoryTimestamp,
  updatedById: 'storybook-admin',
  deletedAt: null,
};
const standaloneFolderCertificateApi = {
  listCertificateIssuableEvents: () => of([]),
  listCertificateIssuableEventGroups: () => of([]),
  listCertificateIssuableMajorEvents: () => of([]),
  listCertificateFolders: () => of([standaloneCertificateFolder]),
  getCertificateFolder: () => of(standaloneCertificateFolder),
  listCertificateTemplates: () => of([standaloneCertificateTemplate]),
  listCertificateConfigs: () => of([]),
  listCertificates: () => of([]),
} satisfies Partial<CertificateApiService>;

let activeArgs = defaultArgs;

const selectedEventRoute = applicationConfig({
  providers: [
    {
      provide: ActivatedRoute,
      useValue: { paramMap: of(convertToParamMap({ targetType: 'event', targetId: 'event-1' })) },
    },
    {
      provide: PermissionsService,
      useValue: {
        has: () => true,
        hasAny: () => true,
        hasAll: () => true,
        canDelete: () => true,
      },
    },
    provideAppInitializer(() => inject(CertificatesService).loadCertificateTemplates()),
  ],
});

const meta: Meta<CertificatesPageStoryArgs> = {
  component: CertificatesPageComponent,
  title: 'Admin/Settings/Certificates',
  tags: ['autodocs'],
  decorators: [withScenarioControls<CertificatesPageStoryArgs>()],
  args: defaultArgs,
  argTypes: {
    state: { control: 'inline-radio', options: ['ready', 'empty', 'loading', 'error'] },
    count: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    namePrefix: { control: 'text' },
    inactiveEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    longContent: { control: 'boolean' },
  },
  render: (args) => {
    activeArgs = {
      ...defaultArgs,
      ...args,
      namePrefix: args.longContent
        ? 'Modelo institucional interdisciplinar para certificados acadêmicos, culturais e esportivos'
        : args.namePrefix,
    };
    return { props: {} };
  },
  parameters: {
    docs: {
      description: {
        component: 'Certificate template and folder management with controls for loading, latency, and eligibility scenarios.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
    msw: { handlers: { graphql: [createCertificateTemplatesStoryHandler(() => activeArgs)] } },
  },
};

export default meta;

type Story = StoryObj<CertificatesPageStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Playground: Story = {
  args: {},
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};



export const NoRegisteredTemplates: Story = {
  ...Playground,
  name: 'No registered templates',
  args: { state: 'empty', count: 0, latencyMs: 0 },
  decorators: [selectedEventRoute],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        'Nenhum modelo de certificado está disponível. Verifique o cadastro dos arquivos do ambiente.',
      ),
    ).toBeVisible();
  },
};

export const TemplateRegistryUnavailable: Story = {
  ...Playground,
  name: 'Template registry unavailable',
  args: { state: 'error', latencyMs: 0 },
  decorators: [selectedEventRoute],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os modelos de certificado.',
    );
    await expect(canvas.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};

export const DenseTemplateRegistry: Story = {
  args: { count: 30, inactiveEvery: 3, latencyMs: 0 },
};

export const SlowTemplateRegistry: Story = {
  args: { count: 12, latencyMs: 1_500 },
};

export const LoadingTemplates: Story = {
  args: { state: 'loading', latencyMs: 0 },
};

export const LongTemplateNames: Story = {
  args: { count: 12, longContent: true, latencyMs: 0 },
};

export const ParticipantPriceTiers: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ targetType: 'major-event', targetId: 'major-1' })) },
        },
        {
          provide: PermissionsService,
          useValue: {
            has: () => true,
            hasAny: () => true,
            hasAll: () => true,
            canDelete: () => true,
          },
        },
        provideAppInitializer(() => inject(CertificatesService).loadCertificateTemplates()),
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tiers = await canvas.findByRole('combobox', { name: 'Faixas de preço para emissão' });
    await expect(tiers).toHaveTextContent('Todas as faixas');
    await userEvent.click(tiers);
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await screen.findByRole('option', { name: 'Estudante' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Comunidade' }));
    await userEvent.keyboard('{Escape}');
    await expect(tiers).toHaveTextContent('Estudante');
    await expect(tiers).toHaveTextContent('Comunidade');
  },
};

export const StandaloneCertificateFolder: Story = {
  name: 'Standalone certificate folder',
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([{ path: '**', component: CertificateStoryRouteComponent }], withHashLocation(), withDisabledInitialNavigation()),
        { provide: CertificateApiService, useValue: standaloneFolderCertificateApi },
        {
          provide: ActivatedRoute,
          useFactory: standaloneCertificateRoute,
        },
        {
          provide: PermissionsService,
          useValue: {
            has: () => true,
            hasAny: () => true,
            hasAll: () => true,
            canDelete: () => true,
          },
        },
        provideAppInitializer(initializeStandaloneFolderStory),
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Certificados avulsos', level: 1 })).toBeVisible();
    await expect(canvas.queryByRole('combobox', { name: 'Escopo' })).not.toBeInTheDocument();
    const folderPicker = await canvas.findByRole('button', { name: /Escolher pasta/ });
    if (folderPicker.getAttribute('aria-expanded') === 'false') await userEvent.click(folderPicker);
    await expect(await canvas.findByRole('link', { name: 'Abrir pasta Atividades complementares' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Nova pasta' }));
    await expect(canvas.getByRole('heading', { name: 'Nova pasta', level: 2 })).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nome da pasta' }), 'Extensão universitária');
    await expect(canvas.getByRole('button', { name: 'Criar pasta' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }));
    await expect(canvas.queryByRole('heading', { name: 'Nova pasta', level: 2 })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('link', { name: 'Abrir pasta Atividades complementares' }));
    await expect(await canvas.findByRole('button', { name: 'Editar pasta' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Editar pasta' }));
    await expect(canvas.getByRole('textbox', { name: 'Nome da pasta' })).toHaveValue('Atividades complementares');
    await expect(canvas.getByRole('button', { name: 'Salvar alterações' })).toBeVisible();
  },
};

export const StandaloneCertificateFoldersReadOnly: Story = {
  name: 'Standalone certificate folders read only',
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([{ path: '**', component: CertificateStoryRouteComponent }], withHashLocation(), withDisabledInitialNavigation()),
        { provide: CertificateApiService, useValue: standaloneFolderCertificateApi },
        { provide: ActivatedRoute, useFactory: standaloneCertificateRoute },
        {
          provide: PermissionsService,
          useValue: {
            has: () => false,
            hasAny: () => false,
            hasAll: () => false,
            canDelete: () => false,
          },
        },
        provideAppInitializer(initializeStandaloneFolderStory),
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const folderPicker = await canvas.findByRole('button', { name: /Escolher pasta/ });
    if (folderPicker.getAttribute('aria-expanded') === 'false') await userEvent.click(folderPicker);
    const folder = await canvas.findByRole('link', { name: 'Abrir pasta Atividades complementares' });
    await expect(folder).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Nova pasta' })).not.toBeInTheDocument();
    await userEvent.click(folder);
    await expect(await canvas.findByRole('heading', { name: 'Atividades complementares', level: 2 })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Editar pasta' })).not.toBeInTheDocument();
  },
};

export const AttendeeCertificateEligibility: Story = {
  ...ParticipantPriceTiers,
  name: 'Attendee certificate eligibility',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('combobox', { name: 'Critério adicional de inscrição' }),
    ).toBeVisible();
    await expect(await canvas.findByText('Usar regras dos eventos')).toBeVisible();
    await expect(
      await canvas.findByText(
        'As regras do alvo continuam valendo; a coleta de presença é independente do certificado.',
      ),
    ).toBeVisible();
  },
};

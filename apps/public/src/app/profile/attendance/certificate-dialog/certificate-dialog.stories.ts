import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { AuthService, CacicAnalyticsService, MailtoService } from '@cacic-fct/shared-angular';
import type { Certificate } from '@cacic-fct/shared-utils';
import type { Meta, StoryObj } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import { AttendancesApiService } from '../attendances-api.service';
import { CertificateDialog, type CertificateDialogData } from './certificate-dialog';

type CertificateDialogState = 'inline' | 'api' | 'loading' | 'error';
type CertificateScope = 'OTHER' | 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';

interface CertificateDialogStoryArgs {
  state: CertificateDialogState;
  title: string;
  certificateCount: number;
  namePrefix: string;
  scope: CertificateScope;
  downloadFails: boolean;
}

const defaultArgs: CertificateDialogStoryArgs = {
  state: 'inline',
  title: 'Atividades complementares',
  certificateCount: 4,
  namePrefix: 'Certificado',
  scope: 'OTHER',
  downloadFails: false,
};

function buildCertificates(args: CertificateDialogStoryArgs): Certificate[] {
  faker.seed(20260816 + args.certificateCount);
  return Array.from({ length: Math.max(0, Math.min(30, Math.round(args.certificateCount))) }, (_, index) => ({
    id: `certificate-${index + 1}`,
    configId: `config-${index + 1}`,
    issuedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    config: {
      id: `config-${index + 1}`,
      name: `${args.namePrefix} ${faker.helpers.arrayElement(['de participação', 'de organização', 'de palestra', 'avulso'])}`,
      scope: args.scope,
      certificateText: faker.lorem.sentence(),
      certificateTemplate: {
        id: `template-${(index % 3) + 1}`,
        name: `Modelo ${(index % 3) + 1}`,
      },
    },
    certificateTemplate: {
      id: `template-${(index % 3) + 1}`,
      name: `Modelo ${(index % 3) + 1}`,
    },
  }));
}

@Component({
  selector: 'app-storybook-certificate-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class CertificateDialogStoryHost {
  private readonly injector = inject(Injector);

  readonly component = CertificateDialog;
  readonly state = input<CertificateDialogState>('inline');
  readonly title = input(defaultArgs.title);
  readonly certificateCount = input(defaultArgs.certificateCount);
  readonly namePrefix = input(defaultArgs.namePrefix);
  readonly scope = input<CertificateScope>(defaultArgs.scope);
  readonly downloadFails = input(false);

  readonly storyInjector = computed(() => {
    const args: CertificateDialogStoryArgs = {
      state: this.state(),
      title: this.title(),
      certificateCount: this.certificateCount(),
      namePrefix: this.namePrefix(),
      scope: this.scope(),
      downloadFails: this.downloadFails(),
    };
    const certificates = buildCertificates(args);
    const data: CertificateDialogData = {
      title: args.title,
      targets: [{ scope: args.scope, targetId: 'storybook-target' }],
      ...(args.state === 'inline' ? { certificates } : {}),
    };

    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
        {
          provide: AttendancesApiService,
          useValue: {
            getCurrentUserCertificatesForTargets: () => {
              if (args.state === 'loading') return NEVER;
              if (args.state === 'error') return throwError(() => new Error('Não foi possível carregar os certificados.'));
              return of(certificates);
            },
            downloadCurrentUserCertificate: () =>
              args.downloadFails
                ? throwError(() => new Error('Não foi possível baixar o certificado de demonstração.'))
                : of({ fileName: 'certificado.pdf', mimeType: 'application/pdf', contentBase64: 'U3Rvcnlib29r' }),
          },
        },
        { provide: CertificateFileDownloadService, useValue: { save: () => undefined } },
        { provide: CacicAnalyticsService, useValue: { trackEvent: () => undefined } },
        { provide: MailtoService, useValue: { open: () => undefined } },
        { provide: AuthService, useValue: { user: () => ({ sub: 'storybook-person' }) } },
      ],
    });
  });
}

const meta: Meta<CertificateDialogStoryArgs> = {
  component: CertificateDialogStoryHost,
  title: 'CACiC Eventos/Profile/Attendance/Certificate Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    state: { control: 'inline-radio', options: ['inline', 'api', 'loading', 'error'] },
    title: { control: 'text' },
    certificateCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    namePrefix: { control: 'text' },
    scope: { control: 'select', options: ['OTHER', 'EVENT', 'EVENT_GROUP', 'MAJOR_EVENT'] },
    downloadFails: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;
type Story = StoryObj<CertificateDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByRole('button', { name: 'Baixar certificado' })).toHaveLength(4);
  },
};

export const LoadedFromApi: Story = {
  args: { state: 'api', certificateCount: 6 },
};

export const Empty: Story = {
  args: { state: 'inline', certificateCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum certificado emitido')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { state: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar')).toBeVisible();
  },
};

export const LoadError: Story = {
  args: { state: 'error' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar os certificados.')).toBeVisible();
  },
};

export const DownloadError: Story = {
  args: { state: 'inline', certificateCount: 1, downloadFails: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Baixar certificado' }));
    await expect(await canvas.findByText('Não foi possível baixar o certificado de demonstração.')).toBeVisible();
  },
};

export const DenseFolder: Story = {
  args: { certificateCount: 30, namePrefix: 'Certificado interdisciplinar' },
};

export const LongContentMobile: Story = {
  args: {
    certificateCount: 8,
    title: 'Certificados de atividades acadêmicas, culturais, esportivas e de extensão universitária',
    namePrefix: 'Certificado detalhado de participação e contribuição',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};

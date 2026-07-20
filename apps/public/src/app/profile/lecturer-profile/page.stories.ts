import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService } from '@cacic-fct/shared-angular';
import { applicationConfig, type Decorator, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, screen, userEvent, within } from 'storybook/test';
import {
  createPublicStoryLecturerProfileFromControls,
  publicLecturerProfileStoryControlArgTypes,
  publicLecturerProfileStoryDefaultControls,
  type PublicLecturerProfileStoryControls,
} from '../../testing/public-event-story-fixtures';
import { AttendancesApiService, type LecturerProfile, type LecturerProfileInput } from '../attendance/api.service';
import { LecturerProfileComponent } from './page';

type LecturerProfileStoryState = 'profile' | 'empty' | 'loading' | 'error';
type SaveOutcome = 'success' | 'error';

interface LecturerProfileStoryArgs extends PublicLecturerProfileStoryControls {
  state: LecturerProfileStoryState;
  saveOutcome: SaveOutcome;
}

const defaultArgs: LecturerProfileStoryArgs = {
  ...publicLecturerProfileStoryDefaultControls,
  state: 'profile',
  saveOutcome: 'success',
};

const withLecturerProfileProviders: Decorator<LecturerProfileStoryArgs> = (story, context) =>
  applicationConfig({
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      {
        provide: AuthService,
        useValue: {
          user: () => ({
            sub: 'storybook-user',
            preferredUsername: 'storybook',
            claims: {
              name: context.args.lecturerDisplayName,
              picture: context.args.googleUserPicture,
            },
          }),
        },
      },
      {
        provide: AttendancesApiService,
        useValue: createAttendancesApiMock({ ...defaultArgs, ...context.args }),
      },
    ],
  })(story, context);

const meta: Meta<LecturerProfileStoryArgs> = {
  component: LecturerProfileComponent,
  title: 'Public/Profile/Attendances/Lecturer Profile',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    state: {
      control: 'select',
      options: ['profile', 'empty', 'loading', 'error'],
    },
    saveOutcome: {
      control: 'select',
      options: ['success', 'error'],
    },
    ...publicLecturerProfileStoryControlArgTypes,
  },
  decorators: [withLecturerProfileProviders],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<LecturerProfileStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Seu perfil público')).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /editar perfil/i }));
    await expect(await canvas.findByRole('button', { name: /salvar/i })).toBeVisible();
  },
};

export const EmptyProfile: Story = {
  args: {
    state: 'empty',
    publishGoogleUserPicture: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/ainda não criou seu perfil/i)).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /^editar$/i }));
    await expect(await canvas.findByLabelText(/nome de exibição/i)).toHaveValue('Ana Clara Silva');
  },
};

export const MinimalPublicData: Story = {
  args: {
    lecturerBiography: '',
    lecturerEmail: '',
    lecturerWhatsapp: '',
    publishGoogleUserPicture: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Seu perfil público')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /ana@example.com/i })).toBeNull();
    await expect(canvas.queryByRole('link', { name: /whatsapp/i })).toBeNull();
  },
};

export const Loading: Story = {
  args: {
    state: 'loading',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('progressbar')).toBeVisible();
  },
};

export const RequestError: Story = {
  args: {
    state: 'error',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não foi possível carregar o perfil de ministrante.')).toBeVisible();
  },
};

export const SaveError: Story = {
  args: {
    saveOutcome: 'error',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /editar perfil/i }));
    await userEvent.click(await canvas.findByRole('button', { name: /salvar/i }));
    await expect(await screen.findByText('Não foi possível salvar o perfil.')).toBeVisible();
  },
};

function createAttendancesApiMock(args: LecturerProfileStoryArgs): Pick<
  AttendancesApiService,
  'getCurrentUserLecturerProfile' | 'upsertCurrentUserLecturerProfile'
> {
  return {
    getCurrentUserLecturerProfile: () => {
      if (args.state === 'loading') {
        return NEVER;
      }

      if (args.state === 'error') {
        return throwError(() => new Error('Não foi possível carregar o perfil de ministrante.'));
      }

      return of(args.state === 'empty' ? null : buildLecturerProfile(args));
    },
    upsertCurrentUserLecturerProfile: (input: LecturerProfileInput) => {
      if (args.saveOutcome === 'error') {
        return throwError(() => new Error('Não foi possível salvar o perfil.'));
      }

      return of({
        ...buildLecturerProfile(args),
        ...input,
      });
    },
  };
}

function buildLecturerProfile(args: LecturerProfileStoryArgs): LecturerProfile {
  const profile = createPublicStoryLecturerProfileFromControls(args);
  return {
    id: profile.id,
    personId: 'person-lecturer-story',
    displayName: profile.displayName,
    biography: profile.biography,
    publishGoogleUserPicture: args.publishGoogleUserPicture,
    googleUserPicture: profile.googleUserPicture,
    email: profile.email,
    whatsapp: profile.whatsapp,
  };
}

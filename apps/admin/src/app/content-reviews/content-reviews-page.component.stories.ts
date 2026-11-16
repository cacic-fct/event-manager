import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { ContentReviewsApi, type ContentReviewPage } from './content-reviews-api.service';
import { ContentReviewsPageComponent } from './content-reviews-page.component';

const queue: ContentReviewPage = {
  hasNextPage: false,
  groups: [
    {
      id: 'workshop',
      revision: 1,
      updatedAt: new Date().toISOString(),
      targetName: 'Oficina de introdução ao Python',
      isProfile: false,
      items: [
        {
          key: 'slides',
          authorName: 'Marina Souza',
          fields: [],
          beforeMaterial: { title: 'Slides da oficina', url: 'https://example.org/introducao/arquivo' },
          afterMaterial: {
            title: 'Slides revisados da oficina',
            url: 'https://example.org/introducao/slides',
            releaseAfterEvent: true,
          },
        },
        {
          key: 'exercises',
          authorName: 'Marina Souza',
          fields: [],
          beforeMaterial: null,
          afterMaterial: { title: 'Exercícios para praticar', url: 'https://example.org/introducao/exercicios' },
        },
        {
          key: 'reading',
          authorName: 'Marina Souza',
          fields: [],
          beforeMaterial: { title: 'Leitura complementar', url: 'https://example.org/introducao/leitura' },
          afterMaterial: null,
        },
      ],
    },
  ],
};

const meta: Meta<ContentReviewsPageComponent> = {
  title: 'Admin/Revisão de conteúdo',
  component: ContentReviewsPageComponent,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
};
export default meta;
type Story = StoryObj<ContentReviewsPageComponent>;

function mockQueue(page: ContentReviewPage, decisionError?: string) {
  let groups = page.groups;
  return applicationConfig({
    providers: [
      {
        provide: ContentReviewsApi,
        useValue: {
          list: async () => ({ ...page, groups }),
          decide: async (group: { id: string }, keys: string[]) => {
            if (decisionError) throw new Error(decisionError);
            groups = groups
              .map((current) =>
                current.id === group.id
                  ? { ...current, items: current.items.filter(({ key }) => !keys.includes(key)) }
                  : current,
              )
              .filter(({ items }) => items.length > 0);
          },
        },
      },
    ],
  });
}

export const Materials: Story = { decorators: [mockQueue(queue)] };

const lecturerQueue: ContentReviewPage = {
  hasNextPage: false,
  groups: [
    {
      id: 'profile',
      revision: 1,
      updatedAt: new Date().toISOString(),
      targetName: 'Marina Souza',
      isProfile: true,
      items: [
        {
          key: 'biography',
          authorName: 'Marina Souza',
          fields: [
            {
              key: 'biography',
              before: 'Docente na Unesp.',
              after: 'Docente na Unesp e pesquisadora em ciência de dados.',
            },
          ],
          beforeMaterial: null,
          afterMaterial: null,
        },
      ],
    },
  ],
};

export const LecturerProfile: Story = { decorators: [mockQueue(lecturerQueue)] };

export const LecturerProfileDecisionError: Story = {
  decorators: [mockQueue(lecturerQueue, 'A fila mudou. Atualize a página antes de revisar.')],
};

export const Empty: Story = { decorators: [mockQueue({ hasNextPage: false, groups: [] })] };

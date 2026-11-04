import type { Meta, StoryObj } from '@storybook/angular';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { StickyDateHeader } from './sticky-date-header';

const meta: Meta<StickyDateHeader> = {
  component: StickyDateHeader,
  title: 'Public/Discovery/Sticky Date Header',
  tags: ['autodocs'],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  args: {
    label: format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR }),
    headingLevel: null,
    topOffset: null,
  },
  argTypes: {
    label: { control: 'text' },
    headingLevel: { control: 'select', options: [null, 2, 3, 4] },
    topOffset: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<StickyDateHeader>;

export const Default: Story = {};

export const LongLabel: Story = {
  args: { label: 'Quarta-feira — atividades da programação e encontros com a comunidade universitária' },
};

export const CustomOffset: Story = {
  args: { topOffset: 88, headingLevel: 3 },
};

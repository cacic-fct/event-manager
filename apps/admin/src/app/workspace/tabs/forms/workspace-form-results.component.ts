import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  QueryList,
  ViewChildren,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import { EventFormResults } from '@cacic-fct/event-manager-admin-contracts';

type FormResultSummary = {
  questions: Array<{
    elementId: string;
    title: string;
    type: string;
    answeredCount: number;
    buckets: Array<{ label: string; value: number }>;
    textAnswers: string[];
  }>;
};

@Component({
  selector: 'app-workspace-form-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (results(); as result) {
      <section class="results-shell">
        <header>
          <div>
            <h3>Resultados</h3>
            <p>
              {{ result.responseCount }} resposta{{ result.responseCount === 1 ? '' : 's' }}
              ·
              {{ sigiloLabel(result) }}
            </p>
          </div>
        </header>

        @if (summary().questions.length === 0) {
          <p class="empty-state">Ainda não há perguntas respondíveis neste formulário.</p>
        }

        <div class="results-grid">
          @for (question of summary().questions; track question.elementId) {
            <article>
              <header>
                <h4>{{ question.title }}</h4>
                <span>{{ question.answeredCount }} resposta{{ question.answeredCount === 1 ? '' : 's' }}</span>
              </header>

              @if (question.buckets.length > 0) {
                <div class="chart" #chart></div>
              } @else if (question.textAnswers.length > 0) {
                <ul class="text-answers">
                  @for (answer of question.textAnswers; track answer) {
                    <li>{{ answer }}</li>
                  }
                </ul>
              } @else {
                <p class="empty-state">Sem respostas agregáveis.</p>
              }
            </article>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .results-shell {
      display: grid;
      gap: 16px;
    }

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    h3,
    h4,
    p {
      margin: 0;
    }

    h3 {
      font-size: 1.1rem;
      font-weight: 600;
    }

    h4 {
      font-size: 0.95rem;
      font-weight: 600;
    }

    header p,
    article span,
    .empty-state {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }

    article {
      display: grid;
      gap: 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 12px;
      background: var(--mat-sys-surface);
    }

    .chart {
      min-height: 260px;
      width: 100%;
    }

    .text-answers {
      display: grid;
      gap: 8px;
      margin: 0;
      padding-left: 20px;
    }
  `,
})
export class WorkspaceFormResultsComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('chart')
  private chartElements?: QueryList<ElementRef<HTMLElement>>;

  readonly results = input<EventFormResults | null>(null);
  readonly summary = computed(() => this.parseSummary(this.results()?.summaryJson));
  readonly chartQuestions = computed(() => this.summary().questions.filter((question) => question.buckets.length > 0));

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly charts = new Map<string, ECharts>();

  constructor() {
    effect(() => {
      this.chartQuestions();
      queueMicrotask(() => this.renderCharts());
    });
  }

  ngAfterViewInit(): void {
    this.chartElements?.changes.subscribe(() => this.renderCharts());
    this.renderCharts();
  }

  ngOnDestroy(): void {
    for (const chart of this.charts.values()) {
      chart.dispose();
    }
    this.charts.clear();
  }

  sigiloLabel(result: EventFormResults): string {
    if (result.anonymous) {
      return 'respostas anônimas';
    }
    if (!result.answersReleased) {
      return 'respostas individuais ocultas';
    }
    return 'respostas individuais visíveis';
  }

  private renderCharts(): void {
    if (!this.isBrowser || !this.chartElements) {
      return;
    }

    const elements = this.chartElements.toArray();
    const questions = this.chartQuestions();
    questions.forEach((question, index) => {
      const element = elements[index]?.nativeElement;
      if (!element) {
        return;
      }

      const chart = this.charts.get(question.elementId) ?? echarts.init(element);
      this.charts.set(question.elementId, chart);
      chart.setOption({
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
        },
        grid: {
          left: 8,
          right: 8,
          top: 12,
          bottom: 8,
          containLabel: true,
        },
        xAxis: {
          type: 'value',
          minInterval: 1,
        },
        yAxis: {
          type: 'category',
          data: question.buckets.map((bucket) => bucket.label),
        },
        series: [
          {
            type: 'bar',
            data: question.buckets.map((bucket) => bucket.value),
            itemStyle: {
              borderRadius: [0, 4, 4, 0],
            },
          },
        ],
      });
      chart.resize();
    });
  }

  private parseSummary(value: string | null | undefined): FormResultSummary {
    if (!value) {
      return { questions: [] };
    }

    try {
      const parsed = JSON.parse(value) as FormResultSummary;
      return Array.isArray(parsed.questions) ? parsed : { questions: [] };
    } catch {
      return { questions: [] };
    }
  }
}

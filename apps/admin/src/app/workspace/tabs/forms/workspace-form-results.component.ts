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
                <div
                  class="chart"
                  #chart
                  role="img"
                  [attr.aria-label]="chartLabel(question)"
                  [style.height.px]="chartHeight(question)"></div>
                <ul class="bucket-list" aria-label="Resumo das respostas">
                  @for (bucket of question.buckets; track bucket.label) {
                    <li>
                      <span>{{ bucket.label }}</span>
                      <strong>{{ bucket.value }}</strong>
                    </li>
                  }
                </ul>
              } @else if (question.textAnswers.length > 0) {
                <ul class="text-answers">
                  @for (answer of question.textAnswers; track $index) {
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
      width: 100%;
    }

    .bucket-list {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .bucket-list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      padding-top: 6px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    .bucket-list strong {
      color: var(--mat-sys-on-surface);
      font-weight: 600;
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
  private readonly resizeObservers = new Map<string, { element: HTMLElement; observer: ResizeObserver }>();

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
    for (const { observer } of this.resizeObservers.values()) {
      observer.disconnect();
    }
    this.charts.clear();
    this.resizeObservers.clear();
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

  chartHeight(question: FormResultSummary['questions'][number]): number {
    return Math.min(420, Math.max(220, question.buckets.length * 44 + 56));
  }

  chartLabel(question: FormResultSummary['questions'][number]): string {
    const answers = question.buckets.map((bucket) => `${bucket.label}: ${bucket.value}`).join(', ');
    const separator = /[.!?]$/.test(question.title.trim()) ? '' : '.';
    return `${question.title}${separator} ${answers}`;
  }

  private renderCharts(): void {
    if (!this.isBrowser || !this.chartElements) {
      return;
    }

    const elements = this.chartElements.toArray();
    const questions = this.chartQuestions();
    const activeQuestionIds = new Set(questions.map((question) => question.elementId));
    questions.forEach((question, index) => {
      const element = elements[index]?.nativeElement;
      if (!element) {
        return;
      }
      this.observeChartElement(question.elementId, element);
      if (element.clientWidth === 0 || element.clientHeight === 0) {
        return;
      }

      const existingChart = this.charts.get(question.elementId);
      if (existingChart && existingChart.getDom() !== element) {
        existingChart.dispose();
        this.charts.delete(question.elementId);
      }
      const chart = this.charts.get(question.elementId) ?? echarts.init(element);
      const styles = getComputedStyle(element);
      const textColor = styles.getPropertyValue('--mat-sys-on-surface').trim();
      const mutedColor = styles.getPropertyValue('--mat-sys-on-surface-variant').trim();
      const outlineColor = styles.getPropertyValue('--mat-sys-outline-variant').trim();
      const primaryColor = styles.getPropertyValue('--mat-sys-primary').trim();
      this.charts.set(question.elementId, chart);
      chart.setOption({
        color: primaryColor ? [primaryColor] : undefined,
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
          axisLabel: { color: mutedColor },
          splitLine: { lineStyle: { color: outlineColor } },
        },
        yAxis: {
          type: 'category',
          data: question.buckets.map((bucket) => bucket.label),
          axisLabel: { color: textColor },
          axisLine: { lineStyle: { color: outlineColor } },
          axisTick: { show: false },
        },
        series: [
          {
            type: 'bar',
            data: question.buckets.map((bucket) => bucket.value),
            itemStyle: {
              borderRadius: [0, 4, 4, 0],
              color: primaryColor || undefined,
            },
          },
        ],
      });
      chart.resize();
    });
    for (const [questionId, chart] of this.charts.entries()) {
      if (!activeQuestionIds.has(questionId)) {
        chart.dispose();
        this.charts.delete(questionId);
      }
    }
    for (const [questionId, entry] of this.resizeObservers.entries()) {
      if (!activeQuestionIds.has(questionId)) {
        entry.observer.disconnect();
        this.resizeObservers.delete(questionId);
      }
    }
  }

  private observeChartElement(questionId: string, element: HTMLElement): void {
    if (!('ResizeObserver' in globalThis)) {
      return;
    }

    const existing = this.resizeObservers.get(questionId);
    if (existing?.element === element) {
      return;
    }
    existing?.observer.disconnect();

    const observer = new ResizeObserver(() => {
      const chart = this.charts.get(questionId);
      if (chart) {
        chart.resize();
      } else {
        this.renderCharts();
      }
    });
    observer.observe(element);
    this.resizeObservers.set(questionId, { element, observer });
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

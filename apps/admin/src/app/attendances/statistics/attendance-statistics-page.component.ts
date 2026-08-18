import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EventAttendanceAnalyticsSnapshot, AttendanceReviewItem } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  AttendanceApiService,
  type AttendanceAnalyticsTimeWindow,
} from '../../graphql/attendance-api.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { observeEChartsTheme, readEChartsThemeColor } from '../../shared/echarts-theme-colors';
import { AttendanceHeatmapComponent } from './attendance-heatmap.component';

type ChartName = 'throughput' | 'hours' | 'collectors' | 'methods';

interface BrushEndEvent {
  areas?: Array<{ coordRange?: unknown }>;
}

@Component({
  selector: 'app-attendance-statistics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    AttendanceHeatmapComponent,
  ],
  templateUrl: './attendance-statistics-page.component.html',
  styleUrls: [
    '../../app-shell/layout/page-layout.shared.scss',
    '../../app-shell/layout/forms-feedback.shared.scss',
    './attendance-statistics-page.component.scss',
  ],
})
export class AttendanceStatisticsPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('throughputChart') private throughputChart?: ElementRef<HTMLElement>;
  @ViewChild('hoursChart') private hoursChart?: ElementRef<HTMLElement>;
  @ViewChild('collectorsChart') private collectorsChart?: ElementRef<HTMLElement>;
  @ViewChild('methodsChart') private methodsChart?: ElementRef<HTMLElement>;

  private readonly api = inject(AttendanceApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly permissions = inject(PermissionsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly eventId = this.route.snapshot.paramMap.get('eventId') ?? '';
  private streamSubscription?: Subscription;
  private readonly charts = new Map<ChartName, ECharts>();
  private readonly observers = new Map<ChartName, ResizeObserver>();
  private stopObservingTheme?: () => void;
  private throughputSelectionChart?: ECharts;
  private throughputSelectionInProgress = false;

  readonly Permission = Permission;
  readonly selectedTimeWindow = signal<AttendanceAnalyticsTimeWindow | null>(null);
  readonly snapshot = signal<EventAttendanceAnalyticsSnapshot | null>(null);
  readonly loading = signal(true);
  readonly connectionError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly reviewingFlagId = signal<string | null>(null);
  readonly topCollector = computed(() => this.snapshot()?.collectors[0] ?? null);
  readonly lastUpdatedLabel = computed(() => this.snapshot()?.generatedAt ?? null);
  readonly selectedWindowLabel = computed(() => this.formatTimeWindow(this.selectedTimeWindow()));
  readonly canSelectTimeWindow = computed(() => (this.snapshot()?.scansPerMinute.length ?? 0) > 1);

  constructor() {
    effect((onCleanup) => {
      const selectedTimeWindow = this.selectedTimeWindow();
      this.loading.set(true);
      this.connectionError.set(null);
      this.streamSubscription?.unsubscribe();
      this.streamSubscription = this.api.watchEventAttendanceAnalytics(this.eventId, selectedTimeWindow).subscribe({
        next: (snapshot) => {
          this.snapshot.set(snapshot);
          this.loading.set(false);
          this.connectionError.set(null);
          queueMicrotask(() => this.renderCharts());
        },
        error: (error: unknown) => {
          this.connectionError.set(error instanceof Error ? error.message : 'A atualização ao vivo foi interrompida.');
          this.loading.set(false);
        },
      });
      onCleanup(() => this.streamSubscription?.unsubscribe());
    });
  }

  ngAfterViewInit(): void {
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.streamSubscription?.unsubscribe();
    this.stopObservingTheme?.();
    for (const chart of this.charts.values()) chart.dispose();
    for (const observer of this.observers.values()) observer.disconnect();
  }

  resetTimeWindow(): void {
    if (this.selectedTimeWindow() === null) return;
    this.selectedTimeWindow.set(null);
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.connectionError.set(null);
    try {
      this.snapshot.set(
        await firstValueFrom(
          this.api.getEventAttendanceAnalytics(this.eventId, this.selectedTimeWindow()),
        ),
      );
      queueMicrotask(() => this.renderCharts());
    } catch (error: unknown) {
      this.connectionError.set(error instanceof Error ? error.message : 'Não foi possível atualizar as estatísticas.');
    } finally {
      this.loading.set(false);
    }
  }

  async review(item: AttendanceReviewItem, status: 'RESOLVED' | 'DISMISSED'): Promise<void> {
    if (item.deepLink || !this.permissions.has(Permission.EventAttendance.Update)) return;
    this.reviewingFlagId.set(item.id);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.api.reviewAttendanceFlag(item.id, item.eventId, status));
      await this.reload();
    } catch (error: unknown) {
      this.actionError.set(error instanceof Error ? error.message : 'Não foi possível concluir a revisão.');
    } finally {
      this.reviewingFlagId.set(null);
    }
  }

  methodLabel(method: string): string {
    return ({
      CSV_IMPORT: 'Importação CSV', EVENT_DUPLICATION: 'Duplicação', MANUAL_INPUT: 'Entrada manual',
      ORAL_CALL: 'Chamada oral', SCANNER: 'Leitor de crachá', ONLINE_CODE: 'Código on-line', UNKNOWN: 'Não identificado',
    } as Record<string, string>)[method] ?? method;
  }

  reviewKindLabel(kind: string): string {
    return ({
      UNUSUAL_VOLUME: 'Volume incomum', REPEATED_SCAN_ATTEMPTS: 'Leituras repetidas', OFFLINE_BACKLOG: 'Fila off-line',
      ATTENDANCE_REMOVAL: 'Remoção', DISTANT_LOCATION: 'Localização', IMPROBABLE_MATCH_OPERATION: 'Operação esportiva',
    } as Record<string, string>)[kind] ?? kind;
  }

  methodSummary(methods: EventAttendanceAnalyticsSnapshot['collectors'][number]['methods']): string {
    return methods.map((method) => `${this.methodLabel(method.method)}: ${method.count}`).join(' · ');
  }

  reviewIcon(item: AttendanceReviewItem): string {
    if (item.kind === 'DISTANT_LOCATION') return 'distance';
    if (item.kind === 'ATTENDANCE_REMOVAL') return 'person_remove';
    if (item.kind === 'OFFLINE_BACKLOG') return 'cloud_off';
    if (item.kind === 'IMPROBABLE_MATCH_OPERATION') return 'sports_score';
    return item.severity === 'CRITICAL' ? 'report' : 'flag';
  }

  private renderCharts(): void {
    if (!this.isBrowser || !this.snapshot()) return;
    if (!this.throughputSelectionInProgress) {
      this.setChart('throughput', this.throughputChart, this.throughputOption());
    }
    this.setChart('hours', this.hoursChart, this.hoursOption());
    this.setChart('collectors', this.collectorsChart, this.collectorsOption());
    this.setChart('methods', this.methodsChart, this.methodsOption());
  }

  private setChart(name: ChartName, reference: ElementRef<HTMLElement> | undefined, option: EChartsOption): void {
    const element = reference?.nativeElement;
    if (!element) {
      this.disposeChart(name);
      return;
    }
    if (element.clientWidth === 0 || element.clientHeight === 0) return;
    const existing = this.charts.get(name);
    if (existing && existing.getDom() !== element) {
      this.disposeChart(name);
    }
    const chart = this.charts.get(name) ?? echarts.init(element, undefined, { renderer: 'canvas' });
    this.charts.set(name, chart);
    chart.setOption(option, true);
    if (name === 'throughput') this.configureThroughputSelection(chart);
    this.stopObservingTheme ??= observeEChartsTheme(element, () => this.renderCharts());
    if (!this.observers.has(name)) {
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(element);
      this.observers.set(name, observer);
    }
  }

  private chartColors(element?: HTMLElement) {
    return {
      text: element ? readEChartsThemeColor(element, '--mat-sys-on-surface', '#1b1b1f') : '#1b1b1f',
      muted: element ? readEChartsThemeColor(element, '--mat-sys-on-surface-variant', '#45464f') : '#45464f',
      grid: element ? readEChartsThemeColor(element, '--mat-sys-outline-variant', '#c5c6d0') : '#c5c6d0',
      primary: element ? readEChartsThemeColor(element, '--mat-sys-primary', '#415f91') : '#415f91',
      tertiary: element ? readEChartsThemeColor(element, '--mat-sys-tertiary', '#745471') : '#745471',
    };
  }

  private throughputOption(): EChartsOption {
    const colors = this.chartColors(this.throughputChart?.nativeElement);
    const data = this.snapshot()?.scansPerMinute ?? [];
    const seriesData = this.timeSeriesWithVisibleGaps(data);
    return {
      animationDuration: 260,
      aria: { enabled: true },
      tooltip: { trigger: 'axis', valueFormatter: (value) => `${value} presença(s)` },
      brush: {
        xAxisIndex: 0,
        brushType: 'lineX',
        brushMode: 'single',
        transformable: false,
        removeOnClick: false,
        brushStyle: {
          color: echarts.color.modifyAlpha(colors.primary, 0.14),
          borderColor: colors.primary,
          borderWidth: 1,
        },
      },
      grid: { left: 12, right: 16, top: 18, bottom: 8, containLabel: true },
      xAxis: {
        type: 'time',
        axisLabel: { color: colors.muted, formatter: (value: number) => this.timeAxisLabel(value, data) },
        axisLine: { lineStyle: { color: colors.grid } },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: colors.grid } } },
      series: [{
        type: 'line',
        name: 'Presenças/min',
        data: seriesData,
        connectNulls: false,
        smooth: false,
        showSymbol: data.length <= 240,
        symbolSize: 7,
        lineStyle: { width: 3, color: colors.primary },
        itemStyle: { color: colors.primary },
        areaStyle: { color: colors.primary, opacity: 0.12 },
      }],
    };
  }

  private hoursOption(): EChartsOption {
    const colors = this.chartColors(this.hoursChart?.nativeElement);
    const data = this.snapshot()?.scansByHour ?? [];
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 12, right: 16, top: 18, bottom: 8, containLabel: true },
      xAxis: {
        type: 'time',
        axisLabel: { color: colors.muted, formatter: (value: number) => this.timeAxisLabel(value, data) },
        axisLine: { lineStyle: { color: colors.grid } },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: colors.grid } } },
      series: [{ type: 'bar', name: 'Presenças', data: data.map((item) => [item.start, item.count]), itemStyle: { color: colors.tertiary, borderRadius: [4, 4, 0, 0] } }],
    };
  }

  private collectorsOption(): EChartsOption {
    const colors = this.chartColors(this.collectorsChart?.nativeElement);
    const collectors = (this.snapshot()?.collectors ?? []).slice(0, 10).reverse();
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 8, right: 18, top: 12, bottom: 8, containLabel: true },
      xAxis: { type: 'value', minInterval: 1, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: colors.grid } } },
      yAxis: { type: 'category', data: collectors.map((item) => item.name), axisLabel: { color: colors.muted, width: 130, overflow: 'truncate' }, axisLine: { lineStyle: { color: colors.grid } } },
      series: [{ type: 'bar', name: 'Presenças', data: collectors.map((item) => item.count), itemStyle: { color: colors.primary, borderRadius: [0, 4, 4, 0] } }],
    };
  }

  private methodsOption(): EChartsOption {
    const colors = this.chartColors(this.methodsChart?.nativeElement);
    const methods = this.snapshot()?.methods ?? [];
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: colors.muted } },
      series: [{ type: 'pie', radius: ['42%', '72%'], center: ['50%', '43%'], avoidLabelOverlap: true, label: { color: colors.text, formatter: '{b}\n{c}' }, data: methods.map((item) => ({ name: this.methodLabel(item.method), value: item.count })) }],
    };
  }

  private configureThroughputSelection(chart: ECharts): void {
    if (chart !== this.throughputSelectionChart) {
      this.throughputSelectionChart = chart;
      chart.on('brush', () => {
        this.throughputSelectionInProgress = true;
      });
      chart.on('brushend', (event: unknown) => {
        const selectedWindow = timeWindowFromBrushEvent(event);
        chart.dispatchAction({ type: 'brush', areas: [] });
        this.throughputSelectionInProgress = false;
        if (!selectedWindow) return;
        const currentWindow = this.selectedTimeWindow();
        if (
          currentWindow?.start === selectedWindow.start &&
          currentWindow.end === selectedWindow.end
        ) return;
        this.selectedTimeWindow.set(selectedWindow);
      });
    }
    chart.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: { brushType: 'lineX', brushMode: 'single' },
    });
  }

  private disposeChart(name: ChartName): void {
    this.observers.get(name)?.disconnect();
    this.observers.delete(name);
    const chart = this.charts.get(name);
    chart?.dispose();
    this.charts.delete(name);
    if (name === 'throughput') {
      this.throughputSelectionChart = undefined;
      this.throughputSelectionInProgress = false;
    }
  }

  private timeSeriesWithVisibleGaps(
    data: EventAttendanceAnalyticsSnapshot['scansPerMinute'],
  ): Array<[string | number, number | null]> {
    const points: Array<[string | number, number | null]> = [];
    for (const [index, item] of data.entries()) {
      const previous = data[index - 1];
      if (previous) {
        const previousTime = new Date(previous.start).getTime();
        const currentTime = new Date(item.start).getTime();
        if (currentTime - previousTime > 2 * 60_000) {
          points.push([previousTime + 60_000, null], [currentTime - 60_000, null]);
        }
      }
      points.push([item.start, item.count]);
    }
    return points;
  }

  private timeAxisLabel(
    value: number,
    data: EventAttendanceAnalyticsSnapshot['scansPerMinute'],
  ): string {
    const first = data[0];
    const last = data[data.length - 1];
    const span = first && last ? new Date(last.start).getTime() - new Date(first.start).getTime() : 0;
    const options: Intl.DateTimeFormatOptions = span >= 24 * 60 * 60_000
      ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };
    return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
  }

  private formatTimeWindow(window: AttendanceAnalyticsTimeWindow | null): string {
    if (!window) return 'Todo o período';
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${formatter.format(new Date(window.start))} – ${formatter.format(new Date(window.end))}`;
  }
}

export function timeWindowFromBrushEvent(event: unknown): AttendanceAnalyticsTimeWindow | null {
  const range = (event as BrushEndEvent | null)?.areas?.[0]?.coordRange;
  if (!Array.isArray(range) || range.length !== 2) return null;
  const values = range.map((value) => value instanceof Date ? value.getTime() : Number(value));
  const first = values[0];
  const second = values[1];
  if (first === undefined || second === undefined || !Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }
  const start = new Date(Math.floor(Math.min(first, second) / 60_000) * 60_000);
  const endMinute = Math.floor(Math.max(first, second) / 60_000) * 60_000;
  const end = new Date(endMinute + 60_000 - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

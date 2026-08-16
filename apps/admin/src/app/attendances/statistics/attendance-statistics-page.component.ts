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
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EventAttendanceAnalyticsSnapshot, AttendanceReviewItem } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import { firstValueFrom, Subscription } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { AttendanceHeatmapComponent } from './attendance-heatmap.component';

type ChartName = 'throughput' | 'hours' | 'collectors' | 'methods';

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
    MatSelectModule,
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

  readonly Permission = Permission;
  readonly windowMinutes = signal(60);
  readonly snapshot = signal<EventAttendanceAnalyticsSnapshot | null>(null);
  readonly loading = signal(true);
  readonly connectionError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly reviewingFlagId = signal<string | null>(null);
  readonly topCollector = computed(() => this.snapshot()?.collectors[0] ?? null);
  readonly lastUpdatedLabel = computed(() => this.snapshot()?.generatedAt ?? null);

  constructor() {
    effect((onCleanup) => {
      const windowMinutes = this.windowMinutes();
      this.loading.set(this.snapshot() === null);
      this.connectionError.set(null);
      this.streamSubscription?.unsubscribe();
      this.streamSubscription = this.api.watchEventAttendanceAnalytics(this.eventId, windowMinutes).subscribe({
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
    for (const chart of this.charts.values()) chart.dispose();
    for (const observer of this.observers.values()) observer.disconnect();
  }

  setWindowMinutes(value: number): void {
    this.windowMinutes.set(value);
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.connectionError.set(null);
    try {
      this.snapshot.set(await firstValueFrom(this.api.getEventAttendanceAnalytics(this.eventId, this.windowMinutes())));
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
    this.setChart('throughput', this.throughputChart, this.throughputOption());
    this.setChart('hours', this.hoursChart, this.hoursOption());
    this.setChart('collectors', this.collectorsChart, this.collectorsOption());
    this.setChart('methods', this.methodsChart, this.methodsOption());
  }

  private setChart(name: ChartName, reference: ElementRef<HTMLElement> | undefined, option: EChartsOption): void {
    const element = reference?.nativeElement;
    if (!element || element.clientWidth === 0 || element.clientHeight === 0) return;
    const existing = this.charts.get(name);
    if (existing && existing.getDom() !== element) {
      existing.dispose();
      this.charts.delete(name);
    }
    const chart = this.charts.get(name) ?? echarts.init(element);
    this.charts.set(name, chart);
    chart.setOption(option, true);
    if (!this.observers.has(name)) {
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(element);
      this.observers.set(name, observer);
    }
  }

  private chartColors(element?: HTMLElement) {
    const styles = element ? getComputedStyle(element) : null;
    return {
      text: styles?.getPropertyValue('--mat-sys-on-surface').trim() || '#1b1b1f',
      muted: styles?.getPropertyValue('--mat-sys-on-surface-variant').trim() || '#45464f',
      grid: styles?.getPropertyValue('--mat-sys-outline-variant').trim() || '#c5c6d0',
      primary: styles?.getPropertyValue('--mat-sys-primary').trim() || '#415f91',
      tertiary: styles?.getPropertyValue('--mat-sys-tertiary').trim() || '#745471',
    };
  }

  private throughputOption(): EChartsOption {
    const colors = this.chartColors(this.throughputChart?.nativeElement);
    const data = this.snapshot()?.scansPerMinute ?? [];
    return {
      animationDuration: 260,
      tooltip: { trigger: 'axis' },
      grid: { left: 12, right: 16, top: 18, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: data.map((item) => this.time(item.start)), axisLabel: { color: colors.muted }, axisLine: { lineStyle: { color: colors.grid } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: colors.grid } } },
      series: [{ type: 'line', name: 'Presenças/min', data: data.map((item) => item.count), smooth: 0.28, symbolSize: 7, lineStyle: { width: 3, color: colors.primary }, itemStyle: { color: colors.primary }, areaStyle: { color: colors.primary, opacity: 0.12 } }],
    };
  }

  private hoursOption(): EChartsOption {
    const colors = this.chartColors(this.hoursChart?.nativeElement);
    const data = this.snapshot()?.scansByHour ?? [];
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 12, right: 16, top: 18, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: data.map((item) => this.time(item.start)), axisLabel: { color: colors.muted }, axisLine: { lineStyle: { color: colors.grid } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: colors.grid } } },
      series: [{ type: 'bar', name: 'Presenças', data: data.map((item) => item.count), itemStyle: { color: colors.tertiary, borderRadius: [4, 4, 0, 0] } }],
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

  private time(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }
}

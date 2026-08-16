import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { EventAttendanceAnalyticsSnapshot } from '@cacic-fct/event-manager-admin-contracts';
import { AttendanceStatisticsPageComponent } from './attendance-statistics-page.component';

const now = new Date();
const eventId = 'event-command-center-demo';

const meta: Meta<AttendanceStatisticsPageComponent> = {
  title: 'Páginas/Presenças/Central de estatísticas',
  component: AttendanceStatisticsPageComponent,
  parameters: { layout: 'fullscreen' },
  decorators: [storyProviders(snapshotFixture())],
};

export default meta;
type Story = StoryObj<AttendanceStatisticsPageComponent>;

export const OperacaoAoVivo: Story = {};

export const SemColetasNaJanela: Story = {
  decorators: [
    storyProviders({
      ...snapshotFixture(),
      presentCount: 0,
      noShowCount: 84,
      pendingReviewCount: 0,
      pendingOfflineCount: 0,
      scansPerMinute: [],
      scansByHour: [],
      collectors: [],
      methods: [],
      heatmapPoints: [],
      reviewItems: [],
    }),
  ],
};

export const SomenteLeitura: Story = {
  decorators: [storyProviders(snapshotFixture(), false)],
};

function storyProviders(snapshot: EventAttendanceAnalyticsSnapshot, canReview = true) {
  return applicationConfig({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: (key: string) => (key === 'eventId' ? eventId : null) } } },
      },
      {
        provide: AttendanceApiService,
        useValue: {
          watchEventAttendanceAnalytics: () => of(snapshot),
          getEventAttendanceAnalytics: () => of(snapshot),
          reviewAttendanceFlag: () => of(snapshot.reviewItems[0]),
        },
      },
      {
        provide: PermissionsService,
        useValue: { has: () => canReview },
      },
    ],
  });
}

function snapshotFixture(): EventAttendanceAnalyticsSnapshot {
  const minute = (offset: number) => new Date(now.getTime() + offset * 60_000).toISOString();
  return {
    eventId,
    eventName: 'Credenciamento e abertura da SECOMPP',
    emoji: '🎓',
    generatedAt: now.toISOString(),
    windowMinutes: 60,
    presentCount: 284,
    noShowCount: 37,
    pendingReviewCount: 3,
    pendingOfflineCount: 12,
    eventLatitude: -22.1208,
    eventLongitude: -51.4079,
    scansPerMinute: Array.from({ length: 18 }, (_, index) => ({
      start: minute(index - 17),
      count: [2, 4, 3, 7, 11, 8, 13, 18, 15, 9, 6, 12, 16, 10, 8, 5, 4, 3][index],
    })),
    scansByHour: [
      { start: minute(-120), count: 42 },
      { start: minute(-60), count: 167 },
      { start: minute(0), count: 75 },
    ],
    collectors: [
      { actorId: 'collector-1', name: 'Marina Costa', count: 96, firstScanAt: minute(-58), lastScanAt: minute(-2), onlineCount: 82, offlineCount: 14, methods: [{ method: 'SCANNER', count: 96 }] },
      { actorId: 'collector-2', name: 'Rafael Lima', count: 78, firstScanAt: minute(-55), lastScanAt: minute(-1), onlineCount: 78, offlineCount: 0, methods: [{ method: 'SCANNER', count: 72 }, { method: 'MANUAL_INPUT', count: 6 }] },
      { actorId: 'collector-3', name: 'Beatriz Souza', count: 63, firstScanAt: minute(-49), lastScanAt: minute(-4), onlineCount: 51, offlineCount: 12, methods: [{ method: 'SCANNER', count: 63 }] },
      { actorId: 'collector-4', name: 'Equipe de apoio', count: 47, firstScanAt: minute(-43), lastScanAt: minute(-6), onlineCount: 47, offlineCount: 0, methods: [{ method: 'MANUAL_INPUT', count: 31 }, { method: 'ORAL_CALL', count: 16 }] },
    ],
    methods: [
      { method: 'SCANNER', count: 231 },
      { method: 'MANUAL_INPUT', count: 37 },
      { method: 'ORAL_CALL', count: 16 },
    ],
    heatmapPoints: [
      { latitude: -22.1208, longitude: -51.4079, count: 155, averageAccuracyMeters: 18 },
      { latitude: -22.1206, longitude: -51.4081, count: 84, averageAccuracyMeters: 24 },
      { latitude: -22.121, longitude: -51.4077, count: 45, averageAccuracyMeters: 31 },
    ],
    reviewItems: [
      { id: 'review-1', eventId, kind: 'UNUSUAL_VOLUME', severity: 'WARNING', status: 'PENDING', title: 'Volume de coleta incomum', summary: 'Marina Costa registrou 22 presenças em um minuto.', detectedAt: minute(-13), actorId: 'collector-1', actorName: 'Marina Costa' },
      { id: 'review-2', eventId, kind: 'OFFLINE_BACKLOG', severity: 'CRITICAL', status: 'PENDING', title: 'Fila off-line acumulada', summary: '32 envios aguardam reconciliação; o mais antigo está pendente há 41 min.', detectedAt: minute(-9) },
      { id: 'review-3', eventId, kind: 'DISTANT_LOCATION', severity: 'INFO', status: 'PENDING', title: 'Padrão de localização inconsistente', summary: 'Foram observadas três transições geográficas improváveis em uma sequência de oito coletas.', detectedAt: minute(-6), actorId: 'collector-3', actorName: 'Beatriz Souza' },
    ],
  };
}

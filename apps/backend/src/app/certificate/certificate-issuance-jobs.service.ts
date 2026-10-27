import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { type CertificateIssuanceInput } from '@cacic-fct/shared-data-types';
import { Prisma, type CertificateIssuanceRun } from '@prisma/client';
import { Queue, UnrecoverableError } from 'bullmq';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { DeferredInjection } from '../common/deferred-injection';
import { CertificateAdministrationAudit } from './certificate-administration-audit';
import { PrismaService } from '../prisma/prisma.service';
import { buildBullMqJobId } from '../queues/bullmq-job-id';
import { CERTIFICATE_SELECT } from './certificate.constants';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateIssuingService } from './certificate-issuing.service';
import { CertificateNotificationJobsService } from './certificate-notification-jobs.service';

export const CERTIFICATE_ISSUANCE_QUEUE = 'certificate-issuance';
export const ISSUE_CERTIFICATES_JOB = 'issue-certificates';
export const RECOVER_CERTIFICATE_ISSUANCE_JOB = 'recover-certificate-issuance';
export const RECONCILE_CERTIFICATE_ELIGIBILITY_JOB = 'reconcile-certificate-eligibility';
export type CertificateIssuanceJobData = { runId: string } | Record<string, never>;
const ACTIVE_STATUSES = ['PENDING', 'PROCESSING'] as const;
const PAGE_SIZE = 100;
const DEFAULT_RECONCILIATION_HOURS = 6;

export function certificateReconciliationInterval(value?: string): number {
  const hours = Number(value ?? DEFAULT_RECONCILIATION_HOURS);
  const validHours = Number.isInteger(hours) && hours >= 1 && hours <= 168 ? hours : DEFAULT_RECONCILIATION_HOURS;
  return validHours * 60 * 60_000;
}

@Injectable()
export class CertificateIssuanceJobsService implements OnModuleInit {
  private readonly audit: CertificateAdministrationAudit;
  private readonly logger = new Logger(CertificateIssuanceJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CertificateEligibilityService,
    private readonly issuing: CertificateIssuingService,
    private readonly notifications: CertificateNotificationJobsService,
    @InjectQueue(CERTIFICATE_ISSUANCE_QUEUE) private readonly queue: Queue<CertificateIssuanceJobData>,
    @Inject(forwardRef(() => AuditLogService)) audit: DeferredInjection<AuditLogService>,
  ) {
    this.audit = new CertificateAdministrationAudit(audit);
  }

  async onModuleInit(): Promise<void> {
    for (const [name, every] of [
      [RECOVER_CERTIFICATE_ISSUANCE_JOB, 60_000],
      [
        RECONCILE_CERTIFICATE_ELIGIBILITY_JOB,
        certificateReconciliationInterval(process.env['CERTIFICATE_RECONCILIATION_INTERVAL_HOURS']),
      ],
    ] as const) {
      await this.queue.upsertJobScheduler(
        buildBullMqJobId('certificates', name),
        { every },
        {
          name,
          data: {},
          opts: { removeOnComplete: true, removeOnFail: 50 },
        },
      );
    }
  }

  listRuns(configId: string): Promise<CertificateIssuanceRun[]> {
    return this.prisma.certificateIssuanceRun.findMany({
      where: { configId, OR: [{ automatic: false }, { status: { in: [...ACTIVE_STATUSES] } }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async requestIssuance(input: CertificateIssuanceInput, requestedById?: string, automatic = false) {
    const scheduledAt = input.scheduledAt == null ? new Date() : new Date(input.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()) || (input.scheduledAt != null && scheduledAt.getTime() <= Date.now())) {
      throw new BadRequestException('Escolha uma data e hora futuras para agendar a emissão.');
    }
    const config = await this.eligibility.getConfigById(input.configId);
    if (!config.isActive || !config.certificateTemplate.isActive) {
      throw new BadRequestException('Ative a configuração e selecione um modelo disponível antes de emitir.');
    }
    let run: CertificateIssuanceRun;
    try {
      run = await this.prisma.$transaction(async (tx) => {
        const created = await tx.certificateIssuanceRun.create({
          data: {
            configId: config.id,
            scheduledAt,
            reissue: input.reissue ?? false,
            notifyRecipients: input.notifyRecipients ?? true,
            requestedById,
            configUpdatedAt: config.updatedAt,
            automatic,
          },
        });
        if (!automatic) await this.audit.recordRun(tx, created);
        return created;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma emissão em andamento ou agendada para esta configuração.');
      }
      throw error;
    }
    // The database is the durable source of truth. Recovery retries enqueueing
    // after Redis outages without making the admin create a duplicate request.
    await this.enqueueBestEffort(run);
    return run;
  }

  async cancel(configId: string, runId: string, actorId?: string): Promise<CertificateIssuanceRun> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.certificateIssuanceRun.updateMany({
        where: { id: runId, configId, status: 'PENDING' },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      if (result.count !== 1) {
        throw new ConflictException('A emissão já foi iniciada ou encerrada. Atualize o status.');
      }
      const cancelled = await tx.certificateIssuanceRun.findUniqueOrThrow({ where: { id: runId } });
      await this.audit.recordRun(tx, { ...cancelled, requestedById: actorId ?? cancelled.requestedById });
      return cancelled;
    });
  }

  async recoverPending(): Promise<void> {
    return this.withSystemAudience(() => this.recoverPendingForAllScopes());
  }

  private async recoverPendingForAllScopes(): Promise<void> {
    // Also recover PROCESSING rows if Redis lost a stalled job. Existing BullMQ
    // job IDs prevent a second worker from starting the same durable run.
    let cursor: string | undefined;
    while (true) {
      const runs = await this.prisma.certificateIssuanceRun.findMany({
        where: { status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: PAGE_SIZE,
      });
      if (runs.length === 0) return;
      for (const run of runs) await this.enqueueBestEffort(run);
      cursor = runs[runs.length - 1].id;
    }
  }

  async reconcileEligibility(): Promise<void> {
    return this.withSystemAudience(async () => {
      let cursor: string | undefined;
      while (true) {
        const configs = await this.prisma.certificateConfig.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            certificateTemplate: { deletedAt: null, isActive: true },
            issuanceRuns: { none: { status: { in: [...ACTIVE_STATUSES] } } },
            OR: [{ certificates: { some: {} } }, { issuanceRuns: { some: { status: 'COMPLETED' } } }],
          },
          select: {
            id: true,
            issuanceRuns: {
              where: { status: 'COMPLETED', automatic: false },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { notifyRecipients: true },
            },
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take: PAGE_SIZE,
        });
        if (configs.length === 0) return;
        for (const config of configs) {
          try {
            await this.requestIssuance(
              {
                configId: config.id,
                notifyRecipients: config.issuanceRuns[0]?.notifyRecipients ?? true,
              },
              undefined,
              true,
            );
          } catch (error: unknown) {
            if (!(error instanceof ConflictException)) {
              this.logger.warn(`Could not reconcile certificate configuration ${config.id}.`, error);
            }
          }
        }
        cursor = configs[configs.length - 1].id;
      }
    });
  }

  async process(runId: string, finalAttempt: boolean): Promise<void> {
    return this.withSystemAudience(async () => {
      const run = await this.prisma.certificateIssuanceRun.findUnique({ where: { id: runId } });
      if (!run || !ACTIVE_STATUSES.some((status) => status === run.status) || run.scheduledAt.getTime() > Date.now())
        return;
      const startedAt = run.startedAt ?? new Date();
      const claimed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.certificateIssuanceRun.updateMany({
          where: { id: runId, status: { in: [...ACTIVE_STATUSES] } },
          data: { status: 'PROCESSING', startedAt, error: null },
        });
        if (result.count === 1 && !run.automatic) {
          await this.audit.recordRun(tx, { ...run, status: 'PROCESSING', startedAt });
        }
        return result;
      });
      if (claimed.count !== 1) return;
      try {
        const config = await this.eligibility.getConfigById(run.configId);
        if (
          !config.isActive ||
          !config.certificateTemplate.isActive ||
          config.updatedAt.getTime() !== run.configUpdatedAt.getTime()
        ) {
          throw new UnrecoverableError('A configuração foi alterada ou desativada. Solicite uma nova emissão.');
        }
        await this.issuing.issueMissedCertificates(run.configId, run.requestedById ?? undefined, {
          notify: false,
          createNotifications: false,
          force: run.reissue,
          batchSize: 1,
        });
        await this.prisma.$transaction(
          async (tx) => {
            const certificates = await tx.certificate.findMany({
              where: { configId: run.configId, deletedAt: null, revokedAt: null, issuedAt: { gte: startedAt } },
              select: CERTIFICATE_SELECT,
            });
            if (run.notifyRecipients) {
              for (const certificate of certificates) await this.notifications.createPendingOutbox(certificate, tx);
            }
            const completed = {
              ...run,
              status: 'COMPLETED' as const,
              completedAt: new Date(),
              certificateCount: certificates.length,
              error: null,
            };
            await tx.certificateIssuanceRun.update({
              where: { id: runId },
              data: {
                status: completed.status,
                completedAt: completed.completedAt,
                certificateCount: completed.certificateCount,
                error: null,
              },
            });
            if (!run.automatic || certificates.length > 0) await this.audit.recordRun(tx, completed);
          },
          { timeout: 60_000 },
        );
        // The existing notification outbox scheduler delivers only after commit.
      } catch (error: unknown) {
        const failed = {
          ...run,
          status: finalAttempt || error instanceof UnrecoverableError ? ('FAILED' as const) : ('PENDING' as const),
          completedAt: finalAttempt || error instanceof UnrecoverableError ? new Date() : null,
          error:
            error instanceof UnrecoverableError
              ? error.message
              : 'Não foi possível concluir a emissão. Verifique a configuração e tente novamente.',
        };
        await this.prisma.$transaction(async (tx) => {
          await tx.certificateIssuanceRun.update({
            where: { id: runId },
            data: { status: failed.status, completedAt: failed.completedAt, error: failed.error },
          });
          await this.audit.recordRun(tx, failed);
        });
        throw error;
      }
    });
  }

  private async enqueueBestEffort(run: CertificateIssuanceRun): Promise<void> {
    try {
      const jobId = buildBullMqJobId('certificate-issuance', run.id);
      const existing = await this.queue.getJob(jobId);
      if (existing && (await existing.getState()) === 'failed') {
        await this.prisma.$transaction(async (tx) => {
          const failed = await tx.certificateIssuanceRun.update({
            where: { id: run.id },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              error: 'O processamento foi interrompido. Solicite uma nova emissão.',
            },
          });
          await this.audit.recordRun(tx, failed);
        });
        return;
      }
      if (existing) return;
      await this.queue.add(
        ISSUE_CERTIFICATES_JOB,
        { runId: run.id },
        {
          jobId,
          priority: run.automatic ? 10 : 1,
          delay: Math.max(run.scheduledAt.getTime() - Date.now(), 0),
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(`Certificate issuance ${run.id} saved; enqueue will be retried.`, error);
    }
  }

  private withSystemAudience<T>(operation: () => Promise<T>): Promise<T> {
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, operation);
  }
}

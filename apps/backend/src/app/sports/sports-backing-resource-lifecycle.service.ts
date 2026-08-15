import { EventGroupUpdateInput, EventUpdateInput, MajorEventUpdateInput } from '@cacic-fct/shared-data-types';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class SportsBackingResourceLifecycleService {
  async assertEventCreateAllowed(tx: TransactionClient, eventGroupId: string | null | undefined): Promise<void> {
    if (!eventGroupId) return;
    const category = await tx.sportsCategory.findFirst({
      where: { eventGroupId, deletedAt: null },
      select: { id: true },
    });
    if (category) {
      throw new ConflictException(
        'Este grupo representa uma modalidade esportiva. Crie a partida pela administração esportiva.',
      );
    }
  }

  async assertEventUpdateAllowed(tx: TransactionClient, eventId: string, input: EventUpdateInput): Promise<void> {
    const match = await tx.sportsMatch.findFirst({
      where: { eventId, deletedAt: null },
      select: {
        event: {
          select: {
            id: true,
            majorEventId: true,
            eventGroupId: true,
            creditMinutes: true,
            emoji: true,
            type: true,
            latitude: true,
            longitude: true,
            locationDescription: true,
            allowSubscription: true,
            requiresImageLicenseAgreement: true,
            subscriptionStartDate: true,
            subscriptionEndDate: true,
            slots: true,
            autoSubscribe: true,
            shouldIssueCertificate: true,
            shouldIssueCertificateForNonPayingAttendees: true,
            shouldIssueCertificateForNonSubscribedAttendees: true,
            shouldCollectAttendance: true,
            isOnlineAttendanceAllowed: true,
            shouldProvideSubscriberListToLecturer: true,
            onlineAttendanceCode: true,
            onlineAttendanceStartDate: true,
            onlineAttendanceEndDate: true,
            youtubeCode: true,
          },
        },
      },
    });
    if (!match) return;

    const event = match.event;
    const changesOwnership =
      this.changed(input.id, event.id) ||
      this.changed(input.majorEventId, event.majorEventId) ||
      this.changed(input.eventGroupId, event.eventGroupId) ||
      this.changed(input.latitude, event.latitude) ||
      this.changed(input.longitude, event.longitude) ||
      this.changed(input.locationDescription, event.locationDescription) ||
      this.changed(input.shouldIssueCertificate, event.shouldIssueCertificate);

    if (changesOwnership) {
      throw new ConflictException(
        'Este evento representa uma partida esportiva. Altere a estrutura da partida pela administração esportiva.',
      );
    }
  }

  async assertEventDeleteAllowed(tx: TransactionClient, eventId: string): Promise<void> {
    const match = await tx.sportsMatch.findFirst({
      where: { eventId, deletedAt: null },
      select: { id: true },
    });
    if (match) {
      throw new ConflictException(
        'Este evento representa uma partida esportiva. Exclua a partida pela administração esportiva.',
      );
    }
  }

  async synchronizeEventGroupUpdate(
    tx: TransactionClient,
    eventGroupId: string,
    input: EventGroupUpdateInput,
  ): Promise<void> {
    const category = await tx.sportsCategory.findFirst({
      where: { eventGroupId, deletedAt: null },
      select: {
        eventGroup: {
          select: {
            shouldIssueCertificate: true,
            shouldIssueCertificateForNonPayingAttendees: true,
            shouldIssueCertificateForNonSubscribedAttendees: true,
            shouldIssueCertificateForEachEvent: true,
            shouldIssuePartialCertificate: true,
          },
        },
      },
    });
    if (!category) return;

    if (input.id !== undefined && input.id !== eventGroupId) {
      throw new ConflictException(
        'Este grupo representa uma modalidade esportiva. O identificador do grupo não pode ser alterado.',
      );
    }
    const certificateSettingsChanged =
      input.shouldIssueCertificate !== undefined ||
      input.shouldIssueCertificateForNonPayingAttendees !== undefined ||
      input.shouldIssueCertificateForNonSubscribedAttendees !== undefined ||
      input.shouldIssueCertificateForEachEvent !== undefined ||
      input.shouldIssuePartialCertificate !== undefined;
    if (certificateSettingsChanged) {
      throw new ConflictException(
        'Este grupo representa uma modalidade esportiva. Altere os certificados pela administração esportiva.',
      );
    }
    if (input.name !== undefined) {
      throw new ConflictException(
        'Este grupo representa uma modalidade esportiva. Altere o nome pela administração esportiva.',
      );
    }
  }

  async assertEventGroupDeleteAllowed(tx: TransactionClient, eventGroupId: string): Promise<void> {
    const category = await tx.sportsCategory.findFirst({
      where: { eventGroupId, deletedAt: null },
      select: { id: true },
    });
    if (category) {
      throw new ConflictException(
        'Este grupo representa uma modalidade esportiva. Exclua a modalidade pela administração esportiva.',
      );
    }
  }

  async assertMajorEventUpdateAllowed(
    tx: TransactionClient,
    majorEventId: string,
    input: MajorEventUpdateInput,
  ): Promise<void> {
    if (input.id === undefined || input.id === majorEventId) return;
    const tournament = await tx.sportsTournament.findFirst({
      where: { majorEventId, deletedAt: null },
      select: { id: true },
    });
    if (tournament) {
      throw new ConflictException(
        'Este grande evento representa um torneio esportivo. O identificador não pode ser alterado.',
      );
    }
  }

  async assertMajorEventDeleteAllowed(tx: TransactionClient, majorEventId: string): Promise<void> {
    const tournament = await tx.sportsTournament.findFirst({
      where: { majorEventId, deletedAt: null },
      select: { id: true },
    });
    if (tournament) {
      throw new ConflictException(
        'Este grande evento representa um torneio esportivo. Exclua o torneio pela administração esportiva.',
      );
    }
  }

  private changed<T>(submitted: T | undefined, persisted: T | null): boolean {
    if (submitted === undefined) return false;
    if (submitted instanceof Date || persisted instanceof Date) {
      const submittedTime = submitted instanceof Date ? submitted.getTime() : Number.NaN;
      const persistedTime = persisted instanceof Date ? persisted.getTime() : Number.NaN;
      return submittedTime !== persistedTime;
    }
    return submitted !== persisted;
  }
}

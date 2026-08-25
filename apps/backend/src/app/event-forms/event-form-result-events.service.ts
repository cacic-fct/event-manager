import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { SseReplayService } from '../realtime/sse-replay.service';

@Injectable()
export class EventFormResultEventsService {
  private readonly logger = new Logger(EventFormResultEventsService.name);
  private readonly resultSubjects = new Map<string, { subject: Subject<MessageEvent>; subscriberCount: number }>();

  constructor(private readonly replay: SseReplayService) {}

  watchResults(formId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let entry = this.resultSubjects.get(formId);
      if (!entry) {
        entry = { subject: new Subject<MessageEvent>(), subscriberCount: 0 };
        this.resultSubjects.set(formId, entry);
      }
      entry.subscriberCount += 1;
      const subscription = entry.subject.subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        const currentEntry = this.resultSubjects.get(formId);
        if (currentEntry !== entry) {
          return;
        }
        currentEntry.subscriberCount -= 1;
        if (currentEntry.subscriberCount === 0) {
          currentEntry.subject.complete();
          this.resultSubjects.delete(formId);
        }
      };
    });
  }

  async emitResultsDeltas(formIds: readonly string[]): Promise<void> {
    for (const formId of [...new Set(formIds)]) {
      await this.emitResultsDelta(formId);
    }
  }

  async emitResultsDelta(formId: string): Promise<void> {
    const entry = this.resultSubjects.get(formId);
    const event = {
      type: 'message',
      data: {
        formId,
        updatedAt: new Date().toISOString(),
      },
    } satisfies MessageEvent;

    entry?.subject.next(event);

    try {
      await this.replay.record(this.replay.scope('event-form-results', formId), event);
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Could not record form result SSE replay event.');
    }
  }
}

import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { SseReplayService } from '../realtime/sse-replay.service';

@Injectable()
export class EventFormResultEventsService {
  private readonly logger = new Logger(EventFormResultEventsService.name);
  private readonly resultSubjects = new Map<string, Subject<MessageEvent>>();

  constructor(private readonly replay: SseReplayService) {}

  watchResults(formId: string): Observable<MessageEvent> {
    let subject = this.resultSubjects.get(formId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.resultSubjects.set(formId, subject);
    }
    return subject.asObservable();
  }

  async emitResultsDeltas(formIds: readonly string[]): Promise<void> {
    for (const formId of [...new Set(formIds)]) {
      await this.emitResultsDelta(formId);
    }
  }

  async emitResultsDelta(formId: string): Promise<void> {
    const subject = this.resultSubjects.get(formId);
    const event = {
      type: 'message',
      data: {
        formId,
        updatedAt: new Date().toISOString(),
      },
    } satisfies MessageEvent;

    subject?.next(event);

    try {
      await this.replay.record(this.replay.scope('event-form-results', formId), event);
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Could not record form result SSE replay event.');
    }
  }
}

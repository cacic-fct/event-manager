import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class EventFormResultEventsService {
  private readonly resultSubjects = new Map<string, Subject<MessageEvent>>();

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
    if (!subject) {
      return;
    }

    subject.next({
      type: 'message',
      data: {
        formId,
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

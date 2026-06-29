import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventFormsService } from './event-forms.service';

@Injectable()
export class EventFormsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventFormsScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private publishing = false;

  constructor(private readonly forms: EventFormsService) {}

  onModuleInit(): void {
    void this.publishDueForms();
    this.timer = setInterval(() => {
      void this.publishDueForms();
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async publishDueForms(): Promise<void> {
    if (this.publishing) {
      return;
    }
    this.publishing = true;
    try {
      const count = await this.forms.publishDueScheduledForms();
      if (count > 0) {
        this.logger.log(`Published ${count} scheduled event form${count === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      this.logger.warn(`Scheduled event form publication failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.publishing = false;
    }
  }
}

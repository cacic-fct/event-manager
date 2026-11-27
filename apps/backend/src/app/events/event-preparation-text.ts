import { MAX_EVENT_INFORMATION_LENGTH } from '@cacic-fct/shared-event-preparation';
import { BadRequestException } from '@nestjs/common';

export function normalizeInformation(content: string | null | undefined): string | null {
  if (content != null && content.length > MAX_EVENT_INFORMATION_LENGTH) {
    throw new BadRequestException('Use até 10.000 caracteres por orientação.');
  }
  return content?.trim() || null;
}

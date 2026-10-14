import { BadRequestException } from '@nestjs/common';

/** Only deliberately authored, non-sensitive validation messages reach import previews. */
export class TransferValidationException extends BadRequestException {}

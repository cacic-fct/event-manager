import { status } from '@grpc/grpc-js';
import { BadRequestException } from '@nestjs/common';
import { toServiceError } from './event-manager-grpc.server';

describe('toServiceError', () => {
  it('keeps HttpException details and hides unexpected error messages', () => {
    expect(toServiceError(new BadRequestException('Invalid request.'))).toMatchObject({
      code: status.INVALID_ARGUMENT,
      details: 'Invalid request.',
    });
    expect(toServiceError(new Error('database password leaked'))).toMatchObject({
      code: status.INTERNAL,
      details: 'Internal gRPC service error.',
    });
  });
});

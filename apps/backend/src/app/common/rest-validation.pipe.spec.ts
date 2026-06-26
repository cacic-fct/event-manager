import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { REST_VALIDATION_PIPE } from './rest-validation.pipe';

class RestValidationFixtureDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

describe('REST_VALIDATION_PIPE', () => {
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: RestValidationFixtureDto,
    data: '',
  };

  it('transforms valid request bodies into DTO instances', async () => {
    const result = await REST_VALIDATION_PIPE.transform({ name: 'Oficina', note: 'Publicar' }, metadata);

    expect(result).toBeInstanceOf(RestValidationFixtureDto);
    expect(result).toMatchObject({
      name: 'Oficina',
      note: 'Publicar',
    });
  });

  it('rejects properties that are not declared by the DTO', async () => {
    await expect(
      REST_VALIDATION_PIPE.transform({ name: 'Oficina', unexpected: 'value' }, metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid property types', async () => {
    await expect(REST_VALIDATION_PIPE.transform({ name: 123 }, metadata)).rejects.toThrow(BadRequestException);
  });
});

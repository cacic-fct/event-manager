import { BadRequestException } from '@nestjs/common';
import {
  parseAnswersJson,
  parseAnswersValue,
} from './event-form-answer-normalization';

describe('event form answer parsing', () => {
  it('parses stored answer values and rejects malformed non-list payloads', () => {
    expect(
      parseAnswersValue([
        { elementId: 'feedback', value: 'Ótimo' },
        { elementId: '', value: 'ignorado' },
        null,
      ]),
    ).toEqual([{ elementId: 'feedback', value: 'Ótimo' }]);

    expect(() => parseAnswersValue({ elementId: 'feedback', value: 'inválido' })).toThrow(
      'Respostas devem ser uma lista.',
    );
    expect(() => parseAnswersJson('{"elementId":"feedback","value":"inválido"}')).toThrow(BadRequestException);
    expect(() => parseAnswersJson('{"elementId":"feedback","value":"inválido"}')).toThrow(
      'Respostas devem ser uma lista.',
    );
  });
});

import { buildCommandArguments, commandArguments } from './command-arguments';
import { sportsCommand } from './admin-operations.fixtures';

describe('command arguments', () => {
  it('resolves nested schema references and preserves target requirements while omitting optional leaves', () => {
    const command = sportsCommand();
    command.arguments = { input: { eventId: 'event', notes: 'Observação', name: 'Nome' } };
    command.inputSchema = {
      type: 'object',
      required: ['input'],
      properties: { input: { $ref: '#/$defs/Input' } },
      $defs: {
        Input: {
          type: 'object',
          required: ['name'],
          properties: {
            eventId: { type: 'string' },
            notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            name: { type: 'string' },
          },
        },
      },
    };
    const fields = buildCommandArguments(command);
    expect(fields[0].locked).toBe(true);
    const children = fields[0].children;
    expect(children[0].locked).toBe(true);
    expect(children[1].schema['type']).toBe('string');
    expect(children[2].required).toBe(true);
    children[1].included = false;
    children[2].value = 'Revisado';
    expect(commandArguments(fields)).toEqual({ input: { eventId: 'event', name: 'Revisado' } });
    expect(command.arguments['input']).toEqual({ eventId: 'event', notes: 'Observação', name: 'Nome' });
  });
  it('allows narrowing multiple targets but locks singleton targets', () => {
    const command = { ...sportsCommand(), arguments: { eventIds: ['a', 'b'], matchIds: ['match'], eventId: 'event' } };
    const fields = buildCommandArguments(command);
    expect(fields.map((field) => field.locked)).toEqual([false, true, true]);
  });
});

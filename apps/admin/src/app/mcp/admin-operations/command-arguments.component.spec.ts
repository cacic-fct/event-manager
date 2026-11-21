import { TestBed } from '@angular/core/testing';
import { CommandArgumentsComponent } from './command-arguments.component';
import { buildCommandArguments } from './command-arguments';
import { sportsCommand } from './admin-operations.fixtures';

describe('CommandArgumentsComponent', () => {
  it('shows server normalization, omitted fields and additional defaults before execution', () => {
    const fixture = TestBed.createComponent(CommandArgumentsComponent);
    fixture.componentRef.setInput('fields', buildCommandArguments(sportsCommand()));
    fixture.componentRef.setInput('finalValues', { matchId: 'partida-demo', score: 4, name: 'Nome normalizado' });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Nome normalizado');
    expect(text).toContain('Não será aplicado');
    expect(text).toContain('Validado para execução');
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('button')).every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true);
  });
  it('shows server-restored defaults even when an optional object was excluded', () => {
    const command = { ...sportsCommand(), arguments: { input: { name: 'Proposto' } } };
    const fields = buildCommandArguments(command);
    fields[0].included = false;
    const fixture = TestBed.createComponent(CommandArgumentsComponent);
    fixture.componentRef.setInput('fields', fields);
    fixture.componentRef.setInput('finalValues', { input: { name: 'Padrão do servidor' } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Padrão do servidor');
  });
});

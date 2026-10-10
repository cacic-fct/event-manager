import userEvent from '@testing-library/user-event';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoleDemoComponent } from './role-demo';

describe('RoleDemoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RoleDemoComponent] }).compileComponents();
  });

  it('creates a role with only the selected permissions', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();

    await user.click(permissionCheckbox(fixture, 'certificates'));
    fixture.detectChanges();
    await user.click(buttonByText(fixture, 'Criar cargo'));
    fixture.detectChanges();

    expect(fixture.componentInstance.savedRole()).toEqual({
      name: 'Equipe de credenciamento',
      permissionIds: ['subscriptions', 'attendance', 'certificates'],
    });
    expect(fixture.nativeElement.textContent).toContain('Cargo criado');
    expect(fixture.nativeElement.textContent).toContain('Emitir certificados');
    expect(fixture.nativeElement.textContent).not.toContain('Conferir comprovantes');
  });

  it('edits the saved role and reports the updated state', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();

    await user.click(buttonByText(fixture, 'Criar cargo'));
    fixture.detectChanges();
    await user.click(buttonByText(fixture, 'Editar cargo'));
    fixture.detectChanges();

    const name = fixture.nativeElement.querySelector('#role-name') as HTMLInputElement;
    await user.clear(name);
    await user.type(name, 'Equipe de apoio');
    await user.click(permissionCheckbox(fixture, 'receipts'));
    fixture.detectChanges();
    await user.click(buttonByText(fixture, 'Salvar alterações'));
    fixture.detectChanges();

    expect(fixture.componentInstance.savedRole()?.name).toBe('Equipe de apoio');
    expect(fixture.componentInstance.lastSaveAction()).toBe('updated');
    expect(fixture.nativeElement.textContent).toContain('Alterações salvas');
    expect(fixture.nativeElement.textContent).toContain('Conferir comprovantes');
  });

  it('starts another role with an empty name and no inherited selections', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();

    await user.click(buttonByText(fixture, 'Criar cargo'));
    fixture.detectChanges();
    await user.click(buttonByText(fixture, 'Criar outro cargo'));
    fixture.detectChanges();

    const name = fixture.nativeElement.querySelector('#role-name') as HTMLInputElement;
    const createButton = buttonByText(fixture, 'Criar cargo');
    expect(name.value).toBe('');
    expect(fixture.componentInstance.selectedPermissionIds()).toEqual([]);
    expect(createButton.disabled).toBe(true);

    await user.type(name, 'Monitores de atividades');
    await user.click(permissionCheckbox(fixture, 'attendance'));
    fixture.detectChanges();

    expect(createButton.disabled).toBe(false);
    await user.click(createButton);
    fixture.detectChanges();
    expect(fixture.componentInstance.savedRole()).toEqual({
      name: 'Monitores de atividades',
      permissionIds: ['attendance'],
    });
  });
});

function createFixture(): ComponentFixture<RoleDemoComponent> {
  const fixture = TestBed.createComponent(RoleDemoComponent);
  fixture.detectChanges();
  return fixture;
}

function permissionCheckbox(
  fixture: ComponentFixture<RoleDemoComponent>,
  permissionId: string,
): HTMLInputElement {
  const element = fixture.nativeElement.querySelector(
    `[data-permission-id="${permissionId}"] input[type="checkbox"]`,
  ) as HTMLInputElement | null;
  if (!element) {
    throw new Error(`Permission checkbox not found: ${permissionId}`);
  }
  return element;
}

function buttonByText(fixture: ComponentFixture<RoleDemoComponent>, label: string): HTMLButtonElement {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  if (!button) {
    throw new Error(`Role demo button not found: ${label}`);
  }
  return button;
}

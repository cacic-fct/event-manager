import { signal } from '@angular/core';
import { SPORTS_FORMAT_OPTIONS } from './sports-format-guide.component';
import { SportsWorkspaceSection } from './sports-workspace-section.base';

class SportsWorkspaceSectionHarness extends SportsWorkspaceSection {
  format(value: string) {
    return this.formatLabel(value);
  }

  emoji(value: string) {
    return this.sportEmoji(value);
  }

  categoryStatus(status: string) {
    return this.categoryStatusLabel(status);
  }

  category(id: string) {
    return this.categoryName(id);
  }

  logo(registrationId?: string | null) {
    return this.teamLogoForRegistration(registrationId);
  }

  lineupRole(role: string) {
    return this.lineupRoleLabel(role);
  }

  officialRole(role: string) {
    return this.officialRoleLabel(role);
  }

  changeType(type: string) {
    return this.changeTypeLabel(type);
  }

  actionType(type: string) {
    return this.actionTypeLabel(type);
  }

  scoreSource(source: string) {
    return this.scoreSourceLabel(source);
  }

  chooseCategory(id: string) {
    this.selectCategoryById(id);
  }

  chooseMatch(read: never, id: string) {
    this.selectBracketMatch(read, id);
  }

  upload(event: Event) {
    this.uploadTeamLogo(event);
  }
}

describe('SportsWorkspaceSection', () => {
  const selectCategory = vi.fn();
  const selectMatch = vi.fn();
  const uploadTeamLogo = vi.fn();
  const workspace = {
    tournamentRead: signal({
      categories: [{ id: 'category-1', name: 'Futsal' }],
      teams: [{ id: 'team-1', name: 'Azul', logoUrl: '/logo.avif' }],
    }),
    categoryRead: signal({
      registrations: [{ id: 'registration-1', teamId: 'team-1' }],
      matches: [{ id: 'match-1' }],
    }),
    selectCategory,
    selectMatch,
    uploadTeamLogo,
  };
  let section: SportsWorkspaceSectionHarness;

  beforeEach(() => {
    vi.clearAllMocks();
    section = Object.create(SportsWorkspaceSectionHarness.prototype) as SportsWorkspaceSectionHarness;
    Object.assign(section, {
      workspace,
      formats: SPORTS_FORMAT_OPTIONS,
      categoryStatuses: [
        ['ACTIVE', 'Ativa'],
        ['FINISHED', 'Finalizada'],
      ],
    });
  });

  it('provides localized labels and safe fallbacks', () => {
    expect(section.format('SWISS')).toBe('Sistema suíço');
    expect(section.format('UNKNOWN')).toBe('UNKNOWN');
    expect(section.categoryStatus('ACTIVE')).toBe('Ativa');
    expect(section.categoryStatus('UNKNOWN')).toBe('UNKNOWN');
    expect(section.lineupRole('PLAYER')).toBe('Atleta');
    expect(section.lineupRole('STAFF')).toBe('Apoio');
    expect(section.lineupRole('UNKNOWN')).toBe('Integrante');
    expect(section.officialRole('REFEREE')).toBe('Árbitro');
    expect(section.officialRole('UNKNOWN')).toBe('Função esportiva');
    expect(section.changeType('LOGO')).toBe('Escudo da equipe');
    expect(section.changeType('UNKNOWN')).toBe('Alteração da equipe');
    expect(section.actionType('FINALIZE')).toBe('Finalização');
    expect(section.actionType('UNKNOWN')).toBe('Ação da partida');
    expect(section.scoreSource('PENALTY')).toBe('Penalidade');
    expect(section.scoreSource('UNKNOWN')).toBe('Outra origem');
    expect(section.emoji('FUTSAL')).not.toBe('');
  });

  it('looks up categories and registration team logos', () => {
    expect(section.category('category-1')).toBe('Futsal');
    expect(section.category('missing')).toBe('Modalidade');
    expect(section.logo('registration-1')).toBe('/logo.avif');
    expect(section.logo()).toBeNull();
    expect(section.logo('missing')).toBeNull();
  });

  it('selects only existing categories and matches', () => {
    section.chooseCategory('category-1');
    section.chooseCategory('missing');
    section.chooseMatch(workspace.categoryRead() as never, 'match-1');
    section.chooseMatch(workspace.categoryRead() as never, 'missing');

    expect(selectCategory).toHaveBeenCalledOnce();
    expect(selectMatch).toHaveBeenCalledOnce();
  });

  it('uploads the selected logo and clears the file input', () => {
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    const input = { files: [file], value: 'logo.png' };

    section.upload({ target: input } as unknown as Event);

    expect(uploadTeamLogo).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
  });

  it('ignores logo changes without a selected file', () => {
    section.upload({ target: { files: [], value: '' } } as unknown as Event);
    expect(uploadTeamLogo).not.toHaveBeenCalled();
  });
});

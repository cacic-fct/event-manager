import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';
import { PAGE_TITLE_SUFFIX, PageTitleStrategy } from './page-title-strategy';

describe('PageTitleStrategy', () => {
  let strategy: PageTitleStrategy;
  let title: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PageTitleStrategy, Title],
    });

    strategy = TestBed.inject(PageTitleStrategy);
    title = TestBed.inject(Title);
    title.setTitle(PAGE_TITLE_SUFFIX);
  });

  it('appends the CACiC Eventos suffix when a route title is set', () => {
    vi.spyOn(strategy, 'buildTitle').mockReturnValue('Calendário');

    strategy.updateTitle({} as RouterStateSnapshot);

    expect(title.getTitle()).toBe('Calendário - CACiC Eventos');
  });

  it('keeps the existing page title when a route has no title', () => {
    vi.spyOn(strategy, 'buildTitle').mockReturnValue(undefined);

    strategy.updateTitle({} as RouterStateSnapshot);

    expect(title.getTitle()).toBe('CACiC Eventos');
  });
});

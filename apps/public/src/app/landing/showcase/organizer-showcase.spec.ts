import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrganizerShowcaseComponent } from './organizer-showcase';

describe('OrganizerShowcaseComponent', () => {
  let fixture: ComponentFixture<OrganizerShowcaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [OrganizerShowcaseComponent] }).compileComponents();
    fixture = TestBed.createComponent(OrganizerShowcaseComponent);
    fixture.detectChanges();
  });

  it('exposes both event operations and the smart dashboard', () => {
    const element = fixture.nativeElement as HTMLElement;
    const featureButtons = [...element.querySelectorAll('.feature-picker button')];
    expect(featureButtons.map((button) => button.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Eventos e inscrições'),
      expect.stringContaining('Painel inteligente'),
      expect.stringContaining('Presenças'),
    ]));
  });
});

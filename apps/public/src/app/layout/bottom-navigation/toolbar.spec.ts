import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BottomToolbarComponent } from './toolbar';
import { ToolbarItem } from './layout';

describe('BottomToolbarComponent', () => {
  let component: BottomToolbarComponent;
  let fixture: ComponentFixture<BottomToolbarComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomToolbarComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(BottomToolbarComponent);
    component = fixture.componentInstance;
    const items: ToolbarItem[] = [];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sets --app-bottom-toolbar-height CSS variable', () => {
    const val = document.documentElement.style.getPropertyValue('--app-bottom-toolbar-height');
    // can be '0px' in JSDOM but must be set
    expect(val).toMatch(/^\d+px$/);
  });

  it('renders navigation destinations as links', () => {
    fixture.componentRef.setInput('items', [
      {
        label: 'Calendário',
        shortLabel: 'Agenda',
        icon: 'calendar_month',
        route: '/calendar',
        hidden: false,
      },
    ] satisfies ToolbarItem[]);
    fixture.detectChanges();

    const destination = fixture.nativeElement.querySelector('.nav-btn') as HTMLElement;

    expect(destination.tagName).toBe('A');
    expect(destination.getAttribute('href')).toBe('/calendar');
  });
});

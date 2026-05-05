import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BottomToolbarComponent } from './bottom-toolbar.component';
describe('BottomToolbarComponent', () => {
  let component: BottomToolbarComponent;
  let fixture: ComponentFixture<BottomToolbarComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomToolbarComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(BottomToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sets --app-bottom-toolbar-height CSS variable', () => {
    const val = document.documentElement.style.getPropertyValue(
      '--app-bottom-toolbar-height',
    );
    // can be '0px' in JSDOM but must be set
    expect(val).toMatch(/^\d+px$/);
  });
});

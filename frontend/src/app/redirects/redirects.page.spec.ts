import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RedirectsPage } from './redirects.page';

describe('RedirectsPage', () => {
  let component: RedirectsPage;
  let fixture: ComponentFixture<RedirectsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(RedirectsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

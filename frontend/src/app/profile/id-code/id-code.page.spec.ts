import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IdCodePage } from './id-code.page';

describe('IdCodePage', () => {
  let component: IdCodePage;
  let fixture: ComponentFixture<IdCodePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(IdCodePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

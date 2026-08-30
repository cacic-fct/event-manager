import type { ComponentFixture } from '@angular/core/testing';

export async function waitForDrawRefresh<T>(fixture: ComponentFixture<T>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  await fixture.whenStable();
}

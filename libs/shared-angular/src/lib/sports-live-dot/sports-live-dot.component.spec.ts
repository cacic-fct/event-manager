import '@angular/compiler';
import { SportsLiveDotComponent } from './sports-live-dot.component';

describe('SportsLiveDotComponent', () => {
  it('subscribes to the shared animation while mounted and releases it on destroy', () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const component = Object.create(SportsLiveDotComponent.prototype) as SportsLiveDotComponent;
    Object.assign(component, { animation: { subscribe } });

    component.ngOnInit();
    expect(subscribe).toHaveBeenCalledOnce();

    component.ngOnDestroy();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

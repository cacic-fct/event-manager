import { Component, DestroyRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { bindLiveSearch, LiveSearchRef } from './live-search';

@Component({
  template: '',
})
class LiveSearchHostComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly control = new FormControl('', { nonNullable: true });
  readonly search = vi.fn(() => Promise.resolve());
  readonly liveSearch: LiveSearchRef = bindLiveSearch({
    control: this.control,
    destroyRef: this.destroyRef,
    search: this.search,
  });
}

describe('bindLiveSearch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs search as the control value changes', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(LiveSearchHostComponent);
    const host = fixture.componentInstance;

    host.control.setValue('aula');

    await vi.advanceTimersByTimeAsync(250);

    expect(host.search).toHaveBeenCalledWith('aula');
  });

  it('disables automatic searches after a live request fails while manual search still works', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(LiveSearchHostComponent);
    const host = fixture.componentInstance;
    host.search.mockRejectedValueOnce(new Error('Typesense unavailable'));

    host.control.setValue('a');
    await vi.advanceTimersByTimeAsync(250);
    host.control.setValue('au');
    await vi.advanceTimersByTimeAsync(250);

    expect(host.search).toHaveBeenCalledTimes(1);

    await host.liveSearch.searchNow();

    expect(host.search).toHaveBeenCalledTimes(2);
    expect(host.search).toHaveBeenLastCalledWith('au');
  });
});

import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';

export type LiveSearchRef = {
  enable(): void;
  disable(): void;
  searchNow(): Promise<void>;
};

type LiveSearchOptions<TValue> = {
  control: AbstractControl<TValue>;
  destroyRef: DestroyRef;
  search: (value: TValue) => Promise<void>;
  debounceMs?: number;
};

const DEFAULT_LIVE_SEARCH_DEBOUNCE_MS = 250;

export function bindLiveSearch<TValue>({
  control,
  destroyRef,
  search,
  debounceMs = DEFAULT_LIVE_SEARCH_DEBOUNCE_MS,
}: LiveSearchOptions<TValue>): LiveSearchRef {
  let enabled = true;

  const ref: LiveSearchRef = {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
    },
    async searchNow() {
      await search(control.value);
    },
  };

  control.valueChanges
    .pipe(
      debounceTime(debounceMs),
      distinctUntilChanged((left, right) => JSON.stringify(left) === JSON.stringify(right)),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe((value) => {
      if (!enabled) {
        return;
      }

      void search(value).catch(() => {
        ref.disable();
      });
    });

  return ref;
}

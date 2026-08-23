import { Service, signal } from '@angular/core';

@Service()
export class PendingPermissionChangesService {
  readonly dirty = signal(false);
  readonly blockedNavigation = signal(false);
  readonly saving = signal(false);
  private resetCallback: (() => void) | null = null;
  private saveCallback: (() => Promise<void>) | null = null;

  register(actions: { reset: () => void; save: () => Promise<void> }): void {
    this.resetCallback = actions.reset;
    this.saveCallback = actions.save;
  }

  clear(): void {
    this.dirty.set(false);
    this.blockedNavigation.set(false);
  }

  markDirty(): void {
    this.dirty.set(true);
    this.blockedNavigation.set(false);
  }

  blockNavigation(): boolean {
    if (!this.dirty()) return false;
    this.blockedNavigation.set(true);
    globalThis.setTimeout(() => this.blockedNavigation.set(false), 1200);
    return true;
  }

  reset(): void {
    this.resetCallback?.();
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try { await this.saveCallback?.(); } finally { this.saving.set(false); }
  }
}

import { InjectionToken, Provider, Type } from '@angular/core';
import { UrlTree } from '@angular/router';
import { Observable } from 'rxjs';

export type InterruptionPriority = 'URGENT' | 'NORMAL';

export const INTERRUPTION_PRIORITIES = {
  URGENT: 0,
  NORMAL: 1,
} as const satisfies Record<InterruptionPriority, number>;

/**
 * Lower values are handled first within the same priority. Keep these values
 * sparse so new flows can be inserted without changing existing ordering.
 */
export const INTERRUPTION_PRIORITY_ORDERS = {
  SPORTS_MATCH: 50,
  ONLINE_ATTENDANCE: 100,
  IMAGE_LICENSE_AGREEMENT: 150,
  REQUIRED_SUBSCRIPTION_FORM: 200,
  DEFAULT_REDIRECT: Number.MAX_SAFE_INTEGER,
} as const;

export type InterruptionContext = {
  currentUrl: string;
};

export type Interruption = {
  id: string;
  priority: InterruptionPriority;
  priorityOrder: number;
  target: UrlTree;
};

export interface InterruptionFlow {
  resolve(context: InterruptionContext): Observable<Interruption | null>;
  changes?(): Observable<unknown>;
  /** Resolve only after ordinary interruption flows produce no applicable candidate. */
  isFallback?: boolean;
}

export const INTERRUPTION_FLOW = new InjectionToken<InterruptionFlow>('INTERRUPTION_FLOW');

export function provideInterruptionFlow(flow: Type<InterruptionFlow>): Provider {
  return {
    provide: INTERRUPTION_FLOW,
    multi: true,
    useExisting: flow,
  };
}

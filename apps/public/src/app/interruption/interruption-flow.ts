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
  ONLINE_ATTENDANCE: 100,
  REQUIRED_SUBSCRIPTION_FORM: 200,
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
}

export const INTERRUPTION_FLOW = new InjectionToken<InterruptionFlow>('INTERRUPTION_FLOW');

export function provideInterruptionFlow(flow: Type<InterruptionFlow>): Provider {
  return {
    provide: INTERRUPTION_FLOW,
    multi: true,
    useExisting: flow,
  };
}

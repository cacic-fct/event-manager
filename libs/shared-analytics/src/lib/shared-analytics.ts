export const UMAMI_BROWSER_WEBSITE_IDS = {
  public: 'df6b1fa8-7566-4cb0-8dff-279d15cc0b5d',
  admin: 'd8c04657-2416-4af4-b21f-99ea8dcfc5d4',
} as const;

export const UMAMI_BROWSER_EVENT_PATH = '/metrics/product';
export const UMAMI_OPERATIONS_EVENT_PATH = '/metrics/operations';

const LOGIN_EVENTS = ['login_button_attempt', 'login_guard_redirect', 'silent_sso_failed'] as const;

export const UMAMI_EVENTS = {
  public: [
    ...LOGIN_EVENTS,
    'login_callback_expired',
    'login_callback_failed',
    'calendar_search_completed',
    'calendar_view_changed',
    'event_detail_viewed',
    'event_share_link_copied',
    'self_attendance_confirmed',
    'collector_attendance_registered',
    'major_event_registration_attempted',
    'major_event_registration_saved',
    'ticket_checkout_started',
    'payment_pix_copied',
    'product_action_failed',
    'ticket_receipt_submitted',
    'registration_receipt_submitted',
  ],
  admin: [
    ...LOGIN_EVENTS,
    'ticket_sale_approved',
    'ticket_sale_rejected',
    'registration_payment_approved',
    'registration_payment_rejected',
    'registration_payment_review_undone',
  ],
  operations: [
    'backend_started',
    'database_unavailable',
    'database_recovered',
    'redis_unavailable',
    'redis_recovered',
    'calendar_feed_maintenance_completed',
    'calendar_feed_maintenance_failed',
  ],
} as const;

export type UmamiAnalyticsSource = keyof typeof UMAMI_EVENTS;
export type UmamiBrowserEvent = (typeof UMAMI_EVENTS)['public' | 'admin'][number];
export type UmamiOperationsEvent = (typeof UMAMI_EVENTS)['operations'][number];
export type UmamiAnalyticsEvent = UmamiBrowserEvent | UmamiOperationsEvent;

const REGISTRATION_DIMENSIONS = {
  flow: ['standard', 'ranked'],
  action: ['created', 'updated'],
  payment_mode: ['free_event', 'paid_event'],
} as const;

export const UMAMI_BROWSER_DIMENSIONS = {
  calendar_search_completed: {
    result: ['matches', 'empty'],
    source: ['network', 'cache'],
  },
  calendar_view_changed: { view: ['list', 'week'] },
  major_event_registration_attempted: REGISTRATION_DIMENSIONS,
  major_event_registration_saved: REGISTRATION_DIMENSIONS,
  payment_pix_copied: {
    checkout: ['ticket', 'registration'],
    method: ['code', 'key'],
  },
  product_action_failed: {
    action: ['registration', 'ticket_receipt', 'registration_receipt', 'self_attendance'],
    reason: ['rate_limited', 'network', 'rejected', 'server', 'unknown'],
  },
} as const satisfies Partial<Record<UmamiBrowserEvent, Record<string, readonly string[]>>>;

type BrowserDimensionCatalog = typeof UMAMI_BROWSER_DIMENSIONS;

type BrowserEventData<Name extends keyof BrowserDimensionCatalog> = {
  [Key in keyof BrowserDimensionCatalog[Name]]: BrowserDimensionCatalog[Name][Key] extends readonly (infer Value)[]
    ? Value
    : never;
};

export type UmamiBrowserEventArgs = {
  [Name in UmamiBrowserEvent]: Name extends keyof BrowserDimensionCatalog
    ? [name: Name, data: BrowserEventData<Name>]
    : [name: Name];
}[UmamiBrowserEvent];

export type UsageDashboard = { source: UmamiAnalyticsSource; url: string };

export type UsageReport = {
  startAt: number;
  endAt: number;
  sources: {
    source: UmamiAnalyticsSource;
    events: { name: UmamiAnalyticsEvent; count: number }[];
  }[];
};

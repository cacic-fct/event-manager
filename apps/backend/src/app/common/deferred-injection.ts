/**
 * Keeps explicit `forwardRef` injection tokens from being eagerly evaluated
 * by emitted constructor metadata while preserving the service's TypeScript type.
 */
export type DeferredInjection<T> = T;

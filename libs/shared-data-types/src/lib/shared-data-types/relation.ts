/**
 * Keeps GraphQL relations from appearing as eager class references in emitted
 * decorator metadata. The explicit `@Field(() => Type)` callback remains the
 * schema source while the generic alias erases `design:type` to `Object`.
 */
export type Relation<T> = T;

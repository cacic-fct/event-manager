import { filter, Observable, OperatorFunction, pipe, UnaryFunction } from 'rxjs';

// Attribution: piedar
// https://stackoverflow.com/a/65959350
// function isDefined<T>(arg: T | null | undefined): arg is T {
//   return arg !== null && arg !== undefined;
// }

// Attribution: Simon Williams
// https://stackoverflow.com/a/62971842
export function filterNullish<T>(): UnaryFunction<Observable<T | null | undefined>, Observable<T>> {
  return pipe(filter((x) => x != null) as OperatorFunction<T | null | undefined, T>);
}

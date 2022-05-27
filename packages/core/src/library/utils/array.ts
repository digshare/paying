export function maxBy<TIterable extends Iterable<TValue>, TValue>(
  array: TIterable,
  iteratee: (value: TValue) => number,
): TValue | undefined {
  let result: TValue | undefined;

  if (array == null) {
    return result;
  }

  let computed: number | undefined;

  for (const value of array) {
    const current = iteratee(value);

    if (
      current != null &&
      (computed === undefined
        ? current === current && typeof current !== 'symbol'
        : current > computed)
    ) {
      computed = current;
      result = value;
    }
  }

  return result;
}

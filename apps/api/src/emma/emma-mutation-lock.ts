/**
 * Serializes all mutating EMMA OData calls (folio edits, VCC payments) so only one
 * runs at a time on the shared HTTP session jar — prevents cross-reservation bleed.
 */
export class EmmaMutationLock {
  private tail: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

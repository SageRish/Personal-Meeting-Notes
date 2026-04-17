export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export interface RetryFailureContext {
  attempts: number;
  error: unknown;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  onFinalFailure?: (context: RetryFailureContext) => Promise<void> | void,
): Promise<T> {
  let attempt = 0;
  let delayMs = options.initialDelayMs;

  while (attempt < options.maxAttempts) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.maxAttempts) {
        if (onFinalFailure) {
          await onFinalFailure({ attempts: attempt, error });
        }

        throw error;
      }

      await sleep(delayMs);
      delayMs = Math.min(Math.floor(delayMs * options.backoffMultiplier), options.maxDelayMs);
    }
  }

  throw new Error('Retry loop exited unexpectedly.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

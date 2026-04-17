import type { PersistenceRepository } from '../storage/repository.js';

export interface DeadLetterInput {
  meetingId: string;
  stage: string;
  payload: unknown;
  error: unknown;
  attempts: number;
}

export class DeadLetterQueue {
  public constructor(private readonly repository: PersistenceRepository) {}

  public enqueue(input: DeadLetterInput): void {
    this.repository.addDeadLetter({
      meetingId: input.meetingId,
      stage: input.stage,
      payload: input.payload,
      errorMessage: normalizeErrorMessage(input.error),
      attempts: input.attempts,
    });
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return typeof error === 'string' ? error : JSON.stringify(error);
}

import type { MistralSmall4Client, VoxtralMiniTranscribeV2Client } from './ai-clients.js';
import { DeadLetterQueue } from './dead-letter.js';
import { withRetry, type RetryOptions } from './retry.js';
import type { AudioIngestPayload, PipelineStageEvent, ProcessedMeetingPayload } from './types.js';
import type { PersistenceRepository } from '../storage/repository.js';

const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 500,
  backoffMultiplier: 2,
  maxDelayMs: 5_000,
};

export interface MeetingProcessingPipelineOptions {
  voxtralClient: VoxtralMiniTranscribeV2Client;
  mistralClient: MistralSmall4Client;
  repository: PersistenceRepository;
  onEvent?: (event: PipelineStageEvent) => void;
  retryOptions?: RetryOptions;
}

export class MeetingProcessingPipeline {
  private readonly deadLetters: DeadLetterQueue;

  public constructor(private readonly options: MeetingProcessingPipelineOptions) {
    this.deadLetters = new DeadLetterQueue(options.repository);
  }

  public async process(input: AudioIngestPayload): Promise<ProcessedMeetingPayload> {
    try {
      this.emit(input.meetingId, 'ingest', `Ingested audio from ${input.audioFilePath}.`);

      const transcript = await withRetry(
        () => this.options.voxtralClient.transcribeAudio(input.audioFilePath),
        this.options.retryOptions ?? defaultRetryOptions,
        ({ attempts, error }) => {
          this.deadLetters.enqueue({
            meetingId: input.meetingId,
            stage: 'transcribe',
            payload: { audioFilePath: input.audioFilePath },
            error,
            attempts,
          });
        },
      );

      this.emit(input.meetingId, 'transcribe', 'Audio transcribed with Voxtral Mini Transcribe V2.');

      const summary = await withRetry(
        () => this.options.mistralClient.summarizeTranscript(transcript.text),
        this.options.retryOptions ?? defaultRetryOptions,
        ({ attempts, error }) => {
          this.deadLetters.enqueue({
            meetingId: input.meetingId,
            stage: 'summarize',
            payload: { transcript: transcript.text },
            error,
            attempts,
          });
        },
      );

      this.emit(input.meetingId, 'summarize', 'Transcript summarized with Mistral Small 4.');

      const result: ProcessedMeetingPayload = {
        meeting: {
          id: input.meetingId,
          title: input.title,
          datetime: input.datetime,
          platform: input.platform,
          duration: input.duration,
          status: 'processed',
          transcriptAvailable: true,
        },
        transcript: {
          meetingId: input.meetingId,
          text: transcript.text,
          segments: transcript.segments,
          timestamps: transcript.timestamps,
        },
        summary: {
          meetingId: input.meetingId,
          structuredJson: summary.structuredJson,
          editableText: summary.editableText,
        },
        note: {
          meetingId: input.meetingId,
          editableMarkdown: summary.noteMarkdown,
        },
        actionItems: summary.actionItems.map((item) => ({
          meetingId: input.meetingId,
          text: item.text,
          checked: item.checked,
          orderIndex: item.orderIndex,
        })),
      };

      this.options.repository.persistPipelineResult(result);
      this.emit(input.meetingId, 'persist', 'Stored meeting transcript, summary, notes, and action items.');

      this.emit(input.meetingId, 'ui_update', 'Published UI update event for processed meeting data.');
      this.emit(input.meetingId, 'completed', 'Meeting processing completed successfully.');

      return result;
    } catch (error) {
      this.emit(input.meetingId, 'failed', `Meeting processing failed: ${String(error)}.`);
      throw error;
    }
  }

  private emit(meetingId: string, stage: PipelineStageEvent['stage'], message: string): void {
    this.options.onEvent?.({
      meetingId,
      stage,
      message,
      at: new Date().toISOString(),
    });
  }
}

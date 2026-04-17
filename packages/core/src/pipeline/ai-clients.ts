import type { SummaryResponse, TranscriptionResponse } from './types.js';

export interface VoxtralMiniTranscribeV2Client {
  transcribeAudio(audioFilePath: string): Promise<TranscriptionResponse>;
}

export interface MistralSmall4Client {
  summarizeTranscript(transcriptText: string): Promise<SummaryResponse>;
}

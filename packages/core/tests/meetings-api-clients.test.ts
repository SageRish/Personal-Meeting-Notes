import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MeetingsApiAuthenticationError,
  MistralSmall4HttpClient,
  VoxtralMiniTranscribeV2HttpClient,
} from '../src/pipeline/clients/meetings-api-clients.js';
import type { RequestResponseLogger } from '../src/logging/redaction.js';
import type { SecretStore } from '../src/secrets/secret-store.js';

const TEST_ENV = {
  MEETINGS_ENV: 'test',
  MEETINGS_API_BASE_URL: 'https://api.example.com',
  MEETINGS_API_TOKEN_ACCOUNT: 'desktop-user',
  MEETINGS_SECRET_SERVICE_NAME: 'meetings-tests',
} as const;

describe('Meetings API clients', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ...TEST_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('transcribes audio and summarizes transcript with token auth from secret store', async () => {
    const secretStore: SecretStore = {
      get: vi.fn(async () => 'super-secret-token'),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => true),
    };

    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text: 'hello world',
            segments: ['hello', 'world'],
            timestamps: [0, 1],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            structuredJson: { summary: 'ok' },
            editableText: 'summary text',
            noteMarkdown: '- task',
            actionItems: [{ text: 'task', checked: false, orderIndex: 0 }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    const voxtral = new VoxtralMiniTranscribeV2HttpClient({ fetchFn, secretStore });
    const mistral = new MistralSmall4HttpClient({ fetchFn, secretStore });

    const transcription = await voxtral.transcribeAudio('/tmp/input.wav');
    const summary = await mistral.summarizeTranscript(transcription.text);

    expect(secretStore.get).toHaveBeenCalledWith('desktop-user');
    expect(transcription).toEqual({
      text: 'hello world',
      segments: ['hello', 'world'],
      timestamps: [0, 1],
    });
    expect(summary.structuredJson).toEqual({ summary: 'ok' });

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/v1/voxtral-mini-transcribe-v2:transcribe',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/v1/mistral-small-4:summarize',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('redacts authorization header and secrets in request logging', async () => {
    const loggedRequests: Array<Record<string, unknown>> = [];
    const logger: RequestResponseLogger = {
      logRequest(context) {
        loggedRequests.push(context as Record<string, unknown>);
      },
      logResponse() {
        // not needed in this test
      },
    };

    const secretStore: SecretStore = {
      get: vi.fn(async () => 'super-secret-token'),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => true),
    };

    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: 'ok', segments: [], timestamps: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new VoxtralMiniTranscribeV2HttpClient({ fetchFn, logger, secretStore });
    await client.transcribeAudio('/tmp/tokenized.wav');

    expect(loggedRequests).toHaveLength(1);
    expect(loggedRequests[0].headers).toEqual({
      'content-type': 'application/json',
      authorization: '[REDACTED]',
    });
  });

  it('throws explicit auth error when token is missing', async () => {
    const secretStore: SecretStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => true),
    };

    const client = new VoxtralMiniTranscribeV2HttpClient({
      fetchFn: vi.fn<typeof fetch>(),
      secretStore,
    });

    await expect(client.transcribeAudio('/tmp/input.wav')).rejects.toBeInstanceOf(MeetingsApiAuthenticationError);
  });
});

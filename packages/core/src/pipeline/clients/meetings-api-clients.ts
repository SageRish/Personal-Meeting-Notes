import { loadConfig } from '../../config/env.js';
import type { JsonLike, RequestResponseLogger } from '../../logging/redaction.js';
import { withRedactedLogging } from '../../logging/redaction.js';
import { OsNativeSecretStore, type SecretStore } from '../../secrets/secret-store.js';
import type { MistralSmall4Client, VoxtralMiniTranscribeV2Client } from '../ai-clients.js';
import { parseSummaryResponse } from '../summary-schema.js';
import type { SummaryResponse, TranscriptionResponse } from '../types.js';

interface HttpClientDependencies {
  fetchFn?: typeof fetch;
  logger?: RequestResponseLogger;
  secretStore?: SecretStore;
}

interface ApiResponseContext {
  status: number;
  headers?: Record<string, string>;
  body?: JsonLike;
}

class ConsoleHttpLogger implements RequestResponseLogger {
  public logRequest(context: { method: string; url: string; headers?: Record<string, string>; body?: JsonLike }): void {
    // eslint-disable-next-line no-console
    console.info('Meetings API request', context);
  }

  public logResponse(context: { status: number; headers?: Record<string, string>; body?: JsonLike }): void {
    // eslint-disable-next-line no-console
    console.info('Meetings API response', context);
  }
}

export class MeetingsApiAuthenticationError extends Error {
  public constructor(accountName: string) {
    super(`Unable to load API token for account "${accountName}" from OS secret store.`);
    this.name = 'MeetingsApiAuthenticationError';
  }
}

abstract class BaseMeetingsApiClient {
  private readonly fetchFn: typeof fetch;
  private readonly logger: RequestResponseLogger;
  private readonly config = loadConfig(process.env);
  private readonly secretStore: SecretStore;
  private tokenPromise: Promise<string> | undefined;

  protected constructor(dependencies: HttpClientDependencies = {}) {
    this.fetchFn = dependencies.fetchFn ?? fetch;
    this.logger = dependencies.logger ?? new ConsoleHttpLogger();
    this.secretStore =
      dependencies.secretStore ?? new OsNativeSecretStore(this.config.MEETINGS_SECRET_SERVICE_NAME);
  }

  protected async postJson(endpoint: string, body: JsonLike): Promise<ApiResponseContext> {
    const token = await this.getApiToken();
    const url = new URL(endpoint, this.config.MEETINGS_API_BASE_URL).toString();

    const execute = withRedactedLogging(async (request) => {
      const response = await this.fetchFn(request.url, {
        method: request.method,
        headers: request.headers ?? {},
        body: JSON.stringify(request.body),
      });

      const responseBody = await this.parseResponseBody(response);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return responseBody === undefined
        ? {
            status: response.status,
            headers,
          }
        : {
            status: response.status,
            headers,
            body: responseBody,
          };
    }, this.logger);

    return execute({
      method: 'POST',
      url,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body,
    });
  }

  private async parseResponseBody(response: Response): Promise<JsonLike | undefined> {
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return undefined;
    }

    return (await response.json()) as JsonLike;
  }

  private async getApiToken(): Promise<string> {
    if (!this.tokenPromise) {
      this.tokenPromise = this.secretStore
        .get(this.config.MEETINGS_API_TOKEN_ACCOUNT)
        .then((token) => {
          if (!token) {
            throw new MeetingsApiAuthenticationError(this.config.MEETINGS_API_TOKEN_ACCOUNT);
          }
          return token;
        });
    }

    return this.tokenPromise;
  }
}

export class VoxtralMiniTranscribeV2HttpClient
  extends BaseMeetingsApiClient
  implements VoxtralMiniTranscribeV2Client
{
  public async transcribeAudio(audioFilePath: string): Promise<TranscriptionResponse> {
    const response = await this.postJson('/v1/voxtral-mini-transcribe-v2:transcribe', {
      audioFilePath,
    });

    if (response.status >= 400 || !response.body || typeof response.body !== 'object') {
      throw new Error(`Voxtral Mini Transcribe V2 request failed with status ${response.status}.`);
    }

    const body = response.body as Record<string, unknown>;

    return {
      text: typeof body.text === 'string' ? body.text : '',
      segments: Array.isArray(body.segments) ? body.segments.filter((item): item is string => typeof item === 'string') : [],
      timestamps: Array.isArray(body.timestamps)
        ? body.timestamps.filter((item): item is number => typeof item === 'number')
        : [],
    };
  }
}

export class MistralSmall4HttpClient extends BaseMeetingsApiClient implements MistralSmall4Client {
  public async summarizeTranscript(transcriptText: string): Promise<SummaryResponse> {
    const response = await this.postJson('/v1/mistral-small-4:summarize', {
      transcriptText,
    });

    if (response.status >= 400 || !response.body || typeof response.body !== 'object') {
      throw new Error(`Mistral Small 4 request failed with status ${response.status}.`);
    }

    return parseSummaryResponse(response.body);
  }
}

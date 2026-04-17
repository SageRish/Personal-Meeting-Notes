const SENSITIVE_KEY_PATTERN = /(authorization|api[-_]?key|token|secret|password|cookie|set-cookie)/i;

export type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | {
      [key: string]: JsonLike;
    };

export interface RequestLogContext {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: JsonLike;
}

export interface ResponseLogContext {
  status: number;
  headers?: Record<string, string>;
  body?: JsonLike;
}

export interface RequestResponseLogger {
  logRequest(context: RequestLogContext): void;
  logResponse(context: ResponseLogContext): void;
}

export interface HttpRequestContext extends RequestLogContext {}

export interface HttpResponseContext extends ResponseLogContext {}

export type RequestExecutor = (request: HttpRequestContext) => Promise<HttpResponseContext>;

export function redactSensitiveData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(source)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = '[REDACTED]';
      continue;
    }

    redacted[key] = redactSensitiveData(entry);
  }

  return redacted as T;
}

export function createRedactingLoggerMiddleware(logger: RequestResponseLogger): RequestResponseLogger {
  return {
    logRequest(context) {
      const payload: RequestLogContext = {
        method: context.method,
        url: context.url,
      };
      if (context.headers) {
        payload.headers = redactSensitiveData(context.headers);
      }
      if (context.body) {
        payload.body = redactSensitiveData(context.body);
      }

      logger.logRequest(payload);
    },
    logResponse(context) {
      const payload: ResponseLogContext = {
        status: context.status,
      };
      if (context.headers) {
        payload.headers = redactSensitiveData(context.headers);
      }
      if (context.body) {
        payload.body = redactSensitiveData(context.body);
      }

      logger.logResponse(payload);
    },
  };
}

export function withRedactedLogging(
  execute: RequestExecutor,
  logger: RequestResponseLogger,
): RequestExecutor {
  const redactingLogger = createRedactingLoggerMiddleware(logger);

  return async (request) => {
    redactingLogger.logRequest(request);
    const response = await execute(request);
    redactingLogger.logResponse(response);
    return response;
  };
}

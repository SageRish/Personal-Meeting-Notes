import { z } from 'zod';

const envSchema = z.object({
  MEETINGS_ENV: z.enum(['development', 'test', 'production']),
  MEETINGS_API_BASE_URL: z.string().url(),
  MEETINGS_API_TOKEN_ACCOUNT: z.string().min(1),
  MEETINGS_SECRET_SERVICE_NAME: z.string().min(1).default('personal-meeting-notes'),
});

export type AppConfig = z.infer<typeof envSchema>;

export class ConfigValidationError extends Error {
  public constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Invalid environment configuration: ${issues
        .map((issue) => `${issue.path.join('.') || 'root'} - ${issue.message}`)
        .join('; ')}`,
    );
    this.name = 'ConfigValidationError';
  }
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigValidationError(result.error.issues);
  }

  return result.data;
}

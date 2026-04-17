import { z } from 'zod';

const summarySectionItemsSchema = z.array(z.string());

export const structuredSummarySchema = z
  .object({
    actionItems: summarySectionItemsSchema,
    relevantHeadings: summarySectionItemsSchema,
    decisions: summarySectionItemsSchema,
    openQuestions: summarySectionItemsSchema,
    followUps: summarySectionItemsSchema,
  })
  .strict();

export type StructuredSummary = z.infer<typeof structuredSummarySchema>;

export const summaryResponseSchema = z
  .object({
    structuredJson: structuredSummarySchema,
    editableText: z.string(),
    noteMarkdown: z.string(),
    actionItems: z.array(
      z.object({
        text: z.string(),
        checked: z.boolean(),
        orderIndex: z.number(),
      }),
    ),
  })
  .strict();

export class SummaryValidationError extends Error {
  public constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly rawPayload: unknown,
  ) {
    super(message);
    this.name = 'SummaryValidationError';
  }
}

export function parseSummaryResponse(payload: unknown): z.infer<typeof summaryResponseSchema> {
  const parsed = summaryResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new SummaryValidationError('Invalid summary response schema.', parsed.error.issues, payload);
  }

  return parsed.data;
}

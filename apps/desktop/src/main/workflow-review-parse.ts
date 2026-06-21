export type ReviewDecision = {
  action: "approve" | "comment";
  summary: string;
  inlineComments: Array<{ path: string; line: number; body: string }>;
};

export class ParseReviewDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseReviewDecisionError";
  }
}

export function extractReviewJsonBlock(text: string): string | null {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
  if (fenced.length > 0) {
    return fenced[fenced.length - 1]![1]!.trim();
  }

  const braceMatch = text.match(/\{[\s\S]*"action"[\s\S]*\}/);
  return braceMatch ? braceMatch[0]!.trim() : null;
}

export function parseReviewDecision(text: string): ReviewDecision {
  const jsonText = extractReviewJsonBlock(text);
  if (!jsonText) {
    throw new ParseReviewDecisionError("Review agent did not output a JSON decision block");
  }

  let parsed: {
    action?: string;
    summary?: string;
    inlineComments?: Array<{ path?: string; line?: number; body?: string }>;
  };
  try {
    parsed = JSON.parse(jsonText) as typeof parsed;
  } catch {
    throw new ParseReviewDecisionError("Review agent JSON decision block is invalid");
  }

  const action = parsed.action === "approve" ? "approve" : "comment";
  const inlineComments = (parsed.inlineComments ?? [])
    .filter((comment) => comment.path && comment.line && comment.body)
    .map((comment) => ({
      path: comment.path!,
      line: comment.line!,
      body: comment.body!,
    }));

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : action === "approve"
        ? "LGTM"
        : "Review feedback";

  if (action === "comment" && inlineComments.length === 0 && !summary) {
    throw new ParseReviewDecisionError("Review comment action requires inlineComments or a summary");
  }

  return { action, summary, inlineComments };
}

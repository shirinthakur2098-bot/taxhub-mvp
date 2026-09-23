import Anthropic from "@anthropic-ai/sdk";
import { RefusalError } from "./llm";

export function describeError(err: unknown): string {
  if (err instanceof RefusalError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "Invalid ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API – wait a moment and retry.";
  if (err instanceof Anthropic.BadRequestError) return `Claude API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ""}: ${err.message}`;
  if (err instanceof SyntaxError) return "The model returned malformed JSON. Please retry.";
  return err instanceof Error ? err.message : "Unknown error";
}

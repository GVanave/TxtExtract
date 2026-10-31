/**
 * Server-side error logging without personal data (see docs/datenschutz-plan.md, T5): only the error's type and
 * message are written; database errors lose their query parameters (e-mail, products, amounts).
 */
export function cleanErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Drizzle formats failed queries as "Failed query: <sql>\nparams: <values>".
  return message.split(/\nparams:/)[0].slice(0, 500);
}

export function logError(context: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const kind = (error as { kind?: string } | null)?.kind;
  const cause = error instanceof Error && error.cause instanceof Error ? ` (cause: ${error.cause.name}: ${cleanErrorMessage(error.cause)})` : "";
  console.error(`${context}: ${name}${kind ? `[${kind}]` : ""}: ${cleanErrorMessage(error)}${cause}`);
}

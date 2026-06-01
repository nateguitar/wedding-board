// Supabase Postgres errors are plain objects (PostgrestError), not Error
// instances, so `err.message` is lost by a naive `instanceof Error` check.
// This pulls a human-readable string out of either shape.
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint && `(${e.hint})`, e.code && `[${e.code}]`]
      .filter(Boolean)
      .join(" ");
    if (parts) return parts;
  }
  return "Something went wrong";
}

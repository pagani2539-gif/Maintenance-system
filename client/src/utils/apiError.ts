/**
 * Extracts a user-facing error message from an unknown thrown value (usually an
 * Axios error). Backend controllers are inconsistent about the field they use —
 * some return `{ message }`, others `{ error }` — so we read both before falling
 * back. This prevents the UI from ever showing "undefined" to the user.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  } | null | undefined);
  return (
    data?.response?.data?.message ||
    data?.response?.data?.error ||
    fallback
  );
}

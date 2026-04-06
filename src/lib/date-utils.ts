export function getDateFromParams(searchParams: Record<string, string | string[] | undefined>): Date {
  const dateParam = typeof searchParams.date === "string" ? searchParams.date : null;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return new Date(dateParam + "T00:00:00.000Z");
  }
  // Default to today using local date (server runs on user's machine)
  const now = new Date();
  const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return new Date(localDateStr + "T00:00:00.000Z");
}

/**
 * General-purpose helpers shared by intake libraries.
 */

import path from "path";

const DISALLOWED_ARCHIVE_PATH_SEGMENTS = [
  `${path.sep}cris_research_system${path.sep}`,
  `${path.sep}cris-system${path.sep}`,
];

/**
 * Determines the local file path for a source based on the current date.
 * Follows the folder convention: sources/YYYY-MM/YYYY-MM-DD_to_DD/
 *
 * Weeks run Sunday → Saturday by default. The start day is always the most
 * recent week-start day relative to the supplied date, regardless of when
 * during the week you actually begin collecting sources.
 *
 * To change the week-start convention, set CURATE_MIND_WEEK_START in your
 * .env.local file ("sunday" or "monday"). Ask Claude: "change my Curate Mind
 * week to start on Monday" and it will update .env.local for you.
 */
export function getWeekFolderPath(basePath: string, date: Date): string {
  const weekStartDayIndex = resolveWeekStartDay();
  const weekStart = getMostRecentWeekStart(date, weekStartDayIndex);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const startYear = weekStart.getFullYear();
  const startMonth = String(weekStart.getMonth() + 1).padStart(2, "0");
  const startDay = String(weekStart.getDate()).padStart(2, "0");
  const endDay = String(weekEnd.getDate()).padStart(2, "0");

  // When the week crosses a month boundary include the end month in the suffix.
  const endSuffix =
    weekEnd.getMonth() === weekStart.getMonth()
      ? endDay
      : `${String(weekEnd.getMonth() + 1).padStart(2, "0")}-${endDay}`;

  const folderName = `${startYear}-${startMonth}-${startDay}_to_${endSuffix}`;

  return `${basePath}/sources/${startYear}-${startMonth}/${folderName}`;
}

function resolveWeekStartDay(): number {
  const configured = process.env.CURATE_MIND_WEEK_START?.trim().toLowerCase();
  return configured === "monday" ? 1 : 0; // 0 = Sunday (default), 1 = Monday
}

function getMostRecentWeekStart(date: Date, weekStartDay: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const daysBack = (result.getDay() - weekStartDay + 7) % 7;
  result.setDate(result.getDate() - daysBack);
  return result;
}

/**
 * Sanitize a string to use as a filename.
 */
export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/**
 * Guard against accidentally reading from the archived CRIS project during intake.
 * Curate Mind can reference CRIS for patterns, but source ingestion should only use
 * Curate Mind files or fresh external files selected for this project.
 */
export function getDisallowedArchivePathReason(filePath: string): string | null {
  const normalizedPath = path.normalize(filePath).toLowerCase();

  for (const segment of DISALLOWED_ARCHIVE_PATH_SEGMENTS) {
    if (normalizedPath.includes(segment)) {
      return (
        "This path points to the archived CRIS project. " +
        "Curate Mind intake tools should not read from CRIS archive paths."
      );
    }
  }

  return null;
}

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
 * Follows the existing folder convention:
 *   sources/YYYY-MM/YYYY-MM-DD_to_DD/
 *
 * Week boundaries: 01-07, 08-14, 15-21, 22-end of month
 */
export function getWeekFolderPath(basePath: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = date.getDate();

  let weekStart: number;
  let weekEnd: number;

  if (day <= 7) {
    weekStart = 1;
    weekEnd = 7;
  } else if (day <= 14) {
    weekStart = 8;
    weekEnd = 14;
  } else if (day <= 21) {
    weekStart = 15;
    weekEnd = 21;
  } else {
    weekStart = 22;
    // Last day of the month
    weekEnd = new Date(year, date.getMonth() + 1, 0).getDate();
  }

  const startStr = String(weekStart).padStart(2, "0");
  const endStr = String(weekEnd).padStart(2, "0");

  return `${basePath}/sources/${year}-${month}/${year}-${month}-${startStr}_to_${endStr}`;
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

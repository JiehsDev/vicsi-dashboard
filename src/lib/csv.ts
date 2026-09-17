// src/lib/csv.ts
import "server-only";

/** OWASP CSV-injection mitigation: a value beginning with =, +, -, or @ can
 *  be interpreted as a formula by Excel/Sheets/LibreOffice when the file is
 *  opened - e.g. a display name of "=cmd|'/c calc'!A1" or a student ID of
 *  "-2+3". Prefixing with a single quote is the standard fix: every
 *  spreadsheet application treats a leading `'` as "force text", so the
 *  value renders literally instead of evaluating. Applied unconditionally
 *  to every field this module writes, regardless of the column's expected
 *  shape - defensive by default, not column-by-column judgment calls. */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@"]);

/** RFC 4180 field escaping plus the formula-injection guard above. */
export function csvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);

  if (s.length > 0 && FORMULA_TRIGGER_CHARS.has(s[0])) {
    s = `'${s}`;
  }

  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Builds a full CSV document (header row + data rows), CRLF-terminated per
 *  RFC 4180. Every cell goes through csvField - callers never need to
 *  escape anything themselves. */
export function buildCsv(columns: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvField).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

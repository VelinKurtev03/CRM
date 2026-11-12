import { saveBlob } from '@/utils/download'

export type CsvCell = string | number | null | undefined

/**
 * One CSV field. Quotes it when needed, and prefixes text that a spreadsheet would run as a
 * formula (starting with = + - @) with an apostrophe so it is read as text.
 */
export function csvField(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const toCsv = (rows: CsvCell[][]) => rows.map((r) => r.map(csvField).join(',')).join('\r\n')

/** Download rows as a CSV file (with a byte order mark so Excel reads UTF-8 names correctly). */
export const downloadCsv = (filename: string, rows: CsvCell[][]) =>
  saveBlob(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename)

/**
 * Triggers a browser download of a CSV file constructed from headers and data rows.
 * Prepends a UTF-8 BOM to prevent Thai garbled characters in Excel.
 * @param fileName Name of the downloaded file (without extension).
 * @param headers Array of column header strings.
 * @param rows Matrix of data values (strings or numbers).
 */
export const exportToCsv = (fileName: string, headers: string[], rows: (string | number | null | undefined)[][]): void => {
  const BOM = '\uFEFF';
  
  const escapeCsvCell = (val: string | number | null | undefined): string => {
    const raw = String(val === null || val === undefined ? '' : val);
    const str = (raw.startsWith('=') || raw.startsWith('+') || raw.startsWith('-') || raw.startsWith('@') ? `'${raw}` : raw).replace(/"/g, '""');
    return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
  };

  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines = rows.map(row => row.map(escapeCsvCell).join(','));

  const csvStr = BOM + [headerLine, ...rowLines].join('\n');
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

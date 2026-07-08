export const parseDate = (dateStr: string | Date | null | undefined): Date => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  
  // Convert space-separated UTC timestamp "YYYY-MM-DD HH:MM:SS" to ISO UTC
  if (typeof dateStr === 'string' && dateStr.includes(' ') && !dateStr.includes('T')) {
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  return new Date(dateStr);
};

export const formatDateThai = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return '-';
  const date = parseDate(dateStr);
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateTimeThai = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return '-';
  const date = parseDate(dateStr);
  const dateFormatted = date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatted = date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateFormatted} เวลา ${timeFormatted} น.`;
};

export default formatDateTimeThai;

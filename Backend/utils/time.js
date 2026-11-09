function getLocalDateParts(date, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function localDayBounds(date, timeZone = 'UTC') {
  const parts = getLocalDateParts(date, timeZone);
  const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end, parts };
}

module.exports = { getLocalDateParts, localDayBounds };

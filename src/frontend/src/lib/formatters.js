export function formatDateTime(value) {
  if (!value) {
    return "Awaiting timestamp";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Awaiting timestamp";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

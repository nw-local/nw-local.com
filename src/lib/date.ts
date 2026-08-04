// Dates are formatted at build time, so the runner's timezone would otherwise
// decide the output: a post stamped 2026-08-04T02:00:00Z renders as "August 4"
// on the UTC CI runner and "August 3" on a machine in Pacific time. Pinning to
// UTC keeps a published date identical everywhere it is rendered.
const TIME_ZONE = "UTC";

export function formatPostDate( isoDate: string ): string {
  return new Date( isoDate ).toLocaleDateString( "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function formatMonthYear( isoDate: string ): string {
  return new Date( isoDate ).toLocaleDateString( "en-US", {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

// All user-facing dates render in Romania's timezone, regardless of where the
// server runs (Vercel is UTC) or the viewer's browser happens to be set.
export const TIME_ZONE = "Europe/Bucharest";

// Fixed locale so the server and the client format identically (no React
// hydration drift) and the month/AM-PM style stays stable.
const LOCALE = "en-GB";

/** Format an instant for display, always in Romania time. */
export function formatRo(
  ts: string | number | Date,
  options: Intl.DateTimeFormatOptions
): string {
  return new Date(ts).toLocaleString(LOCALE, { ...options, timeZone: TIME_ZONE });
}

// --- <input type="datetime-local"> helpers --------------------------------
// A datetime-local value is a zone-less wall-clock string "YYYY-MM-DDTHH:mm".
// These pin that wall clock to Romania time so the admin always edits in EET/
// EEST no matter where their browser is.

// Romania's offset (ms) from UTC at a given instant: (Romania wall clock) − UTC.
function roOffsetMs(instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date(instant))
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const asUTC = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour % 24,
    +parts.minute,
    +parts.second
  );
  return asUTC - instant;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant → "YYYY-MM-DDTHH:mm" in Romania wall clock (for the input value). */
export function isoToRoInput(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const wall = new Date(t + roOffsetMs(t));
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(
    wall.getUTCDate()
  )}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (Romania wall clock) → UTC ISO instant. */
export function roInputToIso(local: string): string {
  if (!local) return "";
  const asUTC = Date.parse(`${local}:00Z`); // read the fields as if they were UTC
  if (Number.isNaN(asUTC)) return "";
  return new Date(asUTC - roOffsetMs(asUTC)).toISOString();
}

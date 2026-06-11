/** Team crest from football-data.org. Renders nothing when the URL is
 *  missing (TBD fixtures, rows synced before the crest columns existed).
 *  Plain <img>: external SVGs, no need for next/image remotePatterns. */
export function TeamCrest({
  src,
  className = "h-6 w-6",
}: {
  src: string | null | undefined;
  className?: string;
}) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden className={`${className} shrink-0 object-contain`} />;
}

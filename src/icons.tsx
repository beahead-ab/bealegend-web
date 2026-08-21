/**
 * Inline SVG rather than emoji. An emoji is coloured by the platform, drawn
 * differently on every one, and §8 keeps the chrome ink-black with blue spent
 * only on data — a green microphone on macOS and a grey one on Windows is
 * neither the colour we chose nor the same app twice.
 *
 * Everything here inherits `currentColor`, so a button's own state decides the
 * colour and the icons cannot drift from it.
 */
type IconProps = { size?: number };

export function MicIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

export function StopIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
    </svg>
  );
}

export function SendIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

export function ChevronIcon({ size = 14, down = false }: IconProps & { down?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={down ? { transform: "rotate(90deg)" } : undefined}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function BackIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function MealIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3v8a2.5 2.5 0 0 0 5 0V3" />
      <path d="M8.5 11v10" />
      <path d="M17 3c-1.5 1.5-2 3.5-2 5.5S15.5 12 17 12.5V21" />
    </svg>
  );
}

// Tiny inline SVG icon set (stroke = currentColor) — no emoji anywhere.
type IconProps = { className?: string };

function base(className?: string) {
  return {
    className: className ?? "inline-block h-3.5 w-3.5 align-[-2px]",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function TargetIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function TrophyIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a3 3 0 0 0 3 5M16 5h3a3 3 0 0 1-3 5" />
      <path d="M12 14v3M8 20h8M10 17h4v3h-4z" />
    </svg>
  );
}

export function CrownIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 17 3 7l5 4 4-6 4 6 5-4-1 10H4Z" />
    </svg>
  );
}

export function DonutIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M7 8.5l1.5 1M16 7l-1 1.5M17.5 14l-1.5.5M8 16l1-1.5" />
    </svg>
  );
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 3l18 18" />
      <path d="M5.6 5.8C3.7 7.1 2.5 9.2 2 12c1 2.5 5 7 10 7c1.9 0 3.6-.5 5-1.4" />
      <path d="M10.5 5.2C11 5.1 11.5 5 12 5c5 0 9 4.5 10 7c-.3.9-1.1 2.2-2.4 3.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function MedalIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="15" r="5" />
      <path d="M9 11 5 3M15 11l4-8M12 13.5v1.5l1 .8" />
    </svg>
  );
}

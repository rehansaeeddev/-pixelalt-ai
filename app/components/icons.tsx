type IconProps = { className?: string };

const BASE_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function TrophyIcon({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a2 2 0 0 0 2 4M16 5h3a2 2 0 0 1-2 4" />
      <path d="M12 13v3" />
      <path d="M9 20h6" />
      <path d="M10 16.5h4l.6 3.5H9.4l.6-3.5Z" />
    </svg>
  );
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} width={16} height={16} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function BoxIcon({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function CoinIcon({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 15.2c.5.6 1.4 1 2.5 1 1.7 0 3-1 3-2.2s-1.3-1.8-3-2c-1.7-.2-3-.8-3-2 0-1.2 1.3-2.2 3-2.2 1.1 0 2 .4 2.5 1" />
      <path d="M12 7.2V6M12 18v-1.2" />
    </svg>
  );
}

export function BadgeIcon({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M12 3l2.4 1.7 2.9-.1.9 2.7 2.4 1.7-1 2.8 1 2.8-2.4 1.7-.9 2.7-2.9-.1L12 21l-2.4-1.7-2.9.1-.9-2.7-2.4-1.7 1-2.8-1-2.8 2.4-1.7.9-2.7 2.9.1L12 3Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

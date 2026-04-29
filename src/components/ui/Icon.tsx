import { type ReactNode, type SVGProps } from 'react';

/**
 * Unified icon system. Stroke-only, 1.5px default, currentColor.
 * Brand icons (postgres/redis/kafka/...) ported birebir from .design-ref/icons.jsx.
 * Generic icons can also be sourced from lucide-react in calling components.
 */

interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, 'name' | 'stroke' | 'color'> {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
}

const PATHS: Record<string, ReactNode> = {
  // chrome
  logo: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 17.5h7M17.5 14v7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m5 12 5 5L20 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  circle: <circle cx="12" cy="12" r="9" />,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  graph: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 7.5 16 7.5M7 8l4 8M17 8l-4 8" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-.9c.6.5 1.3.9 2 1.2L10 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.4.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
    </>
  ),
  sparkles: (
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,

  // node-type icons
  postgres: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  mysql: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    </>
  ),
  mongo: (
    <>
      <path d="M12 3c-3 4-5 7-5 11 0 4 2 6 5 7 3-1 5-3 5-7 0-4-2-7-5-11z" />
      <path d="M12 3v18" />
    </>
  ),
  dynamo: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="m9 14 3 2 3-2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  redis: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M4 11h16M4 14h16" />
      <circle cx="8" cy="8.5" r="0.5" fill="currentColor" />
    </>
  ),
  kafka: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M8 7l4 4M8 17l4-4M14 12h2" />
    </>
  ),
  rabbit: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 4v6h2v3M15 4v9h-2" />
    </>
  ),
  api: (
    <>
      <path d="M3 12h18M3 6h18M3 18h18" />
      <circle cx="7" cy="6" r="1" fill="currentColor" />
      <circle cx="11" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
    </>
  ),
  graphql: (
    <>
      <path d="M12 3 3 8.5v7L12 21l9-5.5v-7z" />
      <path d="M3 8.5 21 15.5M3 15.5 21 8.5M12 3v18" />
    </>
  ),
  grpc: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v8l5 3" />
    </>
  ),
  gateway: (
    <>
      <rect x="3" y="9" width="18" height="6" rx="1.5" />
      <path d="M7 9V6M12 9V4M17 9V6M7 18v-3M12 20v-5M17 18v-3" />
    </>
  ),
  cdn: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  s3: (
    <>
      <path d="M4 7v10l8 4 8-4V7l-8-4z" />
      <path d="m4 7 8 4 8-4M12 11v10" />
    </>
  ),
  llm: (
    <>
      <path d="M12 4c-4 0-7 3-7 7 0 2 1 4 2 5l-1 4 4-2c1 .5 2 .5 2 .5 4 0 7-3 7-7s-3-7.5-7-7.5z" />
      <path d="M9 11h.01M12 11h.01M15 11h.01" />
    </>
  ),
  vector: (
    <>
      <path d="M3 12h7l3-7M10 12l3 7M10 12h11" />
      <circle cx="3" cy="12" r="1.5" />
      <circle cx="13" cy="5" r="1.5" />
      <circle cx="13" cy="19" r="1.5" />
      <circle cx="21" cy="12" r="1.5" />
    </>
  ),
  auth: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  web: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="1.5" />
      <path d="M3 8h18M7 6h.01M9 6h.01" />
    </>
  ),
  ios: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  android: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M6 9c-.5 0-1 .5-1 1v3c0 .5.5 1 1 1M18 9c.5 0 1 .5 1 1v3c0 .5-.5 1-1 1M9 18v2M15 18v2M9 6 7 4M15 6l2-2" />
    </>
  ),
  stripe: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M7 12c0-1 1-1.5 2-1.5s2 .5 2 1.5-1 1.5-2 1.5-2 .5-2 1.5 1 1.5 2 1.5 2-.5 2-1.5" />
    </>
  ),
  worker: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </>
  ),
  metrics: (
    <>
      <path d="M3 19V5M21 19H3" />
      <path d="M7 16v-4M11 16V8M15 16v-6M19 16V6" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
};

export type IconName = keyof typeof PATHS | string;

export function Icon({
  name,
  size = 16,
  stroke = 1.5,
  color = 'currentColor',
  ...rest
}: IconProps) {
  const paths = PATHS[name] ?? PATHS.circle;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
      {...rest}
    >
      {paths}
    </svg>
  );
}

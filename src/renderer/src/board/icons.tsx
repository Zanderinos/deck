// Stroke icons on a 16×16 grid, sized by font-size so they sit inline with text.
const paths = {
  branch:
    "M5 5.5v5M5 2.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM5 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11 2.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11 5.5c0 3.5-6 2.5-6 5",
  checkSquare: "M2.5 2.5h11v11h-11zM5 8l2 2 4-4",
  xSquare: "M2.5 2.5h11v11h-11zM5.5 5.5l5 5M10.5 5.5l-5 5",
  clock: "M8 2.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM8 5v3l2 1.5",
  check: "M3 8.5l3 3 7-7",
  x: "M4 4l8 8M12 4l-8 8",
  circle: "M8 2.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11z",
  dot: "M8 6a2 2 0 110 4 2 2 0 010-4z",
  minus: "M3 8h10",
  link: "M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M5.5 8L4.3 9.2a2.5 2.5 0 003.5 3.5L9 11.5",
  external: "M6 3H3v10h10v-3M9 3h4v4M13 3L7.5 8.5",
  chevronDown: "M4 6l4 4 4-4",
  chevronRight: "M6 4l4 4-4 4",
  list: "M3 4.5h10M3 8h10M3 11.5h10",
  commits: "M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM2 8h3.5M10.5 8H14",
  expand: "M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3",
  expandDown: "M8 3v8M5 8l3 3 3-3M4 13.5h8",
  expandUp: "M8 13V5M5 8l3-3 3 3M4 2.5h8",
  comment: "M3 3h10v7H8l-3 3v-3H3z",
  pencil: "M3 13l.8-3.2L10.5 3.1a1.3 1.3 0 011.8 0l.6.6a1.3 1.3 0 010 1.8L6.2 12.2z",
  play: "M5 3.5v9l7-4.5z",
  dots: "M3.5 8h.01M8 8h.01M12.5 8h.01",
  sparkle: "M8 2v12M2 8h12M4 4l8 8M12 4l-8 8",
  jira: "M8 2l3 3-3 3-3-3zM5 8l3 3-3 3-3-3zM11 8l3 3-3 3-3-3z",
} as const;

const filled = new Set<IconName>(["play", "dot"]);

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 13,
  className = "",
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill={filled.has(name) ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={name === "dots" ? 2.5 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d={paths[name]} />
    </svg>
  );
}

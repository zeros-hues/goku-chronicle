'use client';

interface IconProps {
  size?: number;
  className?: string;
  stroke?: string;
}

function Icon({
  d,
  size = 16,
  className,
  stroke,
}: IconProps & { d: React.ReactNode | string }) {
  return (
    <svg
      className={'ic ' + (className || '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke || 'currentColor'}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {typeof d === 'string' ? <path d={d} /> : d}
    </svg>
  );
}

export function IconTimesheet(p: IconProps) {
  return <Icon {...p} d="M7 3v3M17 3v3M4 7h16M5 7h14v13H5z M9 11h6 M9 15h4" />;
}
export function IconExport(p: IconProps) {
  return <Icon {...p} d="M12 4v11 M8 8l4-4 4 4 M5 20h14" />;
}
export function IconTrash(p: IconProps) {
  return <Icon {...p} d="M4 7h16 M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M6 7l1 13h10l1-13 M10 11v6 M14 11v6" />;
}
export function IconClients(p: IconProps) {
  return <Icon {...p} d="M3 4h11l3 3v13H3z M14 4v3h3 M7 12h6 M7 15h6 M7 9h3" />;
}
export function IconTeam(p: IconProps) {
  return <Icon {...p} d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0z M3 21c0-4 4-7 9-7s9 3 9 7" />;
}
export function IconAccount(p: IconProps) {
  return <Icon {...p} d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />;
}
export function IconPlus(p: IconProps) {
  return <Icon {...p} d="M12 5v14 M5 12h14" />;
}
export function IconImport(p: IconProps) {
  return <Icon {...p} d="M12 4v11 M8 11l4 4 4-4 M5 20h14" />;
}
export function IconSearch(p: IconProps) {
  return <Icon {...p} d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 20l-4-4" />;
}
export function IconCalendar(p: IconProps) {
  return <Icon {...p} d="M5 7h14v13H5z M5 7l0-3 M19 7l0-3 M9 4v3 M15 4v3 M5 11h14" />;
}
export function IconCaret(p: IconProps) {
  return <Icon {...p} d="M6 9l6 6 6-6" />;
}
export function IconCaretUp(p: IconProps) {
  return <Icon {...p} d="M6 15l6-6 6 6" />;
}
export function IconCheck(p: IconProps) {
  return <Icon {...p} d="M5 12l5 5L20 7" />;
}
export function IconX(p: IconProps) {
  return <Icon {...p} d="M6 6l12 12 M18 6L6 18" />;
}
export function IconEdit(p: IconProps) {
  return <Icon {...p} d="M4 20h4l11-11-4-4L4 16z M14 5l4 4" />;
}
export function IconFilter(p: IconProps) {
  return <Icon {...p} d="M4 5h16 M7 12h10 M10 19h4" />;
}
export function IconDownload(p: IconProps) {
  return <Icon {...p} d="M12 4v11 M8 11l4 4 4-4 M5 20h14" />;
}
export function IconUndo(p: IconProps) {
  return <Icon {...p} d="M9 8L5 12l4 4 M5 12h10a4 4 0 0 1 0 8h-2" />;
}
export function IconSignOut(p: IconProps) {
  return <Icon {...p} d="M14 4h5v16h-5 M9 12h11 M16 8l4 4-4 4" />;
}
export function IconMoon(p: IconProps) {
  return <Icon {...p} d="M20 13.5A8 8 0 1 1 10.5 4 6 6 0 0 0 20 13.5z" />;
}
export function IconSun(p: IconProps) {
  return (
    <Icon
      {...p}
      d={
        <g>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.5 5.5l1.5 1.5 M17 17l1.5 1.5 M5.5 18.5L7 17 M17 7l1.5-1.5" />
        </g>
      }
    />
  );
}
export function IconDashboard(p: IconProps) {
  return <Icon {...p} d="M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z" />;
}
export function IconPrint(p: IconProps) {
  return <Icon {...p} d="M6 9V4h12v5 M6 18H4v-7h16v7h-2 M6 14h12v6H6z" />;
}
export function IconWarn(p: IconProps) {
  return <Icon {...p} d="M12 3l10 18H2z M12 10v5 M12 18.5v.5" />;
}
export function IconRefresh(p: IconProps) {
  return <Icon {...p} d="M4 9a8 8 0 0 1 14-3 M20 5v4h-4 M20 15a8 8 0 0 1-14 3 M4 19v-4h4" />;
}
export function IconMeeting(p: IconProps) {
  return <Icon {...p} d="M3 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-5 4z" />;
}
export function IconTask(p: IconProps) {
  return <Icon {...p} d="M5 4h14v16H5z M9 9l2 2 4-4 M9 15h6" />;
}
export function IconCopy(p: IconProps) {
  return <Icon {...p} d="M8 8h11v13H8z M5 5h11v3 M5 5v11h3" />;
}
export function IconArchive(p: IconProps) {
  return <Icon {...p} d="M4 7h16v3H4z M5 10v10h14V10 M10 14h4" />;
}

'use client';

import type { Project } from '@/lib/data';

interface ProjectPillProps {
  project: Project;
  clientName?: string;
  size?: 'sm' | 'md';
}

export default function ProjectPill({ project, clientName, size = 'md' }: ProjectPillProps) {
  const color = project.color;
  return (
    <span
      className="proj-pill"
      style={{
        background: `color-mix(in oklab, ${color} 18%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        color: `color-mix(in oklab, ${color} 95%, var(--ink) 40%)`,
        fontSize: size === 'sm' ? '11px' : undefined,
      }}
    >
      <span className="swatch" style={{ background: color }} />
      {clientName && <span className="client">{clientName}</span>}
      {project.name}
    </span>
  );
}

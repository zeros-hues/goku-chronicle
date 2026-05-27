'use client';

import type { Project } from '@/lib/data';

interface ProjectPillProps {
  project: Project;
  clientName?: string;
  size?: 'sm' | 'md';
}

export default function ProjectPill({ project, clientName, size = 'md' }: ProjectPillProps) {
  return (
    <span
      className={'proj-pill' + (size === 'sm' ? ' proj-pill-sm' : '')}
      style={{ '--pill-color': project.color } as React.CSSProperties}
    >
      <span className="swatch" />
      {clientName && <span className="client">{clientName}</span>}
      {project.name}
    </span>
  );
}

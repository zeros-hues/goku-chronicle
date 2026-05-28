'use client';

import { Command } from 'cmdk';
import type { PaletteCommand } from './types';

interface CommandItemProps {
  cmd: PaletteCommand;
  onSelect: () => void;
}

export default function CommandItem({ cmd, onSelect }: CommandItemProps) {
  return (
    <Command.Item
      value={`${cmd.id}~~${cmd.label}`}
      keywords={cmd.keywords}
      onSelect={onSelect}
      className="cp-item"
      disabled={cmd.disabled}
    >
      <span className="cp-item-icon">{cmd.icon}</span>
      <span className="cp-item-body">
        <span className="cp-item-label">{cmd.label}</span>
        {cmd.hint && <span className="cp-item-hint">{cmd.hint}</span>}
      </span>
      {cmd.badge && <span className="cp-badge">{cmd.badge}</span>}
      {cmd.shortcut && <kbd className="cp-kbd">{cmd.shortcut}</kbd>}
    </Command.Item>
  );
}

'use client';

import { Command } from 'cmdk';
import type { PaletteCommand } from './commands';

interface CommandItemProps {
  cmd: PaletteCommand;
  onSelect: () => void;
}

export default function CommandItem({ cmd, onSelect }: CommandItemProps) {
  return (
    <Command.Item
      value={cmd.label}
      keywords={cmd.keywords ? cmd.keywords.split(' ') : undefined}
      onSelect={onSelect}
      className="cp-item"
    >
      <span className="cp-item-icon">{cmd.icon}</span>
      <span className="cp-item-body">
        <span className="cp-item-label">{cmd.label}</span>
        {cmd.hint && <span className="cp-item-hint">{cmd.hint}</span>}
      </span>
      {cmd.shortcut && <kbd className="cp-kbd">{cmd.shortcut}</kbd>}
    </Command.Item>
  );
}

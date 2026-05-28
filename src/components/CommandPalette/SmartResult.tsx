'use client';

import { Command } from 'cmdk';
import type { ParsedIntent } from './types';
import { buildSmartLabel, buildSmartSubtext } from './NLParser';

interface SmartResultProps {
  intent: ParsedIntent;
  onSelect: () => void;
}

export default function SmartResult({ intent, onSelect }: SmartResultProps) {
  const label   = buildSmartLabel(intent);
  const subtext = buildSmartSubtext(intent);

  return (
    <Command.Group heading="Smart match" className="cp-group cp-group-smart">
      <Command.Item
        value={`__smart__${label}`}
        onSelect={onSelect}
        className="cp-item cp-item-smart"
      >
        <span className="cp-smart-star">✦</span>
        <span className="cp-item-body">
          <span className="cp-item-label">{label}</span>
          {subtext && <span className="cp-item-hint">{subtext}</span>}
        </span>
      </Command.Item>
    </Command.Group>
  );
}

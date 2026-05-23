'use client';

import { useEffect } from 'react';
import { IconX, IconTrash } from './Icons';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title, body, confirmLabel = 'Confirm', danger, onConfirm, onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  return (
    <div className="modal-scrim" style={{ zIndex: 600 }} onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-h">
          <span className="confirm-title">{title}</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel}>
            <IconX size={14} />
          </button>
        </div>
        <p className="confirm-body">{body}</p>
        <div className="confirm-acts">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            autoFocus
          >
            {danger && <IconTrash size={13} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

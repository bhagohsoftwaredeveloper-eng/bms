import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export function Dialog({ isOpen, onClose, title, children, maxWidth = 600 }: DialogProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="dialog-overlay">
      <div
        className="dialog-content card"
        style={{ maxWidth }}
      >
        <div className="dialog-header">
          <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>{title}</h2>
          <button className="dialog-close" onClick={onClose} aria-label="Close dialog">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

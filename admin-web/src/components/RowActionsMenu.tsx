import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface RowAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Collapses a table row's action buttons into a single "⋮" menu. Use when a
 * row can have several conditional actions (Edit/View/Transfer/Suspend/…)
 * that would otherwise crowd the row.
 *
 * Every table in this app wraps its rows in a `.card { overflow: hidden }`
 * (see UsersPage/LicensesPage/InventoryManagementPage/DashboardPage), which
 * would clip a plain absolutely-positioned dropdown for any row near the
 * table's edge. The menu is portaled to <body> and fixed-positioned from the
 * trigger button's own bounding box instead, so it always renders on top,
 * unclipped, regardless of which table it's used in.
 */
export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  // Position is computed fresh each time the menu opens (getBoundingClientRect
  // is only meaningful while mounted/visible), and re-measured on scroll/resize
  // so it tracks the row if the table itself scrolls while the menu is open.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onReposition = () => place();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 8,
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          background: open ? 'var(--accent-light)' : 'var(--surface-secondary)',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <MoreVertical size={16} strokeWidth={2} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: coords.top,
              right: coords.right,
              minWidth: 170,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
              zIndex: 900,
              overflow: 'hidden',
              padding: '0.25rem',
            }}
          >
            {actions.map((action, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.5rem 0.7rem',
                  border: 'none',
                  borderRadius: 6,
                  background: 'none',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  color: action.disabled ? 'var(--text-muted)' : action.danger ? 'var(--danger)' : 'var(--text)',
                  cursor: action.disabled ? 'default' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!action.disabled) e.currentTarget.style.background = 'var(--surface-secondary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                }}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

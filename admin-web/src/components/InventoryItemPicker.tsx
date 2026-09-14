import { useState } from 'react';
import type { InventoryItem } from '../lib/types';

export interface InventoryItemPickerProps {
  items: InventoryItem[];
  selectedIds: string[];
  /** Called with the item when its checkbox is toggled (checked or unchecked). */
  onToggle: (item: InventoryItem) => void;
  placeholder?: string;
  height?: number;
}

/** Searchable checkbox list for picking inventory items (package builder). */
export function InventoryItemPicker({
  items,
  selectedIds,
  onToggle,
  placeholder = 'Search items…',
  height = 260,
}: InventoryItemPickerProps) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description ?? '').toLowerCase().includes(q),
      )
    : items;

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', marginBottom: '0.5rem' }}
      />
      <div
        style={{
          height,
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
        }}
      >
        {filtered.length === 0 && (
          <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {items.length === 0 ? 'No inventory items yet.' : `No items match "${search}".`}
          </div>
        )}
        {filtered.map((item) => {
          const checked = selectedIds.includes(item.id);
          return (
            <label
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.7rem',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: checked ? 'var(--accent-light)' : undefined,
              }}
            >
              {/* Override .field input { width: 100%; padding: … } which the picker
                  inherits when mounted inside a form field — it stretches the
                  checkbox across the row and shoves the label text aside. */}
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item)}
                style={{ width: 'auto', minWidth: 16, margin: 0, padding: 0, flexShrink: 0, accentColor: 'var(--accent)' }}
              />
              <span style={{ flex: 1, fontSize: '0.875rem', minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{item.name}</span>
                {item.description && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: '0.35rem' }}>
                    {item.description}
                  </span>
                )}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                ₱{Number(item.unitPrice).toLocaleString()} · {item.stockQty} in stock
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Client } from '../lib/types';

/**
 * Searchable client combobox: type to filter clients by business name or
 * client code, click to select. Shows the selected client as the placeholder
 * while the input is empty.
 */
export function SearchableClientSelect({ value, onChange, clients, id }: {
  value: string;
  onChange: (clientId: string) => void;
  clients: Client[];
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedClient = clients.find((client) => client.id === value);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredClients = clients.filter((client) =>
    `${client.businessName} ${client.clientCode}`.toLowerCase().includes(normalizedSearch),
  ).slice(0, 20);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  return (
    <div ref={pickerRef} style={{ position: 'relative' }}>
      <input
        id={id}
        required={!value}
        value={search}
        placeholder={selectedClient ? `${selectedClient.businessName} (${selectedClient.clientCode})` : 'Type a client name or code…'}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={(event) => { onChange(''); setSearch(event.target.value); setOpen(true); }}
        autoComplete="off"
        aria-label="Search client"
        aria-expanded={open}
        role="combobox"
      />
      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 280, overflowY: 'auto',
        }}>
          {filteredClients.length === 0 ? (
            <div style={{ padding: '0.7rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No matching clients.
            </div>
          ) : filteredClients.map((client) => (
            <button
              key={client.id}
              type="button"
              role="option"
              aria-selected={client.id === value}
              onClick={() => { onChange(client.id); setSearch(''); setOpen(false); }}
              style={{
                display: 'block', width: '100%', padding: '0.6rem 0.85rem', border: 0,
                borderBottom: '1px solid var(--border)', background: client.id === value ? 'var(--bg)' : 'transparent',
                color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem',
              }}
            >
              {client.businessName} <span style={{ color: 'var(--text-muted)' }}>({client.clientCode})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

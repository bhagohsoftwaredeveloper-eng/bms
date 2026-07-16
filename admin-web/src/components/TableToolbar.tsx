interface SelectFilter {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
}

interface DateRangeFilter {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}

interface TableToolbarProps {
  /** Omit search/onSearch to render a toolbar with only selects/date range. */
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  selects?: SelectFilter[];
  dateRange?: DateRangeFilter;
}

const dateLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

/**
 * Filter row rendered above a listing table: search box, optional select
 * filters, optional From/To date range. Purely presentational — the page owns
 * the state and applies the client-side filtering.
 */
export function TableToolbar({ search, onSearch, placeholder = 'Search…', selects, dateRange }: TableToolbarProps) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {onSearch && (
        <input
          className="input"
          type="text"
          value={search ?? ''}
          onChange={(e) => onSearch?.(e.target.value)}
          placeholder={placeholder}
          style={{ flex: '1 1 220px', maxWidth: 340, width: 'auto' }}
        />
      )}
      {(selects ?? []).map((s, i) => (
        <select key={i} className="input" value={s.value} aria-label={s.ariaLabel} onChange={(e) => s.onChange(e.target.value)}>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}
      {dateRange && (
        <>
          <label style={dateLabelStyle}>
            From
            <input className="input" type="date" value={dateRange.from} onChange={(e) => dateRange.onFrom(e.target.value)} />
          </label>
          <label style={dateLabelStyle}>
            To
            <input className="input" type="date" value={dateRange.to} onChange={(e) => dateRange.onTo(e.target.value)} />
          </label>
        </>
      )}
    </div>
  );
}

/** Case-insensitive substring match across the given field values. */
export function matchesSearch(search: string, ...fields: (string | null | undefined)[]): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}

/** Inclusive from/to check for an ISO date/datetime string ('' bounds are open). */
export function inDateRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to + 'T23:59:59.999').getTime()) return false;
  return true;
}

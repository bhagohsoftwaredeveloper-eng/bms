import { useState } from 'react';

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function usePagination<T>(items: T[], defaultPageSize: PageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paginated = items.slice(start, start + pageSize);

  function changePageSize(size: PageSize) {
    setPageSize(size);
    setPage(1);
  }

  function changePage(p: number) {
    setPage(Math.max(1, Math.min(p, totalPages)));
  }

  // Reset to page 1 when items change length significantly (e.g. after filter)
  // Caller should invoke this when the source array changes
  function reset() {
    setPage(1);
  }

  return { paginated, page: safePage, pageSize, totalPages, total: items.length, start, changePageSize, changePage, reset };
}

interface PaginationProps {
  page: number;
  pageSize: PageSize;
  totalPages: number;
  total: number;
  start: number;
  onPage: (p: number) => void;
  onPageSize: (s: PageSize) => void;
}

export function Pagination({ page, pageSize, totalPages, total, start, onPage, onPageSize }: PaginationProps) {
  if (total === 0) return null;

  const end = Math.min(start + pageSize, total);

  // Build page number list with ellipsis
  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  const btnBase: React.CSSProperties = {
    minWidth: 32, height: 32, padding: '0 0.4rem',
    border: '1px solid var(--border)', borderRadius: 6,
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
      {/* Count */}
      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Showing {total === 0 ? 0 : start + 1}–{end} of {total}
      </span>

      {/* Page numbers */}
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <button
          type="button"
          style={{ ...btnBase, color: page === 1 ? 'var(--text-muted)' : 'var(--text)' }}
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} style={{ padding: '0 0.25rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>…</span>
          ) : (
            <button
              key={p}
              type="button"
              style={{
                ...btnBase,
                background: p === page ? 'var(--accent)' : 'var(--surface)',
                color: p === page ? 'var(--accent-contrast)' : 'var(--text)',
                borderColor: p === page ? 'var(--accent)' : 'var(--border)',
              }}
              onClick={() => onPage(p as number)}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          style={{ ...btnBase, color: page === totalPages ? 'var(--text-muted)' : 'var(--text)' }}
          disabled={page === totalPages}
          onClick={() => onPage(page + 1)}
        >
          ›
        </button>
      </div>

      {/* Page size selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Rows per page:
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value) as PageSize)}
          style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: '0.82rem' }}
        >
          {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
}

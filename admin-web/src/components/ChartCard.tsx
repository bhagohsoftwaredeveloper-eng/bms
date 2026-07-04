import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  children: ReactNode;
  subtitle?: string;
}

export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: '2.5px solid var(--accent)',
        borderRadius: '14px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ marginBottom: '1.5rem' }}>
        <h3
          style={{
            margin: '0 0 0.25rem 0',
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

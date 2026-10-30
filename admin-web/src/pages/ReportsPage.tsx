import { Link } from 'react-router-dom';
import { ArrowRight, FileBarChart, Users } from 'lucide-react';
import { useAuthStore } from '../lib/auth-store';
import type { UserRole } from '../lib/types';

const reportCards = [
  {
    to: '/reports/installers',
    title: 'Installer Report',
    description: 'See installer assignments, client installations, job progress, and earnings.',
    icon: Users,
    roles: ['SUPER_ADMIN', 'ADMIN_STAFF'],
    tone: 'var(--accent)',
  },
];

export function ReportsPage() {
  const user = useAuthStore((state) => state.user);
  const roles = user?.roles ?? (user?.role ? [user.role] : []);
  const availableReports = reportCards.filter((report) => report.roles.some((role) => roles.includes(role as UserRole)));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <FileBarChart size={28} color="var(--accent)" />
        <div>
          <h1 style={{ margin: 0 }}>Reports</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Choose a report to view and export.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {availableReports.map(({ to, title, description, icon: Icon, tone }) => (
          <Link
            key={to}
            to={to}
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 190,
              padding: '1.25rem',
              color: 'var(--text)',
              textDecoration: 'none',
              transition: 'transform 0.18s ease, border-color 0.18s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 12, background: 'var(--surface-secondary)', color: tone }}>
                <Icon size={22} />
              </span>
              <ArrowRight size={19} color="var(--text-muted)" />
            </div>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem' }}>{title}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0, lineHeight: 1.55 }}>{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

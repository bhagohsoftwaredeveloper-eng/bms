import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Pagination, usePagination } from '../components/Pagination';
import { TableToolbar, matchesSearch, inDateRange } from '../components/TableToolbar';
import type { AuditLog } from '../lib/types';

export function AuditLogsPage() {
  const auditLogsQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => (await api.get<AuditLog[]>('/audit-logs')).data,
  });

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = (auditLogsQuery.data ?? []).filter((log) =>
    matchesSearch(search, log.user?.fullName, log.action, log.ipAddress, log.device)
    && inDateRange(log.createdAt, from, to),
  );
  const pg = usePagination(filtered, 20);

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Audit Logs</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Every sensitive action across the platform is recorded here for compliance and security review.
      </p>

      <div className="card">
        {auditLogsQuery.isLoading && <p>Loading audit logs…</p>}
        {auditLogsQuery.isError && <p className="error-text">Failed to load audit logs.</p>}
        {auditLogsQuery.data && auditLogsQuery.data.length === 0 && <p>No activity recorded yet.</p>}
        {auditLogsQuery.data && auditLogsQuery.data.length > 0 && (
          <>
            <TableToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search user, action, IP, device…"
              dateRange={{ from, to, onFrom: setFrom, onTo: setTo }}
            />
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>IP address</th>
                  <th>Device</th>
                </tr>
              </thead>
              <tbody>
                {pg.paginated.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                    <td>{log.user?.fullName ?? 'System'}</td>
                    <td>{log.action}</td>
                    <td>{log.ipAddress ?? '—'}</td>
                    <td>{log.device ?? '—'}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No matches.</td></tr>
                )}
              </tbody>
            </table>
            <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
          </>
        )}
      </div>
    </div>
  );
}

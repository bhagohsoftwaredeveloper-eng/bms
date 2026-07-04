import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Pagination, usePagination } from '../components/Pagination';
import type { AuditLog } from '../lib/types';

export function AuditLogsPage() {
  const auditLogsQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => (await api.get<AuditLog[]>('/audit-logs')).data,
  });

  const pg = usePagination(auditLogsQuery.data ?? [], 20);

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
              </tbody>
            </table>
            <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
          </>
        )}
      </div>
    </div>
  );
}

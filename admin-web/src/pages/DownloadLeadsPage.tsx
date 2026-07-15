import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Smartphone, Monitor } from 'lucide-react';
import { api } from '../lib/api';
import { Pagination, usePagination } from '../components/Pagination';
import type { DownloadLead, FinaraLead } from '../lib/types';

function TabButton({ label, active, count, onClick }: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.6rem 1.25rem',
        fontWeight: 600,
        fontSize: '0.9rem',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{ fontSize: '0.72rem', background: active ? 'var(--accent)' : 'var(--border)', color: active ? '#fff' : 'var(--text-muted)', borderRadius: 999, padding: '0.1rem 0.45rem', fontWeight: 700 }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Download Leads Tab (our landing page) ──────────────────────────────────

function DownloadLeadsTab({ leads, isLoading, isError }: { leads: DownloadLead[]; isLoading: boolean; isError: boolean }) {
  const pg = usePagination(leads);

  return (
    <div className="card">
      {isLoading && <p>Loading leads…</p>}
      {isError && <p className="error-text">Failed to load leads.</p>}
      {!isLoading && !isError && leads.length === 0 && <p>No leads captured yet.</p>}
      {leads.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact Person</th>
                <th>Contact No</th>
                <th>Email</th>
                <th>Platform</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {pg.paginated.map((lead) => (
                <tr key={lead.id}>
                  <td style={{ fontWeight: 600 }}>{lead.companyName}</td>
                  <td>{lead.contactPerson}</td>
                  <td>{lead.contactNo}</td>
                  <td>
                    {lead.email ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    {lead.email && lead.emailVerified && (
                      <span
                        title="Email verified via OTP"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          marginLeft: 6,
                          fontSize: '0.7rem',
                          color: 'var(--success)',
                          fontWeight: 600,
                        }}
                      >
                        <BadgeCheck size={13} /> verified
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
                      {lead.platform === 'ANDROID_APK' ? <Smartphone size={14} /> : <Monitor size={14} />}
                      {lead.platform === 'ANDROID_APK' ? 'Android APK' : 'Desktop PWA'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(lead.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={pg.page}
            pageSize={pg.pageSize}
            totalPages={pg.totalPages}
            total={pg.total}
            start={pg.start}
            onPage={pg.changePage}
            onPageSize={pg.changePageSize}
          />
        </>
      )}
    </div>
  );
}

// ── Finara Leads Tab (external ERP, live proxy) ────────────────────────────

const FINARA_STATUS_STYLES: Record<FinaraLead['status'], { bg: string; fg: string }> = {
  NEW: { bg: 'var(--accent-light)', fg: 'var(--accent)' },
  CONTACTED: { bg: 'var(--warning-light)', fg: 'var(--warning)' },
  CLOSED: { bg: 'var(--border)', fg: 'var(--text-muted)' },
};

function FinaraStatusBadge({ status }: { status: FinaraLead['status'] }) {
  const style = FINARA_STATUS_STYLES[status] ?? FINARA_STATUS_STYLES.CLOSED;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.55rem',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 700,
        background: style.bg,
        color: style.fg,
      }}
    >
      {status}
    </span>
  );
}

function FinaraLeadsTab({ leads, isLoading, error }: { leads: FinaraLead[]; isLoading: boolean; error: unknown }) {
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads;
  const pg = usePagination(filtered);

  const errorMessage =
    (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ??
    'Failed to load Finara leads.';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {isLoading && <p>Loading Finara leads…</p>}
      {!!error && <p className="error-text">{errorMessage}</p>}
      {!isLoading && !error && filtered.length === 0 && (
        <p>{statusFilter ? 'No leads with this status.' : 'No Finara leads yet.'}</p>
      )}
      {filtered.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Message</th>
                <th>Source</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {pg.paginated.map((lead) => (
                <tr key={lead.id}>
                  <td style={{ fontWeight: 600 }}>{lead.name}</td>
                  <td>{lead.company ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{lead.email}</td>
                  <td>{lead.phone ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ maxWidth: 280 }}>
                    <span title={lead.message ?? undefined} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.message ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{lead.source ?? '—'}</td>
                  <td><FinaraStatusBadge status={lead.status} /></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(lead.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={pg.page}
            pageSize={pg.pageSize}
            totalPages={pg.totalPages}
            total={pg.total}
            start={pg.start}
            onPage={pg.changePage}
            onPageSize={pg.changePageSize}
          />
        </>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function DownloadLeadsPage() {
  const [activeTab, setActiveTab] = useState<'downloads' | 'finara'>('downloads');

  const leadsQuery = useQuery({
    queryKey: ['download-leads'],
    queryFn: async () => (await api.get<DownloadLead[]>('/download-leads')).data,
  });

  const finaraQuery = useQuery({
    queryKey: ['finara-leads'],
    queryFn: async () => (await api.get<FinaraLead[]>('/download-leads/finara')).data,
    enabled: activeTab === 'finara',
    retry: false,
  });

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Download Leads</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Companies that filled out the landing-page form before downloading the app or installing the
        desktop console.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <TabButton
          label="Download Leads"
          active={activeTab === 'downloads'}
          count={leadsQuery.data?.length}
          onClick={() => setActiveTab('downloads')}
        />
        <TabButton
          label="Finara Leads"
          active={activeTab === 'finara'}
          count={finaraQuery.data?.length}
          onClick={() => setActiveTab('finara')}
        />
      </div>

      {activeTab === 'downloads' && (
        <DownloadLeadsTab leads={leadsQuery.data ?? []} isLoading={leadsQuery.isLoading} isError={leadsQuery.isError} />
      )}
      {activeTab === 'finara' && (
        <FinaraLeadsTab leads={finaraQuery.data ?? []} isLoading={finaraQuery.isLoading} error={finaraQuery.error} />
      )}
    </div>
  );
}

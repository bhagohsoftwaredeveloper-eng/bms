import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ChartCard } from '../components/ChartCard';
import { SimpleBarChart } from '../components/SimpleChart';
import { matchesSearch } from '../components/TableToolbar';
import type { Client, ClientPaymentHistory, CollectionsSummary, OutstandingRow } from '../lib/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
type Tab = 'collections' | 'outstanding' | 'client';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => MONTH_NAMES[Number(ym.slice(5)) - 1] ?? ym;

async function downloadCsv(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

function StatCard({ label, value, caption, color }: { label: string; value: ReactNode; caption?: string; color?: string }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', padding: '0.9rem 1.1rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem', color: color ?? 'var(--text)' }}>
        {value}
      </div>
      {caption && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{caption}</div>}
    </div>
  );
}

const thLeft = { textAlign: 'left' as const, padding: '0.3rem 0' };
const thRight = { textAlign: 'right' as const, padding: '0.3rem 0' };
const tdRight = { textAlign: 'right' as const };

export function FinancialReportsPage() {
  const [tab, setTab] = useState<Tab>('collections');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientId, setClientId] = useState('');
  const [outstandingSearch, setOutstandingSearch] = useState('');

  const collectionsQuery = useQuery({
    queryKey: ['financial-collections', from, to],
    queryFn: async () => (await api.get<CollectionsSummary>('/reports/financial/collections', { params: { from: from || undefined, to: to || undefined } })).data,
    enabled: tab === 'collections',
  });

  // Feeds the "Outstanding Receivables" stat on Collections, the Outstanding
  // tab itself, and the per-client balance on Client History.
  const outstandingQuery = useQuery({
    queryKey: ['financial-outstanding'],
    queryFn: async () => (await api.get<OutstandingRow[]>('/reports/financial/outstanding')).data,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients', 'SOFTWARE'],
    queryFn: async () => (await api.get<Client[]>('/clients', { params: { type: 'SOFTWARE' } })).data,
    enabled: tab === 'client',
  });

  const clientHistoryQuery = useQuery({
    queryKey: ['financial-client-history', clientId],
    queryFn: async () => (await api.get<ClientPaymentHistory>(`/reports/financial/client/${clientId}`)).data,
    enabled: tab === 'client' && !!clientId,
  });

  const summary = collectionsQuery.data;
  const paymentCount = summary?.byMethod.reduce((s, m) => s + m.count, 0) ?? 0;
  const outstandingRows = outstandingQuery.data ?? [];
  const totalOutstanding = outstandingRows.reduce((s, r) => s + r.balance, 0);
  const visibleOutstanding = outstandingRows.filter((r) =>
    matchesSearch(outstandingSearch, r.clientName, r.jobOrderId.slice(0, 8)),
  );

  const history = clientHistoryQuery.data;
  const clientTotalPaid = history?.payments.reduce((s, p) => s + Number(p.amount), 0) ?? 0;
  const clientOutstanding = outstandingRows.filter((r) => r.clientId === clientId).reduce((s, r) => s + r.balance, 0);

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

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Financial Reports</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['collections', 'outstanding', 'client'] as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab(t)}>
            {t === 'collections' ? 'Collections' : t === 'outstanding' ? 'Outstanding' : 'Client History'}
          </button>
        ))}
      </div>

      {tab === 'collections' && (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={dateLabelStyle}>
              From
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label style={dateLabelStyle}>
              To
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => downloadCsv(`/reports/financial/export?type=collections&from=${from}&to=${to}`, 'collections.csv')}>
              Export CSV
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <StatCard
              label="Total Collected"
              value={peso(summary?.totalCollected ?? 0)}
              caption={from || to ? 'Within the selected period' : 'All time'}
              color="var(--success)"
            />
            <StatCard label="Payments" value={paymentCount} caption="Non-voided payments recorded" />
            <StatCard
              label="Average Payment"
              value={peso(paymentCount > 0 ? (summary?.totalCollected ?? 0) / paymentCount : 0)}
              caption="Total collected ÷ payments"
            />
            <StatCard
              label="Outstanding Receivables"
              value={peso(totalOutstanding)}
              caption={`${outstandingRows.length} unpaid JO${outstandingRows.length === 1 ? '' : 's'}`}
              color={totalOutstanding > 0 ? 'var(--danger)' : 'var(--success)'}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start', marginBottom: 0 }}>
            <ChartCard title="Collections by Method" subtitle="Total collected per payment method">
              <SimpleBarChart data={(summary?.byMethod ?? []).map((m) => ({ label: m.method.replace('_', ' '), value: m.total }))} />
              {summary && summary.byMethod.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th style={thLeft}>Method</th>
                      <th style={thRight}>Payments</th>
                      <th style={thRight}>Total</th>
                      <th style={thRight}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byMethod.map((m) => (
                      <tr key={m.method} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.3rem 0' }}>{m.method.replace('_', ' ')}</td>
                        <td style={tdRight}>{m.count}</td>
                        <td style={{ ...tdRight, fontWeight: 600 }}>{peso(m.total)}</td>
                        <td style={{ ...tdRight, color: 'var(--text-muted)' }}>
                          {summary.totalCollected > 0 ? `${((m.total / summary.totalCollected) * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ChartCard>

            <ChartCard title="Monthly Collections" subtitle="Last 6 months, all payments">
              <SimpleBarChart data={(summary?.byMonth ?? []).map((m) => ({ label: monthLabel(m.month), value: m.total }))} />
            </ChartCard>
          </div>

          <ChartCard title="Recent Payments" subtitle={from || to ? 'Latest payments within the selected period' : 'Latest payments recorded'}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th style={thLeft}>Date</th>
                  <th style={thLeft}>Client</th>
                  <th style={thLeft}>Method</th>
                  <th style={thLeft}>Job Order</th>
                  <th style={thRight}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.recentPayments ?? []).map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.3rem 0' }}>{new Date(p.paidAt).toLocaleDateString()}</td>
                    <td>{p.clientName}</td>
                    <td>{p.method.replace('_', ' ')}</td>
                    <td>JO-{p.jobOrderId.slice(0, 8).toUpperCase()}</td>
                    <td style={{ ...tdRight, fontWeight: 600, color: 'var(--success)' }}>{peso(p.amount)}</td>
                  </tr>
                ))}
                {(summary?.recentPayments ?? []).length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No payments recorded.</td></tr>
                )}
              </tbody>
            </table>
          </ChartCard>
        </>
      )}

      {tab === 'outstanding' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <StatCard
              label="Total Outstanding"
              value={peso(totalOutstanding)}
              caption="Balances still collectible"
              color={totalOutstanding > 0 ? 'var(--danger)' : 'var(--success)'}
            />
            <StatCard label="Unpaid Job Orders" value={outstandingRows.length} caption="JOs not yet fully paid" />
          </div>

          <ChartCard title="Outstanding Balances" subtitle="Job Orders not yet fully paid">
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="input"
                type="text"
                value={outstandingSearch}
                onChange={(e) => setOutstandingSearch(e.target.value)}
                placeholder="Search client, JO #…"
                style={{ flex: '1 1 220px', maxWidth: 340, width: 'auto' }}
              />
              <button type="button" className="btn btn-secondary" onClick={() => downloadCsv('/reports/financial/export?type=outstanding', 'outstanding.csv')}>
                Export CSV
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th style={thLeft}>Client</th>
                  <th style={thLeft}>Job Order</th>
                  <th style={thRight}>Grand Total</th>
                  <th style={thRight}>Paid</th>
                  <th style={thRight}>Balance</th>
                  <th style={thLeft}>Last Payment</th>
                </tr>
              </thead>
              <tbody>
                {visibleOutstanding.map((row) => (
                  <tr key={row.jobOrderId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.3rem 0' }}>{row.clientName}</td>
                    <td>JO-{row.jobOrderId.slice(0, 8).toUpperCase()}</td>
                    <td style={tdRight}>{peso(row.grandTotal)}</td>
                    <td style={tdRight}>{peso(row.totalPaid)}</td>
                    <td style={{ ...tdRight, color: 'var(--danger)', fontWeight: 700 }}>{peso(row.balance)}</td>
                    <td>{row.lastPaymentAt ? new Date(row.lastPaymentAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
                {visibleOutstanding.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>
                    {outstandingRows.length === 0 ? 'No outstanding balances.' : 'No matches.'}
                  </td></tr>
                )}
              </tbody>
              {visibleOutstanding.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ padding: '0.4rem 0' }} colSpan={2}>Total ({visibleOutstanding.length})</td>
                    <td style={tdRight}>{peso(visibleOutstanding.reduce((s, r) => s + r.grandTotal, 0))}</td>
                    <td style={tdRight}>{peso(visibleOutstanding.reduce((s, r) => s + r.totalPaid, 0))}</td>
                    <td style={{ ...tdRight, color: 'var(--danger)' }}>{peso(visibleOutstanding.reduce((s, r) => s + r.balance, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </ChartCard>
        </>
      )}

      {tab === 'client' && (
        <>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ marginBottom: '1.25rem', minWidth: 260 }}>
            <option value="">Select a client…</option>
            {(clientsQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
          </select>

          {history && (
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <StatCard label="Total Paid" value={peso(clientTotalPaid)} caption={history.clientName} color="var(--success)" />
              <StatCard label="Payments" value={history.payments.length} caption="Non-voided payments" />
              <StatCard
                label="Outstanding Balance"
                value={peso(clientOutstanding)}
                caption={clientOutstanding > 0 ? 'Still collectible from this client' : 'Fully paid'}
                color={clientOutstanding > 0 ? 'var(--danger)' : 'var(--success)'}
              />
            </div>
          )}

          {history && (
            <ChartCard title="Client Payment History" subtitle={history.clientName}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th style={thLeft}>Date</th>
                    <th style={thLeft}>Method</th>
                    <th style={thLeft}>Job Order</th>
                    <th style={thRight}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {history.payments.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.3rem 0' }}>{new Date(p.paidAt).toLocaleDateString()}</td>
                      <td>{p.method.replace('_', ' ')}</td>
                      <td>JO-{p.jobOrderId.slice(0, 8).toUpperCase()}</td>
                      <td style={{ ...tdRight, fontWeight: 600 }}>{peso(Number(p.amount))}</td>
                    </tr>
                  ))}
                  {history.payments.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No payments for this client.</td></tr>
                  )}
                </tbody>
              </table>
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}

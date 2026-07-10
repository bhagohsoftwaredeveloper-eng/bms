import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { ChartCard } from '../components/ChartCard';
import { SimpleBarChart, SimplePieChart } from '../components/SimpleChart';
import type { FinancialSummary, Incentive, KpiMetric, RevenueTrend, TeamMemberKpi } from '../lib/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_COLOR: Record<string, string> = { PENDING: 'var(--warning)', APPROVED: 'var(--info)', PAID: 'var(--success)' };

// ── KPI breakdown row ─────────────────────────────────────────────────────────

function KpiBreakdown({ kpis }: { kpis: KpiMetric[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: '0.5rem' }}>
      <thead>
        <tr style={{ color: 'var(--text-muted)' }}>
          <th style={{ textAlign: 'left', padding: '0.3rem 0', fontWeight: 600 }}>KPI</th>
          <th style={{ textAlign: 'right', padding: '0.3rem 0', fontWeight: 600 }}>Actual</th>
          <th style={{ textAlign: 'right', padding: '0.3rem 0', fontWeight: 600 }}>Target</th>
          <th style={{ textAlign: 'right', padding: '0.3rem 0', fontWeight: 600 }}>Score</th>
        </tr>
      </thead>
      <tbody>
        {kpis.map((k) => (
          <tr key={k.name} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: '0.3rem 0' }}>{k.name}</td>
            <td style={{ textAlign: 'right', padding: '0.3rem 0' }}>
              {k.isManual && !k.actual ? '—' : `${k.actual}${k.unit === '%' ? '%' : ''}`}
            </td>
            <td style={{ textAlign: 'right', padding: '0.3rem 0', color: 'var(--text-muted)' }}>
              {k.target}{k.unit === '%' ? '%' : ''}
            </td>
            <td style={{ textAlign: 'right', padding: '0.3rem 0', fontWeight: 700 }}>{k.score.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Manual KPI input ──────────────────────────────────────────────────────────

function ManualKpiForm({ month, year }: { month: number; year: number }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [kpiName, setKpiName] = useState('');
  const [actualValue, setActualValue] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/kpis/manual', { userId, month, year, kpiName, actualValue: Number(actualValue) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['analytics-team'] }); setActualValue(''); },
  });

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Enter Manual KPI</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
        Use this for KPIs that cannot be auto-computed (Customer Satisfaction, Safety Compliance, Quality Score, etc.)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        <input className="input" placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <input className="input" placeholder="KPI Name (exact)" value={kpiName} onChange={(e) => setKpiName(e.target.value)} />
        <input
          className="input"
          type="number"
          placeholder="Actual value (0-100)"
          value={actualValue}
          onChange={(e) => setActualValue(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!userId || !kpiName || !actualValue || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Saving…' : 'Save KPI'}
        </button>
      </div>
      {mutation.isError && <div style={{ color: 'var(--danger)', marginTop: '0.5rem', fontSize: '0.85rem' }}>Failed to save. Check the User ID and KPI name.</div>}
      {mutation.isSuccess && <div style={{ color: 'var(--success)', marginTop: '0.5rem', fontSize: '0.85rem' }}>Saved successfully.</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const qc = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ['kpis', 'financial-summary'],
    queryFn: async () => (await api.get<FinancialSummary>('/kpis/financial-summary')).data,
  });

  const trendQuery = useQuery({
    queryKey: ['kpis', 'revenue-trend'],
    queryFn: async () => (await api.get<RevenueTrend[]>('/kpis/revenue-trend')).data,
  });

  const team = useQuery({
    queryKey: ['analytics-team', month, year],
    queryFn: async () => (await api.get<TeamMemberKpi[]>(`/kpis/team?month=${month}&year=${year}`)).data,
  });

  const incentives = useQuery({
    queryKey: ['analytics-incentives', month, year],
    queryFn: async () => (await api.get<Incentive[]>(`/kpis/incentives?month=${month}&year=${year}`)).data,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/kpis/incentives/generate', { month, year }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics-incentives'] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/kpis/incentives/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics-incentives'] }),
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/kpis/incentives/${id}/pay`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics-incentives'] }),
  });

  const summary = summaryQuery.data;
  const trend = trendQuery.data;
  const years = [now.getFullYear() - 1, now.getFullYear()];

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Analytics & KPI</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Financial performance, team KPIs, and incentive management.
      </p>

      {/* ── Financial Summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.5rem', marginBottom: '2rem' }}>
        <div className="card">
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>Total Revenue</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success)' }}>
            ₱{summary?.totalRevenue.toLocaleString() ?? '…'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>All-time finalized sales</div>
        </div>
        <div className="card">
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>This Month</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>₱{summary?.currentMonthRevenue.toLocaleString() ?? '…'}</div>
          <div style={{ fontSize: '0.8rem', color: (summary?.growth ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            {(summary?.growth ?? 0) >= 0 ? '+' : ''}{summary?.growth.toFixed(1) ?? '…'}% from last month
          </div>
        </div>
        <div className="card">
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>Last Month</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>₱{summary?.prevMonthRevenue.toLocaleString() ?? '…'}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Previous month total</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>
        <ChartCard title="Revenue Trend" subtitle="Monthly revenue for the last 6 months">
          {trend ? <SimpleBarChart data={trend} height={320} /> : <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading…</div>}
        </ChartCard>
        <ChartCard title="Revenue by Product" subtitle="Distribution of sales across software products">
          {summary ? <SimplePieChart data={summary.revenueByProduct} size={320} /> : <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading…</div>}
        </ChartCard>
      </div>

      {/* ── Period selector for KPI ── */}
      <h2 style={{ marginTop: '2.5rem', marginBottom: '0.25rem' }}>Team KPI Performance</h2>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 130 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="input" style={{ width: 100 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isPending ? 'Generating…' : 'Generate Incentives'}
        </button>
      </div>

      {/* ── Team KPI table ── */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: '1rem' }}>
          KPI Scores — {MONTHS[month - 1]} {year}
        </div>
        {team.isPending && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
        {team.data?.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No active team members found.</div>}
        {team.data && team.data.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Role</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Score</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Base Bonus</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Incentive</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Status</th>
                <th style={{ width: 30 }}></th>
              </tr>
            </thead>
              {team.data.map((m) => {
                const scoreColor = m.totalScore >= 95 ? 'var(--success)' : m.totalScore >= 80 ? 'var(--warning)' : 'var(--danger)';
                return (
                  <tbody key={m.userId}>
                    <tr
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => setExpandedUser(expandedUser === m.userId ? null : m.userId)}
                    >
                      <td style={{ padding: '0.6rem 0' }}>{m.fullName}</td>
                      <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{m.role}</td>
                      <td style={{ textAlign: 'right', padding: '0.6rem 0', fontWeight: 800, color: scoreColor }}>
                        {m.totalScore.toFixed(1)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.6rem 0', color: 'var(--text-muted)' }}>₱{(m.baseBonus ?? 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', padding: '0.6rem 0' }}>₱{m.incentiveEstimate.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', padding: '0.6rem 0' }}>
                        {m.incentiveStatus && (
                          <span style={{ color: STATUS_COLOR[m.incentiveStatus], fontSize: '0.8rem', fontWeight: 700 }}>
                            {m.incentiveStatus}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {expandedUser === m.userId ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expandedUser === m.userId && (
                      <tr style={{ background: 'var(--surface)' }}>
                        <td colSpan={7} style={{ padding: '0.75rem 1.5rem' }}>
                          <KpiBreakdown kpis={m.kpis} />
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.5rem' }}>
                            User ID: <code>{m.userId}</code>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
          </table>
        )}
      </div>

      {/* ── Manual KPI form ── */}
      <ManualKpiForm month={month} year={year} />

      {/* ── Incentives table ── */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '1rem' }}>
          Incentives — {MONTHS[month - 1]} {year}
        </div>
        {incentives.isPending && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
        {!incentives.isPending && incentives.data?.length === 0 && (
          <div style={{ color: 'var(--text-muted)' }}>
            No incentives generated yet. Use "Generate Incentives" to compute bonuses from current KPI scores.
          </div>
        )}
        {incentives.data && incentives.data.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Role</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Score</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Base Bonus</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Bonus</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incentives.data.map((inc) => (
                <tr key={inc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.6rem 0' }}>{inc.user?.fullName ?? inc.userId}</td>
                  <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{inc.user?.role}</td>
                  <td style={{ textAlign: 'right', padding: '0.6rem 0' }}>{Number(inc.totalScore).toFixed(1)}</td>
                  <td style={{ textAlign: 'right', padding: '0.6rem 0', color: 'var(--text-muted)' }}>
                    ₱{Number(inc.baseBonus).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.6rem 0', fontWeight: 700, color: 'var(--success)' }}>
                    ₱{Number(inc.bonusAmount).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.6rem 0' }}>
                    <span style={{ color: STATUS_COLOR[inc.status], fontWeight: 700, fontSize: '0.8rem' }}>{inc.status}</span>
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.6rem 0' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {inc.status === 'PENDING' && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(inc.id)}
                        >
                          Approve
                        </button>
                      )}
                      {inc.status === 'APPROVED' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                          disabled={payMutation.isPending}
                          onClick={() => payMutation.mutate(inc.id)}
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

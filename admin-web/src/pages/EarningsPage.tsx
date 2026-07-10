import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import { useAuthStore } from '../lib/auth-store';
import type { AuthenticatedUser, Earning, EarningType } from '../lib/types';


const EARNING_TYPES: EarningType[] = ['INSTALLATION', 'ACTIVATION', 'BONUS', 'COMMISSION'];

const EMPTY_FORM = { userId: '', amount: '', type: EARNING_TYPES[0] };

export function EarningsPage() {
  const user = useAuthStore((s) => s.user);
  // Mirrors the backend: SUPER_ADMIN and ADMIN_STAFF see all earnings and can
  // approve/mark paid, but only SUPER_ADMIN can allocate new incentives.
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_STAFF';
  const canAllocate = user?.role === 'SUPER_ADMIN';
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  const earningsQuery = useQuery({
    queryKey: ['earnings'],
    queryFn: async () => (await api.get<Earning[]>('/earnings')).data,
  });

  const balanceQuery = useQuery({
    queryKey: ['withdrawals', 'balance'],
    queryFn: async () => (await api.get<{ availableBalance: number }>('/withdrawals/balance')).data,
    enabled: !canManage,
  });

  const usersQuery = useQuery({
    queryKey: ['users', 'all'],
    queryFn: async () => {
      const [installers, developers] = await Promise.all([
        api.get<AuthenticatedUser[]>('/users', { params: { role: 'INSTALLER' } }),
        api.get<AuthenticatedUser[]>('/users', { params: { role: 'DEVELOPER' } }),
      ]);
      return [...installers.data, ...developers.data];
    },
    enabled: showForm,
  });

  const allocateIncentive = useMutation({
    mutationFn: async () =>
      (
        await api.post<Earning>('/earnings', {
          userId: form.userId,
          amount: Number(form.amount),
          type: form.type,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['earnings'] });
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'paid' }) =>
      (await api.patch<Earning>(`/earnings/${id}/${action}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['earnings'] }),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    allocateIncentive.mutate();
  };

  // Build running balance (oldest → newest cumulative sum, then reverse back to newest-first)
  const earningsWithBalance = earningsQuery.data
    ? [...earningsQuery.data]
        .reverse()
        .reduce<(Earning & { runningBalance: number })[]>((acc, e) => {
          const prev = acc.length > 0 ? acc[acc.length - 1].runningBalance : 0;
          acc.push({ ...e, runningBalance: prev + Number(e.amount) });
          return acc;
        }, [])
        .reverse()
    : [];

  // Use server-computed balance (APPROVED earnings minus in-flight withdrawals)
  const approvedBalance = balanceQuery.data?.availableBalance ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{canManage ? 'Earnings' : 'My Earnings'}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            {canAllocate
              ? 'Allocate installation, activation, bonus, and commission incentives to installers and developers.'
              : canManage
                ? 'Review and approve installation, activation, bonus, and commission incentives for the team.'
                : 'Track incentives allocated to you for installations, activations, bonuses, and commissions.'}
          </p>
        </div>
        {canAllocate && (
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            Allocate incentive
          </button>
        )}
      </div>

      {!canManage && earningsQuery.data && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: '1 1 160px', padding: '0.9rem 1.1rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Available Balance
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)', marginTop: '0.25rem' }}>
              ₱{approvedBalance.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved earnings minus in-flight withdrawals</div>
          </div>
          <div className="card" style={{ flex: '1 1 160px', padding: '0.9rem 1.1rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)', marginTop: '0.25rem' }}>
              ₱{earningsQuery.data.filter((e) => e.status === 'PENDING').reduce((s, e) => s + Number(e.amount), 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting admin approval</div>
          </div>
          <div className="card" style={{ flex: '1 1 160px', padding: '0.9rem 1.1rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Paid Out
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
              ₱{earningsQuery.data.filter((e) => e.status === 'PAID').reduce((s, e) => s + Number(e.amount), 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Released to your account</div>
          </div>
        </div>
      )}

      <Dialog
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Allocate Incentive"
        maxWidth={480}
      >
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="userId">Recipient</label>
            <select id="userId" required value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Select a team member…</option>
              {usersQuery.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="type">Type</label>
            <select
              id="type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as EarningType })}
            >
              {EARNING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="amount">Amount (₱)</label>
            <input
              id="amount"
              type="number"
              min={0}
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          {allocateIncentive.isError && <p className="error-text">Could not allocate the incentive. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={allocateIncentive.isPending} style={{ flex: 1 }}>
              {allocateIncentive.isPending ? 'Saving…' : 'Allocate'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <EarningsTable earningsWithBalance={earningsWithBalance} isAdmin={canManage} isLoading={earningsQuery.isLoading} isError={earningsQuery.isError} hasData={!!earningsQuery.data} onSetStatus={(id, action) => setStatus.mutate({ id, action })} />
    </div>
  );
}

function EarningsTable({ earningsWithBalance, isAdmin, isLoading, isError, hasData, onSetStatus }: {
  earningsWithBalance: (Earning & { runningBalance: number })[];
  isAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
  onSetStatus: (id: string, action: 'approve' | 'paid') => void;
}) {
  const pg = usePagination(earningsWithBalance);
  return (
    <div className="card">
        {isLoading && <p>Loading earnings…</p>}
        {isError && <p className="error-text">Failed to load earnings.</p>}
        {hasData && earningsWithBalance.length === 0 && <p>No earnings recorded yet.</p>}
        {earningsWithBalance.length > 0 && (
          <>
          <table>
            <thead>
              <tr>
                {isAdmin && <th>Team</th>}
                <th>Client</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Cumulative Earnings</th>
                <th>Status</th>
                <th>Recorded</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {pg.paginated.map((earning) => (
                <tr key={earning.id}>
                  {isAdmin && (
                    <td>
                      <div style={{ fontWeight: 600 }}>{earning.user?.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{earning.user?.role}</div>
                    </td>
                  )}
                  <td>
                    {earning.job?.client?.businessName || (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>N/A</span>
                    )}
                  </td>
                  <td>{earning.type}</td>
                  <td>₱{Number(earning.amount).toLocaleString()}</td>
                  <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                    ₱{earning.runningBalance.toLocaleString()}
                  </td>
                  <td>
                    <StatusBadge status={earning.status} />
                  </td>
                  <td>{new Date(earning.createdAt).toLocaleDateString()}</td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        {earning.status === 'PENDING' && (
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onSetStatus(earning.id, 'approve')}>Approve</button>
                        )}
                        {earning.status === 'APPROVED' && (
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onSetStatus(earning.id, 'paid')}>Mark paid</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
          </>
        )}
      </div>
  );
}

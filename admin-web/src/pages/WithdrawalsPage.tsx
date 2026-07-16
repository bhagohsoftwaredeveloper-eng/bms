import { type FormEvent, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Paperclip, X, ZoomIn } from 'lucide-react';
import { api, fileUrl } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import { TableToolbar, matchesSearch, inDateRange } from '../components/TableToolbar';
import { useAuthStore } from '../lib/auth-store';
import type { Withdrawal, WithdrawalMethod } from '../lib/types';

const WITHDRAWAL_METHODS: WithdrawalMethod[] = ['GCASH', 'MAYA', 'BANK_TRANSFER'];
const EMPTY_FORM = { amount: '', method: WITHDRAWAL_METHODS[0], accountName: '', accountNumber: '' };

export function WithdrawalsPage() {
  const user = useAuthStore((s) => s.user);
  // Mirrors the backend: SUPER_ADMIN and ADMIN_STAFF see all requests and can
  // approve/reject/release; every role except SUPER_ADMIN can request payouts.
  const canProcess = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_STAFF';
  const canRequest = user?.role !== 'SUPER_ADMIN';
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  /* ── Release dialog state ── */
  const [releaseTarget, setReleaseTarget] = useState<Withdrawal | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Proof viewer state ── */
  const [viewProofUrl, setViewProofUrl] = useState<string | null>(null);

  const withdrawalsQuery = useQuery({
    queryKey: ['withdrawals'],
    queryFn: async () => (await api.get<Withdrawal[]>('/withdrawals')).data,
  });

  const balanceQuery = useQuery({
    queryKey: ['withdrawals', 'balance'],
    queryFn: async () => (await api.get<{ availableBalance: number }>('/withdrawals/balance')).data,
    enabled: canRequest,
  });

  const availableBalance = balanceQuery.data?.availableBalance ?? 0;
  const requestedAmount = Number(form.amount) || 0;
  const exceedsBalance = requestedAmount > availableBalance;

  const setStatus = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      (await api.patch<Withdrawal>(`/withdrawals/${id}/${action}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['earnings'] });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async ({ id, proofUrl }: { id: string; proofUrl?: string }) =>
      (await api.patch<Withdrawal>(`/withdrawals/${id}/release`, { proofUrl })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['earnings'] });
      closeReleaseDialog();
    },
  });

  const requestWithdrawal = useMutation({
    mutationFn: async () =>
      (
        await api.post<Withdrawal>('/withdrawals', {
          amount: Number(form.amount),
          method: form.method,
          accountName: form.accountName,
          accountNumber: form.accountNumber,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['withdrawals', 'balance'] });
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    requestWithdrawal.mutate();
  };

  /* ── Release dialog handlers ── */
  function openReleaseDialog(withdrawal: Withdrawal) {
    setReleaseTarget(withdrawal);
    setProofFile(null);
    setProofPreview(null);
    setUploadError('');
  }

  function closeReleaseDialog() {
    setReleaseTarget(null);
    setProofFile(null);
    setProofPreview(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleProofFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setProofFile(file);
    setUploadError('');
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setProofPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setProofPreview(null);
    }
  }

  async function handleRelease() {
    if (!releaseTarget) return;
    setUploadError('');

    try {
      let proofUrl: string | undefined;

      if (proofFile) {
        const formData = new FormData();
        formData.append('files', proofFile);
        const res = await api.post<{ urls: string[] }>('/uploads/images', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        proofUrl = res.data.urls[0];
      }

      releaseMutation.mutate({ id: releaseTarget.id, proofUrl });
    } catch {
      setUploadError('Failed to upload the proof image. Please try again.');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{canProcess ? 'Withdrawal Requests' : 'My Withdrawals'}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            {canProcess
              ? 'Review and release payouts requested by installers and developers via GCash, Maya, or bank transfer.'
              : 'Request a payout of your approved earnings via GCash, Maya, or bank transfer, and track its status.'}
          </p>
        </div>
        {canRequest && (
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            Request withdrawal
          </button>
        )}
      </div>

      {canRequest && (
        <div
          className="card"
          style={{
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            padding: '0.9rem 1.25rem',
            background: availableBalance > 0 ? 'rgba(22,163,74,0.06)' : undefined,
          }}
        >
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Available Balance
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--success)' }}>
              {balanceQuery.isLoading ? '…' : `₱${availableBalance.toLocaleString()}`}
            </div>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Only approved earnings can be withdrawn. In-flight withdrawal requests are already deducted from this balance.
          </div>
        </div>
      )}

      {/* ── Request withdrawal form dialog ── */}
      <Dialog isOpen={showForm} onClose={() => setShowForm(false)} title="Request Withdrawal" maxWidth={480}>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="amount">Amount (₱)</label>
            <input
              id="amount"
              type="number"
              min={1}
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            {form.amount && exceedsBalance && (
              <p className="error-text" style={{ margin: '0.25rem 0 0' }}>
                Amount exceeds your available balance of ₱{availableBalance.toLocaleString()}.
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="method">Method</label>
            <select
              id="method"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value as WithdrawalMethod })}
            >
              {WITHDRAWAL_METHODS.map((method) => (
                <option key={method} value={method}>{method.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="accountName">Account name</label>
            <input
              id="accountName"
              type="text"
              required
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="accountNumber">Account number</label>
            <input
              id="accountNumber"
              type="text"
              required
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            />
          </div>
          {requestWithdrawal.isError && (
            <p className="error-text">
              {(requestWithdrawal.error as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? 'Could not submit the request. Try again.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={requestWithdrawal.isPending || exceedsBalance || availableBalance === 0}
              style={{ flex: 1 }}
            >
              {requestWithdrawal.isPending ? 'Submitting…' : 'Request withdrawal'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      {/* ── Release with proof dialog ── */}
      <Dialog
        isOpen={!!releaseTarget}
        onClose={closeReleaseDialog}
        title="Release Withdrawal"
        maxWidth={480}
      >
        {releaseTarget && (
          <div>
            {/* Summary */}
            <div
              style={{
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '0.875rem 1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Requested by</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{releaseTarget.user?.fullName ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Amount</span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success)' }}>
                  ₱{Number(releaseTarget.amount).toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Via</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {releaseTarget.method.replace(/_/g, ' ')} · {releaseTarget.accountName} ({releaseTarget.accountNumber})
                </span>
              </div>
            </div>

            {/* Proof upload */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem',
                }}
              >
                Attach Payment Proof (optional)
              </label>

              {/* Preview */}
              {proofPreview ? (
                <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                  <img
                    src={proofPreview}
                    alt="Proof preview"
                    style={{
                      width: '100%',
                      maxHeight: 200,
                      objectFit: 'contain',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-secondary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setProofFile(null);
                      setProofPreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="proofFile"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    border: '1.5px dashed var(--border)',
                    borderRadius: 10,
                    padding: '1.5rem 1rem',
                    cursor: 'pointer',
                    background: 'var(--surface-secondary)',
                    transition: 'border-color 0.18s ease',
                    marginBottom: '0.75rem',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <Paperclip size={22} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Click to attach a screenshot or photo
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.7 }}>
                    JPEG, PNG, WEBP — max 10 MB
                  </span>
                </label>
              )}

              <input
                ref={fileInputRef}
                id="proofFile"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleProofFileChange}
              />
            </div>

            {uploadError && <p className="error-text" style={{ marginBottom: '0.75rem' }}>{uploadError}</p>}

            {releaseMutation.isError && (
              <p className="error-text" style={{ marginBottom: '0.75rem' }}>
                {(releaseMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message
                  ?? 'Failed to release. Please try again.'}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={releaseMutation.isPending}
                onClick={handleRelease}
              >
                {releaseMutation.isPending ? 'Releasing…' : 'Confirm Release'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeReleaseDialog}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Dialog>

      {/* ── Proof image viewer ── */}
      {viewProofUrl && (
        <div
          onClick={() => setViewProofUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '1.5rem',
            cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setViewProofUrl(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
            }}
          >
            <X size={16} />
          </button>
          <img
            src={fileUrl(viewProofUrl)}
            alt="Payment proof"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
              cursor: 'default',
            }}
          />
        </div>
      )}

      <WithdrawalsTable
        data={withdrawalsQuery.data ?? []}
        isAdmin={canProcess}
        isLoading={withdrawalsQuery.isLoading}
        isError={withdrawalsQuery.isError}
        onSetStatus={(id, action) => setStatus.mutate({ id, action })}
        onRelease={openReleaseDialog}
        onViewProof={setViewProofUrl}
      />
    </div>
  );
}

function WithdrawalsTable({
  data,
  isAdmin,
  isLoading,
  isError,
  onSetStatus,
  onRelease,
  onViewProof,
}: {
  data: Withdrawal[];
  isAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
  onSetStatus: (id: string, action: 'approve' | 'reject') => void;
  onRelease: (withdrawal: Withdrawal) => void;
  onViewProof: (url: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = data.filter((w) =>
    matchesSearch(search, w.user?.fullName, w.accountName, w.accountNumber, w.method.replace(/_/g, ' '))
    && (!status || w.status === status)
    && inDateRange(w.createdAt, from, to),
  );
  const pg = usePagination(filtered);

  return (
    <div className="card">
      {isLoading && <p>Loading withdrawal requests…</p>}
      {isError && <p className="error-text">Failed to load withdrawal requests.</p>}
      {!isLoading && data.length === 0 && <p>No withdrawal requests yet.</p>}
      {data.length > 0 && (
        <>
          <TableToolbar
            search={search}
            onSearch={setSearch}
            placeholder={isAdmin ? 'Search requester, account, method…' : 'Search account, method…'}
            selects={[{
              value: status,
              onChange: setStatus,
              ariaLabel: 'Filter by status',
              options: [
                { value: '', label: 'All statuses' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: 'RELEASED', label: 'Released' },
              ],
            }]}
            dateRange={{ from, to, onFrom: setFrom, onTo: setTo }}
          />
          <table>
            <thead>
              <tr>
                {isAdmin && <th>Requested by</th>}
                <th>Amount</th>
                <th>Method</th>
                <th>Account</th>
                <th>Status</th>
                <th>Proof</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {pg.paginated.map((withdrawal) => (
                <tr key={withdrawal.id}>
                  {isAdmin && <td style={{ fontWeight: 600 }}>{withdrawal.user?.fullName ?? '—'}</td>}
                  <td>₱{Number(withdrawal.amount).toLocaleString()}</td>
                  <td>{withdrawal.method.replace(/_/g, ' ')}</td>
                  <td>{withdrawal.accountName} · {withdrawal.accountNumber}</td>
                  <td><StatusBadge status={withdrawal.status} /></td>
                  <td>
                    {withdrawal.proofUrl ? (
                      <button
                        type="button"
                        onClick={() => onViewProof(withdrawal.proofUrl!)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: 'var(--info-light)',
                          border: '1px solid var(--info-glow)',
                          color: 'var(--info)',
                          borderRadius: 6,
                          padding: '0.3rem 0.65rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                        onMouseOut={(e) => (e.currentTarget.style.filter = '')}
                      >
                        <ZoomIn size={12} />
                        View Proof
                      </button>
                    ) : (
                      withdrawal.status === 'RELEASED' ? (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No proof attached</span>
                      ) : (
                        <span style={{ color: 'var(--border)', fontSize: '0.8rem' }}>—</span>
                      )
                    )}
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        {withdrawal.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              onClick={() => onSetStatus(withdrawal.id, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              onClick={() => onSetStatus(withdrawal.id, 'reject')}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {withdrawal.status === 'APPROVED' && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            onClick={() => onRelease(withdrawal)}
                          >
                            <ImageIcon size={13} />
                            Release
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 7 : 5} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No matches.</td></tr>
              )}
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

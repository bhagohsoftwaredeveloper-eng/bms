import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog } from '../components/Dialog';
import { SearchableClientSelect } from '../components/SearchableClientSelect';
import { Pagination, usePagination } from '../components/Pagination';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { useAuthStore } from '../lib/auth-store';
import type { AuthenticatedUser, Client, License, NenposClient, SoftwareProduct } from '../lib/types';

const EMPTY_FINGERPRINT_FORM = { cpu: '', disk: '', mac: '' };

// ── Shared helpers ──────────────────────────────────────────────────────────

function fmtDate(val: string | null | undefined) {
  return val ? new Date(val).toLocaleDateString() : '—';
}

function toIsoDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toIsoDateLocal(d);
}

function defaultTrialDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toIsoDateLocal(d);
}

type Tone = 'normal' | 'muted' | 'danger';

interface LicenseDatesView {
  installed: string;
  installedTone: Tone;
  expires: string;
  expiresTone: Tone;
  expiresNote: string | null;
  expiresNoteTone: Tone;
}

const DAY_MS = 86_400_000;

const TONE_COLOR: Record<Tone, string | undefined> = {
  normal: undefined,
  muted: 'var(--text-muted)',
  danger: 'var(--danger)',
};

/**
 * Display strings for a license's install (= activation) and expiry dates.
 * New trials get a fixed expirationDate at creation; only an old-style trial
 * (created before that) has none until activation — it shows the day-count
 * rule instead of a blank.
 */
function licenseDates(license: License): LicenseDatesView {
  const installed = license.activationDate
    ? new Date(license.activationDate).toLocaleDateString()
    : 'Not yet installed';
  const installedTone: Tone = license.activationDate ? 'normal' : 'muted';

  if (license.expirationDate) {
    const daysLeft = Math.ceil((new Date(license.expirationDate).getTime() - Date.now()) / DAY_MS);
    return {
      installed,
      installedTone,
      expires: new Date(license.expirationDate).toLocaleDateString(),
      expiresTone: 'normal',
      expiresNote: daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`,
      expiresNoteTone: daysLeft <= 7 ? 'danger' : 'muted',
    };
  }

  return {
    installed,
    installedTone,
    expires: license.isTrial ? `${license.trialDays ?? 30} days after install` : 'No expiry',
    expiresTone: 'muted',
    expiresNote: null,
    expiresNoteTone: 'muted',
  };
}

/** The Installed + Expires `<td>` pair for one table row. */
function LicenseDateCells({ license }: { license: License }) {
  const d = licenseDates(license);
  return (
    <>
      <td style={{ whiteSpace: 'nowrap', color: TONE_COLOR[d.installedTone] }}>{d.installed}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <div style={{ color: TONE_COLOR[d.expiresTone] }}>{d.expires}</div>
        {d.expiresNote && (
          <div style={{ fontSize: '0.75rem', color: TONE_COLOR[d.expiresNoteTone] }}>
            {d.expiresNote}
          </div>
        )}
      </td>
    </>
  );
}

/** The Installed + Expiry Date rows inside the View Details dialog. */
function LicenseDateDetails({ license }: { license: License }) {
  const d = licenseDates(license);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <DetailRow
        label="Installed"
        value={<span style={{ color: TONE_COLOR[d.installedTone] }}>{d.installed}</span>}
      />
      <DetailRow
        label="Expiry Date"
        value={
          <>
            <span style={{ color: TONE_COLOR[d.expiresTone] }}>{d.expires}</span>
            {d.expiresNote && (
              <div style={{ fontSize: '0.75rem', color: TONE_COLOR[d.expiresNoteTone] }}>
                {d.expiresNote}
              </div>
            )}
          </>
        }
      />
    </div>
  );
}

function TrialBadge() {
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
      background: 'var(--accent)', color: '#fff',
      borderRadius: 4, padding: '0.1rem 0.35rem', marginLeft: '0.4rem',
      verticalAlign: 'middle',
    }}>
      TRIAL
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '0.9rem', wordBreak: 'break-word' }}>{value ?? '—'}</div>
    </div>
  );
}

function SearchFilter({
  search, onSearch,
  statusOptions, status, onStatus,
  placeholder = 'Search…',
}: {
  search: string; onSearch: (v: string) => void;
  statusOptions?: string[]; status: string; onStatus: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 220, padding: '0.55rem 0.85rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: '0.9rem' }}
      />
      {statusOptions && statusOptions.length > 0 && (
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          style={{ padding: '0.55rem 0.85rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: '0.9rem' }}
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}

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

// ── NENPOS Clients Tab ──────────────────────────────────────────────────────

function downloadTemplate() {
  const headers = ['Client ID', 'Client Name', 'Start Date', 'Expiry Date', 'License', 'Status', 'Installer', 'Notes', 'Address'];
  const example = ['NPC-ABC123', 'Juan dela Cruz Store', '2023-01-15', '2024-01-15', 'NENPOS-XXXX-XXXX', 'ACTIVE', 'John Doe', 'Annual subscription', 'Brgy. Example, Cebu City'];
  const csv = [headers.join(','), example.map((v) => `"${v}"`).join(',')].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nenpos_clients_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

const TRIAL_DAYS = 30;

/** Shared form state for the secure void / transfer dialogs (password + typed confirmation phrase). */
const EMPTY_SECURE_FORM = { password: '', confirmName: '', reason: '' };

const EMPTY_NENPOS_FORM = {
  clientName: '', license: '', clientId: '', startDate: '', expiryDate: '',
  status: 'ACTIVE', installer: '', address: '', notes: '',
  isTrial: false, installDate: '',
};

/** Groups start collapsed; an active search/filter forces them open so matches stay visible. */
function useExpandedGroups(forceExpanded: boolean) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isExpanded = (key: string) => forceExpanded || expanded.has(key);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  return { isExpanded, toggle };
}

function GroupHeaderRow({ colSpan, title, subtitle, count, computerCount, expanded, onToggle, action }: {
  colSpan: number;
  title: string;
  subtitle?: string;
  count: number;
  /** Computers the business runs, tracked independently of license count. Omit where not applicable. */
  computerCount?: number | null;
  expanded: boolean;
  onToggle: () => void;
  action?: ReactNode;
}) {
  return (
    <tr style={{ background: 'var(--bg)' }}>
      <td colSpan={colSpan}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', fontWeight: 700, color: 'var(--accent)' }}
          >
            <span style={{ display: 'inline-block', width: '1.1rem' }}>{expanded ? '▾' : '▸'}</span>
            {title}
            {subtitle && (
              <span style={{ marginLeft: '0.5rem', fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>{subtitle}</span>
            )}
            <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              {count} license{count !== 1 ? 's' : ''}
            </span>
            {computerCount != null && (
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                · {computerCount} computer{computerCount !== 1 ? 's' : ''}
              </span>
            )}
          </button>
          {action}
        </div>
      </td>
    </tr>
  );
}

function NenposClientsTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{ imported: number } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [viewRecord, setViewRecord] = useState<NenposClient | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState(EMPTY_NENPOS_FORM);
  const [addError, setAddError] = useState('');
  const [nameFocused, setNameFocused] = useState(false);

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
    enabled: showAddForm,
  });

  const installersQuery = useQuery({
    queryKey: ['users', 'INSTALLER'],
    queryFn: async () => (await api.get<AuthenticatedUser[]>('/users', { params: { role: 'INSTALLER' } })).data,
    enabled: showAddForm,
  });

  const formPayload = () => ({
    clientName: addForm.clientName.trim(),
    license: addForm.license.trim() || undefined,
    clientId: addForm.clientId.trim() || undefined,
    startDate: addForm.startDate || undefined,
    expiryDate: addForm.expiryDate || undefined,
    status: addForm.status || undefined,
    installer: addForm.installer.trim() || undefined,
    address: addForm.address.trim() || undefined,
    notes: addForm.notes.trim() || undefined,
    isTrial: addForm.isTrial,
    installDate: addForm.installDate || undefined,
    trialDays: TRIAL_DAYS,
    // Trial expiry is derived server-side from install date + trial days.
    ...(addForm.isTrial ? { expiryDate: undefined } : {}),
  });

  const closeForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setAddForm(EMPTY_NENPOS_FORM);
    setAddError('');
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      (await api.post<NenposClient>('/nenpos-clients', formPayload())).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      closeForm();
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.message ?? 'Could not add the client. Try again.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<NenposClient>(`/nenpos-clients/${id}`, formPayload())).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      closeForm();
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.message ?? 'Could not update the client. Try again.');
    },
  });

  const openEdit = (row: NenposClient) => {
    setEditingId(row.id);
    setAddForm({
      clientName: row.clientName ?? '',
      license: row.license ?? '',
      clientId: row.clientId ?? '',
      startDate: row.startDate ? row.startDate.slice(0, 10) : '',
      expiryDate: row.expiryDate ? row.expiryDate.slice(0, 10) : '',
      status: row.status ?? 'ACTIVE',
      installer: row.installer ?? '',
      address: row.address ?? '',
      notes: row.notes ?? '',
      isTrial: row.isTrial ?? false,
      installDate: row.installDate ? row.installDate.slice(0, 10) : '',
    });
    setAddError('');
    setShowAddForm(true);
  };

  const submitForm = () => {
    if (editingId) updateMutation.mutate(editingId);
    else createMutation.mutate();
  };
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const listQuery = useQuery({
    queryKey: ['nenpos-clients'],
    queryFn: async () => (await api.get<NenposClient[]>('/nenpos-clients')).data,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await api.post<{ imported: number }>('/nenpos-clients/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      setUploadResult(data);
      setUploadError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: any) => {
      setUploadError(err?.response?.data?.message ?? 'Upload failed. Check the file format and try again.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const allRecords = listQuery.data ?? [];

  const statusOptions = [...new Set(allRecords.map((r) => r.status).filter(Boolean) as string[])].sort();

  const filtered = allRecords.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [r.clientId, r.clientName, r.license, r.installer, r.address, r.notes]
      .some((v) => v?.toLowerCase().includes(q));
    const matchStatus = !statusFilter || r.status?.toUpperCase() === statusFilter.toUpperCase();
    return matchSearch && matchStatus;
  });

  const groupedRecords = filtered.reduce<Array<{ key: string; clientName: string; clientId: string; rows: NenposClient[] }>>((groups, row) => {
    const key = row.clientName.trim().toLowerCase();
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.rows.push(row);
      if (!existing.clientId && row.clientId) existing.clientId = row.clientId;
    } else {
      groups.push({ key, clientName: row.clientName, clientId: row.clientId ?? '', rows: [row] });
    }
    return groups;
  }, []);

  const { paginated, page, pageSize, totalPages, total, start, changePage, changePageSize, reset } = usePagination(groupedRecords);
  const { isExpanded, toggle } = useExpandedGroups(!!search || !!statusFilter);

  useEffect(() => {
    reset();
  }, [search, statusFilter]);

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => { setEditingId(null); setAddForm(EMPTY_NENPOS_FORM); setAddError(''); setShowAddForm(true); }}>
          + Add Client
        </button>
        <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
          ↓ Download Template
        </button>
        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.6rem 1.25rem', borderRadius: 8, border: '1px solid transparent',
            background: 'var(--accent)', color: 'var(--accent-contrast)',
            fontWeight: 600, fontSize: '0.9rem',
            cursor: uploadMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: uploadMutation.isPending ? 0.7 : 1,
          }}
        >
          {uploadMutation.isPending ? 'Uploading…' : '↑ Upload Excel / CSV'}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadResult(null);
              setUploadError('');
              uploadMutation.mutate(file);
            }}
            disabled={uploadMutation.isPending}
          />
        </label>
      </div>

      {uploadResult && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(22,163,74,0.1)', border: '1px solid var(--success)', borderRadius: 8, color: 'var(--success)', marginBottom: '1rem', fontWeight: 600 }}>
          ✓ Successfully imported {uploadResult.imported} record{uploadResult.imported !== 1 ? 's' : ''}.
        </div>
      )}
      {uploadError && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(220,38,38,0.08)', border: '1px solid var(--danger)', borderRadius: 8, color: 'var(--danger)', marginBottom: '1rem' }}>
          {uploadError}
        </div>
      )}

      {/* Search + filter */}
      {allRecords.length > 0 && (
        <SearchFilter
          search={search} onSearch={setSearch}
          statusOptions={statusOptions} status={statusFilter} onStatus={setStatusFilter}
          placeholder="Search by name, client ID, license, installer, address…"
        />
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ padding: '1.75rem' }}>
            {listQuery.isLoading && <p style={{ margin: 0 }}>Loading records…</p>}
            {listQuery.isError && <p className="error-text" style={{ margin: 0 }}>Failed to load records.</p>}
            {!listQuery.isLoading && allRecords.length === 0 && (
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                No NENPOS client records yet. Download the template, fill it in, and upload your Excel file.
              </p>
            )}
            {allRecords.length > 0 && (
              <>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Showing {filtered.length} of {allRecords.length} record{allRecords.length !== 1 ? 's' : ''}
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Client ID</th>
                      <th>Status</th>
                      <th>License</th>
                      <th>Start Date</th>
                      <th>Expiry Date</th>
                      <th>Installer</th>
                      <th>Address</th>
                      <th>Notes</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No records match your search.</td></tr>
                    ) : (
                      paginated.flatMap((group) => [
                        <GroupHeaderRow
                          key={`group-${group.key}`}
                          colSpan={9}
                          title={group.clientName}
                          subtitle={group.clientId || undefined}
                          count={group.rows.length}
                          expanded={isExpanded(group.key)}
                          onToggle={() => toggle(group.key)}
                          action={(
                            <button type="button" className="btn btn-secondary"
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              onClick={() => {
                                setEditingId(null);
                                setAddForm({ ...EMPTY_NENPOS_FORM, clientName: group.clientName, clientId: group.clientId });
                                setAddError('');
                                setShowAddForm(true);
                              }}>
                              + Add license
                            </button>
                          )}
                        />,
                        ...(isExpanded(group.key) ? group.rows.map((row) => (
                        <tr key={row.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingLeft: '1.6rem' }}>{row.clientId || '—'}</td>
                          <td>
                            <span className={`badge badge-${(row.status ?? 'active').toLowerCase()}`}>
                              {row.status ?? '—'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.license ?? '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.isTrial ? (row.installDate ?? row.startDate) : row.startDate)}</td>
                          <td style={{ whiteSpace: 'nowrap', ...(row.expiryDate && new Date(row.expiryDate).getTime() < Date.now() ? { color: 'var(--danger)', fontWeight: 600 } : {}) }}>
                            {fmtDate(row.expiryDate)}
                            {row.expiryDate && new Date(row.expiryDate).getTime() < Date.now() && (
                              <span style={{ display: 'block', fontSize: '0.75rem' }}>Expired</span>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{row.installer ?? '—'}</td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.address ?? ''}>
                            {row.address ?? '—'}
                          </td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={row.notes ?? ''}>
                            {row.notes ?? '—'}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <RowActionsMenu
                              actions={[
                                { label: 'Edit', onClick: () => openEdit(row) },
                                { label: 'View', onClick: () => setViewRecord(row) },
                              ]}
                            />
                          </td>
                        </tr>
                        )) : []),
                      ])
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
        {allRecords.length > 0 && (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            <Pagination
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              total={total}
              start={start}
              onPage={changePage}
              onPageSize={changePageSize}
            />
          </div>
        )}
      </div>

      {/* Add / edit client dialog */}
      <Dialog isOpen={showAddForm} onClose={closeForm} title={editingId ? 'Edit NENPOS Client' : 'Add NENPOS Client'} maxWidth={560}>
        <form onSubmit={(e) => { e.preventDefault(); submitForm(); }}>
          <div className="field">
            <label htmlFor="np-name">Client name *</label>
            <div style={{ position: 'relative' }}>
              <input id="np-name" type="text" required value={addForm.clientName}
                autoComplete="off"
                placeholder="Type to search the client directory…"
                onChange={(e) => setAddForm({ ...addForm, clientName: e.target.value, clientId: '' })}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setTimeout(() => setNameFocused(false), 150)}
              />
              {nameFocused && addForm.clientName.trim() && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 240, overflowY: 'auto',
                }}>
                  {(() => {
                    const q = addForm.clientName.trim().toLowerCase();
                    const matches = (clientsQuery.data ?? [])
                      .filter((c) => `${c.businessName} ${c.clientCode}`.toLowerCase().includes(q))
                      .slice(0, 8);
                    if (matches.length === 0) {
                      return (
                        <div style={{ padding: '0.7rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                          No matching client in the directory — a new NENPOS record will use this name.
                        </div>
                      );
                    }
                    return matches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setAddForm((f) => ({
                            ...f,
                            clientName: c.businessName,
                            clientId: c.clientCode,
                            address: f.address || c.address || '',
                          }));
                          setNameFocused(false);
                        }}
                        style={{
                          display: 'block', width: '100%', padding: '0.6rem 0.85rem', border: 0,
                          borderBottom: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem',
                        }}
                      >
                        {c.businessName} <span style={{ color: 'var(--text-muted)' }}>({c.clientCode})</span>
                        {c.address && (
                          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{c.address}</span>
                        )}
                      </button>
                    ));
                  })()}
                </div>
              )}
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Type to auto-search the client directory — clicking a match fills the name, ID, and address.
            </p>
          </div>
          <div className="field">
            <label htmlFor="np-license">License</label>
            <input id="np-license" type="text" value={addForm.license} placeholder="License key"
              style={{ fontFamily: 'monospace' }}
              onChange={(e) => setAddForm({ ...addForm, license: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="np-clientId">Client ID</label>
              <input id="np-clientId" type="text" value={addForm.clientId} placeholder="Auto-generated if blank"
                onChange={(e) => setAddForm({ ...addForm, clientId: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="np-status">Status</label>
              <select id="np-status" value={addForm.status}
                onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>License type</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button"
                className={`btn ${!addForm.isTrial ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setAddForm({ ...addForm, isTrial: false })}
              >
                Full
              </button>
              <button type="button"
                className={`btn ${addForm.isTrial ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setAddForm({ ...addForm, isTrial: true })}
              >
                Trial
              </button>
            </div>
          </div>
          {addForm.isTrial ? (
            <div className="field">
              <label htmlFor="np-install-date">Install date</label>
              <input id="np-install-date" type="date" value={addForm.installDate}
                onChange={(e) => setAddForm({ ...addForm, installDate: e.target.value })} />
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Expiry is automatically {TRIAL_DAYS} days after the install date
                {addForm.installDate && (() => {
                  const d = new Date(`${addForm.installDate}T00:00:00`);
                  if (isNaN(d.getTime())) return null;
                  d.setDate(d.getDate() + TRIAL_DAYS);
                  return <> — ends <strong>{d.toLocaleDateString()}</strong></>;
                })()}.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="np-start">Start date</label>
                <input id="np-start" type="date" value={addForm.startDate}
                  onChange={(e) => setAddForm({ ...addForm, startDate: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="np-expiry">Expiry date</label>
                <input id="np-expiry" type="date" value={addForm.expiryDate}
                  onChange={(e) => setAddForm({ ...addForm, expiryDate: e.target.value })} />
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="np-installer">Installer</label>
            <select id="np-installer" value={addForm.installer}
              onChange={(e) => setAddForm({ ...addForm, installer: e.target.value })}>
              <option value="">Select an installer…</option>
              {(installersQuery.data ?? []).map((u) => (
                <option key={u.id} value={u.fullName}>{u.fullName}</option>
              ))}
              {addForm.installer && !(installersQuery.data ?? []).some((u) => u.fullName === addForm.installer) && (
                <option value={addForm.installer}>{addForm.installer} (from record)</option>
                )}
            </select>
          </div>
          <div className="field">
            <label htmlFor="np-address">Address</label>
            <input id="np-address" type="text" value={addForm.address}
              onChange={(e) => setAddForm({ ...addForm, address: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="np-notes">Notes</label>
            <textarea id="np-notes" rows={2} value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
          </div>
          {addError && <p className="error-text">{addError}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ flex: 1 }}>
              {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Save client'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      </Dialog>

      {/* View details dialog */}
      <Dialog isOpen={!!viewRecord} onClose={() => setViewRecord(null)} title="Client Details" maxWidth={560}>
        {viewRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <DetailRow label="Client ID" value={<span style={{ fontFamily: 'monospace' }}>{viewRecord.clientId || '—'}</span>} />
              <DetailRow label="Status" value={
                <span className={`badge badge-${(viewRecord.status ?? 'active').toLowerCase()}`}>{viewRecord.status ?? '—'}</span>
              } />
            </div>
            <DetailRow label="Client Name" value={<strong>{viewRecord.clientName}</strong>} />
            <DetailRow label="License" value={<span style={{ fontFamily: 'monospace' }}>{viewRecord.license ?? '—'}</span>} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <DetailRow label={viewRecord.isTrial ? 'Install Date' : 'Start Date'} value={fmtDate(viewRecord.isTrial ? (viewRecord.installDate ?? viewRecord.startDate) : viewRecord.startDate)} />
              <DetailRow label="Expiry Date" value={
                <span style={{
                  ...(viewRecord.expiryDate && new Date(viewRecord.expiryDate).getTime() < Date.now()
                    ? { color: 'var(--danger)', fontWeight: 600 }
                    : {}),
                }}>
                  {fmtDate(viewRecord.expiryDate)}
                  {viewRecord.expiryDate && new Date(viewRecord.expiryDate).getTime() < Date.now() && ' — Expired'}
                  {viewRecord.isTrial && (
                    <span style={{ display: 'block', fontSize: '0.75rem', color: viewRecord.expiryDate && new Date(viewRecord.expiryDate).getTime() < Date.now() ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 400 }}>
                      {viewRecord.trialDays ?? 30}-day trial{viewRecord.installDate ? ` from install ${fmtDate(viewRecord.installDate)}` : ' (install date not set)'}
                    </span>
                  )}
                </span>
              } />
            </div>
            <DetailRow label="Installer" value={viewRecord.installer ?? '—'} />
            <DetailRow label="Address" value={viewRecord.address ?? '—'} />
            <DetailRow label="Notes" value={
              viewRecord.notes
                ? <span style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{viewRecord.notes}</span>
                : '—'
            } />
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Uploaded {fmtDate(viewRecord.uploadedAt)}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function LicensesPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isDeveloper = user?.role === 'DEVELOPER';
  const isAdminRole = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_STAFF';

  const [activeTab, setActiveTab] = useState<'licenses' | 'nenpos'>('licenses');
  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [isTrial, setIsTrial] = useState(false);
  const [trialExpiresAt, setTrialExpiresAt] = useState(defaultTrialDate());
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState(EMPTY_FINGERPRINT_FORM);
  const [viewLicense, setViewLicense] = useState<License | null>(null);
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [editForm, setEditForm] = useState({ licenseKey: '', clientId: '', productId: '', isTrial: false, expirationDate: defaultTrialDate(), notes: '' });
  const [editError, setEditError] = useState('');
  const [licSearch, setLicSearch] = useState('');
  const [licStatus, setLicStatus] = useState('');
  const [showVoided, setShowVoided] = useState(false); // must be declared before licensesQuery (TDZ)
  const { isExpanded, toggle: toggleClient } = useExpandedGroups(!!licSearch || !!licStatus);

  const licensesQuery = useQuery({
    queryKey: ['licenses', { includeVoided: showVoided }],
    queryFn: async () => (await api.get<License[]>('/licenses', { params: showVoided ? { includeVoided: true } : undefined })).data,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
    enabled: showForm || !!editingLicense,
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<SoftwareProduct[]>('/software-products')).data,
    enabled: showForm || !!editingLicense,
  });

  const [generateError, setGenerateError] = useState('');
  const [transferringLicense, setTransferringLicense] = useState<License | null>(null);
  const [transferForm, setTransferForm] = useState(EMPTY_SECURE_FORM);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState<{ clientName: string } | null>(null);

  const generateLicense = useMutation({
    mutationFn: async () => {
      const payload = isTrial
        ? { clientId, productId, isTrial: true, expirationDate: new Date(`${trialExpiresAt}T23:59:59`).toISOString(), notes: notes.trim() || undefined }
        : { clientId, productId, licenseKey: licenseKey.trim(), notes: notes.trim() || undefined };
      return (await api.post<License>('/licenses', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setClientId(''); setProductId(''); setLicenseKey('');
      setIsTrial(false); setTrialExpiresAt(defaultTrialDate()); setNotes('');
      setGenerateError(''); setShowForm(false);
    },
    onError: (err: any) => {
      setGenerateError(err?.response?.data?.message ?? 'Could not save the license. Try again.');
    },
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      const license = transferringLicense!;
      return (await api.post<{ licenseId: string; nenposClient: NenposClient }>(
        `/licenses/${license.id}/transfer-to-nenpos`,
        {
          password: transferForm.password,
          confirmName: transferForm.confirmName.trim(),
          reason: transferForm.reason.trim() || undefined,
        },
      )).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      setTransferSuccess({ clientName: data.nenposClient.clientName });
      setTransferringLicense(null);
      setTransferForm(EMPTY_SECURE_FORM);
      setTransferError('');
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      setTransferError(Array.isArray(message) ? message[0] : message ?? 'Transfer failed — nothing was changed.');
    },
  });

  const openEdit = (license: License) => {
    setEditingLicense(license);
    setEditForm({
      licenseKey: license.licenseKey,
      clientId: license.clientId,
      productId: license.productId,
      isTrial: license.isTrial,
      expirationDate: license.expirationDate ? toIsoDateLocal(new Date(license.expirationDate)) : defaultTrialDate(),
      notes: license.notes ?? '',
    });
    setEditError('');
  };

  const updateLicense = useMutation({
    mutationFn: async () => {
      const payload = {
        clientId: editForm.clientId,
        productId: editForm.productId,
        isTrial: editForm.isTrial,
        notes: editForm.notes.trim(),
        ...(editForm.isTrial ? { expirationDate: new Date(`${editForm.expirationDate}T23:59:59`).toISOString() } : { licenseKey: editForm.licenseKey.trim() }),
      };
      return (await api.patch<License>(`/licenses/${editingLicense!.id}`, payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setEditingLicense(null);
      setEditError('');
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.message ?? 'Could not update the license. Try again.');
    },
  });

  const activateLicense = useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      (await api.patch<License>(`/licenses/${id}/activate`, { fingerprint })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setActivatingId(null);
      setFingerprint(EMPTY_FINGERPRINT_FORM);
    },
  });

  const suspendLicense = useMutation({
    mutationFn: async (id: string) => (await api.patch<License>(`/licenses/${id}/suspend`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['licenses'] }),
  });

  const activeLicense = licensesQuery.data?.find((l) => l.id === activatingId);
  const allLicenses = licensesQuery.data ?? [];

  const filteredLicenses = allLicenses.filter((l) => {
    const q = licSearch.toLowerCase();
    const matchSearch = !q || [l.licenseKey, l.client?.businessName, l.product?.productName, l.notes]
      .some((v) => v?.toLowerCase().includes(q));
    const matchStatus = !licStatus || l.status === licStatus;
    return matchSearch && matchStatus;
  });

  const groupedLicenses = filteredLicenses.reduce<Array<{ clientId: string; clientName: string; computerCount: number | null; licenses: License[] }>>((groups, license) => {
    const existing = groups.find((group) => group.clientId === license.clientId);
    if (existing) {
      existing.licenses.push(license);
    } else {
      groups.push({
        clientId: license.clientId,
        clientName: license.client?.businessName ?? 'Unknown client',
        computerCount: license.client?.computerCount ?? null,
        licenses: [license],
      });
    }
    return groups;
  }, []);

  const {
    paginated: paginatedClientGroups,
    page: licPage,
    pageSize: licPageSize,
    totalPages: licTotalPages,
    total: licTotal,
    start: licStart,
    changePage: changeLicPage,
    changePageSize: changeLicPageSize,
    reset: resetLicPagination
  } = usePagination(groupedLicenses);

  useEffect(() => {
    resetLicPagination();
  }, [licSearch, licStatus]);

  const nenposQuery = useQuery({
    queryKey: ['nenpos-clients'],
    queryFn: async () => (await api.get<NenposClient[]>('/nenpos-clients')).data,
    enabled: isAdminRole,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Licenses</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            {isDeveloper
              ? "Activate pending licenses on-site by binding them to the device's hardware fingerprint via an RSA-4096-signed JWT token."
              : "Record license keys issued by the 3rd-party provider for clients. Developers activate them on-site, binding each license to the device's hardware fingerprint via an RSA-4096-signed JWT token."}
          </p>
        </div>
      </div>

      {/* Tabs */}
      {isAdminRole && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.75rem' }}>
          <TabButton label="Bhagoh Licenses" active={activeTab === 'licenses'} count={allLicenses.length} onClick={() => setActiveTab('licenses')} />
          <TabButton label="NENPOS Licenses" active={activeTab === 'nenpos'} count={nenposQuery.data?.length} onClick={() => setActiveTab('nenpos')} />
        </div>
      )}

      {/* ── Licenses Tab ── */}
      {activeTab === 'licenses' && (
        <>
          {/* Add license dialog */}
          <Dialog isOpen={showForm && !isDeveloper} onClose={() => { setShowForm(false); setGenerateError(''); setIsTrial(false); setTrialExpiresAt(defaultTrialDate()); setNotes(''); }} title="Add License" maxWidth={480}>
            <form onSubmit={(e) => { e.preventDefault(); generateLicense.mutate(); }}>
              <div className="field">
                <label>License type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={`btn ${!isTrial ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setIsTrial(false)}
                  >
                    Full
                  </button>
                  <button
                    type="button"
                    className={`btn ${isTrial ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setIsTrial(true)}
                  >
                    Trial
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="clientId">Client</label>
                <SearchableClientSelect id="clientId" clients={clientsQuery.data ?? []} value={clientId} onChange={setClientId} />
              </div>
              <div className="field">
                <label htmlFor="productId">Software product</label>
                <select id="productId" required value={productId} onChange={(e) => setProductId(e.target.value)}>
                  <option value="">Select a product…</option>
                  {productsQuery.data?.map((p) => (
                    <option key={p.id} value={p.id}>{p.productName} v{p.version}</option>
                  ))}
                </select>
              </div>
              {isTrial ? (
                <div className="field">
                  <label htmlFor="trialExpiresAt">Trial expires on</label>
                  <input
                    id="trialExpiresAt"
                    type="date"
                    required
                    min={tomorrowIsoDate()}
                    value={trialExpiresAt}
                    onChange={(e) => setTrialExpiresAt(e.target.value)}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    A unique trial key is generated automatically. The trial expires on this exact
                    date, whether or not the developer has activated it yet.
                  </p>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="licenseKey">License key</label>
                  <input
                    id="licenseKey"
                    type="text"
                    required
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    placeholder="Enter the key issued by the provider"
                    style={{ fontFamily: 'monospace' }}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Enter the license key issued by the 3rd-party provider.
                  </p>
                </div>
              )}
              <div className="field">
                <label htmlFor="license-notes">Notes (optional)</label>
                <textarea id="license-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {generateError && <p className="error-text">{generateError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={generateLicense.isPending} style={{ flex: 1 }}>
                  {generateLicense.isPending ? 'Saving…' : 'Save license'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setGenerateError(''); setIsTrial(false); setTrialExpiresAt(defaultTrialDate()); setNotes(''); }}>Cancel</button>
              </div>
            </form>
          </Dialog>

          {/* Activate dialog */}
          <Dialog isOpen={!!activatingId} onClose={() => setActivatingId(null)} title="Activate License" maxWidth={480}>
            {activeLicense && (
              <form onSubmit={(e) => { e.preventDefault(); activateLicense.mutate({ id: activeLicense.id }); }}>
                <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Binding for:</div>
                  <div style={{ fontWeight: 600 }}>{activeLicense.client?.businessName} — {activeLicense.product?.productName}</div>
                  <div style={{ fontFamily: 'monospace', marginTop: '0.4rem', color: 'var(--accent)' }}>{activeLicense.licenseKey}</div>
                </div>
                <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Enter the installed device's hardware fingerprint. This binds the license to this machine and signs an activation token.
                </p>
                <div className="field">
                  <label>CPU identifier</label>
                  <input type="text" required value={fingerprint.cpu} onChange={(e) => setFingerprint({ ...fingerprint, cpu: e.target.value })} />
                </div>
                <div className="field">
                  <label>Disk serial</label>
                  <input type="text" required value={fingerprint.disk} onChange={(e) => setFingerprint({ ...fingerprint, disk: e.target.value })} />
                </div>
                <div className="field">
                  <label>MAC address</label>
                  <input type="text" required value={fingerprint.mac} onChange={(e) => setFingerprint({ ...fingerprint, mac: e.target.value })} />
                </div>
                {activateLicense.isError && <p className="error-text">Could not activate the license. Check the details and try again.</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={activateLicense.isPending} style={{ flex: 1 }}>
                    {activateLicense.isPending ? 'Activating…' : 'Activate license'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setActivatingId(null)}>Cancel</button>
                </div>
              </form>
            )}
          </Dialog>

          {/* View license dialog */}
          <Dialog isOpen={!!viewLicense} onClose={() => setViewLicense(null)} title="License Details" maxWidth={520}>
            {viewLicense && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <DetailRow label="Status" value={<><StatusBadge status={viewLicense.status} />{viewLicense.isTrial && <TrialBadge />}</>} />
                  <DetailRow label="Client" value={<strong>{viewLicense.client?.businessName ?? '—'}</strong>} />
                </div>
                <DetailRow label="License Key" value={
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', background: 'var(--bg)', padding: '0.35rem 0.6rem', borderRadius: 6, display: 'inline-block', wordBreak: 'break-all' }}>
                    {viewLicense.licenseKey}
                  </span>
                } />
                <DetailRow label="Software Product" value={viewLicense.product?.productName ?? '—'} />
                {viewLicense.isTrial && !viewLicense.expirationDate && (
                  <DetailRow label="Trial Period" value={`${viewLicense.trialDays ?? 30} days from install`} />
                )}
                <LicenseDateDetails license={viewLicense} />
                {viewLicense.activatedById && (
                  <DetailRow label="Activated By (ID)" value={<span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{viewLicense.activatedById}</span>} />
                )}
                {viewLicense.notes && (
                  <DetailRow label="Notes" value={<span style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{viewLicense.notes}</span>} />
                )}
              </div>
            )}
          </Dialog>

          {/* Edit license dialog */}
          <Dialog isOpen={!!editingLicense} onClose={() => setEditingLicense(null)} title="Edit License" maxWidth={480}>
            {editingLicense && (
              <form onSubmit={(e) => { e.preventDefault(); updateLicense.mutate(); }}>
                <div className="field">
                  <label>License type</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn ${!editForm.isTrial ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => setEditForm({ ...editForm, isTrial: false })}
                    >
                      Full
                    </button>
                    <button
                      type="button"
                      className={`btn ${editForm.isTrial ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      disabled={editingLicense.status !== 'PENDING'}
                      onClick={() => setEditForm({ ...editForm, isTrial: true })}
                    >
                      Trial
                    </button>
                  </div>
                  {editingLicense.status !== 'PENDING' && (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Activated licenses can't be changed back to trial.
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="edit-clientId">Client</label>
                  <SearchableClientSelect id="edit-clientId" clients={clientsQuery.data ?? []} value={editForm.clientId} onChange={(clientId) => setEditForm({ ...editForm, clientId })} />
                </div>
                <div className="field">
                  <label htmlFor="edit-productId">Software product</label>
                  <select id="edit-productId" required value={editForm.productId} onChange={(e) => setEditForm({ ...editForm, productId: e.target.value })}>
                    <option value="">Select a product…</option>
                    {productsQuery.data?.map((p) => (
                      <option key={p.id} value={p.id}>{p.productName} v{p.version}</option>
                    ))}
                  </select>
                </div>
                {editForm.isTrial ? (
                  <div className="field">
                    <label htmlFor="edit-trialExpiresAt">Trial expires on</label>
                    <input
                      id="edit-trialExpiresAt"
                      type="date"
                      required
                      value={editForm.expirationDate}
                      onChange={(e) => setEditForm({ ...editForm, expirationDate: e.target.value })}
                    />
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Any date is allowed here, including today or earlier, so you can match a real on-site install.
                    </p>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="edit-licenseKey">License key</label>
                    <input
                      id="edit-licenseKey"
                      type="text"
                      required
                      value={editForm.licenseKey}
                      onChange={(e) => setEditForm({ ...editForm, licenseKey: e.target.value })}
                      placeholder="Enter the key issued by the provider"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="edit-notes">Notes (optional)</label>
                  <textarea id="edit-notes" rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
                {editError && <p className="error-text">{editError}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={updateLicense.isPending} style={{ flex: 1 }}>
                    {updateLicense.isPending ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingLicense(null)}>Cancel</button>
                </div>
              </form>
            )}
          </Dialog>

          {/* Transfer to NENPOS dialog — SUPER_ADMIN secure action */}
          <Dialog
            isOpen={!!transferringLicense}
            onClose={() => { setTransferringLicense(null); setTransferError(''); }}
            title="Transfer to NENPOS"
            maxWidth={520}
          >
            {transferringLicense && (
              <form onSubmit={(e) => { e.preventDefault(); transferMutation.mutate(); }}>
                <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Transferring license for:</div>
                  <div style={{ fontWeight: 600 }}>{transferringLicense.client?.businessName} — {transferringLicense.product?.productName}</div>
                  <div style={{ fontFamily: 'monospace', marginTop: '0.3rem', color: 'var(--accent)', fontSize: '0.8rem' }}>{transferringLicense.licenseKey}</div>
                </div>
                <p style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  This copies the client, license key, and dates into a new row in the <strong>NENPOS Licenses</strong> tab,
                  then voids this license so everything for this client lives in one place. The NENPOS-only fields
                  (installer, notes) can be edited there afterward.
                </p>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
                  padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, marginBottom: '1rem',
                }}>
                  <div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client ID</div>{transferringLicense.client?.clientCode}</div>
                  <div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>{transferringLicense.status}</div>
                  <div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Installed</div>{transferringLicense.activationDate ? new Date(transferringLicense.activationDate).toLocaleDateString() : '—'}</div>
                  <div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expires</div>{transferringLicense.expirationDate ? new Date(transferringLicense.expirationDate).toLocaleDateString() : '—'}</div>
                </div>
                <div className="field">
                  <label htmlFor="transfer-reason">Notes for the NENPOS record (optional)</label>
                  <textarea
                    id="transfer-reason"
                    rows={2}
                    value={transferForm.reason}
                    onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="transfer-password">Your password *</label>
                  <input
                    id="transfer-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={transferForm.password}
                    onChange={(e) => setTransferForm({ ...transferForm, password: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="transfer-confirm">Type <strong>{transferringLicense.client?.businessName}</strong> to authorize *</label>
                  <input
                    id="transfer-confirm"
                    type="text"
                    required
                    autoComplete="off"
                    value={transferForm.confirmName}
                    onChange={(e) => setTransferForm({ ...transferForm, confirmName: e.target.value })}
                    placeholder={transferringLicense.client?.businessName}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    This action cannot be undone from the app — the license stays voided and the data lives in NENPOS.
                  </p>
                </div>
                {transferError && <p className="error-text">{transferError}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={transferMutation.isPending || !transferForm.password || transferForm.confirmName.trim().toLowerCase() !== (transferringLicense.client?.businessName ?? '').trim().toLowerCase()}
                    style={{ flex: 1 }}
                  >
                    {transferMutation.isPending ? 'Transferring…' : 'Authorize transfer'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => { setTransferringLicense(null); setTransferError(''); }}>Cancel</button>
                </div>
              </form>
            )}
          </Dialog>

          {/* Action bar */}
          {!isDeveloper && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => { setClientId(''); setShowForm(true); }}>
                + Add License
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showVoided}
                  onChange={(e) => setShowVoided(e.target.checked)}
                  style={{ width: 'auto', margin: 0, padding: 0 }}
                />
                Show voided/transferred
              </label>
            </div>
          )}

          {transferSuccess && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
              padding: '0.75rem 1rem', background: 'rgba(22,163,74,0.1)', border: '1px solid var(--success)',
              borderRadius: 8, color: 'var(--success)', marginBottom: '1rem', fontWeight: 600,
            }}>
              <span>✓ Transferred <strong>{transferSuccess.clientName}</strong> to the NENPOS Licenses tab. The license row is now voided.</span>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => setTransferSuccess(null)}>
                Dismiss
              </button>
            </div>
          )}

          {/* Search */}
          {allLicenses.length > 0 && (
            <SearchFilter
              search={licSearch} onSearch={setLicSearch}
              statusOptions={['PENDING', 'ACTIVATED', 'EXPIRED', 'SUSPENDED']}
              status={licStatus} onStatus={setLicStatus}
              placeholder="Search by client, license key, product, or notes…"
            />
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ padding: '1.75rem' }}>
                {licensesQuery.isLoading && <p>Loading licenses…</p>}
                {licensesQuery.isError && <p className="error-text">Failed to load licenses.</p>}
                {!licensesQuery.isLoading && allLicenses.length === 0 && <p>No licenses yet — add the first one above.</p>}
                {allLicenses.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      Showing {filteredLicenses.length} of {allLicenses.length} license{allLicenses.length !== 1 ? 's' : ''}
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Computer</th>
                          <th>Product</th>
                          <th>License Key</th>
                          <th>Status</th>
                          <th>Installed</th>
                          <th>Expires</th>
                          <th>Notes</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedClientGroups.length === 0 ? (
                          <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No licenses match your search.</td></tr>
                        ) : (
                          paginatedClientGroups.flatMap((group) => [
                            <GroupHeaderRow
                              key={`client-${group.clientId}`}
                              colSpan={8}
                              title={group.clientName}
                              count={group.licenses.length}
                              computerCount={group.computerCount}
                              expanded={isExpanded(group.clientId)}
                              onToggle={() => toggleClient(group.clientId)}
                              action={!isDeveloper && (
                                <button type="button" className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                  onClick={() => { setClientId(group.clientId); setShowForm(true); }}>
                                  + Add license
                                </button>
                              )}
                            />,
                            ...(!isExpanded(group.clientId) ? [] : group.licenses.map((license) => (
                            <tr key={license.id} style={{ opacity: license.voidedAt ? 0.55 : 1 }}>
                              <td style={{ fontWeight: 600, whiteSpace: 'nowrap', paddingLeft: '1.6rem' }}>
                                {license.hardwareFingerprint?.mac ?? (
                                  <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Not activated yet</span>
                                )}
                                {license.voidedAt && (
                                  <span className="badge" style={{
                                    marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.15rem 0.5rem',
                                    background: 'rgba(220,38,38,0.12)', color: 'var(--danger)',
                                    border: '1px solid var(--danger)', borderRadius: 999,
                                  }}>
                                    {license.transferredToNenposClientId ? 'Transferred to NENPOS' : 'Voided'}
                                  </span>
                                )}
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>{license.product?.productName ?? '—'}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {license.licenseKey}
                                {license.isTrial && <TrialBadge />}
                              </td>
                              <td><StatusBadge status={license.status} /></td>
                              <LicenseDateCells license={license} />
                              <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={license.notes ?? ''}>
                                {license.notes ?? '—'}
                              </td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                  {!license.voidedAt && isDeveloper && license.status === 'PENDING' && (
                                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                      onClick={() => setActivatingId(license.id)}>
                                      Activate
                                    </button>
                                  )}
                                  <RowActionsMenu
                                    actions={[
                                      ...(!isDeveloper && !license.voidedAt
                                        ? [{
                                            label: 'Transfer',
                                            onClick: () => {
                                              setTransferSuccess(null);
                                              setTransferForm(EMPTY_SECURE_FORM);
                                              setTransferError('');
                                              setTransferringLicense(license);
                                            },
                                          }]
                                        : []),
                                      ...(!isDeveloper && !license.voidedAt
                                        ? [{ label: 'Edit', onClick: () => openEdit(license) }]
                                        : []),
                                      { label: 'View', onClick: () => setViewLicense(license) },
                                      ...(!isDeveloper && !license.voidedAt && license.status === 'ACTIVATED'
                                        ? [{
                                            label: 'Suspend',
                                            danger: true,
                                            disabled: suspendLicense.isPending,
                                            onClick: () => suspendLicense.mutate(license.id),
                                          }]
                                        : []),
                                    ]}
                                  />
                                </div>
                              </td>
                            </tr>
                            ))),
                          ])
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
            {allLicenses.length > 0 && (
              <div style={{ padding: '0 1.75rem 1.75rem' }}>
                <Pagination
                  page={licPage}
                  pageSize={licPageSize}
                  totalPages={licTotalPages}
                  total={licTotal}
                  start={licStart}
                  onPage={changeLicPage}
                  onPageSize={changeLicPageSize}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── NENPOS Clients Tab ── */}
      {activeTab === 'nenpos' && isAdminRole && <NenposClientsTab />}
    </div>
  );
}

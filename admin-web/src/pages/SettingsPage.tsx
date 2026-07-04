import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BackupFile, CompanyProfile } from '../lib/types';
import { AuditLogsPage } from './AuditLogsPage';
import { KpiSettingsPage } from './KpiSettingsPage';
import { MachineAdminPage } from './MachineAdminPage';
import { UsersPage } from './UsersPage';

type SettingsTab = 'company' | 'users' | 'kpis' | 'machines' | 'backups' | 'audit';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'company', label: 'Company Profile' },
  { id: 'users', label: 'Users & Roles' },
  { id: 'kpis', label: 'KPI Settings' },
  { id: 'machines', label: 'Ink & Machines' },
  { id: 'backups', label: 'Database Backups' },
  { id: 'audit', label: 'Audit Logs' },
];

// ── Company Profile ───────────────────────────────────────────────────────────

type CompanyProfileForm = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tin: string;
  logoUrl: string;
};

function CompanyProfileTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CompanyProfileForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileQuery = useQuery({
    queryKey: ['company-profile'],
    queryFn: async () => (await api.get<CompanyProfile>('/company-profile')).data,
  });

  useEffect(() => {
    if (profileQuery.data && !form) {
      setForm({
        businessName: profileQuery.data.businessName ?? '',
        address: profileQuery.data.address ?? '',
        phone: profileQuery.data.phone ?? '',
        email: profileQuery.data.email ?? '',
        website: profileQuery.data.website ?? '',
        tin: profileQuery.data.tin ?? '',
        logoUrl: profileQuery.data.logoUrl ?? '',
      });
    }
  }, [profileQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (payload: CompanyProfileForm) => api.patch<CompanyProfile>('/company-profile', payload),
    onSuccess: (res) => {
      qc.setQueryData(['company-profile'], res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaved(false);
    saveMutation.mutate(form);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    setUploadError('');
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('files', file);
      const res = await api.post<{ urls: string[] }>('/uploads/images', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm({ ...form, logoUrl: res.data.urls[0] });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (profileQuery.isLoading) return <p>Loading company profile…</p>;
  if (profileQuery.isError) return <p className="error-text">Failed to load company profile.</p>;
  if (!form) return null;

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 560 }}>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        This information appears on printed Job Orders and other official documents.
      </p>

      <div className="field">
        <label htmlFor="cp-name">Business name</label>
        <input id="cp-name" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="cp-address">Address</label>
        <textarea id="cp-address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="cp-phone">Phone</label>
        <input id="cp-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="cp-email">Email</label>
        <input id="cp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="cp-website">Website</label>
        <input id="cp-website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
      </div>

      <div className="field">
        <label htmlFor="cp-tin">TIN / Tax ID</label>
        <input id="cp-tin" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
      </div>

      <div className="field">
        <label>Company Logo</label>
        {form.logoUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }}>
            <img
              src={form.logoUrl}
              alt="Company logo"
              style={{ maxHeight: 56, maxWidth: 160, objectFit: 'contain', borderRadius: 4 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? 'Uploading…' : 'Change logo'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => setForm({ ...form, logoUrl: '' })}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', padding: '1.5rem', border: '2px dashed var(--border)', borderRadius: 8,
              background: 'var(--bg)', cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <span style={{ fontSize: '2rem', lineHeight: 1 }}>🖼️</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
              {isUploading ? 'Uploading…' : 'Click to upload logo'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>JPEG, PNG, WEBP or GIF · max 10 MB</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={handleLogoUpload}
        />
        {uploadError && <p className="error-text" style={{ marginTop: '0.4rem' }}>{uploadError}</p>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending || isUploading}>
          {saveMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>✓ Saved successfully</span>}
        {saveMutation.isError && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Failed to save.</span>}
      </div>
    </form>
  );
}

// ── Database Backups ────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function BackupsTab() {
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const backupsQuery = useQuery({
    queryKey: ['backups'],
    queryFn: async () => (await api.get<BackupFile[]>('/backups')).data,
  });

  const createBackup = useMutation({
    mutationFn: () => api.post<BackupFile>('/backups'),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: () => setError('Failed to create backup. Make sure mysqldump is installed and accessible on the server.'),
  });

  const deleteBackup = useMutation({
    mutationFn: (filename: string) => api.delete(`/backups/${filename}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  });

  const downloadBackup = async (filename: string) => {
    const res = await api.get(`/backups/${encodeURIComponent(filename)}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Create and download full snapshots of the database for safekeeping.
        </p>
        <button type="button" className="btn btn-primary" disabled={createBackup.isPending} onClick={() => createBackup.mutate()}>
          {createBackup.isPending ? 'Creating…' : 'Create backup'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ overflowX: 'auto' }}>
        {backupsQuery.isLoading && <p>Loading backups…</p>}
        {backupsQuery.isError && <p className="error-text">Failed to load backups.</p>}
        {backupsQuery.data?.length === 0 && <p>No backups yet.</p>}
        {backupsQuery.data && backupsQuery.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backupsQuery.data.map((b) => (
                <tr key={b.filename}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{b.filename}</td>
                  <td>{formatSize(b.size)}</td>
                  <td>{new Date(b.createdAt).toLocaleString()}</td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                        onClick={() => downloadBackup(b.filename)}
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        disabled={deleteBackup.isPending}
                        onClick={() => {
                          if (confirm(`Delete backup "${b.filename}"? This cannot be undone.`)) deleteBackup.mutate(b.filename);
                        }}
                      >
                        Delete
                      </button>
                    </span>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('company');

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Settings</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Manage your company profile, team roles &amp; permissions, database backups, and audit logs.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              padding: '0.6rem 0.9rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' && <CompanyProfileTab />}
      {tab === 'users' && <UsersPage />}
      {tab === 'kpis' && <KpiSettingsPage />}
      {tab === 'machines' && <MachineAdminPage />}
      {tab === 'backups' && <BackupsTab />}
      {tab === 'audit' && <AuditLogsPage />}
    </div>
  );
}

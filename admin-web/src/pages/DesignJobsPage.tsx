import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import { StatusBadge } from '../components/StatusBadge';
import { Pagination, usePagination } from '../components/Pagination';
import { useAuthStore } from '../lib/auth-store';
import type { DesignJob, DesignJobStatus } from '../lib/types';

const STATUS_OPTIONS: { value: DesignJobStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'ON_GOING', label: 'On Going' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const EMPTY_CREATE_FORM = { title: '', description: '', clientName: '', operatorId: '', dueDate: '' };
const EMPTY_UPDATE_FORM: { message: string; status: DesignJobStatus | '' } = { message: '', status: '' };

function fieldLabel(text: string) {
  return <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{text}</div>;
}

export function DesignJobsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState(EMPTY_UPDATE_FORM);
  const [reassignTo, setReassignTo] = useState('');

  const canCreate = user?.role === 'DESIGNER' || user?.role === 'SUPER_ADMIN';
  const canSetStatus = user?.role !== 'ADMIN_STAFF';

  const jobsQuery = useQuery({
    queryKey: ['design-jobs'],
    queryFn: async () => (await api.get<DesignJob[]>('/design-jobs')).data,
  });

  const operatorsQuery = useQuery({
    queryKey: ['design-jobs', 'operators'],
    queryFn: async () => (await api.get<{ id: string; fullName: string }[]>('/design-jobs/operators')).data,
    enabled: canCreate,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['design-jobs'] });

  const createJob = useMutation({
    mutationFn: () =>
      api.post('/design-jobs', {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        clientName: createForm.clientName.trim() || undefined,
        operatorId: createForm.operatorId || undefined,
        dueDate: createForm.dueDate || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setCreateForm(EMPTY_CREATE_FORM);
      setShowCreate(false);
    },
  });

  const reassign = useMutation({
    mutationFn: () => api.patch(`/design-jobs/${selectedId}/assign`, { operatorId: reassignTo }),
    onSuccess: () => {
      invalidate();
      setReassignTo('');
    },
  });

  const postUpdate = useMutation({
    mutationFn: () =>
      api.post(`/design-jobs/${selectedId}/updates`, {
        message: updateForm.message.trim() || undefined,
        status: updateForm.status || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setUpdateForm(EMPTY_UPDATE_FORM);
    },
  });

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    createJob.mutate();
  };

  const handleReassignSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (reassignTo) reassign.mutate();
  };

  const handleUpdateSubmit = (e: FormEvent) => {
    e.preventDefault();
    postUpdate.mutate();
  };

  const selectedJob = jobsQuery.data?.find((j) => j.id === selectedId) ?? null;
  const canReassign =
    !!selectedJob &&
    (user?.role === 'SUPER_ADMIN' || (user?.role === 'DESIGNER' && selectedJob.designerId === user.id));

  const closeDetail = () => {
    setSelectedId(null);
    setUpdateForm(EMPTY_UPDATE_FORM);
    setReassignTo('');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: 560 }}>
          {user?.role === 'MACHINE_OPERATOR'
            ? 'Advertising job orders assigned to you by the design team. Update the status and add notes as you work.'
            : user?.role === 'ADMIN_STAFF'
              ? 'Monitor advertising job orders created by the design team and their current status.'
              : 'Create advertising job orders and assign them to a machine operator. Track progress and communicate here.'}
        </p>
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            New job order
          </button>
        )}
      </div>

      {jobsQuery.isLoading && <p>Loading job orders…</p>}
      {jobsQuery.isError && <p className="error-text">Failed to load job orders.</p>}
      {jobsQuery.data?.length === 0 && <p>No advertising job orders yet.</p>}

      {jobsQuery.data && jobsQuery.data.length > 0 && (
        <DesignJobsTable data={jobsQuery.data} onOpen={setSelectedId} />
      )}

      <Dialog isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Advertising Job Order" maxWidth={480}>
        <form onSubmit={handleCreateSubmit}>
          <div className="field">
            <label htmlFor="dj-title">Title</label>
            <input
              id="dj-title"
              required
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder="e.g., Tarpaulin for ABC Store opening"
            />
          </div>
          <div className="field">
            <label htmlFor="dj-description">Description (optional)</label>
            <textarea
              id="dj-description"
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Design specs, sizes, colors, etc."
            />
          </div>
          <div className="field">
            <label htmlFor="dj-client">Client name (optional)</label>
            <input
              id="dj-client"
              value={createForm.clientName}
              onChange={(e) => setCreateForm({ ...createForm, clientName: e.target.value })}
              placeholder="e.g., ABC Store"
            />
          </div>
          <div className="field">
            <label htmlFor="dj-operator">Assign to machine operator (optional)</label>
            <select
              id="dj-operator"
              value={createForm.operatorId}
              onChange={(e) => setCreateForm({ ...createForm, operatorId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {operatorsQuery.data?.map((op) => (
                <option key={op.id} value={op.id}>{op.fullName}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dj-due">Due date (optional)</label>
            <input
              id="dj-due"
              type="date"
              value={createForm.dueDate}
              onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
            />
          </div>
          {createJob.isError && <p className="error-text">Failed to create job order. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createJob.isPending} style={{ flex: 1 }}>
              {createJob.isPending ? 'Creating…' : 'Create job order'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog isOpen={!!selectedJob} onClose={closeDetail} title={selectedJob?.title ?? ''} maxWidth={620}>
        {selectedJob && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1rem' }}>
              <div>{fieldLabel('Status')}<StatusBadge status={selectedJob.status} /></div>
              <div>{fieldLabel('Client')}{selectedJob.clientName || '—'}</div>
              <div>{fieldLabel('Designer')}{selectedJob.designer?.fullName || '—'}</div>
              <div>{fieldLabel('Operator')}{selectedJob.operator?.fullName || 'Unassigned'}</div>
              <div>{fieldLabel('Due')}{selectedJob.dueDate ? new Date(selectedJob.dueDate).toLocaleDateString() : '—'}</div>
            </div>
            {selectedJob.description && (
              <p style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{selectedJob.description}</p>
            )}

            {canReassign && (
              <form onSubmit={handleReassignSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="dj-reassign">Reassign operator</label>
                  <select id="dj-reassign" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                    <option value="">Select operator…</option>
                    {operatorsQuery.data?.map((op) => (
                      <option key={op.id} value={op.id}>{op.fullName}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-secondary" disabled={!reassignTo || reassign.isPending}>
                  {reassign.isPending ? 'Saving…' : 'Assign'}
                </button>
              </form>
            )}

            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Activity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 240, overflowY: 'auto', marginBottom: '1rem' }}>
              {(!selectedJob.updates || selectedJob.updates.length === 0) && (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>No activity yet.</p>
              )}
              {selectedJob.updates?.map((u) => (
                <div key={u.id} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                      {u.author?.fullName ?? 'Unknown'}
                      {u.author?.role && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {u.author.role.replace(/_/g, ' ')}</span>
                      )}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(u.createdAt).toLocaleString()}</span>
                  </div>
                  {u.status && <div style={{ marginBottom: '0.25rem' }}><StatusBadge status={u.status} /></div>}
                  {u.message && <div style={{ fontSize: '0.9rem' }}>{u.message}</div>}
                </div>
              ))}
            </div>

            <form onSubmit={handleUpdateSubmit}>
              <div className="field">
                <label htmlFor="dj-update-message">Add comment</label>
                <textarea
                  id="dj-update-message"
                  rows={2}
                  value={updateForm.message}
                  onChange={(e) => setUpdateForm({ ...updateForm, message: e.target.value })}
                  placeholder="Share a status update or note…"
                />
              </div>
              {canSetStatus && (
                <div className="field">
                  <label htmlFor="dj-update-status">Change status (optional)</label>
                  <select
                    id="dj-update-status"
                    value={updateForm.status}
                    onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value as DesignJobStatus | '' })}
                  >
                    <option value="">No change</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {postUpdate.isError && <p className="error-text">Failed to post update. Try again.</p>}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={postUpdate.isPending || (!updateForm.message.trim() && !updateForm.status)}
              >
                {postUpdate.isPending ? 'Posting…' : 'Post update'}
              </button>
            </form>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function DesignJobsTable({ data, onOpen }: { data: DesignJob[]; onOpen: (id: string) => void }) {
  const pg = usePagination(data);
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Client</th>
            <th>Designer</th>
            <th>Operator</th>
            <th>Status</th>
            <th>Due</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pg.paginated.map((job) => (
            <tr key={job.id}>
              <td style={{ fontWeight: 600 }}>{job.title}</td>
              <td>{job.clientName || '—'}</td>
              <td>{job.designer?.fullName || '—'}</td>
              <td>{job.operator?.fullName || 'Unassigned'}</td>
              <td><StatusBadge status={job.status} /></td>
              <td>{job.dueDate ? new Date(job.dueDate).toLocaleDateString() : '—'}</td>
              <td style={{ textAlign: 'right' }}>
                <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => onOpen(job.id)}>Open</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
    </div>
  );
}

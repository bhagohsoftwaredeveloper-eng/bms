import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import { StatusBadge } from '../components/StatusBadge';
import { Pagination, usePagination } from '../components/Pagination';
import type { InkColor, MachineInk, PrinterMachine, DesignJob, DesignJobStatus } from '../lib/types';

const STATUS_OPTIONS: { value: DesignJobStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'ON_GOING', label: 'On Going' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const INK_COLORS: InkColor[] = ['BLACK', 'CYAN', 'MAGENTA', 'YELLOW', 'CLEAR', 'WHITE'];

const EMPTY_INK_AMOUNTS: Record<InkColor, string> = {
  BLACK: '', CYAN: '', MAGENTA: '', YELLOW: '', CLEAR: '', WHITE: '',
};

function inkPercentage(ink: MachineInk): number {
  return ink.maxCapacity > 0 ? (ink.currentUsage / ink.maxCapacity) * 100 : 0;
}

function inkStatus(percentage: number): { label: string; color: string } {
  if (percentage >= 90) return { label: 'Critical', color: 'var(--danger)' };
  if (percentage >= 70) return { label: 'Warning', color: 'var(--warning)' };
  return { label: 'Good', color: 'var(--success)' };
}

function formatCc(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function MachineOperatorPage() {
  const qc = useQueryClient();
  const [inkTarget, setInkTarget] = useState<{ jobId: string; jobTitle: string } | null>(null);
  const [inkMachineId, setInkMachineId] = useState('');
  const [inkAmounts, setInkAmounts] = useState<Record<InkColor, string>>(EMPTY_INK_AMOUNTS);
  const [inkNotes, setInkNotes] = useState('');
  const [updatingJob, setUpdatingJob] = useState<{ id: string; status: DesignJobStatus; message: string } | null>(null);

  const machinesQuery = useQuery({
    queryKey: ['machines'],
    queryFn: async () => (await api.get<PrinterMachine[]>('/machines')).data,
  });

  const jobsQuery = useQuery({
    queryKey: ['design-jobs'],
    queryFn: async () => (await api.get<DesignJob[]>('/design-jobs')).data,
  });

  const selectedMachine = machinesQuery.data?.find((m) => m.id === inkMachineId);

  const inkEntries = selectedMachine
    ? INK_COLORS.map((color) => ({
        color,
        machineInk: selectedMachine.machineInks.find((mi) => mi.inkColor === color),
        amount: Number(inkAmounts[color]),
      })).filter((e) => e.machineInk && e.amount > 0)
    : [];

  const recordUsage = useMutation({
    mutationFn: () =>
      Promise.all(
        inkEntries.map((entry) =>
          api.post(`/machines/${inkMachineId}/inks/${entry.machineInk!.id}/usage`, {
            amountUsed: entry.amount,
            jobReference: inkTarget?.jobTitle,
            notes: inkNotes.trim() || undefined,
          }),
        ),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] });
      setInkTarget(null);
    },
  });

  const updateJobStatus = useMutation({
    mutationFn: (data: { id: string; status: DesignJobStatus; message?: string }) =>
      api.post(`/design-jobs/${data.id}/updates`, { status: data.status, message: data.message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['design-jobs'] });
      setUpdatingJob(null);
    },
  });

  const handleInkSubmit = (e: FormEvent) => {
    e.preventDefault();
    recordUsage.mutate();
  };

  const handleJobUpdateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (updatingJob) {
      updateJobStatus.mutate({
        id: updatingJob.id,
        status: updatingJob.status,
        message: updatingJob.message.trim() || undefined,
      });
    }
  };

  const openUseInk = (job: DesignJob) => {
    setInkTarget({ jobId: job.id, jobTitle: job.title });
    setInkMachineId(machinesQuery.data?.[0]?.id ?? '');
    setInkAmounts(EMPTY_INK_AMOUNTS);
    setInkNotes('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <section>
        <h2 style={{ marginBottom: '0.5rem' }}>My Design Jobs</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1rem' }}>
          Advertising job orders assigned to you by the design team. Update the status and record ink usage as you work.
        </p>

        <OperatorJobsTable
          data={jobsQuery.data ?? []}
          isLoading={jobsQuery.isLoading}
          isError={jobsQuery.isError}
          hasMachines={!!machinesQuery.data?.length}
          onUpdateStatus={(id, status) => setUpdatingJob({ id, status, message: '' })}
          onUseInk={openUseInk}
        />
      </section>

      <section>
        <h2 style={{ marginBottom: '0.5rem' }}>Ink Tracking</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1.5rem', maxWidth: 560 }}>
          Overall ink usage across your printing machines.
        </p>

        {machinesQuery.isLoading && <p>Loading machines…</p>}
        {machinesQuery.isError && <p className="error-text">Failed to load machines.</p>}
        {machinesQuery.data?.length === 0 && <p>No printing machines have been set up yet.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {machinesQuery.data?.map((machine) => (
            <div key={machine.id} className="card">
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{machine.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {machine.model.replace(/_/g, ' ')}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {machine.machineInks.map((ink) => {
                  const pct = inkPercentage(ink);
                  const status = inkStatus(pct);
                  return (
                    <div key={ink.id} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{ink.inkColor}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {formatCc(ink.currentUsage)}cc / {formatCc(ink.maxCapacity)}cc
                          </div>
                        </div>
                        <span style={{ fontWeight: 700, color: status.color }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--border)' }}>
                        <div
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            height: 8,
                            borderRadius: 999,
                            background: status.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Use Ink Dialog */}
      <Dialog isOpen={!!inkTarget} onClose={() => setInkTarget(null)} title={`Record Ink Usage — ${inkTarget?.jobTitle ?? ''}`} maxWidth={460}>
        <form onSubmit={handleInkSubmit}>
          <div className="field">
            <label htmlFor="ink-machine">Machine</label>
            <select
              id="ink-machine"
              required
              value={inkMachineId}
              onChange={(e) => {
                setInkMachineId(e.target.value);
                setInkAmounts(EMPTY_INK_AMOUNTS);
              }}
            >
              <option value="">Select a machine…</option>
              {machinesQuery.data?.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {selectedMachine && (
            <div className="field">
              <label>Ink usage (cc)</label>
              <table>
                <tbody>
                  {INK_COLORS.map((color) => {
                    const machineInk = selectedMachine.machineInks.find((mi) => mi.inkColor === color);
                    return (
                      <tr key={color}>
                        <td style={{ padding: '0.25rem 0.5rem 0.25rem 0', fontWeight: 600, opacity: machineInk ? 1 : 0.4 }}>
                          {color}
                        </td>
                        <td style={{ padding: '0.25rem 0' }}>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder="0"
                            disabled={!machineInk}
                            value={inkAmounts[color]}
                            onChange={(e) => setInkAmounts({ ...inkAmounts, [color]: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="field">
            <label htmlFor="ink-notes">Notes (optional)</label>
            <input
              id="ink-notes"
              placeholder="e.g., Printed 5 tarpaulins"
              value={inkNotes}
              onChange={(e) => setInkNotes(e.target.value)}
            />
          </div>
          {recordUsage.isError && <p className="error-text">Failed to record usage. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={recordUsage.isPending || inkEntries.length === 0} style={{ flex: 1 }}>
              {recordUsage.isPending ? 'Saving…' : 'Record usage'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setInkTarget(null)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      {/* Update Job Status Dialog */}
      <Dialog isOpen={!!updatingJob} onClose={() => setUpdatingJob(null)} title="Update Job Status" maxWidth={420}>
        {updatingJob && (
          <form onSubmit={handleJobUpdateSubmit}>
            <div className="field">
              <label htmlFor="jobStatus">Status</label>
              <select
                id="jobStatus"
                value={updatingJob.status}
                onChange={(e) => setUpdatingJob({ ...updatingJob, status: e.target.value as DesignJobStatus })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="jobMessage">Comments / Notes (optional)</label>
              <textarea
                id="jobMessage"
                rows={3}
                placeholder="Add any updates or issues here..."
                value={updatingJob.message}
                onChange={(e) => setUpdatingJob({ ...updatingJob, message: e.target.value })}
              />
            </div>
            {updateJobStatus.isError && <p className="error-text">Failed to update status. Try again.</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={updateJobStatus.isPending} style={{ flex: 1 }}>
                {updateJobStatus.isPending ? 'Updating…' : 'Save Changes'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setUpdatingJob(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

function OperatorJobsTable({ data, isLoading, isError, hasMachines, onUpdateStatus, onUseInk }: {
  data: DesignJob[];
  isLoading: boolean;
  isError: boolean;
  hasMachines: boolean;
  onUpdateStatus: (id: string, status: DesignJobStatus) => void;
  onUseInk: (job: DesignJob) => void;
}) {
  const pg = usePagination(data);
  return (
    <div className="card">
      {isLoading && <p>Loading jobs…</p>}
      {isError && <p className="error-text">Failed to load jobs.</p>}
      {!isLoading && data.length === 0 && <p>No design jobs assigned to you yet.</p>}
      {data.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Status</th>
                <th>Due</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.paginated.map((job) => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 600 }}>{job.title}</td>
                  <td>{job.clientName || '—'}</td>
                  <td><StatusBadge status={job.status} /></td>
                  <td>{job.dueDate ? new Date(job.dueDate).toLocaleDateString() : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onUpdateStatus(job.id, job.status)}>Update Status</button>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} disabled={!hasMachines} onClick={() => onUseInk(job)}>Use Ink</button>
                    </div>
                  </td>
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

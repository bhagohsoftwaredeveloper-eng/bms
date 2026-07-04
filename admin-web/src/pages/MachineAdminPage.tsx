import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import type { MachineInk, PrinterMachine, PrinterMachineModel } from '../lib/types';

const MACHINE_MODELS: { value: PrinterMachineModel; label: string }[] = [
  { value: 'TS100_1600_SUBLIMATION', label: 'TS100-1600 Sublimation' },
  { value: 'JV100_160', label: 'JV100-160' },
  { value: 'UCJV300_160', label: 'UCJV300-160' },
];

const EMPTY_MACHINE_FORM = { model: '', label: '' };
const EMPTY_RESET_FORM = { newUsage: '0', notes: '' };

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

export function MachineAdminPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [machineForm, setMachineForm] = useState(EMPTY_MACHINE_FORM);
  const [resetTarget, setResetTarget] = useState<{ machineId: string; inkId: string; inkColor: string } | null>(null);
  const [resetForm, setResetForm] = useState(EMPTY_RESET_FORM);

  const machinesQuery = useQuery({
    queryKey: ['machines'],
    queryFn: async () => (await api.get<PrinterMachine[]>('/machines')).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['machines'] });

  const createMachine = useMutation({
    mutationFn: () => api.post('/machines', { model: machineForm.model, label: machineForm.label.trim() }),
    onSuccess: () => {
      invalidate();
      setMachineForm(EMPTY_MACHINE_FORM);
      setShowCreate(false);
    },
  });

  const resetInk = useMutation({
    mutationFn: () =>
      api.patch(`/machines/${resetTarget!.machineId}/inks/${resetTarget!.inkId}/reset`, {
        newUsage: Number(resetForm.newUsage) || 0,
        notes: resetForm.notes.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setResetTarget(null);
      setResetForm(EMPTY_RESET_FORM);
    },
  });

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMachine.mutate();
  };

  const handleResetSubmit = (e: FormEvent) => {
    e.preventDefault();
    resetInk.mutate();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: 560 }}>
          Track ink consumption across your printing machines. Operators record usage as they print;
          reset a color's usage after refilling its bottle.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          Add machine
        </button>
      </div>

      {machinesQuery.isLoading && <p>Loading machines…</p>}
      {machinesQuery.isError && <p className="error-text">Failed to load machines.</p>}
      {machinesQuery.data?.length === 0 && <p>No printing machines yet. Add one to start tracking ink.</p>}

      {machinesQuery.data?.map((machine) => (
        <div key={machine.id} className="card" style={{ marginBottom: '1.25rem', overflowX: 'auto' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{machine.label}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            {machine.model.replace(/_/g, ' ')}
          </div>
          <table>
            <thead>
              <tr>
                <th>Ink Color</th>
                <th>Usage</th>
                <th>Capacity</th>
                <th>Level</th>
                <th>Status</th>
                <th>Last Refill</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {machine.machineInks.map((ink) => {
                const pct = inkPercentage(ink);
                const status = inkStatus(pct);
                return (
                  <tr key={ink.id}>
                    <td>{ink.inkColor}</td>
                    <td>{formatCc(ink.currentUsage)}cc</td>
                    <td>{formatCc(ink.maxCapacity)}cc</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 60, height: 8, borderRadius: 999, background: 'var(--border)' }}>
                          <div
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              height: 8,
                              borderRadius: 999,
                              background: status.color,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: status.color, fontWeight: 600, fontSize: '0.8rem' }}>{status.label}</span>
                    </td>
                    <td>{ink.lastRefillAt ? new Date(ink.lastRefillAt).toLocaleDateString() : 'Never'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                        onClick={() => {
                          setResetTarget({ machineId: machine.id, inkId: ink.id, inkColor: ink.inkColor });
                          setResetForm(EMPTY_RESET_FORM);
                        }}
                      >
                        Reset after refill
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <Dialog isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Printing Machine" maxWidth={420}>
        <form onSubmit={handleCreateSubmit}>
          <div className="field">
            <label htmlFor="machine-model">Model</label>
            <select
              id="machine-model"
              required
              value={machineForm.model}
              onChange={(e) => setMachineForm({ ...machineForm, model: e.target.value })}
            >
              <option value="">Select a model…</option>
              {MACHINE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="machine-label">Label</label>
            <input
              id="machine-label"
              required
              placeholder="e.g., Machine 1"
              value={machineForm.label}
              onChange={(e) => setMachineForm({ ...machineForm, label: e.target.value })}
            />
          </div>
          {createMachine.isError && <p className="error-text">Failed to add machine. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createMachine.isPending} style={{ flex: 1 }}>
              {createMachine.isPending ? 'Adding…' : 'Add machine'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog isOpen={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset ${resetTarget?.inkColor ?? ''} Ink Usage`} maxWidth={420}>
        <form onSubmit={handleResetSubmit}>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            Record a refill and reset the tracked usage for this ink.
          </p>
          <div className="field">
            <label htmlFor="reset-usage">New usage (cc)</label>
            <input
              id="reset-usage"
              type="number"
              step="0.0001"
              min={0}
              required
              value={resetForm.newUsage}
              onChange={(e) => setResetForm({ ...resetForm, newUsage: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="reset-notes">Notes (optional)</label>
            <input
              id="reset-notes"
              placeholder="e.g., Refilled bottle"
              value={resetForm.notes}
              onChange={(e) => setResetForm({ ...resetForm, notes: e.target.value })}
            />
          </div>
          {resetInk.isError && <p className="error-text">Failed to reset ink usage. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={resetInk.isPending} style={{ flex: 1 }}>
              {resetInk.isPending ? 'Saving…' : 'Reset usage'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

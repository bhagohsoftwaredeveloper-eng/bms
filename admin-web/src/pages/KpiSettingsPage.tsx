import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { KpiDefinitionRow, UserRole } from '../lib/types';

const KPI_ROLES: UserRole[] = ['INSTALLER', 'DEVELOPER', 'DESIGNER', 'MACHINE_OPERATOR', 'LIAISON', 'SALES_STAFF', 'ADMIN_STAFF'];

const ROLE_LABEL: Record<string, string> = {
  INSTALLER: 'Installer',
  DEVELOPER: 'Developer',
  DESIGNER: 'Designer',
  MACHINE_OPERATOR: 'Machine Operator',
  LIAISON: 'Liaison',
  SALES_STAFF: 'Sales Staff',
  ADMIN_STAFF: 'Admin Staff',
};

const EMPTY_FORM = { name: '', weight: '', target: '', unit: '' };

// ── KPI definition row (view + inline edit) ───────────────────────────────────

function KpiDefRow({ def, role }: { def: KpiDefinitionRow; role: UserRole }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(def.name);
  const [weight, setWeight] = useState(String(def.weight));
  const [target, setTarget] = useState(String(def.target));
  const [unit, setUnit] = useState(def.unit);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi-definitions', role] });

  const save = useMutation({
    mutationFn: () => api.patch(`/kpis/definitions/${def.id}`, {
      name: def.isCustom ? name.trim() : undefined,
      weight: Number(weight),
      target: Number(target),
      unit: unit.trim(),
    }),
    onSuccess: () => { invalidate(); setEditing(false); },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/kpis/definitions/${def.id}`),
    onSuccess: invalidate,
  });

  const typeLabel = def.auto ? 'Auto-tracked' : def.isCustom ? 'Custom' : 'Built-in';
  const typeColor = def.auto ? 'var(--info)' : def.isCustom ? 'var(--success)' : 'var(--text-muted)';

  if (editing) {
    return (
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '0.5rem 0' }}>
          {def.isCustom ? (
            <input className="input" style={{ fontSize: '0.85rem' }} value={name} onChange={(e) => setName(e.target.value)} />
          ) : (
            def.name
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          <input className="input" type="number" min={0} max={100} step="0.01" style={{ width: 80, fontSize: '0.85rem', textAlign: 'right' }} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </td>
        <td style={{ textAlign: 'right' }}>
          <input className="input" type="number" min={0.01} step="0.01" style={{ width: 90, fontSize: '0.85rem', textAlign: 'right' }} value={target} onChange={(e) => setTarget(e.target.value)} />
        </td>
        <td>
          <input className="input" style={{ width: 90, fontSize: '0.85rem' }} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </td>
        <td style={{ color: typeColor, fontSize: '0.8rem', fontWeight: 600 }}>{typeLabel}</td>
        <td style={{ textAlign: 'right' }}>
          <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
            <button type="button" className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </span>
          {save.isError && <div className="error-text" style={{ marginTop: '0.3rem' }}>Failed to save.</div>}
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '0.5rem 0' }}>{def.name}</td>
      <td style={{ textAlign: 'right' }}>{def.weight}%</td>
      <td style={{ textAlign: 'right' }}>{def.target}{def.unit === '%' ? '%' : ''}</td>
      <td>{def.unit}</td>
      <td style={{ color: typeColor, fontSize: '0.8rem', fontWeight: 600 }}>{typeLabel}</td>
      <td style={{ textAlign: 'right' }}>
        <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
            disabled={remove.isPending}
            onClick={() => { if (confirm(`Delete KPI "${def.name}" for ${ROLE_LABEL[role]}?`)) remove.mutate(); }}
          >
            Delete
          </button>
        </span>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function KpiSettingsPage() {
  const qc = useQueryClient();
  const [role, setRole] = useState<UserRole>('INSTALLER');
  const [form, setForm] = useState(EMPTY_FORM);

  const defsQuery = useQuery({
    queryKey: ['kpi-definitions', role],
    queryFn: async () => (await api.get<KpiDefinitionRow[]>(`/kpis/definitions/${role}`)).data,
  });

  const create = useMutation({
    mutationFn: () => api.post('/kpis/definitions', {
      role,
      name: form.name.trim(),
      weight: Number(form.weight),
      target: Number(form.target),
      unit: form.unit.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpi-definitions', role] });
      setForm(EMPTY_FORM);
    },
  });

  const totalWeight = (defsQuery.data ?? []).reduce((s, d) => s + d.weight, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: 560 }}>
          Define the KPIs used to score each role's monthly performance and incentive eligibility.
          Add custom KPIs for things specific to your workflow — they're entered manually each month
          via Analytics &amp; KPI → Enter Manual KPI.
        </p>
        <select className="input" style={{ width: 200 }} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {KPI_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {defsQuery.isLoading && <p>Loading KPIs…</p>}
        {defsQuery.isError && <p className="error-text">Failed to load KPI definitions.</p>}
        {defsQuery.data && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>KPI Name</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Weight</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Target</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Unit</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {defsQuery.data.map((d) => <KpiDefRow key={d.id} def={d} role={role} />)}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ padding: '0.6rem 0', fontWeight: 700 }}>Total weight</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: totalWeight === 100 ? 'var(--success)' : 'var(--warning)' }}>
                  {totalWeight}%
                </td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        )}
        {defsQuery.data && totalWeight !== 100 && (
          <p style={{ color: 'var(--warning)', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: 0 }}>
            Weights should add up to 100% so KPI scores and incentive percentages stay accurate.
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: '1.5rem', maxWidth: 720 }}>
        <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Add Custom KPI for {ROLE_LABEL[role]}</div>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="kpi-name">KPI Name</label>
            <input id="kpi-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="kpi-weight">Weight (%)</label>
            <input id="kpi-weight" type="number" min={0} max={100} step="0.01" required value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="kpi-target">Target</label>
            <input id="kpi-target" type="number" min={0.01} step="0.01" required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="kpi-unit">Unit</label>
            <input id="kpi-unit" placeholder="%, /100, count…" required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add KPI'}
          </button>
        </form>
        {create.isError && <p className="error-text" style={{ marginTop: '0.5rem' }}>Failed to add KPI — a KPI with that name may already exist for this role.</p>}
      </div>
    </div>
  );
}

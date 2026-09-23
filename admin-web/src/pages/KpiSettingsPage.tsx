import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import type { InstallationRates, KpiDefinitionRow, UserRole } from '../lib/types';

const KPI_ROLES: UserRole[] = ['INSTALLER', 'DEVELOPER', 'DESIGNER', 'LIAISON', 'SALES_STAFF', 'ADMIN_STAFF'];

const ROLE_LABEL: Record<string, string> = {
  INSTALLER: 'Installer',
  DEVELOPER: 'Developer',
  DESIGNER: 'Designer',
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

interface TmsEmployee {
  employeeId: number;
  name: string;
  email: string;
  totalPoints: number;
}

interface DesignerPointsResponse {
  designers: DesignerPoint[];
  tmsEmployees: TmsEmployee[];
}

interface DesignerPoint {
  userId: string;
  fullName: string;
  email: string;
  matched: boolean;
  totalPoints: number;
  tmsEmployeeId: number | null;
  tmsName: string | null;
}

// ── Designer points from TMS Pro (read-only) + sync ───────────────────────────

function DesignerPointsPanel() {
  const qc = useQueryClient();
  const [result, setResult] = useState<string | null>(null);

  const pointsQuery = useQuery({
    queryKey: ['designer-points'],
    queryFn: async () => (await api.get<DesignerPointsResponse>('/kpis/designers/points')).data,
    retry: false,
  });

  const sync = useMutation({
    mutationFn: async () =>
      (await api.post<{ matched: number; month: number; year: number }>('/kpis/designers/sync')).data,
    onSuccess: (data) => {
      setResult(`Synced ${data.matched} designer(s) for ${String(data.month).padStart(2, '0')}/${data.year}. Their KPI scores were regenerated from TMS points.`);
      qc.invalidateQueries({ queryKey: ['designer-points'] });
    },
  });

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Designer Points — TMS Pro</div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 560 }}>
            Read-only total points per designer pulled from TMS Pro. <strong>Sync</strong> distributes each
            designer&apos;s points across their KPI weights (proportionally) to generate this month&apos;s score.
            Matched by email, then by full name. Note: TMS only returns employees who have <strong>earned KPI
            points</strong> — a designer with no logged TMS activity shows &quot;no KPI points&quot; even if their
            TMS profile exists. See the raw TMS list below.
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={sync.isPending} onClick={() => { setResult(null); sync.mutate(); }}>
          {sync.isPending ? 'Syncing…' : 'Sync from TMS'}
        </button>
      </div>

      {result && <p style={{ color: 'var(--success)', fontSize: '0.85rem' }}>✓ {result}</p>}
      {sync.isError && <p className="error-text">Sync failed — verify the TMS token / URL configured on the server.</p>}
      {pointsQuery.isLoading && <p>Loading designer points…</p>}
      {pointsQuery.isError && <p className="error-text">Could not load designer points (TMS API unreachable or token missing on the server).</p>}

      {pointsQuery.data && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Designer</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Email</th>
                <th style={{ textAlign: 'center', padding: '0.5rem 0', fontWeight: 600 }}>TMS Match</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {pointsQuery.data.designers.map((d) => (
                <tr key={d.userId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>{d.fullName}</td>
                  <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>{d.email}</td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'center' }}>
                    {d.matched
                      ? <span style={{ color: 'var(--success)' }}>✓ {d.tmsName ?? 'matched'}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>no KPI points</span>}
                  </td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 700 }}>{d.totalPoints}</td>
                </tr>
              ))}
              {pointsQuery.data.designers.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>No designers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {pointsQuery.data && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Employees returned by TMS ({pointsQuery.data.tmsEmployees.length})
          </div>
          {pointsQuery.data.tmsEmployees.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
              TMS returned no employees for the current range (all-time). If you expect data, the token may
              be scoped to a different account or there are no KPI events yet.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0', fontWeight: 600 }}>TMS ID</th>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0', fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0', fontWeight: 600 }}>Email</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0', fontWeight: 600 }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {pointsQuery.data.tmsEmployees.map((e) => (
                    <tr key={e.employeeId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.4rem 0', fontFamily: 'monospace' }}>{e.employeeId}</td>
                      <td style={{ padding: '0.4rem 0' }}>{e.name}</td>
                      <td style={{ padding: '0.4rem 0', color: 'var(--text-muted)' }}>{e.email}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right', fontWeight: 700 }}>{e.totalPoints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type RateForm = Record<'INSIDE_TAGUM' | 'OUTSIDE_TAGUM', { baseAmount: string; extraAmount: string }>;

const RATE_LOCATIONS: Array<{ key: keyof RateForm; label: string; hint: string }> = [
  { key: 'INSIDE_TAGUM', label: 'Inside Tagum', hint: 'Address contains "Tagum" (or is blank)' },
  { key: 'OUTSIDE_TAGUM', label: 'Outside Tagum', hint: 'Any other address' },
];

const EXAMPLE_COMPUTERS = [1, 2, 5];

function previewAmount(rate: { baseAmount: string; extraAmount: string }, computers: number) {
  return (Number(rate.baseAmount) || 0) + (computers - 1) * (Number(rate.extraAmount) || 0);
}

function RateInput({ id, value, onChange, disabled }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 600, pointerEvents: 'none' }}>₱</span>
      <input
        id={id}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: '1.9rem', width: '100%', boxSizing: 'border-box' }}
      />
    </div>
  );
}

function InstallationRatesPanel() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'SUPER_ADMIN';
  const [form, setForm] = useState<RateForm | null>(null);
  const [backofficeAmount, setBackofficeAmount] = useState('');
  const [saved, setSaved] = useState(false);

  const ratesQuery = useQuery({
    queryKey: ['installation-rates'],
    queryFn: async () => (await api.get<InstallationRates>('/earnings/installation-rates')).data,
  });

  useEffect(() => {
    if (!ratesQuery.data) return;
    const toForm = (r: InstallationRates['INSIDE_TAGUM']) => ({ baseAmount: String(r.baseAmount), extraAmount: String(r.extraAmount) });
    setForm({ INSIDE_TAGUM: toForm(ratesQuery.data.INSIDE_TAGUM), OUTSIDE_TAGUM: toForm(ratesQuery.data.OUTSIDE_TAGUM) });
    setBackofficeAmount(String(ratesQuery.data.backofficeExtensionAmount));
  }, [ratesQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const toRate = (r: RateForm['INSIDE_TAGUM']) => ({ baseAmount: Number(r.baseAmount) || 0, extraAmount: Number(r.extraAmount) || 0 });
      return api.put('/earnings/installation-rates', {
        INSIDE_TAGUM: toRate(form!.INSIDE_TAGUM),
        OUTSIDE_TAGUM: toRate(form!.OUTSIDE_TAGUM),
        backofficeExtensionAmount: Number(backofficeAmount) || 0,
      });
    },
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['installation-rates'] });
    },
  });

  const isConfigured = !!ratesQuery.data && RATE_LOCATIONS.some(({ key }) => {
    const r = ratesQuery.data[key];
    return r.baseAmount > 0 || r.extraAmount > 0;
  });

  const update = (key: keyof RateForm, field: 'baseAmount' | 'extraAmount', value: string) => {
    setSaved(false);
    setForm((prev) => (prev ? { ...prev, [key]: { ...prev[key], [field]: value } } : prev));
  };

  const updateBackoffice = (value: string) => {
    setSaved(false);
    setBackofficeAmount(value);
  };

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Installation Rates</div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 480 }}>
            What an installer earns per installation, on top of KPI incentives. Added automatically as
            <strong> Pending</strong> when they submit proof.
          </p>
        </div>
        {isConfigured
          ? <span className="badge badge-active">Auto-earnings on</span>
          : <span className="badge badge-draft">Not set</span>}
      </div>

      {ratesQuery.isLoading && <p>Loading rates…</p>}
      {ratesQuery.isError && <p className="error-text">Failed to load installation rates.</p>}
      {form && (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} style={{ marginTop: '1.1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {RATE_LOCATIONS.map(({ key, label, hint }) => (
              <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', background: 'var(--surface-secondary)' }}>
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.9rem' }}>{hint}</div>
                <div className="field">
                  <label htmlFor={`${key}-base`}>Base · 1st computer</label>
                  <RateInput id={`${key}-base`} disabled={!canEdit} value={form[key].baseAmount} onChange={(v) => update(key, 'baseAmount', v)} />
                </div>
                <div className="field">
                  <label htmlFor={`${key}-extra`}>Extra · each additional computer</label>
                  <RateInput id={`${key}-extra`} disabled={!canEdit} value={form[key].extraAmount} onChange={(v) => update(key, 'extraAmount', v)} />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', borderTop: '1px dashed var(--border)', paddingTop: '0.7rem' }}>
                  {EXAMPLE_COMPUTERS.map((n) => (
                    <span key={n} style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>
                      {n} PC{n !== 1 ? 's' : ''} · ₱{previewAmount(form[key], n).toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', background: 'var(--surface-secondary)' }}>
              <div style={{ fontWeight: 700 }}>Backoffice Extension</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.9rem' }}>
                Software job orders only — flat bonus, same regardless of location
              </div>
              <div className="field">
                <label htmlFor="backoffice-amount">Flat bonus, if included</label>
                <RateInput id="backoffice-amount" disabled={!canEdit} value={backofficeAmount} onChange={updateBackoffice} />
              </div>
            </div>
          </div>

          <p style={{ margin: '0.9rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Location is read from the client&apos;s address (contains &quot;Tagum&quot; = inside). Computers = the client&apos;s
            active licenses. Leave both rates at 0 to turn auto-earnings off. The backoffice extension bonus is added
            only when a software job order has &quot;Include backoffice extension&quot; checked.
          </p>

          {canEdit ? (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save rates'}
              </button>
              {saved && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>✓ Saved. Applies to future installations only.</span>}
              {save.isError && <span className="error-text">Could not save the rates.</span>}
            </div>
          ) : (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Only a Super Admin can change these rates.</p>
          )}
        </form>
      )}
    </div>
  );
}

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

      <InstallationRatesPanel />

      <DesignerPointsPanel />
    </div>
  );
}

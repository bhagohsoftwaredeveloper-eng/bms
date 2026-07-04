import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import type { Client, ClientStatus, ClientType } from '../lib/types';

const CLIENT_STATUSES: ClientStatus[] = ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'];

function generateClientCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CLT-';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const EMPTY_FORM = { clientCode: '', businessName: '', ownerName: '', contactNo: '', email: '', address: '', clientType: 'SOFTWARE' as ClientType };

function toEditForm(c: Client) {
  return {
    clientCode: c.clientCode,
    businessName: c.businessName,
    ownerName: c.ownerName,
    contactNo: c.contactNo,
    email: c.email ?? '',
    address: c.address ?? '',
    status: c.status,
    clientType: c.clientType,
  };
}

function ClientTypeToggle({ value, onChange }: { value: ClientType; onChange: (t: ClientType) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {(['SOFTWARE', 'ADVERTISING'] as ClientType[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          style={{
            flex: 1,
            padding: '0.55rem 0.75rem',
            borderRadius: 8,
            border: `2px solid ${value === t ? 'var(--accent)' : 'var(--border)'}`,
            background: value === t ? 'rgba(79,70,229,0.08)' : 'var(--surface)',
            color: value === t ? 'var(--accent)' : 'var(--text)',
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          {t === 'SOFTWARE' ? '💻 Software / POS' : '🎨 Advertising'}
        </button>
      ))}
    </div>
  );
}

export function ClientsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState<ReturnType<typeof toEditForm> | null>(null);

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
  });

  const createClient = useMutation({
    mutationFn: async () => (await api.post<Client>('/clients', form)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editForm }) =>
      (await api.patch<Client>(`/clients/${id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setEditingClient(null);
      setEditForm(null);
    },
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => api.delete(`/clients/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setEditForm(toEditForm(client));
  };

  const cancelEdit = () => {
    setEditingClient(null);
    setEditForm(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createClient.mutate();
  };

  const handleEditSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!editingClient || !editForm) return;
    updateClient.mutate({ id: editingClient.id, data: editForm });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Clients</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            Businesses that have purchased POS, accounting, school, HR, or inventory systems.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setForm({ ...EMPTY_FORM, clientCode: generateClientCode() });
            setShowForm(true);
          }}
        >
          New client
        </button>
      </div>

      <Dialog
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="New Client"
        maxWidth={520}
      >
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Client type</label>
            <ClientTypeToggle value={form.clientType} onChange={(t) => setForm({ ...form, clientType: t })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <div className="field">
              <label htmlFor="clientCode">Client code</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  id="clientCode"
                  required
                  value={form.clientCode}
                  onChange={(e) => setForm({ ...form, clientCode: e.target.value })}
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  title="Generate a new code"
                  onClick={() => setForm({ ...form, clientCode: generateClientCode() })}
                >
                  ↺
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="businessName">Business name</label>
              <input
                id="businessName"
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ownerName">Owner name</label>
              <input
                id="ownerName"
                required
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="contactNo">Contact no.</label>
              <input
                id="contactNo"
                required
                value={form.contactNo}
                onChange={(e) => setForm({ ...form, contactNo: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="address">Address</label>
              <input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          {createClient.isError && <p className="error-text">Could not create the client. Check the fields and try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createClient.isPending} style={{ flex: 1 }}>
              {createClient.isPending ? 'Saving…' : 'Save client'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        isOpen={!!editingClient}
        onClose={cancelEdit}
        title={`Edit ${editingClient?.businessName}`}
        maxWidth={520}
      >
        {editForm && (
          <form onSubmit={handleEditSubmit}>
            <div className="field">
              <label>Client type</label>
              <ClientTypeToggle value={editForm.clientType} onChange={(t) => setEditForm({ ...editForm, clientType: t })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              <div className="field">
                <label htmlFor="edit-clientCode">Client code</label>
                <input
                  id="edit-clientCode"
                  required
                  value={editForm.clientCode}
                  onChange={(e) => setEditForm({ ...editForm, clientCode: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-businessName">Business name</label>
                <input
                  id="edit-businessName"
                  required
                  value={editForm.businessName}
                  onChange={(e) => setEditForm({ ...editForm, businessName: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-ownerName">Owner name</label>
                <input
                  id="edit-ownerName"
                  required
                  value={editForm.ownerName}
                  onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-contactNo">Contact no.</label>
                <input
                  id="edit-contactNo"
                  required
                  value={editForm.contactNo}
                  onChange={(e) => setEditForm({ ...editForm, contactNo: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-email">Email</label>
                <input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-address">Address</label>
                <input
                  id="edit-address"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="edit-status">Status</label>
                <select
                  id="edit-status"
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ClientStatus })}
                >
                  {CLIENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            {updateClient.isError && <p className="error-text">Could not update the client. Try again.</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={updateClient.isPending} style={{ flex: 1 }}>
                {updateClient.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <div className="card">
        {clientsQuery.isLoading && <p>Loading clients…</p>}
        {clientsQuery.isError && <p className="error-text">Failed to load clients.</p>}
        {clientsQuery.data && clientsQuery.data.length === 0 && <p>No clients yet — add the first one above.</p>}
        {clientsQuery.data && clientsQuery.data.length > 0 && (
          <ClientsTable data={clientsQuery.data} onEdit={openEdit} onDelete={(id, name) => { if (confirm(`Delete ${name}? This cannot be undone.`)) deleteClient.mutate(id); }} deleteIsPending={deleteClient.isPending} />
        )}
      </div>
    </div>
  );
}

function ClientsTable({ data, onEdit, onDelete, deleteIsPending }: {
  data: Client[];
  onEdit: (c: Client) => void;
  onDelete: (id: string, name: string) => void;
  deleteIsPending: boolean;
}) {
  const pg = usePagination(data);
  return (
    <>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Business</th>
                <th>Type</th>
                <th>Owner</th>
                <th>Contact</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {pg.paginated.map((client) => (
                <tr key={client.id}>
                  <td style={{ fontFamily: 'monospace' }}>{client.clientCode}</td>
                  <td style={{ fontWeight: 500 }}>{client.businessName}</td>
                  <td>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 999, background: client.clientType === 'SOFTWARE' ? 'rgba(79,70,229,0.1)' : 'rgba(217,119,6,0.1)', color: client.clientType === 'SOFTWARE' ? 'var(--accent)' : 'var(--warning)' }}>
                      {client.clientType === 'SOFTWARE' ? 'Software' : 'Advertising'}
                    </span>
                  </td>
                  <td>{client.ownerName}</td>
                  <td>{client.contactNo}</td>
                  <td><StatusBadge status={client.status} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onEdit(client)}>Edit</button>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={deleteIsPending} onClick={() => onDelete(client.id, client.businessName)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
    </>
  );
}

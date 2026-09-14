import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from './Dialog';
import { InventoryItemPicker } from './InventoryItemPicker';
import type { InventoryItem, ItemPackage } from '../lib/types';

function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg ?? fallback;
}

interface SelectedComponent {
  inventoryItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface ManagePackagesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ManagePackagesDialog({ isOpen, onClose }: ManagePackagesDialogProps) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<SelectedComponent[]>([]);
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const packagesQuery = useQuery({
    queryKey: ['item-packages', 'all'],
    queryFn: async () => (await api.get<ItemPackage[]>('/item-packages', { params: { all: true } })).data,
    enabled: isOpen,
  });

  const inventoryQuery = useQuery({
    queryKey: ['inventory', 'all'],
    queryFn: async () => (await api.get<InventoryItem[]>('/inventory', { params: { all: true } })).data,
    enabled: isOpen,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['item-packages'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        items: selected.map((s) => ({ inventoryItemId: s.inventoryItemId, quantity: s.quantity })),
      };
      if (editingId) return api.patch(`/item-packages/${editingId}`, payload);
      return api.post('/item-packages', payload);
    },
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (err) => setFormError(apiErrorMessage(err, 'Failed to save the package.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/item-packages/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteError(null);
    },
    onError: (err, id) => setDeleteError({ id, message: apiErrorMessage(err, 'Failed to delete package.') }),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setDescription('');
    setSelected([]);
    setFormError('');
  };

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setSelected([]);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (pkg: ItemPackage) => {
    setEditingId(pkg.id);
    setName(pkg.name);
    setDescription(pkg.description ?? '');
    setSelected(
      pkg.items.map((c) => ({
        inventoryItemId: c.inventoryItemId,
        name: c.inventoryItem?.name ?? c.inventoryItemId,
        quantity: c.quantity,
        unitPrice: Number(c.inventoryItem?.unitPrice ?? 0),
      })),
    );
    setFormError('');
    setShowForm(true);
  };

  const toggleItem = (item: InventoryItem) => {
    setFormError('');
    setSelected((prev) =>
      prev.some((s) => s.inventoryItemId === item.id)
        ? prev.filter((s) => s.inventoryItemId !== item.id)
        : [...prev, { inventoryItemId: item.id, name: item.name, quantity: 1, unitPrice: Number(item.unitPrice) }],
    );
  };

  const setQty = (itemId: string, qty: number) => {
    setSelected((prev) =>
      prev.map((s) => (s.inventoryItemId === itemId ? { ...s, quantity: Math.max(1, Math.floor(qty) || 1) } : s)),
    );
  };

  const removeComponent = (itemId: string) => {
    setSelected((prev) => prev.filter((s) => s.inventoryItemId !== itemId));
  };

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Package name is required.');
      return;
    }
    if (selected.length === 0) {
      setFormError('Add at least one component item.');
      return;
    }
    saveMutation.mutate();
  };

  const packages = packagesQuery.data ?? [];
  const formTotal = selected.reduce((sum, s) => sum + s.quantity * s.unitPrice, 0);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Manage packages" maxWidth={680}>
      {!showForm && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button type="button" className="btn btn-primary" style={{ fontSize: '0.85rem' }} onClick={openAdd}>
            + New package
          </button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={submitForm}
          style={{ padding: '0.9rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-secondary)', marginBottom: '1rem' }}
        >
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>
            {editingId ? 'Edit package' : 'New package'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <div className="field">
              <label>Package name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Package 1" autoFocus />
            </div>
            <div className="field">
              <label>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="field" style={{ marginBottom: '0.5rem' }}>
            <label>Component items *</label>
            <InventoryItemPicker
              items={inventoryQuery.data ?? []}
              selectedIds={selected.map((s) => s.inventoryItemId)}
              onToggle={toggleItem}
              placeholder="Search items to add…"
              height={200}
            />
          </div>
          {selected.length > 0 && (
            <table style={{ marginBottom: '0.5rem' }}>
              <thead>
                <tr>
                  <th>Component</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Qty</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Unit price</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Subtotal</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {selected.map((s) => (
                  <tr key={s.inventoryItemId}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min={1}
                        value={s.quantity}
                        onChange={(e) => setQty(s.inventoryItemId, Number(e.target.value))}
                        style={{ width: 56, textAlign: 'center', padding: '0.25rem 0.4rem' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>₱{s.unitPrice.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>₱{(s.quantity * s.unitPrice).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeComponent(s.inventoryItemId)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1rem', padding: '0.2rem' }}
                        title="Remove component"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Package total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>₱{formTotal.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
            The package total is computed from each component's current price at the time it is inserted into a job
            order or quotation.
          </p>
          {formError && <p className="error-text" style={{ marginBottom: '0.5rem' }}>{formError}</p>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ fontSize: '0.85rem' }} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Create package'}
            </button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {packagesQuery.isLoading && <p>Loading packages…</p>}
      {packagesQuery.isError && <p className="error-text">Failed to load packages.</p>}
      {!packagesQuery.isLoading && packages.length === 0 && !showForm && (
        <p style={{ color: 'var(--text-muted)' }}>No packages yet — create the first one above.</p>
      )}

      {packages.length > 0 && !showForm && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Package</th>
                <th>Components</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.id} style={{ opacity: pkg.active ? 1 : 0.55 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{pkg.name}</div>
                    {pkg.description && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{pkg.description}</div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {pkg.items.length === 0
                      ? '—'
                      : pkg.items
                          .map((c) => `${c.quantity}× ${c.inventoryItem?.name ?? '?'}`)
                          .join(', ')}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${pkg.active ? 'badge-success' : ''}`} style={{ fontSize: '0.72rem' }}>
                      {pkg.active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => openEdit(pkg)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          setDeleteError(null);
                          if (confirm(`Delete "${pkg.name}"? This cannot be undone.`)) deleteMutation.mutate(pkg.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    {deleteError?.id === pkg.id && (
                      <p className="error-text" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', textAlign: 'right' }}>
                        {deleteError.message}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

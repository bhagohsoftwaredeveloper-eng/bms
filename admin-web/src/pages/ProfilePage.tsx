import { type FormEvent, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import type { AuthenticatedUser, TeamMember } from '../lib/types';

interface ProfilePayload {
  fullName?: string;
  email?: string;
  phone?: string;
  currentPassword?: string;
  newPassword?: string;
}

export function ProfilePage() {
  const user = useAuthStore((s) => s.user) as AuthenticatedUser;
  const setUser = useAuthStore((s) => s.setUser);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');

  // Load current phone from /users/me
  useEffect(() => {
    api.get<TeamMember>('/users/me').then((res) => {
      if (res.data?.phone) setPhone(res.data.phone);
    }).catch(() => {});
  }, []);

  const profileMutation = useMutation({
    mutationFn: (payload: ProfilePayload) => api.patch<TeamMember>('/users/me', payload),
    onSuccess: (res) => {
      const updated = res.data;
      // Merge updated fields into auth store (keep roles/role intact)
      setUser({
        ...user,
        fullName: updated.fullName,
        email: updated.email,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: ProfilePayload) => api.patch('/users/me', payload),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    },
    onError: () => setPwError('Incorrect current password or server error.'),
  });

  const handleProfileSave = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    profileMutation.mutate({
      fullName: fullName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    });
  };

  const handlePasswordSave = (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return; }
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>My Profile</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Update your name, contact details, and password.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2rem', alignItems: 'start' }}>
        {/* ── Account Info ── */}
        <form onSubmit={handleProfileSave} className="card">
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Account Info</h2>

          <div className="field">
            <label htmlFor="prof-name">Full name</label>
            <input
              id="prof-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="field">
            <label htmlFor="prof-email">Email address</label>
            <input
              id="prof-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>

          <div className="field">
            <label htmlFor="prof-phone">Phone / contact number</label>
            <input
              id="prof-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63 9xx xxx xxxx"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={profileMutation.isPending}
            >
              {profileMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
            {saved && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>✓ Saved successfully</span>}
            {profileMutation.isError && (
              <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                Failed — email may already be taken.
              </span>
            )}
          </div>

          {/* Read-only info */}
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <span><strong>Role:</strong> {user?.role?.replace(/_/g, ' ')}</span>
            <span><strong>User ID:</strong> <code>{user?.id?.slice(0, 8)}</code></span>
          </div>
        </form>

        {/* ── Change Password ── */}
        <form onSubmit={handlePasswordSave} className="card">
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Change Password</h2>

          <div className="field">
            <label htmlFor="prof-cur-pw">Current password</label>
            <input
              id="prof-cur-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="field">
            <label htmlFor="prof-new-pw">New password</label>
            <input
              id="prof-new-pw"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="field">
            <label htmlFor="prof-confirm-pw">Confirm new password</label>
            <input
              id="prof-confirm-pw"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={passwordMutation.isPending}
            >
              {passwordMutation.isPending ? 'Updating…' : 'Update password'}
            </button>
            {pwSaved && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>✓ Password updated</span>}
            {pwError && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{pwError}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

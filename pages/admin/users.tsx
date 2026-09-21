// pages/admin/users.tsx
// Seed-user-only UI: create, reset password, and delete users.
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Badge } from '@/components/ui';
import { requireAuthSSR, type AuthedUser } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const result = await requireAuthSSR(ctx);
  if ('redirect' in result) return result;
  if (!result.props.user.isSeedUser) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return result;
};

interface UserRow {
  id: string;
  email: string;
  isSeedUser: boolean;
  createdByUserId: string | null;
  createdAt: string;
}

export default function AdminUsers({ user }: { user: AuthedUser }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const emailFor = (id: string | null) => users.find((u) => u.id === id)?.email ?? '-';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create user');
        return;
      }
      setNewEmail('');
      setNewPassword('');
      await loadUsers();
    } catch (err) {
      setError('Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (id: string) => {
    setError(null);
    if (!resetPassword) return;
    try {
      const res = await fetch(`/api/users/${id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        return;
      }
      setResetTargetId(null);
      setResetPassword('');
    } catch (err) {
      setError('Failed to reset password');
    }
  };

  const handleDelete = async (id: string, email: string) => {
    setError(null);
    if (!window.confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to delete user');
        return;
      }
      await loadUsers();
    } catch (err) {
      setError('Failed to delete user');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-4xl mx-auto space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">
            &larr; Back to dashboard
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Create user</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="new-password">Initial password</Label>
                <Input
                  id="new-password"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create user'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-200">
              {users.map((u) => (
                <div key={u.id} className="py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="font-medium text-gray-900">{u.email}</span>
                      {u.isSeedUser && (
                        <Badge className="ml-2" variant="secondary">
                          seed
                        </Badge>
                      )}
                      <div className="text-xs text-gray-500">
                        created {new Date(u.createdAt).toLocaleString()}
                        {u.createdByUserId && ` by ${emailFor(u.createdByUserId)}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setResetTargetId(resetTargetId === u.id ? null : u.id)
                        }
                      >
                        Reset password
                      </Button>
                      {u.id !== user.id && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(u.id, u.email)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                  {resetTargetId === u.id && (
                    <div className="flex gap-2 items-center">
                      <Input
                        type="text"
                        placeholder="New password (min 8 chars)"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        minLength={8}
                        className="max-w-xs"
                      />
                      <Button size="sm" onClick={() => handleResetPassword(u.id)}>
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-gray-500 py-4">No users yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

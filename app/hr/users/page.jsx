'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles, AppShell } from '@/components/glass';
import RegisterUserForm from '@/components/users/RegisterUserForm';
import { sessionHasPermission, resolvePermissions } from '@/lib/auth/permissionClient';

function initialsFromEmail(email = '') {
  const local = String(email).split('@')[0] || '?';
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export default function HrUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  const [view, setView] = useState('create');
  const [users, setUsers] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [listLoaded, setListLoaded] = useState(false);
  const [search, setSearch] = useState('');

  const canCreate = sessionHasPermission(session, 'users', 'create');
  const canView = sessionHasPermission(session, 'users', 'view') || canCreate;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?role=hr');
      return;
    }
    if (status === 'authenticated') {
      const role = session?.user?.role;
      if (role !== 'HR' && role !== 'ADMIN') {
        router.push('/login?role=hr');
      }
    }
  }, [status, session, router]);

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await fetch('/api/hr/users', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.data?.users || data.users || []);
      setListLoaded(true);
    } catch (err) {
      setListError(err.message || 'Failed to load users');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if ((view === 'list' || view === 'edit') && canView && !listLoaded && !listLoading) {
      loadUsers();
    }
  }, [view, canView, listLoaded, listLoading, loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        String(u.employeeEmpCode || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const stats = useMemo(() => {
    const active = users.filter((u) => u.isActive !== false).length;
    const hr = users.filter((u) => u.role === 'HR' || u.role === 'ADMIN').length;
    return { total: users.length, active, hr };
  }, [users]);

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=hr' });
      router.push('/login?role=hr');
    } catch (_) {
      router.push('/login?role=hr');
    }
  };

  if (status === 'loading') {
    return (
      <AppShell>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.text.primary,
          }}
        >
          Loading…
        </div>
      </AppShell>
    );
  }

  if (status === 'unauthenticated') return null;

  if (!canCreate && !canView) {
    return (
      <AppShell>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            color: colors.text.primary,
          }}
        >
          <p style={{ fontSize: 15 }}>You do not have permission to manage users.</p>
          <button
            type="button"
            onClick={() => router.push('/hr/employees')}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: colors.primary[600],
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to HR Hub
          </button>
        </div>
      </AppShell>
    );
  }

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/hr/employees')} className="users-button" style={glossPill('neutral')}>
        ← HR Hub
      </button>
      <button type="button" onClick={handleLogout} className="users-button" style={glossPill('rose')}>
        Logout
      </button>
    </HrHeaderActions>
  );

  const tabStyle = (active) => ({
    padding: '9px 16px',
    borderRadius: 999,
    border: active ? 'none' : `1px solid ${colors.border.default}`,
    background: active
      ? colors.primary[600] || colors.primary
      : isDark
        ? 'rgba(255,255,255,0.04)'
        : colors.background.input,
    color: active ? '#fff' : colors.text.secondary,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  });

  return (
    <HrPageShell
      subtitle="Portal Users — HR login accounts & module permissions"
      actions={headerActions}
    >
        <GlassCard style={{ marginTop: 18 }} padding={24}>
          {/* Title row */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: colors.text.primary,
                  letterSpacing: '-0.01em',
                }}
              >
                {view === 'edit'
                  ? 'Edit user permissions'
                  : view === 'list'
                    ? 'Existing portal users'
                    : 'Register new portal user'}
              </h1>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.text.muted }}>
                Login accounts only — not the employee directory.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setView('create');
                    setEditingUser(null);
                  }}
                  style={tabStyle(view === 'create')}
                >
                  + New User
                </button>
              )}
              {canView && (
                <button
                  type="button"
                  onClick={() => {
                    setView('list');
                    setEditingUser(null);
                    if (!listLoaded) setListLoaded(false);
                  }}
                  style={tabStyle(view === 'list' || view === 'edit')}
                >
                  Existing Users
                  {listLoaded ? (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        background:
                          view === 'list' || view === 'edit'
                            ? 'rgba(255,255,255,0.22)'
                            : `${colors.primary[500]}22`,
                        color:
                          view === 'list' || view === 'edit'
                            ? '#fff'
                            : colors.primary[500],
                      }}
                    >
                      {users.length}
                    </span>
                  ) : null}
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          {(view === 'list' || listLoaded) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
                marginBottom: 18,
              }}
            >
              {[
                { label: 'Total users', value: stats.total },
                { label: 'Active', value: stats.active },
                { label: 'HR / Admin', value: stats.hr },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: isDark ? 'rgba(255,255,255,0.04)' : colors.background.secondary,
                    border: `1px solid ${colors.border.default}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: colors.text.muted,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      marginTop: 4,
                      color: colors.text.primary,
                    }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CREATE */}
          {view === 'create' && canCreate && (
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${colors.border.default}`,
                background: isDark ? 'rgba(0,0,0,0.15)' : colors.background.secondary,
                padding: '18px 20px',
              }}
            >
              <RegisterUserForm
                mode="create"
                layout="page"
                onSuccess={() => {
                  setListLoaded(false);
                  setView('list');
                }}
              />
            </div>
          )}

          {/* LIST */}
          {view === 'list' && (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email or role…"
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.input || colors.border.default}`,
                    background: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 13,
                    minWidth: 240,
                    flex: 1,
                    maxWidth: 360,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setListLoaded(false);
                    loadUsers();
                  }}
                  disabled={listLoading}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: listLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {listLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {listError && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    color: colors.error,
                    border: `1px solid ${colors.error}40`,
                    background: isDark ? 'rgba(239,68,68,0.1)' : `${colors.error}12`,
                    fontSize: 13,
                  }}
                >
                  {listError}
                </div>
              )}

              {listLoading && !users.length ? (
                <p style={{ color: colors.text.muted, fontSize: 13, padding: 12 }}>Loading users…</p>
              ) : filteredUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px' }}>
                  <p style={{ color: colors.text.muted, fontSize: 14, marginBottom: 14 }}>
                    {users.length === 0
                      ? 'No portal users yet. Create the first account.'
                      : 'No users match your search.'}
                  </p>
                  {canCreate && users.length === 0 && (
                    <button type="button" onClick={() => setView('create')} style={tabStyle(true)}>
                      + New User
                    </button>
                  )}
                </div>
              ) : (
                <div className="hr-table-scroll table-responsive" style={{ borderRadius: 12, border: `1px solid ${colors.border.default}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
                    <thead>
                      <tr style={{ background: colors.background?.table?.header || colors.primary[600] || colors.primary }}>
                        {['User', 'Role', 'Emp code', 'Status', 'Joined', 'Action'].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: h === 'Action' ? 'right' : 'left',
                              padding: '12px 14px',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: 11,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, i) => {
                        const active = u.isActive !== false;
                        return (
                          <tr
                            key={u.id}
                            style={{
                              background:
                                i % 2 === 0
                                  ? colors.background.card
                                  : isDark
                                    ? 'rgba(255,255,255,0.02)'
                                    : colors.background.secondary,
                              borderBottom: `1px solid ${colors.border.default}55`,
                            }}
                          >
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    flexShrink: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 800,
                                    fontSize: 12,
                                    color: '#fff',
                                    background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.success})`,
                                  }}
                                >
                                  {initialsFromEmail(u.email)}
                                </div>
                                <span style={{ fontWeight: 600, color: colors.text.primary, wordBreak: 'break-all' }}>
                                  {u.email}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', color: colors.text.secondary }}>{u.role}</td>
                            <td style={{ padding: '12px 14px', color: colors.text.muted }}>
                              {u.employeeEmpCode || '—'}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: active ? `${colors.success}22` : `${colors.error}22`,
                                  color: active ? colors.success : colors.error,
                                }}
                              >
                                {active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', color: colors.text.muted, whiteSpace: 'nowrap' }}>
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              {canCreate && u.role !== 'EMPLOYEE' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUser(u);
                                    setView('edit');
                                  }}
                                  style={{
                                    padding: '7px 12px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: colors.primary[600] || colors.primary,
                                    color: '#fff',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Edit access
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* EDIT */}
          {view === 'edit' && editingUser && canCreate && (
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${colors.border.default}`,
                background: isDark ? 'rgba(0,0,0,0.15)' : colors.background.secondary,
                padding: '18px 20px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setView('list');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: colors.text.secondary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  marginBottom: 12,
                }}
              >
                ← Back to user list
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    color: '#fff',
                    background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.success})`,
                  }}
                >
                  {initialsFromEmail(editingUser.email)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: colors.text.primary }}>{editingUser.email}</div>
                  <div style={{ fontSize: 12, color: colors.text.muted }}>{editingUser.role}</div>
                </div>
              </div>
              <RegisterUserForm
                key={editingUser.id}
                mode="edit"
                layout="page"
                userId={editingUser.id}
                initialEmail={editingUser.email}
                initialRole={editingUser.role}
                initialPermissions={resolvePermissions(editingUser)}
                initialIsActive={editingUser.isActive !== false}
                initialPresetId="custom"
                onCancel={() => {
                  setEditingUser(null);
                  setView('list');
                }}
                onSuccess={() => {
                  setEditingUser(null);
                  setView('list');
                  setListLoaded(false);
                  loadUsers();
                }}
              />
            </div>
          )}
        </GlassCard>
    </HrPageShell>
  );
}

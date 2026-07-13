'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { usePermissions } from '@/hooks/usePermissions';

const ASSET_TYPES = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'desktop', label: 'Desktop PC' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'keyboard', label: 'Keyboard' },
  { value: 'mouse', label: 'Mouse' },
  { value: 'headset', label: 'Headset' },
  { value: 'dock', label: 'Dock / Hub' },
  { value: 'phone', label: 'Phone' },
  { value: 'other', label: 'Other' },
];

const ASSET_STATUSES = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'repair', label: 'Repair' },
  { value: 'retired', label: 'Retired' },
];

const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];

const emptyForm = () => ({
  assetTag: '',
  type: 'laptop',
  brand: '',
  model: '',
  serialNumber: '',
  condition: 'good',
  purchaseDate: '',
  warrantyExpiry: '',
  notes: '',
});

function typeLabel(type) {
  return ASSET_TYPES.find((t) => t.value === type)?.label || type;
}

function statusLabel(status) {
  return ASSET_STATUSES.find((s) => s.value === status)?.label || status;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function ItAssetsPage() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const { session, status, canView, canCreate, canUpdate, canDelete, ready } =
    usePermissions('assets');

  const [assets, setAssets] = useState([]);
  const [stats, setStats] = useState({ in_stock: 0, assigned: 0, repair: 0, retired: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ type: '', text: '' });

  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'assign' | 'return' | null
  const [activeAsset, setActiveAsset] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [assignEmpCode, setAssignEmpCode] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [returnStatus, setReturnStatus] = useState('in_stock');
  const [returnNotes, setReturnNotes] = useState('');
  const [employeeHits, setEmployeeHits] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const inputStyle = useMemo(
    () => ({
      padding: '10px 12px',
      borderRadius: 10,
      border: `1px solid ${colors.border.input}`,
      backgroundColor: colors.background.input,
      color: colors.text.primary,
      fontSize: 13,
      width: '100%',
      boxSizing: 'border-box',
      outline: 'none',
    }),
    [colors]
  );

  const labelStyle = {
    fontSize: 12,
    fontWeight: 700,
    color: colors.text.secondary,
    marginBottom: 6,
    display: 'block',
  };

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3200);
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 280);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (!ready) return;
    if (status === 'unauthenticated') {
      router.push('/login?role=hr');
      return;
    }
    const role = String(session?.user?.role || '').toUpperCase();
    if (session && !['HR', 'ADMIN'].includes(role)) {
      router.push('/login?role=hr');
      return;
    }
    if (ready && !canView) {
      router.push('/hr/employees');
    }
  }, [ready, status, session, canView, router]);

  const loadAssets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('type', filterType);
      if (debouncedQ) params.set('q', debouncedQ);
      const res = await fetch(`/api/hr/assets?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to load assets');
      setAssets(data.data?.assets || []);
      setStats(data.data?.stats || { in_stock: 0, assigned: 0, repair: 0, retired: 0, total: 0 });
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, debouncedQ]);

  useEffect(() => {
    if (canView) loadAssets();
  }, [canView, loadAssets]);

  async function searchEmployees(q) {
    setEmpSearch(q);
    if (!q.trim()) {
      setEmployeeHits([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/hr/assets/employees-lookup?q=${encodeURIComponent(q.trim())}&limit=20`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      const list = data.data?.employees || [];
      setEmployeeHits(Array.isArray(list) ? list : []);
    } catch {
      setEmployeeHits([]);
    }
  }

  function openCreate() {
    setForm(emptyForm());
    setActiveAsset(null);
    setModal('create');
  }

  function openEdit(asset) {
    setActiveAsset(asset);
    setForm({
      assetTag: asset.assetTag || '',
      type: asset.type || 'laptop',
      brand: asset.brand || '',
      model: asset.model || '',
      serialNumber: asset.serialNumber || '',
      condition: asset.condition || 'good',
      purchaseDate: asset.purchaseDate ? String(asset.purchaseDate).slice(0, 10) : '',
      warrantyExpiry: asset.warrantyExpiry ? String(asset.warrantyExpiry).slice(0, 10) : '',
      notes: asset.notes || '',
    });
    setModal('edit');
  }

  function openAssign(asset) {
    setActiveAsset(asset);
    setAssignEmpCode('');
    setAssignNotes('');
    setEmpSearch('');
    setEmployeeHits([]);
    setModal('assign');
  }

  function openReturn(asset) {
    setActiveAsset(asset);
    setReturnStatus('in_stock');
    setReturnNotes('');
    setModal('return');
  }

  function closeModal() {
    if (!saving) setModal(null);
  }

  async function handleSaveAsset(e) {
    e.preventDefault();
    if (!form.assetTag.trim()) {
      showToast('error', 'Asset tag is required');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...form,
        assetTag: form.assetTag.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        serialNumber: form.serialNumber.trim(),
        notes: form.notes.trim(),
        purchaseDate: form.purchaseDate || null,
        warrantyExpiry: form.warrantyExpiry || null,
      };
      const isEdit = modal === 'edit' && activeAsset?._id;
      const res = await fetch(isEdit ? `/api/hr/assets/${activeAsset._id}` : '/api/hr/assets', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Save failed');
      showToast('success', isEdit ? 'Asset updated' : 'Asset added to inventory');
      setModal(null);
      await loadAssets();
    } catch (err) {
      showToast('error', err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!assignEmpCode.trim()) {
      showToast('error', 'Select or enter an employee code');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`/api/hr/assets/${activeAsset._id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empCode: assignEmpCode.trim(), notes: assignNotes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Assign failed');
      showToast('success', `Assigned to ${assignEmpCode.trim()}`);
      setModal(null);
      await loadAssets();
    } catch (err) {
      showToast('error', err.message || 'Assign failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn(e) {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch(`/api/hr/assets/${activeAsset._id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: returnStatus, notes: returnNotes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Return failed');
      showToast('success', 'Asset returned');
      setModal(null);
      await loadAssets();
    } catch (err) {
      showToast('error', err.message || 'Return failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(asset) {
    if (!canDelete) return;
    if (!window.confirm(`Delete asset ${asset.assetTag}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/hr/assets/${asset._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Delete failed');
      showToast('success', 'Asset deleted');
      await loadAssets();
    } catch (err) {
      showToast('error', err.message || 'Delete failed');
    }
  }

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=hr' });
      router.push('/login?role=hr');
    } catch {
      router.push('/login?role=hr');
    }
  };

  const statusChip = (status) => {
    const map = {
      in_stock: { bg: isDark ? 'rgba(34,197,94,0.18)' : '#dcfce7', color: isDark ? '#86efac' : '#166534' },
      assigned: { bg: isDark ? 'rgba(14,165,233,0.2)' : '#e0f2fe', color: isDark ? '#7dd3fc' : '#0369a1' },
      repair: { bg: isDark ? 'rgba(245,158,11,0.2)' : '#fef3c7', color: isDark ? '#fcd34d' : '#b45309' },
      retired: { bg: isDark ? 'rgba(148,163,184,0.2)' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569' },
    };
    const s = map[status] || map.retired;
    return {
      display: 'inline-flex',
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      background: s.bg,
      color: s.color,
    };
  };

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/hr/employees')} style={glossPill('neutral')}>
        Hub
      </button>
      <button type="button" onClick={handleLogout} style={glossPill('neutral')}>
        Logout
      </button>
    </HrHeaderActions>
  );

  const modalOverlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 80,
    padding: 16,
  };

  const modalCard = {
    width: 'min(520px, 100%)',
    maxHeight: '90vh',
    overflowY: 'auto',
    borderRadius: 16,
    padding: 20,
    background: isDark ? '#0f172a' : colors.background.card || '#fff',
    border: `1px solid ${colors.glass.border}`,
    boxShadow: colors.glass.shadow,
  };

  if (!ready || !canView) {
    return (
      <HrPageShell subtitle="IT Assets" actions={headerActions}>
        <GlassCard padding="24px" borderRadius={20}>
          <div style={{ color: colors.text.secondary, fontSize: 14 }}>Loading…</div>
        </GlassCard>
      </HrPageShell>
    );
  }

  return (
    <HrPageShell subtitle="IT Assets — inventory & assignments" actions={headerActions}>
      {toast.text && (
        <div
          style={{
            position: 'fixed',
            top: 18,
            right: 18,
            zIndex: 100,
            padding: '10px 14px',
            borderRadius: 10,
            background:
              toast.type === 'error'
                ? isDark
                  ? 'rgba(239,68,68,0.2)'
                  : '#fef2f2'
                : isDark
                  ? 'rgba(34,197,94,0.2)'
                  : '#f0fdf4',
            color: toast.type === 'error' ? colors.error : colors.success,
            border: `1px solid ${toast.type === 'error' ? colors.error : colors.success}55`,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {toast.text}
        </div>
      )}

      <GlassCard padding="18px 20px 22px" borderRadius={22} style={{ width: '100%' }}>
        {/* Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 10,
            marginBottom: 18,
          }}
        >
          {[
            { key: 'total', label: 'Total', value: stats.total },
            { key: 'in_stock', label: 'In stock', value: stats.in_stock },
            { key: 'assigned', label: 'Assigned', value: stats.assigned },
            { key: 'repair', label: 'Repair', value: stats.repair },
            { key: 'retired', label: 'Retired', value: stats.retired },
          ].map((m) => (
            <div
              key={m.key}
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: isDark ? 'rgba(255,255,255,0.03)' : colors.background.secondary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {m.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: colors.text.primary, marginTop: 4 }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search tag, serial, brand, employee…"
            style={{ ...inputStyle, maxWidth: 280 }}
          />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 140 }}>
            <option value="">All types</option>
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 140 }}>
            <option value="">All statuses</option>
            {ASSET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: `linear-gradient(135deg, ${colors.primary[700]}, ${colors.primary[500]})`,
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              + Add asset
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${colors.border.default}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
            <thead>
              <tr style={{ background: isDark ? '#1e293b' : 'rgba(59,130,246,0.08)' }}>
                {['Tag', 'Type', 'Brand / Model', 'Serial', 'Status', 'Assigned to', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      color: colors.text.primary,
                      fontWeight: 700,
                      borderBottom: `1px solid ${colors.border.default}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: colors.text.secondary }}>
                    Loading assets…
                  </td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: colors.text.secondary }}>
                    No assets yet. Add laptops, PCs, monitors, and accessories to get started.
                  </td>
                </tr>
              ) : (
                assets.map((asset, idx) => (
                  <tr
                    key={asset._id}
                    style={{
                      background: isDark
                        ? idx % 2 === 0
                          ? '#0f172a'
                          : '#1e293b'
                        : idx % 2 === 0
                          ? '#fff'
                          : '#f8fafc',
                    }}
                  >
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: colors.text.primary }}>{asset.assetTag}</td>
                    <td style={{ padding: '11px 14px', color: colors.text.secondary }}>{typeLabel(asset.type)}</td>
                    <td style={{ padding: '11px 14px', color: colors.text.primary }}>
                      {[asset.brand, asset.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', color: colors.text.secondary, fontFamily: 'ui-monospace, monospace' }}>
                      {asset.serialNumber || '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={statusChip(asset.status)}>{statusLabel(asset.status)}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: colors.text.secondary }}>
                      {asset.assignedToEmpCode
                        ? `${asset.assignedToName || '—'} (${asset.assignedToEmpCode})`
                        : '—'}
                      {asset.assignedAt ? (
                        <div style={{ fontSize: 11, marginTop: 2, color: colors.text.muted }}>
                          since {formatDate(asset.assignedAt)}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {canUpdate && asset.status !== 'assigned' && asset.status !== 'retired' && (
                          <button type="button" onClick={() => openAssign(asset)} style={glossPill('neutral')}>
                            Assign
                          </button>
                        )}
                        {canUpdate && asset.status === 'assigned' && (
                          <button type="button" onClick={() => openReturn(asset)} style={glossPill('warm')}>
                            Return
                          </button>
                        )}
                        {canUpdate && (
                          <button type="button" onClick={() => openEdit(asset)} style={glossPill('slate')}>
                            Edit
                          </button>
                        )}
                        {canDelete && asset.status !== 'assigned' && (
                          <button type="button" onClick={() => handleDelete(asset)} style={glossPill('rose')}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Create / Edit modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div style={modalOverlay} onClick={closeModal}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', color: colors.text.primary, fontSize: 17 }}>
              {modal === 'create' ? 'Add asset' : `Edit ${activeAsset?.assetTag}`}
            </h3>
            <form onSubmit={handleSaveAsset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Asset tag *</label>
                <input
                  required
                  value={form.assetTag}
                  onChange={(e) => setForm((f) => ({ ...f, assetTag: e.target.value }))}
                  placeholder="e.g. LAP-0042"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Type *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    style={inputStyle}
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Condition</label>
                  <select
                    value={form.condition}
                    onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                    style={inputStyle}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Brand</label>
                  <input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Model</label>
                  <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Serial number</label>
                <input
                  value={form.serialNumber}
                  onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Purchase date</label>
                  <input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Warranty expiry</label>
                  <input
                    type="date"
                    value={form.warrantyExpiry}
                    onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" onClick={closeModal} disabled={saving} style={glossPill('neutral')}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...glossPill('neutral'),
                    background: `linear-gradient(135deg, ${colors.primary[700]}, ${colors.primary[500]})`,
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  {saving ? 'Saving…' : modal === 'create' ? 'Add to inventory' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {modal === 'assign' && activeAsset && (
        <div style={modalOverlay} onClick={closeModal}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', color: colors.text.primary, fontSize: 17 }}>
              Assign {activeAsset.assetTag}
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: colors.text.secondary }}>
              {typeLabel(activeAsset.type)}
              {activeAsset.brand || activeAsset.model
                ? ` · ${[activeAsset.brand, activeAsset.model].filter(Boolean).join(' ')}`
                : ''}
            </p>
            <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Find employee</label>
                <input
                  value={empSearch}
                  onChange={(e) => searchEmployees(e.target.value)}
                  placeholder="Search name or emp code…"
                  style={inputStyle}
                />
                {employeeHits.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      borderRadius: 10,
                      border: `1px solid ${colors.border.default}`,
                      maxHeight: 160,
                      overflowY: 'auto',
                    }}
                  >
                    {employeeHits.map((emp) => (
                      <button
                        key={emp.empCode}
                        type="button"
                        onClick={() => {
                          setAssignEmpCode(emp.empCode);
                          setEmpSearch(`${emp.name || ''} (${emp.empCode})`);
                          setEmployeeHits([]);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          border: 'none',
                          borderBottom: `1px solid ${colors.border.default}40`,
                          background: 'transparent',
                          color: colors.text.primary,
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        <strong>{emp.name}</strong>
                        <span style={{ color: colors.text.muted }}> · {emp.empCode}</span>
                        {emp.department ? (
                          <span style={{ color: colors.text.muted }}> · {emp.department}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Employee code *</label>
                <input
                  required
                  value={assignEmpCode}
                  onChange={(e) => setAssignEmpCode(e.target.value)}
                  placeholder="e.g. 00082"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeModal} disabled={saving} style={glossPill('neutral')}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...glossPill('neutral'),
                    background: `linear-gradient(135deg, ${colors.primary[700]}, ${colors.primary[500]})`,
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  {saving ? 'Assigning…' : 'Assign asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return modal */}
      {modal === 'return' && activeAsset && (
        <div style={modalOverlay} onClick={closeModal}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', color: colors.text.primary, fontSize: 17 }}>
              Return {activeAsset.assetTag}
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: colors.text.secondary }}>
              Currently with {activeAsset.assignedToName || '—'} ({activeAsset.assignedToEmpCode})
            </p>
            <form onSubmit={handleReturn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Return as</label>
                <select value={returnStatus} onChange={(e) => setReturnStatus(e.target.value)} style={inputStyle}>
                  <option value="in_stock">In stock (ready to reassign)</option>
                  <option value="repair">Needs repair</option>
                  <option value="retired">Retire</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeModal} disabled={saving} style={glossPill('neutral')}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...glossPill('neutral'),
                    background: `linear-gradient(135deg, ${colors.primary[700]}, ${colors.primary[500]})`,
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  {saving ? 'Returning…' : 'Confirm return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HrPageShell>
  );
}

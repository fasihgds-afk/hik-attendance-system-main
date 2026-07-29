'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { usePermissions } from '@/hooks/usePermissions';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CenterAlert from '@/components/ui/CenterAlert';

const WORK_LOCATIONS = ['Work From Office', 'Work From Home', 'Hybrid', 'Other'];

const ASSET_TYPES = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'desktop', label: 'Desktop PC' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'keyboard', label: 'Keyboard' },
  { value: 'mouse', label: 'Mouse' },
  { value: 'headset', label: 'Headphone' },
  { value: 'charger', label: 'Charger' },
  { value: 'dock', label: 'Dock / Hub' },
  { value: 'phone', label: 'Phone' },
  { value: 'other', label: 'Other' },
];

const COMPUTE_TYPES = new Set(['laptop', 'desktop']);
const BRAND_TYPES = new Set(['laptop', 'desktop', 'monitor']);
const BULK_TYPES = new Set(['keyboard', 'mouse', 'charger']);

function isComputeType(type) {
  return COMPUTE_TYPES.has(type);
}

function wantsBrand(type) {
  return BRAND_TYPES.has(type);
}

function isBulkType(type) {
  return BULK_TYPES.has(type);
}

function typeLabel(type) {
  return ASSET_TYPES.find((t) => t.value === type)?.label || type;
}

function formatAssetLabel(asset) {
  if (!asset) return '';
  if (isComputeType(asset.type)) {
    return [
      asset.brand || null,
      asset.assetTag,
      asset.processor ? `CPU ${asset.processor}` : null,
      asset.ram ? `RAM ${asset.ram}` : null,
      asset.rom ? `ROM ${asset.rom}` : null,
    ]
      .filter(Boolean)
      .join(' / ');
  }
  if (asset.type === 'monitor') {
    return [asset.brand, asset.assetTag, asset.notes].filter(Boolean).join(' · ');
  }
  return [asset.brand, asset.assetTag, typeLabel(asset.type), asset.notes].filter(Boolean).join(' · ');
}

const emptyEquipForm = () => ({
  empCode: '',
  devicePassword: '',
  laptop: '',
  ip: '',
  workLocation: 'Work From Office',
  headphone: false,
  mouse: false,
  keyboard: false,
  monitor: false,
  charger: false,
  takeHomeAllowed: false,
  extraEquipment: '',
  notes: '',
  laptopAssetId: '',
});

const emptyInventoryForm = () => ({
  assetTag: '',
  type: 'laptop',
  brand: '',
  processor: '',
  ram: '',
  rom: '',
  quantity: 1,
  notes: '',
});

function BoolPill({ value, colors, isDark }) {
  const on = !!value;
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: on
          ? isDark
            ? 'rgba(34,197,94,0.2)'
            : '#dcfce7'
          : isDark
            ? 'rgba(148,163,184,0.15)'
            : '#f1f5f9',
        color: on ? (isDark ? '#86efac' : '#166534') : colors.text.muted,
      }}
    >
      {on ? 'TRUE' : 'FALSE'}
    </span>
  );
}

export default function ItAssetsPage() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const { session, status, canView, canCreate, canUpdate, canDelete, ready } =
    usePermissions('assets');

  const [tab, setTab] = useState('sheet'); // sheet | inventory
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    withLaptop: 0,
    withMouse: 0,
    withKeyboard: 0,
    withHeadphone: 0,
    withMonitor: 0,
  });
  const [inventory, setInventory] = useState([]);
  const [byType, setByType] = useState({});
  const [filterType, setFilterType] = useState('');
  const [stockAssets, setStockAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ type: '', text: '', title: '' });
  const [confirmState, setConfirmState] = useState(null); // { title, message, onConfirm }
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [modal, setModal] = useState(null); // assign | edit | addAsset
  const [form, setForm] = useState(emptyEquipForm());
  const [invForm, setInvForm] = useState(emptyInventoryForm());
  const [empSearch, setEmpSearch] = useState('');
  const [employeeHits, setEmployeeHits] = useState([]);
  const [selectedEmpLabel, setSelectedEmpLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);
  const showComputeFields = isComputeType(invForm.type);
  const showBrandField = wantsBrand(invForm.type) || isBulkType(invForm.type);
  const showBulkField = isBulkType(invForm.type);

  const inputStyle = useMemo(
    () => ({
      padding: '9px 11px',
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
    marginBottom: 5,
    display: 'block',
  };

  function showToast(type, text, title = '') {
    setToast({ type, text, title });
  }

  function closeToast() {
    setToast({ type: '', text: '', title: '' });
  }

  function askConfirm({ title, message, confirmText = 'Delete', onConfirm }) {
    setConfirmState({ title, message, confirmText, onConfirm });
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
    if (ready && !canView) router.push('/hr/employees');
  }, [ready, status, session, canView, router]);

  const loadSheet = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedQ) params.set('q', debouncedQ);
      const res = await fetch(`/api/hr/assets/equipment?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to load');
      setRows(data.data?.rows || []);
      setStats(
        data.data?.stats || {
          total: 0,
          withLaptop: 0,
          withMouse: 0,
          withKeyboard: 0,
          withHeadphone: 0,
          withMonitor: 0,
        }
      );
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load equipment');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (debouncedQ) params.set('q', debouncedQ);
      if (filterType) params.set('type', filterType);
      const res = await fetch(`/api/hr/assets?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to load inventory');
      setInventory(data.data?.assets || []);
      setByType(data.data?.byType || {});
    } catch (err) {
      showToast('error', err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, filterType]);

  const loadStockLaptops = useCallback(async () => {
    try {
      const res = await fetch('/api/hr/assets?status=in_stock&limit=100', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) return;
      setStockAssets((data.data?.assets || []).filter((a) => isComputeType(a.type)));
    } catch {
      setStockAssets([]);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    if (tab === 'sheet') loadSheet();
    else loadInventory();
  }, [canView, tab, loadSheet, loadInventory]);

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
      setEmployeeHits(data.data?.employees || []);
    } catch {
      setEmployeeHits([]);
    }
  }

  function openAssign() {
    setForm(emptyEquipForm());
    setEmpSearch('');
    setEmployeeHits([]);
    setSelectedEmpLabel('');
    setShowPassword(false);
    loadStockLaptops();
    loadInventory(); // refresh stock counts for accessory checkboxes
    setModal('assign');
  }

  function openEdit(row) {
    setForm({
      empCode: row.empCode || '',
      devicePassword: row.devicePassword || '',
      laptop: row.laptop || '',
      ip: row.ip || '',
      workLocation: row.workLocation || 'Work From Office',
      headphone: !!row.headphone,
      mouse: !!row.mouse,
      keyboard: !!row.keyboard,
      monitor: !!row.monitor,
      charger: !!row.charger,
      takeHomeAllowed:
        !!row.takeHomeAllowed || /take\s*home/i.test(String(row.laptopPermission || '')),
      extraEquipment: row.extraEquipment || '',
      notes: row.notes || '',
      laptopAssetId: row.laptopAssetId ? String(row.laptopAssetId) : '',
    });
    setSelectedEmpLabel(`${row.employeeName || ''} (${row.empCode})`);
    setEmpSearch('');
    setEmployeeHits([]);
    setShowPassword(false);
    loadStockLaptops();
    loadInventory();
    setModal('edit');
  }

  function openAddAsset() {
    setInvForm(emptyInventoryForm());
    setModal('addAsset');
  }

  function closeModal() {
    if (!saving) setModal(null);
  }

  function onPickStockAsset(assetId) {
    const asset = stockAssets.find((a) => a._id === assetId);
    setForm((f) => ({
      ...f,
      laptopAssetId: assetId,
      laptop: asset ? formatAssetLabel(asset) : f.laptop,
    }));
  }

  function onInvTypeChange(type) {
    setInvForm((f) => ({
      ...f,
      type,
      brand: wantsBrand(type) || isBulkType(type) ? f.brand : '',
      processor: isComputeType(type) ? f.processor : '',
      ram: isComputeType(type) ? f.ram : '',
      rom: isComputeType(type) ? f.rom : '',
      quantity: isBulkType(type) ? f.quantity || 1 : 1,
    }));
  }

  async function handleSaveEquip(e) {
    e.preventDefault();
    if (!form.empCode.trim()) {
      showToast('error', 'Select an employee');
      return;
    }
    if (modal === 'assign' && !form.laptopAssetId) {
      showToast('error', 'Pick a laptop / PC from inventory');
      return;
    }
    if (!form.laptop.trim() && !form.laptopAssetId) {
      showToast('error', 'Select a laptop / PC from inventory');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        ...form,
        empCode: form.empCode.trim(),
        laptopAssetId: form.laptopAssetId || null,
      };
      const res = await fetch('/api/hr/assets/equipment', {
        method: modal === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Save failed');
      showToast('success', modal === 'edit' ? 'Equipment details were saved.' : 'Laptop and accessories assigned to employee.', modal === 'edit' ? 'Updated' : 'Assigned');
      setModal(null);
      await loadSheet();
    } catch (err) {
      showToast('error', err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInventory(e) {
    e.preventDefault();
    if (!invForm.assetTag.trim()) {
      showToast('error', 'Asset tag is required');
      return;
    }
    if (wantsBrand(invForm.type) && !invForm.brand.trim()) {
      showToast('error', 'Brand name is required for laptop, PC, and monitor');
      return;
    }
    if (isComputeType(invForm.type) && !invForm.processor && !invForm.ram && !invForm.rom) {
      showToast('error', 'Enter Processor, RAM, or ROM for laptop/PC');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        assetTag: invForm.assetTag.trim(),
        type: invForm.type,
        notes: invForm.notes.trim(),
      };
      if (showBrandField) payload.brand = invForm.brand.trim();
      if (isComputeType(invForm.type)) {
        payload.processor = invForm.processor.trim();
        payload.ram = invForm.ram.trim();
        payload.rom = invForm.rom.trim();
      }
      if (isBulkType(invForm.type)) {
        payload.quantity = Math.min(100, Math.max(1, parseInt(invForm.quantity, 10) || 1));
      }

      const res = await fetch('/api/hr/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to add asset');
      const count = data.data?.count || 1;
      showToast(
        'success',
        count > 1
          ? `Added ${count} ${typeLabel(invForm.type)} items to inventory.`
          : `${typeLabel(invForm.type)} added to inventory.`,
        'Inventory updated'
      );
      setModal(null);
      setTab('inventory');
      await loadInventory();
    } catch (err) {
      showToast('error', err.message || 'Failed to add asset');
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteRow(row) {
    if (!canDelete) return;
    askConfirm({
      title: 'Remove equipment row?',
      message: `Remove IT equipment for ${row.employeeName || row.empCode}? Linked accessories will return to stock when possible.`,
      confirmText: 'Remove',
      onConfirm: async () => {
        try {
          setConfirmBusy(true);
          const res = await fetch(
            `/api/hr/assets/equipment?empCode=${encodeURIComponent(row.empCode)}`,
            { method: 'DELETE' }
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Delete failed');
          setConfirmState(null);
          showToast('success', 'Employee equipment row removed.', 'Deleted');
          await loadSheet();
          await loadInventory();
        } catch (err) {
          setConfirmState(null);
          showToast('error', err.message || 'Delete failed', 'Delete failed');
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  function handleDeleteAsset(asset) {
    if (!canDelete) return;
    askConfirm({
      title: 'Delete inventory item?',
      message: `Delete ${asset.assetTag} (${typeLabel(asset.type)}) from inventory? This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          setConfirmBusy(true);
          const res = await fetch(`/api/hr/assets/${asset._id}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Delete failed');
          setConfirmState(null);
          showToast('success', `${asset.assetTag} deleted from inventory.`, 'Deleted');
          await loadInventory();
        } catch (err) {
          setConfirmState(null);
          showToast('error', err.message || 'Delete failed', 'Delete failed');
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=hr' });
      router.push('/login?role=hr');
    } catch {
      router.push('/login?role=hr');
    }
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
    width: 'min(640px, 100%)',
    maxHeight: '92vh',
    overflowY: 'auto',
    borderRadius: 16,
    padding: 20,
    background: isDark ? '#0f172a' : colors.background.card || '#fff',
    border: `1px solid ${colors.glass.border}`,
    boxShadow: colors.glass.shadow,
  };

  const ACCESSORY_STOCK_KEY = {
    headphone: 'headset',
    mouse: 'mouse',
    keyboard: 'keyboard',
    monitor: 'monitor',
    charger: 'charger',
  };

  function stockCountFor(flagKey) {
    const type = ACCESSORY_STOCK_KEY[flagKey];
    if (!type) return 0;
    return byType?.[type]?.in_stock || 0;
  }

  function toggleAccessory(flagKey, checked) {
    if (checked && !form[flagKey] && stockCountFor(flagKey) < 1) {
      const labels = {
        headphone: 'Headphone',
        mouse: 'Mouse',
        keyboard: 'Keyboard',
        monitor: 'Monitor',
        charger: 'Charger',
      };
      showToast(
        'error',
        `No ${labels[flagKey] || flagKey} in stock. Add some under Inventory first.`
      );
      return;
    }
    setForm((f) => ({ ...f, [flagKey]: checked }));
  }

  const checkRow = (key, label) => {
    const stock = stockCountFor(key);
    return (
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${colors.border.default}`,
          background: isDark ? 'rgba(255,255,255,0.03)' : colors.background.secondary,
          cursor: 'pointer',
          fontSize: 13,
          color: colors.text.primary,
          fontWeight: 600,
        }}
      >
        <input
          type="checkbox"
          checked={!!form[key]}
          onChange={(e) => toggleAccessory(key, e.target.checked)}
          style={{ width: 16, height: 16 }}
        />
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.text.muted }}>
          {form[key] ? 'assigned' : `${stock} in stock`}
        </span>
      </label>
    );
  };

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: '8px 14px',
        borderRadius: 10,
        border: tab === id ? `2px solid ${colors.primary[500]}` : `1px solid ${colors.border.default}`,
        background: tab === id ? `${colors.primary[500]}18` : 'transparent',
        color: colors.text.primary,
        fontWeight: 700,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

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
    <HrPageShell subtitle="IT Assets — inventory & employee equipment" actions={headerActions}>
      <CenterAlert
        isOpen={!!toast.text}
        type={toast.type || 'info'}
        title={toast.title}
        message={toast.text}
        onClose={closeToast}
        autoCloseMs={toast.type === 'error' ? 0 : 2800}
      />

      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmText={confirmState?.confirmText || 'Confirm'}
        cancelText="Cancel"
        variant="danger"
        loading={confirmBusy}
        onClose={() => {
          if (!confirmBusy) setConfirmState(null);
        }}
        onConfirm={confirmState?.onConfirm}
      />

      <GlassCard padding="18px 20px 22px" borderRadius={22} style={{ width: '100%' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {tabBtn('sheet', 'Current employees')}
          {tabBtn('inventory', 'Inventory')}
        </div>

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
            placeholder={
              tab === 'sheet'
                ? 'Search name, emp code, laptop, IP…'
                : 'Search tag, processor, RAM…'
            }
            style={{ ...inputStyle, maxWidth: 300 }}
          />
          <div style={{ flex: 1 }} />
          {tab === 'sheet' && (canCreate || canUpdate) && (
            <button
              type="button"
              onClick={openAssign}
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
              + Assign laptop / PC
            </button>
          )}
          {tab === 'inventory' && canCreate && (
            <button
              type="button"
              onClick={openAddAsset}
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

        {tab === 'sheet' && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: 10,
                marginBottom: 16,
              }}
            >
              {[
                { label: 'Employees', value: stats.total },
                { label: 'With laptop', value: stats.withLaptop },
                { label: 'Mouse', value: stats.withMouse },
                { label: 'Keyboard', value: stats.withKeyboard },
                { label: 'Headphone', value: stats.withHeadphone },
                { label: 'Monitor', value: stats.withMonitor },
              ].map((m) => (
                <div
                  key={m.label}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: isDark ? 'rgba(255,255,255,0.03)' : colors.background.secondary,
                    border: `1px solid ${colors.border.default}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: colors.text.secondary,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {m.label}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: colors.text.primary, marginTop: 4 }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${colors.border.default}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: isDark ? '#1e293b' : 'rgba(59,130,246,0.08)' }}>
                    {[
                      '#',
                      'Name',
                      'Password',
                      'Department',
                      'Laptop',
                      'IP',
                      'Work Location',
                      'Headphone',
                      'Mouse',
                      'Keyboard',
                      'Monitor',
                      'Charger',
                      'Take Home',
                      'Extra Equipment',
                      'Actions',
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '11px 10px',
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
                      <td colSpan={15} style={{ padding: 28, textAlign: 'center', color: colors.text.secondary }}>
                        Loading…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={15} style={{ padding: 28, textAlign: 'center', color: colors.text.secondary }}>
                        No equipment rows yet. Assign a laptop/PC and tick accessories.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr
                        key={row.empCode}
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
                        <td style={{ padding: '10px', color: colors.text.muted }}>{idx + 1}</td>
                        <td style={{ padding: '10px', fontWeight: 700, color: colors.text.primary }}>
                          {row.employeeName || '—'}
                          <div style={{ fontSize: 11, fontWeight: 500, color: colors.text.muted }}>
                            {row.empCode}
                          </div>
                        </td>
                        <td style={{ padding: '10px', fontFamily: 'ui-monospace, monospace', color: colors.text.secondary }}>
                          {row.devicePassword ? '••••••••' : '—'}
                        </td>
                        <td style={{ padding: '10px', color: colors.text.secondary }}>{row.department || '—'}</td>
                        <td style={{ padding: '10px', color: colors.text.primary, maxWidth: 220 }}>{row.laptop || '—'}</td>
                        <td style={{ padding: '10px', fontFamily: 'ui-monospace, monospace', color: colors.text.secondary }}>
                          {row.ip || '—'}
                        </td>
                        <td style={{ padding: '10px', color: colors.text.secondary }}>{row.workLocation || '—'}</td>
                        <td style={{ padding: '10px' }}>
                          <BoolPill value={row.headphone} colors={colors} isDark={isDark} />
                        </td>
                        <td style={{ padding: '10px' }}>
                          <BoolPill value={row.mouse} colors={colors} isDark={isDark} />
                        </td>
                        <td style={{ padding: '10px' }}>
                          <BoolPill value={row.keyboard} colors={colors} isDark={isDark} />
                        </td>
                        <td style={{ padding: '10px' }}>
                          <BoolPill value={row.monitor} colors={colors} isDark={isDark} />
                        </td>
                        <td style={{ padding: '10px' }}>
                          <BoolPill value={row.charger} colors={colors} isDark={isDark} />
                        </td>
                        <td style={{ padding: '10px' }}>
                          <BoolPill
                            value={
                              !!row.takeHomeAllowed ||
                              /take\s*home/i.test(String(row.laptopPermission || ''))
                            }
                            colors={colors}
                            isDark={isDark}
                          />
                        </td>
                        <td style={{ padding: '10px', color: colors.text.secondary, maxWidth: 160 }}>
                          {row.extraEquipment || '—'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {canUpdate && (
                              <button type="button" onClick={() => openEdit(row)} style={glossPill('slate')}>
                                Edit
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" onClick={() => handleDeleteRow(row)} style={glossPill('rose')}>
                                Remove
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
          </>
        )}

        {tab === 'inventory' && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                marginBottom: 16,
              }}
            >
              {[
                { key: 'laptop', label: 'Laptop / PC' },
                { key: 'mouse', label: 'Mouse' },
                { key: 'keyboard', label: 'Keyboard' },
                { key: 'monitor', label: 'Screen / Monitor' },
                { key: 'charger', label: 'Charger' },
                { key: 'headset', label: 'Headphone' },
              ].map((card) => {
                const t = byType[card.key] || { in_stock: 0, assigned: 0, total: 0 };
                const selected = filterType === card.key;
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setFilterType((prev) => (prev === card.key ? '' : card.key))}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 14,
                      border: selected
                        ? `2px solid ${colors.primary[500]}`
                        : `1px solid ${colors.border.default}`,
                      background: selected
                        ? isDark
                          ? `${colors.primary[500]}22`
                          : `${colors.primary[500]}12`
                        : isDark
                          ? 'rgba(255,255,255,0.03)'
                          : colors.background.secondary,
                      cursor: 'pointer',
                      color: colors.text.primary,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: colors.text.secondary,
                        marginBottom: 8,
                      }}
                    >
                      {card.label}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 11, color: colors.text.muted, fontWeight: 600 }}>In stock</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: isDark ? '#86efac' : '#166534' }}>
                          {t.in_stock || 0}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: colors.text.muted, fontWeight: 600 }}>Assigned</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: isDark ? '#7dd3fc' : '#0369a1' }}>
                          {t.assigned || 0}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: colors.text.muted }}>
                      Total {t.total || 0}
                      {selected ? ' · filtered' : ' · click to filter'}
                    </div>
                  </button>
                );
              })}
            </div>

            {filterType ? (
              <div style={{ marginBottom: 12, fontSize: 12, color: colors.text.secondary }}>
                Showing: <strong>{typeLabel(filterType)}</strong>{' '}
                <button
                  type="button"
                  onClick={() => setFilterType('')}
                  style={{
                    marginLeft: 8,
                    border: 'none',
                    background: 'transparent',
                    color: colors.primary[400] || colors.primary[500],
                    cursor: 'pointer',
                    fontWeight: 700,
                    textDecoration: 'underline',
                  }}
                >
                  Clear filter
                </button>
              </div>
            ) : null}

          <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${colors.border.default}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr style={{ background: isDark ? '#1e293b' : 'rgba(59,130,246,0.08)' }}>
                  {['Tag', 'Type', 'Brand', 'Processor', 'RAM', 'ROM', 'Status', 'Notes', 'Actions'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '11px 12px',
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
                    <td colSpan={9} style={{ padding: 28, textAlign: 'center', color: colors.text.secondary }}>
                      Loading inventory…
                    </td>
                  </tr>
                ) : inventory.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 28, textAlign: 'center', color: colors.text.secondary }}>
                      No inventory yet. Add laptops (with brand + specs) or bulk mouse / keyboard / charger.
                    </td>
                  </tr>
                ) : (
                  inventory.map((asset, idx) => {
                    const compute = isComputeType(asset.type);
                    return (
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
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: colors.text.primary }}>
                          {asset.assetTag}
                        </td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>
                          {typeLabel(asset.type)}
                        </td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>
                          {asset.brand || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>
                          {compute ? asset.processor || '—' : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>
                          {compute ? asset.ram || '—' : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>
                          {compute ? asset.rom || '—' : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>
                          {asset.status}
                          {asset.assignedToEmpCode ? ` → ${asset.assignedToEmpCode}` : ''}
                        </td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>
                          {asset.notes || '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {canDelete && asset.status !== 'assigned' && (
                            <button type="button" onClick={() => handleDeleteAsset(asset)} style={glossPill('rose')}>
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </GlassCard>

      {/* Add inventory asset — fields change by type */}
      {modal === 'addAsset' && (
        <div style={modalOverlay} onClick={closeModal}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', color: colors.text.primary, fontSize: 17 }}>Add asset</h3>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: colors.text.secondary }}>
              Laptop/PC/Monitor need brand. Mouse, keyboard &amp; charger support bulk quantity.
            </p>
            <form onSubmit={handleSaveInventory} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Asset type *</label>
                <select
                  value={invForm.type}
                  onChange={(e) => onInvTypeChange(e.target.value)}
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
                <label style={labelStyle}>Asset tag *</label>
                <input
                  required
                  value={invForm.assetTag}
                  onChange={(e) => setInvForm((f) => ({ ...f, assetTag: e.target.value }))}
                  placeholder={
                    showBulkField
                      ? 'e.g. MOU (bulk becomes MOU-01, MOU-02…)'
                      : showComputeFields
                        ? 'e.g. LAP-0042'
                        : 'e.g. MON-001'
                  }
                  style={inputStyle}
                />
              </div>

              {showBrandField && (
                <div>
                  <label style={labelStyle}>
                    Brand name{wantsBrand(invForm.type) ? ' *' : ' (optional)'}
                  </label>
                  <input
                    required={wantsBrand(invForm.type)}
                    value={invForm.brand}
                    onChange={(e) => setInvForm((f) => ({ ...f, brand: e.target.value }))}
                    placeholder={
                      invForm.type === 'monitor'
                        ? 'e.g. Dell, LG, Samsung'
                        : showBulkField
                          ? 'e.g. Logitech, HP'
                          : 'e.g. Dell, HP, Lenovo, Toshiba'
                    }
                    style={inputStyle}
                  />
                </div>
              )}

              {showBulkField && (
                <div>
                  <label style={labelStyle}>Quantity (bulk) *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={invForm.quantity}
                    onChange={(e) =>
                      setInvForm((f) => ({
                        ...f,
                        quantity: Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)),
                      }))
                    }
                    style={inputStyle}
                  />
                  <div style={{ marginTop: 6, fontSize: 11, color: colors.text.muted }}>
                    Adds multiple in-stock items at once (max 100).
                  </div>
                </div>
              )}

              {showComputeFields ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Processor</label>
                    <input
                      value={invForm.processor}
                      onChange={(e) => setInvForm((f) => ({ ...f, processor: e.target.value }))}
                      placeholder="e.g. i5 6th gen"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>RAM</label>
                      <input
                        value={invForm.ram}
                        onChange={(e) => setInvForm((f) => ({ ...f, ram: e.target.value }))}
                        placeholder="e.g. 8GB"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>ROM</label>
                      <input
                        value={invForm.rom}
                        onChange={(e) => setInvForm((f) => ({ ...f, rom: e.target.value }))}
                        placeholder="e.g. 128GB SSD"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              ) : !showBulkField ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: isDark ? 'rgba(14,165,233,0.1)' : '#e0f2fe',
                    color: colors.text.secondary,
                    fontSize: 12,
                  }}
                >
                  {typeLabel(invForm.type)} uses tag
                  {showBrandField ? ' + brand' : ''} and optional notes.
                </div>
              ) : null}

              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <input
                  value={invForm.notes}
                  onChange={(e) => setInvForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional extra detail"
                  style={inputStyle}
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
                  {saving
                    ? 'Saving…'
                    : showBulkField && Number(invForm.quantity) > 1
                      ? `Add ${invForm.quantity} to inventory`
                      : 'Add to inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign / edit employee equipment */}
      {(modal === 'assign' || modal === 'edit') && (
        <div style={modalOverlay} onClick={closeModal}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', color: colors.text.primary, fontSize: 17 }}>
              {modal === 'assign' ? 'Assign laptop / PC + accessories' : `Edit — ${selectedEmpLabel}`}
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: colors.text.secondary }}>
              Pick a laptop/PC from inventory, then tick accessories separately.
            </p>

            <form onSubmit={handleSaveEquip} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {modal === 'assign' && (
                <div>
                  <label style={labelStyle}>Employee *</label>
                  <input
                    value={empSearch || selectedEmpLabel}
                    onChange={(e) => {
                      setSelectedEmpLabel('');
                      searchEmployees(e.target.value);
                    }}
                    placeholder="Search name or emp code…"
                    style={inputStyle}
                  />
                  {employeeHits.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        borderRadius: 10,
                        border: `1px solid ${colors.border.default}`,
                        maxHeight: 150,
                        overflowY: 'auto',
                      }}
                    >
                      {employeeHits.map((emp) => (
                        <button
                          key={emp.empCode}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, empCode: emp.empCode }));
                            setSelectedEmpLabel(`${emp.name || ''} (${emp.empCode})`);
                            setEmpSearch('');
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
                          <span style={{ color: colors.text.muted }}>
                            {' '}
                            · {emp.empCode}
                            {emp.department ? ` · ${emp.department}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.empCode && (
                    <div style={{ marginTop: 6, fontSize: 12, color: colors.success }}>
                      Selected: {selectedEmpLabel || form.empCode}
                    </div>
                  )}
                </div>
              )}

              {modal === 'assign' ? (
                <div>
                  <label style={labelStyle}>Laptop / PC from inventory *</label>
                  {stockAssets.length === 0 ? (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: `1px solid ${colors.border.default}`,
                        background: isDark ? 'rgba(245,158,11,0.12)' : '#fffbeb',
                        color: colors.text.secondary,
                        fontSize: 13,
                      }}
                    >
                      No laptop/PC in stock.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setModal(null);
                          setTab('inventory');
                          setTimeout(() => openAddAsset(), 0);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: colors.primary[400] || colors.primary[500],
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                      >
                        Add one in Inventory first
                      </button>
                      .
                    </div>
                  ) : (
                    <select
                      required
                      value={form.laptopAssetId}
                      onChange={(e) => onPickStockAsset(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">— Select laptop / PC —</option>
                      {stockAssets.map((a) => (
                        <option key={a._id} value={a._id}>
                          {formatAssetLabel(a)}
                        </option>
                      ))}
                    </select>
                  )}
                  {form.laptopAssetId && form.laptop ? (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: colors.text.secondary,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: isDark ? 'rgba(255,255,255,0.04)' : colors.background.secondary,
                      }}
                    >
                      Selected: <strong style={{ color: colors.text.primary }}>{form.laptop}</strong>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Laptop / PC</label>
                  <input value={form.laptop} readOnly style={{ ...inputStyle, opacity: 0.85 }} />
                  <div style={{ marginTop: 6, fontSize: 11, color: colors.text.muted }}>
                    Laptop comes from inventory — change accessories below only.
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Device password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.devicePassword}
                      onChange={(e) => setForm((f) => ({ ...f, devicePassword: e.target.value }))}
                      placeholder="e.g. GDS11.01"
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: colors.text.muted,
                      }}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>IP</label>
                  <input
                    value={form.ip}
                    onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
                    placeholder="e.g. 192.168.1.45"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Work location</label>
                  <select
                    value={form.workLocation}
                    onChange={(e) => setForm((f) => ({ ...f, workLocation: e.target.value }))}
                    style={inputStyle}
                  >
                    {WORK_LOCATIONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${colors.border.default}`,
                      background: isDark ? 'rgba(255,255,255,0.03)' : colors.background.secondary,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: colors.text.primary,
                      fontWeight: 600,
                      boxSizing: 'border-box',
                      minHeight: 42,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!form.takeHomeAllowed}
                      onChange={(e) => setForm((f) => ({ ...f, takeHomeAllowed: e.target.checked }))}
                      style={{ width: 16, height: 16 }}
                    />
                    Take laptop home
                  </label>
                </div>
              </div>
              <div style={{ fontSize: 11, color: colors.text.muted, marginTop: -4 }}>
                Turn on if this employee is allowed to take the company laptop home.
              </div>

              <div>
                <div style={{ ...labelStyle, marginBottom: 8 }}>
                  Accessories (checks inventory stock)
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 8,
                  }}
                >
                  {checkRow('headphone', 'Headphone')}
                  {checkRow('mouse', 'Mouse')}
                  {checkRow('keyboard', 'Keyboard')}
                  {checkRow('monitor', 'Monitor')}
                  {checkRow('charger', 'Charger')}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Extra equipment (other)</label>
                <input
                  value={form.extraEquipment}
                  onChange={(e) => setForm((f) => ({ ...f, extraEquipment: e.target.value }))}
                  placeholder="e.g. Dock, webcam, speakers…"
                  style={inputStyle}
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
                  {saving ? 'Saving…' : modal === 'assign' ? 'Save assignment' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HrPageShell>
  );
}

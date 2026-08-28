'use client';

/**
 * HR break create/edit form modal.
 */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

function toPakistanDateTimeLocal(isoOrDate) {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

const emptyForm = () => ({
  id: null,
  empCode: '',
  breakTypeId: '',
  breakStartTime: '',
  breakEndTime: '',
  status: 'Closed',
  comment: '',
  shiftId: '',
});

export function BreakFormModal({
  open,
  mode = 'create', // create | edit
  initial = null,
  breakTypes = [],
  colors,
  isDark,
  inputStyle,
  onClose,
  onSaved,
  showToast,
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initial) {
      setForm({
        id: initial.id,
        empCode: initial.empCode || '',
        breakTypeId: initial.breakTypeId || '',
        breakStartTime: toPakistanDateTimeLocal(initial.breakStartTime),
        breakEndTime: initial.breakEndTime ? toPakistanDateTimeLocal(initial.breakEndTime) : '',
        status: initial.isOpen ? 'Open' : initial.status || 'Closed',
        comment: initial.comment || '',
        shiftId: initial.shiftId || '',
      });
    } else {
      const base = emptyForm();
      if (initial?.empCode) base.empCode = initial.empCode;
      if (initial?.shiftId) base.shiftId = initial.shiftId;
      if (breakTypes[0]?.id) base.breakTypeId = breakTypes[0].id;
      setForm(base);
    }
  }, [open, mode, initial, breakTypes]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.empCode.trim()) {
      showToast('error', 'Employee code is required');
      return;
    }
    if (!form.breakTypeId) {
      showToast('error', 'Break type is required');
      return;
    }
    if (!form.breakStartTime) {
      showToast('error', 'Start time is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        empCode: form.empCode.trim(),
        breakTypeId: form.breakTypeId,
        breakStartTime: form.breakStartTime,
        breakEndTime: form.status === 'Open' || !form.breakEndTime ? null : form.breakEndTime,
        status: form.status,
        comment: form.comment,
        shiftId: form.shiftId || undefined,
      };

      const data =
        mode === 'edit' && form.id
          ? await api.patch(`/api/hr/breaks/${form.id}`, payload)
          : await api.post('/api/hr/breaks', payload);

      if (data.success) {
        showToast('success', mode === 'edit' ? 'Break updated' : 'Break created');
        onSaved?.();
        onClose?.();
      } else {
        showToast('error', data.error || data.message || 'Save failed');
      }
    } catch (_) {
      showToast('error', 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: colors.text.secondary,
    marginBottom: 6,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: isDark ? 'rgba(2,6,23,0.8)' : 'rgba(15,23,42,0.5)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: 'min(480px, 100%)',
          background: colors.background?.card || colors.glass.panelBg,
          borderRadius: 16,
          border: `1px solid ${colors.glass.border}`,
          padding: 22,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', color: colors.text.primary, fontSize: 18 }}>
          {mode === 'edit' ? 'Edit break' : 'Add break'}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: colors.text.secondary }}>
          Times are Pakistan (+05:00). Leave end empty and Status = Open for an ongoing break.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={labelStyle}>Employee code</div>
            <input
              value={form.empCode}
              onChange={(e) => setForm((f) => ({ ...f, empCode: e.target.value }))}
              style={inputStyle}
              required
              disabled={mode === 'edit'}
            />
          </div>
          <div>
            <div style={labelStyle}>Break type</div>
            <select
              value={form.breakTypeId}
              onChange={(e) => setForm((f) => ({ ...f, breakTypeId: e.target.value }))}
              style={inputStyle}
              required
            >
              <option value="">Select type</option>
              {breakTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Start (PKT)</div>
            <input
              type="datetime-local"
              value={form.breakStartTime}
              onChange={(e) => setForm((f) => ({ ...f, breakStartTime: e.target.value }))}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <div style={labelStyle}>End (PKT)</div>
            <input
              type="datetime-local"
              value={form.breakEndTime}
              onChange={(e) => setForm((f) => ({ ...f, breakEndTime: e.target.value }))}
              style={inputStyle}
              disabled={form.status === 'Open'}
            />
          </div>
          <div>
            <div style={labelStyle}>Status</div>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value,
                  breakEndTime: e.target.value === 'Open' ? '' : f.breakEndTime,
                }))
              }
              style={inputStyle}
            >
              <option value="Closed">Closed</option>
              <option value="Open">Open</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>Comment</div>
            <input
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              style={inputStyle}
              placeholder="Optional"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: `1px solid ${colors.glass.border}`,
              background: 'transparent',
              color: colors.text.primary,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: `linear-gradient(135deg, ${colors.primary[700]}, ${colors.primary[500]})`,
              color: '#fff',
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create break'}
          </button>
        </div>
      </form>
    </div>
  );
}

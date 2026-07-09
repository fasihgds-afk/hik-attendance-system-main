'use client';

import { useMemo, useState } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';
import {
  PERMISSION_MODULES,
  PRESET_LIST,
  PERMISSION_PRESETS,
  createFullPermissions,
  normalizePermissions,
} from '@/lib/auth/permissionClient';

const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  export: 'Export',
};

const ACTION_HINTS = {
  view: 'Open page & read data',
  create: 'Add new records',
  update: 'Edit existing data',
  delete: 'Remove / archive',
  export: 'Download / export',
};

/**
 * Shared register / edit-permissions form.
 * layout: 'page' (full-width friendly) | 'compact'
 */
export default function RegisterUserForm({
  mode = 'create',
  layout = 'page',
  initialEmail = '',
  initialRole = 'HR',
  initialEmpCode = '',
  initialPermissions = null,
  initialPresetId = 'full_access',
  initialIsActive = true,
  submitLabel,
  onCancel,
  onSuccess,
  userId = null,
}) {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const isEdit = mode === 'edit';
  const isPage = layout === 'page';

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [role, setRole] = useState(initialRole);
  const [empCode, setEmpCode] = useState(initialEmpCode);
  const [presetId, setPresetId] = useState(initialPresetId);
  const [permissions, setPermissions] = useState(() =>
    initialPermissions
      ? normalizePermissions(initialPermissions)
      : createFullPermissions()
  );
  const [showAdvanced, setShowAdvanced] = useState(
    isEdit || initialPresetId === 'custom' || !!initialPermissions
  );
  const [isActive, setIsActive] = useState(initialIsActive !== false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const inputStyle = useMemo(
    () => ({
      padding: '11px 14px',
      borderRadius: 10,
      border: `1px solid ${colors.border.input}`,
      backgroundColor: colors.background.input,
      color: colors.text.primary,
      fontSize: 13,
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }),
    [colors]
  );

  const focusHandlers = {
    onFocus: (e) => {
      e.currentTarget.style.borderColor = colors.primary[500];
      e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}25`;
    },
    onBlur: (e) => {
      e.currentTarget.style.borderColor = colors.border.input;
      e.currentTarget.style.boxShadow = 'none';
    },
  };

  const labelStyle = {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: 700,
    letterSpacing: '0.02em',
  };

  function applyPreset(id) {
    setPresetId(id);
    const preset = PERMISSION_PRESETS[id];
    if (preset) {
      setPermissions(normalizePermissions(preset.build()));
      setShowAdvanced(true);
    }
  }

  function toggleAction(moduleKey, action, checked) {
    setPresetId('custom');
    setPermissions((prev) => {
      const next = normalizePermissions(prev);
      const modDef = PERMISSION_MODULES.find((m) => m.key === moduleKey);
      if (!modDef) return prev;

      if (action === 'view' && !checked) {
        next[moduleKey] = Object.fromEntries(modDef.actions.map((a) => [a, false]));
        return next;
      }

      next[moduleKey] = { ...next[moduleKey], [action]: checked };
      if (action !== 'view' && checked) {
        next[moduleKey].view = true;
      }
      return next;
    });
  }

  function setModuleAll(moduleKey, enabled) {
    setPresetId('custom');
    setPermissions((prev) => {
      const next = normalizePermissions(prev);
      const modDef = PERMISSION_MODULES.find((m) => m.key === moduleKey);
      if (!modDef) return prev;
      next[moduleKey] = Object.fromEntries(modDef.actions.map((a) => [a, enabled]));
      return next;
    });
  }

  function resetForm() {
    setEmail('');
    setPassword('');
    setPassword2('');
    setEmpCode('');
    setRole('HR');
    setPresetId('full_access');
    setPermissions(createFullPermissions());
    setShowAdvanced(true);
    setErrorMsg('');
    setSuccessMsg('');
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!isEdit) {
      if (password !== password2) {
        setErrorMsg('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters');
        return;
      }
      if (role === 'EMPLOYEE' && !empCode.trim()) {
        setErrorMsg('Employee code is required for EMPLOYEE role');
        return;
      }
    }

    setLoading(true);
    try {
      if (isEdit) {
        const body = {
          userId,
          permissions:
            role === 'HR' || role === 'ADMIN'
              ? normalizePermissions(permissions)
              : undefined,
          isActive,
          permissionPreset: presetId,
        };
        if (password) {
          if (password.length < 8) {
            setErrorMsg('Password must be at least 8 characters');
            setLoading(false);
            return;
          }
          if (password !== password2) {
            setErrorMsg('Passwords do not match');
            setLoading(false);
            return;
          }
          body.password = password;
        }

        const res = await fetch('/api/hr/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          let errorMessage = data.error || 'Failed to update user';
          const details = data.details || data.meta?.details;
          if (Array.isArray(details) && details.length > 0) {
            const first = details[0];
            errorMessage = `${errorMessage}: ${first.field ? `${first.field}: ` : ''}${first.message || ''}`;
          }
          setErrorMsg(errorMessage);
          return;
        }
        setSuccessMsg(
          'Saved. Ask this user to log out and log in again so new permissions apply.'
        );
        if (onSuccess) onSuccess(data);
        return;
      }

      const requestBody = {
        email: email.trim(),
        password,
        role,
      };
      if (role === 'EMPLOYEE' && empCode.trim()) {
        requestBody.empCode = empCode.trim();
      }
      if (role === 'HR') {
        requestBody.permissions = normalizePermissions(permissions);
        requestBody.permissionPreset = presetId;
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) {
        let errorMessage = data.error || 'Registration failed';
        if (data.details && Array.isArray(data.details) && data.details.length > 0) {
          const firstError = data.details[0];
          errorMessage = `${errorMessage}: ${firstError.field ? `${firstError.field}: ` : ''}${firstError.message || ''}`;
        }
        setErrorMsg(errorMessage);
        return;
      }

      setSuccessMsg('User registered successfully!');
      resetForm();
      if (onSuccess) onSuccess(data);
    } catch (err) {
      console.error(err);
      setErrorMsg(
        isEdit ? 'Network error while updating user' : 'Network error while registering user'
      );
    } finally {
      setLoading(false);
    }
  };

  const showPermissions = (role === 'HR' || role === 'ADMIN' || isEdit) && role !== 'EMPLOYEE';

  const accountFields = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!isEdit && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>
              Email <span style={{ color: colors.error }}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@company.com"
              style={inputStyle}
              {...focusHandlers}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>
              Role <span style={{ color: colors.error }}>*</span>
            </label>
            <select
              value={role}
              onChange={(e) => {
                const next = e.target.value;
                setRole(next);
                if (next === 'HR') {
                  setEmpCode('');
                  applyPreset('full_access');
                }
              }}
              style={{ ...inputStyle, cursor: 'pointer' }}
              {...focusHandlers}
            >
              <option value="HR">HR (module permissions)</option>
              <option value="EMPLOYEE">Employee (self-service)</option>
            </select>
          </div>

          {role === 'EMPLOYEE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>
                Employee Code <span style={{ color: colors.error }}>*</span>
              </label>
              <input
                value={empCode}
                onChange={(e) => setEmpCode(e.target.value)}
                placeholder="e.g. 00082"
                style={inputStyle}
                {...focusHandlers}
              />
            </div>
          )}
        </>
      )}

      {isEdit && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: colors.text.primary,
            cursor: 'pointer',
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${colors.border.default}`,
            background: isDark ? 'rgba(255,255,255,0.03)' : colors.background.secondary,
          }}
        >
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span>
            <strong>Account active</strong>
            <span style={{ display: 'block', fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
              Inactive users cannot log in
            </span>
          </span>
        </label>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={labelStyle}>
          {isEdit ? 'New password (optional)' : (
            <>
              Password <span style={{ color: colors.error }}>*</span>
            </>
          )}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isEdit}
            placeholder={isEdit ? 'Leave blank to keep current' : 'Minimum 8 characters'}
            style={{ ...inputStyle, paddingRight: 44 }}
            {...focusHandlers}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: colors.text.muted,
              fontSize: 16,
              padding: 4,
            }}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={labelStyle}>
          {isEdit ? 'Confirm new password' : (
            <>
              Confirm password <span style={{ color: colors.error }}>*</span>
            </>
          )}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword2 ? 'text' : 'password'}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required={!isEdit}
            placeholder={isEdit ? 'Re-enter if changing' : 'Re-enter password'}
            style={{ ...inputStyle, paddingRight: 44 }}
            {...focusHandlers}
          />
          <button
            type="button"
            onClick={() => setShowPassword2(!showPassword2)}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: colors.text.muted,
              fontSize: 16,
              padding: 4,
            }}
          >
            {showPassword2 ? '🙈' : '👁️'}
          </button>
        </div>
      </div>
    </div>
  );

  const permissionsPanel = showPermissions && (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: isPage ? 0 : 14,
        borderRadius: isPage ? 0 : 12,
        border: isPage ? 'none' : `1px solid ${colors.border.default}`,
        background: isPage
          ? 'transparent'
          : isDark
            ? 'rgba(255,255,255,0.03)'
            : colors.background.secondary,
      }}
    >
      <div>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Permission preset</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPage
              ? 'repeat(auto-fill, minmax(180px, 1fr))'
              : '1fr',
            gap: 8,
          }}
        >
          {PRESET_LIST.map((p) => {
            const selected = presetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                style={{
                  textAlign: 'left',
                  padding: '12px 13px',
                  borderRadius: 12,
                  border: selected
                    ? `2px solid ${colors.primary[500]}`
                    : `1px solid ${colors.border.default}`,
                  background: selected
                    ? isDark
                      ? `${colors.primary[500]}22`
                      : `${colors.primary[500]}12`
                    : isDark
                      ? 'rgba(255,255,255,0.03)'
                      : colors.background.card,
                  cursor: 'pointer',
                  color: colors.text.primary,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 750 }}>{p.label}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: colors.text.muted,
                    marginTop: 4,
                    lineHeight: 1.35,
                  }}
                >
                  {p.description}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setPresetId('custom');
              setShowAdvanced(true);
            }}
            style={{
              textAlign: 'left',
              padding: '12px 13px',
              borderRadius: 12,
              border:
                presetId === 'custom'
                  ? `2px solid ${colors.primary[500]}`
                  : `1px solid ${colors.border.default}`,
              background:
                presetId === 'custom'
                  ? isDark
                    ? `${colors.primary[500]}22`
                    : `${colors.primary[500]}12`
                  : isDark
                    ? 'rgba(255,255,255,0.03)'
                    : colors.background.card,
              cursor: 'pointer',
              color: colors.text.primary,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 750 }}>Custom</div>
            <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>
              Edit each module manually
            </div>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: `1px solid ${colors.border.default}`,
            background: 'transparent',
            color: colors.text.secondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {showAdvanced ? 'Hide module matrix' : 'Show module matrix'}
        </button>
        {showAdvanced && (
          <span style={{ fontSize: 11, color: colors.text.muted }}>
            Tip: turn off View to clear the whole row
          </span>
        )}
      </div>

      {showAdvanced && (
        <div
          style={{
            overflowX: 'auto',
            borderRadius: 12,
            border: `1px solid ${colors.border.default}`,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              minWidth: 640,
            }}
          >
            <thead>
              <tr
                style={{
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                }}
              >
                <th
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    color: colors.text.secondary,
                    borderBottom: `1px solid ${colors.border.default}`,
                    position: 'sticky',
                    left: 0,
                    background: isDark ? '#0f172a' : '#f8fafc',
                    zIndex: 1,
                  }}
                >
                  Module
                </th>
                {['view', 'create', 'update', 'delete', 'export'].map((action) => (
                  <th
                    key={action}
                    title={ACTION_HINTS[action]}
                    style={{
                      textAlign: 'center',
                      padding: '12px 8px',
                      color: colors.text.secondary,
                      borderBottom: `1px solid ${colors.border.default}`,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ACTION_LABELS[action]}
                  </th>
                ))}
                <th
                  style={{
                    textAlign: 'center',
                    padding: '12px 10px',
                    color: colors.text.secondary,
                    borderBottom: `1px solid ${colors.border.default}`,
                    fontWeight: 700,
                  }}
                >
                  All
                </th>
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map((mod, idx) => {
                const allOn = mod.actions.every((a) => permissions?.[mod.key]?.[a]);
                return (
                  <tr
                    key={mod.key}
                    style={{
                      background:
                        idx % 2 === 0
                          ? 'transparent'
                          : isDark
                            ? 'rgba(255,255,255,0.02)'
                            : 'rgba(15,23,42,0.02)',
                    }}
                  >
                    <td
                      style={{
                        padding: '11px 14px',
                        color: colors.text.primary,
                        borderBottom: `1px solid ${colors.border.default}40`,
                        fontWeight: 600,
                        position: 'sticky',
                        left: 0,
                        background: isDark
                          ? idx % 2 === 0
                            ? '#0b1220'
                            : '#0d1524'
                          : idx % 2 === 0
                            ? '#fff'
                            : '#f8fafc',
                        zIndex: 1,
                      }}
                    >
                      {mod.label}
                    </td>
                    {['view', 'create', 'update', 'delete', 'export'].map((action) => {
                      const supported = mod.actions.includes(action);
                      const checked = supported && !!permissions?.[mod.key]?.[action];
                      return (
                        <td
                          key={action}
                          style={{
                            textAlign: 'center',
                            padding: '11px 8px',
                            borderBottom: `1px solid ${colors.border.default}40`,
                          }}
                        >
                          {supported ? (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                toggleAction(mod.key, action, e.target.checked)
                              }
                              aria-label={`${mod.label} ${action}`}
                              style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                          ) : (
                            <span style={{ color: colors.text.muted }}>—</span>
                          )}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        textAlign: 'center',
                        padding: '11px 10px',
                        borderBottom: `1px solid ${colors.border.default}40`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setModuleAll(mod.key, !allOn)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 8,
                          border: `1px solid ${colors.border.default}`,
                          background: 'transparent',
                          color: colors.text.secondary,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {allOn ? 'Clear' : 'All'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {errorMsg && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : `${colors.error}14`,
            border: `1px solid ${colors.error}40`,
            color: colors.error,
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: isDark ? 'rgba(22,163,74,0.12)' : `${colors.success}14`,
            border: `1px solid ${colors.success}40`,
            color: colors.success,
            fontSize: 13,
          }}
        >
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              isPage && showPermissions
                ? 'minmax(280px, 360px) minmax(0, 1fr)'
                : '1fr',
            gap: 22,
            alignItems: 'start',
          }}
        >
          <div
            style={{
              padding: isPage ? 18 : 0,
              borderRadius: isPage ? 14 : 0,
              border: isPage ? `1px solid ${colors.border.default}` : 'none',
              background: isPage
                ? isDark
                  ? 'rgba(255,255,255,0.02)'
                  : colors.background.secondary
                : 'transparent',
            }}
          >
            <h3
              style={{
                margin: '0 0 14px',
                fontSize: 14,
                fontWeight: 750,
                color: colors.text.primary,
              }}
            >
              {isEdit ? 'Account' : 'Account details'}
            </h3>
            {accountFields}
          </div>

          {showPermissions && (
            <div
              style={{
                padding: isPage ? 18 : 0,
                borderRadius: isPage ? 14 : 0,
                border: isPage ? `1px solid ${colors.border.default}` : 'none',
                background: isPage
                  ? isDark
                    ? 'rgba(255,255,255,0.02)'
                    : colors.background.secondary
                  : 'transparent',
                minWidth: 0,
              }}
            >
              <h3
                style={{
                  margin: '0 0 14px',
                  fontSize: 14,
                  fontWeight: 750,
                  color: colors.text.primary,
                }}
              >
                Module access
              </h3>
              {permissionsPanel}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
            marginTop: 22,
            paddingTop: 16,
            borderTop: `1px solid ${colors.border.default}`,
            flexWrap: 'wrap',
          }}
        >
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                padding: '11px 20px',
                borderRadius: 10,
                border: `1px solid ${colors.border.default}`,
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '11px 22px',
              borderRadius: 10,
              border: 'none',
              background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.success})`,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              boxShadow: `0 8px 20px ${colors.primary[500]}40`,
              minWidth: 160,
            }}
          >
            {loading
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : submitLabel || (isEdit ? 'Save permissions' : 'Create user')}
          </button>
        </div>
      </form>
    </div>
  );
}

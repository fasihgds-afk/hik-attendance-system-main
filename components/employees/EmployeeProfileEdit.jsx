'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';
import EmployeeAvatar from './EmployeeAvatar';

/**
 * Employee Profile Edit Form
 * Allows employees to edit their own profile: Name, Picture, Phone, Email
 */
export default function EmployeeProfileEdit({ employee, onSave, onCancel, loading }) {
  const { colors, theme } = useTheme();
  
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    email: '',
    bankDetails: {
      bankName: '',
      accountTitle: '',
      accountNumber: '',
      iban: '',
    },
    profileImageBase64: null,
    profileImageUrl: null,
  });
  
  const [imagePreview, setImagePreview] = useState(null);
  const [errors, setErrors] = useState({});

  // Initialize form data when employee changes
  useEffect(() => {
    if (employee) {
      setFormData({
        name: employee.name || '',
        phoneNumber: employee.phoneNumber || '',
        email: employee.email || '',
        bankDetails: {
          bankName: employee?.bankDetails?.bankName || '',
          accountTitle: employee?.bankDetails?.accountTitle || '',
          accountNumber: employee?.bankDetails?.accountNumber || '',
          iban: employee?.bankDetails?.iban || '',
        },
        profileImageBase64: employee.profileImageBase64 || null,
        profileImageUrl: employee.profileImageUrl || null,
      });
      setImagePreview(
        employee.profileImageBase64 
          ? `data:image/jpeg;base64,${employee.profileImageBase64}` 
          : employee.profileImageUrl || null
      );
    }
  }, [employee]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({
        ...prev,
        image: 'Please select a valid image file'
      }));
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setErrors(prev => ({
        ...prev,
        image: 'Image size must be less than 2MB'
      }));
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1]; // Remove data:image/...;base64, prefix
      setFormData(prev => ({
        ...prev,
        profileImageBase64: base64String,
        profileImageUrl: null, // Clear URL if base64 is set
      }));
      setImagePreview(reader.result);
      if (errors.image) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.image;
          return newErrors;
        });
      }
    };
    reader.onerror = () => {
      setErrors(prev => ({
        ...prev,
        image: 'Failed to read image file'
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({
      ...prev,
      profileImageBase64: null,
      profileImageUrl: null,
    }));
    setImagePreview(null);
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name || formData.name.trim().length === 0) {
      newErrors.name = 'Name is required';
    }
    
    if (formData.email && formData.email.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
    }
    
    if (formData.phoneNumber && formData.phoneNumber.trim().length > 0) {
      // Basic phone validation (allow numbers, spaces, dashes, plus)
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      if (!phoneRegex.test(formData.phoneNumber)) {
        newErrors.phoneNumber = 'Please enter a valid phone number';
      }
    }

    const iban = formData?.bankDetails?.iban?.trim() || '';
    if (iban.length > 0) {
      const normalizedIban = iban.replace(/\s+/g, '').toUpperCase();
      const ibanRegex = /^[A-Z]{2}[A-Z0-9]{13,32}$/;
      if (!ibanRegex.test(normalizedIban)) {
        newErrors.iban = 'Please enter a valid IBAN';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // Call parent's onSave handler
    onSave({
      ...formData,
      name: formData.name.trim(),
      email: formData.email.trim() || undefined,
      phoneNumber: formData.phoneNumber.trim() || undefined,
      bankDetails: {
        bankName: formData?.bankDetails?.bankName?.trim() || '',
        accountTitle: formData?.bankDetails?.accountTitle?.trim() || '',
        accountNumber: formData?.bankDetails?.accountNumber?.trim() || '',
        iban: formData?.bankDetails?.iban?.replace(/\s+/g, '').toUpperCase() || '',
      },
    });
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.border.input}`,
    backgroundColor: colors.background.input,
    color: colors.text.primary,
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: colors.text.primary,
    marginBottom: 6,
  };

  const errorStyle = {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{
        backgroundColor: colors.background.card,
        borderRadius: 16,
        padding: 24,
        border: `1px solid ${colors.border.default}`,
      }}>
        {/* Form Header */}
        <div style={{
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: `1px solid ${colors.border.default}`,
        }}>
          <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            color: colors.text.primary,
            margin: 0,
          }}>
            Edit Profile
          </h2>
          <p style={{
            fontSize: 13,
            color: colors.text.secondary,
            marginTop: 4,
            margin: 0,
          }}>
            Update your personal and bank information
          </p>
        </div>

        {/* Image Upload Section */}
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <label style={labelStyle}>Profile Picture</label>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              position: 'relative',
              display: 'inline-block',
            }}>
              <EmployeeAvatar
                employee={{
                  ...employee,
                  profileImageBase64: formData.profileImageBase64,
                  profileImageUrl: imagePreview?.startsWith('data:') ? null : imagePreview,
                }}
                size={120}
                showBorder
              />
              {imagePreview && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: `2px solid ${colors.background.card}`,
                    backgroundColor: colors.error,
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    boxShadow: `0 2px 8px ${colors.error}40`,
                  }}
                  title="Remove image"
                >
                  ×
                </button>
              )}
            </div>
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: 'none' }}
                id="profile-image-upload"
              />
              <label
                htmlFor="profile-image-upload"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: `1px solid ${colors.primary[500]}`,
                  backgroundColor: colors.primary[500],
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.primary[600];
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.primary[500];
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {imagePreview ? 'Change Picture' : 'Upload Picture'}
              </label>
            </div>
            {errors.image && <div style={errorStyle}>{errors.image}</div>}
          </div>
        </div>

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Name Field */}
          <div>
            <label style={labelStyle}>
              Full Name <span style={{ color: colors.error }}>*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter your full name"
              required
              style={{
                ...inputStyle,
                borderColor: errors.name ? colors.error : colors.border.input,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[100]}40`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = errors.name ? colors.error : colors.border.input;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {errors.name && <div style={errorStyle}>{errors.name}</div>}
          </div>

          {/* Email Field */}
          <div>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="your.email@example.com"
              style={{
                ...inputStyle,
                borderColor: errors.email ? colors.error : colors.border.input,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[100]}40`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = errors.email ? colors.error : colors.border.input;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {errors.email && <div style={errorStyle}>{errors.email}</div>}
          </div>

          {/* Phone Number Field */}
          <div>
            <label style={labelStyle}>Phone Number</label>
            <input
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
              placeholder="+92 300 1234567"
              style={{
                ...inputStyle,
                borderColor: errors.phoneNumber ? colors.error : colors.border.input,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[100]}40`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = errors.phoneNumber ? colors.error : colors.border.input;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {errors.phoneNumber && <div style={errorStyle}>{errors.phoneNumber}</div>}
          </div>

          {/* Bank Details */}
          <div style={{ paddingTop: 6 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.text.primary,
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.7,
              }}
            >
              Bank Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Bank Name</label>
                <input
                  type="text"
                  value={formData?.bankDetails?.bankName || ''}
                  onChange={(e) => handleInputChange('bankDetails', { ...(formData.bankDetails || {}), bankName: e.target.value })}
                  placeholder="e.g. HBL"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Account Title</label>
                <input
                  type="text"
                  value={formData?.bankDetails?.accountTitle || ''}
                  onChange={(e) => handleInputChange('bankDetails', { ...(formData.bankDetails || {}), accountTitle: e.target.value })}
                  placeholder="Account holder name"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Account Number</label>
                <input
                  type="text"
                  value={formData?.bankDetails?.accountNumber || ''}
                  onChange={(e) => handleInputChange('bankDetails', { ...(formData.bankDetails || {}), accountNumber: e.target.value })}
                  placeholder="Account number"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>IBAN</label>
                <input
                  type="text"
                  value={formData?.bankDetails?.iban || ''}
                  onChange={(e) => handleInputChange('bankDetails', { ...(formData.bankDetails || {}), iban: e.target.value })}
                  placeholder="PKXX..."
                  style={{
                    ...inputStyle,
                    borderColor: errors.iban ? colors.error : colors.border.input,
                  }}
                />
                {errors.iban && <div style={errorStyle}>{errors.iban}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
          marginTop: 28,
          paddingTop: 20,
          borderTop: `1px solid ${colors.border.default}`,
        }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: `1px solid ${colors.border.default}`,
              backgroundColor: colors.background.tertiary,
              color: colors.text.primary,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = colors.background.hover;
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = colors.background.tertiary;
              }
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s',
              boxShadow: `0 4px 12px ${colors.primary[500]}40`,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 6px 16px ${colors.primary[500]}60`;
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary[500]}40`;
              }
            }}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}


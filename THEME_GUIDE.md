# 🎨 Theme System Guide

## Overview
The application now has a **centralized theme system** that allows you to:
1. Change colors globally from one file
2. Switch between dark and light modes
3. Maintain consistent styling across all pages

---

## 📁 File Structure

```
next-app/
├── lib/theme/
│   ├── colors.js          # 🎯 MAIN COLOR CONFIGURATION - Edit here!
│   └── ThemeContext.jsx   # Theme provider & context
├── components/ui/
│   └── ThemeToggle.jsx    # Theme toggle button component
└── hooks/
    └── useThemeStyles.js  # Helper hook for styled components
```

---

## 🎨 Changing Global Colors

### To change your app's colors globally:

**Edit `next-app/lib/theme/colors.js`**

```javascript
export const colors = {
  // Primary Brand Colors - Change these to rebrand
  primary: {
    500: '#3b82f6',  // Change this to your brand color
    // ... other shades
  },
  
  // Secondary Colors
  secondary: {
    500: '#22c55e',  // Change this for secondary actions
    // ... other shades
  },
  
  // Accent Colors
  accent: {
    blue: '#3b82f6',   // Change these for specific accents
    green: '#22c55e',
    // ...
  },
};
```

**That's it!** Changes will automatically apply across:
- Headers
- Buttons
- Cards
- Borders
- Text colors
- Gradients

---

## 🌓 Dark/Light Mode

### Using the Theme Toggle

The `ThemeToggle` component is available. Add it to any page header:

```jsx
import ThemeToggle from '@/components/ui/ThemeToggle';

// In your component
<ThemeToggle />
```

### Using Theme in Components

```jsx
'use client';
import { useTheme } from '@/lib/theme/ThemeContext';
// OR use the helper hook:
import { useThemeStyles } from '@/hooks/useThemeStyles';

export default function MyComponent() {
  // Option 1: Direct theme access
  const { theme, colors, toggleTheme } = useTheme();
  
  // Option 2: Pre-styled components (recommended)
  const styles = useThemeStyles();
  
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.text.primary}>My Title</h1>
        <button style={styles.button.primary}>Click Me</button>
      </div>
    </div>
  );
}
```

---

## 📝 Example Usage

### Basic Component with Theme

```jsx
'use client';
import { useTheme } from '@/lib/theme/ThemeContext';

export default function MyPage() {
  const { colors } = useTheme();
  
  return (
    <div style={{
      background: colors.gradient.overlay,
      color: colors.text.primary,
      minHeight: '100vh',
      padding: '24px',
    }}>
      <div style={{
        background: colors.gradient.card,
        border: `1px solid ${colors.border.default}`,
        padding: '24px',
        borderRadius: 16,
      }}>
        <h1 style={{ color: colors.text.primary }}>
          My Page Title
        </h1>
      </div>
    </div>
  );
}
```

### With Theme Toggle

```jsx
import ThemeToggle from '@/components/ui/ThemeToggle';

<div style={{ display: 'flex', gap: 10 }}>
  <button>My Button</button>
  <ThemeToggle /> {/* Add theme toggle */}
</div>
```

---

## 🎯 Available Theme Properties

### Colors Object Structure

```javascript
{
  // Brand colors
  primary: { 50-900 },
  secondary: { 50-900 },
  accent: { blue, green, yellow, orange, red, purple },
  
  // Semantic colors
  success: '#22c55e',
  warning: '#fbbf24',
  error: '#ef4444',
  info: '#3b82f6',
  
  // Mode-specific (dark/light)
  background: {
    primary, secondary, tertiary, card, hover
  },
  text: {
    primary, secondary, tertiary, muted
  },
  border: {
    default, hover, active
  },
  gradient: {
    primary, card, overlay
  },
  
  // Computed
  card: {
    background, border, shadow
  },
  button: {
    primary, primaryHover, secondary, secondaryHover
  }
}
```

---

## 🔄 Migration Guide

### Before (Hard-coded colors):
```jsx
<div style={{
  background: '#020617',
  color: '#ffffff',
  border: '1px solid #374151',
}}>
```

### After (Theme-based):
```jsx
const { colors } = useTheme();

<div style={{
  background: colors.background.primary,
  color: colors.text.primary,
  border: `1px solid ${colors.border.default}`,
}}>
```

---

## ✅ Benefits

1. **Single Source of Truth**: Change colors in one file
2. **Consistent Design**: All components use same colors
3. **Dark/Light Mode**: Automatic theme switching
4. **Easy Rebranding**: Update colors.js to rebrand
5. **Type Safety**: Clear color structure
6. **Performance**: Theme persists in localStorage

---

## 🚀 Next Steps

1. Add `<ThemeToggle />` to page headers
2. Update components to use `useTheme()` hook
3. Replace hard-coded colors with theme colors
4. Test both dark and light modes

---

## 📌 Important Notes

- Theme preference is saved in `localStorage`
- Default theme is `dark`
- Theme applies to `<html>` element via `data-theme` attribute
- All pages automatically get theme via `ThemeProvider` in `app/providers.jsx`


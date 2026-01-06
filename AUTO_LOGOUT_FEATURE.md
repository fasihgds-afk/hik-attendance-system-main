# ✅ Auto Logout Feature - Complete Implementation

## 🎯 **Features Implemented**

### **1. Logout Button on HR Dashboard**
- ✅ Added logout button in HR dashboard header
- ✅ Styled consistently with employee dashboard
- ✅ Properly aligned with other header buttons
- ✅ Uses NextAuth `signOut` for proper session cleanup

### **2. Automatic Logout After Inactivity**
- ✅ **30 minutes** of inactivity triggers auto logout
- ✅ **5 minutes** before logout, a warning dialog appears
- ✅ Countdown timer shows remaining time
- ✅ User can click "Stay Logged In" to reset the timer
- ✅ User can click "Logout Now" to logout immediately

### **3. Activity Detection**
The system detects activity on:
- Mouse movements (`mousemove`)
- Mouse clicks (`mousedown`, `click`)
- Keyboard presses (`keypress`)
- Scroll events (`scroll`)
- Touch events (`touchstart`)

### **4. Warning Dialog**
- ✅ Professional, theme-aware design
- ✅ Shows countdown timer (MM:SS format)
- ✅ Two action buttons:
  - **Stay Logged In** - Resets timer and continues session
  - **Logout Now** - Immediately logs out

---

## 📁 **Files Created/Modified**

### **New Files:**
1. **`hooks/useAutoLogout.js`**
   - Custom hook for managing auto logout
   - Configurable inactivity time and warning time
   - Tracks user activity and manages timers

2. **`components/ui/AutoLogoutWarning.jsx`**
   - Warning dialog component
   - Theme-aware styling
   - Countdown display

### **Modified Files:**
1. **`app/hr/dashboard/page.jsx`**
   - Added logout button
   - Integrated auto logout hook
   - Added warning dialog

2. **`app/employee/dashboard/page.jsx`**
   - Updated logout button to use `signOut`
   - Integrated auto logout hook
   - Added warning dialog

---

## ⚙️ **Configuration**

### **Default Settings:**
- **Inactivity Time**: 30 minutes (30 * 60 * 1000 ms)
- **Warning Time**: 5 minutes before logout (5 * 60 * 1000 ms)

### **To Customize:**

In both dashboard files, you can adjust the timings:

```javascript
const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout } = useAutoLogout({
  inactivityTime: 30 * 60 * 1000, // Change this (in milliseconds)
  warningTime: 5 * 60 * 1000,      // Change this (in milliseconds)
  enabled: true,                    // Set to false to disable
});
```

**Examples:**
- 15 minutes: `15 * 60 * 1000`
- 1 hour: `60 * 60 * 1000`
- 2 hours: `2 * 60 * 60 * 1000`

---

## 🔒 **Security Benefits**

1. **Session Security**: Prevents unauthorized access if user leaves device unattended
2. **Automatic Cleanup**: Sessions are properly terminated after inactivity
3. **User Awareness**: Warning dialog gives users control
4. **Activity Tracking**: Only resets on actual user interaction

---

## 🎨 **User Experience**

1. **Warning Dialog**:
   - Appears 5 minutes before logout
   - Shows countdown timer
   - Clean, professional design
   - Theme-aware (works in dark/light mode)

2. **User Actions**:
   - Click anywhere on page → Timer resets
   - Move mouse → Timer resets
   - Type on keyboard → Timer resets
   - Click "Stay Logged In" → Timer resets
   - Click "Logout Now" → Immediate logout

3. **Automatic Logout**:
   - After 30 minutes of inactivity
   - Session is properly cleared
   - Redirects to login page

---

## ✅ **Result**

Both HR and Employee dashboards now have:
- ✅ Manual logout buttons
- ✅ Automatic logout after 30 minutes of inactivity
- ✅ 5-minute warning with countdown
- ✅ Activity detection (mouse, keyboard, scroll, touch)
- ✅ Professional warning dialog
- ✅ Proper session cleanup

**The system is now more secure and user-friendly!** 🔒


# .NET Break App — Developer Brief

**For:** .NET desktop break system developer  
**Database:** Same MongoDB as AMS Attendance System  
**Purpose:** On install, connect to MongoDB, identify employee by code + name, save break start/end into MongoDB keyed by `empCode`.

---

## 1. Setup popup (required)

Ask the employee for:

| Field | Description |
|--------|-------------|
| **MongoDB URL** | Connection string to the shared attendance database |
| **Employee Code** | Must match `employees.empCode` |
| **Employee Name** | Must match `employees.name` |

**Rules**
- Do **not** ask for email.
- Validate that `empCode` exists in `employees`.
- Prefer matching `name` for that same document.
- Only allow employees with `status = "active"`.
- Save break records in MongoDB (not as local-only truth). Every break document must include `empCode`.

---

## 2. Collections you need

| Collection name | Purpose |
|-----------------|--------|
| `employees` | Identify the person (code + name) |
| `shifts` | Shift start/end times + allowed break minutes |
| `breaks` *(you create this)* | Store break start/end sessions |

Do **not** use salary, bank, leave, complaint, or user-login collections.

---

## 3. Collection: `employees`

Mongoose model name: `Employee` → MongoDB collection: **`employees`**

### Fields you should use

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `empCode` | string | **yes** | Unique employee ID — **primary link for all break data** |
| `name` | string | yes (for your popup) | Display / match name |
| `status` | string | yes | `"active"` \| `"inactive"` \| `"terminated"` — only use **active** |
| `shift` | string | optional | Legacy shift **code** (e.g. `"MORNING"`) |
| `shiftId` | ObjectId | optional | Reference to `shifts._id` |
| `department` | string | optional | Useful for reports later |
| `designation` | string | optional | Job title |

### Example document (identity fields only)

```json
{
  "_id": "665f1a2b3c4d5e6f78901234",
  "empCode": "E001",
  "name": "Ali Khan",
  "status": "active",
  "department": "IT",
  "designation": "Developer",
  "shift": "MORNING",
  "shiftId": "665f1a2b3c4d5e6f7890abcd"
}
```

### Lookup examples (C# / MongoDB style)

```text
// Find employee by code
db.employees.findOne({ empCode: "E001", status: "active" })

// Validate code + name
db.employees.findOne({
  empCode: "E001",
  name: "Ali Khan",
  status: "active"
})
```

### Schema reference (from web app)

```js
{
  empCode: { type: String, unique: true, required: true, index: true },
  name: String,
  shift: String,                    // shift code string
  shiftId: ObjectId,                // ref → shifts._id
  department: String,
  designation: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'terminated'],
    default: 'active',
    index: true
  }
}
```

**Ignore for break app:** `email`, `monthlySalary`, `salaryHistory`, `bankDetails`, `cnic`, passwords, etc.

---

## 4. Collection: `shifts` (shift times)

Mongoose model name: `Shift` → MongoDB collection: **`shifts`**

Use this to know when the employee’s shift runs and how long the allowed break is.

### Fields you should use

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `_id` | ObjectId | yes | Linked from `employees.shiftId` |
| `name` | string | yes | e.g. `"Morning Shift"` |
| `code` | string | yes | Unique, uppercase e.g. `"MORNING"` — matches `employees.shift` |
| `startTime` | string | yes | `"HH:mm"` 24-hour, e.g. `"09:00"` |
| `endTime` | string | yes | `"HH:mm"` 24-hour, e.g. `"18:00"` |
| `crossesMidnight` | bool | no | `true` if end is next day (e.g. `18:00` → `03:00`) |
| `breakMinutes` | number | no | Allowed unpaid break (default **60**) |
| `paidHoursPerDay` | number | no | Default **8** |
| `isActive` | bool | no | Prefer `isActive: true` |
| `checkInGracePeriod` | number | optional | Minutes — attendance only |
| `checkOutGracePeriod` | number | optional | Minutes — attendance only |

### Example document

```json
{
  "_id": "665f1a2b3c4d5e6f7890abcd",
  "name": "Morning Shift",
  "code": "MORNING",
  "startTime": "09:00",
  "endTime": "18:00",
  "crossesMidnight": false,
  "breakMinutes": 60,
  "paidHoursPerDay": 8,
  "isActive": true
}
```

### How to resolve an employee’s shift

```text
1) Load employee by empCode
2) Prefer: db.shifts.findOne({ _id: employee.shiftId, isActive: true })
3) Fallback: db.shifts.findOne({ code: employee.shift, isActive: true })
```

### Schema reference (from web app)

```js
{
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  startTime: { type: String, required: true },   // "HH:mm"
  endTime: { type: String, required: true },     // "HH:mm"
  crossesMidnight: { type: Boolean, default: false },
  breakMinutes: { type: Number, default: 60, min: 0 },
  paidHoursPerDay: { type: Number, default: 8, min: 1 },
  isActive: { type: Boolean, default: true },
  checkInGracePeriod: Number,
  checkOutGracePeriod: Number
}
```

**Timezone note:** Web app uses Pakistan offset `+05:00` unless configured otherwise. Store break times as UTC `Date` or with clear timezone — agree one convention with HR web team.

---

## 5. New collection you must create: `breaks`

This collection does **not** exist yet. Create it for break start/end.

### Suggested fields

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `empCode` | string | **yes** | Same as `employees.empCode` — index this |
| `employeeName` | string | yes | Snapshot of name at save time |
| `breakStart` | Date | **yes** | When break started |
| `breakEnd` | Date | no | `null` while still on break |
| `durationMinutes` | number | no | Set when break ends |
| `shiftCode` | string | no | From `shifts.code` |
| `machineName` | string | no | PC name (optional) |
| `createdAt` | Date | yes | Insert time |
| `updatedAt` | Date | no | Last update |

### Example documents

```json
{
  "empCode": "E001",
  "employeeName": "Ali Khan",
  "breakStart": "2026-08-26T09:15:00.000Z",
  "breakEnd": null,
  "durationMinutes": null,
  "shiftCode": "MORNING",
  "machineName": "DESKTOP-ALI",
  "createdAt": "2026-08-26T09:15:00.000Z"
}
```

```json
{
  "empCode": "E001",
  "employeeName": "Ali Khan",
  "breakStart": "2026-08-26T09:15:00.000Z",
  "breakEnd": "2026-08-26T09:45:00.000Z",
  "durationMinutes": 30,
  "shiftCode": "MORNING",
  "machineName": "DESKTOP-ALI",
  "createdAt": "2026-08-26T09:15:00.000Z",
  "updatedAt": "2026-08-26T09:45:00.000Z"
}
```

### Indexes (recommended)

```text
{ empCode: 1, breakStart: -1 }
{ empCode: 1, breakEnd: 1 }
```

### Find breaks by employee

```text
db.breaks.find({ empCode: "E001" }).sort({ breakStart: -1 })
```

---

## 6. End-to-end flow

```
1. Install .NET break app
2. Popup: MongoDB URL + Employee Code + Name
3. Validate against employees (active only)
4. Optionally load shifts via shiftId or shift code
5. On Break Start → insert document in breaks (breakEnd = null)
6. On Break End → update same document (breakEnd + durationMinutes)
7. HR / web reports later filter by empCode
```

---

## 7. Do / Don’t

| Do | Don’t |
|----|--------|
| Use `empCode` as the only identity key | Use email or Windows username as primary key |
| Write breaks only to `breaks` | Modify/delete `employees` or `shifts` data |
| Validate `status = "active"` | Allow inactive / terminated employees |
| Share MongoDB URL privately | Commit MongoDB password to GitHub |

---

## 8. What the company will give you separately

- MongoDB connection URL (`MONGO_URI`) — private
- Database name
- 1–2 sample `employees` / `shifts` documents from Atlas (optional)

---

*Generated for HIK Attendance System integration with the .NET break desktop app.*

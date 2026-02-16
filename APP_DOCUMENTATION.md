# StudioFlow App Documentation

## 1. Overview
StudioFlow is now configured as an app-ready PWA booking platform with:
- Installable web app behavior (manifest + service worker + offline fallback)
- Student account system (registration + password login + session)
- Service, booking, credit, finance, and audit tooling
- Cross-page dark mode + persistent app navigation bar

Primary storage is browser `localStorage`.

## 2. App Pages

### `index.html` (Admin Dashboard)
- Daily schedule view
- Financial summary (gross, expenses, tax, profit)
- Weekly earnings chart
- Expense entry
- Tax settings
- Payment settings used by student/public pages
- Low-credit alerts
- Recent activity feed (audit trail)

### `services.html` (Service Management)
- Create services (name, duration, rate, active weekly windows)
- Delete services
- View active service schedule

### `clients.html` (Client CRM)
- Search clients by name/email/phone
- Filter clients by booking status
- Credit adjustment (`+1`, `-1`)
- Client booking history panel

### `book.html` (Public Request Page)
- Slot-based booking request flow
- **Account required**: submission validates email+password
- Available slot rendering by service/date

### `auth.html` (Unified Login)
- Role selector: `Student` or `Teacher`
- Login with email/password
- Login with face/fingerprint (passkey) if enrolled
- Password reset:
  - Email reset code (local-demo code display in this offline version)
  - Face/fingerprint reset (passkey verification)
- Teacher first-account creation flow

### `register.html` (Student Account Creation)
- Creates student account with password
- Captures referral source
- Auto-login and redirect to portal on success

### `portal.html` (Student Portal)
- Student-session protected page (redirects to `auth.html` if not logged in)
- Credit balance display
- Slot-based booking with credit consumption
- Booking cancellation

## 3. Shared Core Files

### `app-api.js`
Central business logic and persistence.

Key capabilities:
- Student auth (`registerStudent`, `loginStudent`, `logoutStudent`, `getCurrentStudent`, `verifyStudentCredentials`)
- Teacher auth (`registerTeacher`, `loginTeacher`, `logoutTeacher`, `getCurrentTeacher`, `verifyTeacherCredentials`)
- Unified password operations (`changePassword`, `requestPasswordReset`, `resetPasswordWithCode`, `resetPasswordWithPasskey`)
- Passkey support (`registerPasskey`, `loginWithPasskey`)
- Client management (`listClients`, `adjustCredits`)
- Service management (`listServices`, `createService`, `deleteService`)
- Booking engine (`listBookableSlots`, `createBooking`, `listBookings`, `updateBookingStatus`)
- Finance (`addExpense`, `setTaxConfig`, `getFinancialSummary`, `getWeeklyEarnings`)
- Activity logging (`listAuditTrail`)
- Backup export (`exportSystemData`)

### `app-ui.js`
Global app shell behavior:
- Sticky top app bar with route links
- Back + Home controls
- Persistent light/dark theme toggle

### PWA Files
- `manifest.webmanifest`
- `sw.js`
- `pwa-init.js`
- `offline.html`
- `icons/*`

## 4. Data Model (Stored in `localStorage`)

Storage key: `studioflow_v2`

Top-level state:
- `services[]`
- `bookings[]`
- `clients[]`
- `expenses[]`
- `taxConfig`
- `auditTrail[]`

Session key:
- `studioflow_student_session` (logged-in student email)

## 5. Account + Security Model
- Students must register with email + password (minimum 6 chars)
- Teachers use separate accounts and separate session keys
- Password is SHA-256 hashed via Web Crypto when available
- Booking request tracking is account-bound
- `book.html` requires valid student credentials before request submission
- `index.html`, `services.html`, `clients.html` require teacher session
- `portal.html` requires student session
- Passkeys (face/fingerprint) are available where browser/device supports WebAuthn
- Email reset in this offline/local version is simulated by displaying a reset code in UI (production should send real email via backend provider)

## 6. Professional Business Controls Added

### Audit Trail (Often Missed)
Every major change writes an audit event:
- Student registration/login/logout
- Credit adjustments/consumption
- Service creation/deletion
- Booking creation/status changes/reminders
- Tax and expense updates

This appears in Dashboard > Recent Activity.

## 7. Functional Verification Completed

### Validation executed
- Parsed all page inline scripts and shared JS files
- Confirmed all referenced API methods exist
- Executed API smoke test covering:
  - registration/login/session
  - service creation
  - slot generation
  - credit adjust/use
  - booking create/update
  - financial summary
  - audit trail output

Result: `api-smoke-ok`

## 8. PWA / App Installation
1. Host on HTTPS (or localhost for testing).
2. Open app in browser.
3. Install from browser prompt/menu.
4. App shell supports navigation + dark mode in installed mode.

## 9. Packaging / Download
Generate a distributable zip:

```bash
./package-app.sh
```

Output:
- `dist/studioflow-web-app-YYYYMMDD-HHMMSS.zip`

## 10. Operational Notes
- This is local-device data storage. Different devices do not auto-sync.
- Use Dashboard backup export regularly.
- For multi-user production, replace `localStorage` with backend API + database while keeping current page contracts.

## 11. Recommended Next Upgrade (Production)
- Admin authentication and role-based access
- Backend sync (PostgreSQL + API)
- Automated email reminders and payment webhooks
- Immutable financial ledger export (monthly close)

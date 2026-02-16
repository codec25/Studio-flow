# 🎵 StudioFlow: Private Music Studio Management

StudioFlow is a lightweight, "serverless" studio management ecosystem designed for independent teachers and tutors. It handles scheduling, credit tracking, financial reporting, and student onboarding entirely in the browser.

---

## 🚀 Quick Start
1. **Host it:** Upload all files to GitHub Pages.
2. **Login:** Open `auth.html` and choose Student or Teacher.
3. **Configure:** Teacher logs in, opens `index.html` (Admin Dashboard), and sets Tax/Payment details.
4. **Services:** Go to "Studio Settings" to define lesson types and weekly availability.
5. **Onboard:** Use `register.html` to sign up students.

---

## 📲 Install As App (PWA)
StudioFlow is now configured as an installable web app.

1. Deploy the full folder to HTTPS hosting (GitHub Pages/Netlify/Vercel) or run locally on `localhost`.
2. Open the site in Chrome/Edge/Safari.
3. Use your browser's install option:
   - Desktop Chrome/Edge: click the install icon in the address bar.
   - Mobile Chrome: menu -> **Add to Home screen**.
   - iPhone Safari: share -> **Add to Home Screen**.

PWA files included:
- `manifest.webmanifest`
- `sw.js`
- `pwa-init.js`
- `offline.html`
- `icons/`

---

## 📦 Create Downloadable ZIP
Run:

```bash
./package-app.sh
```

Output is saved in `dist/` as:
`studioflow-web-app-YYYYMMDD-HHMMSS.zip`

---

## 📂 System Architecture

The system consists of 6 main interfaces powered by a central API engine:

| Page | Purpose | Audience |
| :--- | :--- | :--- |
| `index.html` | **Dashboard**: Revenue charts, net profit, and today's schedule. | Teacher |
| `clients.html` | **CRM**: Manage student profiles, manual credit adjustments, and history. | Teacher |
| `services.html` | **Inventory**: Set your rates, durations, and available work days. | Teacher |
| `book.html` | **Public Booking**: A lead-capture page for new students. | Public |
| `register.html` | **Sign Up**: Simple account creation for new clients. | Public/Students |
| `portal.html` | **Student Hub**: Where students book sessions and check credits. | Students |
| `app-api.js` | **The Brain**: Handles all data logic and "LocalStorage" persistence. | System |

---

## 🛠 Features
* **True Net Profit Tracking:** Automatically calculates gross income minus expenses and estimated tax set-asides.
* **Credit-Based Booking:** Students must have active credits to book sessions via the portal.
* **Availability Logic:** The booking engine only shows slots based on the "Weekly Availability" set in your Service settings.
* **Mobile First:** All interfaces are built with Tailwind CSS to be fully responsive for phone use.

---

## 🔒 Privacy & Data
**Where is my data stored?**
This app uses `localStorage`. All student data, bookings, and financial records stay **on your device**. 

**Important:** Because there is no central database, if you switch from a laptop to a phone, your data will not automatically follow you. Use the **"Download Data Backup"** button on the Dashboard to export your data and move it between devices or to keep a safety copy.

---

## 📝 License
This project is open-source and free to use for independent educators.

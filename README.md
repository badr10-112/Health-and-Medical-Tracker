# 🩺 My Health Tracker

A simple, private, personal health tracking app that runs entirely in your web
browser. No installation, no account, no server — your data never leaves your
device.

## What it does

- **Dashboard** — see today's supplement checklist, upcoming appointments,
  your latest readings, and recent test results at a glance.
- **Health Metrics** — log weight, blood pressure, heart rate, blood sugar,
  temperature, sleep, and steps. A trend chart shows how each one changes
  over time.
- **Supplements** — keep a list of your supplements and medications with
  doses, and tick them off each day. The app remembers what you took on
  which day.
- **Appointments** — track upcoming and past medical appointments with
  doctor, reason, time, and location. Appointments in the next 7 days get a
  "Today" / "Tomorrow" / "In X days" badge.
- **Test Results** — record lab results with units and the normal range from
  your lab report. Anything outside the range is automatically flagged
  "Above range" or "Below range".
- **Report-type tabs** — each test result belongs to a lab report:
  **Post Infliximab Infusion Blood Test**, **CRP**, **Testosterone**, or
  **General Blood Test**. Tabs on the Test Results screen switch between
  them in one click, each with a live count.
- **Per-test trends** — the "By test" view groups results by test (RBC,
  CRP, Infliximab level, Vitamin D, …), each with its full history and a
  trend chart drawn against the test's normal range.
- **Import from a lab report** — choose your lab report PDF (or paste its
  text) and the app detects test names, values, units, and normal ranges,
  shows you an editable preview, and adds everything in one click. The PDF is
  read entirely on your device using the open-source pdf.js library (bundled
  in `vendor/`) — nothing is uploaded. Scanned/photographed reports have no
  readable text, so for those use paste or manual entry.

## How to use it

1. Download or clone this repository.
2. Double-click **`index.html`** — it opens in your web browser. That's it.

You can bookmark the page or drag it to your desktop for easy access. It works
on phones too: open the file in a mobile browser, or host the folder anywhere
static files can be served.

## Where is my data stored?

Everything is saved in your browser's **localStorage**, on your device only.
Nothing is uploaded anywhere.

Two important things to know:

- Data is tied to **that browser on that device**. If you open the app in a
  different browser or on another device, it starts empty.
- Clearing your browser's site data will erase it.

**So use the Backup button regularly.** It downloads a single
`health-tracker-backup-YYYY-MM-DD.json` file with everything in it. The
Restore button loads a backup back in (replacing whatever is currently
stored) — this is also how you move your data to a new device or browser.

## Ideas for later

Some things you might want to add as you learn more:

- Editing entries in place (currently: delete and re-add)
- Reminders/notifications for supplements and appointments
- Attaching files (e.g. photos of lab reports) to results
- Syncing between devices via a small backend

## Disclaimer

This is a personal record-keeping tool, not medical software. Always rely on
your doctor and official lab reports for medical decisions.

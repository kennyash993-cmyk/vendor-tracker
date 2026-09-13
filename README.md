# Vendor Work Tracker

Tracks work orders/POs sent out to vendors, the individual components on each
one (1–10+ per work order), when each shipped out and came back, captures a
real signature at pickup and return, and emails you when something has been
out too long.

## What you get

- **Dashboard** – everything currently at a vendor, with a live "days out"
  counter, color-coded (green/yellow/red), plus a separate "Awaiting Pickup"
  section for components not yet signed out.
- **All Work** – every work order ever created, filterable by status
  (Awaiting Pickup / Open / Closed), vendor, date sent, or free-text search
  (WO#, PO#, description).
- **New Work Order** – enter a WO#, PO#, vendor, and add as many components as
  you need, each with its own description. New components start as "awaiting
  pickup" until they're actually signed out.
- **Sign-out / sign-in with real signatures** – when the vendor picks items
  up, you select which components are leaving (one or many) and the vendor
  signs once on a signature pad to cover all of them — no need for a separate
  signature per part. Same thing in reverse when they're dropped back off.
  Every signature (name + drawn signature + timestamp) is kept in a
  Signature Log on the work order for a full audit trail.
- **Printable / emailed signature receipts** – every signature event has a
  "View / Print" link that opens a clean one-page PDF receipt (work order,
  PO, vendor, items covered, signer, and the signature itself) ready to
  print. The moment a vendor **signs out** (picks up) components, that
  receipt is automatically emailed as a PDF attachment to the same address
  list used for overdue alerts — no extra click required. You can also
  re-send or print any past receipt (pickup or return) on demand from the
  Signature Log.
- **Settings** – set the "days out" alert threshold, who gets emailed, turn
  overdue alerts and/or automatic receipt emails on or off, and preview
  what would trigger an alert right now.
- **Daily email alerts** – once a day (configurable time), the app emails you
  a table of every component that has been out at a vendor longer than your
  threshold.
- Simple password-protected login (single shared password) since this holds
  business data.
- **Cloud database (MongoDB Atlas)** – your data lives in the cloud, not on
  whatever computer happens to be running the app. That means it survives
  restarts, redeploys, and works identically from a laptop, a shop tablet, or
  a phone, all pointed at the same live data.

### How the sign-out / sign-in flow works

1. Create a work order and list its components — they start as **Awaiting
   Pickup**.
2. When the vendor's driver/rep actually arrives, check the box next to
   whichever components are leaving with them, click **Sign Out Selected**,
   and have them sign on the pad that pops up (mouse or touchscreen/finger).
   One signature covers every checked component, and a PDF pickup receipt is
   emailed automatically.
3. Those components now show as **Out**, with a live days-out counter.
4. When the vendor brings items back, check the box next to whichever
   components came back in that drop-off, click **Sign In Selected**, and
   have them sign again.
5. Everything is logged in that work order's **Signature Log**, each entry
   with a "View / Print" link and an "Email Receipt" button.

---

## 1. Requirements

- [Node.js](https://nodejs.org) version 18 or later, installed on the
  computer or server that will run this.
- A free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
  account (cloud database — see setup below). This is what makes your data
  permanent and shared across every device, instead of tied to one computer.

## 2. Set up your free cloud database (MongoDB Atlas)

Do this once — the same database works for local testing AND your live,
hosted app, so your data is always in one place.

1. Go to mongodb.com/cloud/atlas/register and create a free account.
2. Create a new **free (M0) cluster** — the setup wizard will walk you
   through picking a cloud provider/region; any option is fine.
3. Under **Database Access**, create a database user with a username and
   password (write these down — you'll need them in a moment).
4. Under **Network Access**, click **Add IP Address** and choose **Allow
   Access from Anywhere** (0.0.0.0/0). This is the simplest option since your
   hosted app's address can change; the database user's password is still
   required for anyone to actually get in.
5. Click **Connect** on your cluster → **Drivers** → copy the connection
   string. It looks like:
   `mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Replace `<password>` with the real password from step 3. You'll paste
   this whole string into `.env` as `MONGODB_URI` in the next section.

You don't need to manually create any database or tables/collections inside
Atlas — the app creates what it needs automatically the first time it runs.

## 3. First-time setup (running it on your own computer)

1. Unzip this project folder somewhere permanent (e.g. `Documents/vendor-tracker`).
2. Open a terminal/command prompt in that folder.
3. Install dependencies:
   ```
   npm install
   ```
4. Copy the environment template and edit it:
   ```
   cp .env.example .env
   ```
   Open `.env` in a text editor and set:
   - `APP_PASSWORD` — the password you'll type to log in.
   - `SESSION_SECRET` — any random string (mash the keyboard).
   - `MONGODB_URI` — the connection string from section 2.
   - The `SMTP_*` values — needed for email alerts and receipts (see below).
5. Start the app:
   ```
   npm start
   ```
   You should see `Connected to MongoDB` and then `Vendor Work Tracker
   running at http://localhost:3000`. If instead you see a MongoDB
   connection error, double-check `MONGODB_URI` for typos (especially the
   password) and that you allowed access from anywhere in Atlas.
6. Open your browser to **http://localhost:3000** and log in with your
   `APP_PASSWORD`.

### Setting up email (Gmail example)

1. Turn on 2-Step Verification on the Google account you want to send from.
2. Go to Google Account → Security → **App Passwords**, create one for "Mail".
3. In `.env`, set:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=the-16-character-app-password
   EMAIL_FROM="Vendor Tracker <youraddress@gmail.com>"
   ```
4. Any other SMTP provider (Outlook/Office365, a work email server, SendGrid,
   etc.) works the same way — just use that provider's SMTP host/port/login.
5. Restart the app, go to **Settings** in the app, add recipient email
   addresses, and click **Send Test / Run Check Now** to confirm the overdue
   alert works. Then sign a component out on any work order to confirm the
   pickup receipt email arrives too.

`ALERT_CRON` in `.env` controls what time the daily overdue check runs
(`0 8 * * *` = 8:00 AM every day). The alert **threshold**, recipient list,
and whether receipt emails are on are all set on the in-app Settings page, so
you can change those anytime without restarting anything.

---

## 4. Making it a real always-on app (not just "on my laptop")

Right now the app only works while `npm start` is running on your computer.
To have it always available from any phone, tablet, or computer, host it
somewhere that stays on. Because your data now lives in MongoDB Atlas (not on
the host's disk), you do **not** need a paid disk add-on anymore — a free
hosting tier works fine for the app itself.

### Easiest option: Render.com
1. Push this folder to a GitHub repository (private is fine) — or use
   GitHub's web uploader if you don't want to install Git: create a new repo
   at github.com, then drag in every file/folder from `vendor-tracker`
   **except** `node_modules` and `.env` (those should never be uploaded).
2. On [render.com](https://render.com), create a **New Web Service**, connect
   the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Under the **Environment** tab, add every variable from your `.env` file:
   `APP_PASSWORD`, `SESSION_SECRET`, `MONGODB_URI`, `MONGODB_DB_NAME`,
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
   `EMAIL_FROM`, `ALERT_CRON` — one at a time.
5. Deploy (the **Free** instance type is fine — no disk needed). Once it
   finishes, you'll get a URL like `https://your-app.onrender.com` — open it
   from your phone, tablet, or any computer, log in with your password, and
   it's the same data everywhere, because it's all sitting in Atlas.

Note: Render's free tier spins the app down after periods of inactivity, so
the very first request after a quiet stretch can take 30-60 seconds to wake
back up — after that it's fast again. If that delay is a problem, Render's
cheap paid tier removes it (still no disk purchase needed now).

### Alternative: Railway.app, a VPS (DigitalOcean/Linode), or your office server
Same idea — install Node, copy the files, set the same environment
variables, run `npm start` (ideally under a process manager like `pm2` so it
restarts itself if the server reboots:
`npm install -g pm2 && pm2 start server.js --name vendor-tracker`).

### Keep it simple as a home/shop server
If everyone using this is on the same office network, you can just run it on
one always-on computer and have everyone open `http://<that-computer's-IP>:3000`
from their own browsers — no hosting service needed. Your data still lives in
Atlas either way, so this and the hosted version can even be used
interchangeably.

---

## 5. Backing up your data

Your data lives in MongoDB Atlas, not on any one computer, so it's no longer
tied to your laptop or your hosting provider's disk. Atlas's free tier
doesn't include automatic backups, though, so for extra peace of mind you can
occasionally export a copy: in Atlas, use the **Export Data** / "Data API"
tools in the cluster's UI, or install
[MongoDB Compass](https://www.mongodb.com/products/compass) (a free desktop
app), connect with your `MONGODB_URI`, and export the `workOrders` and
`settings` collections to JSON whenever you'd like a snapshot.

---

## 6. Ideas to make it even better (not built yet, but easy to add later)

- **Vendor directory page** — store each vendor's contact info, typical
  turnaround time, and see average days-out per vendor over time.
- **Photos/attachments per component** — before/after photos, inspection
  reports, packing slips.
- **Cost tracking** — what each repair/service cost, running vendor spend
  totals.
- **CSV/Excel export** — for reporting or importing into accounting software.
- **Multiple users with names** — right now it's one shared password; could
  add named logins so you know *who* logged a component as returned.
- **SMS text alerts** in addition to email (via Twilio) for really overdue
  items.
- **QR code per work order** — print a QR code that goes straight to that
  work order's detail page, stick it on the physical paperwork.
- **"Expected return" overdue alerts** — separate email specifically for
  items past their expected-return date (the groundwork for this is already
  in the data model — `expectedReturnDate` — it just isn't wired to its own
  alert yet).
- **Weekly summary email** — in addition to the "still out" alerts, a Monday
  morning digest of everything closed out last week.
- **Condition photos at sign-out/sign-in** — snap a photo alongside the
  signature to document condition before it leaves and when it comes back.
- **Automatic return receipts** — right now return receipts are print/email
  on demand from the Signature Log; could switch these to auto-send too, the
  same way pickup receipts already do.

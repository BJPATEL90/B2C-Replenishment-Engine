# B2C Replenishment Engine

Lightweight transfer-planning dashboard for B2C replenishment from SL Ambient and Mother Hub into SL BW, SL LJ, and SL MM.

The normal workflow is:

1. Download the latest FG inventory report CSV from Unicommerce.
2. Upload that FG report from the dashboard using `Upload FG Report`.
3. Apps Script fetches the latest order-items CSV from Gmail.
4. Apps Script calculates the transfer plan.
5. The dashboard refreshes and the team downloads Critical, Urgent, Replenishment, or Filtered tables.

## Business Rules

- DOI buckets use the lower bucket on boundaries:
  - Critical: DOI <= 1
  - Urgent: DOI > 1 and DOI <= min DOI
  - Replenishment: DOI > min DOI and DOI <= target DOI
  - OK: DOI > target DOI
- `min DOI` and `target DOI` are configurable in the dashboard.
- Replenishment quantity is rounded up to case-pack multiples.
- Source warehouse stock uses `SL Ambient + SL Mother Hub`.
- `SIT to MH-WH` is shown for context only and is not included in source sufficiency logic.
- Source hint shows whether the transfer can be created from SL Ambient, Mother Hub, split source, or only partial short stock.
- Dashboard stores only calculated output in memory and exports filtered transfer tables as CSV.
- FG inventory is uploaded manually from the dashboard.
- Order-items sales data is imported from Gmail.

## Files

- `index.html`, `styles.css`, `app.js`, `config.js`: static frontend.
- `code.gs`: Google Apps Script backend for Gmail CSV import and plan calculation.

## Google Sheet Setup

The Apps Script backend uses a small Google Sheet as the control room. It does not store raw inventory or order data.

Sheets created:

- `CONFIG`: Gmail searches, facility lists, DOI defaults.
- `IMPORT_LOG`: every dashboard refresh/test import with email, attachment, CSV row, and output row counts.

### Option A: Standalone Apps Script

1. Paste `code.gs` into Apps Script.
2. Run `createReplenishmentWorkbook()` once from Apps Script.
3. Authorize Gmail and Sheets access.
4. Open the returned Google Sheet URL.
5. Review the `CONFIG` sheet values.
6. Deploy Apps Script as a web app.

### Option B: Bound to an Existing Google Sheet

1. Open your setup Google Sheet.
2. Go to Extensions > Apps Script.
3. Paste `code.gs`.
4. Run `setupReplenishmentWorkbook()` once.
5. Authorize Gmail and Sheets access.
6. Deploy Apps Script as a web app.

## Frontend Setup

1. Deploy `code.gs` as a Google Apps Script web app.
2. Grant Gmail access when prompted.
3. Update `config.js` with the deployed Apps Script web app URL:

```js
window.REPLENISHMENT_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
  defaultMinDoi: 3,
  defaultTargetDoi: 7
};
```

4. Host the frontend from GitHub Pages or any static host.

## Dashboard Upload Flow

- Select the FG inventory CSV in the header.
- Click `Upload FG Report`.
- A processing popup stays visible while Apps Script parses the FG file, imports the order-items CSV from Gmail, calculates replenishment rows, and returns the result.
- The table updates automatically after processing completes.

## Gmail Queries

Default queries in `CONFIG`:

- Inventory: `from:noreply@e.unicommerce.com "FG INVENTORY REPORT" newer_than:7d`
- Orders: `from:noreply@e.unicommerce.com "DATATABLE SEARCH ORDER ITEMS" newer_than:7d`

If the email subject or sender changes, update `SETTINGS.inventoryGmailQuery` and `SETTINGS.orderGmailQuery`.
Prefer updating the `CONFIG` sheet instead of editing code after setup.

## Gmail Debug

If dashboard rows stay at zero:

1. Run `setupReplenishmentWorkbook`.
2. Run `debugGmailMatches`.
3. Open `EMAIL_DEBUG`.
4. Check whether matching emails appear and whether `First CSV URL` is filled.
5. Run `testGmailImport`.
6. Check `IMPORT_LOG` for fetch status and row counts.

## How Gmail Import Works

On every FG report upload:

1. Apps Script receives the uploaded FG inventory CSV.
2. Apps Script reads the order Gmail search query from `CONFIG`.
3. It finds the latest matching order-items email.
4. It first checks for a CSV attachment.
5. If there is no attachment, it scans the email body for `Export File Path:` and fetches the CloudFront CSV link.
6. It calculates replenishment rows in memory.
7. It writes only import counts/status to `IMPORT_LOG`.
8. It returns calculated rows to the GitHub dashboard.

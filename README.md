B2C Replenishment Engine
Lightweight transfer-planning dashboard for B2C replenishment from SL Ambient and Mother Hub into SL BW, SL LJ, and SL MM.
Business Rules
DOI buckets use the lower bucket on boundaries:Critical: DOI <= 1
Urgent: DOI > 1 and DOI <= min DOI
Replenishment: DOI > min DOI and DOI <= target DOI
OK: DOI > target DOI

min DOI and target DOI are configurable in the dashboard.
Replenishment quantity is rounded up to case-pack multiples.
Source warehouse stock uses SL Ambient + SL Mother Hub.
SIT to MH-WH is shown for context only and is not included in source sufficiency logic.
Source hint shows whether the transfer can be created from SL Ambient, Mother Hub, split source, or only partial short stock.
Dashboard stores only calculated output in memory and exports filtered transfer tables as CSV.
Files
index.html, styles.css, app.js, config.js: static frontend.
code.gs: Google Apps Script backend for Gmail CSV import and plan calculation.
Setup
Deploy code.gs as a Google Apps Script web app.
Grant Gmail access when prompted.
Update config.js with the deployed Apps Script web app URL:
window.REPLENISHMENT_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
  defaultMinDoi: 3,
  defaultTargetDoi: 7
};
Host the frontend from GitHub Pages or any static host.
Gmail Queries
Default queries in code.gs:
Inventory: Export Job Complete - FG INVENTORY REPORT
Orders: Export Job Complete - DATATABLE SEARCH ORDER ITEMS
If the email subject or sender changes, update SETTINGS.inventoryGmailQuery and SETTINGS.orderGmailQuery.

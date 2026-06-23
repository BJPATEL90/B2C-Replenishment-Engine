(function () {
  "use strict";

  const config = window.REPLENISHMENT_CONFIG || {};
  const state = {
    rawRows: [],
    calculatedRows: [],
    filteredRows: [],
    lastUpdated: null,
    diagnostics: null
  };

  // â”€â”€ detailedView toggle state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let detailedView = false;

  const els = {
    refreshBtn:        document.getElementById("refreshBtn"),
    downloadAllBtn:    document.getElementById("downloadAllBtn"),
    uploadForm:        document.getElementById("uploadForm"),
    inventoryFileInput:document.getElementById("inventoryFileInput"),
    uploadInventoryBtn:document.getElementById("uploadInventoryBtn"),
    brandFilter:       document.getElementById("brandFilter"),
    statusFilter:      document.getElementById("statusFilter"),
    sourceFilter:      document.getElementById("sourceFilter"),
    minDoiInput:       document.getElementById("minDoiInput"),
    targetDoiInput:    document.getElementById("targetDoiInput"),
    searchInput:       document.getElementById("searchInput"),
    totalSku:          document.getElementById("totalSku"),
    criticalSku:       document.getElementById("criticalSku"),
    urgentSku:         document.getElementById("urgentSku"),
    plannedQty:        document.getElementById("plannedQty"),
    shortSku:          document.getElementById("shortSku"),
    lastUpdated:       document.getElementById("lastUpdated"),
    dataState:         document.getElementById("dataState"),
    tableBody:         document.getElementById("tableBody"),
    processingOverlay: document.getElementById("processingOverlay"),
    processingTitle:   document.getElementById("processingTitle"),
    processingStatus:  document.getElementById("processingStatus"),
    uploadStatus:      document.getElementById("uploadStatus"),
    clearDataBtn:      document.getElementById("clearDataBtn"),
    toastContainer:    document.getElementById("toastContainer")
  };

  els.minDoiInput.value    = config.defaultMinDoi    || 3;
  els.targetDoiInput.value = config.defaultTargetDoi || 7;

  // â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function numberValue(value) {
    if (value === null || value === undefined || value === "") return 0;
    const parsed = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNumber(value, decimals) {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    }).format(numberValue(value));
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);
  }


  // â”€â”€ Toast notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // type: "success" | "error" | "info"
  function showToast(title, detail, type, durationMs) {
    const container = els.toastContainer;
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type || "info"}`;
    toast.innerHTML = `
      <div class="toast-body">
        <strong>${escapeHtml(title)}</strong>
        ${detail ? `<span class="toast-detail">${escapeHtml(detail)}</span>` : ""}
      </div>
      <span class="toast-close" aria-label="Dismiss">x</span>`;
    toast.querySelector(".toast-close").addEventListener("click", () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, durationMs || 6000);
  }

  // Shows a small status line directly under the Upload button
  function setUploadStatus(msg, type) {
    if (!els.uploadStatus) return;
    els.uploadStatus.textContent  = msg;
    els.uploadStatus.className    = `upload-status${type ? " " + type : ""}`;
  }

  function tagClass(value) {
    return `tag-${String(value).toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  }

  // â”€â”€ Brand normalisation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const BRAND_MAP = {
    "manmatters":    "Man Matters",
    "man matters":   "Man Matters",
    "littlejoy":     "Little Joys",
    "littlejoys":    "Little Joys",
    "little joys":   "Little Joys",
    "little joy":    "Little Joys",
    "bebodywise":    "Be Bodywise",
    "be bodywise":   "Be Bodywise",
    "rootlabs":      "Root Labs",
    "root labs":     "Root Labs",
    "rootlabsusa":   "Root Labs",
    "root labs usa": "Root Labs",
    "staysteady":    "Stay Steady",
    "stay steady":   "Stay Steady"
  };

  function normaliseBrand(raw) {
    if (!raw) return "";
    const keyNS = String(raw).toLowerCase().replace(/\s+/g, "").trim();
    if (BRAND_MAP[keyNS]) return BRAND_MAP[keyNS];
    const keyS  = String(raw).toLowerCase().trim();
    if (BRAND_MAP[keyS]) return BRAND_MAP[keyS];
    return String(raw).trim().replace(/\b\w/g, c => c.toUpperCase());
  }

  // â”€â”€ Row calculation (mirrors Master_Logic formulas) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function calculateRows(rows) {
    const minDoi    = Math.max(1, numberValue(els.minDoiInput.value) || 3);
    const targetDoi = Math.max(minDoi, numberValue(els.targetDoiInput.value) || 7);

    return rows.map((row) => {
      const stockOnHand          = numberValue(row.stockOnHand);
      const damagedStock         = numberValue(row.damagedStock);
      const stockInTransfer      = numberValue(row.stockInTransfer);
      const last30DaysSales      = numberValue(row.last30DaysSales);
      const last7DaysSales       = numberValue(row.last7DaysSales);
      const openOrders           = numberValue(row.openOrders);
      const casePack             = numberValue(row.casePack) || 1;
      const slAmbientStock       = numberValue(row.slAmbientStock);
      const motherHubStock       = numberValue(row.motherHubStock);
      const sitToMhWh            = numberValue(row.sitToMhWh);
      const sourceWarehouseStock = slAmbientStock + motherHubStock;

      const netDepotStock = Math.max(0, stockOnHand + stockInTransfer);
      const dailySales30  = last30DaysSales / 30;
      const dailySales7   = last7DaysSales  / 7;
      const dailyDemand   = Math.max(dailySales30, dailySales7);
      const currentDoi    = dailyDemand > 0 ? netDepotStock / dailyDemand : 0;

      // col S - Replenishment Status
      const hasActivity = last30DaysSales > 0 || last7DaysSales > 0 || openOrders > 0;
      let replenishmentStatus;
      if (!hasActivity)              replenishmentStatus = "Ok";
      else if (dailyDemand === 0)    replenishmentStatus = "Urgent";
      else if (currentDoi < minDoi)  replenishmentStatus = "Urgent";
      else if (currentDoi < targetDoi) replenishmentStatus = "Replenish";
      else                           replenishmentStatus = "Ok";

      // col U - Replenishment Qty (plain ROUNDUP, no case-pack here)
      const rawRequirement   = Math.max(0, targetDoi * dailyDemand - netDepotStock);
      const replenishmentQty = replenishmentStatus === "Ok" ? 0 : Math.ceil(rawRequirement);

      // col Z - Source Sufficiency
      let sourceSufficiency;
      if (replenishmentQty === 0)                             sourceSufficiency = "Not Req.";
      else if (sourceWarehouseStock === 0)                    sourceSufficiency = "OOS";
      else if (replenishmentQty <= sourceWarehouseStock)      sourceSufficiency = "SUFFICIENT";
      else                                                    sourceSufficiency = "SHORT";

      // col AA - Priority (pure DOI bucket)
      let priority;
      if (!hasActivity)                  priority = "EXCESS";
      else if (currentDoi <= 1)          priority = "P0";
      else if (currentDoi < minDoi)      priority = "P1";
      else if (currentDoi <= targetDoi)  priority = "P2";
      else                               priority = "EXCESS";

      // col AB - to be plan
      const toBePlanned = Math.min(replenishmentQty, sourceWarehouseStock);

      // col AC - Qty as per case pack: MROUND(toBePlanned/casePack, 1)*casePack
      const qtyAsPerCasePack = Math.round(toBePlanned / casePack) * casePack;

      const sourceHint = getSourceHint(replenishmentQty, slAmbientStock, motherHubStock);

      return {
        depotName: "B2C",
        skuCode:             row.skuCode      || "",
        productName:         row.productName  || "",
        brand:               normaliseBrand(row.brand || ""),
        casePack,
        stockOnHand,        damagedStock,     stockInTransfer,
        last30DaysSales,    last7DaysSales,   openOrders,
        netDepotStock,      dailySales30,     dailySales7,
        dailyDemand,        currentDoi,
        replenishmentStatus, replenishmentQty,
        slAmbientStock,     motherHubStock,   sitToMhWh,
        sourceWarehouseStock, sourceSufficiency,
        priority,           toBePlanned,      qtyAsPerCasePack,
        sourceHint
      };
    });
  }

  function getSourceHint(req, amb, mh) {
    if (req <= 0)             return "No transfer needed";
    if (amb >= req)           return "SL Ambient";
    if (mh  >= req)           return "SL Mother Hub";
    if (amb + mh >= req)      return "Split source";
    if (amb > 0 && mh > 0)   return "Short: both sources";
    if (amb > 0)              return "Short: SL Ambient only";
    if (mh  > 0)              return "Short: SL Mother Hub only";
    return "No source stock";
  }

  // â”€â”€ UI helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function setDataState(label, ok) {
    els.dataState.textContent = label;
    els.dataState.style.color = ok ? "#047857" : "#637083";
  }

  function showProcessing(title, status) {
    els.processingTitle.textContent  = title  || "Processing";
    els.processingStatus.textContent = status || "Please wait while the replenishment plan is prepared.";
    els.processingOverlay.hidden = false;
  }

  function hideProcessing() {
    els.processingOverlay.hidden = true;
  }

  function populateSelect(select, values) {
    const selected = select.value;
    const first    = select.options[0].cloneNode(true);
    select.replaceChildren(first);
    values.forEach((v) => {
      const opt     = document.createElement("option");
      opt.value     = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    select.value = values.includes(selected) ? selected : "";
  }

  // â”€â”€ Download button labels + bucket qty display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function updateDownloadPanel() {
    const minD    = Math.max(1, numberValue(els.minDoiInput.value) || 3);
    const targetD = Math.max(minD, numberValue(els.targetDoiInput.value) || 7);
    const all     = state.calculatedRows;

    const buckets = {
      "P0": { label: `P0 <=1 DOI`,                     rows: all.filter(r => r.priority === "P0") },
      "P1": { label: `P1  >1 & <${minD} DOI`,           rows: all.filter(r => r.priority === "P1") },
      "P2": { label: `P2 >=${minD} & <${targetD} DOI`,  rows: all.filter(r => r.priority === "P2") },
      "":   { label: `Download All`,                     rows: all }
    };

    document.querySelectorAll("[data-download-status]").forEach((btn) => {
      const p      = btn.getAttribute("data-download-status");
      const bucket = buckets[p];
      if (!bucket) return;
      const qty    = bucket.rows.reduce((s, r) => s + r.qtyAsPerCasePack, 0);
      // Update button label
      const labelEl = btn.querySelector(".dl-label");
      const qtyEl   = btn.querySelector(".dl-qty");
      if (labelEl) labelEl.textContent = bucket.label;
      if (qtyEl)   qtyEl.textContent   = qty > 0 ? formatNumber(qty, 0) + " units" : "";
    });
  }

  // â”€â”€ Filters + summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function refreshFilterOptions() {
    const brands = [...new Set(state.calculatedRows.map(r => r.brand).filter(Boolean))].sort();
    populateSelect(els.brandFilter, brands);
  }

  function compareTransferRows(a, b) {
    const priorityOrder = { P0: 0, P1: 1, P2: 2, EXCESS: 3 };
    const pa = Object.prototype.hasOwnProperty.call(priorityOrder, a.priority) ? priorityOrder[a.priority] : 9;
    const pb = Object.prototype.hasOwnProperty.call(priorityOrder, b.priority) ? priorityOrder[b.priority] : 9;
    if (pa !== pb) return pa - pb;

    const doiA = Number.isFinite(a.currentDoi) ? a.currentDoi : 999999;
    const doiB = Number.isFinite(b.currentDoi) ? b.currentDoi : 999999;
    if (doiA !== doiB) return doiA - doiB;

    const qtyA = Number(a.qtyAsPerCasePack || a.toBePlanned || 0);
    const qtyB = Number(b.qtyAsPerCasePack || b.toBePlanned || 0);
    if (qtyA !== qtyB) return qtyB - qtyA;

    return String(a.skuCode || '').localeCompare(String(b.skuCode || ''));
  }

  function applyFilters() {
    const brand  = els.brandFilter.value;
    const status = els.statusFilter.value;
    const source = els.sourceFilter.value;
    const search = els.searchInput.value.trim().toLowerCase();

    state.calculatedRows = calculateRows(state.rawRows).sort(compareTransferRows);
    state.filteredRows   = state.calculatedRows.filter((row) => {
      const matchesSearch = !search ||
        row.skuCode.toLowerCase().includes(search) ||
        row.productName.toLowerCase().includes(search);
      return (!brand  || row.brand === brand)  &&
             (!status || row.replenishmentStatus === status) &&
             (!source || row.sourceSufficiency  === source) &&
             matchesSearch;
    }).sort(compareTransferRows);

    renderSummary();
    updateDownloadPanel();
    renderTable();
  }

  function renderSummary() {
    const rows = state.filteredRows;
    els.totalSku.textContent    = formatNumber(rows.length, 0);
    els.criticalSku.textContent = formatNumber(rows.filter(r => r.priority === "P0").length, 0);
    els.urgentSku.textContent   = formatNumber(rows.filter(r => r.replenishmentStatus === "Urgent").length, 0);
    els.plannedQty.textContent  = formatNumber(rows.reduce((s, r) => s + r.toBePlanned, 0), 0);
    els.shortSku.textContent    = formatNumber(rows.filter(r => r.sourceSufficiency === "SHORT" || r.sourceSufficiency === "OOS").length, 0);
  }

  // â”€â”€ Table rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Compact thead (16 cols) - default view
  const COMPACT_THEAD = `<tr>
    <th class="col-sku">SKU / Product</th>
    <th>Brand</th>
    <th class="numeric">Case<br>Pack</th>
    <th class="numeric">Daily<br>Demand</th>
    <th class="numeric">Current<br>DOI</th>
    <th>Status</th>
    <th class="numeric">SL<br>Ambient</th>
    <th class="numeric">MH<br>Stock</th>
    <th class="numeric">SIT<br>to MH</th>
    <th class="numeric">Source<br>Stock</th>
    <th>Sufficiency</th>
    <th class="hint-col">Source Hint</th>
    <th class="numeric">To<br>Plan</th>
    <th class="numeric">CP<br>Qty</th>
    <th>Priority</th>
  </tr>`;

  // Detailed thead (23 cols) - toggled view
  const DETAILED_THEAD = `<tr>
    <th class="col-sku">SKU / Product</th>
    <th>Brand</th>
    <th class="numeric">Case Pack</th>
    <th class="numeric">SoH</th>
    <th class="numeric">Damaged</th>
    <th class="numeric">SIT (Dest)</th>
    <th class="numeric">Last 30D</th>
    <th class="numeric">Last 7D</th>
    <th class="numeric">Net Stock</th>
    <th class="numeric">Open Orders</th>
    <th class="numeric">Daily Demand</th>
    <th class="numeric">Current DOI</th>
    <th>Status</th>
    <th class="numeric">Req Qty</th>
    <th class="numeric">SL Ambient</th>
    <th class="numeric">MH Stock</th>
    <th class="numeric">SIT to MH</th>
    <th class="numeric">Source Stock</th>
    <th>Sufficiency</th>
    <th class="hint-col">Source Hint</th>
    <th class="numeric">To Plan</th>
    <th class="numeric">CP Qty</th>
    <th>Priority</th>
  </tr>`;

  // SKU + product in two lines, compact
  function skuCell(row) {
    return `<td class="col-sku"><span class="sku-code">${escapeHtml(row.skuCode)}</span><span class="sku-product">${escapeHtml(row.productName)}</span></td>`;
  }

  function renderTable() {
    const rows = state.filteredRows;
    const cols  = detailedView ? 23 : 15;
    if (!rows.length) {
      els.tableBody.innerHTML = `<tr><td class="empty" colspan="${cols}">${getEmptyMessage()}</td></tr>`;
      return;
    }

    if (detailedView) {
      els.tableBody.innerHTML = rows.map((row) => `<tr>
        ${skuCell(row)}
        <td>${escapeHtml(row.brand)}</td>
        <td class="numeric">${formatNumber(row.casePack, 0)}</td>
        <td class="numeric">${formatNumber(row.stockOnHand, 0)}</td>
        <td class="numeric">${formatNumber(row.damagedStock, 0)}</td>
        <td class="numeric">${formatNumber(row.stockInTransfer, 0)}</td>
        <td class="numeric">${formatNumber(row.last30DaysSales, 0)}</td>
        <td class="numeric">${formatNumber(row.last7DaysSales, 0)}</td>
        <td class="numeric">${formatNumber(row.netDepotStock, 0)}</td>
        <td class="numeric">${formatNumber(row.openOrders, 0)}</td>
        <td class="numeric">${formatNumber(row.dailyDemand, 1)}</td>
        <td class="numeric">${formatNumber(row.currentDoi, 1)}</td>
        <td><span class="tag ${tagClass(row.replenishmentStatus)}">${row.replenishmentStatus}</span></td>
        <td class="numeric">${formatNumber(row.replenishmentQty, 0)}</td>
        <td class="numeric">${formatNumber(row.slAmbientStock, 0)}</td>
        <td class="numeric">${formatNumber(row.motherHubStock, 0)}</td>
        <td class="numeric">${formatNumber(row.sitToMhWh, 0)}</td>
        <td class="numeric">${formatNumber(row.sourceWarehouseStock, 0)}</td>
        <td><span class="tag ${tagClass(row.sourceSufficiency)}">${row.sourceSufficiency}</span></td>
        <td class="hint-col">${escapeHtml(row.sourceHint)}</td>
        <td class="numeric">${formatNumber(row.toBePlanned, 0)}</td>
        <td class="numeric">${formatNumber(row.qtyAsPerCasePack, 0)}</td>
        <td><span class="tag ${tagClass(row.priority)}">${row.priority}</span></td>
      </tr>`).join("");
    } else {
      els.tableBody.innerHTML = rows.map((row) => `<tr>
        ${skuCell(row)}
        <td>${escapeHtml(row.brand)}</td>
        <td class="numeric">${formatNumber(row.casePack, 0)}</td>
        <td class="numeric">${formatNumber(row.dailyDemand, 1)}</td>
        <td class="numeric">${formatNumber(row.currentDoi, 1)}</td>
        <td><span class="tag ${tagClass(row.replenishmentStatus)}">${row.replenishmentStatus}</span></td>
        <td class="numeric">${formatNumber(row.slAmbientStock, 0)}</td>
        <td class="numeric">${formatNumber(row.motherHubStock, 0)}</td>
        <td class="numeric">${formatNumber(row.sitToMhWh, 0)}</td>
        <td class="numeric">${formatNumber(row.sourceWarehouseStock, 0)}</td>
        <td><span class="tag ${tagClass(row.sourceSufficiency)}">${row.sourceSufficiency}</span></td>
        <td class="hint-col">${escapeHtml(row.sourceHint)}</td>
        <td class="numeric">${formatNumber(row.toBePlanned, 0)}</td>
        <td class="numeric">${formatNumber(row.qtyAsPerCasePack, 0)}</td>
        <td><span class="tag ${tagClass(row.priority)}">${row.priority}</span></td>
      </tr>`).join("");
    }
  }

  function getEmptyMessage() {
    if (state.rawRows.length) return "No rows match the selected filters.";
    const diag = state.diagnostics;
    if (!diag) return "No replenishment rows returned by the backend.";
    if (diag.message) return `Backend message: ${diag.message}`;
    return [
      `Inventory CSV rows: ${diag.inventoryRows || 0}`,
      `Order CSV rows: ${diag.orderRows || 0}`,
      `Inventory emails: ${diag.inventoryThreads || 0}`,
      `Order emails: ${diag.orderThreads || 0}`,
      `Downloaded CSVs: ${(diag.inventoryDownloadedCsv || 0) + (diag.orderDownloadedCsv || 0)}`
    ].join(" | ") + ". Check Gmail query, attachment type, and facility/SKU headers.";
  }

  // â”€â”€ Data fetch / upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function fetchRows() {
    setDataState("Loading", false);
    if (window.google && google.script && google.script.run) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          .getPlanData();
      });
    }
    if (!config.apiUrl) throw new Error("Set apiUrl in config.js after deploying the Apps Script web app.");
    const url = new URL(config.apiUrl);
    url.searchParams.set("action", "loadPlan");
    url.searchParams.set("minDoi", els.minDoiInput.value);
    url.searchParams.set("targetDoi", els.targetDoiInput.value);
    try {
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Backend returned ${response.status}`);
      return response.json();
    } catch (error) {
      return fetchRowsJsonp(url);
    }
  }

  function fetchRowsJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `replenishmentCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const timer  = setTimeout(() => { cleanup(); reject(new Error("Backend request timed out")); }, 30000);
      function cleanup() { clearTimeout(timer); delete window[callbackName]; if (script.parentNode) script.parentNode.removeChild(script); }
      window[callbackName] = (payload) => { cleanup(); resolve(payload); };
      url.searchParams.set("callback", callbackName);
      script.onerror = () => { cleanup(); reject(new Error("Unable to load Apps Script backend")); };
      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  async function refreshData() {
    try {
      showProcessing("Refreshing data", "Loading the shared plan from the Google Sheet...");
      const payload = await fetchRows();
      applyPayload(payload);
    } catch (error) {
      state.rawRows = []; state.calculatedRows = []; state.filteredRows = [];
      renderSummary(); renderTable();
      els.lastUpdated.textContent = error.message;
      setDataState("Needs setup", false);
    } finally {
      hideProcessing();
    }
  }

  function applyPayload(payload) {
    if (payload && payload.error) throw new Error(payload.error);
    state.rawRows        = Array.isArray(payload) ? payload : payload.rows || [];
    state.lastUpdated    = payload.lastUpdated || new Date().toISOString();
    state.diagnostics    = payload.diagnostics || null;
    state.calculatedRows = calculateRows(state.rawRows);
    refreshFilterOptions();
    applyFilters();

    // Show where data came from (shared sheet vs fresh upload)
    const fromSheet = payload.diagnostics && payload.diagnostics.sheetRead;
    const source    = payload.source ? ` - ${payload.source}` : "";
    const origin    = fromSheet ? " (shared plan)" : " (fresh upload)";
    els.lastUpdated.textContent =
      `Last updated ${new Date(state.lastUpdated).toLocaleString("en-IN")}${source}${origin}`;
    setDataState(`${state.rawRows.length} rows`, true);
  }

  function uploadInventoryFile() {
    const file = els.inventoryFileInput.files && els.inventoryFileInput.files[0];
    if (!file) { window.alert("Select the FG inventory CSV file first."); return; }
    setUploadStatus("Uploading...", "");
    showProcessing("Processing FG report", "Uploading the FG inventory file. The backend will combine it with order sales data and refresh the table.");
    if (window.google && google.script && google.script.run) { uploadInventoryWithGoogleRun(file); return; }
    uploadInventoryWithIframe(file);
  }

  function uploadInventoryWithGoogleRun(file) {
    const reader = new FileReader();
    reader.onload = () => {
      google.script.run
        .withSuccessHandler((payload) => {
            try {
              applyPayload(payload);
              const rowsLoaded = state.rawRows.length;
              const planned    = state.calculatedRows.reduce((s, r) => s + r.qtyAsPerCasePack, 0);
              setUploadStatus(`OK ${rowsLoaded} SKUs loaded`, "ok");
              showToast(`Upload successful - ${rowsLoaded} SKUs`,
                `Plan qty: ${new Intl.NumberFormat("en-IN").format(planned)} units`,
                "success", 8000);
            } catch (e) {
              setUploadStatus(`Error ${e.message}`, "err");
              showToast("Upload failed", e.message, "error", 12000);
              els.lastUpdated.textContent = e.message;
              setDataState("Upload failed", false);
            } finally { hideProcessing(); }
          })
        .withFailureHandler((e) => {
            const msg = e.message || String(e);
            setUploadStatus(`Error ${msg}`, "err");
            showToast("Upload failed", msg, "error", 12000);
            els.lastUpdated.textContent = msg;
            setDataState("Upload failed", false);
            hideProcessing();
          })
        .processUploadedInventoryText(String(reader.result || ""), { fileName: file.name, minDoi: numberValue(els.minDoiInput.value), targetDoi: numberValue(els.targetDoiInput.value) });
    };
    reader.onerror = () => { els.lastUpdated.textContent = "Unable to read selected file."; setDataState("Upload failed", false); hideProcessing(); };
    reader.readAsText(file);
  }

  function uploadInventoryWithIframe(file) {
    if (!config.apiUrl) { els.lastUpdated.textContent = "Set apiUrl in config.js before uploading files."; setDataState("Needs setup", false); hideProcessing(); return; }
    const reader = new FileReader();
    reader.onload  = () => submitInventoryTextWithIframe(file.name, String(reader.result || ""));
    reader.onerror = () => { els.lastUpdated.textContent = "Unable to read selected file."; setDataState("Upload failed", false); hideProcessing(); };
    reader.readAsText(file);
  }

  // Large CSV (2-5 MB) sent as raw POST body to bypass Apps Script's ~10 MB
  // e.parameter limit. Metadata travels as URL query params.
  function submitInventoryTextWithIframe(fileName, inventoryText) {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe   = document.createElement("iframe");
    iframe.name    = `uploadFrame_${uploadId}`;
    iframe.hidden  = true;
    document.body.appendChild(iframe);

    let uploadCompleted = false;
    let iframeLoadCount = 0;

    const timeout = setTimeout(() => {
      if (uploadCompleted) return;
      cleanup();
      els.lastUpdated.textContent = "Upload timed out before the backend returned a result.";
      setDataState("Upload timed out", false);
      hideProcessing();
    }, 180000);

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      iframe.onload = null;
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }

    async function finishUpload(payloadFromMessage) {
      if (uploadCompleted) return;
      uploadCompleted = true;
      try {
        showProcessing("Loading processed plan", "Upload completed. Loading calculated rows from PLAN_DATA.");
        const payload = payloadFromMessage && !payloadFromMessage.uploadComplete ? payloadFromMessage : await fetchRows();
        applyPayload(payload);

        const rowsLoaded = state.rawRows.length;
        const planned    = state.calculatedRows.reduce((s, r) => s + r.qtyAsPerCasePack, 0);
        setUploadStatus(`OK Uploaded - ${rowsLoaded} SKUs loaded`, "ok");
        showToast(
          `Upload successful - ${rowsLoaded} SKUs`,
          `Plan qty: ${new Intl.NumberFormat("en-IN").format(planned)} units  |  File: ${fileName}`,
          "success", 8000
        );
      } catch (e) {
        setUploadStatus(`Error ${e.message}`, "err");
        showToast("Upload finished, but loading the plan failed", e.message, "error", 12000);
        els.lastUpdated.textContent = e.message;
        setDataState("Load failed", false);
      } finally {
        cleanup();
        hideProcessing();
      }
    }

    async function onMessage(event) {
      const data = event.data || {};
      if (!data || data.type !== "replenishmentUploadResult" || data.uploadId !== uploadId) return;
      if (data.error) {
        uploadCompleted = true;
        cleanup();
        setUploadStatus(`Error ${data.error}`, "err");
        showToast("Upload failed", data.error, "error", 12000);
        els.lastUpdated.textContent = data.error;
        setDataState("Upload failed", false);
        hideProcessing();
        return;
      }
      await finishUpload(data.payload);
    }

    iframe.onload = () => {
      iframeLoadCount += 1;
      // Apps Script sometimes does not deliver postMessage reliably to a file/GitHub parent.
      // If the iframe finished loading, assume doPost completed and read PLAN_DATA directly.
      setTimeout(() => {
        if (!uploadCompleted && iframeLoadCount > 0) finishUpload({ uploadComplete: true });
      }, 1200);
    };

    window.addEventListener("message", onMessage);

    const url = new URL(config.apiUrl);
    url.searchParams.set("action",            "uploadInventory");
    url.searchParams.set("uploadId",          uploadId);
    url.searchParams.set("minDoi",            els.minDoiInput.value);
    url.searchParams.set("targetDoi",         els.targetDoiInput.value);
    url.searchParams.set("inventoryFileName", fileName);

    const form    = document.createElement("form");
    form.method   = "POST";
    form.action   = url.toString();
    form.target   = iframe.name;
    form.enctype  = "text/plain";
    const field   = document.createElement("input");
    field.type    = "hidden";
    field.name    = "csvBody";
    field.value   = inventoryText;
    form.appendChild(field);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }

  // â”€â”€ CSV export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function exportRows(rows, label) {
    const headers = ["Depot Name","SkuCode","Product Name","Brand","Case Pack",
      "Stock on Hand","Damaged Stock","Stock In Transfer","Last 30 days Sales","Last 7 days Sales",
      "Net Depot Stock","Daily Sales 30D","Daily Sales 7D","Daily Demand","Current DOI",
      "Replenishment Status","Open Orders","Replenishment Qty",
      "SL Stock (Ambient)","MH Stock","SIT to MH-WH","Source Warehouse Stock",
      "Source Sufficiency","Source Hint","to be plan","Qty as per Case Pack","Priority"];
    const csvRows = rows.map((row) => [
      row.depotName, row.skuCode, row.productName, row.brand, row.casePack,
      row.stockOnHand, row.damagedStock, row.stockInTransfer,
      row.last30DaysSales, row.last7DaysSales, row.netDepotStock,
      row.dailySales30.toFixed(2), row.dailySales7.toFixed(2),
      row.dailyDemand.toFixed(2), row.currentDoi.toFixed(2),
      row.replenishmentStatus, row.openOrders, row.replenishmentQty,
      row.slAmbientStock, row.motherHubStock, row.sitToMhWh, row.sourceWarehouseStock,
      row.sourceSufficiency, row.sourceHint, row.toBePlanned, row.qtyAsPerCasePack, row.priority
    ]);
    const csv  = [headers, ...csvRows].map((line) => line.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href  = URL.createObjectURL(blob);
    link.download = `b2c-replenishment-${label || "filtered"}-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function csvCell(value) {
    const cell = String(value === null || value === undefined ? "" : value);
    return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  }

  // â”€â”€ Event wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Download buttons: click downloads filtered by priority bucket
  document.querySelectorAll("[data-download-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p    = btn.getAttribute("data-download-status");
      const rows = p
        ? state.calculatedRows.filter(r => r.priority === p)
        : state.calculatedRows;
      exportRows(rows, p || "all");
    });
  });

  // View toggle
  const viewToggleBtn = document.getElementById("viewToggleBtn");
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener("click", () => {
      detailedView = !detailedView;
      viewToggleBtn.textContent = detailedView ? "Compact View" : "Detailed View";
      const thead = document.getElementById("planThead");
      if (thead) thead.innerHTML = detailedView ? DETAILED_THEAD : COMPACT_THEAD;
      renderTable();
    });
  }

  // Clear Data - wipes browser memory AND the shared PLAN_DATA sheet
  if (els.clearDataBtn) {
    els.clearDataBtn.addEventListener("click", async () => {
      const hasData = state.rawRows.length > 0;
      const msg = hasData
        ? "This will clear the plan from everyone's view (the shared sheet will be wiped).\nAll team members will need to wait for a new upload. Continue?"
        : "Clear the shared plan sheet?";
      if (!window.confirm(msg)) return;

      // Wipe local state immediately
      state.rawRows = []; state.calculatedRows = []; state.filteredRows = [];
      renderSummary(); updateDownloadPanel(); renderTable();
      els.lastUpdated.textContent = "Clearing shared plan...";
      setDataState("Clearing...", false);
      setUploadStatus("", "");

      // Also clear the backend sheet
      try {
        if (config.apiUrl) {
          const url = new URL(config.apiUrl);
          url.searchParams.set("action", "clearPlan");
          // Use no-cors fetch; we don't need the response body
          await fetch(url.toString()).catch(() => {});
        } else if (window.google && google.script && google.script.run) {
          google.script.run.clearPlanSheet_();
        }
        els.lastUpdated.textContent = "Plan cleared - upload a new FG report to begin.";
        setDataState("No data", false);
        showToast("Plan cleared", "The shared sheet has been wiped. Upload a new FG report to reload.", "info", 6000);
      } catch (e) {
        // Local clear already done; sheet clear is best-effort
        els.lastUpdated.textContent = "Local data cleared (sheet clear failed: " + e.message + ")";
        setDataState("No data", false);
        showToast("Local data cleared", "Sheet could not be cleared: " + e.message, "info", 6000);
      }
    });
  }

  els.downloadAllBtn.addEventListener("click",     () => exportRows(state.calculatedRows, "all"));
  els.uploadInventoryBtn.addEventListener("click", uploadInventoryFile);
  els.uploadForm.addEventListener("submit",        (e) => e.preventDefault());
  els.refreshBtn.addEventListener("click",         refreshData);

  [els.brandFilter, els.statusFilter, els.sourceFilter,
   els.minDoiInput, els.targetDoiInput, els.searchInput
  ].forEach((input) => input.addEventListener("input", applyFilters));

}());



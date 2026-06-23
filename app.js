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

  const els = {
    refreshBtn: document.getElementById("refreshBtn"),
    downloadAllBtn: document.getElementById("downloadAllBtn"),
    uploadForm: document.getElementById("uploadForm"),
    inventoryFileInput: document.getElementById("inventoryFileInput"),
    uploadInventoryBtn: document.getElementById("uploadInventoryBtn"),
    brandFilter: document.getElementById("brandFilter"),
    statusFilter: document.getElementById("statusFilter"),
    sourceFilter: document.getElementById("sourceFilter"),
    minDoiInput: document.getElementById("minDoiInput"),
    targetDoiInput: document.getElementById("targetDoiInput"),
    searchInput: document.getElementById("searchInput"),
    totalSku: document.getElementById("totalSku"),
    criticalSku: document.getElementById("criticalSku"),
    urgentSku: document.getElementById("urgentSku"),
    plannedQty: document.getElementById("plannedQty"),
    shortSku: document.getElementById("shortSku"),
    lastUpdated: document.getElementById("lastUpdated"),
    dataState: document.getElementById("dataState"),
    tableBody: document.getElementById("tableBody"),
    processingOverlay: document.getElementById("processingOverlay"),
    processingTitle: document.getElementById("processingTitle"),
    processingStatus: document.getElementById("processingStatus")
  };

  els.minDoiInput.value = config.defaultMinDoi || 3;
  els.targetDoiInput.value = config.defaultTargetDoi || 7;

  function numberValue(value) {
    if (value === null || value === undefined || value === "") return 0;
    const parsed = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundUpToCasePack(quantity, casePack) {
    const qty = Math.max(0, Math.ceil(numberValue(quantity)));
    const pack = Math.max(1, Math.ceil(numberValue(casePack)));
    return Math.ceil(qty / pack) * pack;
  }

  function getStatus(currentDoi, minDoi, maxDoi) {
    if (currentDoi <= 1) return "Critical";
    if (currentDoi <= minDoi) return "Urgent";
    if (currentDoi <= maxDoi) return "Replenishment";
    return "OK";
  }


  // ── Brand normalisation ────────────────────────────────────────────────
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
    const key = String(raw).toLowerCase().replace(/\s+/g, "").trim();
    if (BRAND_MAP[key]) return BRAND_MAP[key];
    const keySpaced = String(raw).toLowerCase().trim();
    if (BRAND_MAP[keySpaced]) return BRAND_MAP[keySpaced];
    return String(raw).trim().replace(/\b\w/g, c => c.toUpperCase());
  }

  function calculateRows(rows) {
    // Rows come pre-calculated from code.gs; we pass them through directly.
    // DOI and status are re-derived here so that changes to the Min/Target DOI
    // sliders in the dashboard take effect without a re-upload.
    const minDoi    = Math.max(1, numberValue(els.minDoiInput.value) || 3);
    const targetDoi = Math.max(minDoi, numberValue(els.targetDoiInput.value) || 7);

    return rows.map((row) => {
      const stockOnHand       = numberValue(row.stockOnHand);
      const damagedStock      = numberValue(row.damagedStock);
      const stockInTransfer   = numberValue(row.stockInTransfer);
      const last30DaysSales   = numberValue(row.last30DaysSales);
      const last7DaysSales    = numberValue(row.last7DaysSales);
      const openOrders        = numberValue(row.openOrders);
      const casePack          = numberValue(row.casePack) || 1;
      const slAmbientStock    = numberValue(row.slAmbientStock);
      const motherHubStock    = numberValue(row.motherHubStock);
      const sitToMhWh         = numberValue(row.sitToMhWh);
      const sourceWarehouseStock = slAmbientStock + motherHubStock;

      const netDepotStock = Math.max(0, stockOnHand + stockInTransfer);
      const dailySales30  = last30DaysSales / 30;
      const dailySales7   = last7DaysSales  / 7;
      const dailyDemand   = Math.max(dailySales30, dailySales7);
      const currentDoi    = dailyDemand > 0 ? netDepotStock / dailyDemand : 0;

      // Mirror Master_Logic col S status formula
      const hasActivity = last30DaysSales > 0 || last7DaysSales > 0 || openOrders > 0;
      let replenishmentStatus;
      if (!hasActivity) {
        replenishmentStatus = "Ok";
      } else if (dailyDemand === 0) {
        replenishmentStatus = "Urgent";
      } else if (currentDoi < minDoi) {
        replenishmentStatus = "Urgent";
      } else if (currentDoi < targetDoi) {
        replenishmentStatus = "Replenish";
      } else {
        replenishmentStatus = "Ok";
      }

      // Replenishment Qty = ROUNDUP(MAX(0, targetDoi*demand - netStock), 0)
      const rawRequirement   = Math.max(0, targetDoi * dailyDemand - netDepotStock);
      const replenishmentQty = replenishmentStatus === "Ok" ? 0 : Math.ceil(rawRequirement);

      // Source sufficiency mirrors Master_Logic col Z
      let sourceSufficiency;
      if (replenishmentQty === 0) {
        sourceSufficiency = "Not Req.";
      } else if (sourceWarehouseStock === 0) {
        sourceSufficiency = "OOS";
      } else if (replenishmentQty <= sourceWarehouseStock) {
        sourceSufficiency = "SUFFICIENT";
      } else {
        sourceSufficiency = "SHORT";
      }

      // Priority = pure DOI bucket: P0 / P1 / P2 / EXCESS
      let priority;
      if (!hasActivity)                  priority = "EXCESS";
      else if (currentDoi <= 1)          priority = "P0";
      else if (currentDoi < minDoi)      priority = "P1";
      else if (currentDoi <= targetDoi)  priority = "P2";
      else                               priority = "EXCESS";

      const toBePlanned      = Math.min(replenishmentQty, sourceWarehouseStock);
      // MROUND(toBePlanned / casePack, 1) * casePack
      const qtyAsPerCasePack = Math.round(toBePlanned / casePack) * casePack;

      const sourceHint = getSourceHint(replenishmentQty, slAmbientStock, motherHubStock);

      return {
        depotName:           "B2C",
        skuCode:             row.skuCode        || "",
        productName:         row.productName    || "",
        brand:               normaliseBrand(row.brand || ""),
        casePack,
        stockOnHand,
        damagedStock,
        stockInTransfer,
        last30DaysSales,
        last7DaysSales,
        openOrders,
        netDepotStock,
        dailySales30,
        dailySales7,
        dailyDemand,
        currentDoi,
        replenishmentStatus,
        replenishmentQty,
        slAmbientStock,
        motherHubStock,
        sitToMhWh,
        sourceWarehouseStock,
        sourceSufficiency,
        priority,
        toBePlanned,
        qtyAsPerCasePack,
        sourceHint
      };
    });
  }

  function getSourceHint(requiredQty, slAmbientStock, motherHubStock) {
    if (requiredQty <= 0)                                         return "No transfer needed";
    if (slAmbientStock >= requiredQty)                            return "SL Ambient";
    if (motherHubStock >= requiredQty)                            return "SL Mother Hub";
    if (slAmbientStock + motherHubStock >= requiredQty)           return "Split source";
    if (slAmbientStock > 0 && motherHubStock > 0)                 return "Short: both sources";
    if (slAmbientStock > 0)                                       return "Short: SL Ambient only";
    if (motherHubStock > 0)                                       return "Short: SL Mother Hub only";
    return "No source stock";
  }

  function formatNumber(value, decimals) {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    }).format(numberValue(value));
  }

  function setDataState(label, ok) {
    els.dataState.textContent = label;
    els.dataState.style.color = ok ? "#047857" : "#637083";
  }

  function showProcessing(title, status) {
    els.processingTitle.textContent = title || "Processing";
    els.processingStatus.textContent = status || "Please wait while the replenishment plan is prepared.";
    els.processingOverlay.hidden = false;
  }

  function hideProcessing() {
    els.processingOverlay.hidden = true;
  }

  function populateSelect(select, values) {
    const selected = select.value;
    const first = select.options[0].cloneNode(true);
    select.replaceChildren(first);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = values.includes(selected) ? selected : "";
  }

  function refreshFilterOptions() {
    // Brands are already normalised by calculateRows; deduplicate and sort
    const brands = [...new Set(state.calculatedRows.map((row) => row.brand).filter(Boolean))].sort();
    populateSelect(els.brandFilter, brands);
  }

  function applyFilters() {
    const brand = els.brandFilter.value;
    const status = els.statusFilter.value;
    const source = els.sourceFilter.value;
    const search = els.searchInput.value.trim().toLowerCase();

    state.calculatedRows = calculateRows(state.rawRows);
    state.filteredRows = state.calculatedRows.filter((row) => {
      const matchesSearch = !search ||
        row.skuCode.toLowerCase().includes(search) ||
        row.productName.toLowerCase().includes(search);
      return (!brand || row.brand === brand) &&
        (!status || row.replenishmentStatus === status) &&
        (!source || row.sourceSufficiency === source) &&
        matchesSearch;
    });

    renderSummary();
    renderTable();
  }

  function renderSummary() {
    const rows = state.filteredRows;
    els.totalSku.textContent = formatNumber(rows.length, 0);
    els.criticalSku.textContent = formatNumber(rows.filter((row) => row.priority === "CRITICAL").length, 0);
    els.urgentSku.textContent = formatNumber(rows.filter((row) => row.replenishmentStatus === "Urgent").length, 0);
    els.plannedQty.textContent = formatNumber(rows.reduce((sum, row) => sum + row.toBePlanned, 0), 0);
    els.shortSku.textContent = formatNumber(rows.filter((row) => row.sourceSufficiency === "SHORT" || row.sourceSufficiency === "OOS").length, 0);
  }

  function tagClass(value) {
    return `tag-${String(value).toLowerCase()}`;
  }

  function renderTable() {
    const rows = state.filteredRows;
    if (!rows.length) {
      els.tableBody.innerHTML = `<tr><td class="empty" colspan="17">${getEmptyMessage()}</td></tr>`;
      return;
    }

    els.tableBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.skuCode)}</td>
        <td>${escapeHtml(row.productName)}</td>
        <td>${escapeHtml(row.brand)}</td>
        <td class="numeric">${formatNumber(row.casePack, 0)}</td>
        <td class="numeric">${formatNumber(row.stockOnHand, 0)}</td>
        <td class="numeric">${formatNumber(row.stockInTransfer, 0)}</td>
        <td class="numeric">${formatNumber(row.last30DaysSales, 0)}</td>
        <td class="numeric">${formatNumber(row.last7DaysSales, 0)}</td>
        <td class="numeric">${formatNumber(row.netDepotStock, 0)}</td>
        <td class="numeric">${formatNumber(row.dailyDemand, 1)}</td>
        <td class="numeric">${formatNumber(row.currentDoi, 1)}</td>
        <td><span class="tag ${tagClass(row.replenishmentStatus)}">${row.replenishmentStatus}</span></td>
        <td class="numeric">${formatNumber(row.openOrders, 0)}</td>
        <td class="numeric">${formatNumber(row.replenishmentQty, 0)}</td>
        <td class="numeric">${formatNumber(row.slAmbientStock, 0)}</td>
        <td class="numeric">${formatNumber(row.motherHubStock, 0)}</td>
        <td class="numeric">${formatNumber(row.sitToMhWh, 0)}</td>
        <td class="numeric">${formatNumber(row.sourceWarehouseStock, 0)}</td>
        <td><span class="tag ${tagClass(row.sourceSufficiency)}">${row.sourceSufficiency}</span></td>
        <td>${escapeHtml(row.sourceHint)}</td>
        <td class="numeric">${formatNumber(row.toBePlanned, 0)}</td>
        <td class="numeric">${formatNumber(row.qtyAsPerCasePack, 0)}</td>
        <td><span class="tag ${tagClass(row.priority)}">${row.priority}</span></td>
      </tr>
    `).join("");
  }

  function getEmptyMessage() {
    if (state.rawRows.length) return "No rows match the selected filters.";
    const diag = state.diagnostics;
    if (!diag) return "No replenishment rows returned by the backend.";
    if (diag.message) return `Backend message: ${diag.message}`;
    const parts = [
      `Inventory CSV rows: ${diag.inventoryRows || 0}`,
      `Order CSV rows: ${diag.orderRows || 0}`,
      `Inventory emails: ${diag.inventoryThreads || 0}`,
      `Order emails: ${diag.orderThreads || 0}`,
      `Inventory links: ${diag.inventoryBodyLinks || 0}`,
      `Order links: ${diag.orderBodyLinks || 0}`,
      `Downloaded CSVs: ${(diag.inventoryDownloadedCsv || 0) + (diag.orderDownloadedCsv || 0)}`
    ];
    return `No rows returned. ${parts.join(" | ")}. Check Gmail query, attachment type, and facility/SKU headers.`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  async function fetchRows() {
    setDataState("Loading", false);

    if (window.google && google.script && google.script.run) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          .getReplenishmentPlan({
            minDoi: numberValue(els.minDoiInput.value),
            targetDoi: numberValue(els.targetDoiInput.value)
          });
      });
    }

    if (!config.apiUrl) {
      throw new Error("Set apiUrl in config.js after deploying the Apps Script web app.");
    }

    const url = new URL(config.apiUrl);
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
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Backend request timed out"));
      }, 30000);

      function cleanup() {
        clearTimeout(timer);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      url.searchParams.set("callback", callbackName);
      script.onerror = () => {
        cleanup();
        reject(new Error("Unable to load Apps Script backend"));
      };
      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  async function refreshData() {
    try {
      showProcessing("Refreshing data", "Fetching latest data and preparing the transfer plan.");
      const payload = await fetchRows();
      applyPayload(payload);
    } catch (error) {
      state.rawRows = [];
      state.calculatedRows = [];
      state.filteredRows = [];
      renderSummary();
      renderTable();
      els.lastUpdated.textContent = error.message;
      setDataState("Needs setup", false);
    } finally {
      hideProcessing();
    }
  }

  function applyPayload(payload) {
    if (payload && payload.error) throw new Error(payload.error);
    state.rawRows = Array.isArray(payload) ? payload : payload.rows || [];
    state.lastUpdated = payload.lastUpdated || new Date().toISOString();
    state.diagnostics = payload.diagnostics || null;
    state.calculatedRows = calculateRows(state.rawRows);
    refreshFilterOptions();
    applyFilters();
    els.lastUpdated.textContent = `Last updated ${new Date(state.lastUpdated).toLocaleString("en-IN")}`;
    setDataState(`${state.rawRows.length} rows`, true);
  }

  function uploadInventoryFile() {
    const file = els.inventoryFileInput.files && els.inventoryFileInput.files[0];
    if (!file) {
      window.alert("Select the FG inventory CSV file first.");
      return;
    }

    showProcessing("Processing FG report", "Uploading the FG inventory file. The backend will combine it with order sales data and refresh the table.");

    if (window.google && google.script && google.script.run) {
      uploadInventoryWithGoogleRun(file);
      return;
    }

    uploadInventoryWithIframe(file);
  }

  function uploadInventoryWithGoogleRun(file) {
    const reader = new FileReader();
    reader.onload = () => {
      google.script.run
        .withSuccessHandler((payload) => {
          try {
            applyPayload(payload);
          } catch (error) {
            els.lastUpdated.textContent = error.message;
            setDataState("Upload failed", false);
          } finally {
            hideProcessing();
          }
        })
        .withFailureHandler((error) => {
          els.lastUpdated.textContent = error.message || String(error);
          setDataState("Upload failed", false);
          hideProcessing();
        })
        .processUploadedInventoryText(String(reader.result || ""), {
          fileName: file.name,
          minDoi: numberValue(els.minDoiInput.value),
          targetDoi: numberValue(els.targetDoiInput.value)
        });
    };
    reader.onerror = () => {
      els.lastUpdated.textContent = "Unable to read selected file.";
      setDataState("Upload failed", false);
      hideProcessing();
    };
    reader.readAsText(file);
  }

  function uploadInventoryWithIframe(file) {
    if (!config.apiUrl) {
      els.lastUpdated.textContent = "Set apiUrl in config.js before uploading files.";
      setDataState("Needs setup", false);
      hideProcessing();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => submitInventoryTextWithIframe(file.name, String(reader.result || ""));
    reader.onerror = () => {
      els.lastUpdated.textContent = "Unable to read selected file.";
      setDataState("Upload failed", false);
      hideProcessing();
    };
    reader.readAsText(file);
  }

  function submitInventoryTextWithIframe(fileName, inventoryText) {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    iframe.name = `uploadFrame_${uploadId}`;
    iframe.hidden = true;
    document.body.appendChild(iframe);

    const timeout = setTimeout(() => {
      cleanup();
      els.lastUpdated.textContent = "Upload timed out before the backend returned a result.";
      setDataState("Upload timed out", false);
      hideProcessing();
    }, 180000);

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }

    function onMessage(event) {
      const data = event.data || {};
      if (!data || data.type !== "replenishmentUploadResult" || data.uploadId !== uploadId) return;
      cleanup();
      try {
        if (data.error) throw new Error(data.error);
        applyPayload(data.payload);
      } catch (error) {
        els.lastUpdated.textContent = error.message;
        setDataState("Upload failed", false);
      } finally {
        hideProcessing();
      }
    }

    window.addEventListener("message", onMessage);

    // Send metadata as URL query params (small, safe).
    // Send the CSV as the raw POST body using enctype="text/plain" so that
    // Apps Script reads it via e.postData.getDataAsString() rather than
    // e.parameter — this bypasses the ~10 MB e.parameter size limit that
    // causes 2-5 MB FG reports to arrive truncated or empty.
    const url = new URL(config.apiUrl);
    url.searchParams.set("action", "uploadInventory");
    url.searchParams.set("uploadId", uploadId);
    url.searchParams.set("minDoi", els.minDoiInput.value);
    url.searchParams.set("targetDoi", els.targetDoiInput.value);
    url.searchParams.set("inventoryFileName", fileName);

    const form = document.createElement("form");
    form.method  = "POST";
    form.action  = url.toString();
    form.target  = iframe.name;
    form.enctype = "text/plain";  // raw body; Apps Script strips "csvBody=" prefix

    const field = document.createElement("input");
    field.type  = "hidden";
    field.name  = "csvBody";
    field.value = inventoryText;
    form.appendChild(field);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }

  function setHiddenField(name, value) {
    let input = els.uploadForm.querySelector(`input[name="${name}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      els.uploadForm.appendChild(input);
    }
    input.value = value;
  }

  function exportRows(rows, label) {
    const headers = [
      "Depot Name",
      "SkuCode",
      "Product Name",
      "Brand",
      "Case Pack",
      "Stock on Hand",
      "Damaged Stock",
      "Stock In Transfer",
      "Last 30 days Sales",
      "Last 7 days Sales",
      "Net Depot Stock",
      "Daily Sales 30D",
      "Daily Sales 7D",
      "Daily Demand",
      "Current DOI",
      "Replenishment Status",
      "Open Orders",
      "Replenishment Qty",
      "SL Stock (Ambient)",
      "MH Stock",
      "SIT to MH-WH",
      "Source Warehouse Stock",
      "Source Sufficiency",
      "Source Hint",
      "to be plan",
      "Qty as per Case Pack",
      "Priority"
    ];
    const csvRows = rows.map((row) => [
      row.depotName,
      row.skuCode,
      row.productName,
      row.brand,
      row.casePack,
      row.stockOnHand,
      row.damagedStock,
      row.stockInTransfer,
      row.last30DaysSales,
      row.last7DaysSales,
      row.netDepotStock,
      row.dailySales30.toFixed(2),
      row.dailySales7.toFixed(2),
      row.dailyDemand.toFixed(2),
      row.currentDoi.toFixed(2),
      row.replenishmentStatus,
      row.openOrders,
      row.replenishmentQty,
      row.slAmbientStock,
      row.motherHubStock,
      row.sitToMhWh,
      row.sourceWarehouseStock,
      row.sourceSufficiency,
      row.sourceHint,
      row.toBePlanned,
      row.qtyAsPerCasePack,
      row.priority
    ]);
    const csv = [headers, ...csvRows].map((line) => line.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.download = `b2c-replenishment-${label || "filtered"}-${stamp}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function csvCell(value) {
    const cell = String(value === null || value === undefined ? "" : value);
    return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  }

  // ── Download buttons — labels update live as DOI inputs change ──────────
  function updateDownloadLabels() {
    const minD    = Math.max(1, numberValue(els.minDoiInput.value) || 3);
    const targetD = Math.max(minD, numberValue(els.targetDoiInput.value) || 7);
    document.querySelectorAll("[data-download-status]").forEach((btn) => {
      const p = btn.getAttribute("data-download-status");
      if (p === "P0")  btn.textContent = "P0  ≤1 DOI";
      if (p === "P1")  btn.textContent = `P1  >1 & <${minD} DOI`;
      if (p === "P2")  btn.textContent = `P2  ≥${minD} & <${targetD} DOI`;
      if (p === "")    btn.textContent = "Download Filtered";
    });
  }
  updateDownloadLabels();

  document.querySelectorAll("[data-download-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const status = button.getAttribute("data-download-status");
      const rows = status
        ? state.filteredRows.filter((row) => row.priority === status)
        : state.filteredRows;
      exportRows(rows, status || "filtered");
    });
  });

  // ── View toggle ───────────────────────────────────────────────────────────
  const viewToggleBtn = document.getElementById("viewToggleBtn");
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener("click", () => {
      detailedView = !detailedView;
      viewToggleBtn.textContent = detailedView ? "Compact View" : "Detailed View";
      // Swap thead to match active view
      const thead = document.getElementById("planThead");
      if (thead) {
        thead.innerHTML = detailedView ? DETAILED_THEAD : COMPACT_THEAD;
      }
      renderTable();
    });
  }

  els.downloadAllBtn.addEventListener("click", () => exportRows(state.calculatedRows, "all"));
  els.uploadInventoryBtn.addEventListener("click", uploadInventoryFile);
  els.uploadForm.addEventListener("submit", (event) => event.preventDefault());
  els.refreshBtn.addEventListener("click", refreshData);
  [
    els.brandFilter,
    els.statusFilter,
    els.sourceFilter,
    els.minDoiInput,
    els.targetDoiInput,
    els.searchInput
  ].forEach((input) => input.addEventListener("input", (e) => {
    applyFilters();
    if (e.target === els.minDoiInput || e.target === els.targetDoiInput) {
      updateDownloadLabels();
    }
  }));

  window.replenishmentEngine = {
    calculateRows,
    roundUpToCasePack,
    getStatus
  };
}());

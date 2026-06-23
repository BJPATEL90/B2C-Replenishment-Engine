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
    destinationFilter: document.getElementById("destinationFilter"),
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
    tableBody: document.getElementById("tableBody")
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

  function calculateRows(rows) {
    const minDoi = Math.max(1, numberValue(els.minDoiInput.value) || 3);
    const targetDoi = Math.max(minDoi, numberValue(els.targetDoiInput.value) || 7);

    return rows.map((row) => {
      const stockOnHand = numberValue(row.stockOnHand);
      const stockInTransfer = numberValue(row.stockInTransfer);
      const last30DaysSales = numberValue(row.last30DaysSales);
      const last7DaysSales = numberValue(row.last7DaysSales);
      const casePack = numberValue(row.casePack) || 1;
      const netDepotStock = stockOnHand + stockInTransfer;
      const dailySales30 = last30DaysSales / 30;
      const dailySales7 = last7DaysSales / 7;
      const dailyDemand = Math.max(dailySales30, dailySales7);
      const currentDoi = dailyDemand > 0 ? netDepotStock / dailyDemand : 999;
      const status = getStatus(currentDoi, minDoi, targetDoi);
      const rawRequirement = Math.max(0, targetDoi * dailyDemand - netDepotStock);
      const replenishmentQty = status === "OK" ? 0 : roundUpToCasePack(rawRequirement, casePack);
      const slAmbientStock = numberValue(row.slAmbientStock);
      const motherHubStock = numberValue(row.motherHubStock);
      const sitToMotherHub = numberValue(row.sitToMotherHub);
      const sourceWarehouseStock = slAmbientStock + motherHubStock;
      const sourceSufficiency = sourceWarehouseStock >= replenishmentQty ? "SUFFICIENT" : "SHORT";
      const sourceHint = getSourceHint(replenishmentQty, slAmbientStock, motherHubStock);
      const toBePlanned = Math.min(replenishmentQty, sourceWarehouseStock);

      return {
        destination: row.destination || row.depotName || "",
        skuCode: row.skuCode || "",
        productName: row.productName || "",
        brand: row.brand || "",
        casePack,
        stockOnHand,
        damagedStock: numberValue(row.damagedStock),
        stockInTransfer,
        last30DaysSales,
        last7DaysSales,
        netDepotStock,
        dailyDemand,
        currentDoi,
        status,
        openOrders: numberValue(row.openOrders),
        replenishmentQty,
        slAmbientStock,
        motherHubStock,
        sitToMotherHub,
        sourceWarehouseStock,
        sourceSufficiency,
        sourceHint,
        toBePlanned
      };
    });
  }

  function getSourceHint(requiredQty, slAmbientStock, motherHubStock) {
    if (requiredQty <= 0) return "No transfer needed";
    if (slAmbientStock >= requiredQty) return "SL Ambient";
    if (motherHubStock >= requiredQty) return "SL Mother Hub";
    if (slAmbientStock + motherHubStock >= requiredQty) return "Split source";
    if (slAmbientStock > 0 && motherHubStock > 0) return "Short: both sources";
    if (slAmbientStock > 0) return "Short: SL Ambient";
    if (motherHubStock > 0) return "Short: SL Mother Hub";
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
    const destinations = [...new Set(state.calculatedRows.map((row) => row.destination).filter(Boolean))].sort();
    const brands = [...new Set(state.calculatedRows.map((row) => row.brand).filter(Boolean))].sort();
    populateSelect(els.destinationFilter, destinations);
    populateSelect(els.brandFilter, brands);
  }

  function applyFilters() {
    const destination = els.destinationFilter.value;
    const brand = els.brandFilter.value;
    const status = els.statusFilter.value;
    const source = els.sourceFilter.value;
    const search = els.searchInput.value.trim().toLowerCase();

    state.calculatedRows = calculateRows(state.rawRows);
    state.filteredRows = state.calculatedRows.filter((row) => {
      const matchesSearch = !search ||
        row.skuCode.toLowerCase().includes(search) ||
        row.productName.toLowerCase().includes(search);
      return (!destination || row.destination === destination) &&
        (!brand || row.brand === brand) &&
        (!status || row.status === status) &&
        (!source || row.sourceSufficiency === source) &&
        matchesSearch;
    });

    renderSummary();
    renderTable();
  }

  function renderSummary() {
    const rows = state.filteredRows;
    els.totalSku.textContent = formatNumber(rows.length, 0);
    els.criticalSku.textContent = formatNumber(rows.filter((row) => row.status === "Critical").length, 0);
    els.urgentSku.textContent = formatNumber(rows.filter((row) => row.status === "Urgent").length, 0);
    els.plannedQty.textContent = formatNumber(rows.reduce((sum, row) => sum + row.toBePlanned, 0), 0);
    els.shortSku.textContent = formatNumber(rows.filter((row) => row.sourceSufficiency === "SHORT").length, 0);
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
        <td>${escapeHtml(row.destination)}</td>
        <td>${escapeHtml(row.skuCode)}</td>
        <td>${escapeHtml(row.productName)}</td>
        <td>${escapeHtml(row.brand)}</td>
        <td class="numeric">${formatNumber(row.casePack, 0)}</td>
        <td class="numeric">${formatNumber(row.netDepotStock, 0)}</td>
        <td class="numeric">${formatNumber(row.dailyDemand, 1)}</td>
        <td class="numeric">${formatNumber(row.currentDoi, 1)}</td>
        <td><span class="tag ${tagClass(row.status)}">${row.status}</span></td>
        <td class="numeric">${formatNumber(row.replenishmentQty, 0)}</td>
        <td class="numeric">${formatNumber(row.slAmbientStock, 0)}</td>
        <td class="numeric">${formatNumber(row.motherHubStock, 0)}</td>
        <td class="numeric">${formatNumber(row.sitToMotherHub, 0)}</td>
        <td class="numeric">${formatNumber(row.sourceWarehouseStock, 0)}</td>
        <td><span class="tag ${tagClass(row.sourceSufficiency)}">${row.sourceSufficiency}</span></td>
        <td>${escapeHtml(row.sourceHint)}</td>
        <td class="numeric">${formatNumber(row.toBePlanned, 0)}</td>
      </tr>
    `).join("");
  }

  function getEmptyMessage() {
    if (state.rawRows.length) return "No rows match the selected filters.";
    const diag = state.diagnostics;
    if (!diag) return "No replenishment rows returned by the backend.";
    const parts = [
      `Inventory CSV rows: ${diag.inventoryRows || 0}`,
      `Order CSV rows: ${diag.orderRows || 0}`,
      `Inventory emails: ${diag.inventoryThreads || 0}`,
      `Order emails: ${diag.orderThreads || 0}`
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
      const payload = await fetchRows();
      state.rawRows = Array.isArray(payload) ? payload : payload.rows || [];
      state.lastUpdated = payload.lastUpdated || new Date().toISOString();
      state.diagnostics = payload.diagnostics || null;
      state.calculatedRows = calculateRows(state.rawRows);
      refreshFilterOptions();
      applyFilters();
      els.lastUpdated.textContent = `Last updated ${new Date(state.lastUpdated).toLocaleString("en-IN")}`;
      setDataState(`${state.rawRows.length} rows`, true);
    } catch (error) {
      state.rawRows = [];
      state.calculatedRows = [];
      state.filteredRows = [];
      renderSummary();
      renderTable();
      els.lastUpdated.textContent = error.message;
      setDataState("Needs setup", false);
    }
  }

  function exportRows(rows, label) {
    const headers = [
      "Destination",
      "SkuCode",
      "Product Name",
      "Brand",
      "Case Pack",
      "Net Depot Stock",
      "Daily Demand",
      "Current DOI",
      "Replenishment Status",
      "Replenishment Qty",
      "SL Ambient Stock",
      "Mother Hub Stock",
      "SIT to MH-WH Info",
      "Source Warehouse Stock",
      "Source Sufficiency",
      "Source Hint",
      "To Be Planned"
    ];
    const csvRows = rows.map((row) => [
      row.destination,
      row.skuCode,
      row.productName,
      row.brand,
      row.casePack,
      row.netDepotStock,
      row.dailyDemand.toFixed(2),
      row.currentDoi.toFixed(2),
      row.status,
      row.replenishmentQty,
      row.slAmbientStock,
      row.motherHubStock,
      row.sitToMotherHub,
      row.sourceWarehouseStock,
      row.sourceSufficiency,
      row.sourceHint,
      row.toBePlanned
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

  document.querySelectorAll("[data-download-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const status = button.getAttribute("data-download-status");
      const rows = status ? state.filteredRows.filter((row) => row.status === status) : state.filteredRows;
      exportRows(rows, status || "filtered");
    });
  });

  els.downloadAllBtn.addEventListener("click", () => exportRows(state.calculatedRows, "all"));
  els.refreshBtn.addEventListener("click", refreshData);
  [
    els.destinationFilter,
    els.brandFilter,
    els.statusFilter,
    els.sourceFilter,
    els.minDoiInput,
    els.targetDoiInput,
    els.searchInput
  ].forEach((input) => input.addEventListener("input", applyFilters));

  refreshData();

  window.replenishmentEngine = {
    calculateRows,
    roundUpToCasePack,
    getStatus
  };
}());

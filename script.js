/**
 * FarmTrack Management System - Frontend JavaScript
 * Connects to the Express & SQLite backend (/api/...)
 * with automatic fallback to localStorage if accessed offline.
 */

// ==========================================
// DEFAULT (CLEAN) STATE
// ==========================================

const DEFAULT_FARMERS = [];
const DEFAULT_FARMER_STATS = { totalFarmers: 0, activeFarms: 0, totalArea: 0 };

const DEFAULT_SALES = [];
const DEFAULT_SALES_STATS = { totalSales: 0, completedSales: 0, produceSold: 0 };

const DEFAULT_TRACKING = [];
const DEFAULT_TRACKING_STATS = { activeDeliveries: 0, inTransitKg: 0, deliveredCount: 0 };


// ==========================================
// STORAGE & API HELPERS
// ==========================================

const isHttpServer = window.location.protocol.startsWith("http");

// Clear any old mock demo data from previous browser sessions
(function purgeLegacyDemoData() {
    try {
        const raw = localStorage.getItem("farmtrack_farmers");
        if (raw && raw.includes("John Kamau")) {
            localStorage.removeItem("farmtrack_farmers");
            localStorage.removeItem("farmtrack_farmer_stats");
            localStorage.removeItem("farmtrack_sales");
            localStorage.removeItem("farmtrack_sales_stats");
            localStorage.removeItem("farmtrack_tracking");
            localStorage.removeItem("farmtrack_tracking_stats");
        }
    } catch (e) {
        // Ignore storage access errors
    }
})();

async function apiRequest(endpoint, options = {}) {
    if (!isHttpServer) return null;
    try {
        const res = await fetch(endpoint, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        console.warn(`API call ${endpoint} failed, falling back to local storage:`, e.message);
        return null;
    }
}

function getStorage(key, fallback) {
    try {
        const item = localStorage.getItem(key);
        if (item === null) {
            const clone = JSON.parse(JSON.stringify(fallback));
            setStorage(key, clone);
            return clone;
        }
        return JSON.parse(item);
    } catch (e) {
        console.error("Storage read error:", e);
        return JSON.parse(JSON.stringify(fallback));
    }
}

function setStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error("Storage write error:", e);
    }
}

function showAlert(alertElId, message, type = "success") {
    const alertEl = document.getElementById(alertElId);
    if (!alertEl) return;

    alertEl.className = `alert alert-${type} show`;
    alertEl.textContent = message;

    setTimeout(() => {
        alertEl.classList.remove("show");
    }, 4500);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ==========================================
// 1. FARMERS MANAGEMENT
// ==========================================

async function initFarmersPage() {
    const form = document.getElementById("farmerForm");
    const tbody = document.getElementById("farmersTableBody");
    if (!form || !tbody) return;

    let farmers = [];
    let stats = getStorage("farmtrack_farmer_stats", DEFAULT_FARMER_STATS);

    // Fetch from Backend API
    const apiData = await apiRequest("/api/farmers");
    if (apiData && Array.isArray(apiData)) {
        farmers = apiData;
    } else {
        farmers = getStorage("farmtrack_farmers", DEFAULT_FARMERS);
    }

    const statsData = await apiRequest("/api/dashboard/stats");
    if (statsData && statsData.farmers) {
        stats = statsData.farmers;
    } else {
        // Calculate locally if offline
        stats.totalFarmers = farmers.length;
        stats.activeFarms = farmers.length;
        stats.totalArea = Number(farmers.reduce((sum, f) => sum + (Number(f.size) || 0), 0).toFixed(1));
    }

    function renderStats() {
        const totalFarmersEl = document.getElementById("statTotalFarmers");
        const activeFarmsEl = document.getElementById("statActiveFarms");
        const totalAreaEl = document.getElementById("statTotalArea");

        if (totalFarmersEl) totalFarmersEl.textContent = stats.totalFarmers;
        if (activeFarmsEl) activeFarmsEl.textContent = stats.activeFarms;
        if (totalAreaEl) totalAreaEl.textContent = `${stats.totalArea} Acres`;
    }

    function renderTable() {
        tbody.innerHTML = "";
        if (farmers.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No registered farmers yet. Add your first farmer above.</td></tr>`;
            return;
        }

        farmers.forEach((farmer) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${escapeHtml(farmer.id)}</strong></td>
                <td>${escapeHtml(farmer.name)}</td>
                <td>${escapeHtml(farmer.phone)}</td>
                <td>${escapeHtml(farmer.location)}</td>
                <td>${farmer.size} Acres</td>
                <td>${escapeHtml(farmer.crop)}</td>
                <td><button class="btn-delete" type="button" data-id="${escapeHtml(farmer.id)}">Delete</button></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-delete").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                deleteFarmer(id);
            });
        });
    }

    async function deleteFarmer(id) {
        const farmerToDelete = farmers.find(f => f.id === id);
        if (!farmerToDelete) return;

        if (!confirm(`Are you sure you want to remove farmer ${farmerToDelete.name} (ID: ${id})?`)) {
            return;
        }

        await apiRequest(`/api/farmers/${encodeURIComponent(id)}`, { method: "DELETE" });

        farmers = farmers.filter(f => f.id !== id);
        stats.totalFarmers = Math.max(0, stats.totalFarmers - 1);
        stats.activeFarms = Math.max(0, stats.activeFarms - 1);
        stats.totalArea = Number(Math.max(0, stats.totalArea - Number(farmerToDelete.size)).toFixed(1));

        setStorage("farmtrack_farmers", farmers);
        setStorage("farmtrack_farmer_stats", stats);

        renderStats();
        renderTable();
        showAlert("farmerAlert", `Farmer ${farmerToDelete.name} removed successfully.`, "success");
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const id = document.getElementById("farmerId").value.trim();
        const name = document.getElementById("farmerName").value.trim();
        const phone = document.getElementById("farmerPhone").value.trim();
        const location = document.getElementById("farmerLocation").value.trim();
        const size = parseFloat(document.getElementById("farmSize").value);
        const crop = document.getElementById("mainCrop").value;

        if (!id || !name || !phone || !location || isNaN(size) || !crop) {
            showAlert("farmerAlert", "Please fill in all required fields properly.", "error");
            return;
        }

        if (farmers.some(f => f.id.toLowerCase() === id.toLowerCase())) {
            showAlert("farmerAlert", `Farmer with ID "${id}" is already registered. Please check the ID.`, "error");
            return;
        }

        const newFarmer = { id, name, phone, location, size, crop };

        // Save to backend API
        const apiRes = await apiRequest("/api/farmers", {
            method: "POST",
            body: JSON.stringify(newFarmer)
        });

        farmers.unshift(newFarmer);
        stats.totalFarmers += 1;
        stats.activeFarms += 1;
        stats.totalArea = Number((stats.totalArea + size).toFixed(1));

        setStorage("farmtrack_farmers", farmers);
        setStorage("farmtrack_farmer_stats", stats);

        renderStats();
        renderTable();
        form.reset();

        showAlert("farmerAlert", `Farmer ${name} (ID: ${id}) registered successfully!`, "success");
    });

    renderStats();
    renderTable();
}


// ==========================================
// 2. SALES MANAGEMENT
// ==========================================

async function initSalesPage() {
    const form = document.getElementById("saleForm");
    const tbody = document.getElementById("salesTableBody");
    if (!form || !tbody) return;

    let sales = [];
    let stats = getStorage("farmtrack_sales_stats", DEFAULT_SALES_STATS);
    let farmers = [];

    // Fetch farmers for dropdown
    const apiFarmers = await apiRequest("/api/farmers");
    if (apiFarmers && Array.isArray(apiFarmers)) {
        farmers = apiFarmers;
    } else {
        farmers = getStorage("farmtrack_farmers", DEFAULT_FARMERS);
    }

    const apiSales = await apiRequest("/api/sales");
    if (apiSales && Array.isArray(apiSales)) {
        sales = apiSales;
    } else {
        sales = getStorage("farmtrack_sales", DEFAULT_SALES);
    }

    const statsData = await apiRequest("/api/dashboard/stats");
    if (statsData && statsData.sales) {
        stats = statsData.sales;
    } else {
        stats.completedSales = sales.length;
        stats.totalSales = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
        stats.produceSold = sales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    }

    // Populate Farmer select
    const farmerSelect = document.getElementById("farmerSelect");
    if (farmerSelect) {
        if (farmers.length === 0) {
            farmerSelect.innerHTML = `<option value="" disabled selected>No registered farmers yet (Register on Farmers page first)</option>`;
        } else {
            farmerSelect.innerHTML = `<option value="" disabled selected>Select farmer</option>`;
            farmers.forEach(f => {
                const opt = document.createElement("option");
                opt.value = f.name;
                opt.textContent = `${f.name} (ID: ${f.id})`;
                farmerSelect.appendChild(opt);
            });
        }
    }

    const dateInput = document.getElementById("saleDate");
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }

    function renderStats() {
        const totalSalesEl = document.getElementById("statTotalSales");
        const completedSalesEl = document.getElementById("statCompletedSales");
        const produceSoldEl = document.getElementById("statProduceSold");

        if (totalSalesEl) totalSalesEl.textContent = `KSh ${Number(stats.totalSales).toLocaleString()}`;
        if (completedSalesEl) completedSalesEl.textContent = stats.completedSales;
        if (produceSoldEl) produceSoldEl.textContent = `${Number(stats.produceSold).toLocaleString()} KG`;
    }

    function renderTable() {
        tbody.innerHTML = "";
        if (sales.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No sales recorded yet. Record a new sale above.</td></tr>`;
            return;
        }

        sales.forEach((sale) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${escapeHtml(sale.id)}</strong></td>
                <td>${escapeHtml(sale.date || "N/A")}</td>
                <td>${escapeHtml(sale.farmer)}</td>
                <td>${escapeHtml(sale.produce)}</td>
                <td>${Number(sale.quantity).toLocaleString()} KG</td>
                <td>KSh ${Number(sale.price).toLocaleString()}</td>
                <td><strong>KSh ${Number(sale.total).toLocaleString()}</strong></td>
                <td>${escapeHtml(sale.buyer)}</td>
                <td><button class="btn-delete" type="button" data-id="${escapeHtml(sale.id)}">Delete</button></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-delete").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                deleteSale(id);
            });
        });
    }

    async function deleteSale(id) {
        const saleToDelete = sales.find(s => s.id === id);
        if (!saleToDelete) return;

        if (!confirm(`Are you sure you want to delete sale record ${id}?`)) {
            return;
        }

        await apiRequest(`/api/sales/${encodeURIComponent(id)}`, { method: "DELETE" });

        sales = sales.filter(s => s.id !== id);
        stats.completedSales = Math.max(0, stats.completedSales - 1);
        stats.totalSales = Math.max(0, stats.totalSales - Number(saleToDelete.total));
        stats.produceSold = Math.max(0, stats.produceSold - Number(saleToDelete.quantity));

        setStorage("farmtrack_sales", sales);
        setStorage("farmtrack_sales_stats", stats);

        renderStats();
        renderTable();
        showAlert("saleAlert", `Sale ${id} deleted successfully.`, "success");
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const id = document.getElementById("saleId").value.trim();
        const farmer = document.getElementById("farmerSelect").value;
        const produce = document.getElementById("produceSelect").value;
        const quantity = parseFloat(document.getElementById("saleQuantity").value);
        const price = parseFloat(document.getElementById("salePrice").value);
        const buyer = document.getElementById("buyerName").value.trim();
        const date = document.getElementById("saleDate").value;

        if (!farmer) {
            showAlert("saleAlert", "Please register a farmer first on the Farmers page.", "error");
            return;
        }

        if (!id || !farmer || !produce || isNaN(quantity) || isNaN(price) || !buyer || !date) {
            showAlert("saleAlert", "Please fill in all required fields properly.", "error");
            return;
        }

        if (quantity <= 0 || price <= 0) {
            showAlert("saleAlert", "Quantity and Price must be greater than zero.", "error");
            return;
        }

        if (sales.some(s => s.id.toLowerCase() === id.toLowerCase())) {
            showAlert("saleAlert", `Sale ID "${id}" is already recorded. Please use a unique ID.`, "error");
            return;
        }

        const total = quantity * price;
        const newSale = { id, date, farmer, produce, quantity, price, total, buyer };

        await apiRequest("/api/sales", {
            method: "POST",
            body: JSON.stringify(newSale)
        });

        sales.unshift(newSale);
        stats.completedSales += 1;
        stats.totalSales += total;
        stats.produceSold += quantity;

        setStorage("farmtrack_sales", sales);
        setStorage("farmtrack_sales_stats", stats);

        renderStats();
        renderTable();
        form.reset();

        if (dateInput) {
            dateInput.value = new Date().toISOString().split("T")[0];
        }

        showAlert("saleAlert", `Sale ${id} recorded successfully! Total: KSh ${total.toLocaleString()}`, "success");
    });

    renderStats();
    renderTable();
}


// ==========================================
// 3. PRODUCE TRACKING MANAGEMENT
// ==========================================

async function initTrackingPage() {
    const form = document.getElementById("trackingForm");
    const tbody = document.getElementById("trackingTableBody");
    if (!form || !tbody) return;

    let tracking = [];
    let stats = getStorage("farmtrack_tracking_stats", DEFAULT_TRACKING_STATS);
    let farmers = [];

    const apiFarmers = await apiRequest("/api/farmers");
    if (apiFarmers && Array.isArray(apiFarmers)) {
        farmers = apiFarmers;
    } else {
        farmers = getStorage("farmtrack_farmers", DEFAULT_FARMERS);
    }

    const apiTracking = await apiRequest("/api/tracking");
    if (apiTracking && Array.isArray(apiTracking)) {
        tracking = apiTracking;
    } else {
        tracking = getStorage("farmtrack_tracking", DEFAULT_TRACKING);
    }

    const statsData = await apiRequest("/api/dashboard/stats");
    if (statsData && statsData.tracking) {
        stats = statsData.tracking;
    } else {
        stats.activeDeliveries = tracking.filter(t => t.status !== "Delivered").length;
        stats.inTransitKg = tracking.filter(t => t.status === "In Transit").reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
        stats.deliveredCount = tracking.filter(t => t.status === "Delivered").length;
    }

    const trackFarmerSelect = document.getElementById("trackFarmer");
    if (trackFarmerSelect) {
        if (farmers.length === 0) {
            trackFarmerSelect.innerHTML = `<option value="" disabled selected>No registered farmers yet (Register on Farmers page first)</option>`;
        } else {
            trackFarmerSelect.innerHTML = `<option value="" disabled selected>Select farmer</option>`;
            farmers.forEach(f => {
                const opt = document.createElement("option");
                opt.value = f.name;
                opt.textContent = `${f.name} (ID: ${f.id})`;
                trackFarmerSelect.appendChild(opt);
            });
        }
    }

    function getStatusClass(status) {
        const s = (status || "").toLowerCase();
        if (s.includes("transit")) return "transit";
        if (s.includes("process")) return "processing";
        if (s.includes("deliver")) return "delivered";
        return "processing";
    }

    function renderStats() {
        const activeEl = document.getElementById("statActiveDeliveries");
        const inTransitEl = document.getElementById("statInTransitKg");
        const deliveredEl = document.getElementById("statDeliveredCount");

        if (activeEl) activeEl.textContent = stats.activeDeliveries;
        if (inTransitEl) inTransitEl.textContent = `${Number(stats.inTransitKg).toLocaleString()} KG`;
        if (deliveredEl) deliveredEl.textContent = stats.deliveredCount;
    }

    function renderTable() {
        tbody.innerHTML = "";
        if (tracking.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No delivery records yet. Add a tracking record above.</td></tr>`;
            return;
        }

        tracking.forEach((item) => {
            const tr = document.createElement("tr");
            const badgeClass = getStatusClass(item.status);
            tr.innerHTML = `
                <td><strong>${escapeHtml(item.id)}</strong></td>
                <td>${escapeHtml(item.farmer)}</td>
                <td>${escapeHtml(item.produce)}</td>
                <td>${Number(item.quantity).toLocaleString()} KG</td>
                <td>${escapeHtml(item.location)}</td>
                <td>${escapeHtml(item.destination)}</td>
                <td><span class="status ${badgeClass}">${escapeHtml(item.status)}</span></td>
                <td><button class="btn-delete" type="button" data-id="${escapeHtml(item.id)}">Delete</button></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-delete").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                deleteTracking(id);
            });
        });
    }

    async function deleteTracking(id) {
        const itemToDelete = tracking.find(t => t.id === id);
        if (!itemToDelete) return;

        if (!confirm(`Are you sure you want to delete tracking record ${id}?`)) {
            return;
        }

        await apiRequest(`/api/tracking/${encodeURIComponent(id)}`, { method: "DELETE" });

        tracking = tracking.filter(t => t.id !== id);

        if (itemToDelete.status === "Delivered") {
            stats.deliveredCount = Math.max(0, stats.deliveredCount - 1);
        } else {
            stats.activeDeliveries = Math.max(0, stats.activeDeliveries - 1);
            if (itemToDelete.status === "In Transit") {
                stats.inTransitKg = Math.max(0, stats.inTransitKg - Number(itemToDelete.quantity));
            }
        }

        setStorage("farmtrack_tracking", tracking);
        setStorage("farmtrack_tracking_stats", stats);

        renderStats();
        renderTable();
        showAlert("trackingAlert", `Tracking record ${id} deleted successfully.`, "success");
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const id = document.getElementById("trackingId").value.trim();
        const farmer = document.getElementById("trackFarmer").value;
        const produce = document.getElementById("trackProduce").value;
        const quantity = parseFloat(document.getElementById("trackQuantity").value);
        const location = document.getElementById("currentLocation").value.trim();
        const destination = document.getElementById("destination").value.trim();
        const status = document.getElementById("trackStatus").value;

        if (!farmer) {
            showAlert("trackingAlert", "Please register a farmer first on the Farmers page.", "error");
            return;
        }

        if (!id || !farmer || !produce || isNaN(quantity) || !location || !destination || !status) {
            showAlert("trackingAlert", "Please fill in all required fields properly.", "error");
            return;
        }

        if (quantity <= 0) {
            showAlert("trackingAlert", "Quantity must be greater than zero.", "error");
            return;
        }

        if (tracking.some(t => t.id.toLowerCase() === id.toLowerCase())) {
            showAlert("trackingAlert", `Tracking ID "${id}" is already registered. Please use a unique ID.`, "error");
            return;
        }

        const newRecord = { id, farmer, produce, quantity, location, destination, status };

        await apiRequest("/api/tracking", {
            method: "POST",
            body: JSON.stringify(newRecord)
        });

        tracking.unshift(newRecord);

        if (status === "Delivered") {
            stats.deliveredCount += 1;
        } else {
            stats.activeDeliveries += 1;
            if (status === "In Transit") {
                stats.inTransitKg += quantity;
            }
        }

        setStorage("farmtrack_tracking", tracking);
        setStorage("farmtrack_tracking_stats", stats);

        renderStats();
        renderTable();
        form.reset();

        showAlert("trackingAlert", `Tracking record ${id} added successfully!`, "success");
    });

    renderStats();
    renderTable();
}


// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    initFarmersPage();
    initSalesPage();
    initTrackingPage();
});

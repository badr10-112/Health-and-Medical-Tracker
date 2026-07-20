/* =========================================================
   My Health Tracker
   All data is stored in the browser's localStorage under
   one key, so nothing ever leaves your device.
   ========================================================= */

const STORAGE_KEY = "healthTrackerData";

const METRIC_INFO = {
  weight:         { label: "Weight",         unit: "kg" },
  blood_pressure: { label: "Blood Pressure", unit: "mmHg" },
  heart_rate:     { label: "Heart Rate",     unit: "bpm" },
  blood_sugar:    { label: "Blood Sugar",    unit: "mg/dL" },
  temperature:    { label: "Temperature",    unit: "°C" },
  sleep:          { label: "Sleep",          unit: "h" },
  steps:          { label: "Steps",          unit: "steps" },
};

/* ---------------- Storage ---------------- */

function emptyData() {
  return {
    metrics: [],        // {id, type, date, value, value2, notes}
    supplements: [],    // {id, name, dose, time, notes}
    supplementLog: {},  // {"YYYY-MM-DD": [supplementId, ...]}
    appointments: [],   // {id, doctor, reason, date, time, location, notes}
    results: [],        // {id, name, date, value, unit, low, high, notes}
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return Object.assign(emptyData(), JSON.parse(raw));
  } catch (e) {
    console.error("Could not read saved data:", e);
    return emptyData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();

/* ---------------- Helpers ---------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });
}

// Prevents typed text from being interpreted as HTML.
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------- Tabs ---------------- */

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

/* =========================================================
   HEALTH METRICS
   ========================================================= */

const metricForm = document.getElementById("metric-form");
const metricType = document.getElementById("metric-type");
const metricValueLabel = document.getElementById("metric-value-label");
const metricValue2Label = document.getElementById("metric-value2-label");
const metricValue2 = document.getElementById("metric-value2");

function syncMetricForm() {
  const isBP = metricType.value === "blood_pressure";
  metricValue2Label.hidden = !isBP;
  metricValue2.required = isBP;
  metricValueLabel.firstChild.textContent = isBP ? "Systolic (upper number)" : "Value";
}

metricType.addEventListener("change", syncMetricForm);

metricForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = metricType.value;
  data.metrics.push({
    id: uid(),
    type,
    date: document.getElementById("metric-date").value,
    value: parseFloat(document.getElementById("metric-value").value),
    value2: type === "blood_pressure" ? parseFloat(metricValue2.value) : null,
    notes: document.getElementById("metric-notes").value.trim(),
  });
  saveData();
  metricForm.reset();
  document.getElementById("metric-date").value = todayStr();
  syncMetricForm();
  renderAll();
});

function metricValueText(m) {
  const info = METRIC_INFO[m.type] || { label: m.type, unit: "" };
  const val = m.type === "blood_pressure" ? `${m.value}/${m.value2}` : m.value;
  return `${val} ${info.unit}`;
}

function renderMetricList() {
  const el = document.getElementById("metric-list");
  const sorted = [...data.metrics].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length === 0) {
    el.innerHTML = '<p class="empty">No readings yet — add your first one above.</p>';
    return;
  }
  el.innerHTML = sorted.map((m) => {
    const info = METRIC_INFO[m.type] || { label: m.type };
    return `
      <div class="item-row">
        <div class="item-main">
          <div class="item-title">${escapeHtml(info.label)}: ${escapeHtml(metricValueText(m))}</div>
          <div class="item-sub">${formatDate(m.date)}${m.notes ? " — " + escapeHtml(m.notes) : ""}</div>
        </div>
        <button class="btn-delete" data-delete-metric="${m.id}">Delete</button>
      </div>`;
  }).join("");
}

/* ---------------- Chart (simple SVG line chart) ---------------- */

function renderChart() {
  const type = document.getElementById("chart-type").value;
  const container = document.getElementById("chart-container");
  const points = data.metrics
    .filter((m) => m.type === type && !Number.isNaN(m.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) {
    container.innerHTML = '<p class="empty">Add at least two readings of this type to see a trend line.</p>';
    return;
  }

  const W = 640, H = 240, pad = { top: 15, right: 15, bottom: 30, left: 45 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  // Collect all plotted values (blood pressure plots two lines).
  const allValues = points.flatMap((p) =>
    p.value2 != null ? [p.value, p.value2] : [p.value]
  );
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;

  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - ((v - min) / (max - min)) * innerH;

  function linePath(getVal) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(getVal(p)).toFixed(1)}`).join(" ");
  }

  function dots(getVal, color) {
    return points.map((p, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(getVal(p)).toFixed(1)}" r="3.5" fill="${color}">
         <title>${formatDate(p.date)}: ${escapeHtml(metricValueText(p))}</title>
       </circle>`
    ).join("");
  }

  // Y-axis labels (4 steps)
  let axisLabels = "";
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) / 4) * i;
    const yy = y(v);
    axisLabels += `<text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#6b7a85">${v >= 100 ? Math.round(v) : v.toFixed(1)}</text>
      <line x1="${pad.left}" y1="${yy}" x2="${W - pad.right}" y2="${yy}" stroke="#e5ecef" stroke-width="1"/>`;
  }

  // X-axis: first, middle and last date
  const idxs = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xLabels = [...new Set(idxs)].map((i) =>
    `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#6b7a85">${points[i].date}</text>`
  ).join("");

  const isBP = type === "blood_pressure";
  const svg = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart">
      ${axisLabels}
      ${xLabels}
      <path d="${linePath((p) => p.value)}" fill="none" stroke="#0d7377" stroke-width="2"/>
      ${dots((p) => p.value, "#0d7377")}
      ${isBP ? `<path d="${linePath((p) => p.value2)}" fill="none" stroke="#e67e22" stroke-width="2"/>` : ""}
      ${isBP ? dots((p) => p.value2, "#e67e22") : ""}
    </svg>
    ${isBP ? '<p class="muted">Green = systolic, orange = diastolic. Hover a dot for details.</p>' : '<p class="muted">Hover a dot for details.</p>'}`;
  container.innerHTML = svg;
}

document.getElementById("chart-type").addEventListener("change", renderChart);

/* =========================================================
   SUPPLEMENTS
   ========================================================= */

const supplementForm = document.getElementById("supplement-form");

supplementForm.addEventListener("submit", (e) => {
  e.preventDefault();
  data.supplements.push({
    id: uid(),
    name: document.getElementById("supp-name").value.trim(),
    dose: document.getElementById("supp-dose").value.trim(),
    time: document.getElementById("supp-time").value,
    notes: document.getElementById("supp-notes").value.trim(),
  });
  saveData();
  supplementForm.reset();
  renderAll();
});

function supplementSubtitle(s) {
  return [s.dose, s.time, s.notes].filter(Boolean).map(escapeHtml).join(" · ");
}

function renderSupplementList() {
  const el = document.getElementById("supplement-list");
  if (data.supplements.length === 0) {
    el.innerHTML = '<p class="empty">No supplements yet — add one above.</p>';
    return;
  }
  el.innerHTML = data.supplements.map((s) => `
    <div class="item-row">
      <div class="item-main">
        <div class="item-title">${escapeHtml(s.name)}</div>
        <div class="item-sub">${supplementSubtitle(s)}</div>
      </div>
      <button class="btn-delete" data-delete-supplement="${s.id}">Delete</button>
    </div>`).join("");
}

function renderChecklist(containerId) {
  const el = document.getElementById(containerId);
  if (data.supplements.length === 0) {
    el.innerHTML = '<p class="empty">Add supplements in the Supplements tab to see your daily checklist.</p>';
    return;
  }
  const takenToday = data.supplementLog[todayStr()] || [];
  el.innerHTML = data.supplements.map((s) => {
    const taken = takenToday.includes(s.id);
    const inputId = `${containerId}-${s.id}`;
    return `
      <div class="check-row">
        <input type="checkbox" id="${inputId}" data-toggle-supplement="${s.id}" ${taken ? "checked" : ""}>
        <label for="${inputId}" class="${taken ? "taken" : ""}">
          ${escapeHtml(s.name)}${s.dose ? ` <span class="item-sub">(${escapeHtml(s.dose)})</span>` : ""}
        </label>
      </div>`;
  }).join("");
}

function toggleSupplementTaken(suppId) {
  const key = todayStr();
  const log = data.supplementLog[key] || [];
  data.supplementLog[key] = log.includes(suppId)
    ? log.filter((id) => id !== suppId)
    : [...log, suppId];
  saveData();
  renderAll();
}

/* =========================================================
   APPOINTMENTS
   ========================================================= */

const appointmentForm = document.getElementById("appointment-form");

appointmentForm.addEventListener("submit", (e) => {
  e.preventDefault();
  data.appointments.push({
    id: uid(),
    doctor: document.getElementById("appt-doctor").value.trim(),
    reason: document.getElementById("appt-reason").value.trim(),
    date: document.getElementById("appt-date").value,
    time: document.getElementById("appt-time").value,
    location: document.getElementById("appt-location").value.trim(),
    notes: document.getElementById("appt-notes").value.trim(),
  });
  saveData();
  appointmentForm.reset();
  renderAll();
});

function appointmentRow(a, showSoonBadge) {
  const daysAway = Math.round(
    (new Date(a.date) - new Date(todayStr())) / (1000 * 60 * 60 * 24)
  );
  const soon = showSoonBadge && daysAway >= 0 && daysAway <= 7
    ? ` <span class="badge badge-soon">${daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`}</span>`
    : "";
  const sub = [
    formatDate(a.date) + (a.time ? " at " + a.time : ""),
    a.reason ? escapeHtml(a.reason) : "",
    a.location ? escapeHtml(a.location) : "",
    a.notes ? escapeHtml(a.notes) : "",
  ].filter(Boolean).join(" · ");
  return `
    <div class="item-row">
      <div class="item-main">
        <div class="item-title">${escapeHtml(a.doctor)}${soon}</div>
        <div class="item-sub">${sub}</div>
      </div>
      <button class="btn-delete" data-delete-appointment="${a.id}">Delete</button>
    </div>`;
}

function renderAppointments() {
  const today = todayStr();
  const upcoming = data.appointments
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const past = data.appointments
    .filter((a) => a.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById("appointment-upcoming").innerHTML =
    upcoming.length ? upcoming.map((a) => appointmentRow(a, true)).join("")
      : '<p class="empty">No upcoming appointments.</p>';
  document.getElementById("appointment-past").innerHTML =
    past.length ? past.map((a) => appointmentRow(a, false)).join("")
      : '<p class="empty">No past appointments yet.</p>';
}

/* =========================================================
   TEST RESULTS
   ========================================================= */

const resultForm = document.getElementById("result-form");

resultForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const lowRaw = document.getElementById("result-low").value;
  const highRaw = document.getElementById("result-high").value;
  data.results.push({
    id: uid(),
    name: document.getElementById("result-name").value.trim(),
    date: document.getElementById("result-date").value,
    value: parseFloat(document.getElementById("result-value").value),
    unit: document.getElementById("result-unit").value.trim(),
    low: lowRaw === "" ? null : parseFloat(lowRaw),
    high: highRaw === "" ? null : parseFloat(highRaw),
    notes: document.getElementById("result-notes").value.trim(),
  });
  saveData();
  resultForm.reset();
  document.getElementById("result-date").value = todayStr();
  renderAll();
});

function resultStatus(r) {
  if (r.low == null && r.high == null) return "";
  const outLow = r.low != null && r.value < r.low;
  const outHigh = r.high != null && r.value > r.high;
  if (outLow) return '<span class="badge badge-flag">Below range</span>';
  if (outHigh) return '<span class="badge badge-flag">Above range</span>';
  return '<span class="badge badge-ok">In range</span>';
}

function resultRange(r) {
  if (r.low == null && r.high == null) return "—";
  if (r.low != null && r.high != null) return `${r.low}–${r.high}`;
  if (r.low != null) return `≥ ${r.low}`;
  return `≤ ${r.high}`;
}

function renderResults() {
  const el = document.getElementById("result-list");
  const sorted = [...data.results].sort(
    (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)
  );
  if (sorted.length === 0) {
    el.innerHTML = '<p class="empty">No test results yet — add one above.</p>';
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table class="results-table">
        <thead>
          <tr><th>Date</th><th>Test</th><th>Result</th><th>Normal range</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${sorted.map((r) => `
            <tr>
              <td>${escapeHtml(r.date)}</td>
              <td>${escapeHtml(r.name)}${r.notes ? `<div class="item-sub">${escapeHtml(r.notes)}</div>` : ""}</td>
              <td>${escapeHtml(String(r.value))} ${escapeHtml(r.unit)}</td>
              <td>${escapeHtml(resultRange(r))}</td>
              <td>${resultStatus(r)}</td>
              <td><button class="btn-delete" data-delete-result="${r.id}">Delete</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
  renderChecklist("dash-supplements");

  // Upcoming appointments (next 3)
  const today = todayStr();
  const upcoming = data.appointments
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 3);
  document.getElementById("dash-appointments").innerHTML =
    upcoming.length ? upcoming.map((a) => appointmentRow(a, true)).join("")
      : '<p class="empty">Nothing scheduled. Add appointments in the Appointments tab.</p>';

  // Latest reading of each metric type
  const latest = {};
  for (const m of [...data.metrics].sort((a, b) => a.date.localeCompare(b.date))) {
    latest[m.type] = m;
  }
  const latestList = Object.values(latest).sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById("dash-metrics").innerHTML =
    latestList.length ? latestList.map((m) => {
      const info = METRIC_INFO[m.type] || { label: m.type };
      return `
        <div class="item-row">
          <div class="item-main">
            <div class="item-title">${escapeHtml(info.label)}: ${escapeHtml(metricValueText(m))}</div>
            <div class="item-sub">${formatDate(m.date)}</div>
          </div>
        </div>`;
    }).join("") : '<p class="empty">No readings yet. Add them in the Health Metrics tab.</p>';

  // Recent results (last 5)
  const recent = [...data.results]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  document.getElementById("dash-results").innerHTML =
    recent.length ? recent.map((r) => `
      <div class="item-row">
        <div class="item-main">
          <div class="item-title">${escapeHtml(r.name)}: ${escapeHtml(String(r.value))} ${escapeHtml(r.unit)} ${resultStatus(r)}</div>
          <div class="item-sub">${formatDate(r.date)}</div>
        </div>
      </div>`).join("") : '<p class="empty">No results yet. Add them in the Test Results tab.</p>';
}

/* =========================================================
   DELETION & CHECKBOX EVENTS (event delegation)
   ========================================================= */

document.body.addEventListener("click", (e) => {
  const t = e.target;
  const confirmDelete = (label) => confirm(`Delete this ${label}? This cannot be undone.`);

  if (t.dataset.deleteMetric && confirmDelete("reading")) {
    data.metrics = data.metrics.filter((m) => m.id !== t.dataset.deleteMetric);
  } else if (t.dataset.deleteSupplement && confirmDelete("supplement")) {
    data.supplements = data.supplements.filter((s) => s.id !== t.dataset.deleteSupplement);
  } else if (t.dataset.deleteAppointment && confirmDelete("appointment")) {
    data.appointments = data.appointments.filter((a) => a.id !== t.dataset.deleteAppointment);
  } else if (t.dataset.deleteResult && confirmDelete("test result")) {
    data.results = data.results.filter((r) => r.id !== t.dataset.deleteResult);
  } else {
    return;
  }
  saveData();
  renderAll();
});

document.body.addEventListener("change", (e) => {
  if (e.target.dataset.toggleSupplement) {
    toggleSupplementTaken(e.target.dataset.toggleSupplement);
  }
});

/* =========================================================
   BACKUP / RESTORE
   ========================================================= */

document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `health-tracker-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("import-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (typeof imported !== "object" || imported === null || !Array.isArray(imported.metrics)) {
        throw new Error("Not a valid backup file");
      }
      if (!confirm("Restoring will replace ALL current data with the backup. Continue?")) return;
      data = Object.assign(emptyData(), imported);
      saveData();
      renderAll();
      alert("Backup restored successfully.");
    } catch (err) {
      alert("Sorry, that file doesn't look like a valid backup: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* =========================================================
   INIT
   ========================================================= */

function renderAll() {
  renderDashboard();
  renderMetricList();
  renderChart();
  renderSupplementList();
  renderChecklist("supplement-checklist");
  renderAppointments();
  renderResults();
}

document.getElementById("metric-date").value = todayStr();
document.getElementById("result-date").value = todayStr();
syncMetricForm();
renderAll();

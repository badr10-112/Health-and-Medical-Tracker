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

// The two "sides" of the user's medical life. Everything defaults to
// general; results, appointments and supplements can be tagged as Crohn's.
const CATEGORY_INFO = {
  general: { label: "General Health" },
  crohns:  { label: "Crohn’s" },
};

function catBadge(category) {
  return category === "crohns" ? ' <span class="badge badge-cat">Crohn’s</span>' : "";
}

// Blood counts, inflammation markers, and IBD medication levels are
// suggested as Crohn's; everything else (vitamins, minerals, hormones, …)
// defaults to General Health. Suggestions only — the user can always
// change the category before saving.
const CROHNS_TEST_HINTS = /\b(crp|c[- ]?reactive|esr|sedimentation|calprotectin|f(?:a|ae)?ecal|lactoferrin|infliximab|adalimumab|ustekinumab|vedolizumab|risankizumab|azathioprine|mercaptopurine|thiopurine|6[- ]?tgn?|methotrexate|rbc|red blood|wbc|white blood|h(?:a|ae)?emoglobin|h(?:a|ae)?ematocrit|platelets?|mcv|mchc?|rdw|neutrophils?|lymphocytes?|monocytes?|eosinophils?|basophils?|albumin)\b/i;

function suggestCategory(testName) {
  return CROHNS_TEST_HINTS.test(testName) ? "crohns" : "general";
}

/* ---------------- Storage ---------------- */
/* Some embedded browsers block localStorage entirely; fall back to
   in-memory storage and warn so Backup/Restore can bridge sessions. */

let storageAvailable = true;
const memoryStore = {};
try {
  localStorage.setItem("__ht_test", "1");
  localStorage.removeItem("__ht_test");
} catch (e) {
  storageAvailable = false;
}

function storeGet() {
  return storageAvailable ? localStorage.getItem(STORAGE_KEY) : (memoryStore[STORAGE_KEY] ?? null);
}

function storeSet(value) {
  if (storageAvailable) localStorage.setItem(STORAGE_KEY, value);
  else memoryStore[STORAGE_KEY] = value;
}

function emptyData() {
  return {
    metrics: [],        // {id, type, date, value, value2, notes}
    supplements: [],    // {id, name, dose, time, notes}
    supplementLog: {},  // {"YYYY-MM-DD": [supplementId, ...]}
    appointments: [],   // {id, doctor, reason, date, time, location, notes}
    results: [],        // {id, name, date, value, unit, low, high, notes}
  };
}

// Entries saved before categories existed (or edited by hand) get "general".
function normalizeData(d) {
  for (const list of [d.results, d.appointments, d.supplements]) {
    for (const item of list) {
      item.category = item.category === "crohns" ? "crohns" : "general";
    }
  }
  return d;
}

function loadData() {
  try {
    const raw = storeGet();
    if (!raw) return emptyData();
    return normalizeData(Object.assign(emptyData(), JSON.parse(raw)));
  } catch (e) {
    console.error("Could not read saved data:", e);
    return emptyData();
  }
}

function saveData() {
  storeSet(JSON.stringify(data));
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

/* ---------------- In-app dialogs ---------------- */
/* Native confirm()/alert() are blocked in sandboxed embeds, so all
   confirmations use this in-page dialog instead. */

function showModal(message, okLabel, showCancel) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-overlay");
    const ok = document.getElementById("modal-ok");
    const cancel = document.getElementById("modal-cancel");
    document.getElementById("modal-message").textContent = message;
    ok.textContent = okLabel;
    cancel.hidden = !showCancel;
    overlay.hidden = false;
    ok.focus();
    const done = (result) => {
      overlay.hidden = true;
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onOverlay = (e) => { if (e.target === overlay) done(false); };
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
  });
}

function appConfirm(message, okLabel = "Delete") {
  return showModal(message, okLabel, true);
}

function appNotice(message) {
  return showModal(message, "OK", false);
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
    axisLabels += `<text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v >= 100 ? Math.round(v) : v.toFixed(1)}</text>
      <line x1="${pad.left}" y1="${yy}" x2="${W - pad.right}" y2="${yy}" stroke="var(--border)" stroke-width="1"/>`;
  }

  // X-axis: first, middle and last date
  const idxs = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xLabels = [...new Set(idxs)].map((i) =>
    `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${points[i].date}</text>`
  ).join("");

  const isBP = type === "blood_pressure";
  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart">
      ${axisLabels}
      ${xLabels}
      <path d="${linePath((p) => p.value)}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      ${dots((p) => p.value, "var(--accent)")}
      ${isBP ? `<path d="${linePath((p) => p.value2)}" fill="none" stroke="var(--chart-line2)" stroke-width="2"/>` : ""}
      ${isBP ? dots((p) => p.value2, "var(--chart-line2)") : ""}
    </svg>
    ${isBP ? '<p class="muted">Teal = systolic, orange = diastolic. Hover a dot for details.</p>' : '<p class="muted">Hover a dot for details.</p>'}`;
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
    category: document.getElementById("supp-category").value,
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
        <div class="item-title">${escapeHtml(s.name)}${catBadge(s.category)}</div>
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
    category: document.getElementById("appt-category").value,
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
        <div class="item-title">${escapeHtml(a.doctor)}${catBadge(a.category)}${soon}</div>
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
    category: document.getElementById("result-category").value,
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

// Which slice of results is being viewed, and how. Not persisted — the
// tab always opens on "all results, by date".
let resultFilter = "all";
let resultView = "date";
let resultChartMode = "trend";

function resultsDateTable(list) {
  const sorted = [...list].sort(
    (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)
  );
  return `
    <div class="table-wrap">
      <table class="results-table">
        <thead>
          <tr><th>Date</th><th>Test</th><th>Result</th><th>Normal range</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${sorted.map((r) => `
            <tr>
              <td>${escapeHtml(r.date)}</td>
              <td>${escapeHtml(r.name)}${catBadge(r.category)}${r.notes ? `<div class="item-sub">${escapeHtml(r.notes)}</div>` : ""}</td>
              <td>${escapeHtml(String(r.value))} ${escapeHtml(r.unit)}</td>
              <td>${escapeHtml(resultRange(r))}</td>
              <td>${resultStatus(r)}</td>
              <td><button class="btn-delete" data-delete-result="${r.id}">Delete</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// Small trend chart for one test's history. The latest entry's normal
// range is drawn as a shaded band behind the line.
function resultSparkline(entries) {
  const pts = entries.filter((e) => typeof e.value === "number" && !Number.isNaN(e.value));
  if (pts.length < 2) {
    return '<p class="muted">Add this test on more dates to see its trend.</p>';
  }
  const W = 300, H = 70, pad = 8;
  const latest = pts[pts.length - 1];
  const vals = pts.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (latest.low != null) min = Math.min(min, latest.low);
  if (latest.high != null) max = Math.max(max, latest.high);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.12;
  max += span * 0.12;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);

  const hasBand = latest.low != null || latest.high != null;
  const bandTop = y(latest.high != null ? latest.high : max);
  const bandBottom = y(latest.low != null ? latest.low : min);
  const band = hasBand
    ? `<rect x="0" y="${bandTop.toFixed(1)}" width="${W}" height="${(bandBottom - bandTop).toFixed(1)}" fill="var(--ok-bg)"/>`
    : "";

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${i === pts.length - 1 ? 4 : 2.5}" fill="var(--accent)">
       <title>${formatDate(p.date)}: ${escapeHtml(String(p.value))} ${escapeHtml(p.unit)}</title>
     </circle>`
  ).join("");

  return `
    <div class="spark-wrap">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Trend for this test">
        ${band}
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
        ${dots}
      </svg>
      <p class="muted">Trend over ${pts.length} results, oldest to newest${hasBand ? " — shaded area is the normal range" : ""}. Hover a dot for details.</p>
    </div>`;
}

function monthLabel(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Bar chart of one test aggregated per month or per year. Buckets with
// several results show the average. Bars start at zero; the latest
// entry's normal range is shaded behind them.
function resultBarChart(entries, mode) {
  const pts = entries.filter((e) => typeof e.value === "number" && !Number.isNaN(e.value));
  if (pts.length === 0) return "";
  const buckets = new Map();
  for (const p of pts) {
    const key = mode === "yearly" ? p.date.slice(0, 4) : p.date.slice(0, 7);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p.value);
  }
  const keys = [...buckets.keys()].sort();
  const avgs = keys.map((k) => buckets.get(k).reduce((a, b) => a + b, 0) / buckets.get(k).length);
  const latest = pts[pts.length - 1];
  const hasBand = latest.low != null || latest.high != null;

  let top = Math.max(...avgs);
  if (latest.high != null) top = Math.max(top, latest.high);
  if (top <= 0) top = 1;
  top *= 1.18;

  const barW = 44, gap = 20;
  const W = Math.max(300, keys.length * (barW + gap) + gap);
  const H = 160, padT = 14, padB = 24;
  const innerH = H - padT - padB;
  const y = (v) => padT + innerH - (Math.max(v, 0) / top) * innerH;

  const band = hasBand
    ? `<rect x="0" y="${y(latest.high != null ? latest.high : top).toFixed(1)}" width="${W}" height="${(y(latest.low != null ? latest.low : 0) - y(latest.high != null ? latest.high : top)).toFixed(1)}" fill="var(--ok-bg)"/>`
    : "";

  const bars = keys.map((k, i) => {
    const x0 = gap + i * (barW + gap);
    const v = avgs[i];
    const shown = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    const keyLabel = mode === "yearly" ? k : monthLabel(k);
    const n = buckets.get(k).length;
    return `
      <rect x="${x0}" y="${y(v).toFixed(1)}" width="${barW}" height="${(padT + innerH - y(v)).toFixed(1)}" rx="3" fill="var(--accent)">
        <title>${keyLabel}: ${shown}${n > 1 ? ` (average of ${n} results)` : ""}</title>
      </rect>
      <text x="${x0 + barW / 2}" y="${(y(v) - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--muted)">${shown}</text>
      <text x="${x0 + barW / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${keyLabel}</text>`;
  }).join("");

  const hasAverages = keys.some((k) => buckets.get(k).length > 1);
  return `
    <div class="spark-wrap">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${mode} bar chart for this test">
        ${band}
        ${bars}
      </svg>
      <p class="muted">${mode === "yearly" ? "Yearly" : "Monthly"} ${hasAverages ? "averages" : "values"}${hasBand ? " — shaded area is the normal range" : ""}. Hover a bar for details.</p>
    </div>`;
}

function resultsByTest(list) {
  const groups = new Map();
  for (const r of list) {
    const key = r.name.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.keys()].sort().map((key) => {
    const entries = groups.get(key).slice().sort((a, b) => a.date.localeCompare(b.date));
    const latest = entries[entries.length - 1];
    return `
      <details class="test-group">
        <summary>
          <span>
            <span class="item-title">${escapeHtml(latest.name)}</span>${catBadge(latest.category)}
            <span class="item-sub"> · ${entries.length} result${entries.length === 1 ? "" : "s"}, latest ${formatDate(latest.date)}</span>
          </span>
          <span class="test-summary-value">${escapeHtml(String(latest.value))} ${escapeHtml(latest.unit)} ${resultStatus(latest)}</span>
        </summary>
        ${resultChartMode === "trend" ? resultSparkline(entries) : resultBarChart(entries, resultChartMode)}
        ${entries.slice().reverse().map((r) => `
          <div class="item-row">
            <div class="item-main">
              <div class="item-title">${escapeHtml(String(r.value))} ${escapeHtml(r.unit)} ${resultStatus(r)}</div>
              <div class="item-sub">${formatDate(r.date)} · Normal: ${escapeHtml(resultRange(r))}${r.notes ? " · " + escapeHtml(r.notes) : ""}</div>
            </div>
            <button class="btn-delete" data-delete-result="${r.id}">Delete</button>
          </div>`).join("")}
      </details>`;
  }).join("");
}

function renderResults() {
  const el = document.getElementById("result-list");
  if (data.results.length === 0) {
    el.innerHTML = '<p class="empty">No test results yet — add one above.</p>';
    return;
  }
  const counts = { all: data.results.length, crohns: 0, general: 0 };
  for (const r of data.results) counts[r.category === "crohns" ? "crohns" : "general"]++;
  const filtered = resultFilter === "all"
    ? data.results
    : data.results.filter((r) => r.category === resultFilter);

  const pills = `
    <div class="pill-row">
      ${["all", "crohns", "general"].map((f) => `
        <button type="button" class="pill ${resultFilter === f ? "active" : ""}" data-result-filter="${f}">
          ${f === "all" ? "All" : CATEGORY_INFO[f].label} (${counts[f]})
        </button>`).join("")}
      <span class="pill-spacer"></span>
      <button type="button" class="pill ${resultView === "date" ? "active" : ""}" data-result-view="date">By date</button>
      <button type="button" class="pill ${resultView === "test" ? "active" : ""}" data-result-view="test">By test</button>
    </div>`;

  const chartPills = resultView === "test" ? `
    <div class="pill-row">
      <span class="item-sub">Chart:</span>
      <button type="button" class="pill ${resultChartMode === "trend" ? "active" : ""}" data-result-chart="trend">Timeline</button>
      <button type="button" class="pill ${resultChartMode === "monthly" ? "active" : ""}" data-result-chart="monthly">Monthly bars</button>
      <button type="button" class="pill ${resultChartMode === "yearly" ? "active" : ""}" data-result-chart="yearly">Yearly bars</button>
    </div>` : "";

  const content = filtered.length === 0
    ? `<p class="empty">No ${resultFilter === "crohns" ? "Crohn’s" : "General Health"} results yet.</p>`
    : resultView === "date" ? resultsDateTable(filtered) : resultsByTest(filtered);

  const deleteShown = filtered.length > 0 ? `
    <p class="delete-shown-row">
      <button type="button" class="btn-delete" data-delete-shown="1">
        🗑 Delete all ${filtered.length} result${filtered.length === 1 ? "" : "s"} shown${resultFilter === "all" ? "" : ` (${CATEGORY_INFO[resultFilter].label})`}
      </button>
    </p>` : "";

  el.innerHTML = pills + chartPills + content + deleteShown;
}

/* =========================================================
   IMPORT FROM LAB REPORT
   The PDF (or pasted text) is processed entirely in the
   browser; nothing is uploaded anywhere.
   ========================================================= */

// Lines that are clearly report metadata rather than test results.
const IMPORT_SKIP = /\b(page|tel|phone|fax|date of birth|dob|patient|dr|doctor|physician|consultant|specimen|collected|received|reported|printed|authorised|authorized|verified|address|street|road|hospital|clinic|laborator|sample|barcode|gender|sex|age|years|mrn|passport|insurance|policy|invoice|amount|price|version|method|comment)\b/i;

// Matches lines like:
//   Hemoglobin 14.2 g/dL 13.0 - 17.0
//   Vitamin D 25-OH: 18 ng/mL (30 - 100)
//   Cholesterol, Total 210 H mg/dL < 200
//   WBC 5,400 /uL 4,000 - 11,000
const NUM_PART = "(\\d[\\d,]*(?:\\.\\d+)?)";
const UNIT_PART = "([A-Za-zµμ%/][\\w/%µμ.^*-]{0,14})";
const LAB_LINE_RE = new RegExp(
  "^([A-Za-z][A-Za-z0-9 .,()/'%+-]{2,60}?)" +   // 1: test name
  "[:\\s]\\s*" +
  NUM_PART +                                      // 2: value
  "(?:\\s*\\*?\\s*[HL]\\b)?" +                    // optional High/Low flag
  "(?:\\s*" + UNIT_PART + ")?" +                  // 3: unit (before range)
  "(?:\\s*[\\(\\[]?\\s*(?:" +
    NUM_PART + "\\s*[-–—]\\s*" + NUM_PART +       // 4,5: low - high
    "|[<≤]\\s*=?\\s*" + NUM_PART +                // 6: upper limit only
    "|[>≥]\\s*=?\\s*" + NUM_PART +                // 7: lower limit only
  ")\\s*[\\)\\]]?)?" +
  "(?:\\s*" + UNIT_PART + ")?" +                  // 8: unit (after range)
  "\\s*$"
);

function importNum(str) {
  return str == null ? null : parseFloat(str.replaceAll(",", ""));
}

function parseLabText(text) {
  const found = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line || line.length > 120) continue;
    const m = line.match(LAB_LINE_RE);
    if (!m) continue;
    const name = m[1].replace(/[\s:,-]+$/, "").trim();
    const letters = (name.match(/[A-Za-z]/g) || []).length;
    if (letters < 3 || IMPORT_SKIP.test(name)) continue;
    const unit = m[3] || m[8] || "";
    const low = m[4] != null ? importNum(m[4]) : m[7] != null ? importNum(m[7]) : null;
    const high = m[5] != null ? importNum(m[5]) : m[6] != null ? importNum(m[6]) : null;
    // Without a unit or a range the number is probably not a lab value.
    if (!unit && low == null && high == null) continue;
    found.push({ name, value: importNum(m[2]), unit, low, high });
  }
  return found;
}

async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // pdf.js returns text fragments with coordinates; rebuild visual lines by
    // grouping fragments with (almost) the same vertical position.
    const lines = [];
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = item.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) < 3);
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
      }
      line.items.push({ x: item.transform[4], str: item.str });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const line of lines) {
      text += line.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ") + "\n";
    }
  }
  return text;
}

const importStatus = document.getElementById("import-status");
const importPreview = document.getElementById("import-preview");

function showImportStatus(msg) {
  importStatus.hidden = !msg;
  importStatus.textContent = msg || "";
}

function renderImportPreview(candidates) {
  if (candidates.length === 0) {
    importPreview.innerHTML = "";
    showImportStatus("No test results detected. If your report is a scanned image, the text can't be read — use “Paste text instead” or the manual form below.");
    return;
  }
  showImportStatus("");
  importPreview.innerHTML = `
    <p class="muted">Found ${candidates.length} possible result${candidates.length === 1 ? "" : "s"}. Untick anything that isn't a real result, correct any values, and check the suggested categories, then add them.</p>
    <div class="table-wrap">
      <table class="results-table import-table">
        <thead>
          <tr><th></th><th>Test</th><th>Value</th><th>Unit</th><th>Range low</th><th>Range high</th><th>Category</th></tr>
        </thead>
        <tbody>
          ${candidates.map((c, i) => {
            const cat = suggestCategory(c.name);
            return `
            <tr>
              <td><input type="checkbox" class="import-check" data-idx="${i}" checked></td>
              <td><input type="text" class="import-name" data-idx="${i}" value="${escapeHtml(c.name)}"></td>
              <td><input type="number" step="any" class="import-value" data-idx="${i}" value="${c.value ?? ""}"></td>
              <td><input type="text" class="import-unit" data-idx="${i}" value="${escapeHtml(c.unit)}"></td>
              <td><input type="number" step="any" class="import-low" data-idx="${i}" value="${c.low ?? ""}"></td>
              <td><input type="number" step="any" class="import-high" data-idx="${i}" value="${c.high ?? ""}"></td>
              <td>
                <select class="import-cat" data-idx="${i}">
                  <option value="general" ${cat === "general" ? "selected" : ""}>General</option>
                  <option value="crohns" ${cat === "crohns" ? "selected" : ""}>Crohn’s</option>
                </select>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="import-footer">
      <label>Date of these results
        <input type="date" id="import-date" value="${todayStr()}">
      </label>
      <button type="button" id="import-add-btn" class="btn btn-primary">Add selected results</button>
      <button type="button" id="import-cancel-btn" class="btn btn-outline">Cancel</button>
    </div>`;

  document.getElementById("import-add-btn").addEventListener("click", () => {
    const date = document.getElementById("import-date").value || todayStr();
    let added = 0;
    importPreview.querySelectorAll(".import-check").forEach((box) => {
      if (!box.checked) return;
      const i = box.dataset.idx;
      const get = (cls) => importPreview.querySelector(`.${cls}[data-idx="${i}"]`).value;
      const name = get("import-name").trim();
      const value = parseFloat(get("import-value"));
      if (!name || Number.isNaN(value)) return;
      const lowRaw = get("import-low");
      const highRaw = get("import-high");
      data.results.push({
        id: uid(),
        name,
        date,
        value,
        unit: get("import-unit").trim(),
        low: lowRaw === "" ? null : parseFloat(lowRaw),
        high: highRaw === "" ? null : parseFloat(highRaw),
        category: get("import-cat"),
        notes: "",
      });
      added++;
    });
    saveData();
    importPreview.innerHTML = "";
    showImportStatus(added > 0
      ? `Added ${added} result${added === 1 ? "" : "s"} — they're in the table below and on your dashboard.`
      : "Nothing was added — no rows were selected.");
    renderAll();
  });

  document.getElementById("import-cancel-btn").addEventListener("click", () => {
    importPreview.innerHTML = "";
    showImportStatus("");
  });
}

document.getElementById("import-pdf").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  importPreview.innerHTML = "";
  if (typeof pdfjsLib === "undefined") {
    showImportStatus("The PDF reader isn't available here — use “Paste text instead”.");
    return;
  }
  showImportStatus("Reading your PDF…");
  try {
    const text = await extractPdfText(await file.arrayBuffer());
    if (!text.trim()) {
      renderImportPreview([]);
      return;
    }
    renderImportPreview(parseLabText(text));
  } catch (err) {
    console.error("PDF import failed:", err);
    showImportStatus("Sorry, this PDF couldn't be read (" + err.message + "). Try “Paste text instead” or the manual form below.");
  }
});

document.getElementById("paste-toggle").addEventListener("click", () => {
  const area = document.getElementById("paste-area");
  area.hidden = !area.hidden;
});

document.getElementById("parse-text-btn").addEventListener("click", () => {
  const text = document.getElementById("import-text").value;
  importPreview.innerHTML = "";
  if (!text.trim()) {
    showImportStatus("Paste the text of your report first, then press “Detect results”.");
    return;
  }
  renderImportPreview(parseLabText(text));
});

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
          <div class="item-title">${escapeHtml(r.name)}: ${escapeHtml(String(r.value))} ${escapeHtml(r.unit)} ${resultStatus(r)}${catBadge(r.category)}</div>
          <div class="item-sub">${formatDate(r.date)}</div>
        </div>
      </div>`).join("") : '<p class="empty">No results yet. Add them in the Test Results tab.</p>';
}

/* =========================================================
   DELETION & CHECKBOX EVENTS (event delegation)
   ========================================================= */

document.body.addEventListener("click", async (e) => {
  const t = e.target;
  const confirmDelete = (label) => appConfirm(`Delete this ${label}? This cannot be undone.`);

  if (t.dataset.deleteMetric) {
    if (!(await confirmDelete("reading"))) return;
    data.metrics = data.metrics.filter((m) => m.id !== t.dataset.deleteMetric);
  } else if (t.dataset.deleteSupplement) {
    if (!(await confirmDelete("supplement"))) return;
    data.supplements = data.supplements.filter((s) => s.id !== t.dataset.deleteSupplement);
  } else if (t.dataset.deleteAppointment) {
    if (!(await confirmDelete("appointment"))) return;
    data.appointments = data.appointments.filter((a) => a.id !== t.dataset.deleteAppointment);
  } else if (t.dataset.deleteResult) {
    if (!(await confirmDelete("test result"))) return;
    data.results = data.results.filter((r) => r.id !== t.dataset.deleteResult);
  } else if (t.dataset.deleteShown) {
    const shown = resultFilter === "all"
      ? data.results
      : data.results.filter((r) => r.category === resultFilter);
    const label = resultFilter === "all" ? "" : ` ${CATEGORY_INFO[resultFilter].label}`;
    if (!(await appConfirm(`Delete ALL ${shown.length}${label} test results currently shown? This cannot be undone.`, "Delete all"))) return;
    data.results = resultFilter === "all"
      ? []
      : data.results.filter((r) => r.category !== resultFilter);
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

// Category filter, view-mode, and chart-mode pills on the Test Results tab.
document.body.addEventListener("click", (e) => {
  const pill = e.target.closest("[data-result-filter], [data-result-view], [data-result-chart]");
  if (!pill) return;
  if (pill.dataset.resultFilter) resultFilter = pill.dataset.resultFilter;
  if (pill.dataset.resultView) resultView = pill.dataset.resultView;
  if (pill.dataset.resultChart) resultChartMode = pill.dataset.resultChart;
  renderResults();
});

// Suggest a category as soon as a test name is typed in the manual form;
// the user can still change it before saving.
document.getElementById("result-name").addEventListener("input", (e) => {
  document.getElementById("result-category").value = suggestCategory(e.target.value);
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
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (typeof imported !== "object" || imported === null || !Array.isArray(imported.metrics)) {
        throw new Error("Not a valid backup file");
      }
      if (!(await appConfirm("Restoring will replace ALL current data with the backup. Continue?", "Restore"))) return;
      data = normalizeData(Object.assign(emptyData(), imported));
      saveData();
      renderAll();
      appNotice("Backup restored successfully.");
    } catch (err) {
      appNotice("Sorry, that file doesn't look like a valid backup: " + err.message);
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

if (!storageAvailable) {
  document.getElementById("storage-warning").hidden = false;
}
document.getElementById("metric-date").value = todayStr();
document.getElementById("result-date").value = todayStr();
syncMetricForm();
renderAll();

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

// Test results are organised by the lab report they come from. Each report
// type is a tab on the Test Results screen. "general" is the default for
// anything that doesn't match a more specific report.
const CATEGORIES = [
  { id: "infliximab",   label: "Post Infliximab Infusion Blood Test", short: "Post-Infliximab" },
  { id: "crp",          label: "CRP",                                  short: "CRP" },
  { id: "testosterone", label: "Testosterone",                         short: "Testosterone" },
  { id: "general",      label: "General Blood Test",                   short: "General" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const CATEGORY_SHORT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short]));
const DEFAULT_CATEGORY = "general";

function normalizeCategory(c) {
  if (CATEGORY_LABEL[c]) return c;
  if (c === "crohns") return "infliximab"; // legacy value from an earlier version
  return DEFAULT_CATEGORY;
}

// Shows which report a result belongs to. The default "general" report is
// left unbadged to keep rows quiet.
function catBadge(category) {
  const cat = normalizeCategory(category);
  return cat === "general" ? "" : ` <span class="badge badge-cat">${escapeHtml(CATEGORY_SHORT[cat])}</span>`;
}

// Options markup for a category <select>, with one value pre-selected.
function categoryOptions(selected) {
  return CATEGORIES.map((c) =>
    `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${escapeHtml(c.label)}</option>`
  ).join("");
}

// Suggests which report a test belongs to from its name. Suggestions only —
// the user can always change the category before saving.
function suggestCategory(testName) {
  const n = String(testName || "").toLowerCase();
  if (/\b(crp|c[- ]?reactive)\b/.test(n)) return "crp";
  if (/\b(testosterone|shbg|free androgen|bioavailable|lh|fsh|prolactin|oestradiol|estradiol)\b/.test(n)) return "testosterone";
  if (/\b(wbc|white blood|hgb|hb|h(?:a|ae)?emoglobin|hct|h(?:a|ae)?ematocrit|rbc|red blood|mcv|mch|mchc|rdw|plt|platelets?|neutrophils?|lymphocytes?|monocytes?|eosinophils?|basophils?)\b/.test(n)) return "infliximab";
  return "general";
}

// Known lab indexes: full display name plus a short plain-language
// description. Stored data keeps whatever name was entered (so history
// groups stay stable); this mapping is display-only. Descriptions are
// general background, not medical advice.
const TEST_INFO = [
  { match: /^(wbc|white blood cells?)\b/i, full: "White Blood Cells (WBC)",
    desc: "Immune cells that fight infection. Can rise with infection or inflammation, and some medications lower it." },
  { match: /^(hgb|hb|h(?:a|ae)?emoglobin)\b/i, full: "Hemoglobin (Hgb)",
    desc: "The oxygen-carrying protein inside red blood cells. Low hemoglobin is what defines anemia." },
  { match: /^(hct|h(?:a|ae)?ematocrit)\b/i, full: "Hematocrit (Hct)",
    desc: "The fraction of your blood volume made up of red blood cells." },
  { match: /^(rbc|red blood cells?)\b/i, full: "Red Blood Cells (RBC)",
    desc: "The count of red blood cells, which carry oxygen around the body." },
  { match: /^mcv\b/i, full: "Mean Cell Volume (MCV)",
    desc: "The average size of your red blood cells. Small cells are typical of iron deficiency or thalassemia trait." },
  { match: /^mch\b(?!c)/i, full: "Mean Cell Hemoglobin (MCH)",
    desc: "The average amount of hemoglobin carried by each red blood cell." },
  { match: /^mchc\b/i, full: "Mean Cell Hemoglobin Concentration (MCHC)",
    desc: "How concentrated the hemoglobin is inside your red blood cells." },
  { match: /^rdw\b/i, full: "Red Cell Distribution Width (RDW)",
    desc: "How much your red blood cells vary in size. Often elevated alongside anemia." },
  { match: /^(plt|platelets?)\b/i, full: "Platelets (Plt)",
    desc: "Small cell fragments that clot your blood. They can also rise with active inflammation." },
  { match: /^(crp|c[- ]?reactive)/i, full: "C-Reactive Protein (CRP)",
    desc: "A general blood marker of inflammation, commonly used to monitor inflammatory bowel disease activity." },
  { match: /^(esr|sed(?:imentation)? rate|erythrocyte sed)/i, full: "Erythrocyte Sedimentation Rate (ESR)",
    desc: "An older inflammation marker; rises more slowly than CRP." },
  { match: /calprotectin/i, full: "Fecal Calprotectin",
    desc: "A stool marker of inflammation in the gut itself — one of the most direct ways to monitor IBD activity." },
  { match: /infliximab antibod|anti[- ]?infliximab|\bati\b/i, full: "Infliximab Antibodies (ATI)",
    desc: "Antibodies the immune system can form against infliximab. Staying negative (below the assay cutoff) means the drug isn't being neutralised." },
  { match: /infliximab/i, full: "Infliximab Level",
    desc: "The infliximab trough level in your blood. Cleveland Clinic's therapeutic maintenance range is 5–10 µg/mL (levels above 25 can falsely lower the antibody reading)." },
  { match: /free.*testosterone|testosterone.*free/i, full: "Free Testosterone",
    desc: "The metabolically active fraction of testosterone that isn't bound to proteins." },
  { match: /testosterone/i, full: "Total Testosterone",
    desc: "Total testosterone, the primary male sex hormone; levels vary through the day and between draws." },
  { match: /free androgen index|\bfai\b/i, full: "Free Androgen Index (FAI)",
    desc: "A calculated estimate of active testosterone from total testosterone and SHBG." },
  { match: /shbg|sex hormone binding/i, full: "Sex Hormone Binding Globulin (SHBG)",
    desc: "A protein that binds testosterone; higher SHBG lowers how much is freely available." },
  { match: /estradiol|oestradiol/i, full: "Estradiol (E2)",
    desc: "The main estrogen; in men it's made largely from testosterone and is worth tracking alongside it." },
  { match: /prolactin/i, full: "Prolactin",
    desc: "A pituitary hormone; elevated levels can suppress testosterone production." },
  { match: /^(lh|luteinizing)/i, full: "Luteinizing Hormone (LH)",
    desc: "A pituitary hormone that signals the testes to make testosterone." },
  { match: /^(fsh|follicle)/i, full: "Follicle Stimulating Hormone (FSH)",
    desc: "A pituitary hormone involved in sperm production and reproductive function." },
  { match: /ferritin/i, full: "Ferritin",
    desc: "Your body's iron stores. Helps distinguish iron deficiency from other causes of anemia." },
  { match: /^iron\b/i, full: "Serum Iron",
    desc: "The iron circulating in your blood right now (varies day to day more than ferritin)." },
  { match: /^vitamin b ?12|cobalamin/i, full: "Vitamin B12 (Cobalamin)",
    desc: "Needed for red blood cells and nerves. Absorbed in the ileum, so it can run low with inflammatory bowel disease." },
  { match: /^folate|folic acid/i, full: "Folate (Vitamin B9)",
    desc: "A B-vitamin needed to make new cells, including red blood cells." },
  { match: /^vitamin d\b/i, full: "Vitamin D (25-OH)",
    desc: "Supports bone health and the immune system; commonly low and worth keeping in range." },
  { match: /^tsh\b/i, full: "Thyroid Stimulating Hormone (TSH)",
    desc: "The main screening test for thyroid function. High usually means an underactive thyroid." },
  { match: /^hba1c\b/i, full: "HbA1c (Glycated Hemoglobin)",
    desc: "Your average blood sugar over roughly the past three months." },
  { match: /^glucose\b/i, full: "Glucose",
    desc: "Blood sugar at the moment of the test." },
  { match: /^hdl\b/i, full: "HDL Cholesterol",
    desc: "The \"good\" cholesterol — higher is generally better." },
  { match: /^ldl\b/i, full: "LDL Cholesterol",
    desc: "The \"bad\" cholesterol — lower is generally better." },
  { match: /cholesterol/i, full: "Total Cholesterol",
    desc: "All cholesterol in the blood combined." },
  { match: /^albumin\b/i, full: "Albumin",
    desc: "The main blood protein. Can drop with active inflammation or poor absorption." },
];

function testInfo(name) {
  const n = String(name || "").trim();
  for (const t of TEST_INFO) {
    if (t.match.test(n)) return t;
  }
  return null;
}

function testDisplayName(name) {
  const info = testInfo(name);
  return info ? info.full : name;
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
    profile: { bloodType: "", dob: "", heightCm: null }, // shown on the dashboard
  };
}

// Results carry a report-type category; older data (or hand-edits) are
// mapped onto the current set. Appointments and supplements no longer use
// categories, so any legacy value there is dropped.
function normalizeData(d) {
  for (const r of d.results) r.category = normalizeCategory(r.category);
  for (const a of d.appointments) delete a.category;
  for (const s of d.supplements) delete s.category;
  if (!d.profile || typeof d.profile !== "object") d.profile = { bloodType: "", dob: "", heightCm: null };
  return d;
}

// Add another dataset's entries to the current one. Entries with an id we
// already have are updated in place (so re-importing a corrected file
// applies the corrections); new ids are appended. Merging the same file
// twice is therefore safe and never duplicates.
function mergeData(incoming) {
  const upsert = (target, source) => {
    const idx = new Map(target.map((x, i) => [x.id, i]));
    for (const item of source) {
      if (idx.has(item.id)) target[idx.get(item.id)] = item;
      else { idx.set(item.id, target.length); target.push(item); }
    }
  };
  upsert(data.metrics, incoming.metrics);
  upsert(data.results, incoming.results);
  upsert(data.appointments, incoming.appointments);
  upsert(data.supplements, incoming.supplements);
  for (const [day, ids] of Object.entries(incoming.supplementLog)) {
    data.supplementLog[day] = [...new Set([...(data.supplementLog[day] || []), ...ids])];
  }
  // Fill in any profile fields the incoming file provides.
  if (incoming.profile) {
    for (const k of ["bloodType", "dob", "heightCm"]) {
      const v = incoming.profile[k];
      if (v !== "" && v != null) data.profile[k] = v;
    }
  }
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

// Resolves true for the main button, "alt" for the optional middle
// button, and false for Cancel or clicking outside the box.
function showModal(message, okLabel, showCancel, altLabel) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-overlay");
    const ok = document.getElementById("modal-ok");
    const alt = document.getElementById("modal-alt");
    const cancel = document.getElementById("modal-cancel");
    document.getElementById("modal-message").textContent = message;
    ok.textContent = okLabel;
    alt.hidden = !altLabel;
    if (altLabel) alt.textContent = altLabel;
    cancel.hidden = !showCancel;
    overlay.hidden = false;
    ok.focus();
    const done = (result) => {
      overlay.hidden = true;
      ok.removeEventListener("click", onOk);
      alt.removeEventListener("click", onAlt);
      cancel.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    };
    const onOk = () => done(true);
    const onAlt = () => done("alt");
    const onCancel = () => done(false);
    const onOverlay = (e) => { if (e.target === overlay) done(false); };
    ok.addEventListener("click", onOk);
    alt.addEventListener("click", onAlt);
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

function activateTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById("tab-" + name);
  if (panel) panel.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
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
  if (outHigh) return '<span class="badge badge-above">Above range</span>';
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
              <td>${escapeHtml(testDisplayName(r.name))}${catBadge(r.category)}${r.notes ? `<div class="item-sub">${escapeHtml(r.notes)}</div>` : ""}</td>
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
    const info = testInfo(latest.name);
    return `
      <details class="test-group">
        <summary>
          <span>
            <span class="item-title">${escapeHtml(testDisplayName(latest.name))}</span>${catBadge(latest.category)}
            <span class="item-sub"> · ${entries.length} result${entries.length === 1 ? "" : "s"}, latest ${formatDate(latest.date)}</span>
          </span>
          <span class="test-summary-value">${escapeHtml(String(latest.value))} ${escapeHtml(latest.unit)} ${resultStatus(latest)}</span>
        </summary>
        ${info ? `<p class="test-desc">${escapeHtml(info.desc)}</p>` : ""}
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
  const counts = { all: data.results.length };
  for (const c of CATEGORIES) counts[c.id] = 0;
  for (const r of data.results) counts[normalizeCategory(r.category)]++;
  if (resultFilter !== "all" && !CATEGORY_LABEL[resultFilter]) resultFilter = "all";
  const filtered = resultFilter === "all"
    ? data.results
    : data.results.filter((r) => normalizeCategory(r.category) === resultFilter);

  const tabs = [{ id: "all", label: "All" }, ...CATEGORIES];
  const pills = `
    <div class="pill-row report-tabs">
      ${tabs.map((t) => `
        <button type="button" class="pill ${resultFilter === t.id ? "active" : ""}" data-result-filter="${t.id}">
          ${escapeHtml(t.label)} (${counts[t.id]})
        </button>`).join("")}
    </div>
    <div class="pill-row">
      <span class="item-sub">View:</span>
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
    ? `<p class="empty">No results in ${resultFilter === "all" ? "any report" : CATEGORY_LABEL[resultFilter]} yet.</p>`
    : resultView === "date" ? resultsDateTable(filtered) : resultsByTest(filtered);

  const deleteShown = filtered.length > 0 ? `
    <p class="delete-shown-row">
      <button type="button" class="btn-delete" data-delete-shown="1">
        🗑 Delete all ${filtered.length} result${filtered.length === 1 ? "" : "s"} shown${resultFilter === "all" ? "" : ` (${escapeHtml(CATEGORY_LABEL[resultFilter])})`}
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
                <select class="import-cat" data-idx="${i}">${categoryOptions(cat)}</select>
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
   PROFILE (dashboard)
   ========================================================= */

// Red-cell transfusion compatibility and rough prevalence for each ABO/Rh
// type. General reference information, not personal to any user.
const BLOOD_INFO = {
  "A+":  { receive: "A+, A−, O+, O−",              donate: "A+, AB+",                         prevalence: "about 30%" },
  "A−":  { receive: "A−, O−",                       donate: "A+, A−, AB+, AB−",                prevalence: "about 6%" },
  "B+":  { receive: "B+, B−, O+, O−",              donate: "B+, AB+",                         prevalence: "about 8–9%" },
  "B−":  { receive: "B−, O−",                       donate: "B+, B−, AB+, AB−",                prevalence: "about 1–2%" },
  "AB+": { receive: "all types (universal recipient)", donate: "AB+",                         prevalence: "about 3–4%" },
  "AB−": { receive: "A−, B−, AB−, O−",             donate: "AB+, AB−",                        prevalence: "about 1%" },
  "O+":  { receive: "O+, O−",                       donate: "O+, A+, B+, AB+",                 prevalence: "about 37–39%" },
  "O−":  { receive: "O− only",                      donate: "all types (universal red-cell donor)", prevalence: "about 7%" },
};

function bloodBrief(type) {
  const info = BLOOD_INFO[type];
  if (!info) return "";
  const abo = type.replace(/[+−]/g, "");
  const rh = type.includes("+") ? "positive" : "negative";
  const antigens = abo === "O" ? "no A or B antigens" : `${abo.split("").join(" and ")} antigen${abo.length > 1 ? "s" : ""}`;
  return `Blood group <strong>${escapeHtml(type)}</strong> — ${escapeHtml(antigens)} on the red cells, Rh ${rh}. ` +
    `You can receive red cells from <strong>${escapeHtml(info.receive)}</strong> and donate to <strong>${escapeHtml(info.donate)}</strong>. ` +
    `Roughly ${escapeHtml(info.prevalence)} of people share this type. ` +
    `Your blood group is inherited and fixed for life; it mainly matters for transfusions and pregnancy. ` +
    `(There is no scientific evidence linking blood type to personality or to any particular diet.)`;
}

function ageFromDob(dob) {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

// Latest logged weight reading (Health Metrics tab), or null.
function latestWeight() {
  const ws = data.metrics
    .filter((m) => m.type === "weight" && typeof m.value === "number" && !Number.isNaN(m.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  return ws.length ? ws[ws.length - 1] : null;
}

// BMI from profile height + latest weight. Returns null if either is missing.
function bmiInfo() {
  const h = data.profile && data.profile.heightCm;
  const w = latestWeight();
  if (!h || h <= 0 || !w) return null;
  const bmi = w.value / Math.pow(h / 100, 2);
  const cat = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obese";
  return { bmi, cat, weight: w };
}

function renderProfile() {
  const p = data.profile || {};
  const view = document.getElementById("profile-view");
  const age = ageFromDob(p.dob);
  const bmi = bmiInfo();
  const facts = [];
  if (p.bloodType) facts.push(["Blood type", escapeHtml(p.bloodType)]);
  if (age != null) facts.push(["Age", `${age} years`]);
  if (p.dob) facts.push(["Date of birth", formatDate(p.dob)]);
  if (p.heightCm) facts.push(["Height", `${escapeHtml(String(p.heightCm))} cm`]);
  if (bmi) facts.push(["BMI", `${bmi.bmi.toFixed(1)} · ${bmi.cat}`]);

  if (facts.length === 0) {
    view.innerHTML = '<p class="empty">No profile yet — use ⬆ Restore to load your profile file (blood type, date of birth, height).</p>';
    return;
  }

  // Explain how BMI is derived, or how to make it appear.
  let bmiNote = "";
  if (bmi) {
    bmiNote = `<p class="muted">BMI uses your height and your latest weight (${escapeHtml(String(bmi.weight.value))} kg on ${formatDate(bmi.weight.date)}). It updates automatically each time you log a new weight.</p>`;
  } else if (p.heightCm) {
    bmiNote = '<p class="muted">Add a weight reading in the Health Metrics tab and your BMI will appear here automatically.</p>';
  }

  view.innerHTML = `
    <div class="profile-facts">
      ${facts.map(([k, v]) => `<div class="profile-fact"><span class="profile-fact-label">${k}</span><span class="profile-fact-value">${v}</span></div>`).join("")}
    </div>
    ${bmiNote}
    ${p.bloodType ? `<p class="profile-brief">${bloodBrief(p.bloodType)}</p>` : ""}`;
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function fmtNum(n) {
  return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
}

function statusKind(r) {
  if (r.low == null && r.high == null) return "none";
  if (r.low != null && r.value < r.low) return "below";
  if (r.high != null && r.value > r.high) return "above";
  return "in";
}

// One entry per test: its latest result, the previous one, and history stats.
function resultAnalyses() {
  const byTest = new Map();
  for (const r of data.results) {
    const key = r.name.trim().toLowerCase();
    if (!byTest.has(key)) byTest.set(key, []);
    byTest.get(key).push(r);
  }
  const out = [];
  for (const list of byTest.values()) {
    const hist = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const nums = hist.map((h) => h.value).filter((v) => typeof v === "number" && !Number.isNaN(v));
    if (nums.length === 0) continue;
    out.push({
      latest: hist[hist.length - 1],
      prev: hist.length >= 2 ? hist[hist.length - 2] : null,
      count: hist.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
      avg: nums.reduce((a, b) => a + b, 0) / nums.length,
    });
  }
  return out;
}

// Describes the change from the previous reading to the latest for one test,
// and flags notable movements (crossing the normal range, or a big swing).
function analyzeChange(a) {
  const { latest, prev } = a;
  const nowKind = statusKind(latest);
  if (!prev) return { cls: "", label: "First recording of this test", detail: "" };

  const delta = latest.value - prev.value;
  const pct = prev.value !== 0 ? (delta / Math.abs(prev.value)) * 100 : null;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const prevKind = statusKind(prev);
  const absPct = pct == null ? 0 : Math.abs(pct);
  const fmtDelta = (delta > 0 ? "+" : delta < 0 ? "−" : "") + fmtNum(Math.abs(delta));
  const pctText = pct == null ? "" : ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)}%)`;
  const detail = `${arrow} ${fmtDelta} ${escapeHtml(latest.unit)}${pctText} vs ${escapeHtml(String(prev.value))} on ${formatDate(prev.date)}`;

  let cls = "", label = "";
  if (prevKind === "in" && (nowKind === "above" || nowKind === "below")) {
    cls = "change-bad";
    label = nowKind === "above" ? "⚠ Moved above the normal range" : "⚠ Moved below the normal range";
  } else if ((prevKind === "above" || prevKind === "below") && nowKind === "in") {
    cls = "change-good";
    label = "✓ Back within the normal range";
  } else if ((nowKind === "above" || nowKind === "below") && absPct >= 15) {
    cls = "change-watch";
    label = `${arrow} Moved ${absPct.toFixed(0)}% — still outside range`;
  } else if (absPct >= 25) {
    cls = "change-watch";
    label = `${arrow} Notable ${absPct.toFixed(0)}% change`;
  }
  return { cls, label, detail };
}

// Best-judgement, general explanations for why a test may sit outside its
// range. These are plain-language possibilities tuned to this user's context
// (a thalassemia-trait CBC pattern noted in their reports, infliximab therapy,
// and a male hormone panel) — background only, never a diagnosis.
const RESULT_REASONS = [
  { match: /infliximab antibod|anti[- ]?infliximab|\bati\b/i,
    above: "Detectable anti-drug antibodies can blunt infliximab's effect — worth confirming with your GI team." },
  { match: /infliximab/i,
    above: "Above the 5–10 µg/mL window (supratherapeutic) — usually means the drug is more than covering you rather than causing harm; very high levels can also skew the antibody test.",
    below: "Below the therapeutic window — the dose or interval may need review, especially if symptoms return." },
  { match: /^(rbc|red blood)/i,
    above: "A high red-cell count together with small cells is the classic thalassemia-trait pattern your CBC summary noted — not typically dehydration here." },
  { match: /^(hgb|hb|h(?:a|ae)?emoglobin)/i,
    below: "Mildly low hemoglobin; with your small red cells (low MCV) and high RBC this fits thalassemia trait rather than plain iron deficiency — ferritin helps confirm." },
  { match: /^(hct|h(?:a|ae)?ematocrit)/i,
    below: "Tracks with your mildly low hemoglobin — part of the same stable red-cell pattern." },
  { match: /^mcv/i,
    below: "Small red cells — typical of thalassemia trait or iron deficiency; your ferritin/iron studies tell them apart." },
  { match: /^(mch)\b(?!c)|mean corpuscular hemoglobin\b(?! conc)/i,
    below: "Low hemoglobin content per cell, part of the same small-red-cell pattern." },
  { match: /mchc|hb\.? conc/i,
    below: "Slightly low concentration, in keeping with the small-cell pattern." },
  { match: /^rdw/i,
    above: "Red cells vary more in size than usual, commonly seen alongside this anemia pattern." },
  { match: /(crp|c[- ]?reactive)/i,
    above: "A raised inflammation marker — in Crohn's this can signal disease activity, but infection or recent illness also lifts it." },
  { match: /calprotectin/i,
    above: "Points to inflammation in the gut itself — a common signal of active IBD." },
  { match: /shbg|sex hormone binding/i,
    above: "High SHBG binds more testosterone, lowering the free/active fraction; causes range from genetics to thyroid and liver factors." },
  { match: /estradiol|oestradiol/i,
    above: "In men, estradiol is made from testosterone by aromatase; a mild rise often accompanies healthy testosterone, and more body fat can raise it." },
  { match: /prolactin/i,
    above: "Can rise with stress, sleep, exercise or some medications; a repeat morning sample is usual before acting." },
  { match: /lymphocytes/i,
    above: "A relative lymphocyte rise is often a benign shift in the white-cell differential." },
  { match: /magnesium/i,
    below: "Mildly low magnesium can come from low intake or gut losses — relevant with IBD; easy to recheck or supplement." },
  { match: /ferritin/i,
    above: "Ferritin climbs with inflammation, so it can read normal/high even when iron stores are low during a flare." },
  { match: /vitamin d/i,
    below: "Low vitamin D is very common — limited sun or absorption issues; usually corrected with supplements." },
  { match: /vitamin b ?12|cobalamin/i,
    below: "B12 is absorbed in the ileum, which Crohn's can affect — worth keeping an eye on." },
];

function reasonFor(name, kind) {
  for (const r of RESULT_REASONS) {
    if (r.match.test(String(name)) && r[kind]) return r[kind];
  }
  return kind === "above"
    ? "Above the lab's reference range — worth reviewing the trend with your doctor."
    : "Below the lab's reference range — worth reviewing the trend with your doctor.";
}

function renderDashboard() {
  renderProfile();
  renderChecklist("dash-supplements");

  // Summary stats (clickable KPI row)
  const analysesAll = resultAnalyses();
  const outNow = analysesAll.filter((a) => ["above", "below"].includes(statusKind(a.latest))).length;
  const lastLab = data.results.length
    ? [...data.results].sort((a, b) => b.date.localeCompare(a.date))[0].date : null;
  const stats = [
    { label: "Results logged", value: data.results.length },
    { label: "Tests tracked", value: analysesAll.length },
    { label: "Out of range now", value: outNow, cls: outNow ? "stat-warn" : "" },
    { label: "Last lab", value: lastLab ? formatDate(lastLab) : "—" },
  ];
  document.getElementById("dash-stats").innerHTML = stats.map((s) => `
    <button type="button" class="stat-tile ${s.cls || ""}" data-goto="results">
      <span class="stat-value">${escapeHtml(String(s.value))}</span>
      <span class="stat-label">${escapeHtml(s.label)}</span>
    </button>`).join("");

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
        <div class="item-row link-row" data-goto="metrics">
          <div class="item-main">
            <div class="item-title">${escapeHtml(info.label)}: ${escapeHtml(metricValueText(m))}</div>
            <div class="item-sub">${formatDate(m.date)}</div>
          </div>
        </div>`;
    }).join("") : '<p class="empty">No readings yet. Add them in the Health Metrics tab.</p>';

  // Recent results with change analysis vs each test's own history, shown as
  // large clickable tiles. Out-of-range results are surfaced first (so their
  // reasons are visible), then most recent, then alphabetical.
  const outOfRange = (a) => (["above", "below"].includes(statusKind(a.latest)) ? 0 : 1);
  const analyses = resultAnalyses()
    .sort((a, b) =>
      outOfRange(a) - outOfRange(b) ||
      b.latest.date.localeCompare(a.latest.date) ||
      a.latest.name.localeCompare(b.latest.name))
    .slice(0, 12);
  document.getElementById("dash-results").innerHTML =
    analyses.length ? analyses.map((a) => {
      const c = analyzeChange(a);
      const r = a.latest;
      const kind = statusKind(r);
      const reason = (kind === "above" || kind === "below")
        ? `<div class="rt-reason">💡 <span class="rt-reason-lead">Likely reason:</span> ${escapeHtml(reasonFor(r.name, kind))}</div>`
        : "";
      return `
        <button type="button" class="result-tile result-analysis ${c.cls}" data-goto-result="${r.category}" title="Open this test's full history">
          <div class="rt-head">
            <span class="rt-name">${escapeHtml(testDisplayName(r.name))}</span>
            ${catBadge(r.category)}
          </div>
          <div class="rt-value">${escapeHtml(String(r.value))} <span class="rt-unit">${escapeHtml(r.unit)}</span> ${resultStatus(r)}</div>
          <div class="rt-sub">${c.detail || "No earlier reading to compare"}</div>
          <div class="rt-sub">${formatDate(r.date)} · ${a.count} result${a.count === 1 ? "" : "s"} · personal range ${fmtNum(a.min)}–${fmtNum(a.max)} ${escapeHtml(r.unit)} · avg ${fmtNum(a.avg)}</div>
          ${c.label ? `<div class="change-flag">${escapeHtml(c.label)}</div>` : ""}
          ${reason}
        </button>`;
    }).join("") : '<p class="empty">No results yet. Add them in the Test Results tab.</p>';
}

// Dashboard interactivity: jump to the relevant tab (and drill into a test).
document.getElementById("tab-dashboard").addEventListener("click", (e) => {
  const res = e.target.closest("[data-goto-result]");
  if (res) {
    resultFilter = res.dataset.gotoResult;
    resultView = "test";
    renderResults();
    activateTab("results");
    return;
  }
  const goto = e.target.closest("[data-goto]");
  if (goto) activateTab(goto.dataset.goto);
});

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
      : data.results.filter((r) => normalizeCategory(r.category) === resultFilter);
    const label = resultFilter === "all" ? "" : ` ${CATEGORY_LABEL[resultFilter]}`;
    if (!(await appConfirm(`Delete ALL ${shown.length}${label} test results currently shown? This cannot be undone.`, "Delete all"))) return;
    data.results = resultFilter === "all"
      ? []
      : data.results.filter((r) => normalizeCategory(r.category) !== resultFilter);
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
      const choice = await showModal(
        "How should this file be loaded? “Merge” adds its entries to what you already have (nothing is deleted, duplicates are skipped). “Replace all” wipes your current data first.",
        "Replace all", true, "Merge"
      );
      if (!choice) return;
      const incoming = normalizeData(Object.assign(emptyData(), imported));
      if (choice === "alt") {
        mergeData(incoming);
      } else {
        data = incoming;
      }
      saveData();
      renderAll();
      appNotice(choice === "alt" ? "File merged into your data." : "Backup restored successfully.");
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

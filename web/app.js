import { evaluate, formatNumber, thresholdSummary } from "/src/metrics.mjs";
import { parseJsonl } from "/src/dataset.mjs";

const $ = (selector) => document.querySelector(selector);
const state = { records: [], report: null, threshold: 0.7, filter: "all", query: "", opened: null, name: "Jev support triage · sample", synthetic: true, toastTimer: null };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function label(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ");
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => element.classList.remove("show"), 2300);
}

function confidenceColor(value) {
  return value < state.threshold ? "low" : "";
}

function renderMetrics() {
  const report = state.report;
  const summary = thresholdSummary(report, state.threshold);
  const hasScores = report.dataset.scoreRecords > 0;
  $("#accuracy").textContent = formatNumber(report.metrics.accuracy);
  $("#score-mae-card").hidden = !hasScores;
  $(".metric-grid").classList.toggle("has-score", hasScores);
  if (hasScores) $("#score-mae").textContent = report.metrics.scoreMeanAbsoluteError.toFixed(2);
  $("#brier").textContent = report.metrics.brierScore.toFixed(3);
  $("#ece").textContent = report.metrics.ece.toFixed(3);
  $("#coverage").textContent = formatNumber(summary.coverage);
  $("#accepted-count").textContent = `${summary.accepted} / ${state.records.length}`;
  $("#threshold-value").textContent = `${Math.round(state.threshold * 100)}%`;
  $("#gate-coverage").textContent = formatNumber(summary.coverage);
  $("#gate-accepted").textContent = `${summary.accepted} of ${state.records.length} decisions accepted`;
  $("#gate-risk").textContent = formatNumber(summary.selectiveRisk);
  $("#record-total").textContent = state.records.length;
  $("#dataset-name").textContent = state.name;
  const typeCounts = report.dataset;
  const typeLabel = [typeCounts.choiceRecords ? "Choice" : "", typeCounts.scoreRecords ? "Score" : "", typeCounts.noulRecords ? "Noul" : ""].filter(Boolean).join(" + ");
  $("#dataset-subtitle").textContent = `${typeLabel} · ${state.records.length} records`;
  $(".demo-tag").textContent = state.synthetic ? "SYNTHETIC" : "LOCAL FILE";
  $(".demo-tag").classList.toggle("local-file", !state.synthetic);
  const ring = $("#coverage-ring");
  ring.style.strokeDashoffset = String(106.81 * (1 - summary.coverage));
  const slider = $("#threshold-slider");
  const progress = ((state.threshold - 0.5) / 0.45) * 100;
  slider.style.setProperty("--slider-progress", `${progress}%`);
  const riskText = summary.selectiveRisk === null ? "No decisions pass this gate yet; lower the threshold to accept cases." : summary.selectiveRisk < 0.1 ? "This gate is keeping the accepted error rate low." : summary.selectiveRisk < 0.25 ? "A few accepted decisions are still wrong. Review the error cases below." : "This gate accepts a meaningful number of mistakes. Raise it or inspect errors below.";
  $("#gate-insight").textContent = riskText;
  renderCalibration();
  renderRows();
}

function renderCalibration() {
  const svg = $("#calibration-chart");
  const bins = state.report.calibration.filter((bin) => bin.count > 0 && bin.confidence !== null);
  const x = (value) => 500 * value;
  const y = (value) => 220 * (1 - value);
  const points = bins.map((bin) => ({ x: x(bin.confidence), y: y(bin.accuracy), n: bin.count, confidence: bin.confidence, accuracy: bin.accuracy }));
  const path = points.length > 1 ? `<path class="calibration-line" fill="none" stroke="#287355" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" d="${points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ")}" />` : "";
  const dots = points.map((point) => `<circle class="cal-point" cx="${point.x}" cy="${point.y}" r="${Math.min(9, 4 + Math.sqrt(point.n))}"><title>${point.n} examples · ${(point.confidence * 100).toFixed(0)}% confidence · ${(point.accuracy * 100).toFixed(0)}% accuracy</title></circle>`).join("");
  svg.innerHTML = `${path}${dots}`;
  $("#calibration-note").textContent = bins.length ? `${state.records.length} judgments · ${bins.length} populated bins` : "No confidence buckets available";
}

function renderRows() {
  const summary = thresholdSummary(state.report, state.threshold);
  const errors = summary.examples.filter((record) => !record.correct);
  const needsReview = summary.examples.filter((record) => !record.accepted);
  $("#all-count").textContent = state.records.length;
  $("#error-count").textContent = errors.length;
  $("#review-count").textContent = needsReview.length;
  let rows = summary.examples;
  if (state.filter === "errors") rows = rows.filter((record) => !record.correct);
  if (state.filter === "review") rows = rows.filter((record) => !record.accepted);
  if (state.query) {
    const needle = state.query.toLowerCase();
    rows = rows.filter((record) => [record.id, record.type, label(record.label), label(record.predicted)].join(" ").toLowerCase().includes(needle));
  }
  $("#table-status").textContent = `Showing ${rows.length} of ${state.records.length} records`;
  const body = $("#records-body");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">No records match this view.</td></tr>`;
    return;
  }
  body.innerHTML = rows.slice(0, 250).map((record) => {
    const isOpen = state.opened === record.id;
    const status = !record.correct ? ["error", "Error"] : !record.accepted ? ["review", "Review"] : ["pass", "Accepted"];
    const distribution = Object.entries(record.probabilities).sort((a, b) => b[1] - a[1]).map(([option, probability]) => {
      const optionLabel = record.type === "score" ? record.legend?.[option] ?? `Level ${option}` : label(option);
      return `<span class="probability-item"><span>${escapeHtml(optionLabel)}</span><strong>${formatNumber(probability, 0)}</strong><i><b style="width:${Math.round(probability * 100)}%"></b></i></span>`;
    }).join("");
    const decision = record.type === "score" ? `${record.score.toFixed(2)} <small>level ${record.predictedLevel}</small>` : escapeHtml(label(record.predicted));
    const confidenceTitle = record.type === "noul"
      ? "Derived certainty: max(P(yes), P(no)). Jev returns the yes probability, not a separate confidence value."
      : record.confidenceSource === "model" ? "Model-reported confidence." : "Derived from the output probabilities; not model-reported.";
    return `<tr class="data-row" data-id="${escapeHtml(record.id)}"><td class="record-id">${escapeHtml(record.id)}</td><td><span class="type-chip">${record.type.toUpperCase()}</span></td><td class="label-cell">${escapeHtml(label(record.label))}</td><td><span class="decision-cell"><i class="decision-dot ${record.correct ? "" : "wrong"}"></i>${decision}</span></td><td><span class="confidence-cell" title="${confidenceTitle}"><i class="mini-track"><i class="mini-fill ${confidenceColor(record.confidence)}" style="width:${Math.round(record.confidence * 100)}%"></i></i><span class="confidence-text">${formatNumber(record.confidence, 0)}</span></span></td><td><span class="status-chip ${status[0]}">${status[1]}</span></td><td><button class="row-expand" type="button" aria-label="${isOpen ? "Close" : "Inspect"} probability distribution">${isOpen ? "−" : "+"}</button></td></tr>${isOpen ? `<tr class="detail-row"><td colspan="7"><div class="probability-list">${distribution}</div></td></tr>` : ""}`;
  }).join("");
  if (rows.length > 250) $("#table-status").textContent = `Showing first 250 of ${rows.length} matching records`;
}

function loadText(text, name, synthetic = false) {
  const records = parseJsonl(text);
  state.records = records;
  state.report = evaluate(records, { threshold: state.threshold });
  state.name = name;
  state.synthetic = synthetic;
  state.opened = null;
  state.filter = "all";
  document.querySelectorAll(".filter-tab").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
  renderMetrics();
}

async function start() {
  try {
    const response = await fetch("/examples/support-triage.jsonl");
    if (!response.ok) throw new Error("Sample dataset could not be loaded.");
    loadText(await response.text(), "Jev support triage · sample", true);
  } catch (error) {
    $("#records-body").innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
  }

  $("#threshold-slider").addEventListener("input", (event) => {
    state.threshold = Number(event.target.value) / 100;
    renderMetrics();
  });
  $("#upload-button").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      loadText(await file.text(), file.name.replace(/\.(jsonl|ndjson)$/i, ""), false);
      toast(`Loaded ${state.records.length} records from ${file.name}`);
    } catch (error) {
      toast(error.message.split("\n")[0]);
    }
    event.target.value = "";
  });
  $("#export-button").addEventListener("click", () => {
    const report = evaluate(state.records, { threshold: state.threshold });
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "decisionops"}-report.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Evaluation report downloaded");
  });
  document.querySelectorAll(".filter-tab").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderRows();
  }));
  $("#records-body").addEventListener("click", (event) => {
    const row = event.target.closest("tr.data-row");
    if (!row) return;
    const id = row.dataset.id;
    state.opened = state.opened === id ? null : id;
    renderRows();
  });
  $("#search-toggle").addEventListener("click", () => {
    const input = $("#search-input");
    input.hidden = !input.hidden;
    if (!input.hidden) input.focus();
    else { input.value = ""; state.query = ""; renderRows(); }
  });
  $("#search-input").addEventListener("input", (event) => { state.query = event.target.value.trim(); renderRows(); });
  const drop = $(".dataset-control");
  drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("dragging"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
  drop.addEventListener("drop", async (event) => {
    event.preventDefault(); drop.classList.remove("dragging");
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    try { loadText(await file.text(), file.name.replace(/\.(jsonl|ndjson)$/i, ""), false); toast(`Loaded ${state.records.length} records from ${file.name}`); }
    catch (error) { toast(error.message.split("\n")[0]); }
  });
}

start();

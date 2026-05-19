import { formatVram } from "./models.js";

const WEBLLM_VERSION = "0.2.83";

const el = {
  status: document.querySelector("#status"),
  count: document.querySelector("#count"),
  filter: document.querySelector("#filter"),
  reload: document.querySelector("#reload"),
  table: document.querySelector(".model-table"),
  tableWrap: document.querySelector("#tableWrap"),
  toggleTableHeight: document.querySelector("#toggleTableHeight"),
  toggleJsonHeight: document.querySelector("#toggleJsonHeight"),
  tableBody: document.querySelector("#tableBody"),
  rawJson: document.querySelector("#rawJson"),
};

let records = [];
let sortState = {
  key: "model_id",
  direction: "asc",
};

function init() {
  el.filter.addEventListener("input", render);
  el.reload.addEventListener("click", loadPrebuiltModels);
  document.querySelectorAll(".sort-button").forEach((button) => {
    button.addEventListener("click", () => setSort(button.dataset.sortKey));
  });
  document.querySelectorAll(".column-resizer").forEach((handle, index) => {
    handle.addEventListener("pointerdown", (event) => startColumnResize(event, index));
  });
  el.toggleTableHeight.addEventListener("click", toggleTableHeight);
  el.toggleJsonHeight.addEventListener("click", toggleJsonHeight);
  render();
  loadPrebuiltModels();
}

async function loadPrebuiltModels() {
  setStatus("Loading WebLLM config...", "busy");
  try {
    const webllm = await import(`https://esm.run/@mlc-ai/web-llm@${WEBLLM_VERSION}`);
    records = [...(webllm.prebuiltAppConfig?.model_list || [])].sort((a, b) =>
      String(a.model_id || "").localeCompare(String(b.model_id || "")),
    );
    setStatus(`Loaded ${records.length} models`, "ready");
    render();
  } catch (error) {
    records = [];
    setStatus(error.message || String(error), "error");
    render();
  }
}

function render() {
  const query = el.filter.value.trim().toLowerCase();
  const visible = sortRecords(records.filter((record) => matchesRecord(record, query)));

  el.count.textContent = `${visible.length} / ${records.length} models`;
  el.rawJson.textContent = JSON.stringify(visible, null, 2);
  highlightJson();
  updateSortHeaders();
  el.tableBody.innerHTML = "";

  if (!visible.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7" class="muted">No models to show.</td>`;
    el.tableBody.append(row);
    return;
  }

  for (const record of visible) {
    const row = document.createElement("tr");
    row.append(
      codeCell(record.model_id),
      textCell(formatVram(record.vram_required_MB) || "-"),
      textCell(formatContext(record.overrides)),
      textCell(record.low_resource_required ? "yes" : "no"),
      textCell(formatFeatures(record.required_features)),
      codeCell(record.model),
      codeCell(record.model_lib),
    );
    el.tableBody.append(row);
  }
}

function setSort(key) {
  if (sortState.key === key) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState = { key, direction: "asc" };
  }
  render();
}

function sortRecords(items) {
  const direction = sortState.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => compareSortValue(getSortValue(a, sortState.key), getSortValue(b, sortState.key)) * direction);
}

function getSortValue(record, key) {
  if (key === "context") {
    return Number(record.overrides?.context_window_size || record.overrides?.sliding_window_size || 0);
  }
  if (key === "required_features") {
    return formatFeatures(record.required_features);
  }
  return record[key];
}

function compareSortValue(a, b) {
  const leftNumber = Number(a);
  const rightNumber = Number(b);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(a || "").localeCompare(String(b || ""));
}

function updateSortHeaders() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    button.dataset.sort = button.dataset.sortKey === sortState.key ? sortState.direction : "";
  });
}

function startColumnResize(event, index) {
  event.preventDefault();
  const column = el.table.querySelectorAll("col")[index];
  const startX = event.clientX;
  const startWidth = column.getBoundingClientRect().width;

  const move = (moveEvent) => {
    const width = Math.max(72, Math.round(startWidth + moveEvent.clientX - startX));
    column.style.width = `${width}px`;
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
}

function highlightJson() {
  if (window.Prism?.languages?.json) {
    window.Prism.highlightElement(el.rawJson);
  }
}

function toggleTableHeight() {
  const expanded = el.tableWrap.classList.toggle("expanded");
  el.toggleTableHeight.textContent = expanded ? "Collapse table" : "Expand table";
}

function toggleJsonHeight() {
  const box = el.rawJson.closest(".raw-json");
  const expanded = box.classList.toggle("expanded");
  el.toggleJsonHeight.textContent = expanded ? "Collapse JSON" : "Expand JSON";
}

function matchesRecord(record, query) {
  if (!query) {
    return true;
  }

  return [
    record.model_id,
    record.model,
    record.model_lib,
    record.required_features?.join(" "),
    JSON.stringify(record.overrides || {}),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function formatContext(overrides = {}) {
  const context = overrides.context_window_size;
  const sliding = overrides.sliding_window_size;
  const parts = [];
  if (Number.isFinite(Number(context)) && Number(context) > 0) {
    parts.push(`ctx ${context}`);
  }
  if (Number.isFinite(Number(sliding)) && Number(sliding) > 0) {
    parts.push(`sliding ${sliding}`);
  }
  return parts.join(", ") || "-";
}

function formatFeatures(features = []) {
  return Array.isArray(features) && features.length ? features.join(", ") : "-";
}

function codeCell(value) {
  const cell = document.createElement("td");
  const code = document.createElement("code");
  code.textContent = value || "-";
  cell.append(code);
  return cell;
}

function textCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value || "-";
  return cell;
}

function setStatus(text, state) {
  el.status.textContent = text;
  el.status.dataset.state = state;
}

init();

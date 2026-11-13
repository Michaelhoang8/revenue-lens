"use strict";
const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const sample =
  "date,category,amount,customer\n2026-01-03,Software,149.00,Acme\n2026-01-14,Services,320.00,Beacon\n2026-02-02,Software,199.00,Acme\n2026-02-12,Services,450.00,Cedar\n2026-03-01,Software,249.00,Delta\n2026-03-10,Services,600.00,Elm\n2026-03-12,Software,-49.00,Acme\n2026-03-15, Software ,99.00, Fir \n2026-03-15,Software,99.00,Fir\ninvalid,Services,120.00,Example\n2026-03-19,Software,,\n,,,\n";
let mode = "sales",
  result = null,
  busy = false,
  fileRevision = 0;
const config = {
  profile: ["Dataset overview", "Profile dataset →"],
  clean: ["Pipeline results", "Run cleaning pipeline →"],
  sales: ["Revenue overview", "Analyze sales →"],
};
function message(text, error = false) {
  $("#notice").textContent = text;
  $("#notice").className = error ? "error" : "";
}
function invalidate() {
  result = null;
  $("#download").disabled = true;
  $("#result").innerHTML =
    '<div class="empty">Choose data and generate a report.</div>';
}
function switchMode(next) {
  if (busy) return;
  fileRevision++;
  mode = "sales";
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode)),
    );
  $("#clean-options").hidden = mode !== "clean";
  $("#sales-options").hidden = mode !== "sales";
  $("#result-title").textContent = config[mode][0];
  $("#run").textContent = config[mode][1];
  invalidate();
  message("");
}
const table = (headers, rows) =>
  `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const stats = (items) =>
  `<div class="stats">${items.map(([label, value]) => `<div class="stat"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("")}</div>`;
const chartPageSize = 20;
function bars(title, items, key, page = 0) {
  const low = Math.min(0, ...items.map((i) => Number(i.amount))),
    high = Math.max(1, ...items.map((i) => Number(i.amount))),
    span = high - low,
    start = page * chartPageSize,
    end = Math.min(start + chartPageSize, items.length),
    visible = items.slice(start, end);
  let chart = "";
  if (key === "monthly") {
    const width = Math.max(600, visible.length * 90 + 50),
      gap = (width - 60) / Math.max(1, visible.length),
      y = (v) => 35 + ((high - v) / span) * 210,
      zero = y(0);
    chart = `<div class="monthly-scroll" tabindex="0" aria-label="Monthly amounts chart"><svg width="${width}" height="295" viewBox="0 0 ${width} 295" role="img" aria-label="Monthly net amounts: ${esc(visible.map((item) => `${item.label}: ${item.amount}`).join("; "))}. Negative amounts appear below zero."><line class="baseline" x1="25" x2="${width - 10}" y1="${zero}" y2="${zero}"/>${visible
      .map((item, i) => {
        const value = Number(item.amount),
          x = 30 + i * gap,
          w = Math.min(64, gap * 0.55),
          top = Math.min(zero, y(value)),
          height = Math.abs(y(value) - zero);
        return `<g><title>${esc(item.label)}: ${esc(item.amount)}</title><rect class="${value < 0 ? "negative" : "positive"}" x="${x + (gap - w) / 2}" y="${top}" width="${w}" height="${height}" rx="2"/><text class="value" x="${x + gap / 2}" y="${value < 0 ? y(value) + 17 : y(value) - 10}" text-anchor="middle">${esc(item.amount)}</text><text class="month" x="${x + gap / 2}" y="280" text-anchor="middle">${esc(item.label)}</text></g>`;
      })
      .join("")}</svg></div>`;
  } else {
    const x = (v) => ((v - low) / span) * 300,
      zero = x(0);
    chart = visible
      .map((item) => {
        const value = Number(item.amount);
        return `<div class="bar-row"><span>${esc(item.label)}</span><svg viewBox="0 0 300 20" role="img" aria-label="${esc(item.label)}: ${esc(item.amount)}"><line class="track" x1="0" x2="300" y1="10" y2="10"/><rect class="${value < 0 ? "negative" : "positive"}" x="${Math.min(zero, x(value))}" y="4" width="${Math.abs(x(value) - zero)}" height="12" rx="2"/><line class="baseline" x1="${zero}" x2="${zero}" y1="0" y2="20"/></svg><strong>${esc(item.amount)}</strong></div>`;
      })
      .join("");
  }
  return `<div class="chart" id="chart-${key}"><h3 tabindex="-1">${title}</h3>${visible.length ? chart : "<p>No valid rows to chart.</p>"}<div class="response-pagination" role="group" aria-label="${title} pages" ${items.length <= chartPageSize ? "hidden" : ""}><button type="button" data-chart="${key}" data-page="${page - 1}" ${page === 0 ? "disabled" : ""}>Previous</button><span role="status">${start + 1}–${end} of ${items.length}</span><button type="button" data-chart="${key}" data-page="${page + 1}" ${end >= items.length ? "disabled" : ""}>Next</button></div></div>`;
}
$("#result").addEventListener("click", (event) => {
  const button = event.target.closest("[data-chart]");
  if (!button || button.disabled || mode !== "sales" || !result) return;
  const key = button.dataset.chart;
  if (!["monthly", "categories"].includes(key)) return;
  const page = Math.max(
    0,
    Math.min(
      Math.ceil(result[key].length / chartPageSize) - 1,
      Number(button.dataset.page),
    ),
  );
  $(`#chart-${key}`).outerHTML = bars(
    key === "monthly" ? "Monthly net amount" : "Category breakdown",
    result[key],
    key,
    page,
  );
  const chart = $(`#chart-${key}`);
  chart.querySelector("h3").focus({ preventScroll: true });
  chart.scrollIntoView({ block: "start" });
});
function render(r) {
  if (mode === "profile") {
    $("#result").innerHTML =
      stats([
        ["Rows", r.rows],
        ["Columns", r.columns.length],
        ["Missing cells", r.missing_cells],
      ]) +
      `<p class="summary">${r.duplicate_rows} exact duplicate rows. Blank or whitespace-only cells count as missing. Numeric inference requires every nonblank value to be a finite number within ±1e100.</p>` +
      table(
        ["Column", "Type", "Missing", "Distinct", "Mean / median"],
        r.columns.map((c) => [
          c.name,
          c.type,
          c.missing,
          c.distinct,
          c.type === "numeric"
            ? `${Number(c.mean.toPrecision(6))} / ${Number(c.median.toPrecision(6))}`
            : "—",
        ]),
      ) +
      "<h3>Frequent values</h3>" +
      table(
        ["Column", "Top values (up to five)"],
        r.columns.map((c) => [
          c.name,
          c.top.map((v) => `${v.value} (${v.count})`).join(", "),
        ]),
      ) +
      "<h3>Preview · first 10 rows</h3>" +
      table(
        r.columns.map((c) => c.name),
        r.preview,
      );
  } else if (mode === "clean") {
    $("#result").innerHTML =
      stats([
        ["Input rows", r.input_rows],
        ["Output rows", r.output_rows],
        ["Trimmed cells", r.trimmed_cells],
      ]) +
      `<p class="summary">Removed ${r.duplicates_removed} duplicate rows and ${r.empty_rows_removed} blank rows. Original input is preserved. Download the cleaned CSV to continue your workflow.</p><h3>Preview · first 20 rows</h3>` +
      table(r.headers, r.preview);
  } else {
    $("#result").innerHTML =
      stats([
        ["Net amount", r.total],
        ["Average transaction", r.average ?? "N/A"],
        ["Accepted rows", r.accepted_rows],
        ["Rejected rows", r.rejected_rows],
      ]) +
      `<div class="report-charts">${bars("Monthly net amount", r.monthly, "monthly")}${bars("Categories", r.categories, "categories")}</div><p class="summary">${r.refund_rows} negative ${r.refund_rows === 1 ? "transaction" : "transactions"} included. Currency is not inferred or converted. Duplicate transactions are retained.</p><details class="rejections"><summary>Rejected records · ${r.rejected_rows}</summary>${table(
        ["Record", "Reason"],
        r.rejections.slice(0, 20).map((e) => [e.record, e.reason]),
      )}<p class="hint">First 20 shown. The report includes all rejected records.</p></details>`;
  }
}
document.querySelectorAll("[data-mode]").forEach((b) =>
  b.addEventListener("click", () => {
    location.hash = b.dataset.mode;
  }),
);
$("#sample").addEventListener("click", () => {
  fileRevision++;
  $("#source").value = sample;
  invalidate();
  message(
    "Fictional sample loaded. Includes duplicates, missing cells, and invalid dates.",
  );
});
document.querySelectorAll("textarea, fieldset input").forEach((input) =>
  input.addEventListener("input", () => {
    fileRevision++;
    invalidate();
    message("Input changed. Run the analysis to update the report.");
  }),
);
$("#file").addEventListener("change", async () => {
  const file = $("#file").files[0];
  if (!file) return;
  $("#file").value = "";
  const revision = ++fileRevision;
  try {
    message(`Reading ${file.name}…`);
    const text = await window.localTextFile.read(file, 1000000, "1 MB");
    if (revision !== fileRevision || busy) return;
    $("#source").value = text;
    invalidate();
    message(`Loaded ${file.name}. Review the input, then run the analysis.`);
    document.dispatchEvent(new Event("source-loaded"));
  } catch (error) {
    if (revision === fileRevision) message(error.message, true);
  } finally {
    if (revision === fileRevision) $("#file").value = "";
  }
});
$("#run").addEventListener("click", async () => {
  if (busy) return;
  fileRevision++;
  busy = true;
  $(".results").setAttribute("aria-busy", "true");
  result = null;
  $("#download").disabled = true;
  const controls = [
    ...document.querySelectorAll("input,select,textarea,button"),
  ];
  const disabled = controls.map((c) => c.disabled);
  controls.forEach((c) => (c.disabled = true));
  message("Processing locally…");
  try {
    const body = {
      csv: $("#source").value,
      options: {
        trim: $("#trim").checked,
        deduplicate: $("#deduplicate").checked,
        drop_empty: $("#drop-empty").checked,
      },
      mapping: {
        date: $("#date-column").value,
        category: $("#category-column").value,
        amount: $("#amount-column").value,
      },
    };
    const data = await window.analysisRequest(`/api/data/${mode}`, {
      ...body,
      ...window.capabilityInputs(),
    });
    result = data;
    render(data);
    window.renderCapabilities(data);
    $("#data-panel").close();
    message("Analysis complete. Source data was not saved.");
  } catch (e) {
    invalidate();
    message(e.message, true);
  } finally {
    busy = false;
    controls.forEach((c, index) => (c.disabled = disabled[index]));
    $("#download").disabled = !result;
    $(".results").setAttribute("aria-busy", "false");
  }
});
$("#download").addEventListener("click", () => {
  if (!result) return;
  const csv = mode === "clean";
  const blob = new Blob([csv ? result.csv : JSON.stringify(result, null, 2)], {
    type: csv ? "text/csv;charset=utf-8" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${mode}-result.${csv ? "csv" : "json"}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
switchMode("sales");

$("#data-open").addEventListener("click", () => $("#data-panel").showModal());
$("#data-close").addEventListener("click", () => $("#data-panel").close());
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !busy) {
    event.preventDefault();
    $("#run").click();
  }
});
document.addEventListener("DOMContentLoaded", () => {
  $("#source").value = sample;
  document.dispatchEvent(new Event("source-loaded"));
  $("#run").click();
});

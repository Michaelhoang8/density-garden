import { example, validate } from "./core.js";
const $ = (id) => document.getElementById(id),
  worker = new Worker("/worker.js", { type: "module" }),
  palette = ["#568774", "#b77a54", "#6479a5", "#a66e8c", "#8d873f", "#855f9a"];
let model = example(),
  result,
  sweep = [],
  selected = null,
  history = [],
  sequence = 0,
  ready = false;
function el(tag, text) {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
}
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function svg(tag, attrs) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
function download(name, data, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function compute() {
  ready = false;
  $("evidence").disabled = $("csv").disabled = true;
  $("eps").value = model.eps;
  $("minpts").value = model.minPts;
  $("undo").disabled = !history.length;
  worker.postMessage({ id: ++sequence, model });
  message("Finding core neighborhoods…");
}
function change(next, preset = "custom") {
  try {
    next = validate(next);
    history.push(structuredClone(model));
    if (history.length > 50) history.shift();
    model = next;
    $("example").value = preset;
    compute();
  } catch (error) {
    message(error.message, true);
  }
}
function color(p) {
  return p.cluster === null ? "#9c9284" : palette[p.cluster % palette.length];
}
function inspect() {
  const p = result?.records.find((p) => p.id === selected);
  $("selected").value = selected || "";
  $("remove").disabled = !p;
  $("inspection").replaceChildren();
  if (!p) {
    $("inspection").append(
      el("p", "Choose a point to inspect its neighborhood."),
    );
    draw();
    return;
  }
  $("inspection").append(
    el("h2", p.id),
    el("p", `${p.kind.toUpperCase()} · (${p.x}, ${p.y})`),
    el(
      "p",
      `${p.neighbors.length} neighbors, including itself. ${p.cluster === null ? "Unassigned noise." : "Assigned to cluster " + (p.cluster + 1) + "."}`,
    ),
    el(
      "p",
      p.ambiguous
        ? "Ambiguous border · candidate clusters " +
            p.candidates.map((c) => c + 1).join(", ")
        : "Candidate clusters: " +
            (p.candidates.map((c) => c + 1).join(", ") || "none"),
    ),
    el(
      "p",
      `Neighborhood distance: ${p.kDistance === null ? "unavailable" : p.kDistance.toFixed(2)}`,
    ),
  );
  draw();
}
function draw() {
  const plot = $("plot");
  plot.replaceChildren();
  if (!result) return;
  for (const tick of [0, 250, 500, 750, 1000]) {
    plot.append(
      svg("line", {
        x1: tick,
        y1: 0,
        x2: tick,
        y2: 1000,
        stroke: "#dedfd4",
        "stroke-width": 1,
      }),
      svg("line", {
        x1: 0,
        y1: tick,
        x2: 1000,
        y2: tick,
        stroke: "#dedfd4",
        "stroke-width": 1,
      }),
    );
    const xLabel = svg("text", {
      x: tick,
      y: 1023,
      "text-anchor": "middle",
      fill: "#828577",
      "font-size": 15,
    });
    xLabel.textContent = tick;
    const yLabel = svg("text", {
      x: 8,
      y: 1000 - tick - 8,
      "text-anchor": "start",
      fill: "#828577",
      "font-size": 15,
    });
    yLabel.textContent = tick;
    if (tick > 0 && tick < 1000) plot.append(yLabel);
    plot.append(xLabel);
  }
  const current = result.records.find((p) => p.id === selected),
    neighborSet = new Set(current?.neighbors || []);
  if (current)
    plot.append(
      svg("circle", {
        cx: current.x,
        cy: 1000 - current.y,
        r: result.model.eps,
        fill: "#ffffff44",
        stroke: "#806d58",
        "stroke-width": 2,
        "stroke-dasharray": "8 5",
      }),
    );
  for (const p of result.records) {
    const g = svg("g", {
      class: "point",
      "data-point": p.id,
      role: "button",
      tabindex: 0,
      "aria-label": `${p.id}, ${p.kind}, ${p.cluster === null ? "noise" : "cluster " + (p.cluster + 1)}`,
    });
    g.append(
      svg("circle", { cx: p.x, cy: 1000 - p.y, r: 16, fill: "transparent" }),
    );
    if (p.kind === "noise")
      g.append(
        svg("path", {
          d: `M${p.x - 5},${995 - p.y}l10,10m0,-10l-10,10`,
          stroke: color(p),
          "stroke-width": 3,
        }),
      );
    else
      g.append(
        svg("circle", {
          cx: p.x,
          cy: 1000 - p.y,
          r: p.kind === "core" ? 7 : 8,
          fill: p.kind === "core" ? color(p) : "#fbf5ec",
          stroke: color(p),
          "stroke-width": 3,
        }),
      );
    if (p.ambiguous)
      g.append(
        svg("circle", {
          cx: p.x,
          cy: 1000 - p.y,
          r: 13,
          fill: "none",
          stroke: color(p),
          "stroke-width": 2,
          "stroke-dasharray": "3 3",
        }),
      );
    if (p.id === selected || neighborSet.has(p.id))
      g.append(
        svg("circle", {
          cx: p.x,
          cy: 1000 - p.y,
          r: p.id === selected ? 18 : 12,
          fill: "none",
          stroke: "#493f38",
          "stroke-width": p.id === selected ? 3 : 1,
        }),
      );
    g.onclick = (e) => {
      e.stopPropagation();
      selected = p.id;
      inspect();
    };
    g.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selected = p.id;
        inspect();
        Array.from(plot.querySelectorAll(".point"))
          .find((node) => node.dataset.point === p.id)
          ?.focus({ preventScroll: true });
      }
    };
    plot.append(g);
  }
}
function render() {
  if (!result.records.some((p) => p.id === selected))
    selected = result.records[0]?.id ?? null;
  $("summary").replaceChildren(
    ...["clusters", "core", "border", "noise"].map((key) => {
      const p = el("p", key);
      p.prepend(el("b", String(result.summary[key])));
      return p;
    }),
  );
  $("selected").replaceChildren(
    ...result.records.map((p) => {
      const o = el("option", p.id + " · " + p.kind);
      o.value = p.id;
      return o;
    }),
  );
  inspect();
  $("sweep").replaceChildren(
    ...sweep.map((row) => {
      const tr = document.createElement("tr");
      if (row.eps === model.eps) tr.className = "active";
      const td = document.createElement("td"),
        b = el("button", String(row.eps));
      b.onclick = () => change({ ...model, eps: row.eps });
      td.append(b);
      tr.append(td);
      for (const key of ["clusters", "core", "border", "noise", "ambiguous"])
        tr.append(el("td", String(row[key])));
      return tr;
    }),
  );
  $("cost").textContent =
    `Radius lookup: ${result.summary.distanceChecks.toLocaleString()} distance checks / ${result.summary.allPairsChecks.toLocaleString()} all-pairs baseline. Profile computed separately.`;
  drawK();
}
function drawK() {
  const plot = $("kplot");
  plot.replaceChildren();
  const rows = result.kDistances.filter((r) => r.distance !== null);
  if (!rows.length) return;
  const max = Math.max(model.eps, ...rows.map((r) => r.distance), 1),
    x = (i) => 35 + (i / Math.max(1, rows.length - 1)) * 830,
    y = (d) => 180 - (d / max) * 150;
  plot.append(
    svg("path", {
      d: rows
        .map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r.distance)}`)
        .join(" "),
      fill: "none",
      stroke: "#568774",
      "stroke-width": 3,
    }),
    svg("line", {
      x1: 35,
      x2: 865,
      y1: y(model.eps),
      y2: y(model.eps),
      stroke: "#b77a54",
      "stroke-dasharray": "6 4",
    }),
  );
  const t = svg("text", { x: 35, y: 205, fill: "#8a7b6a", "font-size": 12 });
  t.textContent = `Sorted observations · dashed line ε = ${model.eps} · vertical maximum ${max.toFixed(1)}`;
  plot.append(t);
}
worker.onmessage = ({ data }) => {
  if (data.id !== sequence) return;
  if (data.error) {
    message(data.error, true);
    return;
  }
  result = data.result;
  sweep = data.sensitivity;
  ready = true;
  $("evidence").disabled = $("csv").disabled = false;
  render();
  message(
    `${model.points.length} observations · ${result.summary.ambiguous} ambiguous border points. ${model.points.length === 0 ? "Add a point to begin." : "Select a point to inspect."}`,
  );
};
worker.onerror = () =>
  message("Calculation worker failed. Reload to restart.", true);
function nextId() {
  let n = 1;
  while (model.points.some((p) => p.id === "P" + n)) n++;
  return "P" + n;
}
function addPoint(x, y) {
  const id = nextId();
  selected = id;
  change({ ...model, points: [...model.points, { id, x, y }] });
}
$("apply").onclick = () =>
  change({
    ...model,
    eps: Number($("eps").value),
    minPts: Number($("minpts").value),
  });
$("example").onchange = () =>
  change(example($("example").value), $("example").value);
$("undo").onclick = () => {
  if (history.length) {
    model = history.pop();
    $("example").value = "custom";
    compute();
  }
};
$("selected").onchange = () => {
  selected = $("selected").value;
  inspect();
};
$("remove").onclick = () => {
  if (selected)
    change({ ...model, points: model.points.filter((p) => p.id !== selected) });
};
$("add").onsubmit = (e) => {
  e.preventDefault();
  addPoint(Number($("x").value), Number($("y").value));
};
$("plot").onclick = (e) => {
  const rect = $("plot").getBoundingClientRect();
  addPoint(
    Math.max(
      0,
      Math.min(
        1000,
        Math.round(((e.clientX - rect.left) / rect.width) * 1060 - 30),
      ),
    ),
    Math.max(
      0,
      Math.min(
        1000,
        Math.round(1030 - ((e.clientY - rect.top) / rect.height) * 1060),
      ),
    ),
  );
};
$("save").onclick = () =>
  download("density-garden-study.json", JSON.stringify(model, null, 2) + "\n");
$("evidence").onclick = () => {
  if (ready)
    download(
      "density-garden-evidence.json",
      JSON.stringify({ ...result, sensitivity: sweep }, null, 2) + "\n",
    );
};
$("csv").onclick = () => {
  if (ready)
    download(
      "density-garden-assignments.csv",
      "id,x,y,kind,cluster,candidate_clusters,neighbor_count,k_distance\n" +
        result.records
          .map((p) =>
            [
              p.id,
              p.x,
              p.y,
              p.kind,
              p.cluster === null ? "" : p.cluster + 1,
              p.candidates.map((c) => c + 1).join(";"),
              p.neighbors.length,
              p.kDistance ?? "",
            ].join(","),
          )
          .join("\n") +
        "\n",
      "text/csv",
    );
};
$("open").onclick = () => $("file").click();
$("file").onchange = async () => {
  const file = $("file").files[0];
  try {
    if (!file) return;
    if (file.size > 100000) throw Error("Study file must be at most 100 KB.");
    change(JSON.parse(await file.text()));
  } catch (error) {
    message(error.message, true);
  } finally {
    $("file").value = "";
  }
};
compute();

$("analysis-open").onclick = () => $("analysis-panel").showModal();
$("analysis-close").onclick = () => $("analysis-panel").close();

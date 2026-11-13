export function validate(model) {
  if (
    !model ||
    typeof model !== "object" ||
    Array.isArray(model) ||
    Object.keys(model).sort().join(",") !== "eps,minPts,points"
  )
    throw Error("Provide exactly eps, minPts, and points.");
  if (!Number.isInteger(model.eps) || model.eps < 1 || model.eps > 300)
    throw Error("Radius must be an integer from 1 to 300.");
  if (!Number.isInteger(model.minPts) || model.minPts < 1 || model.minPts > 50)
    throw Error(
      "Minimum neighborhood must be an integer from 1 to 50, including the point itself.",
    );
  if (!Array.isArray(model.points) || model.points.length > 400)
    throw Error("Use at most 400 points.");
  const ids = new Set();
  for (const p of model.points) {
    if (
      !p ||
      Object.keys(p).sort().join(",") !== "id,x,y" ||
      typeof p.id !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(p.id) ||
      ids.has(p.id)
    )
      throw Error("Point IDs must be unique ASCII names of 1–20 characters.");
    ids.add(p.id);
    for (const k of ["x", "y"])
      if (!Number.isInteger(p[k]) || p[k] < 0 || p[k] > 1000)
        throw Error("Point coordinates must be integers from 0 to 1,000.");
  }
  return structuredClone(model);
}
const squared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export function cluster(input) {
  const model = validate(input),
    { points, eps, minPts } = model,
    n = points.length,
    buckets = new Map();
  const cell = (p) => [Math.floor(p.x / eps), Math.floor(p.y / eps)];
  points.forEach((p, i) => {
    const key = cell(p).join(",");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });
  let distanceChecks = 0;
  const neighbors = points.map((p) => {
    const [x, y] = cell(p),
      found = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of buckets.get(`${x + dx},${y + dy}`) || []) {
          distanceChecks++;
          if (squared(p, points[j]) <= eps * eps) found.push(j);
        }
    return found.sort((a, b) => a - b);
  });
  const core = neighbors.map((ns) => ns.length >= minPts),
    labels = Array(n).fill(-1),
    components = [];
  for (let i = 0; i < n; i++)
    if (core[i] && labels[i] === -1) {
      const label = components.length,
        queue = [i];
      labels[i] = label;
      for (let cursor = 0; cursor < queue.length; cursor++)
        for (const j of neighbors[queue[cursor]])
          if (core[j] && labels[j] === -1) {
            labels[j] = label;
            queue.push(j);
          }
      components.push(queue.sort((a, b) => a - b));
    }
  const records = points.map((p, i) => {
    const candidates = core[i]
      ? [labels[i]]
      : [
          ...new Set(neighbors[i].filter((j) => core[j]).map((j) => labels[j])),
        ].sort((a, b) => a - b);
    if (!core[i] && candidates.length) labels[i] = candidates[0];
    const distances = points.map((q) => squared(p, q)).sort((a, b) => a - b);
    return {
      ...p,
      index: i,
      kind: core[i] ? "core" : candidates.length ? "border" : "noise",
      cluster: labels[i] === -1 ? null : labels[i],
      candidates,
      ambiguous: candidates.length > 1,
      neighbors: neighbors[i].map((j) => points[j].id),
      kDistance: n >= minPts ? Math.sqrt(distances[minPts - 1]) : null,
    };
  });
  const clusters = components.map((indices, id) => ({
    id,
    core: indices.map((i) => points[i].id),
    members: records.filter((p) => p.cluster === id).map((p) => p.id),
  }));
  return {
    format: "density-garden-evidence-v1",
    model,
    records,
    clusters,
    summary: {
      clusters: clusters.length,
      core: core.filter(Boolean).length,
      border: records.filter((p) => p.kind === "border").length,
      noise: records.filter((p) => p.kind === "noise").length,
      ambiguous: records.filter((p) => p.ambiguous).length,
      distanceChecks,
      allPairsChecks: n * n,
    },
    kDistances: records
      .map((p) => ({ id: p.id, distance: p.kDistance }))
      .sort(
        (a, b) =>
          (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
          a.id.localeCompare(b.id),
      ),
  };
}
export function sensitivity(model) {
  validate(model);
  return [
    ...new Set(
      [0.5, 0.75, 1, 1.25, 1.5, 2].map((scale) =>
        Math.max(1, Math.min(300, Math.round(model.eps * scale))),
      ),
    ),
  ]
    .sort((a, b) => a - b)
    .map((eps) => ({ eps, ...cluster({ ...model, eps }).summary }));
}
export function example(name = "islands") {
  if (name === "border")
    return {
      eps: 100,
      minPts: 4,
      points: [
        { id: "L1", x: 300, y: 500 },
        { id: "L2", x: 230, y: 500 },
        { id: "L3", x: 240, y: 480 },
        { id: "L4", x: 240, y: 520 },
        { id: "R1", x: 500, y: 500 },
        { id: "R2", x: 570, y: 500 },
        { id: "R3", x: 560, y: 480 },
        { id: "R4", x: 560, y: 520 },
        { id: "Bridge", x: 400, y: 500 },
      ],
    };
  if (name === "duplicates")
    return {
      eps: 1,
      minPts: 3,
      points: [
        { id: "A", x: 300, y: 500 },
        { id: "B", x: 300, y: 500 },
        { id: "C", x: 300, y: 500 },
        { id: "D", x: 700, y: 500 },
      ],
    };
  if (name !== "islands") throw Error("Unknown example.");
  let seed = 73;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const points = [];
  for (const [cx, cy, count, radius] of [
    [260, 350, 42, 115],
    [670, 620, 52, 145],
  ])
    for (let i = 0; i < count; i++) {
      const a = random() * 2 * Math.PI,
        r = Math.sqrt(random()) * radius;
      points.push({
        id: "P" + (points.length + 1),
        x: Math.round(cx + r * Math.cos(a)),
        y: Math.round(cy + r * Math.sin(a)),
      });
    }
  for (const [x, y] of [
    [80, 800],
    [900, 130],
    [500, 80],
    [520, 930],
    [100, 100],
    [920, 900],
  ])
    points.push({ id: "P" + (points.length + 1), x, y });
  return { eps: 65, minPts: 5, points };
}

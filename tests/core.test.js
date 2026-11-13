import test from "node:test";
import assert from "node:assert/strict";
import { cluster, sensitivity, example, validate } from "../core.js";
function oracle(model) {
  const { points, eps, minPts } = model;
  const neighborhoods = points.map((p) =>
    points
      .map((q, j) => (Math.hypot(p.x - q.x, p.y - q.y) <= eps ? j : -1))
      .filter((j) => j >= 0),
  );
  const cores = neighborhoods.map((ns) => ns.length >= minPts);
  const labels = Array(points.length).fill(null);
  let id = 0;
  for (let i = 0; i < points.length; i++) {
    if (!cores[i] || labels[i] !== null) continue;
    const visited = new Set([i]);
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < points.length; j++)
        if (
          cores[j] &&
          !visited.has(j) &&
          [...visited].some((k) => neighborhoods[k].includes(j))
        ) {
          visited.add(j);
          changed = true;
        }
    }
    for (const j of visited) labels[j] = id;
    id++;
  }
  return points.map((p, i) => {
    const candidates = [
      ...new Set(
        neighborhoods[i].filter((j) => cores[j]).map((j) => labels[j]),
      ),
    ].sort((a, b) => a - b);
    return {
      neighbors: neighborhoods[i].map((j) => points[j].id),
      kind: cores[i] ? "core" : candidates.length ? "border" : "noise",
      cluster: cores[i] ? labels[i] : (candidates[0] ?? null),
      candidates,
    };
  });
}
test("spatial buckets match an all-pairs component oracle on 300 random clouds", () => {
  let seed = 17;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let t = 0; t < 300; t++) {
    const model = {
      eps: 1 + (random() % 300),
      minPts: 1 + (random() % 12),
      points: Array.from({ length: random() % 80 }, (_, i) => ({
        id: "P" + i,
        x: random() % 1001,
        y: random() % 1001,
      })),
    };
    const expected = oracle(model),
      actual = cluster(model);
    actual.records.forEach((r, i) => {
      for (const k of ["neighbors", "kind", "cluster", "candidates"])
        assert.deepEqual(r[k], expected[i][k]);
    });
    assert.ok(actual.summary.distanceChecks <= model.points.length ** 2);
  }
});
test("ambiguous border does not join two core components", () => {
  const r = cluster(example("border"));
  assert.equal(r.clusters.length, 2);
  const b = r.records.find((p) => p.id === "Bridge");
  assert.equal(b.kind, "border");
  assert.deepEqual(b.candidates, [0, 1]);
  assert.equal(b.cluster, 0);
  assert.equal(r.summary.ambiguous, 1);
  assert.equal(b.neighbors.length, 3);
  assert.equal(b.kDistance, Math.sqrt(26000));
});
test("reordering changes only ambiguous assignment and numeric cluster names", () => {
  const model = example("border"),
    a = cluster(model),
    b = cluster({ ...model, points: [...model.points].reverse() });
  assert.deepEqual(
    new Set(a.clusters.map((c) => c.core.sort().join(","))),
    new Set(b.clusters.map((c) => c.core.sort().join(","))),
  );
  assert.ok(
    a.clusters[a.records.find((p) => p.id === "Bridge").cluster].core.includes(
      "L1",
    ),
  );
  assert.ok(
    b.clusters[b.records.find((p) => p.id === "Bridge").cluster].core.includes(
      "R1",
    ),
  );
});
test("duplicate coordinates count as distinct observations and include self", () => {
  const r = cluster(example("duplicates"));
  assert.equal(r.summary.core, 3);
  assert.equal(r.summary.noise, 1);
  assert.equal(r.records[0].kDistance, 0);
  assert.equal(
    cluster({ eps: 1, minPts: 1, points: [{ id: "A", x: 0, y: 0 }] }).summary
      .core,
    1,
  );
});
test("radius boundary is inclusive and empty input is a valid empty garden", () => {
  const m = {
    eps: 5,
    minPts: 2,
    points: [
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 3, y: 4 },
    ],
  };
  assert.equal(cluster(m).summary.clusters, 1);
  assert.equal(cluster({ ...m, eps: 4 }).summary.noise, 2);
  assert.deepEqual(cluster({ eps: 1, minPts: 2, points: [] }).records, []);
  assert.equal(cluster({ ...m, minPts: 3 }).records[0].kDistance, null);
});
test("increasing radius cannot remove core points or create new noise", () => {
  const m = example();
  let previous = null;
  for (const row of sensitivity(m)) {
    if (previous) {
      assert.ok(row.core >= previous.core);
      assert.ok(row.noise <= previous.noise);
    }
    previous = row;
  }
  const r = cluster(m);
  assert.equal(r.summary.core + r.summary.border + r.summary.noise, 100);
  assert.ok(r.summary.distanceChecks < r.summary.allPairsChecks);
});
test("strict bounds reject invalid coordinates, identities, and shapes", () => {
  const m = example();
  for (const extra of [
    { eps: 0 },
    { eps: 1.2 },
    { minPts: 51 },
    { points: [{ id: "A", x: 1001, y: 0 }] },
    {
      points: [
        { id: "A", x: 0, y: 0 },
        { id: "A", x: 1, y: 1 },
      ],
    },
    { points: Array(401).fill({ id: "A", x: 0, y: 0 }) },
    { unexpected: true },
  ])
    assert.throws(() => validate({ ...m, ...extra }));
  assert.throws(() => example("unknown"));
});

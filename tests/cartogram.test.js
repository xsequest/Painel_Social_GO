import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleRing, separateCircles, animationStages } from '../assets/js/cartogram.js';

test('resamples a closed polygon uniformly without duplicating its endpoint', () => {
  const ring = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
  assert.deepEqual(sampleRing(ring, 4), ring.slice(0, 4));
  assert.equal(sampleRing(ring).length, 128);
});

test('territories become circles before any geographic displacement', () => {
  assert.deepEqual(animationStages(0), { shape: 0, displacement: 0, phase: 'morph' });
  assert.equal(animationStages(0.5).displacement, 0);
  assert.deepEqual(animationStages(2 / 3), { shape: 1, displacement: 0, phase: 'settling' });
  assert.deepEqual(animationStages(1), { shape: 1, displacement: 1, phase: 'circles' });
});

test('larger indicators remain anchored and only the overlapping smaller circle moves', () => {
  const nodes = [
    { id: 'small', anchorX: 8, anchorY: 0, radius: 2 },
    { id: 'large', anchorX: 0, anchorY: 0, radius: 10 },
    { id: 'remote', anchorX: 100, anchorY: 100, radius: 3 },
    { id: 'zero', anchorX: 0, anchorY: 0, radius: 0 }
  ];
  separateCircles(nodes);
  assert.deepEqual([nodes[1].x, nodes[1].y], [0, 0]);
  assert.deepEqual([nodes[2].x, nodes[2].y], [100, 100]);
  assert.deepEqual([nodes[3].x, nodes[3].y], [0, 0]);
  assert.deepEqual([nodes[0].x, nodes[0].y], [13.5, 0]);
});

test('a smaller circle chooses the nearest gap between two anchored larger circles', () => {
  const nodes = [
    { anchorX: 0, anchorY: 0, radius: 10 },
    { anchorX: 20, anchorY: 0, radius: 8 },
    { anchorX: 10, anchorY: 0, radius: 1 }
  ];
  separateCircles(nodes);
  assert.deepEqual([nodes[0].x, nodes[0].y, nodes[1].x, nodes[1].y], [0, 0, 20, 0]);
  assert.ok(Math.abs(nodes[2].x - 11.15) < 1e-8);
  assert.ok(Math.abs(Math.hypot(nodes[2].x, nodes[2].y) - 12.5) < 1e-8);
  assert.ok(Math.abs(Math.hypot(nodes[2].x - 20, nodes[2].y) - 10.5) < 1e-8);
});

test('coincident anchors, single nodes and empty data produce finite deterministic layouts', () => {
  const input = [10, 5, 1].map(radius => ({ anchorX: 0, anchorY: 0, radius }));
  const nodes = separateCircles(structuredClone(input));
  assert.deepEqual(nodes, separateCircles(structuredClone(input)));
  assert.ok(nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.deepEqual(separateCircles([]), []);
  assert.deepEqual(separateCircles([input[0]]).map(node => [node.x, node.y]), [[0, 0]]);
});

test('circle collision layout is deterministic and preserves proportional radii', () => {
  const input = Array.from({ length: 80 }, (_, i) => ({ x: i % 8, y: Math.floor(i / 8), anchorX: i % 8, anchorY: Math.floor(i / 8), radius: Math.sqrt(i + 1) }));
  const nodes = separateCircles(structuredClone(input));
  assert.deepEqual(nodes, separateCircles(structuredClone(input)));
  nodes.forEach((node, i) => {
    assert.equal(node.radius, input[i].radius);
    for (const other of nodes.slice(i + 1)) {
      assert.ok(Math.hypot(node.x - other.x, node.y - other.y) >= node.radius + other.radius + 1.45);
    }
  });
});

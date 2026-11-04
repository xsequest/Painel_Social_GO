// Work in a fixed Web Mercator plane so zooming never changes the layout.
const ZOOM = 7;
const TAU = Math.PI * 2;
export const CARTOGRAM_PHASES = {
  morph: 'Transformando territórios em círculos',
  settling: 'Ajustando os círculos próximos à localização original',
  circles: 'Círculos geográficos proporcionais ao indicador'
};

export function sampleRing(ring, count = 128) {
  const points = ring.slice();
  if (points.length > 1 && points[0].x === points.at(-1).x && points[0].y === points.at(-1).y) points.pop();
  const lengths = points.map((point, i) => Math.hypot(point.x - points[(i + 1) % points.length].x, point.y - points[(i + 1) % points.length].y));
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  let segment = 0, offset = 0;
  return Array.from({ length: count }, (_, i) => {
    const distance = perimeter * i / count;
    while (segment < points.length - 1 && offset + lengths[segment] < distance) offset += lengths[segment++];
    const a = points[segment], b = points[(segment + 1) % points.length];
    const t = lengths[segment] ? (distance - offset) / lengths[segment] : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

export function separateCircles(nodes) {
  const placed = [];
  const ordered = nodes.slice().sort((a, b) => b.radius - a.radius || String(a.id ?? '').localeCompare(String(b.id ?? '')));
  for (const node of ordered) {
    node.x = node.anchorX;
    node.y = node.anchorY;
    if (!node.radius) continue;
    const obstacles = placed.map(other => ({ x: other.x, y: other.y, radius: other.radius + node.radius + 1.5 }));
    const clear = (x, y) => obstacles.every(other => (x - other.x) ** 2 + (y - other.y) ** 2 >= other.radius ** 2 - 1e-6);
    if (!clear(node.x, node.y)) {
      let bestDistance = Infinity;
      const consider = (x, y) => {
        const distance = (x - node.anchorX) ** 2 + (y - node.anchorY) ** 2;
        if (distance < bestDistance && clear(x, y)) {
          node.x = x;
          node.y = y;
          bestDistance = distance;
        }
      };
      // Cardinal exits guarantee a feasible fallback even for coincident anchors.
      consider(Math.max(...obstacles.map(other => other.x + other.radius)), node.anchorY);
      consider(Math.min(...obstacles.map(other => other.x - other.radius)), node.anchorY);
      consider(node.anchorX, Math.max(...obstacles.map(other => other.y + other.radius)));
      consider(node.anchorX, Math.min(...obstacles.map(other => other.y - other.radius)));
      for (const other of obstacles) {
        const dx = node.anchorX - other.x, dy = node.anchorY - other.y;
        const distance = Math.hypot(dx, dy);
        if (distance) consider(other.x + dx / distance * other.radius, other.y + dy / distance * other.radius);
      }
      // The nearest free point lies on one exclusion-circle boundary or an intersection.
      const nearby = obstacles.filter(other => Math.hypot(other.x - node.anchorX, other.y - node.anchorY) - other.radius <= Math.sqrt(bestDistance));
      for (let i = 0; i < nearby.length; i++) {
        for (let j = i + 1; j < nearby.length; j++) {
          const a = nearby[i], b = nearby[j], dx = b.x - a.x, dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          if (!distance || distance > a.radius + b.radius || distance < Math.abs(a.radius - b.radius)) continue;
          const along = (a.radius ** 2 - b.radius ** 2 + distance ** 2) / (2 * distance);
          const height = Math.sqrt(Math.max(0, a.radius ** 2 - along ** 2));
          const x = a.x + dx / distance * along, y = a.y + dy / distance * along;
          consider(x - dy / distance * height, y + dx / distance * height);
          consider(x + dy / distance * height, y - dx / distance * height);
        }
      }
    }
    // Larger circles stay fixed while smaller ones choose their nearest free location.
    placed.push(node);
  }
  return nodes;
}

export function animationStages(progress) {
  const ease = t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  return {
    shape: ease(Math.min(1, progress / (2 / 3))),
    displacement: ease(Math.max(0, (progress - 2 / 3) * 3)),
    phase: progress === 1 ? 'circles' : progress < 2 / 3 ? 'morph' : 'settling'
  };
}

export function createCartogram(map, layerGroup, getData, onComplete) {
  let nodes = [], progress = 0, target = 0, frame = null, metricKey = '';
  const originals = new Map();
  const smoothing = new Map();
  layerGroup.eachLayer(layer => {
    originals.set(layer, layer.getLatLngs());
    smoothing.set(layer, layer.options.smoothFactor);
  });
  const originalBounds = layerGroup.getBounds();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  motionPreference.addEventListener('change', event => {
    if (event.matches && frame !== null) {
      finish();
      onComplete?.(Boolean(target));
    }
  });
  function prepare() {
    const layers = [...originals.keys()];
    const data = layers.map(layer => getData(layer.feature));
    const values = data.map(item => {
      const value = Number(item.value);
      return Number.isFinite(value) ? Math.abs(value) : 0;
    });
    const key = JSON.stringify(data.map((item, i) => [values[i], item.visible]));
    if (key === metricKey) return;
    metricKey = key;
    nodes = layers.map((layer, index) => {
      const geometry = layer.feature.geometry;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      const groups = polygons.map(polygon => polygon.map((ring, ringIndex) => {
        const points = ring.map(([lng, lat]) => map.project([lat, lng], ZOOM));
        let centroidX = 0, centroidY = 0;
        const area = points.reduce((sum, point, i) => {
          const next = points[(i + 1) % points.length];
          const cross = point.x * next.y - next.x * point.y;
          centroidX += (point.x + next.x) * cross;
          centroidY += (point.y + next.y) * cross;
          return sum + cross;
        }, 0) / 2;
        const fallback = L.bounds(points).getCenter();
        return { originalPoints: points, points: sampleRing(points), area, exterior: ringIndex === 0, centerX: area ? centroidX / (6 * area) : fallback.x, centerY: area ? centroidY / (6 * area) : fallback.y };
      }));
      const rings = groups.flat();
      const main = rings.filter(ring => ring.exterior).sort((a, b) => Math.abs(b.area) - Math.abs(a.area))[0];
      const polygonBounds = L.bounds(rings.flatMap(ring => ring.originalPoints));
      const center = polygonBounds.getCenter();
      const area = rings.reduce((sum, ring) => sum + (ring.exterior ? 1 : -1) * Math.abs(ring.area), 0);
      const anchorX = area ? rings.reduce((sum, ring) => sum + ring.centerX * Math.abs(ring.area) * (ring.exterior ? 1 : -1), 0) / area : center.x;
      const anchorY = area ? rings.reduce((sum, ring) => sum + ring.centerY * Math.abs(ring.area) * (ring.exterior ? 1 : -1), 0) / area : center.y;
      return { layer, groups, main, anchorX, anchorY, x: anchorX, y: anchorY, area, id: String(layer.feature.properties.name), value: values[index], visible: data[index].visible };
    });
    // Reserve geographic breathing room instead of expanding circles to fill the map.
    const areaTotal = nodes.reduce((sum, node) => sum + node.area, 0);
    const factor = 0.45 * areaTotal / (values.reduce((sum, value) => sum + value, 0) || 1);
    nodes.forEach(node => { node.radius = Math.sqrt(node.value * factor / Math.PI); });
    separateCircles(nodes.filter(node => node.visible));
    return true;
  }
  function draw() {
    const stages = animationStages(progress);
    map.getContainer().dataset.cartogramPhase = progress === 0 ? 'territories' : stages.phase;
    const status = document.getElementById('cartogram-phase');
    if (status && status.textContent !== CARTOGRAM_PHASES[stages.phase]) status.textContent = CARTOGRAM_PHASES[stages.phase];
    if (progress === 0) {
      originals.forEach((coordinates, layer) => {
        layer.options.smoothFactor = smoothing.get(layer);
        layer.setLatLngs(coordinates);
      });
      return;
    }
    const { shape, displacement } = stages;
    for (const node of nodes) {
      if (!node.visible) {
        node.layer.setLatLngs(originals.get(node.layer));
        continue;
      }
      node.layer.options.smoothFactor = 0;
      const cx = node.anchorX + (node.x - node.anchorX) * displacement;
      const cy = node.anchorY + (node.y - node.anchorY) * displacement;
      const start = Math.atan2(node.main.points[0].y - node.anchorY, node.main.points[0].x - node.anchorX);
      const direction = Math.sign(node.main.area) || 1;
      node.layer.setLatLngs(node.groups.map(group => group.map(ring => (shape ? ring.points : ring.originalPoints).map((point, i, points) => {
        const angle = start + direction * TAU * i / points.length;
        const radius = ring === node.main ? node.radius : 0;
        return map.unproject(L.point(
          point.x * (1 - shape) + (cx + Math.cos(angle) * radius) * shape,
          point.y * (1 - shape) + (cy + Math.sin(angle) * radius) * shape
        ), ZOOM);
      }))));
    }
  }
  function finish() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    progress = target;
    draw();
    map.getContainer().setAttribute('aria-busy', 'false');
  }
  return {
    setActive(active) {
      prepare();
      if (frame !== null) cancelAnimationFrame(frame);
      target = active ? 1 : 0;
      const from = progress, start = performance.now();
      const duration = 1800 * Math.abs(target - from);
      if (!duration || motionPreference.matches) { finish(); onComplete?.(Boolean(target)); return; }
      map.getContainer().setAttribute('aria-busy', 'true');
      const tick = now => {
        const t = Math.min(1, (now - start) / duration);
        progress = from + (target - from) * t;
        draw();
        frame = t < 1 ? requestAnimationFrame(tick) : null;
        if (t === 1) {
          map.getContainer().setAttribute('aria-busy', 'false');
          onComplete?.(Boolean(target));
        }
      };
      frame = requestAnimationFrame(tick);
    },
    refresh() {
      if (!target || !prepare()) return false;
      draw();
      return true;
    },
    finish,
    getBounds(includeOriginal = progress > 0 && progress < 1) {
      if (!target && !includeOriginal) return originalBounds;
      prepare();
      const bounds = L.latLngBounds([]);
      for (const node of nodes.filter(node => node.visible)) {
        bounds.extend(map.unproject([node.x - node.radius, node.y - node.radius], ZOOM));
        bounds.extend(map.unproject([node.x + node.radius, node.y + node.radius], ZOOM));
      }
      if (!bounds.isValid()) bounds.extend(originalBounds);
      if (includeOriginal) bounds.extend(originalBounds);
      return bounds;
    }
  };
}

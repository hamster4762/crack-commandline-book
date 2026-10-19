(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const types = {
    kingdom: ['국가', '거점', '#ddc28a', '<path d="m3 8 4 3 5-7 5 7 4-3-2 11H5zM6 16h12"/>'],
    capital: ['왕도', '거점', '#ddc28a', '<path d="M4 20V9h4v3h3V5h3v7h3V9h3v11zM10 20v-5h4v5M9 5l3-3 3 3"/>'],
    city: ['도시', '거점', '#ddc28a', '<path d="M3 20h18M5 20V9h6v11m2 0V4h6v16M7 12h2m-2 3h2m6-8h2m-2 3h2m-2 3h2"/>'],
    town: ['소도시', '거점', '#ddc28a', '<path d="m3 12 5-5 5 5m-8-2v10h6V10m2 10V7l4-4 4 4v13zm3-9h2m-2 4h2"/>'],
    village: ['마을', '거점', '#ddc28a', '<path d="m3 11 9-7 9 7M6 10v10h12V10M10 20v-6h4v6M16 5V3"/>'],
    port: ['항구', '거점', '#ddc28a', '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7 10h10M4 14v3c0 4 16 4 16 0v-3M2 16l2-2 2 2m12 0 2-2 2 2"/>'],
    fortress: ['요새', '거점', '#ddc28a', '<path d="M4 20V5h4v3h3V5h3v3h3V5h3v15zM10 20v-5a2 2 0 0 1 4 0v5"/>'],
    temple: ['성소', '거점', '#ddc28a', '<path d="m3 9 9-6 9 6H3zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18M12 2v3"/>'],
    forest: ['숲', '자연', '#a4c391', '<path d="m8 3-5 8h3l-4 6h12l-4-6h3zm0 14v5m8-16-4 7h3l-2 4h8l-3-4h3zm0 11v5"/>'],
    mountain: ['산', '자연', '#a4c391', '<path d="m2 20 10-17 10 17zm6-10 4 3 4-3M6 20l4-5m8 5-3-4"/>'],
    mountainRange: ['산맥', '자연', '#a4c391', '<path d="m1 20 7-13 4 7 5-11 6 17H1zm9-3 2-3m-7-2 3 2 2-2m5-4 2 2 2-2"/>'],
    plains: ['평원', '자연', '#a4c391', '<path d="M2 17c5-8 10-8 20 0M2 21h20M12 15V7m0 4L8 8m4 1 4-3M5 20v-4m13 4v-4"/>'],
    desert: ['사막', '자연', '#a4c391', '<circle cx="17" cy="6" r="3"/><path d="M2 16c5-7 9-7 14-1m-8 5c5-8 10-8 14-4M2 21h20"/>'],
    marsh: ['늪', '자연', '#a4c391', '<path d="M2 18c4-3 7 3 11 0s6 2 9 0M3 22c4-3 7 3 11 0M8 16V4m0 5L4 6m4 6 4-4m5 8V8m0 4 3-3"/>'],
    coast: ['해안', '수역', '#89b8c3', '<path d="M5 2c7 5-4 9 3 14s-2 6-2 6M13 5c3-3 5 3 8 0m-7 7c3-3 5 3 8 0m-8 7c3-3 5 3 8 0"/>'],
    sea: ['바다', '수역', '#89b8c3', '<path d="M2 7c4-4 6 4 10 0s6 4 10 0M2 12c4-4 6 4 10 0s6 4 10 0M2 17c4-4 6 4 10 0s6 4 10 0"/>'],
    river: ['강', '수역', '#89b8c3', '<path d="M8 2c14 5-11 9 0 14s4 6 4 6M14 2c14 5-11 9 0 14s4 6 4 6"/>'],
    lake: ['호수', '수역', '#89b8c3', '<path d="M4 10c-4 5-2 11 6 10 6 3 14-1 11-7 2-5-8-4-10-7-4-3-6 0-7 4zM6 13c4-3 7 3 11 0m-9 4h6"/>'],
    island: ['섬', '수역', '#89b8c3', '<path d="M2 20c4-3 7 3 11 0s6 2 9 0M5 16l7-9 7 9H5zm7-9V3m0 0 5 2-5 1"/>'],
    ruins: ['유적', '미지 · 위험', '#c79685', '<path d="M3 21h18M5 21V6h4v4H7v11m8 0V9l3-2 2 2v12M4 4h6m4 1 4-3 4 3M11 21l2-5-3-3 3-4"/>'],
    dungeon: ['던전', '미지 · 위험', '#c79685', '<path d="m2 20 4-12 6-5 6 5 4 12H2zm7 0v-6a3 3 0 0 1 6 0v6M6 10l3-3m9 6-2-4"/>'],
    tower: ['마탑', '미지 · 위험', '#c79685', '<path d="m7 7 5-5 5 5H7zm2 0-2 14h10L15 7M6 21h12m-6-9v2m-1 7v-3h2v3"/>'],
    rift: ['균열', '미지 · 위험', '#c79685', '<path d="m14 2-7 8h5l-3 5h5l-3 7 8-11h-5l4-6h-5zM4 5l2 2m13 12 2 2M2 15h3m15-9h2"/>'],
    volcano: ['화산', '미지 · 위험', '#c79685', '<path d="m2 21 7-13h6l7 13H2zm7-13 3 4 3-4M11 5 9 2m5 3 2-3m-4 15v3"/>'],
    unknown: ['알 수 없음', '', '#b2b5a5', '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3h.01"/>'],
  };
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  let map = emptyMap();
  let imageURL = '';
  let selected = null;
  let editing = null;
  let mode = 'move';
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let dirty = false;
  let savedMap = JSON.stringify(map);
  const undoHistory = [];
  const redoHistory = [];
  let regionById = new Map();
  const nodes = new Map();
  const labels = new Map();
  const routes = [];
  const pointers = new Map();
  let gesture = null;
  let pinch = null;
  let longPress;
  let menuTarget = null;
  let noticeTimer;

  function emptyMap() {
    return { name: '새 지도', width: 80, height: 60, distanceScale: 1, backgroundImage: '', regions: [] };
  }

  function svgElement(tag, attributes = {}) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function regionType(type) { return Object.hasOwn(types, type) ? types[type] : types.unknown; }
  function point(region) { return { x: (region.x + .5) * 12, y: (region.y + .5) * 12 }; }
  function currentRegion() { return selected === null ? null : regionById.get(selected); }
  function markDirty(value = true) { dirty = value; $('dirty').hidden = !value; }
  function updateHistoryButtons() {
    $('undo').disabled = undoHistory.length === 0;
    $('redo').disabled = redoHistory.length === 0;
  }

  // 이미지 사본 없이 지도 JSON만 보관한다. 드래그 한 번은 하나의 편집으로 기록한다.
  function rememberChange() {
    undoHistory.push(JSON.stringify(map));
    if (undoHistory.length > 100) undoHistory.shift();
    redoHistory.length = 0;
    updateHistoryButtons();
  }

  function restoreHistory(from, to) {
    if (!from.length) return;
    const inspectorOpen = !$('inspector').hidden;
    to.push(JSON.stringify(map));
    map = JSON.parse(from.pop());
    editing = null;
    $('inspector').hidden = true; $('context-menu').hidden = true;
    syncSettings(); renderMap();
    if (inspectorOpen && currentRegion()) openInspector(currentRegion());
    markDirty(JSON.stringify(map) !== savedMap);
    updateHistoryButtons();
  }
  function notice(message, error = false) {
    clearTimeout(noticeTimer);
    $('notice').textContent = message;
    $('notice').classList.toggle('error', error);
    $('notice').hidden = false;
    noticeTimer = setTimeout(() => { $('notice').hidden = true; }, error ? 6500 : 2800);
  }

  function setupTypes() {
    for (const [type, [name, category, , paths]] of Object.entries(types)) {
      const symbol = svgElement('symbol', { id: `editor-type-${type}`, viewBox: '0 0 24 24' });
      symbol.innerHTML = paths;
      $('defs').append(symbol);
      if (type === 'unknown') continue;
      let group = [...$('region-type').children].find(node => node.label === category);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = category;
        $('region-type').append(group);
      }
      group.append(new Option(name, type));
    }
  }

  // 아래 좌표와 크기 계산은 지도 확장의 렌더링과 동일하게 유지한다.
  function renderMap(resetCamera = false) {
    $('context-menu').hidden = true;
    regionById = new Map(map.regions.map(region => [String(region.id), region]));
    if (!regionById.has(selected)) selected = null;
    nodes.clear(); labels.clear(); routes.length = 0;
    $('routes').replaceChildren(); $('regions').replaceChildren(); $('labels').replaceChildren();
    canvas.setAttribute('viewBox', `0 0 ${map.width * 12} ${map.height * 12}`);
    canvas.setAttribute('aria-label', `${map.name} 지도 편집`);
    for (const id of ['background', 'map-border']) {
      $(id).setAttribute('width', map.width * 12);
      $(id).setAttribute('height', map.height * 12);
    }
    const seen = new Set();
    for (const region of map.regions) {
      for (const id of region.neighbors || []) {
        const other = regionById.get(String(id));
        if (!other) continue;
        const key = JSON.stringify([String(region.id), String(other.id)].sort());
        if (seen.has(key)) continue;
        seen.add(key);
        const shadow = svgElement('line', { class: 'map-road road-shadow' });
        const line = svgElement('line', { class: 'map-road' });
        const hit = svgElement('line', { class: 'route-hit', 'data-route': routes.length });
        routes.push({ a: String(region.id), b: String(other.id), shadow, line, hit });
        $('routes').append(shadow, line, hit);
      }
      const type = regionType(region.type);
      const framed = type[1] === '거점' || type[1] === '미지 · 위험';
      const scale = Math.max(1, Math.min(5, region.scale));
      const size = [0, 16, 24, 34, 48, 64][scale];
      const p = point(region), id = String(region.id);
      const group = svgElement('g', { class: 'map-region', 'data-id': id, transform: `translate(${p.x} ${p.y})`,
        tabindex: '0', role: 'button', 'aria-label': `${region.name}, ${type[0]}` });
      group.style.color = type[2];
      group.append(svgElement('circle', { r: Math.max(20, size / 2 + 6), class: 'region-hit' }));
      if (framed) group.append(svgElement('circle', { r: size / 2 - 1, class: 'region-disc' }));
      group.append(svgElement('use', { href: `#editor-type-${Object.hasOwn(types, region.type) ? region.type : 'unknown'}`,
        x: -size / 2 + 3, y: -size / 2 + 3, width: size - 6, height: size - 6, class: 'region-symbol' }));
      const label = svgElement('text', { class: `region-label region-scale-${scale}`, 'dominant-baseline': 'hanging' });
      label.textContent = region.name;
      nodes.set(id, group);
      labels.set(id, { node: label, bottom: size / 2 - (framed ? 1 : 3) });
      $('regions').append(group); $('labels').append(label);
    }
    updateRoutes();
    $('empty-state').hidden = map.regions.length > 0;
    $('map-summary').textContent = `${map.width} × ${map.height} · ${map.regions.length}개 지역`;
    if (resetCamera) { zoom = 1; pan = { x: 0, y: 0 }; }
    highlight(); updateCamera();
  }

  function updateRoutes(id = null) {
    for (const route of routes) {
      if (id !== null && route.a !== id && route.b !== id) continue;
      const a = point(regionById.get(route.a)), b = point(regionById.get(route.b));
      for (const node of [route.line, route.shadow, route.hit]) {
        for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })) node.setAttribute(key, value);
      }
    }
  }

  function screenScale() {
    const matrix = canvas.getScreenCTM();
    return matrix ? Math.max(.001, Math.hypot(matrix.a, matrix.b) * zoom) : 1;
  }

  function updateLabel(id, compensation) {
    const entry = labels.get(id), region = regionById.get(id);
    const p = point(region);
    entry.node.setAttribute('transform', `translate(${p.x} ${p.y + entry.bottom + 3 * compensation}) scale(${compensation})`);
  }

  function updateCamera() {
    $('camera').setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
    const compensation = Math.min(1, 1 / screenScale());
    for (const id of labels.keys()) updateLabel(id, compensation);
    for (const node of $('distances').children) {
      node.setAttribute('transform', `translate(${node.dataset.x} ${node.dataset.y}) scale(${compensation})`);
    }
    $('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
  }

  function zoomBy(factor, center = { x: map.width * 6, y: map.height * 6 }) {
    const next = Math.max(.7, Math.min(3.5, zoom * factor));
    pan = { x: center.x - (center.x - pan.x) * next / zoom, y: center.y - (center.y - pan.y) * next / zoom };
    zoom = next; updateCamera();
  }

  function formatTravelTime(a, b) {
    const hours = Math.round(Math.hypot(a.x - b.x, a.y - b.y) / (map.distanceScale ?? 1) * 24);
    const days = Math.floor(hours / 24), rest = hours % 24;
    return [days ? `${days}일` : '', rest || !days ? `${rest}시간` : ''].filter(Boolean).join(' ');
  }

  function highlight() {
    $('distances').replaceChildren();
    canvas.classList.toggle('has-selection', selected !== null);
    for (const [id, node] of nodes) {
      node.classList.toggle('is-selected', id === selected);
      node.setAttribute('aria-pressed', String(id === selected));
      labels.get(id).node.classList.toggle('is-selected', id === selected);
    }
    for (const route of routes) {
      const active = route.a === selected || route.b === selected;
      route.line.classList.toggle('is-highlighted', active);
      if (!active) continue;
      const a = regionById.get(route.a), b = regionById.get(route.b);
      const pa = point(a), pb = point(b), text = formatTravelTime(a, b);
      const x = (pa.x + pb.x) / 2, y = (pa.y + pb.y) / 2, width = Math.max(36, text.length * 8 + 12);
      const group = svgElement('g', { 'data-x': x, 'data-y': y });
      const caption = svgElement('text', { class: 'distance-text', y: .5 });
      caption.textContent = text;
      group.append(svgElement('rect', { x: -width / 2, y: -10, width, height: 20, rx: 2, class: 'distance-plate' }), caption);
      $('distances').append(group);
    }
    const region = currentRegion();
    $('selection-card').hidden = !region;
    $('edit-selected').disabled = !region;
    if (region) {
      $('selected-name').textContent = region.name;
      $('selected-type').textContent = regionType(region.type)[0];
      $('selected-description').textContent = region.description || '';
    }
    updateCamera();
  }

  function selectRegion(id) {
    if (selected !== id) $('inspector').hidden = true;
    selected = id; highlight();
    if (id !== null && window.matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)').matches) {
      openInspector(regionById.get(id));
    }
  }

  function openInspector(region, adding = false) {
    editing = { region, adding };
    $('region-id').textContent = `ID ${region.id}`;
    $('region-heading').textContent = adding ? '지역 추가' : '지역 편집';
    $('region-name').value = region.name;
    // 가져온 미지원 type도 이름 등을 편집할 때 그대로 보존한다.
    $('region-type').querySelector('[data-unknown]')?.remove();
    if (!Object.hasOwn(types, region.type) || region.type === 'unknown') {
      const option = new Option(`알 수 없음 (${region.type})`, region.type);
      option.dataset.unknown = ''; $('region-type').append(option);
    }
    $('region-type').value = region.type;
    $('region-scale').value = Math.min(5, region.scale);
    $('region-x').value = region.x; $('region-y').value = region.y;
    $('region-x').max = map.width - 1; $('region-y').max = map.height - 1;
    $('region-description').value = region.description || '';
    $('apply-region').textContent = adding ? '지역 추가' : '적용';
    $('delete-region').hidden = adding;
    $('neighbor-section').hidden = adding;
    renderNeighbors(region);
    $('inspector').hidden = false;
    $('context-menu').hidden = true;
  }

  function renderNeighbors(region) {
    $('neighbors').replaceChildren();
    const connections = map.regions.filter(other => String(other.id) !== String(region.id) &&
      ((region.neighbors || []).some(id => String(id) === String(other.id)) ||
       (other.neighbors || []).some(id => String(id) === String(region.id))));
    $('neighbor-count').textContent = connections.length;
    for (const neighbor of connections) {
      const row = document.createElement('div'); row.className = 'neighbor';
      const name = document.createElement('span'); name.textContent = neighbor.name;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '×';
      button.title = `${neighbor.name} 연결 해제`;
      button.addEventListener('click', () => disconnectRegions(region, neighbor));
      row.append(name, button); $('neighbors').append(row);
    }
  }

  function disconnectRegions(a, b) {
    rememberChange();
    a.neighbors = (a.neighbors || []).filter(id => String(id) !== String(b.id));
    b.neighbors = (b.neighbors || []).filter(id => String(id) !== String(a.id));
    markDirty(); renderMap();
    if (editing && !$('inspector').hidden) renderNeighbors(editing.region);
  }

  function deleteRegion(region) {
    rememberChange();
    map.regions = map.regions.filter(other => other !== region);
    for (const other of map.regions) other.neighbors = (other.neighbors || []).filter(id => String(id) !== String(region.id));
    if (selected === String(region.id)) selected = null;
    $('inspector').hidden = true; $('context-menu').hidden = true;
    markDirty(); renderMap();
  }

  function pointerPoint(event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(canvas.getScreenCTM().inverse());
  }

  function tileAt(event) {
    const p = pointerPoint(event);
    return { x: Math.floor((p.x - pan.x) / zoom / 12), y: Math.floor((p.y - pan.y) / zoom / 12) };
  }

  function inside(tile) { return tile.x >= 0 && tile.y >= 0 && tile.x < map.width && tile.y < map.height; }
  function regionAt(event) { return event.target.closest?.('.map-region')?.dataset.id ?? null; }

  function showContext(event, id = regionAt(event)) {
    const routeIndex = mode === 'connect' ? event.target.closest?.('.route-hit')?.dataset.route : undefined;
    if (routeIndex !== undefined) { showRouteContext(event, routes[Number(routeIndex)]); return; }
    const tile = tileAt(event);
    if (id === null && !inside(tile)) { notice('지도 테두리 안에 지역을 추가하세요.'); return; }
    menuTarget = { id, tile };
    if (id !== null) selectRegion(id);
    $('context-caption').textContent = id === null ? `X ${tile.x} / Y ${tile.y}` : regionById.get(id).name;
    $('context-add').hidden = id !== null;
    $('context-edit').hidden = id === null; $('context-delete').hidden = id === null;
    $('context-disconnect').hidden = true;
    positionContext(event);
  }

  function showRouteContext(event, route) {
    menuTarget = { route };
    $('context-caption').textContent = `${regionById.get(route.a).name} ↔ ${regionById.get(route.b).name}`;
    for (const id of ['context-add', 'context-edit', 'context-delete']) $(id).hidden = true;
    $('context-disconnect').hidden = false;
    positionContext(event);
  }

  function positionContext(event) {
    const menu = $('context-menu'); menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(event.clientX, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, innerHeight - menu.offsetHeight - 8))}px`;
  }

  function setMode(next) {
    $('context-menu').hidden = true;
    mode = next; canvas.dataset.mode = mode;
    $('mode-move').setAttribute('aria-pressed', String(mode === 'move'));
    $('mode-connect').setAttribute('aria-pressed', String(mode === 'connect'));
    $('mode-hint').textContent = mode === 'move' ? '지역을 끌어 위치를 바꾸세요' : '지역 드래그로 연결 · 선을 눌러 삭제';
  }

  function beginPinch() {
    clearTimeout(longPress);
    $('context-menu').hidden = true;
    const [a, b] = [...pointers.values()];
    pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom, pan: { ...pan } };
    gesture = null; $('connection-preview').toggleAttribute('hidden', true);
  }

  canvas.addEventListener('contextmenu', event => {
    event.preventDefault(); clearTimeout(longPress);
    if (gesture?.menu) return;
    showContext(event);
  });

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    $('context-menu').hidden = true;
    const id = regionAt(event);
    if (id !== null) selectRegion(id);
    const p = pointerPoint(event);
    pointers.set(event.pointerId, p);
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size >= 2) { beginPinch(); return; }
    const routeIndex = mode === 'connect' ? event.target.closest?.('.route-hit')?.dataset.route : undefined;
    gesture = { pointerId: event.pointerId, id, route: routeIndex !== undefined ? routes[Number(routeIndex)] : null,
      start: p, client: { x: event.clientX, y: event.clientY }, pan: { ...pan },
      origin: id !== null ? point(regionById.get(id)) : null, moved: false, menu: false };
    if (event.pointerType !== 'mouse') {
      longPress = setTimeout(() => {
        if (!gesture || gesture.moved) return;
        gesture.menu = true; showContext(event, id);
      }, 550);
    }
  });

  canvas.addEventListener('pointermove', event => {
    const tile = tileAt(event);
    $('coordinates').textContent = `X ${tile.x} / Y ${tile.y}`;
    if (!pointers.has(event.pointerId)) return;
    const p = pointerPoint(event);
    pointers.set(event.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoom = Math.max(.7, Math.min(3.5, pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
      pan = { x: center.x - (pinch.center.x - pinch.pan.x) * zoom / pinch.zoom,
        y: center.y - (pinch.center.y - pinch.pan.y) * zoom / pinch.zoom };
      updateCamera(); return;
    }
    if (!gesture || gesture.menu || gesture.pointerId !== event.pointerId) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.client.x, event.clientY - gesture.client.y) < 6) return;
    gesture.moved = true; clearTimeout(longPress);
    if (gesture.id === null) {
      pan = { x: gesture.pan.x + p.x - gesture.start.x, y: gesture.pan.y + p.y - gesture.start.y };
      updateCamera();
    } else if (mode === 'move') {
      const region = regionById.get(gesture.id);
      const x = Math.max(0, Math.min(map.width - 1, Math.round((gesture.origin.x + (p.x - gesture.start.x) / zoom) / 12 - .5)));
      const y = Math.max(0, Math.min(map.height - 1, Math.round((gesture.origin.y + (p.y - gesture.start.y) / zoom) / 12 - .5)));
      if (region.x === x && region.y === y) return;
      if (!gesture.historySaved) { rememberChange(); gesture.historySaved = true; }
      region.x = x; region.y = y;
      const position = point(region);
      nodes.get(gesture.id).setAttribute('transform', `translate(${position.x} ${position.y})`);
      updateLabel(gesture.id, Math.min(1, 1 / screenScale()));
      updateRoutes(gesture.id);
      $('distances').replaceChildren(); markDirty();
      $('coordinates').textContent = `X ${x} / Y ${y}`;
      if (editing?.region === region && !$('inspector').hidden) { $('region-x').value = x; $('region-y').value = y; }
    } else {
      const a = point(regionById.get(gesture.id));
      for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: (p.x - pan.x) / zoom, y2: (p.y - pan.y) / zoom })) $('connection-preview').setAttribute(key, value);
      $('connection-preview').toggleAttribute('hidden', false);
    }
  });

  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    clearTimeout(longPress);
    const active = gesture;
    if (event.type === 'pointerup' && active && !active.menu && !pinch) {
      if (active.moved && active.id !== null && mode === 'connect') {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.map-region')?.dataset.id;
        if (target && target !== active.id) {
          const a = regionById.get(active.id), b = regionById.get(target);
          const exists = (a.neighbors || []).some(id => String(id) === target) || (b.neighbors || []).some(id => String(id) === active.id);
          if (!exists) { rememberChange(); (a.neighbors ??= []).push(b.id); markDirty(); renderMap(); notice('지역을 연결했습니다.'); }
          else notice('이미 연결된 지역입니다.');
          if (editing && !$('inspector').hidden) renderNeighbors(editing.region);
        }
      } else if (!active.moved && active.route) {
        showRouteContext(event, active.route);
      } else if (!active.moved && active.id === null) {
        selectRegion(null); $('inspector').hidden = true;
      }
    }
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    $('connection-preview').toggleAttribute('hidden', true); pinch = null; gesture = null;
    if (pointers.size >= 2) beginPinch();
    // 두 손가락 제스처 뒤 남은 손가락은 지도 이동으로만 처리한다.
    else if (pointers.size === 1) {
      const [id, p] = [...pointers][0];
      gesture = { pointerId: id, id: null, start: p, client: { x: event.clientX, y: event.clientY }, pan: { ...pan }, moved: true };
    }
    highlight();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', event => {
    event.preventDefault(); clearTimeout(longPress);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? $('viewport').clientHeight : 1);
    zoomBy(Math.exp(-delta * .0018), pointerPoint(event));
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    const id = regionAt(event);
    if (id !== null && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); selectRegion(id); openInspector(regionById.get(id));
    }
  });

  $('mode-move').onclick = () => setMode('move');
  $('mode-connect').onclick = () => setMode('connect');
  $('undo').onclick = () => restoreHistory(undoHistory, redoHistory);
  $('redo').onclick = () => restoreHistory(redoHistory, undoHistory);
  $('zoom-in').onclick = () => zoomBy(1.25);
  $('zoom-out').onclick = () => zoomBy(1 / 1.25);
  $('zoom-fit').onclick = () => { zoom = 1; pan = { x: 0, y: 0 }; updateCamera(); };
  $('toggle-settings').onclick = () => $('settings').classList.toggle('is-open');
  $('close-settings').onclick = () => $('settings').classList.remove('is-open');
  $('close-inspector').onclick = () => { $('inspector').hidden = true; };
  $('edit-selected').onclick = () => { if (currentRegion()) openInspector(currentRegion()); };
  $('context-add').onclick = () => {
    let id = 1;
    while (regionById.has(String(id))) id++;
    openInspector({ id, name: '', type: 'village', scale: 1, ...menuTarget.tile, description: '', neighbors: [] }, true);
  };
  $('context-edit').onclick = () => openInspector(regionById.get(menuTarget.id));
  $('context-delete').onclick = () => deleteRegion(regionById.get(menuTarget.id));
  $('context-disconnect').onclick = () => {
    const { a, b } = menuTarget.route;
    disconnectRegions(regionById.get(a), regionById.get(b));
  };
  $('delete-region').onclick = () => deleteRegion(editing.region);
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('#context-menu')) $('context-menu').hidden = true;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { $('context-menu').hidden = true; $('inspector').hidden = true; $('settings').classList.remove('is-open'); }
  });

  $('region-form').onsubmit = event => {
    event.preventDefault();
    if (!editing) return;
    const name = $('region-name').value.trim(), x = Number($('region-x').value), y = Number($('region-y').value);
    if (!name || !Number.isInteger(x) || !Number.isInteger(y) || !inside({ x, y })) { notice('이름과 지도 범위 안의 정수 좌표를 입력하세요.', true); return; }
    const changes = { name, type: $('region-type').value, scale: Number($('region-scale').value), x, y, description: $('region-description').value };
    if (!editing.adding && Object.entries(changes).every(([key, value]) => (editing.region[key] ?? '') === value)) return;
    rememberChange();
    Object.assign(editing.region, changes);
    if (editing.adding) map.regions.push(editing.region);
    selected = String(editing.region.id);
    $('inspector').hidden = true; editing = null;
    markDirty(); renderMap();
    if (window.matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)').matches) openInspector(currentRegion());
  };

  function syncSettings() {
    $('map-name').value = map.name; $('map-width').value = map.width; $('map-height').value = map.height;
    $('map-scale').value = map.distanceScale ?? 1;
  }
  $('map-form').onsubmit = event => {
    event.preventDefault();
    const name = $('map-name').value.trim(), width = Number($('map-width').value), height = Number($('map-height').value), distanceScale = Number($('map-scale').value);
    if (!name || !Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0 || !Number.isFinite(distanceScale) || distanceScale <= 0) {
      notice('이름·크기·거리 배율을 확인하세요.', true); return;
    }
    if (map.regions.some(region => region.x >= width || region.y >= height)) { notice('변경할 지도 범위 밖에 지역이 있습니다. 지역을 먼저 이동하세요.', true); return; }
    if (map.name === name && map.width === width && map.height === height && (map.distanceScale ?? 1) === distanceScale) return;
    const changedSize = map.width !== width || map.height !== height;
    rememberChange();
    Object.assign(map, { name, width, height, distanceScale });
    $('inspector').hidden = true; markDirty(); renderMap(changedSize); notice('지도 설정을 적용했습니다.');
    $('settings').classList.remove('is-open');
  };

  function validateMap(data) {
    if (!data || typeof data.name !== 'string' || !data.name.trim() ||
        !Number.isSafeInteger(data.width) || data.width <= 0 ||
        !Number.isSafeInteger(data.height) || data.height <= 0 || !Array.isArray(data.regions)) {
      throw new Error('지도 이름·크기·지역 목록을 확인하세요.');
    }
    if (data.distanceScale !== undefined && (!Number.isFinite(data.distanceScale) || data.distanceScale <= 0)) {
      throw new Error('distanceScale은 0보다 큰 숫자를 사용하세요.');
    }
    const ids = new Set();
    for (const region of data.regions) {
      if (!region || !['number', 'string'].includes(typeof region.id) ||
          (typeof region.id === 'number' && !Number.isFinite(region.id)) || !String(region.id).trim() ||
          ids.has(String(region.id)) || typeof region.name !== 'string' || !region.name.trim() ||
          typeof region.type !== 'string' || !Number.isInteger(region.scale) || region.scale < 1 ||
          !Number.isInteger(region.x) || !Number.isInteger(region.y) ||
          region.x < 0 || region.x >= data.width || region.y < 0 || region.y >= data.height ||
          (region.description !== undefined && typeof region.description !== 'string') ||
          (region.neighbors !== undefined && !Array.isArray(region.neighbors))) {
        throw new Error('지역의 ID·이름·종류·규모·좌표·인접 목록을 확인하세요.');
      }
      ids.add(String(region.id));
    }
    for (const region of data.regions) {
      if ((region.neighbors || []).some(id => !['number', 'string'].includes(typeof id) ||
          !ids.has(String(id)) || String(id) === String(region.id))) {
        throw new Error('neighbors에는 같은 지도에 존재하는 다른 지역의 ID를 넣으세요.');
      }
    }
    return data;
  }


  function clearBackground() {
    if (imageURL) URL.revokeObjectURL(imageURL);
    imageURL = ''; $('background').removeAttribute('href');
    $('background-name').textContent = '선택한 이미지 없음'; $('remove-background').hidden = true;
    $('image-file').value = '';
  }
  function loadMap(data) {
    validateMap(data);
    clearBackground(); map = data; selected = null; editing = null;
    savedMap = JSON.stringify(map); undoHistory.length = 0; redoHistory.length = 0;
    updateHistoryButtons();
    $('inspector').hidden = true; $('context-menu').hidden = true;
    syncSettings(); renderMap(true); markDirty(false);
  }
  function discardAllowed() { return !dirty || confirm('다운로드하지 않은 변경사항이 있습니다. 다른 지도를 열까요?'); }
  $('new-map').onclick = () => { if (discardAllowed()) loadMap(emptyMap()); };
  $('open-map').onclick = () => { $('json-file').value = ''; $('json-file').click(); };
  $('json-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const data = validateMap(JSON.parse(await file.text()));
      if (discardAllowed()) { loadMap(data); notice('JSON을 열었습니다. 배경 이미지는 별도로 선택하세요.'); }
    } catch (error) { notice(`JSON을 열 수 없습니다. ${error.message}`, true); }
  };
  $('choose-background').onclick = () => $('image-file').click();
  $('image-file').onchange = event => {
    const file = event.target.files[0]; if (!file) return;
    clearBackground();
    imageURL = URL.createObjectURL(file);
    $('background').setAttribute('href', imageURL);
    $('background-name').textContent = file.name; $('remove-background').hidden = false;
  };
  $('background').addEventListener('error', () => { clearBackground(); notice('이미지를 표시할 수 없습니다. 파일을 확인하세요.', true); });
  $('remove-background').onclick = clearBackground;
  $('download').onclick = () => {
    try {
      validateMap(map);
      // 배경은 확장에서도 별도 파일로 선택한다. 로컬 파일 경로나 이미지 URL은 JSON에 넣지 않는다.
      const data = { ...map, backgroundImage: '' };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `${map.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'map'}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      savedMap = JSON.stringify(map); markDirty(false); notice('JSON을 다운로드했습니다.');
    } catch (error) { notice(error.message, true); }
  };
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  new ResizeObserver(updateCamera).observe($('viewport'));
  setupTypes(); syncSettings(); setMode('move'); renderMap(true);
})();

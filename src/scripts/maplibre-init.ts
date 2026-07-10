/**
 * maplibre-init.ts
 * Global MapLibre GL JS loader and map initializer.
 * Loaded once via BaseLayout.astro <script> tag.
 */

// ===== Config =====
const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const WORLD_GEOJSON =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_110m_admin_0_countries.geojson";
const EARTHQUAKES_GEOJSON =
  "https://maplibre.org/maplibre-gl-js/docs/assets/earthquakes.geojson";

// ===== State =====
let maplibreReady = false;
const pendingMaps: HTMLElement[] = [];

// ===== Load MapLibre GL from CDN =====
function loadMapLibre() {
  if ((window as any).__maplibreLoading) return;
  (window as any).__maplibreLoading = true;

  // Load CSS
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/maplibre-gl@5.7.0/dist/maplibre-gl.css";
  document.head.appendChild(link);

  // Load JS
  const script = document.createElement("script");
  script.src = "https://unpkg.com/maplibre-gl@5.7.0/dist/maplibre-gl.js";
  script.onload = () => {
    maplibreReady = true;
    // Init all pending maps
    while (pendingMaps.length > 0) {
      const el = pendingMaps.shift()!;
      try {
        initMap(el);
      } catch (e) {
        console.error("[mapcn] Map init error:", e);
      }
    }
    // Also scan for any maps that were added while we were loading
    initAllMaps();
  };
  script.onerror = () => {
    console.error("[mapcn] Failed to load MapLibre GL JS from CDN");
  };
  document.head.appendChild(script);
}

// ===== Init all maps on the page =====
function initAllMaps() {
  const els = document.querySelectorAll<HTMLElement>("[data-map-variant]");
  els.forEach((el) => {
    if (el.dataset.mapInit === "1") return;
    el.dataset.mapInit = "1";

    if (maplibreReady) {
      try {
        initMap(el);
      } catch (e) {
        console.error("[mapcn] Map init error:", e);
      }
    } else {
      pendingMaps.push(el);
    }
  });
}

// ===== Init a single map =====
function initMap(el: HTMLElement) {
  const mapgl = (window as any).maplibregl;
  if (!mapgl || !mapgl.Map) {
    console.error("[mapcn] maplibregl not available");
    return;
  }

  const variant = el.dataset.mapVariant || "hero";
  const center = JSON.parse(el.dataset.mapCenter || "[-74.006, 40.7128]");
  const zoom = parseFloat(el.dataset.mapZoom || "11");
  const container = el.querySelector<HTMLElement>(".mapcn-map-container");
  if (!container) {
    console.error("[mapcn] No .mapcn-map-container found in element");
    return;
  }

  const style =
    variant === "blank"
      ? { version: 8, sources: {}, layers: [] }
      : DARK_STYLE;

  const map = new mapgl.Map({
    container: container,
    style: style,
    center: center,
    zoom: zoom,
    attributionControl: true,
  });

  map.addControl(
    new mapgl.NavigationControl({ visualizePitch: true }),
    "top-right"
  );

  // Store map instance globally for debugging
  (window as any).__mapcnMaps = (window as any).__mapcnMaps || [];
  (window as any).__mapcnMaps.push(map);

  map.on("load", () => {
    // Switch labels to Chinese (fallback to local name, then English)
    switchLabelsToChinese(map);

    switch (variant) {
      case "hero":
        setupHero(map, mapgl);
        break;
      case "markers":
        setupMarkers(map, mapgl);
        break;
      case "routes":
        setupRoutes(map, mapgl);
        break;
      case "arcs":
        setupArcs(map, mapgl);
        break;
      case "geojson":
        setupGeoJSON(map, mapgl);
        break;
      case "clusters":
        setupClusters(map, mapgl);
        break;
      case "blank":
        setupBlank(map, mapgl);
        break;
    }
  });
}

// ===== Switch map labels to Chinese =====
// CARTO vector tiles include name:zh, name:zh-Hans, name:en, and name fields.
// This function modifies all symbol layers to prefer Chinese labels with fallback.
function switchLabelsToChinese(map: any) {
  const style = map.getStyle();
  if (!style || !style.layers) return;

  // The coalesce expression: prefer Chinese, fall back to local name, then English
  const zhCoalesce = [
    "coalesce",
    ["get", "name:zh"],
    ["get", "name:zh-Hans"],
    ["get", "name_zh"],
    ["get", "name"],
    ["get", "name_en"],
    ["get", "name:en"],
  ];

  style.layers.forEach((layer: any) => {
    if (layer.type !== "symbol") return;
    if (!layer.layout || !layer.layout["text-field"]) return;

    const textField = layer.layout["text-field"];

    // Case 1: Simple string template like "{name_en}" or "{name}"
    if (typeof textField === "string" && textField.includes("{name")) {
      try {
        map.setLayoutProperty(layer.id, "text-field", zhCoalesce);
      } catch (e) {
        // skip
      }
    }

    // Case 2: Stops format like {"stops": [[8, "{name_en}"], [13, "{name}"]]}
    // This is the legacy zoom function format. We replace it entirely with the
    // coalesce expression since it handles all name variants at any zoom level.
    if (textField && typeof textField === "object" && Array.isArray(textField.stops)) {
      const hasNameField = textField.stops.some(
        (stop: any) => typeof stop[1] === "string" && stop[1].includes("{name")
      );
      if (hasNameField) {
        try {
          map.setLayoutProperty(layer.id, "text-field", zhCoalesce);
        } catch (e) {
          // skip
        }
      }
    }

    // Case 3: Already an expression array — skip (it's already been processed or custom)
  });
}

// ===== Helper: Add a marker =====
function addMarker(
  map: any,
  mapgl: any,
  lng: number,
  lat: number,
  color: string,
  popupText?: string,
  label?: string
) {
  const el = document.createElement("div");
  el.className = "custom-marker marker-" + color;
  const marker = new mapgl.Marker(el).setLngLat([lng, lat]).addTo(map);

  if (popupText) {
    const popup = new mapgl.Popup({
      offset: 25,
      closeButton: true,
      closeOnClick: true,
    }).setHTML(popupText);
    marker.setPopup(popup);
  }
  if (label) {
    const labelEl = document.createElement("div");
    labelEl.className = "marker-label";
    labelEl.textContent = label;
    new mapgl.Marker(labelEl).setLngLat([lng, lat]).setOffset([0, -25]).addTo(map);
  }
}

// ===== Variant: Hero =====
function setupHero(map: any, mapgl: any) {
  const routeCoords = [
    [-74.006, 40.7128],
    [-73.9857, 40.7484],
    [-73.9724, 40.7831],
  ];
  map.addSource("route", {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: routeCoords },
    },
  });
  map.addLayer({
    id: "route",
    type: "line",
    source: "route",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#22d3ee",
      "line-width": 4,
      "line-opacity": 0.8,
      "line-dasharray": [2, 1],
    },
  });

  addMarker(
    map, mapgl, -74.006, 40.7128, "cyan",
    '<div><strong style="color:#22d3ee">纽约市</strong><br/><span style="color:#64748b;font-size:11px">40.7128° N, 74.006° W</span></div>',
    "纽约市"
  );
  addMarker(
    map, mapgl, -73.9857, 40.7484, "amber",
    '<div><strong style="color:#f59e0b">帝国大厦</strong><br/><span style="color:#64748b;font-size:11px">40.7484° N, 73.9857° W</span></div>',
    "帝国大厦"
  );
  addMarker(
    map, mapgl, -73.9724, 40.7831, "cyan",
    '<div><strong style="color:#22d3ee">中央公园</strong><br/><span style="color:#64748b;font-size:11px">40.7831° N, 73.9724° W</span></div>',
    "中央公园"
  );
}

// ===== Variant: Markers =====
function setupMarkers(map: any, mapgl: any) {
  addMarker(map, mapgl, -73.9857, 40.7484, "blue",
    '<div><strong>帝国大厦</strong><br/><span style="color:#64748b;font-size:11px">381 米 · 102 层</span></div>', "帝国大厦");
  addMarker(map, mapgl, -74.006, 40.7128, "cyan",
    '<div><strong>纽约证券交易所</strong><br/><span style="color:#64748b;font-size:11px">华尔街 11 号</span></div>', "华尔街");
  addMarker(map, mapgl, -73.9851, 40.7589, "amber",
    '<div><strong>时代广场</strong><br/><span style="color:#64748b;font-size:11px">百老汇大道</span></div>', "时代广场");
  addMarker(map, mapgl, -74.0445, 40.6892, "green",
    '<div><strong>自由女神像</strong><br/><span style="color:#64748b;font-size:11px">自由岛</span></div>', "自由女神");
  addMarker(map, mapgl, -73.9967, 40.7258, "purple",
    '<div><strong>SoHo 区</strong><br/><span style="color:#64748b;font-size:11px">艺术与购物</span></div>', "SoHo");
}

// ===== Variant: Routes =====
function setupRoutes(map: any, mapgl: any) {
  const routes = [
    { coords: [[-74.006, 40.7128], [-73.99, 40.73], [-73.9857, 40.7484], [-73.9724, 40.7831]], color: "#22d3ee", width: 4, name: "路线 A" },
    { coords: [[-74.02, 40.70], [-74.01, 40.72], [-74.00, 40.74], [-73.99, 40.76]], color: "#f59e0b", width: 3, name: "路线 B" },
    { coords: [[-73.98, 40.75], [-73.97, 40.77], [-73.96, 40.79], [-73.95, 40.80]], color: "#a855f7", width: 5, name: "路线 C" },
  ];

  routes.forEach((r, i) => {
    map.addSource("route-" + i, {
      type: "geojson",
      data: { type: "Feature", properties: { name: r.name }, geometry: { type: "LineString", coordinates: r.coords } },
    });
    const paint: any = { "line-color": r.color, "line-width": r.width, "line-opacity": 0.8 };
    if (i === 1) paint["line-dasharray"] = [3, 2];
    map.addLayer({
      id: "route-" + i, type: "line", source: "route-" + i,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: paint,
    });
    const colorClass = i === 0 ? "cyan" : i === 1 ? "amber" : "purple";
    addMarker(map, mapgl, r.coords[0][0], r.coords[0][1], colorClass);
    addMarker(map, mapgl, r.coords[r.coords.length - 1][0], r.coords[r.coords.length - 1][1], colorClass);
  });
}

// ===== Variant: Arcs =====
function setupArcs(map: any, mapgl: any) {
  const cities = [
    { name: "纽约", coord: [-74.006, 40.7128] },
    { name: "芝加哥", coord: [-87.6298, 41.8781] },
    { name: "洛杉矶", coord: [-118.2437, 34.0522] },
    { name: "西雅图", coord: [-122.3321, 47.6062] },
    { name: "迈阿密", coord: [-80.1918, 25.7617] },
  ];
  const arcs = [
    { from: 0, to: 1, color: "#22d3ee" },
    { from: 0, to: 2, color: "#f59e0b" },
    { from: 0, to: 4, color: "#22c55e" },
    { from: 1, to: 2, color: "#a855f7" },
    { from: 2, to: 3, color: "#ef4444" },
  ];

  const features = arcs.map((arc, i) => {
    const from = cities[arc.from].coord;
    const to = cities[arc.to].coord;
    const midX = (from[0] + to[0]) / 2;
    const midY = (from[1] + to[1]) / 2;
    const dist = Math.sqrt(Math.pow(to[0] - from[0], 2) + Math.pow(to[1] - from[1], 2));
    const offsetY = dist * 0.2;
    const ctrl = [midX, midY + offsetY];
    const points: number[][] = [];
    for (let t = 0; t <= 1; t += 1 / 64) {
      const x = (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * ctrl[0] + t * t * to[0];
      const y = (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * ctrl[1] + t * t * to[1];
      points.push([x, y]);
    }
    return {
      type: "Feature",
      properties: { id: i, color: arc.color, from: cities[arc.from].name, to: cities[arc.to].name },
      geometry: { type: "LineString", coordinates: points },
    };
  });

  map.addSource("arcs", { type: "geojson", data: { type: "FeatureCollection", features: features } });
  map.addLayer({
    id: "arcs", type: "line", source: "arcs",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.7 },
  });

  map.addLayer({
    id: "arcs-hover", type: "line", source: "arcs",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["get", "color"], "line-width": 5,
      "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0],
    },
  });

  let hoveredId: number | null = null;
  map.on("mousemove", "arcs", (e: any) => {
    if (e.features && e.features.length > 0) {
      if (hoveredId !== null) map.setFeatureState({ source: "arcs", id: hoveredId }, { hover: false });
      hoveredId = e.features[0].properties.id;
      map.setFeatureState({ source: "arcs", id: hoveredId }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    }
  });
  map.on("mouseleave", "arcs", () => {
    if (hoveredId !== null) map.setFeatureState({ source: "arcs", id: hoveredId }, { hover: false });
    hoveredId = null;
    map.getCanvas().style.cursor = "";
  });

  map.on("click", "arcs", (e: any) => {
    if (e.features && e.features.length > 0) {
      const f = e.features[0];
      new mapgl.Popup({ offset: 15, closeButton: true })
        .setLngLat([e.lngLat.lng, e.lngLat.lat])
        .setHTML("<div><strong>" + f.properties.from + "</strong> → <strong>" + f.properties.to + "</strong></div>")
        .addTo(map);
    }
  });

  cities.forEach((city) => {
    addMarker(map, mapgl, city.coord[0], city.coord[1], "cyan",
      "<div><strong>" + city.name + "</strong></div>", city.name);
  });
}

// ===== Variant: GeoJSON =====
function setupGeoJSON(map: any, mapgl: any) {
  map.addSource("countries", { type: "geojson", data: WORLD_GEOJSON, promoteId: "NAME" });

  map.addLayer({
    id: "countries-fill", type: "fill", source: "countries",
    paint: {
      "fill-color": ["match", ["get", "CONTINENT"],
        "Asia", "#f59e0b", "Europe", "#22d3ee", "Africa", "#22c55e",
        "North America", "#3b82f6", "South America", "#a855f7",
        "Oceania", "#ef4444", "#64748b"],
      "fill-opacity": 0.4,
    },
  });

  map.addLayer({
    id: "countries-outline", type: "line", source: "countries",
    paint: {
      "line-color": ["match", ["get", "CONTINENT"],
        "Asia", "#f59e0b", "Europe", "#22d3ee", "Africa", "#22c55e",
        "North America", "#3b82f6", "South America", "#a855f7",
        "Oceania", "#ef4444", "#64748b"],
      "line-width": 0.8, "line-opacity": 0.6,
    },
  });

  map.addLayer({
    id: "countries-hover", type: "fill", source: "countries",
    paint: {
      "fill-color": ["match", ["get", "CONTINENT"],
        "Asia", "#f59e0b", "Europe", "#22d3ee", "Africa", "#22c55e",
        "North America", "#3b82f6", "South America", "#a855f7",
        "Oceania", "#ef4444", "#64748b"],
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.75, 0],
    },
  });

  let hovered: string | null = null;
  map.on("mousemove", "countries-fill", (e: any) => {
    if (e.features && e.features.length > 0) {
      if (hovered) map.setFeatureState({ source: "countries", id: hovered }, { hover: false });
      hovered = e.features[0].id;
      map.setFeatureState({ source: "countries", id: hovered }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    }
  });
  map.on("mouseleave", "countries-fill", () => {
    if (hovered) map.setFeatureState({ source: "countries", id: hovered }, { hover: false });
    hovered = null;
    map.getCanvas().style.cursor = "";
  });

  map.on("click", "countries-fill", (e: any) => {
    if (e.features && e.features.length > 0) {
      const f = e.features[0];
      const name = f.properties.NAME || f.properties.name || "未知";
      const continent = f.properties.CONTINENT || "";
      const popEst = f.properties.POP_EST ? Number(f.properties.POP_EST).toLocaleString() : "N/A";
      new mapgl.Popup({ offset: 15, closeButton: true })
        .setLngLat([e.lngLat.lng, e.lngLat.lat])
        .setHTML("<div><strong>" + name + "</strong><br/><span style='color:#64748b;font-size:11px'>大洲: " + continent + "</span><br/><span style='color:#64748b;font-size:11px'>人口: " + popEst + "</span></div>")
        .addTo(map);
    }
  });
}

// ===== Variant: Clusters =====
function setupClusters(map: any, mapgl: any) {
  map.addSource("earthquakes", {
    type: "geojson", data: EARTHQUAKES_GEOJSON,
    cluster: true, clusterMaxZoom: 14, clusterRadius: 50,
  });

  const clusterColors = ["#22c55e", "#eab308", "#ef4444"];
  const clusterThresholds = [100, 750];

  map.addLayer({
    id: "clusters", type: "circle", source: "earthquakes",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": ["step", ["get", "point_count"],
        clusterColors[0], clusterThresholds[0], clusterColors[1],
        clusterThresholds[1], clusterColors[2]],
      "circle-radius": ["step", ["get", "point_count"], 18, 100, 24, 750, 32],
      "circle-stroke-width": 3, "circle-stroke-color": "rgba(255,255,255,0.3)",
    },
  });

  map.addLayer({
    id: "cluster-count", type: "symbol", source: "earthquakes",
    filter: ["has", "point_count"],
    layout: { "text-field": "{point_count_abbreviated}", "text-size": 13 },
    paint: { "text-color": "#ffffff" },
  });

  map.addLayer({
    id: "unclustered-point", type: "circle", source: "earthquakes",
    filter: ["!", ["has", "point_count"]],
    paint: { "circle-color": "#3b82f6", "circle-radius": 6, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
  });

  map.on("click", "clusters", (e: any) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    const clusterId = features[0].properties.cluster_id;
    const source = map.getSource("earthquakes");
    source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
      map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
    });
  });

  map.on("click", "unclustered-point", (e: any) => {
    if (!e.features || !e.features[0]) return;
    const f = e.features[0];
    const coords = f.geometry.coordinates;
    const mag = f.properties.mag;
    const place = f.properties.place;
    const tsunami = f.properties.tsunami;
    new mapgl.Popup({ offset: 15, closeButton: true, closeOnClick: true })
      .setLngLat(coords)
      .setHTML("<div><strong>地震</strong><br/><span style='color:#64748b;font-size:11px'>震级: <strong style='color:#e2e8f0'>" + mag + "</strong></span><br/><span style='color:#64748b;font-size:11px'>位置: " + place + "</span><br/><span style='color:#64748b;font-size:11px'>海啸: " + (tsunami === 1 ? "是 ⚠️" : "否") + "</span></div>")
      .addTo(map);
  });

  map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
  map.on("mouseenter", "unclustered-point", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "unclustered-point", () => { map.getCanvas().style.cursor = ""; });
}

// ===== Variant: Blank =====
function setupBlank(map: any, mapgl: any) {
  map.addSource("countries", { type: "geojson", data: WORLD_GEOJSON });
  map.addLayer({
    id: "countries-fill", type: "fill", source: "countries",
    paint: { "fill-color": "#22d3ee", "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "countries-outline", type: "line", source: "countries",
    paint: { "line-color": "#22d3ee", "line-width": 0.5, "line-opacity": 0.3 },
  });

  const cities = [
    { name: "纽约", coord: [-74.006, 40.7128] },
    { name: "伦敦", coord: [-0.1276, 51.5074] },
    { name: "东京", coord: [139.6917, 35.6895] },
    { name: "悉尼", coord: [151.2093, -33.8688] },
    { name: "上海", coord: [121.4737, 31.2304] },
  ];
  const arcs = [
    { from: 0, to: 1, color: "#22d3ee" },
    { from: 1, to: 2, color: "#f59e0b" },
    { from: 2, to: 4, color: "#22c55e" },
    { from: 4, to: 3, color: "#a855f7" },
    { from: 1, to: 4, color: "#ef4444" },
  ];

  const features = arcs.map((arc, i) => {
    const from = cities[arc.from].coord;
    const to = cities[arc.to].coord;
    const midX = (from[0] + to[0]) / 2;
    const midY = (from[1] + to[1]) / 2;
    const dist = Math.sqrt(Math.pow(to[0] - from[0], 2) + Math.pow(to[1] - from[1], 2));
    const offsetY = dist * 0.25;
    const ctrl = [midX, midY + offsetY];
    const points: number[][] = [];
    for (let t = 0; t <= 1; t += 1 / 64) {
      const x = (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * ctrl[0] + t * t * to[0];
      const y = (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * ctrl[1] + t * t * to[1];
      points.push([x, y]);
    }
    return {
      type: "Feature",
      properties: { id: i, color: arc.color },
      geometry: { type: "LineString", coordinates: points },
    };
  });

  map.addSource("arcs", { type: "geojson", data: { type: "FeatureCollection", features: features } });
  map.addLayer({
    id: "arcs", type: "line", source: "arcs",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.7 },
  });

  cities.forEach((city) => {
    addMarker(map, mapgl, city.coord[0], city.coord[1], "cyan",
      "<div><strong>" + city.name + "</strong></div>");
  });
}

// ===== Bootstrap =====
loadMapLibre();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAllMaps);
} else {
  initAllMaps();
}

// Re-init on Astro view transitions
document.addEventListener("astro:page-load", initAllMaps);

// MutationObserver to catch dynamically added maps
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        if (node.hasAttribute && node.hasAttribute("data-map-variant")) {
          initAllMaps();
          return;
        }
        if (node.querySelector && node.querySelector("[data-map-variant]")) {
          initAllMaps();
          return;
        }
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

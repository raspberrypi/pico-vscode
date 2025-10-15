/* global acquireVsCodeApi */
"use strict";

const OVERLAY_MIN_MS = 3000; // keep overlay visible at least this long
let overlayShownAt = 0;
let overlayTimerId = null

const vscode = acquireVsCodeApi();

/** @typedef {{ id:string, depId:string, label:string, version:string, installedAt: string, lastUsed:string, path?:string }} Item */

let state = {
  items /** @type {Item[]} */: [],
  sortKey: "lastUsed",     // "lastUsed" | "installedAt" | "name"
  sortDir: "desc",         // "asc" | "desc"
  filter: "",
  selected: new Set(),     // of item.id
  uninstalling: false,
  overlayVisible: false,
  pendingRender: false,
};

const $ = (sel, root = document) => /** @type {HTMLElement|null} */(root.querySelector(sel));
const $$ = (sel, root = document) => /** @type {HTMLElement[]} */(Array.from(root.querySelectorAll(sel)));

function dayValue(ymd /* YYYY-MM-DD or "" */) {
  // Treat empty (never used) as very old
  if (!ymd) return -1;
  // Safe compare by number: YYYYMMDD
  return Number(ymd.replaceAll("-", ""));
}

function cmp(a, b) {
  const dir = state.sortDir === "asc" ? 1 : -1;

  if (state.sortKey === "lastUsed") {
    const av = dayValue(a.lastUsed), bv = dayValue(b.lastUsed);
    if (av !== bv) return (av < bv ? -1 : 1) * dir;
    // tie-break by name
    return a.label.localeCompare(b.label) * dir;
  }

  if (state.sortKey === "installedAt") {
    const av = dayValue(a.installedAt), bv = dayValue(b.installedAt);
    if (av !== bv) return (av < bv ? -1 : 1) * dir;
    return a.label.localeCompare(b.label) * dir;
  }

  // name
  const an = `${a.label} ${a.version}`.toLowerCase();
  const bn = `${b.label} ${b.version}`.toLowerCase();
  if (an !== bn) return (an < bn ? -1 : 1) * dir;
  return dayValue(a.lastUsed) - dayValue(b.lastUsed);
}

function filteredSorted(items) {
  const f = state.filter.trim().toLowerCase();
  let list = !f ? items : items.filter(i =>
    i.label.toLowerCase().includes(f) ||
    i.depId.toLowerCase().includes(f) ||
    i.version.toLowerCase().includes(f)
  );
  return list.sort(cmp);
}

// --- date helpers ---
function parseYMD(ymd) {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [_, y, mo, d] = m.map(Number);
  return new Date(y, mo - 1, d);
}
function daysSince(ymd) {
  const dt = parseYMD(ymd);
  if (!dt) return Infinity; // treat unknown/never as very old
  const ms = Date.now() - dt.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// --- version parsing/compare ---
// supports: 'main' (highest), 'v1.2.3', '1.2.3', '1.2.3-rc1'
// falls back to string compare if not semver-ish
function parseVersion(v) {
  if (!v) return { kind: "none" };
  if (v === "main") return { kind: "main" };
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-rc(\d+))?$/.exec(v);
  if (m) {
    return {
      kind: "semver",
      maj: Number(m[1]),
      min: Number(m[2]),
      pat: Number(m[3]),
      rc: m[4] ? Number(m[4]) : null,
    };
  }
  return { kind: "other", raw: v.toLowerCase() };
}

function versionCompare(a, b) {
  // return -1 if a<b, 0 equal, 1 if a>b
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa.kind === "main" && pb.kind !== "main") return 1;
  if (pb.kind === "main" && pa.kind !== "main") return -1;
  if (pa.kind === "semver" && pb.kind === "semver") {
    if (pa.maj !== pb.maj) return pa.maj < pb.maj ? -1 : 1;
    if (pa.min !== pb.min) return pa.min < pb.min ? -1 : 1;
    if (pa.pat !== pb.pat) return pa.pat < pb.pat ? -1 : 1;
    // rc < final
    if (pa.rc == null && pb.rc == null) return 0;
    if (pa.rc == null) return 1;
    if (pb.rc == null) return -1;
    if (pa.rc !== pb.rc) return pa.rc < pb.rc ? -1 : 1;
    return 0;
  }
  if (pa.kind === "semver" && pb.kind !== "semver") return 1;
  if (pb.kind === "semver" && pa.kind !== "semver") return -1;
  if (pa.kind === "other" && pb.kind === "other") {
    if (pa.raw === pb.raw) return 0;
    return pa.raw < pb.raw ? -1 : 1;
  }
  // both "none" (non-versioned) or mixed unknowns → consider equal
  return 0;
}

// latest per depId among items
function latestVersionByDep(items) {
  /** @type {Record<string,string>} */
  const latest = {};
  for (const it of items) {
    if (!it.version) continue; // non-versioned deps → skip latest logic
    const cur = latest[it.depId];
    if (!cur || versionCompare(cur, it.version) < 0) {
      latest[it.depId] = it.version;
    }
  }
  return latest;
}

// --- Rendering ---
function renderToolbar() {
  return `
  <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
    <div class="flex items-center gap-2 flex-1">
      <input id="search" type="search" placeholder="Search (name, id, version)…"
        class="w-full md:w-96 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-zinc-900/80 focus:outline-none focus:ring focus:ring-blue-500/40 prevent-select"
        value="${state.filter}">
    </div>

    <div class="flex items-center gap-2">
      <button id="sort-installed"
        class="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-zinc-800 ${state.sortKey === 'installedAt' ? 'ring-1 ring-blue-500/50' : ''}"
        title="Sort by install date">
        <span class="mr-1 prevent-select">Installed</span>
        <span aria-hidden="true">${state.sortKey === 'installedAt' ? (state.sortDir === 'desc' ? '↓' : '↑') : ''}</span>
      </button>  

      <button id="sort-last" class="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-zinc-800 ${state.sortKey === 'lastUsed' ? 'ring-1 ring-blue-500/50' : ''}" title="Sort by last used">
        <span class="mr-1 prevent-select">Last used</span>
        <span aria-hidden="true">${state.sortKey === 'lastUsed' ? (state.sortDir === 'desc' ? '↓' : '↑') : ''}</span>
      </button>

      <button id="sort-name" class="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-zinc-800 ${state.sortKey === 'name' ? 'ring-1 ring-blue-500/50' : ''}" title="Sort by name">
        <span class="mr-1 prevent-select">Name</span>
        <span aria-hidden="true">${state.sortKey === 'name' ? (state.sortDir === 'asc' ? '↑' : '↓') : ''}</span>
      </button>

      <div class="h-6 w-px bg-gray-300 dark:bg-zinc-700 mx-1"></div>

      <label class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer">
        <input id="select-all" type="checkbox" class="h-4 w-4 accent-blue-600">
        <span class="prevent-select">Select all (visible)</span>
      </label>

      <button id="select-stale" class="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-zinc-800 prevent-select"
        title="Select items last used > 30 days ago that are not the latest version">
        Select stale & not-latest
      </button>

      <button id="uninstall-selected" class="px-3 py-2 rounded-xl bg-red-600 text-white disabled:bg-red-300 hover:bg-red-700 transition" ${state.selected.size ? "" : "disabled"}>
        Uninstall selected (${state.selected.size})
      </button>
    </div>
  </div>
  `;
}

function itemRow(i) {
  const checked = state.selected.has(i.id) ? "checked" : "";
  const last = i.lastUsed || "Never";
  let installed = i.installedAt || "Unknown";
  if (installed === "1970-01-01") installed = "Unknown"; // fallback for missing dates
  return `
  <div class="flex items-center justify-between gap-3 p-3 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 hover:border-gray-300 dark:hover:border-zinc-700">
    <label class="flex items-center gap-3 flex-1 cursor-pointer">
      <input data-role="select" data-id="${i.id}" type="checkbox" class="h-4 w-4 accent-blue-600" ${checked} />
      <div class="flex flex-col">
        <div class="text-sm font-medium prevent-select">
          ${escapeHtml(i.label)}
          <span class="text-gray-500 dark:text-gray-400 font-normal">• ${escapeHtml(i.version || "unknown")}</span>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400 truncate" title="${escapeHtml((i.path || i.depId) + (i.path ? "" : ""))}">
          <span class="prevent-select">${escapeHtml(i.depId)}</span>${i.path ? `<span class="prevent-select"> • </span>${escapeHtml(i.path)}` : ""}
        </div>
      </div>
    </label>

    <div class="flex items-center gap-2 sm:gap-3 shrink-0">
      <span class="text-xs px-2 py-1 rounded-full border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800">
        <span class="prevent-select">Last used: </span>${escapeHtml(last)}
      </span>
      <span class="text-xs px-2 py-1 rounded-full border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800">
        <span class="prevent-select">Installed: </span>${escapeHtml(installed)}
      </span>
      <button data-role="uninstall-one" data-id="${i.id}"
        class="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 prevent-select">
        Uninstall
      </button>
    </div>
  </div>`;
}

function renderList() {
  const visible = filteredSorted(state.items);
  const rows = visible.map(itemRow).join("");
  return `
    <div class="mt-4 space-y-2" id="list">
      ${rows || `<div class="text-sm text-gray-500 dark:text-gray-400 p-6 text-center">No matching components.</div>`}
    </div>
  `;
}

function renderOverlay(visible = false) {
  return `
  <div id="overlay"
       class="fixed inset-0 ${visible ? '' : 'hidden'} z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
    <div class="pointer-events-auto flex flex-col items-center gap-4 p-8 rounded-2xl
                bg-white/90 dark:bg-zinc-900/90 border border-gray-200 dark:border-zinc-800 shadow-lg"
         role="status" aria-live="polite">
      <div class="h-10 w-10 rounded-full border-4 border-gray-300 dark:border-zinc-700 border-t-transparent animate-spin"
           aria-hidden="true"></div>
      <div id="overlay-text" class="text-sm text-gray-700 dark:text-gray-200">Uninstalling…</div>
    </div>
  </div>`;
}

function renderFrame() {
  document.body.innerHTML = `
  <div class="h-full w-full overflow-hidden grid grid-rows-[auto,1fr] text-[13px] text-gray-900 dark:text-gray-100">
    <header class="px-5 py-4 shrink-0 prevent-select">
      <h1 class="text-lg font-semibold">Uninstall components</h1>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Select one or more installed items to uninstall. Sort by last used to find stale components quickly.
      </p>
    </header>

    <main class="px-5 pb-4 overflow-visible grid grid-rows-[auto,1fr] min-h-0">
      ${renderToolbar()}
      <div id="scroll" class="overflow-y-auto overflow-x-hidden pr-1 min-h-0 h-full">
        ${renderList()}
      </div>
    </main>
  </div>
  ${renderOverlay(state.overlayVisible)}
  `;
  bindEvents();
  updateSelectAllCheckbox();
}

function update() {
  // Save minimal view state for back/forward etc.
  vscode.setState({ sortKey: state.sortKey, sortDir: state.sortDir, filter: state.filter });
  renderFrame();
}

function renderListOnly() {
  const listEl = document.getElementById("list");
  if (!listEl) return;

  const visible = filteredSorted(state.items);
  const rows = visible.map(itemRow).join("");
  listEl.innerHTML =
    rows ||
    `<div class="text-sm text-gray-500 dark:text-gray-400 p-6 text-center">No matching components.</div>`;

  updateSelectAllCheckbox();
  // keep the “Uninstall selected” button state in sync
  const btn = document.getElementById("uninstall-selected");
  if (btn) {
    if (state.selected.size) btn.removeAttribute("disabled");
    else btn.setAttribute("disabled", "");
  }
}

function selectStaleNotLatest(days = 30) {
  const latest = latestVersionByDep(state.items);
  let added = 0;
  for (const it of state.items) {
    // non-versioned → skip "not latest" criterion
    if (!it.version) continue;

    const isNotLatest = latest[it.depId] && it.version !== latest[it.depId];
    const isStale = daysSince(it.lastUsed) > days; // empty lastUsed counts as stale
    if (isNotLatest && isStale) {
      state.selected.add(it.id);
      added++;
    }
  }
  // update UI
  renderFrame();
  // keep the list position; re-focus search if it had focus
  const search = document.getElementById("search");
  if (search && document.activeElement === search) search.focus();
  return added;
}

function bindEvents() {
  // search
  $("#search")?.addEventListener("input", (e) => {
    state.filter = e.target.value;
    //renderFrame();
    renderListOnly();
  });

  // sort buttons
  $("#sort-installed")?.addEventListener("click", () => {
    if (state.sortKey === "installedAt") {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = "installedAt"; state.sortDir = "desc";
    }
    renderFrame();
  });
  $("#sort-last")?.addEventListener("click", () => {
    if (state.sortKey === "lastUsed") {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = "lastUsed"; state.sortDir = "desc";
    }
    renderFrame();
  });
  $("#sort-name")?.addEventListener("click", () => {
    if (state.sortKey === "name") {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = "name"; state.sortDir = "asc";
    }
    renderFrame();
  });

  // select all (visible)
  $("#select-all")?.addEventListener("change", (e) => {
    const visible = filteredSorted(state.items).map(i => i.id);
    if (e.target.checked) visible.forEach(id => state.selected.add(id));
    else visible.forEach(id => state.selected.delete(id));
    renderFrame();
  });

  // select stale & not-latest
  $("#select-stale")?.addEventListener("click", () => {
    selectStaleNotLatest(30);
  });

  // uninstall selected
  $("#uninstall-selected")?.addEventListener("click", () => {
    const ids = Array.from(state.selected);
    if (!ids.length) return;
    beginUninstall(ids);
  });

  // event delegation for row actions
  $("#list")?.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === "uninstall-one" || target.closest("[data-role='uninstall-one']")) {
      const el = target.dataset.role === "uninstall-one" ? target : target.closest("[data-role='uninstall-one']");
      const id = el?.getAttribute("data-id");
      if (id) beginUninstall([id]);
      return;
    }

    if (target.dataset.role === "select") {
      const id = target.getAttribute("data-id");
      if (id) {
        if (target.checked) state.selected.add(id); else state.selected.delete(id);
        updateSelectAllCheckbox();
        const uninstallSelectedBtn = document.getElementById("uninstall-selected");
        if (uninstallSelectedBtn) {
          uninstallSelectedBtn.disabled = state.selected.size === 0;
          // Update content without having to re-render the whole toolbar
          // replace (<number>) in button text with current count
          const m = uninstallSelectedBtn.textContent.match(/\((\d+)\)/);
          if (m) {
            uninstallSelectedBtn.textContent = uninstallSelectedBtn.textContent.replace(
              m[0],
              `(${state.selected.size})`);
          }
          if (state.selected.size) uninstallSelectedBtn.removeAttribute("disabled");
        }
      }
    }
  });
}

function updateSelectAllCheckbox() {
  const visible = new Set(filteredSorted(state.items).map(i => i.id));
  const checkedCount = Array.from(visible).filter(id => state.selected.has(id)).length;
  const all = $("#select-all");
  if (!all) return;
  all.indeterminate = checkedCount > 0 && checkedCount < visible.size;
  all.checked = checkedCount > 0 && checkedCount === visible.size;
}

function beginUninstall(ids) {
  if (state.uninstalling) return;
  state.uninstalling = true;
  showOverlay(`Uninstalling ${ids.length} item${ids.length > 1 ? "s" : ""}…`);
  vscode.postMessage({ type: "uninstall", ids });
}

function showOverlay(text) {
  // reset any previous timer
  if (overlayTimerId) {
    clearTimeout(overlayTimerId);
    overlayTimerId = null;
  }

  overlayShownAt = Date.now();
  state.overlayVisible = true;
  const ov = $("#overlay");
  if (!ov) return;
  const ovT = $("#overlay-text");
  if (!ovT) return;
  ovT.textContent = text || "Working…";

  ov.classList.remove("hidden");
  // prevent interaction underneath
  document.body.style.pointerEvents = "none";
  ov.style.pointerEvents = "auto";
}

function scheduleHideOverlay() {
  const now = Date.now();
  const remain = Math.max(OVERLAY_MIN_MS - (now - overlayShownAt), 0);
  console.debug(`scheduling overlay hide in ${remain}ms`);
  if (overlayTimerId) clearTimeout(overlayTimerId);

  const finish = () => {
    hideOverlay();
    overlayTimerId = null;
    if (state.pendingRender) {
      state.pendingRender = false;
      update();
    }
  };

  overlayTimerId = remain <= 0
    ? setTimeout(() => requestAnimationFrame(finish), 0) // next frame
    : setTimeout(finish, remain);
}

function hideOverlay() {
  const ov = $("#overlay");
  if (!ov) return;
  ov.classList.add("hidden");
  state.overlayVisible = false;
  document.body.style.pointerEvents = "";
}

/** Defensive HTML escaping */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
}

// --- Webview <-> Extension messaging ---

window.addEventListener("message", (event) => {
  const msg = event.data;
  switch (msg?.type) {
    case "init": {
      /** @type {Item[]} */
      state.items = Array.isArray(msg.items) ? msg.items : [];
      // Restore last UI state if available
      const saved = vscode.getState();
      if (saved) {
        state.sortKey = saved.sortKey ?? state.sortKey;
        state.sortDir = saved.sortDir ?? state.sortDir;
        state.filter = saved.filter ?? state.filter;
      }
      // Drop any selected ids that no longer exist
      state.selected = new Set([...state.selected].filter(id => state.items.some(i => i.id === id)));
      state.uninstalling = false;
      update();
      break;
    }
    case "uninstall:progress": {
      // Optional: could update overlay text with current item
      if (msg.text) showOverlay(msg.text);
      break;
    }
    case "uninstall:done": {
      // Remove items that were uninstalled; update list
      const removedIds = new Set(msg.ids || []);
      state.items = state.items.filter(i => !removedIds.has(i.id));
      for (const id of removedIds) state.selected.delete(id);
      state.uninstalling = false;

      //hideOverlay();
      // don't flicker: wait until min visible time has passed
      state.pendingRender = true;
      scheduleHideOverlay();
      break;
    }
    case "uninstall:error": {
      state.uninstalling = false;
      //hideOverlay();
      scheduleHideOverlay();
      alert(msg.error || "Uninstall failed."); // simple; VS Code shows alerts fine
      break;
    }
    case "update:items": {
      // Extension can push refreshed inventory
      if (Array.isArray(msg.items)) {
        state.items = msg.items;
        // prune selection
        state.selected = new Set([...state.selected].filter(id => state.items.some(i => i.id === id)));
        if (state.overlayVisible) {
          state.pendingRender = true;   // defer while overlay is up
        } else {
          update();
        }
      }
      break;
    }
  }
});

function renderBootLoading(text = "Loading installed components…") {
  document.body.innerHTML = `
    <div class="h-full w-full grid place-items-center">
      <div class="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white/90 dark:bg-zinc-900/90 border border-gray-200 dark:border-zinc-800">
        <div class="h-10 w-10 rounded-full border-4 border-gray-300 dark:border-zinc-700 border-t-transparent animate-spin"></div>
        <div class="text-sm text-gray-700 dark:text-gray-200 prevent-select">${escapeHtml(text)}</div>
      </div>
    </div>
  `;
}

// Tell extension we’re ready
window.addEventListener("DOMContentLoaded", () => {
  // show a spinner immediately
  renderBootLoading();
  // let the spinner paint, then tell the extension we're ready
  requestAnimationFrame(() => vscode.postMessage({ type: "ready" }));
});

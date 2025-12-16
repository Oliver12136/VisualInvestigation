const stage = document.getElementById('stage');
const viewport = document.getElementById('viewport');
const tabBar = document.querySelector('.tab-bar');
const nodesLayer = document.getElementById('nodes');
const TILE_SIZE = 30;
const NODE_DIMENSIONS = { width: 155.142, height: 188.392 };
const FOLDER_DIMENSIONS = { width: 155.142, height: 409.544 };
const TEXT_NODE_DIMENSIONS = { width: 328.999, height: 120 };
const DATE_NODE_DIMENSIONS = { width: 337, height: 121.412 };
const DATE_SHELL_HEIGHT = 97.912;
const PICKER_SIZE = { width: 637.496, height: 352 };
const VIDEO_VIEWER_SIZE = { width: 919, height: 588.06, tabWidth: 151, tabHeight: 28.964, bodyHeight: 559.096 };
const VIDEO_VIEWER_OFFSET = { x: 0, y: 0 };
const VIDEO_VIEWER_TAB_OFFSETS = [
  { x: 110, y: 0 },
  { x: 290, y: 0 },
  { x: 480, y: 0 },
  { x: 650, y: 0 }
];
const VIDEO_VIEWER_POS_OFFSETS = [
  { x: 0, y: 0 },
  { x: 134, y: 47 },
  { x: 0, y: 0 },
  { x: 0, y: 0 }
];
const VIDEO_VIEWER_CLOSE_CFG = { size: 8.5, gap: 10, offsetY: 10 };
const VIDEO_VIEWER_CLOSE_OFFSET = { x: 40, y: -5 };
const VIDEO_VIEWER_HOVER_CFG = { width: 380, height: 220, offsetX: 0, offsetY: 40 };
const VIDEO_VIEWER_COPY_ZONES = [
  { width: 90, height: 70, right: 25, bottom: 23 },
  { width: 90, height: 70, right: 25, bottom: 100 }
];
const EXPORTER_DIMENSIONS = { width: 239.887, height: 313 };
const EXPORTER_SHELL = { width: 237.887, height: 285 };
const EXPORTER_ARROW_SRC = 'assets/exporter-arrow.svg';
let wordCloudSliderValue = 0.65;
let wordCloudActive = false;
let wordCloudPan = null;
let WORD_CLOUD_DIFFUSION = 1.0; // tweak to control word spread/organic feel
let browserPreviewEnabled = false;
let indexingEl = null;
let videoViewerBackdrop = null;
let overlayLayer = null;
let videoViewerCounter = 0;
let browserRevealCount = Infinity;
let browserRevealTimer = null;
let indexingDots = [];
let indexingLines = [];
let indexingDotsWrap = null;
let indexingLinesWrap = null;
let datalinkEl = null;
const DATALINK_OFFSET = { x: 0, y: 0 }; // tweak manually if needed
const INDEXING_PADDING = { top: 12, right: 12, bottom: 12, left: 12 }; // dot spawn padding inside index.svg
// Target line relative to BigBoy bottom-center; tweak x1/x2 to widen/narrow, y to raise/lower
const INDEXING_TARGET_LINE = { x1: 0, x2: 200, y: 1400 };
let mergeTimer = null;
let mergeTarget = null;
let mergeCandidate = null;
let dragStartTime = 0;
// Bigboy default position; change x/y here to move the viewer on init
const BIGBOY_POS_DEFAULT = { x: 0, y: 0 };
let bigBoyPos = { ...BIGBOY_POS_DEFAULT };
let wordCloudDrag = null;
const WORD_POOL = [
  'evidence','suspect','victim','witness','scene','camera','footage','frame','timestamp',
  'fingerprint','idcard','license','vehicle','bag','box','parcel','weapon','knife','gun',
  'document','record','ledger','chat','message','call','voice','signal','trace','pattern',
  'cluster','threat','fraud','case','data','video','photo','object','target','profile'
];

const GRID_OFFSET = { x: 0, y: 0 }; // tweak to shift the background crosses
applyGridOffset();

let keyboardVisibilityBias = 0;
const VISIBILITY_KEY_STEP = 0.08;
let wordCloudSliderEl = null;
let wordCloudOverlayEl = null;
let wordCloudPercentEl = null;

const getEffectiveVisibility = () => {
  return Math.min(1, Math.max(0, wordCloudSliderValue + keyboardVisibilityBias));
};

function applyGridOffset(x = GRID_OFFSET.x, y = GRID_OFFSET.y) {
  GRID_OFFSET.x = x;
  GRID_OFFSET.y = y;
  const pxX = `${x}px`;
  const pxY = `${y}px`;
  document.documentElement.style.setProperty('--bg-offset-x', pxX);
  document.documentElement.style.setProperty('--bg-offset-y', pxY);
  if (stage) {
    stage.style.backgroundPosition = `${pxX} ${pxY}`;
  }
}

function isMergeable(node) {
  if (!node) return false;
  return !node.classList.contains('node-folder') && !node.classList.contains('node-exporter');
}

function nodeTypeKey(node) {
  if (!node) return null;
  if (node.classList.contains('node-image-query') || node.classList.contains('node-text-query')) return 'query';
  if (node.classList.contains('node-date-filter') || node.classList.contains('node-folder')) return 'filter';
  if (node.classList.contains('node-exporter')) return 'exporter';
  return null;
}

function clearMergeState(node) {
  mergeTarget = null;
  mergeCandidate = null;
  if (mergeTimer) {
    clearTimeout(mergeTimer);
    mergeTimer = null;
  }
  if (node) node.classList.remove('node-merge-shake');
}

function checkMergeDuringDrag(node) {
  if (!node || !isMergeable(node)) {
    clearMergeState(node);
    return;
  }
  const rect = node.getBoundingClientRect();
  const others = Array.from(nodesLayer.querySelectorAll('.node')).filter(n => n !== node && isMergeable(n));
  const hit = others.find(n => {
    const r = n.getBoundingClientRect();
    return !(rect.right < r.left || rect.left > r.right || rect.bottom < r.top || rect.top > r.bottom);
  });
  if (hit !== mergeCandidate) {
    if (mergeTimer) clearTimeout(mergeTimer);
    mergeCandidate = hit || null;
    node.classList.remove('node-merge-shake');
    mergeTimer = null;
    if (hit) {
      mergeTimer = setTimeout(() => {
        mergeTarget = hit;
        node.classList.add('node-merge-shake');
      }, 500);
    }
  }
  if (!hit) clearMergeState(node);
}

function finalizeMerge(node) {
  if (!mergeTarget || !node || !isMergeable(node)) return;
  const target = mergeTarget;
  const typeNode = nodeTypeKey(node);
  const typeTarget = nodeTypeKey(target);
  if (!typeNode || !typeTarget || typeNode !== typeTarget) return;
  const targetLeft = parseFloat(target.style.left) || 0;
  const targetTop = parseFloat(target.style.top) || 0;
  const nodeW = parseFloat(node.dataset.width) || node.offsetWidth;
  const nodeH = parseFloat(node.dataset.height) || node.offsetHeight;
  const groupId = node.dataset.group || target.dataset.group || `g-${Date.now()}`;
  node.style.left = `${targetLeft}px`;
  node.style.top = `${targetTop - nodeH}px`;
  node.dataset.group = groupId;
  target.dataset.group = groupId;
  node.classList.add('node-merged','group-anchor');
  target.classList.add('node-merged');
  const targetHeader = target.querySelector('.node-header');
  if (targetHeader) targetHeader.style.display = 'none';
  const targetTitle = target.querySelector('.node-title span');
  if (targetTitle && !target.dataset.origTitle) target.dataset.origTitle = targetTitle.textContent || '';
  const titleEl = node.querySelector('.node-title span');
  if (titleEl) {
    if (!node.dataset.origTitle) node.dataset.origTitle = titleEl.textContent || '';
    titleEl.textContent = `${typeNode} group`;
  }
  const shell = node.querySelector('.node-shell');
  if (shell) {
    shell.dataset.shellLocked = 'true';
    const cache = morphCache.get(node) || {};
    const base = cache.base || SHELL_PATH_BASE;
    const full = cache.full || SHELL_PATH_FULL;
    applyShellPath(shell, full || base);
    if (node.classList.contains('node-text-query')) {
      updateTextShellAsset(shell, true);
    } else if (node.classList.contains('node-date-filter')) {
      updateDateShellAsset(shell, true);
    } else if (node.classList.contains('node-exporter')) {
      updateExporterShellAsset(shell, true);
    }
  }
  clearMergeState(node);
}

function ungroupGroup(groupId) {
  if (!groupId) return;
  const nodes = Array.from(nodesLayer.querySelectorAll(`.node[data-group="${groupId}"]`));
  nodes.forEach(n => {
    n.classList.remove('node-merged','group-anchor','node-merge-shake');
    n.removeAttribute('data-group');
    const header = n.querySelector('.node-header');
    if (header) header.style.display = '';
    const title = n.querySelector('.node-title span');
    if (title && n.dataset.origTitle) {
      title.textContent = n.dataset.origTitle;
    }
    const shell = n.querySelector('.node-shell');
    if (shell) {
      shell.dataset.shellLocked = shell.dataset.shellLocked; // keep current
    }
  });
  clearMergeState();
}

function applyBigBoyPosition(el) {
  if (!el) return;
  const { x, y } = bigBoyPos || BIGBOY_POS_DEFAULT;
  if (x == null || y == null) return;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.transform = 'translate(0, 0)';
}

// Basic Gaussian random (Box-Muller). Mean 0, stddev 1.
function gaussianRand() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// helper for console tweaks
window.setGridOffset = applyGridOffset;
// helper to move bigboy at runtime: setBigBoyPos(x, y)
window.setBigBoyPos = (x, y) => {
  if (x == null || y == null) return;
  bigBoyPos = { x, y };
  applyBigBoyPosition(document.querySelector('.bigboy'));
};
// helper to adjust word cloud diffusion at runtime
window.setWordCloudDiffusion = val => {
  const num = parseFloat(val);
  if (Number.isNaN(num) || num <= 0) return;
  WORD_CLOUD_DIFFUSION = num;
};

function ensureIndexingComponent(bb) {
  if (!viewport || !bb) return;
  if (!indexingEl) {
    indexingEl = document.createElement('div');
    indexingEl.className = 'indexing';
    const img = document.createElement('img');
    img.className = 'indexing-img';
    img.alt = 'Indexing';
    img.src = 'assets/index.svg';
    indexingEl.appendChild(img);
    // Wordcloud toggle inside indexing bar
    const wcWrap = document.createElement('div');
    wcWrap.className = 'index-wc';
    const wcLabel = document.createElement('span');
    wcLabel.className = 'index-wc-label';
    wcLabel.textContent = 'Computer Vision';
    const wcBtn = document.createElement('button');
    wcBtn.className = 'wordcloud-btn';
    wcBtn.type = 'button';
    wcBtn.setAttribute('aria-label', 'Toggle word cloud');
    wcBtn.innerHTML = `<img class="wordcloud-icon" src="assets/ComputerVisionToggoleOff.svg" alt="Word cloud toggle" />`;
    wcBtn.addEventListener('click', () => {
      const overlay = wordCloudOverlayEl || document.querySelector('.wordcloud-overlay');
      const show = overlay && !overlay.classList.contains('show');
      if (overlay) {
        overlay.classList.toggle('show', show);
        overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
      }
      wordCloudActive = show;
      const icon = wcBtn.querySelector('.wordcloud-icon');
      if (icon) icon.src = show ? 'assets/ComputerVisionToggoleOn.svg' : 'assets/ComputerVisionToggoleOff.svg';
      const browserList = document.querySelector('.browser-list');
      if (browserList) {
        browserList.style.opacity = show ? '0' : '1';
        browserList.style.pointerEvents = show ? 'none' : '';
        browserList.style.transition = 'opacity 160ms ease';
      }
      if (show) {
        const overlayEl = wordCloudOverlayEl || document.querySelector('.wordcloud-overlay');
        const layer = overlayEl?.querySelector('.wordcloud-layer');
        if (overlayEl && layer) {
          sizeWordCloudLayer(overlayEl, layer);
          centerWordCloudLayer(overlayEl, layer);
          buildWordCloud(layer);
          attachWordCloudDrags(layer);
          applyWordCloudFilter(overlayEl, getEffectiveVisibility());
          updateWordCloudSlider(wordCloudSliderEl, overlayEl, wordCloudSliderValue);
        }
      } else {
        renderBrowserList();
      }
    });
    wcWrap.appendChild(wcLabel);
    wcWrap.appendChild(wcBtn);
    indexingEl.appendChild(wcWrap);
    viewport.appendChild(indexingEl);
    const folderBtn = document.getElementById('browser-folder-btn');
    if (folderBtn) {
      folderBtn.innerHTML = `<img src="assets/UploadCaseButton.svg" alt="Upload folder" />`;
      folderBtn.setAttribute('aria-label', 'Choose folder');
      folderBtn.style.position = 'absolute';
      folderBtn.style.left = '50%';
      folderBtn.style.top = '13%';
      folderBtn.style.transform = 'translate(-50%, -50%)';
      indexingEl.appendChild(folderBtn);
    }
  }
  positionIndexing(bb);
  createDatalink();
}

function ensureVideoViewerElements() {
  if (overlayLayer && videoViewerBackdrop) return;
  if (!overlayLayer) {
    overlayLayer = document.createElement('div');
    overlayLayer.className = 'overlay-layer';
    stage.appendChild(overlayLayer);
  }
  videoViewerBackdrop = document.createElement('div');
  videoViewerBackdrop.className = 'video-viewer-backdrop';
  videoViewerBackdrop.hidden = true;
  stage.appendChild(videoViewerBackdrop);
  // Close only via close buttons; no global ESC/backdrop close
}

function positionIndexing(bb) {
  if (!indexingEl || !bb) return;
  const rect = bb.getBoundingClientRect();
  const vpRect = viewport.getBoundingClientRect();
  const height = rect.height;
  const left = rect.left - vpRect.left;
  const top = rect.top - vpRect.top;
  indexingEl.style.left = `${left}px`;
  indexingEl.style.top = `${top + height + 780}px`;
  createDatalink();
}

function createDatalink() {
  if (!viewport || !indexingEl) return;
  const bb = document.querySelector('.bigboy');
  if (!bb) return;
  const vpRect = viewport.getBoundingClientRect();
  const idxRect = indexingEl.getBoundingClientRect();
  const bbRect = bb.getBoundingClientRect();
  const left = (idxRect.left - vpRect.left) + DATALINK_OFFSET.x;
  const top = (idxRect.top - vpRect.top) + DATALINK_OFFSET.y;
  const right = bbRect.right - vpRect.left;
  const bottom = bbRect.bottom - vpRect.top;
  const width = right - left;
  const height = bottom - top;
  if (!datalinkEl) {
    datalinkEl = document.createElement('div');
    datalinkEl.className = 'datalink';
    viewport.appendChild(datalinkEl);
  }
  datalinkEl.style.left = `${left}px`;
  datalinkEl.style.top = `${top}px`;
  datalinkEl.style.width = `${width}px`;
  datalinkEl.style.height = `${height}px`;
}

const SHELL_PATH_BASE = 'M144.674 0H10C4.47715 0 0 4.47716 0 10V139.364C0 142.015 1.05291 144.558 2.92723 146.433L19.0995 162.613C20.975 164.49 23.5192 165.544 26.1722 165.544H152.674C153.778 165.544 154.674 164.648 154.674 163.544L154.674 10C154.674 4.47715 150.196 0 144.674 0Z';
const SHELL_PATH_FULL = 'M10 0H144.674C150.196 0 154.674 4.47715 154.674 10V163.544C154.674 164.648 153.778 165.544 152.674 165.544H2C0.89543 165.544 0 164.648 0 163.544V10C0 4.47715 4.47715 0 10 0Z';
const FOLDER_SHELL_BASE = 'M144.674 0H10C4.47715 0 0 4.47716 0 10V358.364C0 361.015 1.05291 363.558 2.92723 365.433L19.0995 381.613C20.975 383.49 23.5192 384.544 26.1722 384.544H144.674C150.196 384.544 154.674 380.067 154.674 374.544L154.674 10C154.674 4.47715 150.196 0 144.674 0Z';
const FOLDER_SHELL_FULL = 'M10 0H144.674C150.196 0 154.674 4.47715 154.674 10V374.544C154.674 380.067 150.196 384.544 144.674 384.544H10C4.47715 384.544 0 380.067 0 374.544V10C0 4.47715 4.47715 0 10 0Z';
const TEXT_SHELL_BASE = 'M318.398 0H10C4.47715 0 0 4.47715 0 10V62.3593C0 65.0106 1.05291 67.5534 2.92723 69.4286L25.4692 91.9815C27.3447 93.8579 29.889 94.9121 32.542 94.9121H326.398C327.502 94.9121 328.398 94.0167 328.398 92.9121V10C328.398 4.47715 323.92 0 318.398 0Z';
const TEXT_SHELL_FULL = 'M10 0H318.398C323.92 0 328.398 4.47715 328.398 10V92.9121C328.398 94.0167 327.502 94.9121 326.398 94.9121H0V62.3593V10C0 4.47715 4.47715 0 10 0Z';
const DATE_SHELL_BASE = 'M327 0H10C4.47715 0 0 4.47715 0 10V65.3593C0 68.0106 1.05291 70.5534 2.92723 72.4287L25.4692 94.9815C27.3447 96.8579 29.889 97.9121 32.542 97.9121L327.008 97.9113C332.53 97.9113 337 93.4341 337 87.9113L337 10C337 4.47715 332.523 0 327 0Z';
const DATE_SHELL_FULL = 'M10 0H327C332.523 0 337 4.47715 337 10V87.9113C337 93.4341 332.53 97.9113 327.008 97.9113H9.95553C4.43268 97.9113 0 93.4341 0 87.9113L0 10C0 4.47715 4.47715 0 10 0Z';
const DROPLET_PATH = 'M11.2162 18.6726C8.94532 7.7207 7.466 7.2571 0 0L38.7369 0.151466C30.4659 8.66066 28.4844 9.2207 25.2378 19.9549C24.1659 22.9116 21.3585 25.4983 18.2141 25.4379C14.7445 25.3711 11.9208 22.0706 11.2162 18.6726Z';
const DROPLET_SIZE = { width: 39, height: 26 };
const DROPLET_HALF_WIDTH = DROPLET_SIZE.width / 2;
const DROPLET_HALF_HEIGHT = DROPLET_SIZE.height / 2;
const DROPLET_ANGLE_OFFSET = -90;
const DROPLET_EDGE_OFFSET = {
  top: { normal: -2, tangent: 0 },
  right: { normal: 16, tangent: 0 },
  bottom: { normal: 12, tangent: 0 },
  left: { normal: 16, tangent: 0 },
  cornerTopLeft: { normal: -26.5, tangent: -14 },
  cornerTopRight: { normal: -26.5, tangent: 15 },
  cornerBottomRight: { normal: 3.5, tangent: 2 },
  cornerBottomLeft: { normal: 3.5, tangent: 2 },
  default: { normal: 10, tangent: 0 }
};
const DROPLET_EDGE_ANGLE_OFFSET = {
  top: 180,
  right: 0,
  bottom: 0,
  left: 0,
  cornerTopLeft: -1,
  cornerTopRight: 1.8,
  cornerBottomRight: 6.1,
  cornerBottomLeft: -0.8,
  default: 0
};
const HANDLE_GAP = 2;
const HANDLE_MAX_DIST = 6;
const HANDLE_DRAG_EXTRA = 10;
const HANDLE_BASE_OFFSET = DROPLET_SIZE.height / 2 + HANDLE_GAP;
const HANDLE_EDGE_SHIFT = {
  top: { normal: -28, tangent: -10},
  right: { normal: 0, tangent: 7.5 },
  bottom: { normal: 0, tangent: -7 },
  left: { normal: -16, tangent: -5.5 },
  cornerTopLeft: { normal: -15, tangent: 0 },
  cornerTopRight: { normal: -2, tangent: 15 },
  cornerBottomRight: { normal: 8, tangent: 0 },
  cornerBottomLeft: { normal: -4, tangent: -10 },
  default: { normal: 0, tangent: 0 }
};
const HANDLE_LINK_PULLBACK = 0; // pulls line endpoint back toward droplet along handle direction
const HANDLE_LINK_TANGENT = 8.3; // shifts line endpoint sideways along tangent
const HANDLE_LINK_REGION_OFFSET = {
  top: { pullback: HANDLE_LINK_PULLBACK, tangent: HANDLE_LINK_TANGENT },
  right: { pullback: 4, tangent: -5.5 },
  bottom: { pullback: HANDLE_LINK_PULLBACK, tangent: HANDLE_LINK_TANGENT },
  left: { pullback: -2, tangent: 6.5 },
  cornerTopLeft: { pullback: -4, tangent: -3.5 },
  cornerTopRight: { pullback: -4, tangent: -10 },
  cornerBottomRight: { pullback: 4.5, tangent: 4 },
  cornerBottomLeft: { pullback: 0, tangent: 8.8 },
  default: { pullback: HANDLE_LINK_PULLBACK, tangent: HANDLE_LINK_TANGENT }
};
const CORNER_NORMALS = {
  cornerTopLeft: normalize(-1, -1),
  cornerTopRight: normalize(1, -1),
  cornerBottomRight: normalize(1, 1),
  cornerBottomLeft: normalize(-1, 1)
};

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function clampDirection(vector, baseDir, minDeg = -45, maxDeg = 45) {
  const baseAngle = Math.atan2(baseDir.y, baseDir.x);
  const currentAngle = Math.atan2(vector.y, vector.x);
  let delta = currentAngle - baseAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const minRad = minDeg * Math.PI / 180;
  const maxRad = maxDeg * Math.PI / 180;
  delta = Math.max(minRad, Math.min(maxRad, delta));
  const finalAngle = baseAngle + delta;
  return { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
}

const ARROW_ANGLE_OFFSET = -90;
const ARROW_REGION_VECTORS = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const ARROW_REGION_ANGLE_OFFSET = {
  top: -45,
  right: -45,
  bottom: -45,
  left: -45,
  default: 0
};
const ARROW_CORNER_BOUNDS = {
  cornerTopLeft: { base: CORNER_NORMALS.cornerTopLeft, min: -45, max: 45 },
  cornerTopRight: { base: CORNER_NORMALS.cornerTopRight, min: -45, max: 45 },
  cornerBottomRight: { base: CORNER_NORMALS.cornerBottomRight, min: -45, max: 45 },
  cornerBottomLeft: { base: CORNER_NORMALS.cornerBottomLeft, min: -45, max: 45 }
};
const ARROW_CORNER_ANGLE_OFFSET = {
  cornerTopLeft: -45,
  cornerTopRight: -45,
  cornerBottomRight: -45,
  cornerBottomLeft: -45,
  default: 0
};
const ARROW_LINK_PULL = 0; // extend or retract connector endpoint along arrow direction
const FILL_THRESHOLD = 12;
const MAX_PULL = 50;
const BOUNDS_PADDING = 400;

const textMeasureCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
const textMeasureCtx = textMeasureCanvas ? textMeasureCanvas.getContext('2d') : null;
function measureTextWidth(text, font = '400 20px "Atkinson Hyperlegible","Segoe UI","Microsoft YaHei",sans-serif') {
  if (!textMeasureCtx) return (text || '').length * 12;
  textMeasureCtx.font = font;
  return textMeasureCtx.measureText(text || '').width;
}

const morphCache = new WeakMap();
let defaultMorphShell = () => SHELL_PATH_BASE;
let activeTextEditNode = null;
let activeDateEditNode = null;
const initMorphers = () => {
  if (!window.flubber) return;
  defaultMorphShell = window.flubber.interpolate(SHELL_PATH_BASE, SHELL_PATH_FULL, { maxSegmentLength: 2 });
};
if (typeof window !== 'undefined') {
  initMorphers();
  window.addEventListener('load', initMorphers);
  const modeToggle = document.getElementById('mode-toggle');
  if (modeToggle) {
    modeToggle.addEventListener('click', () => {
      const active = document.body.classList.toggle('invert-mode');
      modeToggle.textContent = active ? '☾' : '☀︎';
    });
  }
  // blur any active text edit when clicking elsewhere
  window.addEventListener('pointerdown', e => {
    const target = e.target;
    if (activeTextEditNode && !activeTextEditNode.contains(target)) {
      const input = activeTextEditNode.querySelector('.text-node-input');
      if (input) {
        activeTextEditNode.dataset.textEditing = 'false';
        input.setAttribute('contenteditable', 'false');
        updateTextNodeWidth(activeTextEditNode);
        updateTextNodeColor(input);
      }
      activeTextEditNode = null;
    }
    if (activeDateEditNode && !activeDateEditNode.contains(target)) {
      stopDateEdit(activeDateEditNode);
    }
  }, true);
}

let scale = 1;
const pos = { x: 0, y: 0 };
let panStart = null;
let dragNode = null;
let arrowDrag = null;
const arrowLockedWorld = new WeakMap(); // node -> {x,y} world position when locked
// upload modal globals
let uploadModal = null;
let uploadInputGlobal = null;
let uploadCloseBtn = null;
let uploadTargetNode = null;
let uploadKeyListenerAdded = false;
let nodePickerEl = null;
let pickerBackdropEl = null;
let activeNode = null;
let browserItems = [];
let folderTreeData = null;
let selectedNodes = new Set();
let selectionRect = null;
let selectionStart = null;

stage.addEventListener('contextmenu', e => e.preventDefault());

stage.addEventListener('pointerdown', e => {
  if (e.button !== 2) return;
  panStart = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    originX: pos.x,
    originY: pos.y
  };
  stage.setPointerCapture(e.pointerId);
});

stage.addEventListener('pointermove', e => {
  if (!panStart || e.pointerId !== panStart.pointerId) return;
  pos.x = panStart.originX + (e.clientX - panStart.startX);
  pos.y = panStart.originY + (e.clientY - panStart.startY);
  applyTransform();
});

function endPan(e) {
  if (panStart && (!e || e.pointerId === panStart.pointerId)) {
    stage.releasePointerCapture(panStart.pointerId);
    panStart = null;
  }
}

  stage.addEventListener('pointerup', endPan);
  stage.addEventListener('pointercancel', endPan);
  stage.addEventListener('pointerleave', endPan);
window.addEventListener('keydown', e => {
  if (e.altKey && (e.code === 'KeyV' || e.code === 'KeyA')) {
    browserPreviewEnabled = !browserPreviewEnabled;
    renderBrowserList();
  }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    // adjust visibility bias; left = fewer (increase bias), right = more (decrease bias)
    const dir = e.code === 'ArrowLeft' ? 1 : -1;
    keyboardVisibilityBias = Math.min(1, Math.max(-1, keyboardVisibilityBias + dir * VISIBILITY_KEY_STEP));
    const overlay = wordCloudOverlayEl || document.querySelector('.wordcloud-overlay');
    if (wordCloudSliderEl && overlay) {
      applyWordCloudFilter(overlay, getEffectiveVisibility());
    }
    renderBrowserList();
  }
});

stage.addEventListener('wheel', e => {
  if (!(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  const delta = -e.deltaY * 0.001;
  const nextScale = Math.min(2, Math.max(0.25, scale * (1 + delta)));
  if (nextScale === scale) return;

  // Zoom around the pointer position for better feel.
  const rect = stage.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  const scaleRatio = nextScale / scale;

  pos.x = offsetX - (offsetX - pos.x) * scaleRatio;
  pos.y = offsetY - (offsetY - pos.y) * scaleRatio;
  scale = nextScale;
  applyTransform();
}, { passive: false });

stage.addEventListener('dragover', e => {
  if (e.dataTransfer && e.dataTransfer.types.includes('application/node-type')) {
    e.preventDefault();
  }
});

stage.addEventListener('drop', e => {
  if (!e.dataTransfer) return;
  const type = e.dataTransfer.getData('application/node-type');
  if (!type) return;
  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  const worldX = (e.clientX - rect.left - pos.x) / scale;
  const worldY = (e.clientY - rect.top - pos.y) / scale;
  spawnNodeByType(type, worldX, worldY);
});

function applyTransform() {
  viewport.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale})`;
  stage.style.backgroundSize = `${TILE_SIZE * scale}px ${TILE_SIZE * scale}px`;
  stage.style.backgroundPosition = `${pos.x}px ${pos.y}px`;
  if (overlayLayer) {
    overlayLayer.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale})`;
  }
}

function getNodeDimensions(node) {
  const w = parseFloat(node?.dataset?.width);
  const h = parseFloat(node?.dataset?.height);
  if (!Number.isNaN(w) && !Number.isNaN(h)) return { width: w, height: h };
  return NODE_DIMENSIONS;
}

function registerShellPaths(node, basePath, fullPath) {
  const morph = (window.flubber && basePath && fullPath)
    ? window.flubber.interpolate(basePath, fullPath, { maxSegmentLength: 2 })
    : (t) => (t <= 0 ? basePath : fullPath);
  morphCache.set(node, { base: basePath, full: fullPath, morph });
}

function applyShellPath(shellEl, d = SHELL_PATH_BASE) {
  if (!shellEl) return;
  const node = shellEl.closest('.node');
  const isTextNode = node?.classList?.contains('node-text-query');
  const isExporter = node?.classList?.contains('node-exporter');
  shellEl.style.setProperty('--shell-path', `path('${d}')`);
  if (!isTextNode && !isExporter) {
    shellEl.style.clipPath = `path('${d}')`;
    shellEl.style.webkitClipPath = `path('${d}')`;
  }
}

function updateTextShellAsset(shellEl, locked = false) {
  if (!shellEl) return;
  const node = shellEl.closest('.node');
  if (!node || !node.classList.contains('node-text-query')) return;
  const src = locked ? 'assets/textshellfull.svg' : 'assets/Textshell.svg';
  shellEl.style.borderImageSource = `url("${src}")`;
}

function updateDateShellAsset(shellEl, locked = false) {
  if (!shellEl) return;
  const node = shellEl.closest('.node');
  if (!node || !node.classList.contains('node-date-filter')) return;
  // For date nodes we rely on clip-path; no background image swap needed.
  shellEl.style.backgroundImage = '';
}

function updateExporterShellAsset(shellEl, locked = false) {
  if (!shellEl) return;
  const node = shellEl.closest('.node');
  if (!node || !node.classList.contains('node-exporter')) return;
  const src = locked ? 'assets/XLSXExporterShellFull.svg' : 'assets/XLSXExporterShell.svg';
  shellEl.style.backgroundImage = `url("${src}")`;
  shellEl.style.backgroundRepeat = 'no-repeat';
  shellEl.style.backgroundSize = 'contain';
  shellEl.style.backgroundPosition = '0 0';
}

if (nodesLayer && stage) {
  stage.addEventListener('dblclick', e => {
    if (e.target.closest('.node')) return;
    openNodePicker(e.clientX, e.clientY);
  });

  nodesLayer.addEventListener('click', e => {
    const closeBtn = e.target.closest('.node-close');
    if (closeBtn) {
      closeBtn.closest('.node').remove();
      return;
    }
    const toggle = e.target.closest('.node-toggle');
    if (toggle) {
      toggleNodeState(toggle);
      return;
    }
  });

  // keyboard shortcut: middle-dot to toggle code view on active node
  window.addEventListener('keydown', e => {
    const isBackquote = e.key === '`' || e.code === 'Backquote';
    if (!isBackquote) return;
    const focused = document.activeElement;
    const node = focused?.closest ? focused.closest('.node') : null;
    const targetNode = node || activeNode;
    if (targetNode) {
      e.preventDefault();
      toggleNodeCodeView(targetNode);
    }
  }, true);

  nodesLayer.addEventListener('keydown', e => {
    const closeBtn = e.target.closest('.node-close');
    if (closeBtn && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      closeBtn.closest('.node').remove();
    }
    const toggle = e.target.closest('.node-toggle');
    if (toggle && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleNodeState(toggle);
    }
  });

  // browser folder picker
  const folderBtn = document.getElementById('browser-folder-btn');
  const folderInput = document.getElementById('browser-folder-input');
  const allowedExt = ['jpg','jpeg','png','gif','mp4','mov','mkv','webm','bmp','tiff','webp'];
  if (folderBtn && folderInput) {
    folderBtn.addEventListener('click', () => folderInput.click());
    folderInput.addEventListener('change', () => {
      const files = Array.from(folderInput.files || []);
      browserItems = files
        .filter(f => {
          const ext = (f.name.split('.').pop() || '').toLowerCase();
          return allowedExt.includes(ext);
        })
        .map(f => {
          const ext = (f.name.split('.').pop() || '').toUpperCase();
          const isVideo = ['MP4','MOV','MKV','WEBM'].includes(ext);
          return { name: f.name, ext, url: URL.createObjectURL(f), isVideo, file: f, thumb: null };
        });
      startIndexingAnimation(browserItems);
      generateThumbnails(browserItems).finally(() => {
        if (browserRevealCount === Infinity) browserRevealCount = browserItems.length;
        renderBrowserList();
      });
      folderTreeData = buildFolderTreeFromFiles(files);
      renderFolderTree();
    });
  }

  nodesLayer.addEventListener('pointerdown', e => {
    const arrow = e.target.closest('.node-arrow');
    if (arrow && e.button === 0) {
      startArrowDrag(arrow, e);
      return;
    }
    const node = e.target.closest('.node');
    if (!node || e.button !== 0) return;
    if (e.target.closest('.node-upload-hit') || e.target.closest('.node-upload-icon')) {
      return; // let upload clicks pass through
    }
    if (e.target.closest('.node-close') || e.target.closest('.node-toggle') || e.target.closest('.node-code-panel')) return;
    activeNode = node;
    dragStartTime = performance.now();
    const startX = parseFloat(node.style.left) || 0;
    const startY = parseFloat(node.style.top) || 0;
    const shell = node.querySelector('.node-shell');
    const locked = shell && shell.dataset.shellLocked === 'true';
    const groupSet = selectedNodes.has(node) ? selectedNodes : new Set([node]);
    const groupId = node.dataset.group;
    if (groupId) {
      nodesLayer.querySelectorAll(`.node[data-group="${groupId}"]`).forEach(n => groupSet.add(n));
    }
    const tempHighlight = new Set();
    groupSet.forEach(n => {
      if (!selectedNodes.has(n)) {
        n.classList.add('node-selected');
        tempHighlight.add(n);
      }
    });
    dragNode = {
      node,
      pointerId: e.pointerId,
      startX,
      startY,
      groupOffsets: Array.from(groupSet).map(n => ({
        node: n,
        x: parseFloat(n.style.left) || 0,
        y: parseFloat(n.style.top) || 0,
        w: parseFloat(n.dataset.width) || NODE_DIMENSIONS.width,
        h: parseFloat(n.dataset.height) || NODE_DIMENSIONS.height
      })),
      originX: e.clientX,
      originY: e.clientY,
      locked,
      tempHighlight
    };
    node.classList.add('dragging');
    if (locked) node.classList.add('locked-drag');
    // Re-apply the shell clip to avoid any stale shape while dragging (seen on date node)
    if (shell && node.classList.contains('node-date-filter')) {
      const cache = morphCache.get(node) || {};
      const d = locked ? (cache.full || DATE_SHELL_FULL) : (cache.base || DATE_SHELL_BASE);
      applyShellPath(shell, d);
    }
    if (locked) {
      const a = node.querySelector('.node-arrow');
      if (a) a.style.transition = 'none';
    }
    node.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.bigboy')) return;
    if (e.target.closest('.video-viewer')) return;
    const pickerOpen = nodePickerEl && !nodePickerEl.hidden;
    if (pickerOpen) return;
    const isNodeHit = e.target.closest('.node');
    const isArrowHit = e.target.closest('.node-arrow');
    const isToggle = e.target.closest('.node-toggle');
    const isClose = e.target.closest('.node-close');
    const isUpload = e.target.closest('.node-upload-hit') || e.target.closest('.node-upload-icon');
    if (isNodeHit || isArrowHit || isToggle || isClose || isUpload) return;
    startSelection(e);
  });

  // exit code view when clicking outside the node
  window.addEventListener('pointerdown', e => {
    if (!activeNode) return;
    if (!activeNode.contains(e.target) && !e.target.closest('.node-code-panel')) {
      if (activeNode.classList.contains('code-view')) {
        toggleNodeCodeView(activeNode);
      }
    }
  }, true);

  nodesLayer.addEventListener('pointermove', e => {
    if (arrowDrag && e.pointerId === arrowDrag.pointerId) {
      handleArrowMove(e);
      return;
    }
    if (!dragNode || e.pointerId !== dragNode.pointerId) return;
    const deltaX = (e.clientX - dragNode.originX) / scale;
    const deltaY = (e.clientY - dragNode.originY) / scale;
    const primary = dragNode.node;
    dragNode.groupOffsets.forEach(item => {
      const nextX = item.x + deltaX;
      const nextY = item.y + deltaY;
      item.node.style.left = `${nextX}px`;
      item.node.style.top = `${nextY}px`;
      if (item.node !== primary) return;
      const shell = item.node.querySelector('.node-shell');
      const arrow = item.node.querySelector('.node-arrow');
      if (shell && shell.dataset.shellLocked === 'true' && arrow) {
        let lock = arrowLockedWorld.get(item.node);
        if (!lock) {
          const rect = arrow.getBoundingClientRect();
          const stageRect = stage.getBoundingClientRect();
          lock = {
            x: (rect.left - stageRect.left) / scale + (rect.width / 2) / scale,
            y: (rect.top - stageRect.top) / scale + (rect.height / 2) / scale
          };
          arrowLockedWorld.set(item.node, lock);
        }
        const pointerLocal = { x: lock.x - nextX, y: lock.y - nextY };
        const tempDrag = {
          node: item.node,
          arrow,
          shell,
          droplet: item.node.querySelector('.node-droplet'),
          handle: item.node.querySelector('.node-handle'),
          link: item.node.querySelector('.node-link'),
          base: getArrowBase(item.node, arrow),
          pointer: pointerLocal,
          anchor: null,
          distance: 0
        };
        const anchor = projectToPerimeter(pointerLocal, getNodeDimensions(item.node));
        applyArrowState(tempDrag, anchor, pointerLocal);
      }
    });
    checkMergeDuringDrag(dragNode.node);
  });

function endNodeDrag(e) {
  if (!dragNode || (e && e.pointerId !== dragNode.pointerId)) return;
  const node = dragNode.node;
  const heldLong = performance.now() - dragStartTime >= 1000;
  const deltaX = (parseFloat(node.style.left) || 0) - dragNode.startX;
  const deltaY = (parseFloat(node.style.top) || 0) - dragNode.startY;
  dragNode.groupOffsets.forEach(item => {
    const rect = {
      x: item.x + deltaX,
      y: item.y + deltaY,
      w: item.w,
      h: item.h
    };
    const resolved = resolveOverlapRect(rect, item.node);
    item.node.style.left = `${resolved.x}px`;
    item.node.style.top = `${resolved.y}px`;
    item.node.classList.remove('dragging');
    item.node.classList.remove('locked-drag');
    const a = item.node.querySelector('.node-arrow');
    if (a) a.style.transition = '';
  });
  finalizeMerge(node);
  clearMergeState();
  if (heldLong && node.dataset.group) {
    ungroupGroup(node.dataset.group);
  }
  if (dragNode.tempHighlight) {
    dragNode.tempHighlight.forEach(n => n.classList.remove('node-selected'));
  }
  node.releasePointerCapture(dragNode.pointerId);
  dragNode = null;
}

  nodesLayer.addEventListener('pointerup', e => { endArrowDrag(e); endNodeDrag(e); });
  nodesLayer.addEventListener('pointercancel', e => { endArrowDrag(e); endNodeDrag(e); });
  nodesLayer.addEventListener('pointerleave', e => { endArrowDrag(e); endNodeDrag(e); });
  // Seed one default node for reference
  createBigBoy();
  seedDefaultNodes();
}

function seedDefaultNodes() {
  const seeds = [
    { type: 'query' },
    { type: 'filter' }
  ];
  seeds.forEach((seed, idx) => {
    const dims = seed.type === 'filter' ? FOLDER_DIMENSIONS : NODE_DIMENSIONS;
    let cx = 1400 + idx * (dims.width + 30);
    let cy = 280;
    for (let i = 0; i < 8; i++) {
      const rect = { x: cx - dims.width / 2, y: cy - dims.height / 2, w: dims.width, h: dims.height };
      if (!collidesWithNodes(rect)) {
        spawnNodeByType(seed.type, cx, cy);
        break;
      }
      cx += dims.width + 30;
      cy += 0;
    }
  });
}

function createBigBoy() {
  if (!viewport || document.querySelector('.bigboy')) return;
  const bb = document.createElement('div');
  bb.className = 'bigboy';
  bb.innerHTML = `
    <div class="bigboy-base"></div>
    <div class="bigboy-title">
      <span class="bigboy-title-text">Viewer</span>
    </div>
    <img class="bigboy-corner tl" src="assets/UpLeftBoy.svg" alt="" />
    <img class="bigboy-corner tr" src="assets/UpRightBoy.svg" alt="" />
    <img class="bigboy-corner br" src="assets/BottomRightBoy.svg" alt="" />
    <img class="bigboy-corner bl" src="assets/BottomLeftBoy.svg" alt="" />
    <div class="bigboy-browser">
      <div class="browser-scroll">
        <div class="browser-list"></div>
      </div>
    </div>
  `;
  applyBigBoyPosition(bb);
  viewport.insertBefore(bb, viewport.firstChild);
  renderBrowserList();
  initWordCloudOverlay(bb);
  ensureIndexingComponent(bb);
  createDatalink();
}

function initWordCloudOverlay(bb) {
  const stage = document.getElementById('stage');
  const title = bb.querySelector('.bigboy-title');
  const browser = bb.querySelector('.bigboy-browser');
  if (!stage || !title || !browser) return;

  const slider = document.createElement('div');
  slider.className = 'wordcloud-slider';
  slider.innerHTML = `
    <div class="slider-bar"></div>
    <div class="slider-percent">00%</div>
  `;
  browser.appendChild(slider);
  wordCloudSliderEl = slider;

  const overlay = document.createElement('div');
  overlay.className = 'wordcloud-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  wordCloudOverlayEl = overlay;
  const layer = document.createElement('div');
  layer.className = 'wordcloud-layer';
  overlay.appendChild(layer);
  ['top','right','bottom','left'].forEach(dir => {
    const arrow = document.createElement('div');
    arrow.className = `wc-drag-arrow wc-${dir}`;
    overlay.appendChild(arrow);
  });
  const baseEl = bb.querySelector('.bigboy-base') || bb;
  baseEl.appendChild(overlay);
  const sizeOverlay = () => {
    const w = baseEl.clientWidth || baseEl.offsetWidth;
    const h = baseEl.clientHeight || baseEl.offsetHeight;
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;
    overlay.style.top = '0';
    overlay.style.left = '0';
  };
  sizeOverlay();
  overlay.addEventListener('contextmenu', ev => ev.preventDefault());

  window.addEventListener('resize', () => {
    sizeOverlay();
    sizeWordCloudLayer(overlay, layer);
    updateWordCloudSlider(slider, overlay, wordCloudSliderValue);
  });

  const regen = () => {
    sizeWordCloudLayer(overlay, layer);
    centerWordCloudLayer(overlay, layer);
    buildWordCloud(layer);
    attachWordCloudDrags(layer);
    applyWordCloudFilter(overlay, getEffectiveVisibility());
  };
  initWordCloudSlider(slider, overlay);
  initWordCloudPan(overlay, layer);
  sizeWordCloudLayer(overlay, layer);
}

function buildWordCloud(layer) {
  if (!layer) return;
  layer.innerHTML = '';
  const layerRect = layer.getBoundingClientRect();
  const layerW = layer.offsetWidth || layerRect.width;
  const layerH = layer.offsetHeight || layerRect.height;
  const overlay = layer.parentElement;
  const padding = 4;
  const diffusion = WORD_CLOUD_DIFFUSION || 1;
  const clusters = Math.max(18, Math.round(45 * diffusion));
  const tx = parseFloat(layer.dataset.tx || '0') || 0; // translateX applied to layer
  const ty = parseFloat(layer.dataset.ty || '0') || 0;
  const focusX = -tx + (overlay?.clientWidth || layerW) / 2;
  const focusY = -ty + (overlay?.clientHeight || layerH) / 2;
  const sampleCentered = (focus, len, spread) => {
    const v = focus + gaussianRand() * spread;
    return Math.min(len - padding, Math.max(padding, v));
  };
  const radii = Array.from({ length: clusters }).map(() => (18 + Math.random() * 72) * (0.8 + Math.random() * 0.6) * diffusion);
  const centers = Array.from({ length: clusters }).map((_, i) => {
    const r = radii[i];
    const angle = Math.random() * Math.PI * 2;
    const cx = sampleCentered(focusX + Math.cos(angle) * r, layerW, layerW / 7);
    const cy = sampleCentered(focusY + Math.sin(angle) * r, layerH, layerH / 7);
    return { x: cx, y: cy, jitter: (5 + Math.random() * 24) * (0.8 + Math.random() * 0.8) * diffusion };
  });
  const total = Math.max(2000, Math.round(2600 * (0.7 + diffusion * 0.5)));
  const placed = [];
  const pickWord = () => WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)];
  const estWidth = (text, size) => text.length * size * 0.55;
  const boxPad = 6; // extra spacing to avoid overlap with padding/border
  for (let i = 0; i < total; i++) {
    const center = centers[i % clusters];
    let attempts = 0;
    let placedWord = null;
    const text = pickWord();
    while (attempts < 220 && !placedWord) {
      const jitter = () => gaussianRand() * centers[i % clusters].jitter;
      const size = 12 + Math.random() * 16;
      const w = estWidth(text, size) + boxPad * 2;
      const h = size * 1.1 + boxPad * 2;
      let x = center.x + jitter();
      let y = center.y + jitter();
      x = Math.max(padding, Math.min(layerW - padding - w, x));
      y = Math.max(padding, Math.min(layerH - padding - h, y));
      const candidate = { left: x, top: y, right: x + w, bottom: y + h, size };
      const overlaps = placed.some(p => !(candidate.right < p.left || candidate.left > p.right || candidate.bottom < p.top || candidate.top > p.bottom));
      if (!overlaps) {
        placedWord = candidate;
      } else {
        // slight shrink to improve packing
        center.x += (Math.random() - 0.5) * 6;
        center.y += (Math.random() - 0.5) * 6;
      }
      attempts++;
    }
    if (!placedWord) continue;
    const word = document.createElement('span');
    word.className = 'wordcloud-word';
    word.textContent = text;
    word.dataset.size = placedWord.size.toString();
    word.style.left = `${placedWord.left}px`;
    word.style.top = `${placedWord.top}px`;
    word.style.fontSize = `${placedWord.size}px`;
    layer.appendChild(word);
    placed.push(placedWord);
  }
}

function attachWordCloudDrags(layer) {
  if (!layer) return;
  const words = layer.querySelectorAll('.wordcloud-word');
  words.forEach(word => {
    word.style.pointerEvents = 'auto';
    word.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = word.getBoundingClientRect();
      wordCloudDrag = {
        pointerId: e.pointerId,
        word,
        text: word.textContent || '',
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        overlay: layer.closest('.wordcloud-overlay')
      };
      const ghost = document.createElement('div');
      ghost.textContent = wordCloudDrag.text;
      const styles = getComputedStyle(word);
      ghost.style.position = 'fixed';
      ghost.style.left = `${e.clientX - wordCloudDrag.offsetX}px`;
      ghost.style.top = `${e.clientY - wordCloudDrag.offsetY}px`;
      ghost.style.color = styles.color;
      ghost.style.fontSize = styles.fontSize;
      ghost.style.fontFamily = styles.fontFamily;
      ghost.style.fontWeight = styles.fontWeight;
      ghost.style.whiteSpace = 'nowrap';
      ghost.style.padding = styles.padding;
      ghost.style.borderRadius = styles.borderRadius;
      ghost.style.background = styles.backgroundColor || '#f1f1f3';
      ghost.style.lineHeight = styles.lineHeight;
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = 5000;
      ghost.style.transform = styles.transform;
      wordCloudDrag.ghost = ghost;
      document.body.appendChild(ghost);
      word.setPointerCapture(e.pointerId);
      window.addEventListener('pointermove', handleWordCloudMove);
      window.addEventListener('pointerup', handleWordCloudEnd);
      window.addEventListener('pointercancel', handleWordCloudEnd);
    });
  });
}

function handleWordCloudMove(e) {
  if (!wordCloudDrag || e.pointerId !== wordCloudDrag.pointerId) return;
  const ghost = wordCloudDrag.ghost;
  if (!ghost) return;
  e.preventDefault();
  ghost.style.left = `${e.clientX - wordCloudDrag.offsetX}px`;
  ghost.style.top = `${e.clientY - wordCloudDrag.offsetY}px`;
}

function handleWordCloudEnd(e) {
  if (!wordCloudDrag || (e.pointerId && e.pointerId !== wordCloudDrag.pointerId)) return;
  const { ghost, word, text, overlay } = wordCloudDrag;
  if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
  if (word && word.hasPointerCapture && word.hasPointerCapture(wordCloudDrag.pointerId)) {
    word.releasePointerCapture(wordCloudDrag.pointerId);
  }
  e.preventDefault();
  window.removeEventListener('pointermove', handleWordCloudMove);
  window.removeEventListener('pointerup', handleWordCloudEnd);
  window.removeEventListener('pointercancel', handleWordCloudEnd);

  const bigboy = overlay?.closest('.bigboy');
  const insideBigboy = (() => {
    if (!bigboy) return false;
    const r = bigboy.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  })();

  if (!insideBigboy && text) {
    const stageRect = stage.getBoundingClientRect();
    const sx = (e.clientX - stageRect.left) / scale;
    const sy = (e.clientY - stageRect.top) / scale;
    const nx = sx - TEXT_NODE_DIMENSIONS.width / 2;
    const ny = sy - TEXT_NODE_DIMENSIONS.height / 2;
    const node = createTextQueryNode(nx, ny);
    if (node) {
      const input = node.querySelector('.text-node-input');
      if (input) {
        node.dataset.textActivated = 'true';
        input.textContent = text;
        updateTextNodeWidth(node);
        updateTextNodeColor(input);
      }
    }
  }
  wordCloudDrag = null;
}

function sizeWordCloudLayer(overlay, layer) {
  if (!overlay || !layer) return;
  const w = overlay.clientWidth * 2.5;
  const h = overlay.clientHeight * 2.5;
  layer.style.width = `${w}px`;
  layer.style.height = `${h}px`;
}

function centerWordCloudLayer(overlay, layer) {
  if (!overlay || !layer) return;
  const w = layer.offsetWidth;
  const h = layer.offsetHeight;
  const vw = overlay.clientWidth;
  const vh = overlay.clientHeight;
  const x = -(w - vw) / 2;
  const y = -(h - vh) / 2;
  setWordCloudOffset(overlay, layer, x, y);
}

function setWordCloudOffset(overlay, layer, x, y) {
  if (!overlay || !layer) return;
  const maxX = 0;
  const maxY = 0;
  const minX = overlay.clientWidth - layer.offsetWidth;
  const minY = overlay.clientHeight - layer.offsetHeight;
  const clampedX = Math.min(maxX, Math.max(minX, x));
  const clampedY = Math.min(maxY, Math.max(minY, y));
  layer.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  layer.dataset.tx = clampedX;
  layer.dataset.ty = clampedY;
}

function initWordCloudPan(overlay, layer) {
  if (!overlay || !layer) return;
  overlay.addEventListener('pointerdown', e => {
    if (e.button !== 2) return;
    e.preventDefault();
    const tx = parseFloat(layer.dataset.tx || '0') || 0;
    const ty = parseFloat(layer.dataset.ty || '0') || 0;
    wordCloudPan = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: tx,
      baseY: ty,
      overlay,
      layer
    };
    overlay.setPointerCapture(e.pointerId);
  });

  overlay.addEventListener('pointermove', e => {
    if (!wordCloudPan || e.pointerId !== wordCloudPan.pointerId) return;
    e.preventDefault();
    const dx = (e.clientX - wordCloudPan.startX) / scale;
    const dy = (e.clientY - wordCloudPan.startY) / scale;
    setWordCloudOffset(wordCloudPan.overlay, wordCloudPan.layer, wordCloudPan.baseX + dx, wordCloudPan.baseY + dy);
  });

  const endPan = e => {
    if (!wordCloudPan || (e && e.pointerId && e.pointerId !== wordCloudPan.pointerId)) return;
    if (wordCloudPan.overlay.hasPointerCapture && wordCloudPan.overlay.hasPointerCapture(wordCloudPan.pointerId)) {
      wordCloudPan.overlay.releasePointerCapture(wordCloudPan.pointerId);
    }
    wordCloudPan = null;
  };
  overlay.addEventListener('pointerup', endPan);
  overlay.addEventListener('pointercancel', endPan);
}

function getVisibilityCount(total, val) {
  if (total <= 0) return 0;
  if (val >= 1) return 0;
  const ratio = 1 - Math.pow(val, 2.5); // slower drop initially, steep near 1
  return Math.max(0, Math.floor(total * ratio));
}

function generateThumbnails(items) {
  const tasks = items.map(item => createThumb(item).catch(() => null));
  return Promise.all(tasks);
}

function attachBrowserHoverPreview() {
  const vids = document.querySelectorAll('.browser-thumb-video');
  vids.forEach(v => {
    v.addEventListener('mouseenter', () => {
      if (!v.src || v.src === window.location.href) {
        const dataSrc = v.getAttribute('data-src');
        if (dataSrc) v.src = dataSrc;
      }
      v.play().catch(() => {});
    });
    v.addEventListener('mouseleave', () => {
      v.pause();
      v.currentTime = 0;
    });
  });
}

function createThumb(item) {
  if (!item || !item.file) return Promise.resolve(null);
  const isVideo = item.isVideo;
  const url = item.url;
  const targetW = 150;
  const targetH = 84;
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    const finish = () => {
      try {
        item.thumb = canvas.toDataURL('image/jpeg', 0.82);
      } catch (err) {
        item.thumb = url;
      }
      resolve(item.thumb);
    };
    if (!ctx) return finish();

    const drawCover = (w, h, render) => {
      const scale = Math.max(targetW / w, targetH / h);
      const dw = w * scale;
      const dh = h * scale;
      const dx = (targetW - dw) / 2;
      const dy = (targetH - dh) / 2;
      render({ dx, dy, dw, dh });
      finish();
    };

    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      video.muted = true;
      video.addEventListener('loadeddata', () => {
        video.currentTime = Math.min(0.1, video.duration || 0);
      }, { once: true });
      video.addEventListener('seeked', () => {
        drawCover(video.videoWidth, video.videoHeight, rect => {
          ctx.drawImage(video, rect.dx, rect.dy, rect.dw, rect.dh);
        });
      }, { once: true });
      video.addEventListener('error', finish, { once: true });
    } else {
      const img = new Image();
      img.onload = () => {
        drawCover(img.naturalWidth, img.naturalHeight, rect => {
          ctx.drawImage(img, rect.dx, rect.dy, rect.dw, rect.dh);
        });
      };
      img.onerror = finish;
      img.src = url;
    }
  });
}

function applyWordCloudFilter(overlay, val) {
  if (!overlay) return;
  const layer = overlay.querySelector('.wordcloud-layer');
  if (!layer) return;
  const words = Array.from(layer.querySelectorAll('.wordcloud-word'));
  if (!words.length) return;
  const keep = getVisibilityCount(words.length, val);
  words.forEach((w, idx) => {
    const show = idx < keep;
    w.style.opacity = show ? '1' : '0';
    w.style.pointerEvents = show ? 'auto' : 'none';
  });
  if (!wordCloudActive) renderBrowserList();
}

function initWordCloudSlider(slider, overlay) {
  if (!slider || !overlay) return;
  const percentEl = slider.querySelector('.slider-percent');
  wordCloudPercentEl = percentEl;
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const updateFromValue = val => {
    wordCloudSliderValue = clamp01(val);
    updateWordCloudSlider(slider, overlay, wordCloudSliderValue, percentEl);
  };
  updateFromValue(wordCloudSliderValue);

  let dragging = null;
  slider.addEventListener('pointerdown', e => {
    const baseEl = slider.closest('.bigboy')?.querySelector('.bigboy-base');
    const rect = baseEl ? baseEl.getBoundingClientRect() : overlay.getBoundingClientRect();
    const currentTop = parseFloat(slider.style.top || '0') || 0;
    const relY = (e.clientY - rect.top) / scale;
    dragging = {
      pointerId: e.pointerId,
      offsetY: relY - currentTop,
      rect
    };
    slider.classList.add('dragging');
    slider.setPointerCapture(e.pointerId);
  });
  slider.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const rect = dragging.rect;
    const total = rect.height / scale;
    let y = (e.clientY - rect.top) / scale - dragging.offsetY;
    y = Math.max(0, Math.min(total, y));
    const val = 1 - (y / Math.max(1, total));
    updateFromValue(val);
  });
  const endDrag = e => {
    if (!dragging || (e && e.pointerId !== dragging.pointerId)) return;
    slider.classList.remove('dragging');
    slider.releasePointerCapture(dragging.pointerId);
    dragging = null;
  };
  slider.addEventListener('pointerup', endDrag);
  slider.addEventListener('pointercancel', endDrag);
}

function updateWordCloudSlider(slider, overlay, val, percentEl) {
  if (!slider || !overlay) return;
  const baseEl = slider.closest('.bigboy')?.querySelector('.bigboy-base');
  const rect = baseEl ? baseEl.getBoundingClientRect() : overlay.getBoundingClientRect();
  const track = rect.height / scale - slider.offsetHeight;
  const y = track * (1 - val);
  slider.style.top = `${y}px`;
  const pct = Math.round(val * 100);
  if (percentEl) percentEl.textContent = `${pct.toString().padStart(2, '0')}%`;
  applyWordCloudFilter(overlay, getEffectiveVisibility());
  if (!wordCloudActive) {
    renderBrowserList();
  }
}

function createImageQueryNode(x, y) {
  const el = document.createElement('div');
  el.className = 'node node-image-query';
  el.dataset.width = NODE_DIMENSIONS.width;
  el.dataset.height = NODE_DIMENSIONS.height;
  const placed = resolveOverlapRect({ x, y, w: NODE_DIMENSIONS.width, h: NODE_DIMENSIONS.height });
  el.style.left = `${placed.x}px`;
  el.style.top = `${placed.y}px`;
  el.innerHTML = `
    <div class="node-shell" data-shell-locked="false">
      <div class="node-shell-inner"></div>
    </div>
    <svg class="node-droplet" viewBox="0 0 39 26" aria-hidden="true">
      <path d="${DROPLET_PATH}"></path>
    </svg>
    <div class="node-link" aria-hidden="true"></div>
    <img class="node-arrow" src="assets/node-arrow.svg" alt="" />
    <div class="node-handle" aria-hidden="true"></div>
    <div class="node-header">
      <div class="node-title">
        <img src="assets/node-search.svg" alt="" />
        <span>Image Query</span>
      </div>
      <button class="node-close" type="button" aria-label="Close node">
        <img src="assets/node-close.svg" alt="" />
      </button>
    </div>
    <div class="node-body">
      <div class="node-upload-hit" aria-label="Upload area"></div>
      <img class="node-upload-preview" alt="Preview" />
      <img class="node-upload-icon" src="assets/node-upload.svg" alt="Upload image" />
    </div>
    <div class="node-footer">
      <span class="node-footer-label">on</span>
      <button class="node-toggle" type="button" data-state="on" aria-pressed="true">
        <span class="node-toggle-dot"></span>
      </button>
    </div>
    <div class="node-code-panel" aria-hidden="true">
      <pre class="node-code-pre"></pre>
    </div>
  `;
  nodesLayer.appendChild(el);
  const shell = el.querySelector('.node-shell');
  registerShellPaths(el, SHELL_PATH_BASE, SHELL_PATH_FULL);
  applyShellPath(shell, SHELL_PATH_BASE);
  const arrow = el.querySelector('.node-arrow');
  if (arrow) {
    arrow.addEventListener('dblclick', () => resetArrowVisual(el));
  }
  if (arrow) {
    const base = measureArrowBase(el, arrow);
    arrow.dataset.baseX = base.x.toString();
    arrow.dataset.baseY = base.y.toString();
  }
  initUpload(el);
  initCodePanel(el);
  return el;
}

function createExporterNode(x, y) {
  const dims = EXPORTER_DIMENSIONS;
  const placed = resolveOverlapRect({ x, y, w: dims.width, h: dims.height });
  const el = document.createElement('div');
  el.className = 'node node-exporter';
  el.dataset.width = dims.width;
  el.dataset.height = dims.height;
  el.style.left = `${placed.x}px`;
  el.style.top = `${placed.y}px`;
  el.innerHTML = `
    <div class="node-shell" data-shell-locked="true"></div>
    <svg class="node-droplet" viewBox="0 0 39 26" aria-hidden="true">
      <path d="${DROPLET_PATH}"></path>
    </svg>
    <div class="node-link" aria-hidden="true"></div>
    <img class="node-arrow" src="${EXPORTER_ARROW_SRC}" alt="" />
    <div class="node-handle" aria-hidden="true"></div>
    <div class="node-footer">
      <span class="export-run">run</span>
    </div>
    <div class="node-body"></div>
    <div class="node-header">
      <div class="node-title">
        <img src="assets/Export.svg" alt="" />
        <span>Excel Exporter</span>
      </div>
      <button class="node-close" type="button" aria-label="Close node">
        <img src="assets/node-close.svg" alt="">
      </button>
    </div>
    <div class="node-code-panel" aria-hidden="true">
      <pre class="node-code-pre"></pre>
    </div>
  `;
  nodesLayer.appendChild(el);
  const shell = el.querySelector('.node-shell');
  if (shell) {
    shell.style.width = `${EXPORTER_SHELL.width}px`;
    shell.style.height = `${EXPORTER_SHELL.height}px`;
    shell.style.backgroundImage = 'url("assets/XLSXExporterShell.svg")';
    shell.style.backgroundRepeat = 'no-repeat';
    shell.style.backgroundSize = 'contain';
    shell.dataset.shellLocked = 'false';
    updateExporterShellAsset(shell, false);
  }
  const arrow = el.querySelector('.node-arrow');
  if (arrow) {
    const base = measureArrowBase(el, arrow);
    arrow.dataset.baseX = base.x.toString();
    arrow.dataset.baseY = base.y.toString();
  }
  const run = el.querySelector('.export-run');
  if (run) run.addEventListener('click', () => run.classList.toggle('active'));

  initCodePanel(el);
  return el;
}

function updateTextNodeWidth(node) {
  if (!node) return;
  const input = node.querySelector('.text-node-input');
  if (!input) return;
  const textRaw = input.textContent || '';
  const nodeActivated = node.dataset.textActivated === 'true';
  const hasContent = textRaw.trim().length > 0;
  const text = hasContent ? textRaw : (input.dataset.placeholder || '');
  const baseWidth = measureTextWidth(text);
  const padding = 24 * 2; // left + right
  const extra = 32; // breathing room for arrow/toggles
  const nextWidth = Math.max(TEXT_NODE_DIMENSIONS.width, baseWidth + padding + extra);
  node.style.width = `${nextWidth}px`;
  node.dataset.width = nextWidth;
}

function updateTextNodeColor(inputEl) {
  if (!inputEl) return;
  const node = inputEl.closest('.node');
  const activated = node?.dataset.textActivated === 'true';
  inputEl.style.color = activated ? '#f1f1f3' : '#5e6060';
}

function placeCursorAtEnd(el) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function stopDateEdit(node) {
  if (!node) return;
  const parts = node.querySelectorAll('.date-part');
  parts.forEach(p => {
    p.setAttribute('contenteditable', 'false');
    sanitizeDatePart(p);
  });
  node.dataset.dateEditing = 'false';
  updateDatePartColors(node);
  if (activeDateEditNode === node) activeDateEditNode = null;
}

function startDateEdit(node, part) {
  if (!node) return;
  if (activeDateEditNode && activeDateEditNode !== node) {
    stopDateEdit(activeDateEditNode);
  }
  activeDateEditNode = node;
  node.dataset.dateEditing = 'true';
  node.dataset.dateActivated = 'true';
  const parts = node.querySelectorAll('.date-part');
  parts.forEach(p => {
    p.setAttribute('contenteditable', 'true');
    p.dataset.active = 'true';
    sanitizeDatePart(p);
  });
  updateDatePartColors(node);
  focusDatePart(part || parts[0]);
}

function handleDateKeydown(e, node, part) {
  const parts = Array.from(node.querySelectorAll('.date-part'));
  const idx = parts.indexOf(part);
  if (idx === -1) return;
  const moveTo = nextIdx => {
    if (nextIdx >= 0 && nextIdx < parts.length) {
      e.preventDefault();
      focusDatePart(parts[nextIdx]);
    }
  };
  if (e.key === 'ArrowRight') {
    moveTo(idx + 1);
  } else if (e.key === 'ArrowLeft') {
    moveTo(idx - 1);
  } else if (e.key === 'Tab') {
    moveTo(idx + (e.shiftKey ? -1 : 1));
  } else if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault();
    stopDateEdit(node);
  }
}

function applyDateFieldInlineStyles(node) {
  const applyOne = (field, isRight) => {
    if (!field) return;
    field.style.position = 'absolute';
    field.style.width = '164px';
    field.style.height = '71px';
    field.style.top = '26px';
    field.style.left = isRight ? '' : '3px';
    field.style.right = isRight ? '3px' : '';
    field.style.background = '#1b1b1b';
    field.style.borderRadius = '9px';
    field.style.boxSizing = 'border-box';
    field.style.overflow = 'hidden';
    field.style.zIndex = '3';
    const label = field.querySelector('.date-label');
    if (label) {
      label.style.position = 'absolute';
      label.style.top = '4px';
      label.style.left = '6px';
      label.style.fontFamily = '"Atkinson Hyperlegible","Segoe UI","Microsoft YaHei",sans-serif';
      label.style.fontSize = '13px';
      label.style.fontWeight = '400';
      label.style.color = '#d9d9d9';
      label.style.lineHeight = '1';
      label.style.zIndex = '4';
    }
    const input = field.querySelector('.date-input');
    if (input) {
      input.style.position = 'absolute';
      input.style.top = '29px';
      input.style.left = '13px';
      input.style.right = '20px';
      input.style.display = 'flex';
      input.style.alignItems = 'center';
      input.style.gap = '4px';
      input.style.fontFamily = '"Atkinson Hyperlegible","Segoe UI","Microsoft YaHei",sans-serif';
      input.style.fontSize = '20px';
      input.style.fontWeight = '400';
      input.style.color = '#5e6060';
      input.style.lineHeight = '1.2';
      input.style.zIndex = '4';
      input.style.pointerEvents = 'none';
      input.style.direction = 'ltr';
      input.style.textAlign = 'left';
    }
    field.querySelectorAll('.date-part').forEach(part => {
      part.style.background = 'transparent';
      part.style.border = 'none';
      part.style.padding = '0';
      part.style.margin = '0';
      part.style.outline = 'none';
      part.style.color = 'inherit';
      part.style.pointerEvents = 'auto';
      part.style.direction = 'ltr';
      part.style.textAlign = 'left';
    });
    field.querySelectorAll('.date-sep').forEach(sep => {
      sep.style.color = '#d9d9d9';
    });
  };
  applyOne(node.querySelector('.date-field-from'), false);
  applyOne(node.querySelector('.date-field-to'), true);
}

function applyDateConnectorColor(node) {
  if (!node || !node.classList.contains('node-date-filter')) return;
  const dropletPath = node.querySelector('.node-droplet path');
  const link = node.querySelector('.node-link');
  const handle = node.querySelector('.node-handle');
  if (dropletPath) dropletPath.setAttribute('fill', '#f1f1f3');
  if (link) link.style.background = '#f1f1f3';
  if (handle) handle.style.background = '#f1f1f3';
}

function initDateFields(node) {
  const fields = node.querySelectorAll('.date-input');
  fields.forEach(field => {
    const parts = field.querySelectorAll('.date-part');
    field.addEventListener('dblclick', e => {
      e.stopPropagation();
      startDateEdit(node, e.target.closest('.date-part') || parts[0]);
    });
    parts.forEach(p => {
      sanitizeDatePart(p);
      p.addEventListener('pointerdown', e => e.stopPropagation());
      p.addEventListener('dblclick', e => {
        e.stopPropagation();
        startDateEdit(node, p);
      });
      p.addEventListener('keydown', e => handleDateKeydown(e, node, p));
      p.addEventListener('input', () => {
        sanitizeDatePart(p);
        focusDatePart(p); // keep caret at end so digits append in order
      });
    });
  });
  updateDatePartColors(node);
}
function sanitizeDatePart(part) {
  const maxLen = parseInt(part.dataset.len || '2', 10) || 2;
  const placeholder = part.dataset.placeholder || '';
  let text = (part.textContent || '').replace(/\D+/g, '');
  if (text.length > maxLen) text = text.slice(0, maxLen);
  if (!text) {
    part.textContent = placeholder;
    part.dataset.empty = 'true';
  } else {
    part.textContent = text;
    part.dataset.empty = 'false';
  }
}

function updateDatePartColors(node) {
  if (!node) return;
  const activated = node.dataset.dateActivated === 'true';
  const parts = node.querySelectorAll('.date-part');
  parts.forEach(p => {
    p.style.color = activated ? '#f1f1f3' : '#5e6060';
  });
}

function focusDatePart(part) {
  if (!part) return;
  const range = document.createRange();
  range.selectNodeContents(part);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function createTextQueryNode(x, y) {
  const dims = TEXT_NODE_DIMENSIONS;
  const placed = resolveOverlapRect({ x, y, w: dims.width, h: dims.height });
  const el = document.createElement('div');
  el.className = 'node node-text-query';
  el.dataset.width = dims.width;
  el.dataset.height = dims.height;
  el.style.left = `${placed.x}px`;
  el.style.top = `${placed.y}px`;
  el.style.width = `${dims.width}px`;
  el.style.height = `${dims.height}px`;
  el.innerHTML = `
    <div class="node-shell text-shell" data-shell-locked="false">
      <div class="node-shell-inner text-shell-inner"></div>
    </div>
    <svg class="node-droplet" viewBox="0 0 39 26" aria-hidden="true">
      <path d="${DROPLET_PATH}"></path>
    </svg>
    <div class="node-link" aria-hidden="true"></div>
    <svg class="node-arrow node-arrow-text" viewBox="0 0 21 21" aria-hidden="true">
      <path d="M18.1716 20.1758H2C0.895431 20.1758 0 19.2804 0 18.1758V2.00421C0 0.222399 2.15428 -0.669935 3.41421 0.589995L19.5858 16.7616C20.8457 18.0215 19.9534 20.1758 18.1716 20.1758Z" fill="#467FC6"></path>
    </svg>
    <div class="node-handle" aria-hidden="true"></div>
    <div class="node-header">
      <div class="node-title">
        <img src="assets/node-search.svg" alt="" />
        <span>Text Query</span>
      </div>
      <button class="node-close" type="button" aria-label="Close node">
        <img src="assets/node-close.svg" alt="" />
      </button>
    </div>
    <div class="text-node-body">
      <div class="text-node-input" contenteditable="true" spellcheck="false" data-placeholder="Type in something to search">Type in something to search</div>
    </div>
    <div class="node-footer">
      <span class="node-footer-label">on</span>
      <button class="node-toggle" type="button" data-state="on" aria-pressed="true">
        <span class="node-toggle-dot"></span>
      </button>
    </div>
    <div class="node-code-panel" aria-hidden="true">
      <pre class="node-code-pre"></pre>
    </div>
  `;
  nodesLayer.appendChild(el);
  const shell = el.querySelector('.node-shell');
  registerShellPaths(el, TEXT_SHELL_BASE, TEXT_SHELL_FULL);
  applyShellPath(shell, TEXT_SHELL_BASE);
  updateTextShellAsset(shell, false);
  const arrow = el.querySelector('.node-arrow');
  if (arrow) {
    arrow.addEventListener('dblclick', () => resetArrowVisual(el));
    const base = measureArrowBase(el, arrow);
    arrow.dataset.baseX = base.x.toString();
    arrow.dataset.baseY = base.y.toString();
  }
  const input = el.querySelector('.text-node-input');
  if (input) {
    const body = el.querySelector('.text-node-body');
    const startEdit = () => {
      el.dataset.textEditing = 'true';
      el.dataset.textActivated = 'true';
      activeTextEditNode = el;
      input.setAttribute('contenteditable', 'true');
      updateTextNodeColor(input);
      input.focus();
      placeCursorAtEnd(input);
    };
    const stopEdit = () => {
      el.dataset.textEditing = 'false';
      input.setAttribute('contenteditable', 'false');
      updateTextNodeWidth(el);
      updateTextNodeColor(input);
      if (activeTextEditNode === el) activeTextEditNode = null;
    };
    if (body) {
      body.addEventListener('dblclick', e => {
        e.stopPropagation();
        startEdit();
      });
    }
    // prevent drag on click but allow focus on double-click
    input.addEventListener('pointerdown', e => e.stopPropagation());
    input.addEventListener('dblclick', e => {
      e.stopPropagation();
      startEdit();
    });
    input.addEventListener('keydown', e => e.stopPropagation());
    input.addEventListener('input', () => {
      updateTextNodeWidth(el);
      updateTextNodeColor(input);
    });
    input.addEventListener('blur', () => stopEdit());
  updateTextNodeColor(input);
  // start as non-editable placeholder until double-click
  input.setAttribute('contenteditable', 'false');
}
updateTextNodeWidth(el);
  initCodePanel(el);
  return el;
}

function createFolderNode(x, y) {
  const dims = FOLDER_DIMENSIONS;
  const placed = resolveOverlapRect({ x, y, w: dims.width, h: dims.height });
  const el = document.createElement('div');
  el.className = 'node node-folder';
  el.dataset.width = dims.width;
  el.dataset.height = dims.height;
  el.style.left = `${placed.x}px`;
  el.style.top = `${placed.y}px`;
  el.innerHTML = `
    <div class="node-shell" data-shell-locked="false">
      <div class="node-shell-inner"></div>
    </div>
    <svg class="node-droplet" viewBox="0 0 39 26" aria-hidden="true">
      <path d="${DROPLET_PATH}"></path>
    </svg>
    <div class="node-link" aria-hidden="true"></div>
    <img class="node-arrow" src="assets/folder-arrow.svg" alt="" />
    <div class="node-handle" aria-hidden="true"></div>
    <div class="node-header">
      <div class="node-title">
        <img src="assets/node-folder.svg" alt="" />
        <span>Folder Filter</span>
      </div>
      <button class="node-close" type="button" aria-label="Close node">
        <img src="assets/node-close.svg" alt="" />
      </button>
    </div>
    <div class="node-body">
      <div class="folder-tree"></div>
    </div>
    <div class="node-footer">
      <span class="node-footer-label">on</span>
      <button class="node-toggle" type="button" data-state="on" aria-pressed="true">
        <span class="node-toggle-dot"></span>
      </button>
    </div>
    <div class="node-code-panel" aria-hidden="true">
      <pre class="node-code-pre"></pre>
    </div>
  `;
  nodesLayer.appendChild(el);
  const shell = el.querySelector('.node-shell');
  registerShellPaths(el, FOLDER_SHELL_BASE, FOLDER_SHELL_FULL);
  applyShellPath(shell, FOLDER_SHELL_BASE);
  const arrow = el.querySelector('.node-arrow');
  if (arrow) {
    arrow.addEventListener('dblclick', () => resetArrowVisual(el));
    const base = measureArrowBase(el, arrow);
    arrow.dataset.baseX = base.x.toString();
    arrow.dataset.baseY = base.y.toString();
  }
  initCodePanel(el);
  return el;
}

function createDateFilterNode(x, y) {
  const dims = DATE_NODE_DIMENSIONS;
  const placed = resolveOverlapRect({ x, y, w: dims.width, h: dims.height });
  const el = document.createElement('div');
  el.className = 'node node-date-filter';
  el.dataset.width = dims.width;
  el.dataset.height = dims.height;
  el.style.left = `${placed.x}px`;
  el.style.top = `${placed.y}px`;
  el.style.width = `${dims.width}px`;
  el.style.height = `${dims.height}px`;
  el.innerHTML = `
    <div class="node-shell" data-shell-locked="false">
      <div class="node-shell-inner"></div>
    </div>
    <svg class="node-droplet" viewBox="0 0 39 26" aria-hidden="true">
      <path d="${DROPLET_PATH}"></path>
    </svg>
    <div class="node-link" aria-hidden="true"></div>
    <svg class="node-arrow node-arrow-date" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M20.5858 21.5879H1C0.447715 21.5879 0 21.1402 0 20.5879V1.0021C0 0.111199 1.07714 -0.334966 1.70711 0.294999L21.2929 19.8808C21.9229 20.5107 21.4767 21.5879 20.5858 21.5879Z" fill="#F1F1F3"></path>
    </svg>
    <div class="node-handle" aria-hidden="true"></div>
    <div class="node-header">
      <div class="node-title">
        <img src="assets/node-folder.svg" alt="" />
        <span>Date Filter</span>
      </div>
      <button class="node-close" type="button" aria-label="Close node">
        <img src="assets/node-close.svg" alt="" />
      </button>
    </div>
    <div class="date-field date-field-from">
      <div class="date-label">from</div>
      <div class="date-input" data-field="from">
        <span class="date-part year" data-len="4" data-placeholder="YYYY">YYYY</span>
        <span class="date-sep">/</span>
        <span class="date-part month" data-len="2" data-placeholder="MM">MM</span>
        <span class="date-sep">/</span>
        <span class="date-part day" data-len="2" data-placeholder="DD">DD</span>
      </div>
    </div>
    <div class="date-field date-field-to">
      <div class="date-label">to</div>
      <div class="date-input" data-field="to">
        <span class="date-part year" data-len="4" data-placeholder="YYYY">YYYY</span>
        <span class="date-sep">/</span>
        <span class="date-part month" data-len="2" data-placeholder="MM">MM</span>
        <span class="date-sep">/</span>
        <span class="date-part day" data-len="2" data-placeholder="DD">DD</span>
      </div>
    </div>
    <div class="node-footer">
      <span class="node-footer-label">on</span>
      <button class="node-toggle" type="button" data-state="on" aria-pressed="true">
        <span class="node-toggle-dot"></span>
      </button>
    </div>
    <div class="node-code-panel" aria-hidden="true">
      <pre class="node-code-pre"></pre>
    </div>
  `;
  nodesLayer.appendChild(el);
  const shell = el.querySelector('.node-shell');
  registerShellPaths(el, DATE_SHELL_BASE, DATE_SHELL_FULL);
  applyShellPath(shell, DATE_SHELL_BASE);
  if (shell) {
    shell.style.width = `${dims.width}px`;
    shell.style.height = `${DATE_SHELL_HEIGHT}px`;
    shell.style.top = '22px';
    shell.style.left = '0px';
    const inner = shell.querySelector('.node-shell-inner');
    if (inner) {
      inner.style.display = 'none';
      inner.style.opacity = '0';
      inner.style.pointerEvents = 'none';
    }
  }
  const arrow = el.querySelector('.node-arrow');
  if (arrow) {
    arrow.addEventListener('dblclick', () => resetArrowVisual(el));
    const base = measureArrowBase(el, arrow);
    arrow.dataset.baseX = base.x.toString();
    arrow.dataset.baseY = base.y.toString();
    arrow.style.left = '1px';
    arrow.style.bottom = '2px';
  }
  applyDateFieldInlineStyles(el);
  applyDateConnectorColor(el);
  initDateFields(el);
  initCodePanel(el);
  return el;
}

function renderBrowserList() {
  const list = document.querySelector('.browser-list');
  if (!list) return;
  if (!browserItems.length) {
    list.innerHTML = '';
    return;
  }
  const eff = getEffectiveVisibility();
  const keepCount = getVisibilityCount(browserItems.length, eff);
  const maxCount = Math.min(browserRevealCount, browserItems.length);
  const renderItems = browserItems.slice(0, Math.min(keepCount, maxCount));
  if (!renderItems.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = renderItems.map((item, idx) => {
    const isVideo = item.isVideo;
    const thumbSrc = item.thumb || item.url;
    let thumb = `<div class="browser-thumb"></div>`;
    if (thumbSrc) {
      if (isVideo && browserPreviewEnabled) {
        thumb = `<video class="browser-thumb browser-thumb-video" data-src="${item.url}" poster="${item.thumb || ''}" muted preload="none"></video>`;
      } else {
        thumb = `<img class="browser-thumb" src="${thumbSrc}" alt="${item.name}" loading="lazy" />`;
      }
    }
    const col = idx % 4;
    return `
      <div class="browser-item" data-col="${col}">
        ${thumb}
        <div class="browser-name">${item.name}</div>
        <div class="browser-ext">${item.ext}</div>
      </div>
    `;
  }).join('');
  if (browserPreviewEnabled) attachBrowserHoverPreview();
  attachBrowserViewerClicks(renderItems);
}

function toggleNodeState(toggleEl) {
  const isOn = toggleEl.dataset.state !== 'off';
  const label = toggleEl.parentElement.querySelector('.node-footer-label');
  const node = toggleEl.closest('.node');
  if (isOn) {
    toggleEl.dataset.state = 'off';
    toggleEl.setAttribute('aria-pressed', 'false');
    if (label) {
      label.textContent = 'off';
      label.classList.add('off');
    }
    if (node) node.classList.add('node-off');
  } else {
    toggleEl.dataset.state = 'on';
    toggleEl.setAttribute('aria-pressed', 'true');
    if (label) {
      label.textContent = 'on';
      label.classList.remove('off');
    }
    if (node) node.classList.remove('node-off');
  }
}

function closeVideoViewer(viewer, sourceEl) {
  endViewerShot(viewer);
  if (viewer && viewer.parentNode) viewer.parentNode.removeChild(viewer);
  if (sourceEl) sourceEl.classList.remove('viewer-source-active');
  syncVideoViewerBackdrop();
}

function syncVideoViewerBackdrop() {
  if (!videoViewerBackdrop) return;
  const anyOverlay = overlayLayer?.querySelector('.video-viewer[data-overlay="true"]');
  videoViewerBackdrop.hidden = !anyOverlay;
}

function clearIndexingVisuals() {
  indexingDots = [];
  indexingLines = [];
  if (indexingDotsWrap && indexingDotsWrap.parentNode) indexingDotsWrap.parentNode.removeChild(indexingDotsWrap);
  if (indexingLinesWrap && indexingLinesWrap.parentNode) indexingLinesWrap.parentNode.removeChild(indexingLinesWrap);
  indexingDotsWrap = null;
  indexingLinesWrap = null;
}

function startIndexingAnimation(files) {
  if (!indexingEl) return;
  const stageRect = stage.getBoundingClientRect();
  clearTimeout(browserRevealTimer);
  browserRevealTimer = null;
  browserRevealCount = files.length;
  clearIndexingVisuals();
  renderBrowserList();
}

function updateIndexingLines(keepCount) {
  // dots/lines animation disabled
}

function endViewerShot(viewer) {
  if (!viewer || !viewer._shotState) return;
  const st = viewer._shotState;
  if (st.overlay && st.overlay.parentNode) st.overlay.parentNode.removeChild(st.overlay);
  if (st.keyHandler) window.removeEventListener('keydown', st.keyHandler);
  viewer._shotState = null;
}

function startViewerShot(viewer, fakeImg) {
  if (!viewer || !fakeImg) return;
  endViewerShot(viewer);
  const body = viewer.querySelector('.video-viewer-body');
  if (!body) return;
  const overlay = document.createElement('div');
  overlay.className = 'viewer-shot-overlay';
  const box = document.createElement('div');
  box.className = 'viewer-shot-box';
  overlay.appendChild(box);
  body.appendChild(overlay);
  const st = {
    overlay,
    box,
    fakeImg,
    body,
    dragging: false,
    rect: null
  };
  viewer._shotState = st;
  const toLocal = e => {
    const r = body.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const draw = () => {
    if (!st.rect) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.style.left = `${st.rect.x}px`;
    box.style.top = `${st.rect.y}px`;
    box.style.width = `${st.rect.w}px`;
    box.style.height = `${st.rect.h}px`;
  };
  const onDown = e => {
    e.preventDefault();
    st.dragging = true;
    const p = toLocal(e);
    st.start = p;
    st.rect = { x: 166, y: 50, w: 551, h: 310 };
    draw();
  };
  const onMove = e => {
    if (!st.dragging) return;
    const p = toLocal(e);
    st.rect = {
      x: Math.min(st.start.x, p.x),
      y: Math.min(st.start.y, p.y),
      w: Math.abs(p.x - st.start.x),
      h: Math.abs(p.y - st.start.y)
    };
    draw();
  };
  const onUp = () => {
    st.dragging = false;
  };
  overlay.addEventListener('pointerdown', onDown);
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointerleave', onUp);
  const keyHandler = e => {
    if (e.key === 'Enter') {
      captureViewerShot(viewer);
    } else if (e.key === 'Escape') {
      endViewerShot(viewer);
    }
  };
  st.keyHandler = keyHandler;
  window.addEventListener('keydown', keyHandler);
  draw();
}

function captureViewerShot(viewer) {
  const st = viewer?._shotState;
  if (!st || !st.rect || !st.fakeImg) return;
  const { rect, fakeImg, body } = st;
  if (rect.w < 1 || rect.h < 1) return;
  const bodyRect = body.getBoundingClientRect();
  const imgRect = fakeImg.getBoundingClientRect();
  const imgInBody = {
    x: imgRect.left - bodyRect.left,
    y: imgRect.top - bodyRect.top,
    w: imgRect.width,
    h: imgRect.height
  };
  const left = Math.max(rect.x, imgInBody.x);
  const top = Math.max(rect.y, imgInBody.y);
  const right = Math.min(rect.x + rect.w, imgInBody.x + imgInBody.w);
  const bottom = Math.min(rect.y + rect.h, imgInBody.y + imgInBody.h);
  if (right <= left || bottom <= top) return;
  const naturalW = fakeImg.naturalWidth || fakeImg.width;
  const naturalH = fakeImg.naturalHeight || fakeImg.height;
  const scaleX = naturalW / imgInBody.w;
  const scaleY = naturalH / imgInBody.h;
  const sx = (left - imgInBody.x) * scaleX;
  const sy = (top - imgInBody.y) * scaleY;
  const sw = (right - left) * scaleX;
  const sh = (bottom - top) * scaleY;
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(fakeImg, sx, sy, sw, sh, 0, 0, sw, sh);
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'viewer-shot.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
  endViewerShot(viewer);
}

function openVideoViewer(item, clickX, clickY, sourceEl, colIdx = 0) {
  ensureVideoViewerElements();
  if (!overlayLayer || !videoViewerBackdrop) return;
  const col = Math.min(3, Math.max(0, colIdx));
  let anchorX = clickX;
  let anchorY = clickY;
  if (sourceEl) {
    const r = sourceEl.getBoundingClientRect();
    anchorX = r.left + r.width / 2;
    anchorY = r.top + r.height / 2;
  }
  const viewer = document.createElement('div');
  viewer.className = 'video-viewer';
  viewer.dataset.overlay = 'true';
  viewer.style.zIndex = 9010 + (++videoViewerCounter);
  viewer.innerHTML = `
    <div class="video-viewer-tab">
      <div class="file-name"></div>
      <div class="file-ext"></div>
    </div>
    <button class="video-viewer-close" type="button" aria-label="Close viewer">
      <img src="assets/tab-close.svg" alt="Close">
    </button>
    <div class="video-viewer-body">
      <img class="video-viewer-fake" src="assets/Fakevideoviewer.png" alt="Video preview" />
      <div class="video-viewer-hover"></div>
      <button class="video-viewer-copy zone-0" type="button" aria-label="Copy file path"></button>
      <button class="video-viewer-copy zone-1" type="button" aria-label="Copy file path"></button>
    </div>
  `;
  const tab = viewer.querySelector('.video-viewer-tab');
  const nameEl = tab?.querySelector('.file-name');
  const extEl = tab?.querySelector('.file-ext');
  if (nameEl) nameEl.textContent = item?.name || '';
  if (extEl) extEl.textContent = item?.ext || '';
  const fakeImg = viewer.querySelector('.video-viewer-fake');
  const hoverZone = viewer.querySelector('.video-viewer-hover');
  const copyBtns = Array.from(viewer.querySelectorAll('.video-viewer-copy'));

  const stageRect = stage.getBoundingClientRect();
  const bb = document.querySelector('.bigboy');
  const bbRect = bb ? bb.getBoundingClientRect() : null;
  const bbWorldX = bbRect ? (bbRect.left - stageRect.left - pos.x) / scale : null;
  const worldX = (anchorX != null ? (anchorX - stageRect.left - pos.x) : (stageRect.width / 2 - pos.x)) / scale;
  const worldY = (anchorY != null ? (anchorY - stageRect.top - pos.y) : (stageRect.height / 2 - pos.y)) / scale;
  const { width, height, tabWidth, tabHeight } = VIDEO_VIEWER_SIZE;
  const tabOffset = VIDEO_VIEWER_TAB_OFFSETS[col] || VIDEO_VIEWER_TAB_OFFSETS[0];
  const posOffset = VIDEO_VIEWER_POS_OFFSETS[col] || VIDEO_VIEWER_POS_OFFSETS[0];

  const baseWX = bbWorldX != null ? bbWorldX : worldX;
  const baseWY = worldY;
  const minX = -200; // allow some movement past left
  const minY = -120;
  let left = baseWX + VIDEO_VIEWER_OFFSET.x + posOffset.x - tabWidth / 2;
  let top = baseWY + VIDEO_VIEWER_OFFSET.y + posOffset.y - tabHeight / 2;
  const maxX = (stageRect.width / scale) - width;
  const maxY = (stageRect.height / scale) - height;
  left = Math.max(minX, Math.min(left, maxX));
  top = Math.max(minY, Math.min(top, maxY));
  viewer.style.left = `${left}px`;
  viewer.style.top = `${top}px`;
  if (tab) {
    let tabLeft = tabOffset.x;
    const minTab = 0;
    const maxTab = VIDEO_VIEWER_SIZE.width - VIDEO_VIEWER_SIZE.tabWidth;
    tabLeft = Math.max(minTab, Math.min(maxTab, tabLeft));
    tab.style.left = `${tabLeft}px`;
    tab.style.top = `${tabOffset.y}px`;
  }
  const closeBtn = viewer.querySelector('.video-viewer-close');
  if (closeBtn) {
    const size = VIDEO_VIEWER_CLOSE_CFG.size;
    const gap = VIDEO_VIEWER_CLOSE_CFG.gap;
    const offsetY = VIDEO_VIEWER_CLOSE_CFG.offsetY;
    closeBtn.style.width = `${size}px`;
    closeBtn.style.height = `${size}px`;
    const tabLeft = parseFloat(tab?.style.left || '0') || 0;
    const tabTop = parseFloat(tab?.style.top || '0') || 0;
    closeBtn.style.left = `${tabLeft + VIDEO_VIEWER_SIZE.tabWidth + gap}px`;
    closeBtn.style.top = `${tabTop + offsetY}px`;
    closeBtn.addEventListener('click', () => closeVideoViewer(viewer, sourceEl));
  }

  if (hoverZone && fakeImg) {
    hoverZone.style.width = `${VIDEO_VIEWER_HOVER_CFG.width}px`;
    hoverZone.style.height = `${VIDEO_VIEWER_HOVER_CFG.height}px`;
    hoverZone.style.left = `${(VIDEO_VIEWER_SIZE.width - VIDEO_VIEWER_HOVER_CFG.width) / 2 + VIDEO_VIEWER_HOVER_CFG.offsetX}px`;
    hoverZone.style.top = `${VIDEO_VIEWER_HOVER_CFG.offsetY}px`;
    const origSrc = fakeImg.src;
    const hoverSrc = 'assets/FakevideovierHover.png';
    hoverZone.addEventListener('mouseenter', () => { fakeImg.src = hoverSrc; });
    hoverZone.addEventListener('mouseleave', () => { fakeImg.src = origSrc; });
  }
  if (copyBtns.length) {
    copyBtns.forEach((btn, idx) => {
      const cfg = VIDEO_VIEWER_COPY_ZONES[idx] || VIDEO_VIEWER_COPY_ZONES[0];
      btn.style.width = `${cfg.width}px`;
      btn.style.height = `${cfg.height}px`;
      btn.style.right = `${cfg.right}px`;
      btn.style.bottom = `${cfg.bottom}px`;
      btn.style.opacity = '0';
      if (idx === 0) {
        btn.addEventListener('click', () => startViewerShot(viewer, fakeImg));
      } else {
        btn.addEventListener('click', () => {
          const path = item?.file?.webkitRelativePath || item?.file?.name || item?.url || '';
          if (!path) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(path).catch(() => {});
          }
        });
      }
    });
  }

  if (tab) {
    let vvDrag = null;
    const onMove = e => {
      if (!vvDrag || e.pointerId !== vvDrag.pointerId) return;
      const stageRect2 = stage.getBoundingClientRect();
      const worldX2 = (e.clientX - stageRect2.left - pos.x) / scale;
      const worldY2 = (e.clientY - stageRect2.top - pos.y) / scale;
      let nx = vvDrag.startLeft + (worldX2 - vvDrag.startWorldX);
      let ny = vvDrag.startTop + (worldY2 - vvDrag.startWorldY);
      const minX2 = -200;
      const minY2 = -120;
      const maxX2 = (stageRect2.width / scale) - VIDEO_VIEWER_SIZE.width;
      const maxY2 = (stageRect2.height / scale) - VIDEO_VIEWER_SIZE.height;
      nx = Math.max(minX2, Math.min(nx, maxX2));
      ny = Math.max(minY2, Math.min(ny, maxY2));
      viewer.style.left = `${nx}px`;
      viewer.style.top = `${ny}px`;
    };
    const endDrag = e => {
      if (vvDrag && tab.hasPointerCapture?.(vvDrag.pointerId)) {
        tab.releasePointerCapture(vvDrag.pointerId);
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      if (vvDrag) {
        const vr = viewer.getBoundingClientRect();
        const bb = document.querySelector('.bigboy');
        let outside = false;
        if (bb) {
          const br = bb.getBoundingClientRect();
          outside = vr.right < br.left || vr.left > br.right || vr.bottom < br.top || vr.top > br.bottom;
        }
        viewer.dataset.overlay = outside ? 'false' : 'true';
        syncVideoViewerBackdrop();
      }
      vvDrag = null;
    };
    tab.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const vr = viewer.getBoundingClientRect();
      const stageRect2 = stage.getBoundingClientRect();
      const worldX2 = (e.clientX - stageRect2.left - pos.x) / scale;
      const worldY2 = (e.clientY - stageRect2.top - pos.y) / scale;
      vvDrag = {
        pointerId: e.pointerId,
        startLeft: parseFloat(viewer.style.left) || 0,
        startTop: parseFloat(viewer.style.top) || 0,
        startWorldX: worldX2,
        startWorldY: worldY2
      };
      tab.setPointerCapture(e.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    });
  }

  overlayLayer.appendChild(viewer);
  document.querySelectorAll('.browser-item.viewer-source-active').forEach(el => el.classList.remove('viewer-source-active'));
  if (sourceEl) sourceEl.classList.add('viewer-source-active');
  syncVideoViewerBackdrop();
}

function attachBrowserViewerClicks(items) {
  const list = document.querySelector('.browser-list');
  if (!list || !items || !items.length) return;
  const els = Array.from(list.querySelectorAll('.browser-item'));
  els.forEach((el, idx) => {
    const item = items[idx];
    if (!item || !item.isVideo) return;
    el.addEventListener('click', e => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const col = parseInt(el.dataset.col || '0', 10) || 0;
      openVideoViewer(item, centerX, centerY, el, col);
      e.stopPropagation();
    });
  });
}

function toggleNodeCodeView(node) {
  if (!node) return;
  const panel = node.querySelector('.node-code-panel');
  const pre = node.querySelector('.node-code-pre');
  if (!panel || !pre) return;
  const next = !node.classList.contains('code-view');
  if (next) {
    const raw = buildNodeStyleCodeRaw(node);
    pre.innerHTML = highlightCss(raw);
    panel.setAttribute('aria-hidden', 'false');
    node.classList.add('code-view');
  } else {
    panel.setAttribute('aria-hidden', 'true');
    node.classList.remove('code-view');
  }
}

function buildNodeStyleCodeRaw(node) {
  const sections = [];
  const pushStyles = (el, selector, props) => {
    if (!el) return;
    const cs = getComputedStyle(el);
    const lines = [];
    props.forEach(p => {
      const val = cs.getPropertyValue(p);
      if (val && val.trim()) {
        lines.push(`  ${p}: ${val.trim()};`);
      }
    });
    if (lines.length) {
      sections.push(`${selector} {\n${lines.join('\n')}\n}`);
    }
  };
  const baseProps = ['width','height','top','left','color','background-color','clip-path','border-radius','border-image-source','filter','z-index','opacity'];
  pushStyles(node, '.node', baseProps);
  pushStyles(node.querySelector('.node-shell'), '.node .node-shell', ['width','height','top','left','background-color','clip-path','border-image-source','filter']);
  pushStyles(node.querySelector('.node-body'), '.node .node-body', ['width','height','top','left','background-color']);
  pushStyles(node.querySelector('.text-node-body'), '.text-node-body', ['width','height','top','left','color','background-color']);
  pushStyles(node.querySelector('.date-field-from'), '.date-field-from', ['width','height','top','left','background-color','border-radius']);
  pushStyles(node.querySelector('.date-field-to'), '.date-field-to', ['width','height','top','right','background-color','border-radius']);
  return sections.join('\n\n') || '/* No styles captured */';
}

function highlightCss(raw) {
  const escapeHtml = str => str.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  const lines = raw.split('\n');
  const out = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (trimmed === '}') return `<span class="code-brace">}</span>`;
    if (trimmed.endsWith('{')) {
      const sel = escapeHtml(trimmed.slice(0, -1).trim());
      return `<span class="code-selector">${sel}</span> <span class="code-brace">{</span>`;
    }
    const m = line.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*;?$/);
    if (m) {
      const prop = escapeHtml(m[1]);
      const val = escapeHtml(m[2].replace(/;$/, '').trim());
      return `  <span class="code-property">${prop}</span>: <span class="code-value">${val}</span>;`;
    }
    return escapeHtml(line);
  });
  return out.join('\n');
}

function buildFolderTreeFromFiles(files) {
  const root = { name: 'root', children: new Map(), files: [] };
  files.forEach(f => {
    const path = f.webkitRelativePath || f.name;
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return;
    const fname = parts.pop();
    let node = root;
    parts.forEach(part => {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, children: new Map(), files: [] });
      }
      node = node.children.get(part);
    });
    node.files.push(fname);
  });
  const toPlain = n => ({
    name: n.name,
    children: Array.from(n.children.values()).map(toPlain),
    files: n.files
  });
  return toPlain(root);
}

function renderFolderTree() {
  const trees = document.querySelectorAll('.folder-tree');
  if (!trees.length) return;
  const renderNode = node => {
    const childHtml = node.children.map(renderNode).join('');
    const filesHtml = node.files.map(f => `<li class="folder-file">${f}</li>`).join('');
    return `<li>${node.name || ''}${childHtml ? `<ul>${childHtml}</ul>` : ''}${filesHtml ? `<ul>${filesHtml}</ul>` : ''}</li>`;
  };
  const html = folderTreeData ? `<ul>${renderNode(folderTreeData)}</ul>` : '';
  trees.forEach(t => { t.innerHTML = html; });
}

function applyNodeStylesFromText(node, text) {
  if (!node) return;
  const map = {
    '.node': node,
    '.node .node-shell': node.querySelector('.node-shell'),
    '.node .node-body': node.querySelector('.node-body'),
    '.text-node-body': node.querySelector('.text-node-body'),
    '.date-field-from': node.querySelector('.date-field-from'),
    '.date-field-to': node.querySelector('.date-field-to')
  };
  let current = null;
  text.split('\n').forEach(line => {
    const open = line.match(/^\s*([^{}]+)\s*\{\s*$/);
    if (open) {
      current = open[1].trim();
      return;
    }
    if (line.includes('}')) {
      current = null;
      return;
    }
    if (!current) return;
    const m = line.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
    if (!m) return;
    const el = map[current];
    if (el) el.style.setProperty(m[1], m[2]);
  });
}

function initCodePanel(node) {
  const pre = node.querySelector('.node-code-pre');
  if (!pre) return;
  pre.setAttribute('contenteditable', 'true');
  pre.addEventListener('wheel', e => {
    const deltaX = e.deltaX;
    const deltaY = e.deltaY;
    if (e.altKey) {
      pre.scrollLeft += deltaY || deltaX;
    } else {
      pre.scrollTop += deltaY || deltaX;
    }
    e.preventDefault();
  }, { passive:false });
  const applyAndRefresh = () => {
    const raw = pre.textContent || '';
    applyNodeStylesFromText(node, raw);
    const nextRaw = buildNodeStyleCodeRaw(node);
    pre.innerHTML = highlightCss(nextRaw);
  };
  pre.addEventListener('blur', applyAndRefresh);
  pre.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      applyAndRefresh();
    }
  });
}

if (tabBar) {
  tabBar.addEventListener('click', e => {
    const closeTarget = e.target.closest('.tab-close');
    if (closeTarget) {
      e.stopPropagation();
      closeTab(closeTarget.closest('.tab'));
      return;
    }
    const tab = e.target.closest('.tab');
    if (tab) {
      activateTab(tab);
    }
  });

  tabBar.addEventListener('keydown', e => {
    const closeTarget = e.target.closest('.tab-close');
    if (closeTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      closeTab(closeTarget.closest('.tab'));
    }
  });
}

function activateTab(tab) {
  if (!tabBar || !tab) return;
  if (tab.classList.contains('tab-active')) return;
  const tabs = tabBar.querySelectorAll('.tab');
  tabs.forEach(t => {
    t.classList.remove('tab-active');
    t.setAttribute('aria-selected', 'false');
  });
  tab.classList.add('tab-active');
  tab.setAttribute('aria-selected', 'true');
}

function closeTab(tab) {
  if (!tab || tab.dataset.locked === 'true') return;
  const wasActive = tab.classList.contains('tab-active');
  const tabs = Array.from(tabBar.querySelectorAll('.tab'));
  const index = tabs.indexOf(tab);
  tab.remove();
  if (wasActive) {
    const remaining = Array.from(tabBar.querySelectorAll('.tab'));
    const fallback = remaining[index] || remaining[index - 1] || remaining[0];
    if (fallback) {
      activateTab(fallback);
    }
  }
}

function startArrowDrag(arrow, e) {
  const node = arrow.closest('.node');
  if (!node) return;
  arrow.classList.add('dragging');
  arrow.style.transition = 'none';
  const dims = getNodeDimensions(node);
  const shellPaths = morphCache.get(node) || { base: SHELL_PATH_BASE, full: SHELL_PATH_FULL, morph: defaultMorphShell };
  const base = getArrowBase(node, arrow); // current arrow center in local coords
  const pointerLocal = pointerToLocal(node, e.clientX, e.clientY);
  arrowDrag = {
    node,
    arrow,
    shell: node.querySelector('.node-shell'),
    droplet: node.querySelector('.node-droplet'),
    handle: node.querySelector('.node-handle'),
    link: node.querySelector('.node-link'),
    pointerId: e.pointerId,
    base,
    pointer: pointerLocal,
    anchor: null,
    distance: 0,
    arrowCenter: null,
    nodeDimensions: dims,
    shellBase: shellPaths.base,
    shellFull: shellPaths.full,
    morphShell: shellPaths.morph
  };
  arrow.setPointerCapture(e.pointerId);
  e.preventDefault();
  updateArrowVisuals(arrowDrag);
}

function handleArrowMove(e) {
  if (!arrowDrag || e.pointerId !== arrowDrag.pointerId) return;
  const local = pointerToLocal(arrowDrag.node, e.clientX, e.clientY);
  arrowDrag.pointer = local;
  updateArrowVisuals(arrowDrag);
}

function endArrowDrag(e) {
  if (!arrowDrag || (e && e.pointerId !== arrowDrag.pointerId)) return;
  arrowDrag.arrow.releasePointerCapture(arrowDrag.pointerId);
  arrowDrag.arrow.classList.remove('dragging');
  // Restore the CSS transition we disabled at drag start.
  arrowDrag.arrow.style.transition = '';
  animateArrowRelease(arrowDrag);
  arrowDrag = null;
}

function updateArrowVisuals(drag) {
  if (!drag.pointer) return;
  const anchor = projectToPerimeter(drag.pointer, drag.nodeDimensions);
  applyArrowState(drag, anchor, drag.pointer);
}


function applyArrowState(drag, anchor, pointer) {
  if (!anchor) return;
  const isExporter = drag.node?.classList?.contains('node-exporter');
  const px = pointer ? pointer.x : anchor.x;
  const py = pointer ? pointer.y : anchor.y;
  const vecX = px - anchor.x;
  const vecY = py - anchor.y;
  const outDist = Math.hypot(vecX, vecY);
  const normX = outDist > 0 ? vecX / outDist : (drag.anchor?.normal?.x ?? 0);
  const normY = outDist > 0 ? vecY / outDist : (drag.anchor?.normal?.y ?? -1);
  const distance = outDist;
  drag.anchor = anchor;
  drag.distance = distance;
  anchor.normal = { x: normX, y: normY };
  anchor.angle = Math.atan2(normY, normX) * 180 / Math.PI;
  const arrowX = px;
  const arrowY = py;
  const translateX = arrowX - drag.base.x;
  const translateY = arrowY - drag.base.y;
  const regionKey = anchor.regionKey;
  let arrowDir;
  if (anchor.corner && anchor.cornerKey && ARROW_CORNER_BOUNDS[anchor.cornerKey]) {
    const bounds = ARROW_CORNER_BOUNDS[anchor.cornerKey];
    arrowDir = clampDirection(
      normalize(normX, normY),
      bounds.base,
      bounds.min ?? -45,
      bounds.max ?? 45
    );
  } else if (regionKey && ARROW_REGION_VECTORS[regionKey]) {
    arrowDir = normalize(ARROW_REGION_VECTORS[regionKey].x, ARROW_REGION_VECTORS[regionKey].y);
  } else {
    arrowDir = normalize(normX, normY);
  }
  drag.arrowDirection = arrowDir;
  let extraAngle = 0;
  if (anchor.corner && anchor.cornerKey && ARROW_CORNER_ANGLE_OFFSET[anchor.cornerKey] !== undefined) {
    extraAngle = ARROW_CORNER_ANGLE_OFFSET[anchor.cornerKey];
  } else if (regionKey && ARROW_REGION_ANGLE_OFFSET[regionKey] !== undefined) {
    extraAngle = ARROW_REGION_ANGLE_OFFSET[regionKey];
  } else if (anchor.edge && ARROW_REGION_ANGLE_OFFSET[anchor.edge] !== undefined) {
    extraAngle = ARROW_REGION_ANGLE_OFFSET[anchor.edge];
  } else {
    extraAngle = ARROW_REGION_ANGLE_OFFSET.default ?? 0;
  }
  const arrowAngle = Math.atan2(arrowDir.y, arrowDir.x) * 180 / Math.PI + ARROW_ANGLE_OFFSET + extraAngle;
  drag.arrow.style.transform = `translate(${translateX}px, ${translateY}px) rotate(${arrowAngle}deg)`;
  drag.arrowCenter = { x: arrowX, y: arrowY };
  drag.lastArrowTranslate = { x: translateX, y: translateY };
  const limitedDist = Math.min(distance, MAX_PULL);
  const progressRaw = limitedDist <= FILL_THRESHOLD ? 0 : (limitedDist - FILL_THRESHOLD) / (MAX_PULL - FILL_THRESHOLD);
  const progress = Math.min(1, progressRaw);
  if (progress >= 1 && drag.shell) {
    drag.shell.dataset.shellLocked = 'true';
    arrowLockedWorld.set(drag.node, {
      x: (parseFloat(drag.node.style.left) || 0) + arrowX,
      y: (parseFloat(drag.node.style.top) || 0) + arrowY
    });
  }
  const shellLocked = drag.shell && drag.shell.dataset.shellLocked === 'true';
  if (drag.shell && drag.node && drag.node.classList.contains('node-text-query')) {
    updateTextShellAsset(drag.shell, shellLocked);
  } else if (drag.shell && drag.node && drag.node.classList.contains('node-date-filter')) {
    updateDateShellAsset(drag.shell, shellLocked);
  } else if (drag.shell && drag.node && drag.node.classList.contains('node-exporter')) {
    updateExporterShellAsset(drag.shell, shellLocked);
  }
  const shellPaths = {
    base: drag.shellBase || SHELL_PATH_BASE,
    full: drag.shellFull || SHELL_PATH_FULL,
    morph: drag.morphShell || defaultMorphShell
  };
  let path;
  if (shellLocked) {
    path = shellPaths.full;
  } else if (progress <= 0) {
    path = shellPaths.base;
  } else {
    path = shellPaths.morph ? shellPaths.morph(progress) : shellPaths.base;
  }
  applyShellPath(drag.shell, path);
  if (shellLocked && drag.node && !arrowLockedWorld.has(drag.node)) {
    arrowLockedWorld.set(drag.node, {
      x: (parseFloat(drag.node.style.left) || 0) + arrowX,
      y: (parseFloat(drag.node.style.top) || 0) + arrowY
    });
  }
  if (isExporter) {
    // Arrow stays put; droplet/handle follow pointer
    const baseX = drag.base?.x ?? 0;
    const baseY = drag.base?.y ?? 0;
    drag.arrow.style.transform = `translate(${baseX}px, ${baseY}px) rotate(0deg)`;
    drag.arrowCenter = { x: baseX, y: baseY };
    drag.lastArrowTranslate = { x: 0, y: 0 };

    const dropletCenter = { x: px, y: py };
    const droplet = drag.droplet;
    if (droplet) {
      const dw = droplet.offsetWidth || 14;
      const dh = droplet.offsetHeight || 14;
      droplet.style.display = 'block';
      droplet.classList.add('active');
      droplet.style.opacity = '1';
      droplet.style.transform = `translate(${dropletCenter.x - dw / 2}px, ${dropletCenter.y - dh / 2}px)`;
    }
    const handle = drag.handle;
    if (handle) {
      const hw = handle.offsetWidth || 14;
      const hh = handle.offsetHeight || 14;
      handle.style.display = 'block';
      handle.classList.add('active');
      handle.style.opacity = '1';
      handle.style.transform = `translate(${dropletCenter.x - hw / 2}px, ${dropletCenter.y - hh / 2}px)`;
    }
    updateConnector(drag, dropletCenter, drag.arrowCenter);
    return;
  }
  const dropletCenter = updateDroplet(drag, anchor, distance, progress);
  const handleCenter = updateHandle(drag, dropletCenter, anchor, shellLocked, distance, drag.arrow.classList.contains('dragging'));
  updateConnector(drag, handleCenter || dropletCenter, drag.arrowCenter);
}

function animateArrowRelease(state) {
  const anchor = state.anchor;
  const startDistance = state.distance || 0;
  if (!anchor) {
    if (state.droplet) {
      state.droplet.classList.remove('active');
      state.droplet.style.transform = '';
    }
    if (state.handle) {
      state.handle.classList.remove('active');
      state.handle.style.transform = '';
    }
    if (state.link) {
      state.link.classList.remove('active');
      state.link.style.transform = '';
      state.link.style.width = '';
    }
    return;
  }
  const dropletCenter = updateDroplet(state, anchor, startDistance, Math.min(1, (Math.min(startDistance, MAX_PULL) - FILL_THRESHOLD) / (MAX_PULL - FILL_THRESHOLD)));
  const targetDist = HANDLE_BASE_OFFSET + Math.min(startDistance, HANDLE_MAX_DIST);
  const startDist = HANDLE_BASE_OFFSET + Math.min(startDistance, HANDLE_MAX_DIST) + HANDLE_DRAG_EXTRA;
  const duration = 260;
  const overshoot = 1.06;
  const startTime = performance.now();
  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const dist = targetDist + (startDist - targetDist) * (1 - ease) * overshoot;
    const handleCenter = updateHandle(state, dropletCenter, anchor, true, dist, false);
    updateConnector(state, handleCenter, state.arrowCenter);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function getArrowBase(node, arrow) {
  const dataX = parseFloat(arrow.dataset.baseX);
  const dataY = parseFloat(arrow.dataset.baseY);
  if (!Number.isNaN(dataX) && !Number.isNaN(dataY)) {
    return { x: dataX, y: dataY };
  }
  const measured = measureArrowBase(node, arrow);
  arrow.dataset.baseX = measured.x.toString();
  arrow.dataset.baseY = measured.y.toString();
  return measured;
}

function measureArrowBase(node, arrow) {
  const previous = arrow.style.transform;
  arrow.style.transform = '';
  const nodeRect = node.getBoundingClientRect();
  const arrowRect = arrow.getBoundingClientRect();
  arrow.style.transform = previous;
  return {
    x: (arrowRect.left - nodeRect.left) / scale + (arrowRect.width / 2) / scale,
    y: (arrowRect.top - nodeRect.top) / scale + (arrowRect.height / 2) / scale
  };
}

function pointerToLocal(node, clientX, clientY) {
  const rect = node.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale
  };
}

function getNodeRect(node) {
  const w = parseFloat(node.dataset.width) || NODE_DIMENSIONS.width;
  const h = parseFloat(node.dataset.height) || NODE_DIMENSIONS.height;
  const x = parseFloat(node.style.left) || 0;
  const y = parseFloat(node.style.top) || 0;
  return { x, y, w, h };
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
}

function collidesWithNodes(rect, excludeNode = null) {
  const others = nodesLayer.querySelectorAll('.node');
  for (const n of others) {
    if (excludeNode && n === excludeNode) continue;
    const r = getNodeRect(n);
    if (rectsOverlap(rect, r)) return true;
  }
  return false;
}

function resolveOverlapRect(rect, excludeNode = null) {
  const step = 20;
  const maxAttempts = 200;
  let attempt = 0;
  const placed = { ...rect };
  while (collidesWithNodes(placed, excludeNode) && attempt < maxAttempts) {
    placed.x += step;
    placed.y += step / 2;
    attempt++;
  }
  return placed;
}

function clearSelection() {
  selectedNodes.forEach(n => n.classList.remove('node-selected'));
  selectedNodes.clear();
}

function selectNode(node) {
  selectedNodes.add(node);
  node.classList.add('node-selected');
}

function startSelection(e) {
  const layerRect = nodesLayer.getBoundingClientRect();
  const toLocal = evt => ({
    x: (evt.clientX - layerRect.left) / scale,
    y: (evt.clientY - layerRect.top) / scale
  });
  clearSelection();
  selectionStart = toLocal(e);
  if (!selectionRect) {
    selectionRect = document.createElement('div');
    selectionRect.className = 'selection-rect';
    nodesLayer.appendChild(selectionRect);
  }
  selectionRect.style.display = 'block';
  updateSelectionRect(e);
  window.addEventListener('pointermove', updateSelectionRect);
  window.addEventListener('pointerup', endSelection, { once: true });
}

function updateSelectionRect(e) {
  if (!selectionStart || !selectionRect) return;
  const layerRect = nodesLayer.getBoundingClientRect();
  const x1 = selectionStart.x;
  const y1 = selectionStart.y;
  const x2 = (e.clientX - layerRect.left) / scale;
  const y2 = (e.clientY - layerRect.top) / scale;
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x1 - x2);
  const height = Math.abs(y1 - y2);
  selectionRect.style.left = `${left}px`;
  selectionRect.style.top = `${top}px`;
  selectionRect.style.width = `${width}px`;
  selectionRect.style.height = `${height}px`;
}

function endSelection(e) {
  window.removeEventListener('pointermove', updateSelectionRect);
  if (selectionRect) selectionRect.style.display = 'none';
  const layerRect = nodesLayer.getBoundingClientRect();
  const rect = {
    x1: Math.min(selectionStart.x, (e.clientX - layerRect.left) / scale),
    y1: Math.min(selectionStart.y, (e.clientY - layerRect.top) / scale),
    x2: Math.max(selectionStart.x, (e.clientX - layerRect.left) / scale),
    y2: Math.max(selectionStart.y, (e.clientY - layerRect.top) / scale)
  };
  clearSelection();
  const nodes = nodesLayer.querySelectorAll('.node');
  nodes.forEach(n => {
    const b = n.getBoundingClientRect();
    const nx1 = (b.left - layerRect.left) / scale;
    const ny1 = (b.top - layerRect.top) / scale;
    const nx2 = (b.right - layerRect.left) / scale;
    const ny2 = (b.bottom - layerRect.top) / scale;
    if (!(nx2 < rect.x1 || nx1 > rect.x2 || ny2 < rect.y1 || ny1 > rect.y2)) {
      selectNode(n);
    }
  });
  selectionStart = null;
}

function clampToBounds(point) {
  const minX = -BOUNDS_PADDING;
  const maxX = NODE_DIMENSIONS.width + BOUNDS_PADDING;
  const minY = -BOUNDS_PADDING;
  const maxY = NODE_DIMENSIONS.height + BOUNDS_PADDING;
  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY)
  };
}

function updateDroplet(drag, anchor, distance, progress) {
  const droplet = drag.droplet;
  if (!droplet) return;
  const show = progress > 0;
  droplet.style.display = show ? '' : 'none';
  droplet.classList.toggle('active', show);
  if (!show) {
    delete drag.dropletCenter;
    delete drag.dropletDirection;
    delete drag.dropletOffset;
    return null;
  }
  const scaleFactor = 0.9 + 0.1 * Math.max(0, Math.min(1, progress));
  const edgeKey = anchor.corner ? (anchor.cornerKey || 'default') : (anchor.edge || 'default');
  const rawOffset = DROPLET_EDGE_OFFSET[edgeKey] ?? DROPLET_EDGE_OFFSET.default;
  const isObjectOffset = typeof rawOffset === 'object';
  const baseNormal = isObjectOffset ? (rawOffset.normal ?? 0) : rawOffset ?? 0;
  const baseTangent = isObjectOffset ? (rawOffset.tangent ?? 0) : 0;
  const appliedNormal = anchor.corner && anchor.cornerKey && CORNER_NORMALS[anchor.cornerKey]
    ? CORNER_NORMALS[anchor.cornerKey]
    : anchor.normal;
  const normalScale = anchor.corner ? 0.35 : (anchor.edge === 'top' ? 0.5 : 1);
  const normalMagnitude = baseNormal * normalScale;
  const tangentVec = { x: -appliedNormal.y, y: appliedNormal.x };
  const offsetX = appliedNormal.x * normalMagnitude + tangentVec.x * baseTangent;
  const offsetY = appliedNormal.y * normalMagnitude + tangentVec.y * baseTangent;
  const centerX = anchor.x + offsetX;
  const centerY = anchor.y + offsetY;
  const offsetLength = Math.hypot(offsetX, offsetY);
  const baseDir = anchor.corner && anchor.cornerKey && CORNER_NORMALS[anchor.cornerKey]
    ? CORNER_NORMALS[anchor.cornerKey]
    : (offsetLength > 0
      ? { x: offsetX / offsetLength, y: offsetY / offsetLength }
      : { x: appliedNormal.x, y: appliedNormal.y });
  drag.dropletCenter = { x: centerX, y: centerY };
  drag.dropletDirection = baseDir;
  drag.dropletOffset = { x: offsetX, y: offsetY };
  const translateX = centerX - DROPLET_SIZE.width / 2;
  const translateY = centerY - DROPLET_SIZE.height + 6;
  const baseAngle = Math.atan2(baseDir.y, baseDir.x) * 180 / Math.PI;
  const extraAngle = anchor.corner
    ? (DROPLET_EDGE_ANGLE_OFFSET[anchor.cornerKey || 'default'] ?? DROPLET_EDGE_ANGLE_OFFSET.default)
    : (DROPLET_EDGE_ANGLE_OFFSET[anchor.edge || 'default'] ?? DROPLET_EDGE_ANGLE_OFFSET.default);
  const rotation = baseAngle + DROPLET_ANGLE_OFFSET + extraAngle;
  droplet.style.transform = `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${scaleFactor})`;
  return { x: centerX, y: centerY };
}

function updateHandle(drag, dropletCenter, anchor, shellLocked, distance, isDragging) {
  const handle = drag.handle;
  if (!handle) return;
  if (!dropletCenter || !anchor) {
    handle.classList.remove('active');
    handle.style.transform = '';
    handle.style.display = 'none';
    if (drag.link) {
      drag.link.classList.remove('active');
      drag.link.style.transform = '';
      drag.link.style.width = '';
      drag.link.style.display = 'none';
    }
    return null;
  }
  if (!shellLocked) {
    handle.classList.remove('active');
    handle.style.transform = '';
    handle.style.display = 'none';
    if (drag.link) {
      drag.link.classList.remove('active');
      drag.link.style.transform = '';
      drag.link.style.width = '';
      drag.link.style.display = 'none';
    }
    return null;
  }
  handle.classList.add('active');
  handle.style.display = '';
  const baseDir = drag.dropletDirection || anchor.normal || { x: 0, y: -1 };
  const tangent = { x: -baseDir.y, y: baseDir.x };
  const edgeKey = anchor.corner ? (anchor.cornerKey || 'default') : (anchor.edge || 'default');
  const edgeShift = HANDLE_EDGE_SHIFT[edgeKey] ?? HANDLE_EDGE_SHIFT.default;
  const shiftNormal = edgeShift.normal ?? 0;
  const shiftTangent = edgeShift.tangent ?? 0;
  const originX = (anchor.x ?? 0) + (drag.dropletOffset?.x ?? 0);
  const originY = (anchor.y ?? 0) + (drag.dropletOffset?.y ?? 0);
  const radius = (handle.offsetWidth || 14) / 2;
  const cappedDist = Math.min(distance || 0, HANDLE_MAX_DIST);
  const jitter = cappedDist >= HANDLE_MAX_DIST ? Math.sin(performance.now() / 120) * 1.2 : 0;
  const dragExtra = isDragging ? HANDLE_DRAG_EXTRA : 0;
  const totalOffset = HANDLE_BASE_OFFSET + cappedDist + dragExtra + jitter;
  const handleCenterX = originX
    + baseDir.x * (totalOffset + shiftNormal)
    + tangent.x * shiftTangent;
  const handleCenterY = originY
    + baseDir.y * (totalOffset + shiftNormal)
    + tangent.y * shiftTangent;
  const translateX = handleCenterX - drag.base.x - radius;
  const translateY = handleCenterY - drag.base.y - radius;
  handle.style.transform = `translate(${translateX}px, ${translateY}px)`;
  if (drag.arrow) drag.arrow.style.opacity = '';
  return { x: handleCenterX, y: handleCenterY };
}

function updateConnector(drag, handleCenter, arrowCenter) {
  const link = drag.link;
  if (!link) return;
  const handleActive = !!(drag.handle && drag.handle.classList.contains('active'));
  if (!handleCenter || !arrowCenter || !handleActive) {
    link.classList.remove('active');
    link.style.transform = '';
    link.style.width = '';
    link.style.display = 'none';
    return;
  }
  link.style.display = '';
  const handleDir = drag.dropletDirection || { x: 0, y: -1 };
  const handleTangent = { x: -handleDir.y, y: handleDir.x };
  const arrowDir = drag.arrowDirection || { x: 0, y: -1 };
  const anchorInfo = drag.anchor || {};
  const regionKey = anchorInfo.corner ? anchorInfo.cornerKey : (anchorInfo.edge || anchorInfo.regionKey);
  const regionShift = (regionKey && HANDLE_LINK_REGION_OFFSET[regionKey]) || HANDLE_LINK_REGION_OFFSET.default || {};
  const pullback = regionShift.pullback ?? HANDLE_LINK_PULLBACK;
  const tangentShift = regionShift.tangent ?? HANDLE_LINK_TANGENT;
  const handleEndpoint = {
    x: handleCenter.x - handleDir.x * pullback + handleTangent.x * tangentShift,
    y: handleCenter.y - handleDir.y * pullback + handleTangent.y * tangentShift
  };
  const arrowEndpoint = {
    x: arrowCenter.x + arrowDir.x * ARROW_LINK_PULL,
    y: arrowCenter.y + arrowDir.y * ARROW_LINK_PULL
  };
  const dx = handleEndpoint.x - arrowEndpoint.x;
  const dy = handleEndpoint.y - arrowEndpoint.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  link.classList.add('active');
  link.style.width = `${length}px`;
  link.style.transform = `translate(${arrowEndpoint.x}px, ${arrowEndpoint.y}px) rotate(${angle}deg)`;
}

function projectToPerimeter(point, dims = NODE_DIMENSIONS) {
  const w = dims.width;
  const h = dims.height;
  let x = Math.min(Math.max(point.x, 0), w);
  let y = Math.min(Math.max(point.y, 0), h);
  const center = { x: w / 2, y: h / 2 };
  const vecX = point.x - x;
  const vecY = point.y - y;
  const fromCenterX = point.x - center.x;
  const fromCenterY = point.y - center.y;
  const len = Math.hypot(vecX, vecY) || Math.hypot(fromCenterX, fromCenterY) || 1;
  const normX = len ? (vecX || fromCenterX) / len : 0;
  const normY = len ? (vecY || fromCenterY) / len : -1;
  const angle = Math.atan2(normY, normX) * 180 / Math.PI;
  const onLeft = x === 0;
  const onRight = x === w;
  const onTop = y === 0;
  const onBottom = y === h;
  const isCorner = (onLeft || onRight) && (onTop || onBottom);
  let edge = null;
  let cornerKey = null;
  if (isCorner) {
    if (onTop && onLeft) cornerKey = 'cornerTopLeft';
    else if (onTop && onRight) cornerKey = 'cornerTopRight';
    else if (onBottom && onRight) cornerKey = 'cornerBottomRight';
    else if (onBottom && onLeft) cornerKey = 'cornerBottomLeft';
  } else if (onTop) {
    edge = 'top';
  } else if (onBottom) {
    edge = 'bottom';
  } else if (onLeft) {
    edge = 'left';
  } else if (onRight) {
    edge = 'right';
  }
  if (edge === 'top' || edge === 'bottom') {
    const marginX = DROPLET_HALF_WIDTH;
    x = Math.min(Math.max(x, marginX), w - marginX);
  }
  if (edge === 'left' || edge === 'right') {
    const marginY = DROPLET_HALF_WIDTH+2;
    y = Math.min(Math.max(y, marginY+20), h - marginY);
  }
  const horizontalRegion = point.x < 0 ? 'left' : (point.x > w ? 'right' : 'center');
  const verticalRegion = point.y < 0 ? 'top' : (point.y > h ? 'bottom' : 'center');
  let regionKey = 'inside';
  if (horizontalRegion === 'center' && verticalRegion === 'center') {
    regionKey = 'inside';
  } else if (horizontalRegion === 'center') {
    regionKey = verticalRegion;
  } else if (verticalRegion === 'center') {
    regionKey = horizontalRegion;
  } else {
    regionKey = `corner${verticalRegion === 'top' ? 'Top' : 'Bottom'}${horizontalRegion === 'left' ? 'Left' : 'Right'}`;
  }
  return {
    x,
    y,
    corner: isCorner,
    cornerKey,
    normal: { x: normX, y: normY },
    angle,
    edge,
    regionKey
  };
}

function resetArrowVisual(node) {
  if (!node) return;
  const shell = node.querySelector('.node-shell');
  const arrow = node.querySelector('.node-arrow');
  const droplet = node.querySelector('.node-droplet');
  const handle = node.querySelector('.node-handle');
  const link = node.querySelector('.node-link');
  const uploadPreview = node.querySelector('.node-upload-preview');
  const uploadIcon = node.querySelector('.node-upload-icon');
  const shellPaths = morphCache.get(node) || { base: SHELL_PATH_BASE };
  if (shell) {
    shell.dataset.shellLocked = 'false';
    applyShellPath(shell, shellPaths.base || SHELL_PATH_BASE);
    if (node.classList.contains('node-text-query')) {
      updateTextShellAsset(shell, false);
    } else if (node.classList.contains('node-date-filter')) {
      updateDateShellAsset(shell, false);
    }
  }
  const base = arrow ? getArrowBase(node, arrow) : { x: 0, y: 0 };
  if (arrow) {
    arrow.style.transform = '';
    arrow.style.opacity = '';
  }
  if (droplet) {
    droplet.classList.remove('active');
    droplet.style.transform = '';
    droplet.style.opacity = '';
    droplet.style.display = 'none';
  }
  if (handle) {
    handle.classList.remove('active');
    handle.style.transform = '';
    handle.style.opacity = '';
    handle.remove();
    const newHandle = document.createElement('div');
    newHandle.className = 'node-handle';
    newHandle.setAttribute('aria-hidden', 'true');
    arrow.insertAdjacentElement('afterend', newHandle);
  }
  if (link) {
    link.classList.remove('active');
    link.style.transform = '';
    link.style.width = '';
    link.style.opacity = '';
    link.remove();
    const newLink = document.createElement('div');
    newLink.className = 'node-link';
    newLink.setAttribute('aria-hidden', 'true');
    if (arrow.nextSibling) {
      arrow.parentNode.insertBefore(newLink, arrow.nextSibling);
    } else {
      arrow.parentNode.appendChild(newLink);
    }
  }
  if (uploadPreview) {
    uploadPreview.style.display = 'none';
    uploadPreview.src = '';
  }
  if (uploadIcon) {
    uploadIcon.style.display = '';
  }
  applyDateConnectorColor(node);
  // reset upload state
  if (uploadPreview) {
    uploadPreview.style.display = 'none';
    uploadPreview.src = '';
  }
  if (uploadIcon) uploadIcon.style.display = '';
  arrowLockedWorld.delete(node);
}

function ensureUploadModal() {
  if (uploadModal) return;
  uploadModal = document.createElement('div');
  uploadModal.className = 'upload-modal';
  Object.assign(uploadModal.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100vw',
    height: '100vh',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.35)',
    zIndex: '9999'
  });
  uploadModal.innerHTML = `
    <div class="upload-modal-card">
      <div class="upload-modal-header">
        <span>Upload image</span>
        <button type="button" class="upload-modal-close" aria-label="Close">×</button>
      </div>
      <div class="upload-modal-body">
        <input class="upload-modal-input" type="file" accept="image/*" aria-label="Choose image">
      </div>
    </div>
  `;
  document.body.appendChild(uploadModal);
  uploadInputGlobal = uploadModal.querySelector('.upload-modal-input');
  uploadCloseBtn = uploadModal.querySelector('.upload-modal-close');
  uploadModal.addEventListener('click', e => {
    if (e.target === uploadModal) {
      closeUploadModal();
    }
  });
  if (uploadCloseBtn) {
    uploadCloseBtn.addEventListener('click', closeUploadModal);
  }
  if (uploadInputGlobal) {
    uploadInputGlobal.addEventListener('change', handleUploadSelected);
  }
  // hide by default
  uploadModal.classList.remove('active');
  uploadModal.style.display = 'none';
  // allow ESC to close when active (only bind once)
  if (!uploadKeyListenerAdded) {
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeUploadModal();
    });
    uploadKeyListenerAdded = true;
  }
}

function openUploadModal(node) {
  ensureUploadModal();
  uploadTargetNode = node;
  console.log('open upload modal for node', node);
  if (uploadModal) {
    uploadModal.classList.add('active');
    uploadModal.style.display = 'flex';
  }
  if (uploadInputGlobal) {
    uploadInputGlobal.value = '';
    uploadInputGlobal.focus();
  }
}

function closeUploadModal() {
  if (uploadModal) {
    uploadModal.classList.remove('active');
    uploadModal.style.display = 'none';
  }
  uploadTargetNode = null;
}

function ensureNodePicker() {
  if (nodePickerEl) return nodePickerEl;
  nodePickerEl = document.getElementById('node-picker');
  pickerBackdropEl = document.getElementById('picker-backdrop');
  if (!nodePickerEl) return null;
  const tabs = Array.from(nodePickerEl.querySelectorAll('.picker-tab'));
  const body = nodePickerEl.querySelector('.picker-body');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPickerItems(tab.textContent.trim());
    });
  });
  const closeBtn = nodePickerEl.querySelector('.picker-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeNodePicker());
  }
  let dragPicker = null;
  const onMove = e => {
    if (!dragPicker) return;
    const stageRect = stage.getBoundingClientRect();
    const w = nodePickerEl.offsetWidth;
    const h = nodePickerEl.offsetHeight;
    let left = e.clientX - stageRect.left - dragPicker.dx;
    let top = e.clientY - stageRect.top - dragPicker.dy;
    left = Math.max(0, Math.min(left, stageRect.width - w));
    top = Math.max(0, Math.min(top, stageRect.height - h));
    nodePickerEl.style.left = `${left}px`;
    nodePickerEl.style.top = `${top}px`;
  };
  const endDrag = e => {
    if (dragPicker && nodePickerEl.hasPointerCapture?.(dragPicker.pointerId)) {
      nodePickerEl.releasePointerCapture(dragPicker.pointerId);
    }
    dragPicker = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  };
  nodePickerEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const t = e.target;
    const onTab = t.closest('.picker-tab');
    const onClose = t.closest('.picker-close');
    const onItem = t.closest('.picker-item') || t.closest('.picker-item-img');
    if (onTab || onClose || onItem) return;
    const pickerRect = nodePickerEl.getBoundingClientRect();
    dragPicker = {
      pointerId: e.pointerId,
      dx: e.clientX - pickerRect.left,
      dy: e.clientY - pickerRect.top
    };
    nodePickerEl.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  });
  renderPickerItems(tabs[0]?.textContent.trim());
  return nodePickerEl;
}

function openNodePicker(clientX, clientY) {
  const el = ensureNodePicker();
  if (!el) return;
  const rect = stage.getBoundingClientRect();
  const w = PICKER_SIZE.width;
  const h = PICKER_SIZE.height;
  let left = clientX !== undefined ? clientX - rect.left - w / 2 : (rect.width - w) / 2;
  let top = clientY !== undefined ? clientY - rect.top - h / 2 : (rect.height - h) / 2;
  left = Math.max(8, Math.min(left, rect.width - w - 8));
  top = Math.max(8, Math.min(top, rect.height - h - 8));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.hidden = false;
  if (pickerBackdropEl) pickerBackdropEl.hidden = false;
}

function closeNodePicker() {
  if (nodePickerEl) nodePickerEl.hidden = true;
  if (pickerBackdropEl) pickerBackdropEl.hidden = true;
}

function spawnNodeByType(type, worldX, worldY) {
  if (type === 'query') {
    const dims = NODE_DIMENSIONS;
    createImageQueryNode(worldX - dims.width / 2, worldY - dims.height / 2);
  } else if (type === 'text-query') {
    const dims = TEXT_NODE_DIMENSIONS;
    createTextQueryNode(worldX - dims.width / 2, worldY - dims.height / 2);
  } else if (type === 'filter') {
    const dims = FOLDER_DIMENSIONS;
    createFolderNode(worldX - dims.width / 2, worldY - dims.height / 2);
  } else if (type === 'date-filter') {
    const dims = DATE_NODE_DIMENSIONS;
    createDateFilterNode(worldX - dims.width / 2, worldY - dims.height / 2);
  } else if (type === 'exporter') {
    const dims = EXPORTER_DIMENSIONS;
    createExporterNode(worldX - dims.width / 2, worldY - dims.height / 2);
  }
}
function renderPickerItems(activeLabel) {
  if (!nodePickerEl) return;
  const body = nodePickerEl.querySelector('.picker-body');
  if (!body) return;
  body.innerHTML = '';
  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'picker-items';
  const items = [];
  if (activeLabel === 'Query Node' || activeLabel === 'Query Filters') {
    items.push({ type: 'query', label: 'Image Query' });
    items.push({ type: 'text-query', label: 'Text Query' });
  } else if (activeLabel === 'Hard Filter Node' || activeLabel === 'Hard Filters') {
    items.push({ type: 'filter', label: 'Folder Filter' });
    items.push({ type: 'date-filter', label: 'Date Filter' });
  } else if (activeLabel === 'Exporter' || activeLabel === 'Exporters' || activeLabel === 'Export Node') {
    items.push({ type: 'exporter', label: 'Excel Exporter' });
  } else {
    // other tabs no items for now
  }
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#8a8a8a';
    empty.style.fontSize = '13px';
    empty.textContent = 'No nodes in this tab yet.';
    body.appendChild(empty);
    return;
  }
  items.forEach(item => {
    const isImageQuery = item.type === 'query';
    const isTextQuery = item.type === 'text-query';
    const isDateFilter = item.type === 'date-filter';
    const isFolderFilter = item.type === 'filter';
    const isExporter = item.type === 'exporter';
    const el = (isImageQuery || isTextQuery || isDateFilter || isFolderFilter || isExporter)
      ? document.createElement('img')
      : document.createElement('div');
    el.className = (isImageQuery || isTextQuery || isDateFilter || isFolderFilter || isExporter) ? 'picker-item picker-item-img' : 'picker-item';
    if (isImageQuery) {
      el.src = 'assets/IMGQPreview.svg';
      el.alt = item.label;
    } else if (isTextQuery) {
      el.src = 'assets/textPreview.svg';
      el.alt = item.label;
    } else if (isFolderFilter) {
      el.src = 'assets/FolderPreview.svg';
      el.alt = item.label;
    } else if (isDateFilter) {
      el.src = 'assets/DateFilterPreview.svg';
      el.alt = item.label;
    } else if (isExporter) {
      el.src = 'assets/XLSXPreview.svg';
      el.alt = item.label;
    } else {
      el.textContent = item.label;
    }
    el.draggable = true;
    el.dataset.nodeType = item.type;
    el.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/node-type', item.type);
      closeNodePicker();
    });
    el.addEventListener('click', () => {
      // create at center when clicked
      const rect = stage.getBoundingClientRect();
      const worldX = (rect.width / 2 - pos.x) / scale;
      const worldY = (rect.height / 2 - pos.y) / scale;
      spawnNodeByType(item.type, worldX, worldY);
      closeNodePicker();
    });
    itemsWrap.appendChild(el);
  });
  body.appendChild(itemsWrap);
}

function handleUploadSelected() {
  if (!uploadTargetNode || !uploadInputGlobal) return;
  console.log('file selected');
  const file = uploadInputGlobal.files && uploadInputGlobal.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const src = ev.target?.result;
    if (!src) return;
    const preview = uploadTargetNode.querySelector('.node-upload-preview');
    const icon = uploadTargetNode.querySelector('.node-upload-icon');
    if (preview) {
      preview.src = src;
      preview.style.display = '';
    }
    if (icon) icon.style.display = 'none';
    closeUploadModal();
  };
  reader.readAsDataURL(file);
}

function initUpload(node) {
  ensureUploadModal();
  const preview = node.querySelector('.node-upload-preview');
  const icon = node.querySelector('.node-upload-icon');
  const hit = node.querySelector('.node-upload-hit');
  if (preview) {
    preview.style.display = 'none';
    preview.style.width = '150.486px';
    preview.style.height = '145.056px';
    preview.style.borderRadius = '10px';
    preview.style.left = '0px';
    preview.style.top = '-7px';
    preview.style.objectFit = 'cover';
    preview.style.objectPosition = 'center';
  }
  if (icon) {
    icon.style.display = '';
    icon.addEventListener('click', e => {
      e.stopPropagation();
      console.log('icon click');
      openUploadModal(node);
    });
  }
  if (hit) {
    hit.addEventListener('click', e => {
      e.stopPropagation();
      console.log('hit click');
      openUploadModal(node);
    });
  }
}

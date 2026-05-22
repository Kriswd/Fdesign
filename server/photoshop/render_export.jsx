#target photoshop

if (typeof JSON === 'undefined') {
  JSON = {};
  JSON.parse = function (s) { return eval('(' + s + ')'); };
  JSON.stringify = function (obj) {
    if (obj === null) return "null";
    if (typeof obj === "string") return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
    if (obj instanceof Array) {
      var parts = [];
      for (var i = 0; i < obj.length; i += 1) parts.push(JSON.stringify(obj[i]));
      return "[" + parts.join(",") + "]";
    }
    if (typeof obj === "object") {
      var parts2 = [];
      for (var k in obj) {
        if (obj.hasOwnProperty(k)) parts2.push('"' + k + '":' + JSON.stringify(obj[k]));
      }
      return "{" + parts2.join(",") + "}";
    }
    return "null";
  };
}

var SCRIPT_BUILD = "render_export.jsx@2026-04-11_XMP_STRIPPED_BY_SHARP";

function normalizeFsPath(p) {
  var s = String(p == null ? "" : p);
  if (!s) return s;
  return s.replace(/\\/g, "/");
}

function safeWriteTextFile(path, content) {
  try {
    var f = new File(path);
    f.encoding = "UTF8";
    if (f.open("w")) {
      f.write(String(content == null ? "" : content));
      f.close();
    }
  } catch (e) {
  }
}

function safeMkdirForFile(filePath) {
  try {
    var f = new File(filePath);
    var dir = f.parent;
    if (dir && !dir.exists) dir.create();
  } catch (e) {
  }
}

function readJobFile(jobPath) {
  var f = new File(jobPath);
  if (!f.exists) throw new Error("job_file_not_found");
  f.encoding = "UTF8";
  if (!f.open("r")) throw new Error("job_file_open_failed");
  var s = f.read();
  f.close();
  if (!s) throw new Error("job_file_empty");
  return s;
}

function selectLayerById(id) {
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putIdentifier(charIDToTypeID("Lyr "), Number(id));
  desc.putReference(charIDToTypeID("null"), ref);
  desc.putBoolean(charIDToTypeID("MkVs"), false);
  executeAction(charIDToTypeID("slct"), desc, DialogModes.NO);
}

function replacePlacedContents(filePath) {
  var idplacedLayerReplaceContents = stringIDToTypeID("placedLayerReplaceContents");
  var desc = new ActionDescriptor();
  desc.putPath(charIDToTypeID("null"), new File(filePath));
  desc.putInteger(charIDToTypeID("PgNm"), 1);
  executeAction(idplacedLayerReplaceContents, desc, DialogModes.NO);
  try {
    executeAction(stringIDToTypeID("commit"), undefined, DialogModes.NO);
  } catch (e) {
  }
}

function normalizeErrorText(e) {
  try {
    if (e && e.message) return String(e.message);
    return String(e);
  } catch (e2) {
    return "unknown_error";
  }
}

function truncateText(s, maxLen) {
  var t = "";
  try { t = String(s == null ? "" : s); } catch (e) { t = ""; }
  var n = Number(maxLen);
  if (!(isFinite(n) && n > 0)) n = 400;
  if (t.length <= n) return t;
  return t.substring(0, n);
}

function isPsdTooLargeSaveError(e) {
  var t = "";
  try { t = normalizeErrorText(e).toLowerCase(); } catch (e2) { t = ""; }
  if (!t) return false;
  if (t.indexOf("2gb") >= 0) return true;
  if (t.indexOf("2 gb") >= 0) return true;
  if (t.indexOf("file data") >= 0 && t.indexOf("2") >= 0 && t.indexOf("gb") >= 0) return true;
  if (t.indexOf("large document") >= 0) return true;
  if (t.indexOf("超过") >= 0 && t.indexOf("2") >= 0 && t.indexOf("gb") >= 0) return true;
  if (t.indexOf("文件数据") >= 0 && t.indexOf("2") >= 0 && t.indexOf("gb") >= 0) return true;
  return false;
}

function replaceFileExt(filePath, newExtWithoutDot) {
  var p = String(filePath || "");
  var ext = String(newExtWithoutDot || "").replace(/^\.+/, "");
  if (!ext) return p;
  var i = p.lastIndexOf(".");
  if (i <= 0) return p + "." + ext;
  return p.substring(0, i) + "." + ext;
}

function appendSuffixBeforeExt(filePath, suffix) {
  var p = String(filePath || "");
  var s = String(suffix || "");
  if (!s) return p;
  var i = p.lastIndexOf(".");
  if (i <= 0) return p + s;
  return p.substring(0, i) + s + p.substring(i);
}

function collectDocDiagnostics(doc) {
  var d = {};
  try { d.widthPx = doc && doc.width ? Number(doc.width.as("px")) : null; } catch (eW) { d.widthPx = null; }
  try { d.heightPx = doc && doc.height ? Number(doc.height.as("px")) : null; } catch (eH) { d.heightPx = null; }
  try { d.resolution = doc ? Number(doc.resolution) : null; } catch (eR) { d.resolution = null; }
  try { d.bitsPerChannel = doc && doc.bitsPerChannel ? String(doc.bitsPerChannel) : null; } catch (eB) { d.bitsPerChannel = null; }
  try { d.mode = doc && doc.mode ? String(doc.mode) : null; } catch (eM) { d.mode = null; }
  try { d.colorProfileName = doc && doc.colorProfileName ? String(doc.colorProfileName) : null; } catch (eP) { d.colorProfileName = null; }
  try { d.maximizeCompatibility = app && app.preferences ? String(app.preferences.maximizeCompatibility) : null; } catch (eC) { d.maximizeCompatibility = null; }
  return d;
}

function withSavePrefs(fn) {
  var prev = null;
  var okSet = false;
  try {
    if (app && app.preferences && typeof MaximizeCompatibility !== "undefined") {
      prev = app.preferences.maximizeCompatibility;
      app.preferences.maximizeCompatibility = MaximizeCompatibility.NEVER;
      okSet = true;
    }
  } catch (e) {
    okSet = false;
  }
  try {
    return fn();
  } finally {
    if (okSet) {
      try { app.preferences.maximizeCompatibility = prev; } catch (e2) {}
    }
  }
}

function saveAsPsbByActionManager(filePath) {
  var sTT = stringIDToTypeID;
  var d1 = new ActionDescriptor();
  var d2 = new ActionDescriptor();
  try { d2.putBoolean(sTT("maximizeCompatibility"), false); } catch (e0) {}
  d1.putObject(sTT("as"), sTT("largeDocumentFormat"), d2);
  d1.putPath(sTT("in"), new File(filePath));
  executeAction(sTT("save"), d1, DialogModes.NO);
}

function getLayerBounds(layer, includeEffects) {
  var arr = null;
  var useEffects = includeEffects === true;
  if (!useEffects) {
    try {
      if (layer && layer.boundsNoEffects) arr = layer.boundsNoEffects;
    } catch (e0) {
      arr = null;
    }
  }
  if (!arr) {
    try {
      arr = layer.bounds;
    } catch (e1) {
      arr = null;
    }
  }
  if (!arr) throw new Error("layer_bounds_unavailable");
  var left = Number(arr[0].as("px"));
  var top = Number(arr[1].as("px"));
  var right = Number(arr[2].as("px"));
  var bottom = Number(arr[3].as("px"));
  if (!(isFinite(left) && isFinite(top) && isFinite(right) && isFinite(bottom))) {
    throw new Error("layer_bounds_invalid");
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function isSmartObjectLayer(layer) {
  try {
    return layer && layer.typename === "ArtLayer" && layer.kind === LayerKind.SMARTOBJECT;
  } catch (e) {
    return false;
  }
}

function ensureLayerEditable(layer) {
  var current = layer;
  var guard = 0;
  while (current && guard < 50) {
    try {
      if (current.visible === false) current.visible = true;
    } catch (e0) {}
    try {
      if (current.allLocked || current.pixelsLocked || current.positionLocked || current.transparentPixelsLocked) {
        current.allLocked = false;
      }
    } catch (e1) {}
    try {
      if (!current.parent || current.parent.typename === "Document") current = null;
      else current = current.parent;
    } catch (e2) {
      current = null;
    }
    guard += 1;
  }
}

function moveLayerToFrontInParent(layer) {
  if (!layer) return false;
  var p = null;
  try { p = layer.parent; } catch (e0) { p = null; }
  if (!p) return false;
  try {
    layer.move(p, ElementPlacement.PLACEATBEGINNING);
    return true;
  } catch (e1) {
    return false;
  }
}

function sanitizeArtboardRenameMap(raw) {
  var src = (raw && typeof raw === "object") ? raw : null;
  var out = {};
  if (!src) return out;
  for (var k in src) {
    if (!src.hasOwnProperty(k)) continue;
    var from = String(k || "").replace(/^\s+|\s+$/g, "");
    var to = String(src[k] == null ? "" : src[k]).replace(/^\s+|\s+$/g, "");
    if (!from || !to) continue;
    out[from] = to;
  }
  return out;
}

function hasOwnRename(renameMap, key) {
  if (!renameMap || !key) return false;
  return renameMap.hasOwnProperty(key);
}

function renameArtboardGroupByLayer(layer, renameMap, logArr, psIdHint) {
  if (!layer || !renameMap) return;
  var psIdKey = psIdHint != null ? String(psIdHint) : "";
  var nextByPsId = "";
  if (psIdKey && hasOwnRename(renameMap, psIdKey)) {
    nextByPsId = String(renameMap[psIdKey] || "");
  }
  var parent = null;
  try { parent = layer.parent; } catch (e0) { parent = null; }
  var depth = 0;
  var parentChain = [];
  var renamedCount = 0;
  while (parent && depth < 60) {
    var maybeName = "";
    try { maybeName = String(parent.name || ""); } catch (e1) { maybeName = ""; }
    parentChain.push(maybeName);
    var nextName = nextByPsId || (hasOwnRename(renameMap, maybeName) ? String(renameMap[maybeName] || "") : "");
    if (nextName) {
      if (nextName !== maybeName) {
        try {
          parent.name = nextName;
          renamedCount += 1;
          if (logArr) logArr.push("artboard_renamed:" + maybeName + "=>" + nextName + ";psIdKey=" + psIdKey + ";depth=" + depth);
        } catch (e2) {
          if (logArr) logArr.push("artboard_rename_failed:" + maybeName + "=>" + nextName + ":" + String(e2));
        }
      }
    }
    try {
      if (!parent.parent || parent.parent.typename === "Document") break;
      parent = parent.parent;
    } catch (e3) {
      parent = null;
    }
    depth += 1;
  }
  if (logArr && psIdKey) {
    if (renamedCount > 0) {
      logArr.push("artboard_rename_summary:psId=" + psIdKey + ";renamed=" + renamedCount);
    } else if (!nextByPsId) {
      logArr.push("artboard_rename_skipped:psId=" + psIdKey + ";parentChain=" + parentChain.join(" > "));
    }
  }
}

function collapseAllArtboardGroups(workDoc, logArr) {
  if (!workDoc) return;
  try {
    app.activeDocument = workDoc;
    executeAction(stringIDToTypeID("collapseAllGroupsEvent"), undefined, DialogModes.NO);
    if (logArr) logArr.push("artboard_groups_collapsed=true");
  } catch (e) {
    if (logArr) logArr.push("artboard_groups_collapsed=false:" + String(e));
  }
}

function withInterpolation(resampleMethod, fn) {
  var prev = null;
  var changed = false;
  try {
    if (app && app.preferences && typeof resampleMethod !== "undefined") {
      prev = app.preferences.interpolation;
      app.preferences.interpolation = resampleMethod;
      changed = true;
    }
  } catch (e0) {
    changed = false;
  }
  try {
    return fn();
  } finally {
    if (changed) {
      try { app.preferences.interpolation = prev; } catch (e1) {}
    }
  }
}

function rectDistance(a, b) {
  if (!a || !b) return 999999;
  var dx = Math.abs(Number(a.x) - Number(b.x));
  var dy = Math.abs(Number(a.y) - Number(b.y));
  var dw = Math.abs(Number(a.width) - Number(b.width));
  var dh = Math.abs(Number(a.height) - Number(b.height));
  if (!(isFinite(dx) && isFinite(dy) && isFinite(dw) && isFinite(dh))) return 999999;
  return Math.max(dx, dy, dw, dh);
}

function shouldSkipFitAfterReplace(currentRect, desiredRect) {
  if (!currentRect || !desiredRect) return false;
  return rectDistance(currentRect, desiredRect) <= 0.5;
}

function rectWithOffset(rect, ox, oy) {
  if (!rect) return null;
  var x = Number(rect.x) + Number(ox || 0);
  var y = Number(rect.y) + Number(oy || 0);
  var w = Number(rect.width);
  var h = Number(rect.height);
  if (!(isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h))) return null;
  return { x: x, y: y, width: w, height: h };
}

function readDescriptorNumber(desc, keyId) {
  if (!desc) return NaN;
  try {
    var v = Number(desc.getUnitDoubleValue(keyId));
    if (isFinite(v)) return v;
  } catch (e0) {}
  try {
    var v2 = Number(desc.getDouble(keyId));
    if (isFinite(v2)) return v2;
  } catch (e1) {}
  return NaN;
}

function readArtboardRectByLayerId(layerId) {
  var id = Number(layerId);
  if (!(isFinite(id) && id > 0)) return null;
  try {
    var ref = new ActionReference();
    ref.putIdentifier(charIDToTypeID("Lyr "), id);
    var desc = executeActionGet(ref);
    var kArtboard = stringIDToTypeID("artboard");
    if (!desc || !desc.hasKey(kArtboard)) return null;
    var artboard = desc.getObjectValue(kArtboard);
    if (!artboard) return null;
    var kRect = stringIDToTypeID("artboardRect");
    if (!artboard.hasKey(kRect)) return null;
    var rectDesc = artboard.getObjectValue(kRect);
    if (!rectDesc) return null;
    var left = readDescriptorNumber(rectDesc, stringIDToTypeID("left"));
    var top = readDescriptorNumber(rectDesc, stringIDToTypeID("top"));
    var right = readDescriptorNumber(rectDesc, stringIDToTypeID("right"));
    var bottom = readDescriptorNumber(rectDesc, stringIDToTypeID("bottom"));
    if (!(isFinite(left) && isFinite(top) && isFinite(right) && isFinite(bottom))) return null;
    if (!(right > left && bottom > top)) return null;
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top, x: left, y: top };
  } catch (e) {
    return null;
  }
}

function findContainingArtboardRect(layer) {
  var cur = layer;
  var guard = 0;
  while (cur && guard < 80) {
    var id = getLayerIdSafe(cur);
    if (isFinite(id) && id > 0) {
      var rect = readArtboardRectByLayerId(id);
      if (rect) return rect;
    }
    try {
      if (!cur.parent || cur.parent.typename === "Document") break;
      cur = cur.parent;
    } catch (e0) {
      break;
    }
    guard += 1;
  }
  return null;
}

function chooseRectByReference(referenceRect, rawRect, plusRect, minusRect) {
  if (!referenceRect) return { rect: rawRect, source: "raw" };
  var dRaw = rectDistance(referenceRect, rawRect);
  var dPlus = plusRect ? rectDistance(referenceRect, plusRect) : 999999;
  var dMinus = minusRect ? rectDistance(referenceRect, minusRect) : 999999;
  if (dPlus + 0.01 < dRaw && dPlus + 0.01 < dMinus) return { rect: plusRect, source: "raw_plus_artboard" };
  if (dMinus + 0.01 < dRaw && dMinus + 0.01 < dPlus) return { rect: minusRect, source: "raw_minus_artboard" };
  return { rect: rawRect, source: "raw" };
}

function normalizeUpdateRectForLayer(layer, updateRect, referenceRect, logArr, logPrefix) {
  if (!updateRect) return null;
  var raw = rectWithOffset(updateRect, 0, 0);
  if (!raw) return null;
  var artRect = findContainingArtboardRect(layer);
  if (!artRect) {
    if (logArr && logPrefix) logArr.push(String(logPrefix) + " updateRectNormSource=no_artboard");
    return raw;
  }
  var plus = rectWithOffset(raw, artRect.left, artRect.top);
  var minus = rectWithOffset(raw, -artRect.left, -artRect.top);
  var picked = chooseRectByReference(referenceRect, raw, plus, minus);
  if (logArr && logPrefix) {
    logArr.push(String(logPrefix) + " updateRectNormSource=" + String(picked.source));
    logArr.push(String(logPrefix) + " artboardOffset=" + String(artRect.left) + "," + String(artRect.top));
  }
  return picked.rect || raw;
}

function alignSnapshotRectToCurrentSpace(layer, snapshotRect, currentRect, logArr, logPrefix) {
  if (!snapshotRect || !currentRect) return snapshotRect;
  var raw = rectWithOffset(snapshotRect, 0, 0);
  if (!raw) return snapshotRect;
  var artRect = findContainingArtboardRect(layer);
  if (!artRect) return raw;
  var plus = rectWithOffset(raw, artRect.left, artRect.top);
  var minus = rectWithOffset(raw, -artRect.left, -artRect.top);
  var picked = chooseRectByReference(currentRect, raw, plus, minus);
  var mixed = null;
  var mixedSource = null;
  var dxRaw = Math.abs(Number(currentRect.x) - Number(raw.x));
  var dyRaw = Math.abs(Number(currentRect.y) - Number(raw.y));
  var dxPlus = plus ? Math.abs(Number(currentRect.x) - Number(plus.x)) : 999999;
  var dyPlus = plus ? Math.abs(Number(currentRect.y) - Number(plus.y)) : 999999;
  var dxMinus = minus ? Math.abs(Number(currentRect.x) - Number(minus.x)) : 999999;
  var dyMinus = minus ? Math.abs(Number(currentRect.y) - Number(minus.y)) : 999999;
  if (plus && dxRaw <= 0.01 && dyPlus + 0.01 < dyRaw) {
    mixed = { x: raw.x, y: plus.y, width: raw.width, height: raw.height };
    mixedSource = "raw_x_raw_plus_artboard_y";
  } else if (minus && dxRaw <= 0.01 && dyMinus + 0.01 < dyRaw) {
    mixed = { x: raw.x, y: minus.y, width: raw.width, height: raw.height };
    mixedSource = "raw_x_raw_minus_artboard_y";
  } else if (plus && dyRaw <= 0.01 && dxPlus + 0.01 < dxRaw) {
    mixed = { x: plus.x, y: raw.y, width: raw.width, height: raw.height };
    mixedSource = "raw_plus_artboard_x_raw_y";
  } else if (minus && dyRaw <= 0.01 && dxMinus + 0.01 < dxRaw) {
    mixed = { x: minus.x, y: raw.y, width: raw.width, height: raw.height };
    mixedSource = "raw_minus_artboard_x_raw_y";
  }
  if (mixed) {
    if (logArr && logPrefix) {
      logArr.push(String(logPrefix) + " stableRectAlignSource=" + String(mixedSource));
    }
    return mixed;
  }
  if (logArr && logPrefix) {
    logArr.push(String(logPrefix) + " stableRectAlignSource=" + String(picked.source));
  }
  return picked.rect || raw;
}

function fitLayerToRect(layer, rect) {
  if (!layer) return "missing_layer";
  if (!rect) return "missing_rect";
  if (typeof rect.x !== "number" || typeof rect.y !== "number" || typeof rect.width !== "number" || typeof rect.height !== "number") {
    return "invalid_rect";
  }
  if (!isFinite(rect.x) || !isFinite(rect.y) || !isFinite(rect.width) || !isFinite(rect.height)) return "invalid_rect";
  if (rect.width <= 0 || rect.height <= 0) return "invalid_rect";
  try {
    var b = getLayerBounds(layer);
    if (!b || b.width <= 0 || b.height <= 0) return "invalid_layer_bounds";
    var scaleX = rect.width / b.width;
    var scaleY = rect.height / b.height;
    if (!isFinite(scaleX) || !isFinite(scaleY)) return "invalid_scale";
    var scale = scaleX;
    if (!isFinite(scale) || scale <= 0) return "invalid_scale";
    var pct = scale * 100;
    var method = ResampleMethod.BICUBIC;
    if (scale < 1) method = ResampleMethod.BICUBICSHARPER;
    else if (scale > 1) method = ResampleMethod.BICUBICSMOOTHER;
    withInterpolation(method, function () {
      layer.resize(pct, pct, AnchorPosition.TOPLEFT);
    });
    var b2 = getLayerBounds(layer);
    if (!b2) return "post_resize_bounds_failed";
    var dx = rect.x - b2.x;
    var dy = (rect.y + (rect.height - b2.height) / 2) - b2.y;
    if (isFinite(dx) && isFinite(dy)) layer.translate(dx, dy);
    return null;
  } catch (e) {
    try {
      return String(e && (e.message || e.toString()) ? (e.message || e.toString()) : e);
    } catch (e2) {
      return "fit_exception";
    }
  }
}

function applyTextAlign(layer, align) {
  if (!layer) return;
  if (!(layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT)) return;
  if (align === null || align === undefined) return;
  var a = String(align).toLowerCase();
  try {
    if (a === "center") {
      layer.textItem.justification = Justification.CENTER;
    } else if (a === "right") {
      layer.textItem.justification = Justification.RIGHT;
    } else if (a === "left") {
      layer.textItem.justification = Justification.LEFT;
    }
  } catch (e0) {}
}

function applyTextUpdate(layer, value, align) {
  if (!layer) return false;
  if (!(layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT)) return false;
  try {
    var v = String(value == null ? "" : value);
    v = v.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
    layer.textItem.contents = v;
  } catch (e1) {
    return false;
  }
  applyTextAlign(layer, align);
  return true;
}

function readRectFromUpdate(u) {
  if (!u) return null;
  var x = (u.x != null) ? Number(u.x) : NaN;
  var y = (u.y != null) ? Number(u.y) : NaN;
  var w = (u.width != null) ? Number(u.width) : NaN;
  var h = (u.height != null) ? Number(u.height) : NaN;
  if (!(isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h))) return null;
  if (w <= 0 || h <= 0) return null;
  return { x: x, y: y, width: w, height: h };
}

function resolveTextAnchorAlign(layer, align) {
  var raw = align;
  if (raw !== null && raw !== undefined) {
    var direct = String(raw).toLowerCase();
    if (direct === "left" || direct === "center" || direct === "right") return direct;
  }
  try {
    if (layer && layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT) {
      var j = layer.textItem ? layer.textItem.justification : null;
      var s = String(j == null ? "" : j).toLowerCase();
      if (s.indexOf("center") >= 0) return "center";
      if (s.indexOf("right") >= 0) return "right";
    }
  } catch (e0) {}
  return "left";
}

function readTextAnchorPoint(layer) {
  if (!(layer && layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT)) return null;
  try {
    var p = layer.textItem ? layer.textItem.position : null;
    if (!p || p.length < 2) return null;
    var x = Number(p[0].as("px"));
    var y = Number(p[1].as("px"));
    if (!(isFinite(x) && isFinite(y))) return null;
    return { x: x, y: y };
  } catch (e0) {
    return null;
  }
}

function restoreTextAnchorPoint(layer, pt) {
  if (!pt) return false;
  if (!(layer && layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT)) return false;
  var x = Number(pt.x);
  var y = Number(pt.y);
  if (!(isFinite(x) && isFinite(y))) return false;
  try {
    layer.textItem.position = [UnitValue(x, "px"), UnitValue(y, "px")];
    return true;
  } catch (e0) {
    return false;
  }
}

function formatPointForLog(pt) {
  if (!pt) return "null";
  var x = Number(pt.x);
  var y = Number(pt.y);
  if (!(isFinite(x) && isFinite(y))) return "invalid";
  return String(x) + "," + String(y);
}

function formatRectForLog(rect) {
  if (!rect) return "null";
  var x = Number(rect.x);
  var y = Number(rect.y);
  var w = Number(rect.width);
  var h = Number(rect.height);
  if (!(isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h))) return "invalid";
  return String(x) + "," + String(y) + "," + String(w) + "," + String(h);
}

function collectLayerChainNames(layer) {
  var out = [];
  var cur = layer;
  var guard = 0;
  while (cur && guard < 80) {
    var n = "";
    try { n = String(cur.name || ""); } catch (e0) { n = ""; }
    if (n) out.push(n);
    try {
      if (!cur.parent || cur.parent.typename === "Document") break;
      cur = cur.parent;
    } catch (e1) {
      break;
    }
    guard += 1;
  }
  return out.reverse().join(" > ");
}

function pickDesiredImageRect(placeRect, updateRect, fallbackRect, logArr, updateIndex) {
  var idx = (updateIndex != null) ? String(updateIndex) : "";
  if (placeRect) {
    if (updateRect) {
      var dist = rectDistance(updateRect, placeRect);
      if (logArr) logArr.push("img_update[" + idx + "] desiredRectDistance(update,placeRect)=" + String(dist));
      if (dist <= 1.5) {
        if (logArr) logArr.push("img_update[" + idx + "] desiredRectSource=update");
        return updateRect;
      }
      if (logArr) {
        logArr.push("img_update[" + idx + "] desiredRectSource=placeRect");
        logArr.push("img_update[" + idx + "] desiredRectRejected=update_distance_" + String(dist));
      }
      return placeRect;
    }
    if (logArr) logArr.push("img_update[" + idx + "] desiredRectSource=placeRect");
    return placeRect;
  }
  if (updateRect) {
    if (logArr) logArr.push("img_update[" + idx + "] desiredRectSource=update");
    return updateRect;
  }
  if (fallbackRect) {
    if (logArr) logArr.push("img_update[" + idx + "] desiredRectSource=fallback");
    return fallbackRect;
  }
  if (logArr) logArr.push("img_update[" + idx + "] desiredRectSource=none");
  return null;
}

function alignTextLayerToRect(layer, desiredRect, align) {
  if (!layer) return false;
  if (!desiredRect) return false;
  var a = resolveTextAnchorAlign(layer, align);
  var b = null;
  try { b = getLayerBounds(layer); } catch (e0) { b = null; }
  if (!b) return false;
  var targetX = desiredRect.x;
  if (a === "center") targetX = desiredRect.x + (desiredRect.width - b.width) / 2;
  else if (a === "right") targetX = desiredRect.x + desiredRect.width - b.width;
  var dx = targetX - b.x;
  var dy = desiredRect.y - b.y;
  if (!(isFinite(dx) && isFinite(dy))) return false;
  if (dx === 0 && dy === 0) return true;
  try {
    layer.translate(dx, dy);
    return true;
  } catch (e1) {
    return false;
  }
}

function convertLayerToSmartObject(layer) {
  if (!layer) return null;
  if (isSmartObjectLayer(layer)) return layer;
  try {
    app.activeDocument.activeLayer = layer;
    executeAction(stringIDToTypeID("newPlacedLayer"), undefined, DialogModes.NO);
    return app.activeDocument.activeLayer;
  } catch (e) {
    return layer;
  }
}

function getLayerIdSafe(layer) {
  var id = -1;
  try { id = layer.id; } catch (e) { id = -1; }
  return id;
}

function getLayerNameSafe(layer) {
  var name = null;
  try { name = layer.name; } catch (e) { name = null; }
  return name;
}

function resolveLayerByIdFromDoc(doc, layerId) {
  var d = doc || null;
  var id = Number(layerId);
  if (!d || !(isFinite(id) && id > 0)) return null;
  try {
    app.activeDocument = d;
    selectLayerById(id);
    return d.activeLayer;
  } catch (e) {
    return null;
  }
}

function getLayerMaskInfo(layer) {
  var res = { hasUserMask: null, hasVectorMask: null, isClipping: null };
  if (!layer) return res;
  try {
    var ref = new ActionReference();
    ref.putIdentifier(charIDToTypeID("Lyr "), getLayerIdSafe(layer));
    var desc = executeActionGet(ref);
    try { res.hasUserMask = desc.hasKey(charIDToTypeID("UsrM")); } catch (e0) { res.hasUserMask = null; }
    try { res.hasVectorMask = desc.hasKey(stringIDToTypeID("vectorMask")); } catch (e1) { res.hasVectorMask = null; }
    try { res.isClipping = desc.hasKey(stringIDToTypeID("group")) ? desc.getBoolean(stringIDToTypeID("group")) : null; } catch (e2) { res.isClipping = null; }
  } catch (e) {}
  return res;
}

function removeUserMaskFromActiveLayer() {
  try {
    var idDlt = charIDToTypeID("Dlt ");
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
    desc.putReference(charIDToTypeID("null"), ref);
    desc.putBoolean(charIDToTypeID("Aply"), false);
    executeAction(idDlt, desc, DialogModes.NO);
    return true;
  } catch (e) {
    return false;
  }
}

function releaseClippingFromActiveLayer() {
  try {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("null"), ref);
    var desc2 = new ActionDescriptor();
    desc2.putBoolean(stringIDToTypeID("group"), false);
    desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Lyr "), desc2);
    executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
    return true;
  } catch (e) {
    return false;
  }
}

function captureSiblingPlacement(targetLayer) {
  var info = { parent: null, ref: null, parentId: null, refId: null, placement: null };
  if (!targetLayer) return info;
  var parent = null;
  try { parent = targetLayer.parent; } catch (e0) { parent = null; }
  info.parent = parent;
  if (parent && parent.typename !== "Document") {
    var pid = getLayerIdSafe(parent);
    if (isFinite(pid) && pid > 0) info.parentId = pid;
  }
  if (!parent || parent.typename === "Document") return info;
  try {
    var siblings = parent.layers;
    var tid = getLayerIdSafe(targetLayer);
    var idx = -1;
    for (var i = 0; i < siblings.length; i += 1) {
      if (getLayerIdSafe(siblings[i]) === tid) { idx = i; break; }
    }
    if (idx > 0) {
      info.ref = siblings[idx - 1];
      var rid = getLayerIdSafe(info.ref);
      if (isFinite(rid) && rid > 0) info.refId = rid;
      info.placement = ElementPlacement.PLACEAFTER;
    } else if (idx === 0 && siblings.length > 1) {
      info.ref = siblings[1];
      var rid2 = getLayerIdSafe(info.ref);
      if (isFinite(rid2) && rid2 > 0) info.refId = rid2;
      info.placement = ElementPlacement.PLACEBEFORE;
    }
  } catch (e1) {}
  return info;
}

function restoreLayerPlacement(layer, info) {
  if (!layer || !info) return;
  var doc = null;
  try { doc = app.activeDocument; } catch (eDoc) { doc = null; }
  var parent = null;
  if (info.parentId != null) parent = resolveLayerByIdFromDoc(doc, info.parentId);
  if (!parent) parent = info.parent || null;
  if (parent && parent.typename !== "Document") {
    try {
      if (layer.parent !== parent) layer.move(parent, ElementPlacement.PLACEATBEGINNING);
    } catch (e0) {}
  }
  var refLayer = null;
  if (info.refId != null) refLayer = resolveLayerByIdFromDoc(doc, info.refId);
  if (!refLayer) refLayer = info.ref || null;
  if (refLayer && info.placement) {
    try {
      if (layer.parent === refLayer.parent) layer.move(refLayer, info.placement);
    } catch (e1) {}
  }
}

function restoreLayerArtboardPosition(layer, desiredRect, logArr, logPrefix) {
  if (!layer || !desiredRect) return;
  var now = null;
  try { now = getLayerBounds(layer); } catch (e0) { now = null; }
  if (!now) return;
  var dx = Number(desiredRect.x) - Number(now.x);
  var dy = Number(desiredRect.y) - Number(now.y);
  if (!(isFinite(dx) && isFinite(dy))) return;
  if (Math.abs(dx) <= 0.25 && Math.abs(dy) <= 0.25) return;
  try {
    layer.translate(dx, dy);
    if (logArr) {
      var key = logPrefix ? String(logPrefix) : "artboard_restore";
      logArr.push(key + " restoreDxDy=" + String(dx) + "," + String(dy));
    }
  } catch (e1) {
    if (logArr) {
      var key2 = logPrefix ? String(logPrefix) : "artboard_restore";
      logArr.push(key2 + " restoreFailed=" + String(e1));
    }
  }
}

function collectTextLayers(container, outArr) {
  if (!container || !outArr) return;
  var layers = null;
  try { layers = container.layers; } catch (e0) { layers = null; }
  if (!layers) return;
  for (var i = 0; i < layers.length; i += 1) {
    var layer = layers[i];
    if (!layer) continue;
    var isText = false;
    try { isText = layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT; } catch (e1) { isText = false; }
    if (isText) {
      outArr.push(layer);
      continue;
    }
    var hasChildren = false;
    try { hasChildren = (layer.typename === "LayerSet") && layer.layers && layer.layers.length > 0; } catch (e2) { hasChildren = false; }
    if (hasChildren) collectTextLayers(layer, outArr);
  }
}

function captureStableTextBounds(doc) {
  var snapshots = {};
  if (!doc) return snapshots;
  var layers = [];
  collectTextLayers(doc, layers);
  for (var i = 0; i < layers.length; i += 1) {
    var layer = layers[i];
    if (!layer) continue;
    var psId = getLayerIdSafe(layer);
    if (!(isFinite(psId) && psId > 0)) continue;
    var rect = null;
    try { rect = getLayerBounds(layer); } catch (e0) { rect = null; }
    if (!rect) continue;
    snapshots[String(psId)] = rect;
  }
  return snapshots;
}

function captureStableUpdateRects(doc, updates, logArr) {
  var out = {};
  if (!doc || !updates || !(updates instanceof Array)) return out;
  var seen = {};
  for (var i = 0; i < updates.length; i += 1) {
    var u = updates[i] || {};
    var psId = (u && u.psId != null) ? Number(u.psId) : NaN;
    if (!(isFinite(psId) && psId > 0)) continue;
    var key = String(psId);
    if (seen[key]) continue;
    seen[key] = true;
    try {
      app.activeDocument = doc;
      selectLayerById(psId);
      var layer = doc.activeLayer;
      if (!layer) continue;
      var rect = null;
      try { rect = getLayerBounds(layer); } catch (eR) { rect = null; }
      if (!rect) continue;
      out[key] = rect;
    } catch (e0) {}
  }
  if (logArr) {
    var c = 0;
    for (var k in out) if (out.hasOwnProperty(k)) c += 1;
    logArr.push("stable_update_rect_count=" + String(c));
  }
  return out;
}

function upsertStableTextBounds(doc, snapshots, psId) {
  if (!doc || !snapshots) return;
  var n = Number(psId);
  if (!(isFinite(n) && n > 0)) return;
  try {
    app.activeDocument = doc;
    selectLayerById(n);
    var layer = doc.activeLayer;
    if (!(layer && layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT)) return;
    var rect = null;
    try { rect = getLayerBounds(layer); } catch (e0) { rect = null; }
    if (!rect) return;
    snapshots[String(n)] = rect;
  } catch (e1) {}
}

function restoreStableTextBounds(doc, snapshots, logArr) {
  if (!doc || !snapshots) return;
  for (var k in snapshots) {
    if (!snapshots.hasOwnProperty(k)) continue;
    var psId = Number(k);
    if (!(isFinite(psId) && psId > 0)) continue;
    var desired = snapshots[k] || null;
    if (!desired) continue;
    try {
      app.activeDocument = doc;
      selectLayerById(psId);
      var layer = doc.activeLayer;
      if (!(layer && layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT)) continue;
      var nowRect = null;
      try { nowRect = getLayerBounds(layer); } catch (eNow) { nowRect = null; }
      if (!nowRect) continue;
      var desiredAligned = alignSnapshotRectToCurrentSpace(layer, desired, nowRect, logArr, "stable_text_restore[" + String(psId) + "]");
      if (!desiredAligned) continue;
      var dx = desiredAligned.x - nowRect.x;
      var dy = desiredAligned.y - nowRect.y;
      if (!(isFinite(dx) && isFinite(dy))) continue;
      if (Math.abs(dx) <= 0.25 && Math.abs(dy) <= 0.25) continue;
      layer.translate(dx, dy);
      if (logArr) logArr.push("stable_text_restored psId=" + String(psId) + " dx=" + String(dx) + " dy=" + String(dy));
    } catch (e1) {
      if (logArr) logArr.push("stable_text_restore_failed psId=" + String(psId) + " err=" + String(e1));
    }
  }
}

function newSmartObjectViaCopy(layer) {
  var res = { layer: null, error: null };
  try {
    app.activeDocument.activeLayer = layer;
    try {
      app.runMenuItem(stringIDToTypeID("placedLayerMakeCopy"));
    } catch (eMenu) {
      executeAction(stringIDToTypeID("placedLayerNewPlacedLayer"), undefined, DialogModes.NO);
    }
    res.layer = app.activeDocument.activeLayer;
  } catch (e) {
    try { res.error = String(e && (e.message || e.toString()) ? (e.message || e.toString()) : e); } catch (e2) { res.error = "new_so_copy_failed"; }
  }
  return res;
}

function isolateSmartObjectLayer(layer) {
  var result = { layer: null, error: null };
  if (!layer) { result.error = "missing_layer"; return result; }
  try {
    if (layer.allLocked || layer.pixelsLocked || layer.positionLocked || layer.transparentPixelsLocked) {
      layer.allLocked = false;
      layer.pixelsLocked = false;
      layer.positionLocked = false;
      layer.transparentPixelsLocked = false;
    }
  } catch (eLock) {}

  if (!isSmartObjectLayer(layer)) {
    var converted = convertLayerToSmartObject(layer);
    result.layer = converted;
    if (!isSmartObjectLayer(converted)) result.error = "convert_failed";
    return result;
  }

  var name = getLayerNameSafe(layer);
  var copyRes = null;
  try { copyRes = newSmartObjectViaCopy(layer); } catch (eCopy0) { copyRes = null; }
  if (copyRes && copyRes.layer && isSmartObjectLayer(copyRes.layer)) {
    result.layer = copyRes.layer;
    if (result.layer && name) result.layer.name = name;
    try { layer.remove(); } catch (eRm0) { result.error = "remove_original_failed:" + String(eRm0); try { layer.visible = false; } catch (eVis0) {} }
    return result;
  }
  result.layer = layer;
  if (copyRes && copyRes.error) result.error = "copy_failed:" + String(copyRes.error);
  else result.error = "copy_failed";
  return result;
}

function ensureWhiteBackground(doc) {
  try {
    app.activeDocument = doc;
    var c = new SolidColor();
    c.rgb.red = 255;
    c.rgb.green = 255;
    c.rgb.blue = 255;
    var layer = doc.artLayers.add();
    layer.name = "__white_bg__";
    layer.move(doc, ElementPlacement.PLACEATEND);
    doc.activeLayer = layer;
    doc.selection.selectAll();
    doc.selection.fill(c, ColorBlendMode.NORMAL, 100, false);
    doc.selection.deselect();
  } catch (e) {}
}

function findAlphaChannel(doc) {
  var i;
  try {
    for (i = 0; i < doc.channels.length; i += 1) {
      var c = doc.channels[i];
      if (c && String(c.name).toLowerCase() === "alpha 1") return c;
    }
  } catch (e0) {
  }
  try {
    for (i = 0; i < doc.channels.length; i += 1) {
      var c2 = doc.channels[i];
      if (c2 && String(c2.name).toLowerCase().indexOf("alpha") === 0) return c2;
    }
  } catch (e1) {
  }
  return null;
}

function addLayerMaskFromSelection() {
  var idMk = charIDToTypeID("Mk  ");
  var desc = new ActionDescriptor();
  var idNw = charIDToTypeID("Nw  ");
  var idChnl = charIDToTypeID("Chnl");
  desc.putClass(idNw, idChnl);
  var ref = new ActionReference();
  ref.putEnumerated(idChnl, idChnl, charIDToTypeID("Msk "));
  desc.putReference(charIDToTypeID("At  "), ref);
  desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
  executeAction(idMk, desc, DialogModes.NO);
}

function deleteLayerMaskIfExists() {
  var idDlt = charIDToTypeID("Dlt ");
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
  desc.putReference(charIDToTypeID("null"), ref);
  executeAction(idDlt, desc, DialogModes.NO);
}

function applyAlphaMaskFromTga(workDoc, channelPath, invert) {
  var channelDoc = null;
  var tmpChannel = null;
  try {
    app.activeDocument = workDoc;
    channelDoc = app.open(new File(channelPath));
    var alpha = findAlphaChannel(channelDoc);
    if (!alpha) throw new Error("alpha_channel_not_found");
    tmpChannel = alpha.duplicate(workDoc, ElementPlacement.PLACEATEND);
    try { channelDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
    channelDoc = null;
    app.activeDocument = workDoc;
    try { workDoc.selection.deselect(); } catch (eDesel0) {}
    workDoc.selection.load(tmpChannel, SelectionType.REPLACE);
    if (invert === true) workDoc.selection.invert();
    try {
      addLayerMaskFromSelection();
    } catch (eMk) {
      try { deleteLayerMaskIfExists(); } catch (eDlt) {}
      addLayerMaskFromSelection();
    }
    try { workDoc.selection.deselect(); } catch (eDesel1) {}
    try { tmpChannel.remove(); } catch (eRm) {}
    tmpChannel = null;
    return { ok: true };
  } catch (e) {
    try { if (tmpChannel) tmpChannel.remove(); } catch (eRm2) {}
    try { if (channelDoc) channelDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose2) {}
    return { ok: false, message: String(e) };
  }
}

function jpegQualityFromPercent(quality) {
  var q100 = Math.max(1, Math.min(100, Number(quality) || 100));
  var q12 = Math.ceil((q100 * 12) / 100);
  if (!isFinite(q12)) q12 = 12;
  if (q12 < 1) q12 = 1;
  if (q12 > 12) q12 = 12;
  return q12;
}

function saveJpegWithoutXMP(doc, outputPath, quality12) {
  var sTT = stringIDToTypeID;
  var saveDesc = new ActionDescriptor();
  var jpegDesc = new ActionDescriptor();
  jpegDesc.putInteger(sTT("quality"), Number(quality12) || 8);
  jpegDesc.putBoolean(sTT("embedColorProfile"), false);
  jpegDesc.putEnumerated(sTT("formatOptions"), sTT("formatOptionsType"), sTT("optimizedBaseline"));
  jpegDesc.putBoolean(sTT("scanInterlace"), false);
  saveDesc.putObject(sTT("as"), sTT("JPEGFormat"), jpegDesc);
  saveDesc.putPath(sTT("in"), new File(outputPath));
  saveDesc.putBoolean(sTT("copy"), true);
  executeAction(sTT("save"), saveDesc, DialogModes.NO);
}

function cropToActiveArtboard(doc, logArr) {
  if (!doc) return false;
  try {
    app.activeDocument = doc;
    var layer = doc.activeLayer;
    if (!layer) return false;
    var artboardRect = null;
    var checkLayer = layer;
    var depth = 0;
    while (checkLayer && depth < 60) {
      try {
        var layerId = checkLayer.id;
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("artboard"));
        ref.putIdentifier(charIDToTypeID("Lyr "), layerId);
        var desc = executeActionGet(ref);
        if (desc && desc.hasKey(stringIDToTypeID("artboard"))) {
          var artboard = desc.getObjectValue(stringIDToTypeID("artboard"));
          if (artboard && artboard.hasKey(stringIDToTypeID("artboardRect"))) {
            var rectDesc = artboard.getObjectValue(stringIDToTypeID("artboardRect"));
            var left = rectDesc.getDouble(stringIDToTypeID("Left"));
            var top = rectDesc.getDouble(stringIDToTypeID("Top "));
            var right = rectDesc.getDouble(stringIDToTypeID("Rght"));
            var bottom = rectDesc.getDouble(stringIDToTypeID("Btom"));
            artboardRect = { left: left, top: top, right: right, bottom: bottom };
            break;
          }
        }
        checkLayer = checkLayer.parent;
      } catch (e1) {
        checkLayer = null;
      }
      depth += 1;
    }
    if (!artboardRect) {
      if (logArr) logArr.push("cropToActiveArtboard: no_artboard_found");
      return false;
    }
    var docWidth = Number(doc.width.as("px"));
    var docHeight = Number(doc.height.as("px"));
    var eps = 2;
    var needsCrop = (artboardRect.left > eps || artboardRect.top > eps ||
                     artboardRect.right < docWidth - eps || artboardRect.bottom < docHeight - eps);
    if (!needsCrop) {
      if (logArr) logArr.push("cropToActiveArtboard: already_fits;rect=" +
        Math.round(artboardRect.left) + "," + Math.round(artboardRect.top) + "," +
        Math.round(artboardRect.right) + "," + Math.round(artboardRect.bottom));
      return false;
    }
    try { doc.flatten(); } catch (eFlat) {}
    var idCrop = charIDToTypeID("Crop");
    var cropDesc = new ActionDescriptor();
    var idT = charIDToTypeID("T   ");
    var idRctn = charIDToTypeID("Rctn");
    var cropRect = new ActionDescriptor();
    cropRect.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), artboardRect.top);
    cropRect.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), artboardRect.left);
    cropRect.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), artboardRect.bottom);
    cropRect.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), artboardRect.right);
    cropDesc.putObject(idT, idRctn, cropRect);
    cropDesc.putBoolean(stringIDToTypeID("cropBottomRight"), false);
    cropDesc.putBoolean(stringIDToTypeID("cropTopLeft"), false);
    cropDesc.putBoolean(stringIDToTypeID("cropConstrain"), false);
    executeAction(idCrop, cropDesc, DialogModes.NO);
    if (logArr) logArr.push("cropToActiveArtboard: done;rect=" +
      Math.round(artboardRect.left) + "," + Math.round(artboardRect.top) + "," +
      Math.round(artboardRect.right) + "," + Math.round(artboardRect.bottom) +
      ";size=" + Math.round(artboardRect.right - artboardRect.left) + "x" +
      Math.round(artboardRect.bottom - artboardRect.top));
    return true;
  } catch (e) {
    if (logArr) logArr.push("cropToActiveArtboard: failed:" + String(e));
    return false;
  }
}

function exportImage(doc, outputPath, format, quality) {
  var fmt = String(format == null ? "png" : format).toLowerCase();
  var warnings = [];
  var outPathUsed = String(outputPath || "");
  safeMkdirForFile(outPathUsed);
  if (fmt === "psd") {
    return withSavePrefs(function () {
      var outFile0 = new File(outPathUsed);
      var psdOpts = new PhotoshopSaveOptions();
      psdOpts.alphaChannels = true;
      psdOpts.layers = true;
      psdOpts.maximizeCompatibility = false;
      try {
        doc.saveAs(outFile0, psdOpts, true);
        return { outputPathUsed: outPathUsed, formatUsed: "psd", warnings: warnings };
      } catch (ePsd) {
        if (!isPsdTooLargeSaveError(ePsd)) throw ePsd;
        var psbPath = replaceFileExt(outPathUsed, "psb");
        if (typeof LargeDocumentFormatSaveOptions === "undefined") {
          try {
            saveAsPsbByActionManager(psbPath);
            warnings.push("psd_too_large_fallback_psb_am");
            return { outputPathUsed: psbPath, formatUsed: "psb", warnings: warnings };
          } catch (eAm) {
            warnings.push("psb_action_manager_failed");
            warnings.push("psb_save_options_unsupported");
            warnings.push("psd_too_large_fallback_flatten_psd");
            var flatPath = appendSuffixBeforeExt(outPathUsed, "_flatten");
            safeMkdirForFile(flatPath);
            try { doc.flatten(); } catch (eFlat0) {}
            var psdFlatOpts = new PhotoshopSaveOptions();
            psdFlatOpts.alphaChannels = true;
            psdFlatOpts.layers = false;
            psdFlatOpts.maximizeCompatibility = false;
            doc.saveAs(new File(flatPath), psdFlatOpts, true);
            return { outputPathUsed: flatPath, formatUsed: "psd", warnings: warnings };
          }
        }
        var outFilePsb = new File(psbPath);
        safeMkdirForFile(psbPath);
        var psbOpts = new LargeDocumentFormatSaveOptions();
        psbOpts.alphaChannels = true;
        psbOpts.layers = true;
        psbOpts.maximizeCompatibility = false;
        doc.saveAs(outFilePsb, psbOpts, true, Extension.LOWERCASE);
        warnings.push("psd_too_large_fallback_psb");
        return { outputPathUsed: psbPath, formatUsed: "psb", warnings: warnings };
      }
    });
  }
  if (fmt === "psb") {
    return withSavePrefs(function () {
      if (typeof LargeDocumentFormatSaveOptions !== "undefined") {
        var outFile1 = new File(outPathUsed);
        var psbOpts2 = new LargeDocumentFormatSaveOptions();
        psbOpts2.alphaChannels = true;
        psbOpts2.layers = true;
        psbOpts2.maximizeCompatibility = false;
        doc.saveAs(outFile1, psbOpts2, true, Extension.LOWERCASE);
        return { outputPathUsed: outPathUsed, formatUsed: "psb", warnings: warnings };
      }
      try {
        saveAsPsbByActionManager(outPathUsed);
        warnings.push("psb_saved_by_action_manager");
        return { outputPathUsed: outPathUsed, formatUsed: "psb", warnings: warnings };
      } catch (eAm2) {
        throw new Error("psb_save_options_unsupported");
      }
    });
  }
  var outFile = new File(outPathUsed);
  var opts = new ExportOptionsSaveForWeb();
  if (fmt === "jpg" || fmt === "jpeg") {
    ensureWhiteBackground(doc);
    cropToActiveArtboard(doc, warnings);
    try { doc.flatten(); } catch (eFlat) {}
    try {
      saveJpegWithoutXMP(doc, outPathUsed, jpegQualityFromPercent(quality));
      if (warnings) warnings.push("jpeg_saved_via_actionmanager");
      return { outputPathUsed: outPathUsed, formatUsed: "jpeg", warnings: warnings };
    } catch (eJ) {
      if (warnings) warnings.push("jpeg_actionmanager_failed:" + String(eJ));
    }
    try {
      var j = new JPEGSaveOptions();
      j.quality = jpegQualityFromPercent(quality);
      j.embedColorProfile = false;
      j.formatOptions = FormatOptions.STANDARDBASELINE;
      j.matte = MatteType.NONE;
      doc.saveAs(outFile, j, true, Extension.LOWERCASE);
      if (warnings) warnings.push("jpeg_saved_via_jsapi");
      return { outputPathUsed: outPathUsed, formatUsed: "jpeg", warnings: warnings };
    } catch (eJ2) {
      if (warnings) warnings.push("jpeg_jsapi_failed:" + String(eJ2));
    }
    if (warnings) warnings.push("jpeg_fallback_to_saveweb");
    opts.format = SaveDocumentType.JPEG;
    opts.quality = Math.max(1, Math.min(100, Number(quality) || 100));
    opts.optimized = true;
    opts.blur = 0;
    opts.includeProfile = false;
    opts.interlaced = false;
  } else {
    try {
      var p = new PNGSaveOptions();
      p.interlaced = false;
      p.compression = 0;
      doc.saveAs(outFile, p, true, Extension.LOWERCASE);
      return { outputPathUsed: outPathUsed, formatUsed: "png", warnings: warnings };
    } catch (ePng) {}
    opts.format = SaveDocumentType.PNG;
    opts.PNG8 = false;
    opts.transparency = true;
    opts.interlaced = false;
    opts.quality = 100;
  }
  doc.exportDocument(outFile, ExportType.SAVEFORWEB, opts);
  return { outputPathUsed: outPathUsed, formatUsed: fmt, warnings: warnings };
}

function applyUpdatesToDoc(workDoc, updates, logArr, artboardRenames, updateOptions) {
  var ok = true;
  var updatedText = 0;
  var updatedImage = 0;
  var errors = [];
  var renameMap = sanitizeArtboardRenameMap(artboardRenames);
  var opts = (updateOptions && typeof updateOptions === "object") ? updateOptions : {};
  var preserveArtboardTextPosition = opts.preserveArtboardTextPosition === true;
  var stableStartedAt = preserveArtboardTextPosition ? (new Date().getTime()) : 0;
  var stableTextBounds = preserveArtboardTextPosition ? captureStableTextBounds(workDoc) : null;
  var stableUpdateRects = preserveArtboardTextPosition ? captureStableUpdateRects(workDoc, updates, logArr) : null;
  var pendingStableTextRestore = preserveArtboardTextPosition && !!stableTextBounds;
  if (preserveArtboardTextPosition && logArr) {
    logArr.push("stable_text_mode=on");
  }
  var i;
  for (i = 0; i < updates.length; i += 1) {
    var u = updates[i];
    var psId = (u && u.psId != null) ? Number(u.psId) : NaN;
    if (!(isFinite(psId) && psId > 0)) {
      ok = false;
      errors.push({ index: i, name: u && u.name ? String(u.name) : "", message: "psid_required" });
      continue;
    }
    try {
      app.activeDocument = workDoc;
      selectLayerById(psId);
      var target = workDoc.activeLayer;
      workDoc.activeLayer = target;
      if (u && u.varType === "text") {
        var resolvedTextAlign = resolveTextAnchorAlign(target, u.align);
        var desiredRectText = null;
        var desiredRectTextSource = "none";
        var currentRectText = null;
        try { currentRectText = getLayerBounds(target); } catch (eRtC) { currentRectText = null; }
        var updateRectText = null;
        try { updateRectText = readRectFromUpdate(u); } catch (eRt0) { updateRectText = null; }
        if (updateRectText) {
          updateRectText = normalizeUpdateRectForLayer(target, updateRectText, currentRectText, logArr, "text_update[" + String(i) + "]");
        }
        if (preserveArtboardTextPosition) {
          if (stableUpdateRects && stableUpdateRects[String(psId)]) {
            desiredRectText = stableUpdateRects[String(psId)];
            desiredRectText = alignSnapshotRectToCurrentSpace(target, desiredRectText, currentRectText, logArr, "text_update[" + String(i) + "]");
            desiredRectTextSource = "stableSnapshot";
          } else if (updateRectText) {
            desiredRectText = updateRectText;
            desiredRectTextSource = "updateRectNormalized";
          } else {
            desiredRectText = currentRectText;
            if (desiredRectText) desiredRectTextSource = "currentLayer";
          }
        } else {
          desiredRectText = updateRectText;
          if (desiredRectText) desiredRectTextSource = "updateRectNormalized";
          if (!desiredRectText) {
            desiredRectText = currentRectText;
            if (desiredRectText) desiredRectTextSource = "currentLayer";
          }
        }
        try {
          if (logArr) {
            logArr.push("text_update[" + String(i) + "] psId=" + String(psId));
            logArr.push("text_update[" + String(i) + "] layerName=" + String(getLayerNameSafe(target) || ""));
            logArr.push("text_update[" + String(i) + "] alignInput=" + String(u && u.align != null ? u.align : ""));
            logArr.push("text_update[" + String(i) + "] alignResolved=" + String(resolvedTextAlign));
            logArr.push("text_update[" + String(i) + "] desiredRectSource=" + String(desiredRectTextSource));
            logArr.push("text_update[" + String(i) + "] desiredRect=" + formatRectForLog(desiredRectText));
          }
        } catch (eTL0) {}
        var textAnchorBefore = readTextAnchorPoint(target);
        if (applyTextUpdate(target, u.value, u.align)) {
          var anchorRestored = false;
          if (textAnchorBefore) {
            anchorRestored = restoreTextAnchorPoint(target, textAnchorBefore);
          }
          var anchorPosDistance = NaN;
          var rectReplayApplied = false;
          if (desiredRectText) {
            var rectAfterAnchor = null;
            try { rectAfterAnchor = getLayerBounds(target); } catch (eTaR0) { rectAfterAnchor = null; }
            if (rectAfterAnchor) {
              var posDx = Math.abs(Number(desiredRectText.x) - Number(rectAfterAnchor.x));
              var posDy = Math.abs(Number(desiredRectText.y) - Number(rectAfterAnchor.y));
              if (isFinite(posDx) && isFinite(posDy)) anchorPosDistance = Math.max(posDx, posDy);
              if (isFinite(anchorPosDistance) && anchorPosDistance > 1.5) {
                try { rectReplayApplied = alignTextLayerToRect(target, desiredRectText, resolvedTextAlign); } catch (eTa1) { rectReplayApplied = false; }
              }
            } else if (!anchorRestored) {
              try { rectReplayApplied = alignTextLayerToRect(target, desiredRectText, resolvedTextAlign); } catch (eTa2) { rectReplayApplied = false; }
            }
          }
          if (!anchorRestored && !rectReplayApplied && desiredRectText) {
            try { rectReplayApplied = alignTextLayerToRect(target, desiredRectText, resolvedTextAlign) || rectReplayApplied; } catch (eTa3) {}
          }
          try {
            if (logArr) {
              var afterRectText = null;
              try { afterRectText = getLayerBounds(target); } catch (eTR0) { afterRectText = null; }
              var afterAnchorText = readTextAnchorPoint(target);
              logArr.push("text_update[" + String(i) + "] anchorBefore=" + formatPointForLog(textAnchorBefore));
              logArr.push("text_update[" + String(i) + "] anchorAfter=" + formatPointForLog(afterAnchorText));
              logArr.push("text_update[" + String(i) + "] anchorRestored=" + String(anchorRestored));
              logArr.push("text_update[" + String(i) + "] anchorPosDistance=" + String(anchorPosDistance));
              logArr.push("text_update[" + String(i) + "] rectReplayApplied=" + String(rectReplayApplied));
              logArr.push("text_update[" + String(i) + "] afterRect=" + formatRectForLog(afterRectText));
              if (desiredRectText && afterRectText) {
                logArr.push("text_update[" + String(i) + "] desiredAfterDistance=" + String(rectDistance(desiredRectText, afterRectText)));
              }
            }
          } catch (eTL1) {}
          if (preserveArtboardTextPosition && stableTextBounds) {
            upsertStableTextBounds(workDoc, stableTextBounds, psId);
          }
          updatedText += 1;
        } else {
          ok = false;
          errors.push({ index: i, name: u && u.name ? String(u.name) : "", message: "not_text_layer" });
        }
      } else if (u && u.varType === "img") {
        var imgPath = (u.imageAbsPath != null) ? String(u.imageAbsPath) : (u.imagePath != null ? String(u.imagePath) : "");
        if (!imgPath) {
          ok = false;
          errors.push({ index: i, name: u && u.name ? String(u.name) : "", message: "image_path_missing" });
        } else {
          ensureLayerEditable(target);
          var placeRectBeforeIsolate = null;
          try { placeRectBeforeIsolate = getLayerBounds(target); } catch (eB0x) { placeRectBeforeIsolate = null; }
          var placeInfo = null;
          var duplicateLayer = null;
          var duplicateLayerId = -1;
          var isolateR = null;
          var smartTarget = target;
          placeInfo = captureSiblingPlacement(target);
          try {
            duplicateLayer = target.duplicate();
          } catch (eDup0) {
            duplicateLayer = null;
          }
          smartTarget = duplicateLayer || target;
          duplicateLayerId = getLayerIdSafe(smartTarget);
          isolateR = isolateSmartObjectLayer(smartTarget);
          smartTarget = isolateR && isolateR.layer ? isolateR.layer : smartTarget;
          workDoc.activeLayer = smartTarget;
          try {
            var mi = getLayerMaskInfo(smartTarget);
            if (mi && mi.hasUserMask === true) {
              removeUserMaskFromActiveLayer();
            }
          } catch (eM0) {}
          var placeRect = null;
          try { placeRect = getLayerBounds(smartTarget); } catch (eB0) { placeRect = null; }
          try {
            if (logArr) {
              logArr.push("img_update[" + String(i) + "] psId=" + String(psId));
              logArr.push("img_update[" + String(i) + "] layerName=" + String(getLayerNameSafe(smartTarget) || ""));
              logArr.push("img_update[" + String(i) + "] layerChain=" + collectLayerChainNames(smartTarget));
              logArr.push("img_update[" + String(i) + "] targetLayerId(before)=" + String(getLayerIdSafe(target)));
              logArr.push("img_update[" + String(i) + "] duplicateLayerId(afterDup)=" + String(duplicateLayerId));
              logArr.push("img_update[" + String(i) + "] smartLayerId(afterIsolate)=" + String(getLayerIdSafe(smartTarget)));
              try { logArr.push("img_update[" + String(i) + "] maskInfo=" + JSON.stringify(getLayerMaskInfo(smartTarget))); } catch (eMI0) {}
              logArr.push("img_update[" + String(i) + "] isolateErr=" + String(isolateR && isolateR.error ? isolateR.error : ""));
              logArr.push("img_update[" + String(i) + "] stableMode=" + String(preserveArtboardTextPosition));
              logArr.push("img_update[" + String(i) + "] beforeRect=" + formatRectForLog(placeRect));
              logArr.push("img_update[" + String(i) + "] updateRectRaw=" + formatRectForLog({ x: u.x, y: u.y, width: u.width, height: u.height }));
              logArr.push("img_update[" + String(i) + "] imgPath=" + imgPath);
            }
          } catch (eLog0) {}
          var imgFile = null;
          try { imgFile = new File(imgPath); } catch (eIF0) { imgFile = null; }
          if (!(imgFile && imgFile.exists)) {
            ok = false;
            errors.push({ index: i, name: u && u.name ? String(u.name) : "", message: "image_file_not_found" });
            if (logArr) logArr.push("img_update[" + String(i) + "] imageFileMissing=" + String(imgPath));
            continue;
          }
          replacePlacedContents(imgPath);
          restoreLayerPlacement(smartTarget, placeInfo);
          if (preserveArtboardTextPosition) {
            restoreLayerArtboardPosition(smartTarget, placeRectBeforeIsolate, logArr, "img_update[" + String(i) + "]");
          }
          try { if (target && target !== smartTarget) target.remove(); } catch (eRmDup) {}
          var desiredFromUpdate = null;
          try { desiredFromUpdate = readRectFromUpdate(u); } catch (eDU) { desiredFromUpdate = null; }
          if (desiredFromUpdate) {
            desiredFromUpdate = normalizeUpdateRectForLayer(smartTarget, desiredFromUpdate, placeRect, logArr, "img_update[" + String(i) + "]");
          }
          var desiredFromFallback = null;
          try { desiredFromFallback = readRectFromUpdate({ x: u.x, y: u.y, width: u.width, height: u.height }); } catch (eDF) { desiredFromFallback = null; }
          if (desiredFromFallback) {
            desiredFromFallback = normalizeUpdateRectForLayer(smartTarget, desiredFromFallback, placeRect, logArr, "img_update[" + String(i) + "]_fallback");
          }
          var desiredFromStable = null;
          if (stableUpdateRects && stableUpdateRects[String(psId)]) desiredFromStable = stableUpdateRects[String(psId)];
          if (preserveArtboardTextPosition && desiredFromStable) {
            desiredFromStable = alignSnapshotRectToCurrentSpace(smartTarget, desiredFromStable, placeRect, logArr, "img_update[" + String(i) + "]");
          }
          var placeRectForDesired = placeRect;
          if (preserveArtboardTextPosition && desiredFromStable) placeRectForDesired = desiredFromStable;
          if (logArr) {
            logArr.push("img_update[" + String(i) + "] stableRectParsed=" + formatRectForLog(desiredFromStable));
            logArr.push("img_update[" + String(i) + "] updateRectParsed=" + formatRectForLog(desiredFromUpdate));
            logArr.push("img_update[" + String(i) + "] fallbackRectParsed=" + formatRectForLog(desiredFromFallback));
          }
          var desired = pickDesiredImageRect(placeRectForDesired, desiredFromUpdate, desiredFromFallback, logArr, i);
          var replacedRect = null;
          try { replacedRect = getLayerBounds(smartTarget); } catch (eR0) { replacedRect = null; }
          var skipFit = shouldSkipFitAfterReplace(replacedRect, desired);
          if (logArr) {
            logArr.push("img_update[" + String(i) + "] replacedRect(beforeFit)=" + formatRectForLog(replacedRect));
            logArr.push("img_update[" + String(i) + "] skipFit=" + String(skipFit));
          }
          var fitErr = null;
          if (!skipFit && desired) fitErr = fitLayerToRect(smartTarget, desired);
          if (skipFit && logArr) logArr.push("fitLayerToRect_skipped:already_aligned");
          if (fitErr && logArr) logArr.push("fitLayerToRect_failed:" + String(fitErr));
          renameArtboardGroupByLayer(smartTarget, renameMap, logArr, psId);
          try {
            if (logArr) {
              var afterRect = null;
              try { afterRect = getLayerBounds(smartTarget); } catch (eB2) { afterRect = null; }
              logArr.push("img_update[" + String(i) + "] desiredRect=" + formatRectForLog(desired));
              logArr.push("img_update[" + String(i) + "] afterRect=" + formatRectForLog(afterRect));
              if (desired && afterRect) {
                logArr.push("img_update[" + String(i) + "] desiredAfterDistance=" + String(rectDistance(desired, afterRect)));
              }
            }
          } catch (eLog1) {}
          updatedImage += 1;
          var chPath = (u.channelPath != null) ? String(u.channelPath) : "";
          if (chPath) {
            app.activeDocument = workDoc;
            workDoc.activeLayer = smartTarget;
            var invert = (u.channelInvert === true) || (u.invert === true);
            var maskR = applyAlphaMaskFromTga(workDoc, chPath, invert);
            if (!maskR || maskR.ok !== true) {
              ok = false;
              errors.push({ index: i, name: u && u.name ? String(u.name) : "", message: (maskR && maskR.message) ? String(maskR.message) : "apply_mask_failed" });
            }
          }
        }
      }
    } catch (e) {
      ok = false;
      errors.push({ index: i, name: u && u.name ? String(u.name) : "", message: String(e) });
    }
  }
  if (pendingStableTextRestore) {
    restoreStableTextBounds(workDoc, stableTextBounds, logArr);
    if (logArr) {
      logArr.push("stable_text_restore_elapsed_ms=" + String((new Date().getTime()) - stableStartedAt));
    }
  }
  return { ok: ok, updatedText: updatedText, updatedImage: updatedImage, errors: errors };
}

function runPsdBundle(job, jobPath) {
  var psdPath = normalizeFsPath(job.psdPath);
  var tasks = (job.tasks && (job.tasks instanceof Array)) ? job.tasks : [];
  var outputPath = job.outputPath ? normalizeFsPath(String(job.outputPath)) : null;
  var resultPath = job.resultPath ? normalizeFsPath(job.resultPath) : null;
  var quitAfter = job.quitAfter === true;
  var bundleOptions = (job.bundleOptions && (typeof job.bundleOptions === "object")) ? job.bundleOptions : {};
  var hideOriginalReplacedLayers = bundleOptions.hideOriginalReplacedLayers === true;
  var showOnlyFirstVariant = bundleOptions.showOnlyFirstVariant === true;

  var results = [];
  var allOk = true;
  var doc = null;
  var work = null;
  var batchLog = [];
  batchLog.push("SCRIPT_BUILD: " + SCRIPT_BUILD);
  batchLog.push("mode=psd-bundle");
  batchLog.push("psdPath=" + psdPath);
  batchLog.push("tasks=" + String(tasks.length));
  batchLog.push("outputPath=" + String(outputPath || ""));

  try {
    if (!outputPath) throw new Error("output_path_missing");
    app.displayDialogs = DialogModes.NO;
    doc = app.open(new File(psdPath));
    work = doc.duplicate();
    doc.close(SaveOptions.DONOTSAVECHANGES);
    doc = null;
    app.activeDocument = work;

    var replacePsIdSet = {};
    for (var i0 = 0; i0 < tasks.length; i0 += 1) {
      var tt = tasks[i0] || {};
      var ups0 = (tt.updates && (tt.updates instanceof Array)) ? tt.updates : [];
      for (var j0 = 0; j0 < ups0.length; j0 += 1) {
        var uu0 = ups0[j0] || {};
        if (uu0.varType !== "img") continue;
        var psId0 = (uu0.psId != null) ? Number(uu0.psId) : NaN;
        if (isFinite(psId0) && psId0 > 0) replacePsIdSet[String(psId0)] = true;
      }
    }

    if (hideOriginalReplacedLayers) {
      for (var k0 in replacePsIdSet) {
        if (!replacePsIdSet.hasOwnProperty(k0)) continue;
        try {
          selectLayerById(Number(k0));
          var l0 = work.activeLayer;
          if (l0) l0.visible = false;
        } catch (eHide) {}
      }
    }

    for (var i = 0; i < tasks.length; i += 1) {
      var t = tasks[i] || {};
      var label = t.label != null ? String(t.label) : String(i);
      var taskArtboardRenames = sanitizeArtboardRenameMap(t.artboardRenames || job.artboardRenames);
      var taskLog = [];
      taskLog.push("SCRIPT_BUILD: " + SCRIPT_BUILD);
      taskLog.push("label=" + label);
      var tr = { label: label, ok: true, outputPath: outputPath, updatedText: 0, updatedImage: 0, errors: [] };
      try {
        var updates = (t.updates && (t.updates instanceof Array)) ? t.updates : [];
        var imgU = null;
        for (var jPick = 0; jPick < updates.length; jPick += 1) {
          var cand = updates[jPick] || {};
          if (cand && cand.varType === "img") { imgU = cand; break; }
        }
        if (!imgU) {
          tr.ok = false;
          tr.errors.push({ message: "no_img_update" });
        } else {
          var psId = (imgU && imgU.psId != null) ? Number(imgU.psId) : NaN;
          if (!(isFinite(psId) && psId > 0)) {
            tr.ok = false;
            tr.errors.push({ message: "psid_required" });
          } else {
            app.activeDocument = work;
            selectLayerById(psId);
            var target = work.activeLayer;
            if (!target) throw new Error("layer_not_found");

            var desiredRect = null;
            try { desiredRect = getLayerBounds(target); } catch (eB0) { desiredRect = null; }
            var desiredFromUpdate2 = null;
            try { desiredFromUpdate2 = readRectFromUpdate(imgU); } catch (eDU2) { desiredFromUpdate2 = null; }
            var desiredFromFallback2 = null;
            try { desiredFromFallback2 = readRectFromUpdate({ x: imgU.x, y: imgU.y, width: imgU.width, height: imgU.height }); } catch (eDF2) { desiredFromFallback2 = null; }
            var desiredRectPicked = pickDesiredImageRect(desiredRect, desiredFromUpdate2, desiredFromFallback2, taskLog, i);

            var imgPath = (imgU.imageAbsPath != null) ? String(imgU.imageAbsPath) : (imgU.imagePath != null ? String(imgU.imagePath) : "");
            if (!imgPath) {
              tr.ok = false;
              tr.errors.push({ message: "image_path_missing" });
            } else {
              var variantLayer = null;
              var placeInfoB = captureSiblingPlacement(target);
              var linkedDup = null;
              try {
                linkedDup = target.duplicate();
              } catch (eDup0) {
                try { linkedDup = target.duplicate(work, ElementPlacement.PLACEATBEGINNING); } catch (eDup1) { linkedDup = null; }
              }
              if (!linkedDup) throw new Error("duplicate_to_root_failed");
              work.activeLayer = linkedDup;

              if (isSmartObjectLayer(linkedDup)) {
                var copyRes = newSmartObjectViaCopy(linkedDup);
                variantLayer = copyRes && copyRes.layer ? copyRes.layer : app.activeDocument.activeLayer;
                try { linkedDup.remove(); } catch (eRmL) {}
              } else {
                ensureLayerEditable(linkedDup);
                var converted = convertLayerToSmartObject(linkedDup);
                variantLayer = converted ? converted : work.activeLayer;
              }

              if (!variantLayer) throw new Error("variant_layer_missing");
              restoreLayerPlacement(variantLayer, placeInfoB);

              var layerName = null;
              try {
                layerName = (imgU && imgU.sourceName) ? String(imgU.sourceName) : label;
              } catch (eLN0) {
                layerName = label;
              }
              if (!layerName) layerName = label;
              try {
                layerName = String(layerName).replace(/^[a-z0-9_-]{6,80}__+/i, "");
              } catch (eLNStrip0) {}
              try {
                layerName = String(layerName).replace(/_[0-9a-f]{6,32}(?=\.[^.]+$)/i, "");
              } catch (eLNStrip1) {}
              try {
                layerName = String(layerName).replace(/[\\\/:*?"<>|]+/g, "_");
              } catch (eLN1) {}
              try { variantLayer.name = layerName; } catch (eN0) {}
              try { variantLayer.visible = showOnlyFirstVariant ? (i === 0) : true; } catch (eV0) {}

              app.activeDocument = work;
              work.activeLayer = variantLayer;
              ensureLayerEditable(variantLayer);
              try {
                var miB = getLayerMaskInfo(variantLayer);
                if (miB && miB.hasUserMask === true) {
                  removeUserMaskFromActiveLayer();
                  try { taskLog.push("mask_removed=true"); } catch (eLogM0) {}
                }
                if (miB && miB.isClipping === true) {
                  var rel = releaseClippingFromActiveLayer();
                  try { taskLog.push("clipping_released=" + String(rel)); } catch (eLogC0) {}
                }
              } catch (eMaskB) {}
              try {
                taskLog.push("img_update psId=" + String(psId));
                taskLog.push("img_update layerName=" + String(getLayerNameSafe(variantLayer) || ""));
                taskLog.push("img_update layerChain=" + collectLayerChainNames(variantLayer));
                taskLog.push("img_update targetLayerId(before)=" + String(getLayerIdSafe(target)));
                taskLog.push("img_update variantLayerId(afterDup)=" + String(getLayerIdSafe(variantLayer)));
                taskLog.push("img_update beforeRect=" + formatRectForLog(desiredRect));
                taskLog.push("img_update updateRectParsed=" + formatRectForLog(desiredFromUpdate2));
                taskLog.push("img_update imgPath=" + imgPath);
              } catch (eLog0) {}

              replacePlacedContents(imgPath);
              var replacedRect2 = null;
              try { replacedRect2 = getLayerBounds(variantLayer); } catch (eR1) { replacedRect2 = null; }
              var skipFit2 = shouldSkipFitAfterReplace(replacedRect2, desiredRectPicked);
              try {
                taskLog.push("img_update replacedRect(beforeFit)=" + formatRectForLog(replacedRect2));
                taskLog.push("img_update desiredRect=" + formatRectForLog(desiredRectPicked));
                taskLog.push("img_update skipFit=" + String(skipFit2));
              } catch (eLogB) {}
              var fitErr = null;
              if (!skipFit2 && desiredRectPicked) fitErr = fitLayerToRect(variantLayer, desiredRectPicked);
              if (skipFit2) taskLog.push("fitLayerToRect_skipped:already_aligned");
              if (fitErr) taskLog.push("fitLayerToRect_failed:" + String(fitErr));
              try {
                var afterRect2 = null;
                try { afterRect2 = getLayerBounds(variantLayer); } catch (eA2) { afterRect2 = null; }
                taskLog.push("img_update afterRect=" + formatRectForLog(afterRect2));
                if (desiredRectPicked && afterRect2) {
                  taskLog.push("img_update desiredAfterDistance=" + String(rectDistance(desiredRectPicked, afterRect2)));
                }
              } catch (eLogA) {}
              renameArtboardGroupByLayer(variantLayer, taskArtboardRenames, taskLog, psId);
              tr.updatedImage += 1;
            }
          }
        }
      } catch (eTask) {
        tr.ok = false;
        tr.errors.push({ message: String(eTask) });
      }

      if (tr.ok !== true) allOk = false;
      results.push(tr);
      safeWriteTextFile(jobPath + ".task_" + String(i) + ".log", taskLog.join("\n") + "\n");
    }

    collapseAllArtboardGroups(work, batchLog);
    var exOut = exportImage(work, outputPath, "psd", 100);
    if (exOut && exOut.outputPathUsed) {
      outputPath = String(exOut.outputPathUsed);
      for (var rr = 0; rr < results.length; rr += 1) {
        try { results[rr].outputPath = outputPath; } catch (eR) {}
      }
    }
  } catch (e) {
    allOk = false;
    batchLog.push("main_error=" + String(e));
    if (results.length === 0) {
      results.push({ label: "bundle", ok: false, outputPath: outputPath || null, updatedText: 0, updatedImage: 0, errors: [{ message: String(e) }] });
    }
  }

  try { if (work) work.close(SaveOptions.DONOTSAVECHANGES); } catch (eCloseW) {}
  try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eCloseD) {}
  if (resultPath) {
    safeMkdirForFile(resultPath);
    safeWriteTextFile(resultPath, JSON.stringify({ ok: allOk, results: results, outputPath: outputPath, outputFormat: (exOut && exOut.formatUsed) ? String(exOut.formatUsed) : "psd", warnings: (exOut && exOut.warnings && (exOut.warnings instanceof Array)) ? exOut.warnings : [], scriptBuild: SCRIPT_BUILD }));
  }
  safeWriteTextFile(jobPath + ".batch.log", batchLog.join("\n") + "\n");
  if (quitAfter) {
    try { executeAction(charIDToTypeID("quit"), undefined, DialogModes.NO); } catch (eQuit) {}
  }
}

function runSingle(job, jobPath) {
  var psdPath = normalizeFsPath(job.psdPath);
  var outputPath = normalizeFsPath(job.outputPath);
  var format = job.format || "png";
  var quality = job.quality || 100;
  var updates = job.updates || [];
  var artboardRenames = sanitizeArtboardRenameMap(job.artboardRenames);
  var preserveArtboardTextPosition = job.preserveArtboardTextPosition === true;
  var resultPath = job.resultPath ? normalizeFsPath(job.resultPath) : null;
  var quitAfter = job.quitAfter === true;

  var doc = null;
  var work = null;
  var r = { ok: true, outputPath: outputPath, outputFormat: null, warnings: [], diagnostics: null, updatedText: 0, updatedImage: 0, errors: [] };
  var singleLog = [];
  singleLog.push("SCRIPT_BUILD: " + SCRIPT_BUILD);
  singleLog.push("mode=single");
  try {
    app.displayDialogs = DialogModes.NO;
    doc = app.open(new File(psdPath));
    var fmt = String(format == null ? "png" : format).toLowerCase();
    if (fmt === "psd" || fmt === "psb") {
      var dupErr = null;
      try { work = doc.duplicate(); } catch (eDup) { dupErr = eDup; work = null; }
      if (work) {
        doc.close(SaveOptions.DONOTSAVECHANGES);
        doc = null;
      } else {
        work = doc;
        doc = null;
        if (dupErr) r.warnings.push("duplicate_failed_fallback_inplace");
      }
    } else {
      work = doc.duplicate();
      doc.close(SaveOptions.DONOTSAVECHANGES);
      doc = null;
    }
    var ur = applyUpdatesToDoc(work, updates, singleLog, artboardRenames, { preserveArtboardTextPosition: preserveArtboardTextPosition });
    r.ok = ur.ok === true;
    r.updatedText = ur.updatedText || 0;
    r.updatedImage = ur.updatedImage || 0;
    r.errors = ur.errors || [];
    r.diagnostics = collectDocDiagnostics(work);
    collapseAllArtboardGroups(work, singleLog);
    var ex = exportImage(work, outputPath, format, quality);
    if (ex && ex.outputPathUsed) r.outputPath = String(ex.outputPathUsed);
    if (ex && ex.formatUsed) r.outputFormat = String(ex.formatUsed);
    if (ex && ex.warnings && (ex.warnings instanceof Array)) r.warnings = ex.warnings;
  } catch (e) {
    r.ok = false;
    r.errors = [{ message: normalizeErrorText(e), raw: truncateText(normalizeErrorText(e), 600) }];
    try { if (e && e.raw) r.errors[0].raw = truncateText(String(e.raw), 600); } catch (eRaw) {}
    singleLog.push("main_error=" + String(e));
  }
  try { if (work) work.close(SaveOptions.DONOTSAVECHANGES); } catch (eCloseW) {}
  try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eCloseD) {}
  singleLog.push("updatedText=" + String(r.updatedText || 0));
  singleLog.push("updatedImage=" + String(r.updatedImage || 0));
  singleLog.push("errorCount=" + String((r.errors && r.errors.length) ? r.errors.length : 0));
  if (resultPath) {
    r.scriptBuild = SCRIPT_BUILD;
    safeMkdirForFile(resultPath);
    safeWriteTextFile(resultPath, JSON.stringify(r));
  }
  safeWriteTextFile(jobPath + ".log", singleLog.join("\n") + "\n");
  if (quitAfter) {
    try { executeAction(charIDToTypeID("quit"), undefined, DialogModes.NO); } catch (eQuit) {}
  }
}

function runBatch(job, jobPath) {
  var psdPath = normalizeFsPath(job.psdPath);
  var tasks = (job.tasks && (job.tasks instanceof Array)) ? job.tasks : [];
  var format0 = job.format || "png";
  var quality0 = job.quality || 100;
  var resultPath = job.resultPath ? normalizeFsPath(job.resultPath) : null;
  var quitAfter = job.quitAfter === true;
  var results = [];
  var allOk = true;

  var batchLog = [];
  batchLog.push("SCRIPT_BUILD: " + SCRIPT_BUILD);
  batchLog.push("mode=batch");
  batchLog.push("psdPath=" + psdPath);
  batchLog.push("tasks=" + String(tasks.length));

  var baseDoc = null;
  try {
    app.displayDialogs = DialogModes.NO;
    baseDoc = app.open(new File(psdPath));
    for (var i = 0; i < tasks.length; i += 1) {
      var t = tasks[i] || {};
      var label = t.label != null ? String(t.label) : String(i);
      var taskArtboardRenames = sanitizeArtboardRenameMap(t.artboardRenames || job.artboardRenames);
      var preserveArtboardTextPosition = (t.preserveArtboardTextPosition === true) || (job.preserveArtboardTextPosition === true);
      var taskLog = [];
      taskLog.push("SCRIPT_BUILD: " + SCRIPT_BUILD);
      taskLog.push("label=" + label);
      var work = null;
      var tr = { label: label, ok: true, outputPath: null, updatedText: 0, updatedImage: 0, errors: [] };
      try {
        work = baseDoc.duplicate();
        app.activeDocument = work;
        var updates = (t.updates && (t.updates instanceof Array)) ? t.updates : [];
        var ur = applyUpdatesToDoc(work, updates, taskLog, taskArtboardRenames, { preserveArtboardTextPosition: preserveArtboardTextPosition });
        tr.ok = ur.ok === true;
        tr.updatedText = ur.updatedText || 0;
        tr.updatedImage = ur.updatedImage || 0;
        tr.errors = ur.errors || [];
        collapseAllArtboardGroups(work, taskLog);
        var outPath = t.outputPath != null ? normalizeFsPath(String(t.outputPath)) : "";
        tr.outputPath = outPath || null;
        var fmt = t.format != null ? String(t.format) : format0;
        var q = t.quality != null ? Number(t.quality) : Number(quality0);
        if (!outPath) {
          tr.ok = false;
          tr.errors.push({ message: "output_path_missing" });
        } else {
          var ex = exportImage(work, outPath, fmt, q);
          if (ex && ex.outputPathUsed) tr.outputPath = String(ex.outputPathUsed);
          if (ex && ex.formatUsed) tr.outputFormat = String(ex.formatUsed);
          if (ex && ex.warnings && (ex.warnings instanceof Array)) tr.warnings = ex.warnings;
        }
      } catch (eTask) {
        tr.ok = false;
        tr.errors = [{ message: String(eTask) }];
      }
      try { if (work) work.close(SaveOptions.DONOTSAVECHANGES); } catch (eCloseW2) {}
      if (tr.ok !== true) allOk = false;
      results.push(tr);
      safeWriteTextFile(jobPath + ".task_" + String(i) + ".log", taskLog.join("\n") + "\n");
    }
  } catch (eMain) {
    allOk = false;
    batchLog.push("main_error=" + String(eMain));
  }
  try { if (baseDoc) baseDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eCloseB) {}

  if (resultPath) {
    safeMkdirForFile(resultPath);
    safeWriteTextFile(resultPath, JSON.stringify({ ok: allOk, results: results, scriptBuild: SCRIPT_BUILD }));
  }
  safeWriteTextFile(jobPath + ".batch.log", batchLog.join("\n") + "\n");
  if (quitAfter) {
    try { executeAction(charIDToTypeID("quit"), undefined, DialogModes.NO); } catch (eQuit2) {}
  }
}

function main() {
  var jobPath = null;
  try {
    var arg0 = null;
    if (arguments.length >= 1) arg0 = arguments[0];
    else if (typeof __FDESIGN_JOB_PATH !== "undefined") arg0 = __FDESIGN_JOB_PATH;
    if (!arg0) throw new Error("missing_job_path");
    jobPath = normalizeFsPath(decodeURIComponent(String(arg0)));
    var content = readJobFile(jobPath);
    var job = JSON.parse(content);
    var mode = (job && job.mode != null) ? String(job.mode) : "";
    if (mode === "psd-bundle") {
      runPsdBundle(job, jobPath);
      return;
    }
    var isBatch = (mode === "batch") || (job && job.tasks && (job.tasks instanceof Array));
    if (isBatch) {
      runBatch(job, jobPath);
    } else {
      runSingle(job, jobPath);
    }
  } catch (e) {
    try { if (jobPath) safeWriteTextFile(jobPath + ".fatal.log", "SCRIPT_BUILD: " + SCRIPT_BUILD + "\n" + "FATAL: " + String(e) + "\n"); } catch (e2) {}
    try {
      if (jobPath) {
        var ct = readJobFile(jobPath);
        var jb = JSON.parse(ct);
        if (jb && jb.resultPath) {
          var rp = normalizeFsPath(String(jb.resultPath));
          safeMkdirForFile(rp);
          safeWriteTextFile(rp, JSON.stringify({ ok: false, error: String(e), scriptBuild: SCRIPT_BUILD }));
        }
      }
    } catch (e3) {}
    throw e;
  }
}

main.apply(null, arguments);

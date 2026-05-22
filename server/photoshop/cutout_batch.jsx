if (typeof JSON === "undefined") {
  JSON = {};
}
if (typeof JSON.parse !== "function") {
  JSON.parse = function (s) { return eval('(' + s + ')'); };
}
if (typeof JSON.stringify !== "function") {
  JSON.stringify = function (obj) {
    if (obj === null) return "null";
    if (typeof obj === "string") return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
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

var SCRIPT_BUILD = "cutout_batch_1";

function normalizeFsPath(p) {
  var s = String(p == null ? "" : p);
  if (!s) return s;
  return s.replace(/\\/g, "/");
}

function readTextFile(path) {
  var f = new File(path);
  f.encoding = "UTF8";
  if (!f.exists) throw new Error("file_not_found:" + path);
  if (!f.open("r")) throw new Error("file_open_failed:" + f.error);
  var txt = f.read();
  f.close();
  return txt;
}

function writeTextFile(path, text) {
  var f = new File(path);
  f.encoding = "UTF8";
  if (!f.open("w")) throw new Error("file_write_open_failed:" + f.error);
  f.write(String(text == null ? "" : text));
  f.close();
}

function exportPng(doc, outputPath) {
  var outFile = new File(outputPath);
  if (outFile.parent && !outFile.parent.exists) {
    outFile.parent.create();
  }
  var opts = new ExportOptionsSaveForWeb();
  opts.format = SaveDocumentType.PNG;
  opts.PNG8 = false;
  opts.transparency = true;
  opts.interlaced = false;
  opts.quality = 100;
  doc.exportDocument(outFile, ExportType.SAVEFORWEB, opts);
}

function findAlphaChannel(d) {
  if (!d) return null;
  var a1 = null;
  try { a1 = d.channels.getByName("Alpha 1"); } catch (eA1) { a1 = null; }
  if (a1) return a1;
  var chs = null;
  try { chs = d.channels; } catch (eCh0) { chs = null; }
  if (chs && chs.length > 0) {
    for (var i = chs.length - 1; i >= 0; i -= 1) {
      try {
        if (chs[i] && chs[i].kind !== ChannelType.COMPONENT) return chs[i];
      } catch (eCh1) {}
    }
  }
  return null;
}

function ensureLayerFromBackground(doc) {
  if (!doc) return;
  try { doc.activeLayer = doc.layers[0]; } catch (e0) {}
  try {
    if (doc.activeLayer && doc.activeLayer.isBackgroundLayer) {
      executeAction(stringIDToTypeID("layerFromBackground"), new ActionDescriptor(), DialogModes.NO);
    }
  } catch (e1) {}
}

function selectRgbChannels(doc) {
  try {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("RGB "));
    desc.putReference(charIDToTypeID("null"), ref);
    executeAction(charIDToTypeID("slct"), desc, DialogModes.NO);
  } catch (e0) {
    try { doc.activeChannels = [doc.channels[0], doc.channels[1], doc.channels[2]]; } catch (e1) {}
  }
}

function newTransparentDocLike(srcDoc) {
  var w = srcDoc.width;
  var h = srcDoc.height;
  var res = 72;
  try { res = Number(srcDoc.resolution) || 72; } catch (e0) {}
  var name = "cutout";
  try { name = String(srcDoc.name || "cutout"); } catch (e1) {}
  return app.documents.add(w, h, res, name, NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
}

function processOne(task) {
  var productPath = normalizeFsPath(task.productPath);
  var channelPath = normalizeFsPath(task.channelPath);
  var outputPath = normalizeFsPath(task.outputPath);
  var resizeMode = String(task.resizeMode || "exact").toLowerCase();
  var debugLog = "";
  var errors = [];

  var productDoc = null;
  var maskDoc = null;
  try {
    var productFile = new File(productPath);
    if (!productFile.exists) throw new Error("product_not_found:" + productPath);
    productDoc = app.open(productFile);
    ensureLayerFromBackground(productDoc);
    try { productDoc.activeLayer = productDoc.layers[0]; } catch (eL0) {}
    var targetLayer = productDoc.activeLayer;

    var pw = Math.max(1, Math.round(productDoc.width.as("px")));
    var ph = Math.max(1, Math.round(productDoc.height.as("px")));

    var channelFile = new File(channelPath);
    if (!channelFile.exists) throw new Error("channel_not_found:" + channelPath);
    maskDoc = app.open(channelFile);

    var mw = Math.max(1, Math.round(maskDoc.width.as("px")));
    var mh = Math.max(1, Math.round(maskDoc.height.as("px")));
    debugLog += "product=" + pw + "x" + ph + " mask=" + mw + "x" + mh + " resizeMode=" + resizeMode + "\n";

    if ((mw !== pw || mh !== ph) && resizeMode === "exact") {
      try { maskDoc.resizeImage(new UnitValue(pw, "px"), new UnitValue(ph, "px"), 72, ResampleMethod.BICUBIC); } catch (eRz) {}
      mw = Math.max(1, Math.round(maskDoc.width.as("px")));
      mh = Math.max(1, Math.round(maskDoc.height.as("px")));
      debugLog += "mask_resized=" + mw + "x" + mh + "\n";
    }

    var alphaCh = findAlphaChannel(maskDoc);
    var usedAlpha = !!alphaCh;
    if (alphaCh) {
      try { maskDoc.activeChannels = [alphaCh]; } catch (eAC) {}
    } else {
      try { maskDoc.flatten(); } catch (eFlat) {}
      try { maskDoc.changeMode(ChangeMode.GRAYSCALE); } catch (eGray) {}
    }
    try { maskDoc.selection.selectAll(); } catch (eSel0) {}
    try { maskDoc.selection.copy(); } catch (eCopy) { throw new Error("mask_copy_failed:" + String(eCopy)); }
    try { maskDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose0) {}
    maskDoc = null;
    debugLog += "mask_source=" + (usedAlpha ? "alpha" : "gray") + "\n";

    app.activeDocument = productDoc;
    selectRgbChannels(productDoc);
    var tmpCh = null;
    try { tmpCh = productDoc.channels.add(); } catch (eAddCh) { tmpCh = null; }
    if (!tmpCh) throw new Error("tmp_channel_create_failed");
    try { productDoc.activeChannels = [tmpCh]; } catch (eActCh) {}
    try { productDoc.paste(); } catch (ePaste) { throw new Error("paste_to_channel_failed:" + String(ePaste)); }
    selectRgbChannels(productDoc);
    try { productDoc.selection.load(tmpCh, SelectionType.REPLACE); } catch (eLoad) { throw new Error("selection_load_failed:" + String(eLoad)); }
    if (task.invert === true) {
      try { productDoc.selection.invert(); } catch (eInv0) {}
    }
    var outDoc = null;
    try {
      outDoc = newTransparentDocLike(productDoc);
      app.activeDocument = productDoc;
      try { productDoc.activeLayer = targetLayer; } catch (eActL) {}
      try { productDoc.selection.copy(); } catch (eCopySel) { throw new Error("selection_copy_failed:" + String(eCopySel)); }
      app.activeDocument = outDoc;
      try { outDoc.paste(); } catch (ePasteOut) { throw new Error("paste_to_output_failed:" + String(ePasteOut)); }
      exportPng(outDoc, outputPath);
    } finally {
      try { if (outDoc) outDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eCloseOut) {}
    }

    try { tmpCh.remove(); } catch (eRmCh) {}
    try { productDoc.selection.deselect(); } catch (eDe0) {}
    try { productDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose1) {}
    productDoc = null;

    return { ok: true, errors: [], debugLog: debugLog };
  } catch (e) {
    errors.push({ message: String(e) });
    try { if (maskDoc) maskDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC0) {}
    try { if (productDoc) productDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC1) {}
    return { ok: false, errors: errors, debugLog: debugLog + "error=" + String(e) + "\n" };
  }
}

function mainSafe() {
  var jobPath = null;
  var job = null;
  var tasks = [];
  var resultPath = null;
  var results = [];
  var allOk = true;

  try {
    var arg0 = null;
    if (arguments.length >= 1) arg0 = arguments[0];
    else if (typeof __FDESIGN_JOB_PATH !== "undefined") arg0 = __FDESIGN_JOB_PATH;
    if (!arg0) throw new Error("missing_job_path");
    jobPath = normalizeFsPath(decodeURIComponent(String(arg0)));
    var jobText = readTextFile(jobPath);
    job = JSON.parse(jobText);
    tasks = job.tasks || [];
    resultPath = job.resultPath != null ? normalizeFsPath(job.resultPath) : null;

    app.displayDialogs = DialogModes.NO;

    for (var i = 0; i < tasks.length; i += 1) {
      var t = tasks[i] || {};
      var label = t.label != null ? String(t.label) : String(i);
      var r = processOne(t);
      results.push({ label: label, ok: r.ok, errors: r.errors, outputPath: t.outputPath || null });
      allOk = allOk && r.ok;
      var logPath = jobPath + ".task_" + String(i) + ".log";
      try { writeTextFile(logPath, "SCRIPT_BUILD:" + SCRIPT_BUILD + "\n" + (r.debugLog || "")); } catch (eW) {}
    }
  } catch (e) {
    allOk = false;
    var msg = String(e);
    if (results.length === 0 && tasks && tasks.length > 0) {
      for (var j = 0; j < tasks.length; j += 1) {
        var t2 = tasks[j] || {};
        var label2 = t2.label != null ? String(t2.label) : String(j);
        results.push({
          label: label2,
          ok: false,
          errors: [{ message: msg }],
          outputPath: t2.outputPath || null,
        });
      }
    }
    if (!resultPath && jobPath) {
      resultPath = jobPath + ".fatal.json";
    }
    if (resultPath) {
      try {
        writeTextFile(
          resultPath,
          JSON.stringify({
            ok: false,
            scriptBuild: SCRIPT_BUILD,
            error: msg,
            results: results,
          }),
        );
      } catch (e2) {}
    }
    return;
  }

  if (resultPath) {
    writeTextFile(resultPath, JSON.stringify({ ok: allOk, scriptBuild: SCRIPT_BUILD, results: results }));
  }
}

mainSafe();

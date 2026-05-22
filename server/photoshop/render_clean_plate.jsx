#target photoshop

// Polyfill for JSON if missing (CS3/CS4 etc)
if (typeof JSON === 'undefined') {
  JSON = {};
  JSON.parse = function (s) { return eval('(' + s + ')'); };
  JSON.stringify = function (obj) {
    if (obj === null) return "null";
    if (typeof obj === "string") return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
    if (obj instanceof Array) {
      var parts = [];
      for (var i = 0; i < obj.length; i++) parts.push(JSON.stringify(obj[i]));
      return "[" + parts.join(",") + "]";
    }
    if (typeof obj === "object") {
      var parts = [];
      for (var k in obj) {
        if (obj.hasOwnProperty(k)) {
          parts.push('"' + k + '":' + JSON.stringify(obj[k]));
        }
      }
      return "{" + parts.join(",") + "}";
    }
    return "null";
  };
}

function readTextFile(path) {
  var f = new File(path);
  if (!f.exists) throw new Error("job_not_found");
  f.encoding = "UTF8";
  f.open("r");
  var s = f.read();
  f.close();
  return s;
}

function writeTextFile(path, content) {
  var f = new File(path);
  f.encoding = "UTF8";
  f.open("w");
  f.write(content);
  f.close();
}

function hideLayersByExactNames(container, names) {
  if (!container) return;
  var layers = container.layers;
  for (var i = 0; i < layers.length; i += 1) {
    var l = layers[i];
    if (l.typename === "LayerSet") {
      hideLayersByExactNames(l, names);
    } else {
      for (var j = 0; j < names.length; j += 1) {
        if (l.name === names[j]) {
          l.visible = false;
        }
      }
    }
  }
}

function exportPng(doc, outputPath) {
  var outFile = new File(outputPath);
  var opts = new ExportOptionsSaveForWeb();
  opts.format = SaveDocumentType.PNG;
  opts.PNG8 = false;
  opts.transparency = true;
  opts.interlaced = false;
  opts.quality = 100;
  doc.exportDocument(outFile, ExportType.SAVEFORWEB, opts);
}

function main() {
  var arg0 = null;
  if (arguments.length >= 1) arg0 = arguments[0];
  else if (typeof __FDESIGN_JOB_PATH !== "undefined") arg0 = __FDESIGN_JOB_PATH;
  if (!arg0) throw new Error("missing_job_path");
  var jobPath = String(arg0);
  var job = JSON.parse(readTextFile(jobPath));

  var psdPath = job.psdPath;
  var outputPngPath = job.outputPngPath;
  var namesToHide = job.hideLayerNames || [];
  var quitAfter = job.quitAfter === true;
  var resultPath = job.resultPath || null;

  var doc = app.open(new File(psdPath));
  hideLayersByExactNames(doc, namesToHide);
  exportPng(doc, outputPngPath);
  doc.close(SaveOptions.DONOTSAVECHANGES);

  if (resultPath) {
    writeTextFile(resultPath, JSON.stringify({ ok: true, outputPngPath: outputPngPath }));
  }

  if (quitAfter) {
    // app.quit() compatibility fix
    try {
      var idquit = charIDToTypeID("quit");
      executeAction(idquit, undefined, DialogModes.NO);
    } catch (e) {
      // ignore quit errors
    }
  }
}

main.apply(null, arguments);

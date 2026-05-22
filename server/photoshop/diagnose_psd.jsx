var files = [
  "E:/ProjectX/Fdesign/已做好的款可参考/京东PC主图规范(三视图).psd",
  "E:/ProjectX/Fdesign/已做好的款可参考/京东PC主图规范(三视图+明星+模特+CG).psd"
];

for (var i = 0; i < files.length; i++) {
  var f = files[i];
  var file = new File(f);
  if (!file.exists) {
    $.writeln("FILE_NOT_FOUND: " + f);
    continue;
  }
  
  try {
    var doc = app.open(file);
    $.writeln("=== " + file.name + " ===");
    $.writeln("width: " + doc.width.as("px"));
    $.writeln("height: " + doc.height.as("px"));
    $.writeln("resolution: " + doc.resolution);
    $.writeln("bitsPerChannel: " + doc.bitsPerChannel);
    $.writeln("mode: " + doc.mode);
    $.writeln("colorProfileName: " + doc.colorProfileName);
    $.writeln("layerCount: " + doc.layers.length);
    
    // 检查是否有智能对象
    var smartObjectCount = 0;
    var totalPixelSize = 0;
    function countSmartObjects(layer) {
      try {
        if (layer.typename === "ArtLayer" && layer.kind === LayerKind.SMARTOBJECT) {
          smartObjectCount++;
          try {
            var bounds = layer.bounds;
            var w = Number(bounds[1].as("px")) - Number(bounds[0].as("px"));
            var h = Number(bounds[3].as("px")) - Number(bounds[2].as("px"));
            totalPixelSize += w * h;
          } catch(e) {}
        }
        if (layer.layers) {
          for (var j = 0; j < layer.layers.length; j++) {
            countSmartObjects(layer.layers[j]);
          }
        }
      } catch(e) {}
    }
    for (var j = 0; j < doc.layers.length; j++) {
      countSmartObjects(doc.layers[j]);
    }
    $.writeln("smartObjectCount: " + smartObjectCount);
    $.writeln("estimatedSmartObjectPixels: " + totalPixelSize);
    
    doc.close(SaveOptions.DONOTSAVECHANGES);
    $.writeln("");
  } catch(e) {
    $.writeln("ERROR: " + file.name + " - " + e);
  }
}

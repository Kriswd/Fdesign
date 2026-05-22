
// 最小复现脚本：验证 ActionManager 文本回写在当前 PS 环境的行为
// 用法：在 ExtendScript Toolkit 中运行，或作为 .jsx 文件拖入 Photoshop

function log(msg) {
  $.writeln(msg);
}

function testAmTextUpdate() {
  if (app.documents.length === 0) {
    var doc = app.documents.add(500, 500, 72, "测试文档", NewDocumentMode.RGB, DocumentFill.WHITE);
    var layer = doc.artLayers.add();
    layer.kind = LayerKind.TEXT;
    layer.textItem.contents = "Original Text";
    layer.textItem.size = 30;
    layer.name = "TestTextLayer";
  } else {
    var doc = app.activeDocument;
    var layer = doc.activeLayer;
    if (layer.kind !== LayerKind.TEXT) {
      alert("请先选中一个文字图层");
      return;
    }
  }

  var layer = app.activeDocument.activeLayer;
  var layerId = layer.id;
  var newText = "Updated Text (AM)";

  log("开始测试 ActionManager 文本回写，图层ID: " + layerId);

  try {
    var idTextKey = stringIDToTypeID("textKey");
    var idTxtt = charIDToTypeID("Txtt");
    var idTxLr = charIDToTypeID("TxLr");
    var idTextLayer = stringIDToTypeID("textLayer");
    var idT = charIDToTypeID("T   ");
    var idNull = charIDToTypeID("null");
    var idLyr = charIDToTypeID("Lyr ");

    // 1. GET textKey from Layer (Lyr)
    var refGet = new ActionReference();
    refGet.putIdentifier(idLyr, layerId);
    var lyrDesc = executeActionGet(refGet);
    
    if (!lyrDesc.hasKey(idTextKey)) {
      alert("失败：该图层没有 textKey（不是文字图层？）");
      return;
    }
    
    var tk = lyrDesc.getObjectValue(idTextKey);
    log("成功：读取到 textKey");

    // 2. Modify content
    tk.putString(idTxtt, newText);
    log("已修改 textKey 的文本内容");

    var payload = new ActionDescriptor();
    payload.putObject(idTextKey, idTextKey, tk);

    var setOk = false;
    var setErr = [];

    try {
      var setDesc1 = new ActionDescriptor();
      var refSet1 = new ActionReference();
      refSet1.putIdentifier(idLyr, layerId);
      setDesc1.putReference(idNull, refSet1);
      setDesc1.putObject(idT, idTextLayer, payload);
      executeAction(charIDToTypeID("setd"), setDesc1, DialogModes.NO);
      setOk = true;
    } catch (eSet1) {
      setErr.push("set_textLayer:" + (eSet1.message || eSet1.description || String(eSet1)));
    }

    if (!setOk) {
      try {
        var setDesc2 = new ActionDescriptor();
        var refSet2 = new ActionReference();
        refSet2.putIdentifier(idLyr, layerId);
        setDesc2.putReference(idNull, refSet2);
        setDesc2.putObject(idT, idTxLr, payload);
        executeAction(charIDToTypeID("setd"), setDesc2, DialogModes.NO);
        setOk = true;
      } catch (eSet2) {
        setErr.push("set_TxLr:" + (eSet2.message || eSet2.description || String(eSet2)));
      }
    }

    if (!setOk) {
      try {
        var setDesc3 = new ActionDescriptor();
        var refSet3 = new ActionReference();
        refSet3.putIdentifier(idLyr, layerId);
        setDesc3.putReference(idNull, refSet3);
        setDesc3.putObject(idT, idLyr, payload);
        executeAction(charIDToTypeID("setd"), setDesc3, DialogModes.NO);
        setOk = true;
      } catch (eSet3) {
        setErr.push("set_Lyr:" + (eSet3.message || eSet3.description || String(eSet3)));
      }
    }

    var after = "";
    try { after = String(app.activeDocument.activeLayer.textItem.contents); } catch (eAfter) { after = ""; }
    if (setOk && after === newText) {
      alert("成功：ActionManager 回写已生效");
      log("成功：ActionManager 回写已生效");
    } else if (setOk) {
      alert("异常：命令执行成功，但文字未变化（可能是目标未命中）");
      log("异常：命令执行成功，但文字未变化");
    } else {
      alert("失败：ActionManager 回写失败\n" + setErr.join("\n"));
      log("失败：ActionManager 回写失败: " + setErr.join(" | "));
    }

  } catch (e) {
    alert("失败：脚本异常\n" + (e.message || e.description || String(e)) + "\n行号: " + e.line);
    log("失败：脚本异常: " + (e.message || e.description || String(e)) + " | 行号: " + e.line);
  }
}

testAmTextUpdate();

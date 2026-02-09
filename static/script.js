document.addEventListener("DOMContentLoaded", function () {
  // --- Elements ---
  var tabs = document.querySelectorAll(".tab");
  var panels = document.querySelectorAll(".panel");

  // Camera
  var cameraVideo = document.getElementById("cameraVideo");
  var cameraCanvas = document.getElementById("cameraCanvas");
  var overlayCanvas = document.getElementById("overlayCanvas");
  var liveResult = document.getElementById("liveResult");
  var liveAnswer = document.getElementById("liveAnswer");
  var liveQuestion = document.getElementById("liveQuestion");
  var cameraStatus = document.getElementById("cameraStatus");
  var btnToggleCamera = document.getElementById("btnToggleCamera");

  // Upload
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var previewArea = document.getElementById("previewArea");
  var previewImg = document.getElementById("previewImg");
  var btnClearImg = document.getElementById("btnClearImg");
  var btnUpload = document.getElementById("btnUpload");
  var resultArea = document.getElementById("resultArea");
  var mainResult = document.getElementById("mainResult");
  var ocrTextBox = document.getElementById("ocrTextBox");
  var noResult = document.getElementById("noResult");

  // Text
  var textInput = document.getElementById("textInput");
  var btnSearch = document.getElementById("btnSearch");
  var searchResults = document.getElementById("searchResults");

  var cameraStream = null;
  var scanTimer = null;
  var scanning = false;
  var selectedFile = null;

  // Frame settings — balance between quality and speed
  var FRAME_MAX_WIDTH = 800;
  var JPEG_QUALITY = 0.6;

  // --- Tabs ---
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      panels.forEach(function (p) { p.classList.remove("active"); });
      document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
      if (tab.dataset.tab !== "camera") stopCamera();
    });
  });

  // ===================== CAMERA (real-time) =====================
  btnToggleCamera.addEventListener("click", function () {
    cameraStream ? stopCamera() : startCamera();
  });

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraStatus.textContent = "浏览器不支持，请用 HTTPS 访问本页面";
      return;
    }
    cameraStatus.textContent = "正在开启...";
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false
    }).then(function (stream) {
      cameraStream = stream;
      cameraVideo.srcObject = stream;
      btnToggleCamera.textContent = "关闭摄像头";
      cameraStatus.textContent = "自动识别中...";
      startScanning();
    }).catch(function (err) {
      cameraStatus.textContent = "无法打开: " + err.message;
    });
  }

  function stopCamera() {
    stopScanning();
    if (cameraStream) {
      cameraStream.getTracks().forEach(function (t) { t.stop(); });
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
    btnToggleCamera.textContent = "开启摄像头";
    cameraStatus.textContent = "已关闭";
    liveResult.style.display = "none";
    clearOverlay();
  }

  function startScanning() {
    if (scanTimer) return;
    scanTimer = setInterval(captureFrame, 500);
  }

  function stopScanning() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    scanning = false;
  }

  function captureFrame() {
    if (!cameraStream || scanning) return;
    var vw = cameraVideo.videoWidth, vh = cameraVideo.videoHeight;
    if (!vw || !vh) return;
    scanning = true;

    // Resize to small dimensions
    var scale = Math.min(FRAME_MAX_WIDTH / vw, 1);
    var w = Math.round(vw * scale);
    var h = Math.round(vh * scale);
    cameraCanvas.width = w;
    cameraCanvas.height = h;
    cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0, w, h);

    cameraCanvas.toBlob(function (blob) {
      if (!blob) { scanning = false; return; }

      var formData = new FormData();
      formData.append("image", blob, "f.jpg");

      fetch("/api/ocr", { method: "POST", body: formData })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.match) {
            liveAnswer.textContent = data.match.answer;
            liveQuestion.textContent = data.match.question + "  (" + data.match.similarity + "%)";
            liveResult.style.display = "block";
            cameraStatus.textContent = "已匹配 · 持续识别中...";
            if (data.answer_box) {
              drawAnswerCircle(data.answer_box, w, h);
            } else {
              clearOverlay();
            }
          } else {
            // Keep previous answer displayed, don't hide it
            cameraStatus.textContent = "持续识别中...";
          }
        })
        .catch(function () { cameraStatus.textContent = "出错 · 重试中..."; })
        .finally(function () { scanning = false; });
    }, "image/jpeg", JPEG_QUALITY);
  }

  // ===================== UPLOAD =====================
  dropZone.addEventListener("click", function () { fileInput.click(); });
  dropZone.addEventListener("dragover", function (e) { e.preventDefault(); });
  dropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    if (!file.type.startsWith("image/")) return;
    selectedFile = file;
    var reader = new FileReader();
    reader.onload = function (e) {
      previewImg.src = e.target.result;
      dropZone.style.display = "none";
      previewArea.style.display = "block";
      btnUpload.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  btnClearImg.addEventListener("click", function () {
    selectedFile = null; fileInput.value = "";
    dropZone.style.display = "block"; previewArea.style.display = "none";
    btnUpload.disabled = true; resultArea.style.display = "none";
  });

  btnUpload.addEventListener("click", function () {
    if (!selectedFile) return;
    var formData = new FormData();
    formData.append("image", selectedFile);
    btnUpload.textContent = "识别中..."; btnUpload.disabled = true;
    fetch("/api/ocr", { method: "POST", body: formData })
      .then(function (r) { return r.json(); })
      .then(function (data) { showUploadResult(data); })
      .catch(function () { alert("识别失败"); })
      .finally(function () { btnUpload.textContent = "开始识别"; btnUpload.disabled = false; });
  });

  function showUploadResult(data) {
    resultArea.style.display = "block";
    mainResult.style.display = "none"; ocrTextBox.style.display = "none"; noResult.style.display = "none";
    if (data.ocr_text) {
      document.getElementById("ocrTextContent").textContent = data.ocr_text;
      ocrTextBox.style.display = "block";
    }
    if (data.match) {
      document.getElementById("resultAnswer").textContent = data.match.answer;
      document.getElementById("resultQuestion").textContent = data.match.question;
      var exp = document.getElementById("resultExplanation");
      if (data.match.explanation) { exp.textContent = data.match.explanation; exp.style.display = "block"; }
      else { exp.style.display = "none"; }
      document.getElementById("resultSimilarity").innerHTML = "匹配度: <span>" + data.match.similarity + "%</span>";
      mainResult.style.display = "block";
    } else {
      noResult.style.display = "block";
    }
  }

  // ===================== TEXT SEARCH =====================
  btnSearch.addEventListener("click", doSearch);
  textInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSearch(); }
  });

  function doSearch() {
    var text = textInput.value.trim();
    if (!text) return;
    btnSearch.textContent = "搜索中..."; btnSearch.disabled = true;
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { showSearchResults(data); })
      .catch(function () { alert("搜索失败"); })
      .finally(function () { btnSearch.textContent = "搜索答案"; btnSearch.disabled = false; });
  }

  function showSearchResults(data) {
    var list = document.getElementById("searchResultsList");
    list.innerHTML = "";
    var items = [];
    if (data.match) items.push(data.match);
    if (data.search_results) items = items.concat(data.search_results);
    // Deduplicate
    var seen = {};
    items = items.filter(function (r) {
      if (seen[r.question]) return false;
      seen[r.question] = true;
      return true;
    });
    if (items.length === 0) {
      list.innerHTML = '<div class="no-result"><p>未找到</p></div>';
    } else {
      items.forEach(function (r) {
        var div = document.createElement("div");
        div.className = "search-item";
        div.innerHTML = '<div class="a">' + esc(r.answer) + '</div><div class="q">' + esc(r.question) + '</div>' +
          (r.explanation ? '<div class="e">' + esc(r.explanation) + '</div>' : '');
        list.appendChild(div);
      });
    }
    searchResults.style.display = "block";
  }

  function esc(t) { var d = document.createElement("div"); d.appendChild(document.createTextNode(t)); return d.innerHTML; }

  // ===================== OVERLAY (red circle on answer) =====================
  function drawAnswerCircle(box, frameW, frameH) {
    var displayW = cameraVideo.clientWidth;
    var displayH = cameraVideo.clientHeight;
    if (!displayW || !displayH) return;

    overlayCanvas.width = displayW;
    overlayCanvas.height = displayH;

    var ctx = overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, displayW, displayH);

    // Map from captured frame coordinates to video display coordinates
    var scaleX = displayW / frameW;
    var scaleY = displayH / frameH;

    var x0 = box.x0 * scaleX;
    var y0 = box.y0 * scaleY;
    var x1 = box.x1 * scaleX;
    var y1 = box.y1 * scaleY;

    var cx = (x0 + x1) / 2;
    var cy = (y0 + y1) / 2;
    var rx = (x1 - x0) / 2 + 14;
    var ry = (y1 - y0) / 2 + 10;

    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }

  function clearOverlay() {
    var ctx = overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }
});

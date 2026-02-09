document.addEventListener("DOMContentLoaded", function () {
  // Elements
  var tabs = document.querySelectorAll(".tab");
  var panels = document.querySelectorAll(".panel");
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var previewArea = document.getElementById("previewArea");
  var previewImg = document.getElementById("previewImg");
  var btnClearImg = document.getElementById("btnClearImg");
  var btnUpload = document.getElementById("btnUpload");
  var btnToggleCamera = document.getElementById("btnToggleCamera");
  var cameraVideo = document.getElementById("cameraVideo");
  var cameraCanvas = document.getElementById("cameraCanvas");
  var cameraPlaceholder = document.getElementById("cameraPlaceholder");
  var cameraStatus = document.getElementById("cameraStatus");
  var liveResult = document.getElementById("liveResult");
  var liveAnswer = document.getElementById("liveAnswer");
  var liveDetail = document.getElementById("liveDetail");
  var textInput = document.getElementById("textInput");
  var btnSearch = document.getElementById("btnSearch");
  var loading = document.getElementById("loading");
  var resultArea = document.getElementById("resultArea");
  var mainResult = document.getElementById("mainResult");
  var ocrTextBox = document.getElementById("ocrTextBox");
  var searchResults = document.getElementById("searchResults");
  var noResult = document.getElementById("noResult");

  var selectedFile = null;
  var cameraStream = null;
  var scanTimer = null;
  var scanning = false;

  // ---- Tab switching ----
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var target = tab.dataset.tab;
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      panels.forEach(function (p) { p.classList.remove("active"); });
      document.getElementById("panel-" + target).classList.add("active");

      if (target !== "camera") {
        stopCamera();
      }
    });
  });

  // ---- Image Upload ----
  dropZone.addEventListener("click", function () { fileInput.click(); });

  dropZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener("change", function () {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
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
    selectedFile = null;
    fileInput.value = "";
    dropZone.style.display = "block";
    previewArea.style.display = "none";
    btnUpload.disabled = true;
    hideResults();
  });

  btnUpload.addEventListener("click", function () {
    if (!selectedFile) return;
    var formData = new FormData();
    formData.append("image", selectedFile);
    showLoading();
    fetch("/api/ocr", { method: "POST", body: formData })
      .then(function (r) { return r.json(); })
      .then(function (data) { showResults(data); })
      .catch(function (err) { hideLoading(); alert("识别失败: " + err.message); });
  });

  // ---- Camera (real-time) ----
  btnToggleCamera.addEventListener("click", function () {
    if (cameraStream) {
      stopCamera();
    } else {
      startCamera();
    }
  });

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraStatus.textContent = "浏览器不支持摄像头，请使用 HTTPS 访问";
      return;
    }
    cameraStatus.textContent = "正在开启摄像头...";

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    })
    .then(function (stream) {
      cameraStream = stream;
      cameraVideo.srcObject = stream;
      cameraVideo.style.display = "block";
      cameraPlaceholder.style.display = "none";
      btnToggleCamera.textContent = "关闭摄像头";
      cameraStatus.textContent = "实时识别中...";
      startScanning();
    })
    .catch(function (err) {
      cameraStatus.textContent = "无法打开摄像头: " + err.message;
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        cameraStatus.textContent = "需要 HTTPS 才能使用摄像头，请用 https:// 访问";
      }
    });
  }

  function stopCamera() {
    stopScanning();
    if (cameraStream) {
      cameraStream.getTracks().forEach(function (t) { t.stop(); });
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
    cameraVideo.style.display = "none";
    cameraPlaceholder.style.display = "block";
    btnToggleCamera.textContent = "开启摄像头";
    cameraStatus.textContent = "未开启";
    liveResult.style.display = "none";
  }

  function startScanning() {
    if (scanTimer) return;
    scanTimer = setInterval(captureAndRecognize, 1500);
  }

  function stopScanning() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
    scanning = false;
  }

  function captureAndRecognize() {
    if (!cameraStream || scanning) return;
    scanning = true;

    var w = cameraVideo.videoWidth;
    var h = cameraVideo.videoHeight;
    if (w === 0 || h === 0) { scanning = false; return; }

    cameraCanvas.width = w;
    cameraCanvas.height = h;
    var ctx = cameraCanvas.getContext("2d");
    ctx.drawImage(cameraVideo, 0, 0, w, h);

    cameraCanvas.toBlob(function (blob) {
      if (!blob) { scanning = false; return; }
      var formData = new FormData();
      formData.append("image", blob, "frame.jpg");

      cameraStatus.textContent = "正在识别...";

      fetch("/api/ocr", { method: "POST", body: formData })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.match) {
            liveAnswer.textContent = data.match.answer;
            liveDetail.textContent = data.match.question + " (" + data.match.similarity + "%)";
            liveResult.style.display = "block";
            cameraStatus.textContent = "已匹配 - 实时识别中...";
          } else {
            liveResult.style.display = "none";
            cameraStatus.textContent = "未匹配 - 实时识别中...";
          }
        })
        .catch(function () {
          cameraStatus.textContent = "识别出错 - 重试中...";
        })
        .finally(function () {
          scanning = false;
        });
    }, "image/jpeg", 0.85);
  }

  // ---- Text Search ----
  btnSearch.addEventListener("click", function () {
    var text = textInput.value.trim();
    if (!text) return;
    showLoading();
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { showResults(data); })
      .catch(function (err) { hideLoading(); alert("搜索失败: " + err.message); });
  });

  textInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); btnSearch.click(); }
  });

  // ---- Results ----
  function showLoading() { loading.style.display = "block"; resultArea.style.display = "none"; }
  function hideLoading() { loading.style.display = "none"; }

  function hideResults() {
    resultArea.style.display = "none";
    mainResult.style.display = "none";
    ocrTextBox.style.display = "none";
    searchResults.style.display = "none";
    noResult.style.display = "none";
  }

  function showResults(data) {
    hideLoading();
    hideResults();
    resultArea.style.display = "block";
    var hasResult = false;

    if (data.ocr_text) {
      document.getElementById("ocrTextContent").textContent = data.ocr_text;
      ocrTextBox.style.display = "block";
    }

    if (data.match) {
      hasResult = true;
      document.getElementById("resultQuestion").textContent = data.match.question;
      document.getElementById("resultAnswer").textContent = data.match.answer;
      var expEl = document.getElementById("resultExplanation");
      if (data.match.explanation) { expEl.textContent = data.match.explanation; expEl.style.display = "block"; }
      else { expEl.style.display = "none"; }
      document.getElementById("resultSimilarity").innerHTML = "匹配度: <span>" + data.match.similarity + "%</span>";
      mainResult.style.display = "block";
    }

    if (data.search_results && data.search_results.length > 0) {
      hasResult = true;
      var list = document.getElementById("searchResultsList");
      list.innerHTML = "";
      data.search_results.forEach(function (r) {
        var div = document.createElement("div");
        div.className = "search-item";
        div.innerHTML =
          '<div class="q">' + esc(r.question) + "</div>" +
          '<div class="a">' + esc(r.answer) + "</div>" +
          (r.explanation ? '<div class="e">' + esc(r.explanation) + "</div>" : "") +
          '<div class="s">匹配度: ' + r.similarity + "%</div>";
        list.appendChild(div);
      });
      searchResults.style.display = "block";
    }

    if (!hasResult) noResult.style.display = "block";
  }

  function esc(t) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(t));
    return d.innerHTML;
  }
});

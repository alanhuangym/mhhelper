document.addEventListener("DOMContentLoaded", function () {
  // Elements
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const previewArea = document.getElementById("previewArea");
  const previewImg = document.getElementById("previewImg");
  const btnClearImg = document.getElementById("btnClearImg");
  const btnUpload = document.getElementById("btnUpload");
  const btnStartCamera = document.getElementById("btnStartCamera");
  const btnCapture = document.getElementById("btnCapture");
  const cameraVideo = document.getElementById("cameraVideo");
  const cameraCanvas = document.getElementById("cameraCanvas");
  const textInput = document.getElementById("textInput");
  const btnSearch = document.getElementById("btnSearch");
  const loading = document.getElementById("loading");
  const resultArea = document.getElementById("resultArea");
  const mainResult = document.getElementById("mainResult");
  const ocrTextBox = document.getElementById("ocrTextBox");
  const searchResults = document.getElementById("searchResults");
  const noResult = document.getElementById("noResult");

  let selectedFile = null;
  let cameraStream = null;

  // ---- Tab switching ----
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      const target = tab.dataset.tab;
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      panels.forEach(function (p) { p.classList.remove("active"); });
      document.getElementById("panel-" + target).classList.add("active");

      // Stop camera when switching away
      if (target !== "camera" && cameraStream) {
        stopCamera();
      }
    });
  });

  // ---- Image Upload ----
  dropZone.addEventListener("click", function () {
    fileInput.click();
  });

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
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", function () {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
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
    fetch("/api/ocr", {
      method: "POST",
      body: formData,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { showResults(data); })
      .catch(function (err) {
        hideLoading();
        alert("Recognition failed: " + err.message);
      });
  });

  // ---- Camera ----
  btnStartCamera.addEventListener("click", function () {
    if (cameraStream) {
      stopCamera();
    } else {
      startCamera();
    }
  });

  function startCamera() {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(function (stream) {
        cameraStream = stream;
        cameraVideo.srcObject = stream;
        btnStartCamera.textContent = "Close camera";
        btnCapture.disabled = false;
      })
      .catch(function (err) {
        alert("Cannot access camera: " + err.message);
      });
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(function (t) { t.stop(); });
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
    btnStartCamera.textContent = "Open camera";
    btnCapture.disabled = true;
  }

  btnCapture.addEventListener("click", function () {
    if (!cameraStream) return;
    var w = cameraVideo.videoWidth;
    var h = cameraVideo.videoHeight;
    cameraCanvas.width = w;
    cameraCanvas.height = h;
    var ctx = cameraCanvas.getContext("2d");
    ctx.drawImage(cameraVideo, 0, 0, w, h);
    cameraCanvas.toBlob(function (blob) {
      var formData = new FormData();
      formData.append("image", blob, "capture.jpg");
      showLoading();
      fetch("/api/ocr", {
        method: "POST",
        body: formData,
      })
        .then(function (r) { return r.json(); })
        .then(function (data) { showResults(data); })
        .catch(function (err) {
          hideLoading();
          alert("Recognition failed: " + err.message);
        });
    }, "image/jpeg", 0.9);
  });

  // ---- Text Search ----
  btnSearch.addEventListener("click", function () {
    var text = textInput.value.trim();
    if (!text) {
      alert("Please enter question text");
      return;
    }
    showLoading();
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { showResults(data); })
      .catch(function (err) {
        hideLoading();
        alert("Search failed: " + err.message);
      });
  });

  textInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      btnSearch.click();
    }
  });

  // ---- Results ----
  function showLoading() {
    loading.style.display = "block";
    resultArea.style.display = "none";
  }

  function hideLoading() {
    loading.style.display = "none";
  }

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

    // Show OCR text if available
    if (data.ocr_text) {
      document.getElementById("ocrTextContent").textContent = data.ocr_text;
      ocrTextBox.style.display = "block";
    }

    // Show main match
    if (data.match) {
      hasResult = true;
      document.getElementById("resultQuestion").textContent = data.match.question;
      document.getElementById("resultAnswer").textContent = data.match.answer;
      var expEl = document.getElementById("resultExplanation");
      if (data.match.explanation) {
        expEl.textContent = data.match.explanation;
        expEl.style.display = "block";
      } else {
        expEl.style.display = "none";
      }
      document.getElementById("resultSimilarity").innerHTML =
        "Match: <span>" + data.match.similarity + "%</span>";
      mainResult.style.display = "block";
    }

    // Show search results
    if (data.search_results && data.search_results.length > 0) {
      hasResult = true;
      var list = document.getElementById("searchResultsList");
      list.innerHTML = "";
      data.search_results.forEach(function (r) {
        var div = document.createElement("div");
        div.className = "search-item";
        div.innerHTML =
          '<div class="q">' + escapeHtml(r.question) + "</div>" +
          '<div class="a">' + escapeHtml(r.answer) + "</div>" +
          (r.explanation ? '<div class="e">' + escapeHtml(r.explanation) + "</div>" : "") +
          '<div class="s">Match: ' + r.similarity + "%</div>";
        list.appendChild(div);
      });
      searchResults.style.display = "block";
    }

    if (!hasResult) {
      noResult.style.display = "block";
    }
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }
});

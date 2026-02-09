document.addEventListener("DOMContentLoaded", function () {
  var tabs = document.querySelectorAll(".tab");
  var panels = document.querySelectorAll(".panel");
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var previewArea = document.getElementById("previewArea");
  var previewImg = document.getElementById("previewImg");
  var btnClearImg = document.getElementById("btnClearImg");
  var btnUpload = document.getElementById("btnUpload");
  var cameraInput = document.getElementById("cameraInput");
  var snapZone = document.getElementById("snapZone");
  var snapResult = document.getElementById("snapResult");
  var snapAnswer = document.getElementById("snapAnswer");
  var snapQuestion = document.getElementById("snapQuestion");
  var snapExplanation = document.getElementById("snapExplanation");
  var snapSimilarity = document.getElementById("snapSimilarity");
  var snapStatus = document.getElementById("snapStatus");
  var btnSnap = document.getElementById("btnSnap");
  var textInput = document.getElementById("textInput");
  var btnSearch = document.getElementById("btnSearch");
  var loading = document.getElementById("loading");
  var resultArea = document.getElementById("resultArea");
  var mainResult = document.getElementById("mainResult");
  var ocrTextBox = document.getElementById("ocrTextBox");
  var searchResults = document.getElementById("searchResults");
  var noResult = document.getElementById("noResult");

  var selectedFile = null;

  // ---- Tab switching ----
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var target = tab.dataset.tab;
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      panels.forEach(function (p) { p.classList.remove("active"); });
      document.getElementById("panel-" + target).classList.add("active");
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

  // ---- Snap Camera (native capture, works on iOS HTTP) ----
  snapZone.addEventListener("click", function () { cameraInput.click(); });
  btnSnap.addEventListener("click", function () { cameraInput.click(); });

  cameraInput.addEventListener("change", function () {
    if (!cameraInput.files || !cameraInput.files[0]) return;
    var file = cameraInput.files[0];
    var formData = new FormData();
    formData.append("image", file);

    snapStatus.textContent = "正在识别...";
    snapResult.style.display = "none";

    fetch("/api/ocr", { method: "POST", body: formData })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.match) {
          snapAnswer.textContent = data.match.answer;
          snapQuestion.textContent = data.match.question;
          if (data.match.explanation) {
            snapExplanation.textContent = data.match.explanation;
            snapExplanation.style.display = "block";
          } else {
            snapExplanation.style.display = "none";
          }
          snapSimilarity.textContent = "匹配度: " + data.match.similarity + "%";
          snapResult.style.display = "block";
          snapStatus.textContent = "识别完成，点击按钮继续拍下一题";
        } else {
          snapResult.style.display = "none";
          snapStatus.textContent = "未匹配到题目，请重新拍照或用文字搜索";
        }
      })
      .catch(function () {
        snapStatus.textContent = "识别失败，请重试";
      });

    // Reset input so same file can trigger change again
    cameraInput.value = "";
  });

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

// 自訂 chroma-key shader：將影片中的綠色背景去除
AFRAME.registerShader("chroma-key", {
  schema: {
    src: { type: "map" },
    keyColor: { type: "vec3", default: { x: 0.0, y: 1.0, z: 0.0 } },
    similarity: { type: "number", default: 0.4 }, // 類似度（越大越多被去掉）
    smoothness: { type: "number", default: 0.1 }, // 邊緣柔和度
  },

  init: function (data) {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        map: { value: data.src },
        keyColor: { value: new THREE.Color(data.keyColor.x, data.keyColor.y, data.keyColor.z) },
        similarity: { value: data.similarity },
        smoothness: { value: data.smoothness },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform sampler2D map;
        uniform vec3 keyColor;
        uniform float similarity;
        uniform float smoothness;
        varying vec2 vUv;

        void main() {
          vec4 videoColor = texture2D(map, vUv);
          float Y1 = 0.2989 * videoColor.r + 0.5866 * videoColor.g + 0.1145 * videoColor.b;
          float Cr1 = 0.7132 * (videoColor.r - Y1);
          float Cb1 = 0.5647 * (videoColor.b - Y1);

          float Y2 = 0.2989 * keyColor.r + 0.5866 * keyColor.g + 0.1145 * keyColor.b;
          float Cr2 = 0.7132 * (keyColor.r - Y2);
          float Cb2 = 0.5647 * (keyColor.b - Y2);

          float blend = smoothstep(similarity, similarity + smoothness, distance(vec2(Cr1, Cb1), vec2(Cr2, Cb2)));

          gl_FragColor = vec4(videoColor.rgb, videoColor.a * blend);
        }
      `,
    });
  },

  update: function (data) {
    if (data.src) {
      this.material.uniforms.map.value = data.src;
    }
    this.material.uniforms.keyColor.value = new THREE.Color(
      data.keyColor.x,
      data.keyColor.y,
      data.keyColor.z
    );
    this.material.uniforms.similarity.value = data.similarity;
    this.material.uniforms.smoothness.value = data.smoothness;
  },
});

(function () {
  const loadingOverlay = document.getElementById("loading-overlay");
  const unsupportedEl = document.getElementById("ar-unsupported");
  const backBtn = document.getElementById("btn-back");
  const photoBtn = document.getElementById("btn-photo");
  const recordBtn = document.getElementById("btn-record");
  const recordTimerEl = document.getElementById("record-timer");

  let mediaRecorder = null;
  let recordedChunks = [];
  let recordStartTime = null;
  let recordTimerInterval = null;
  const MAX_SECONDS = 30;

  function isArSupported() {
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasWebGL = (() => {
      try {
        const canvas = document.createElement("canvas");
        return !!(
          window.WebGLRenderingContext &&
          (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
        );
      } catch (e) {
        return false;
      }
    })();
    return hasMediaDevices && hasWebGL;
  }

  function hideLoading() {
    if (loadingOverlay) {
      loadingOverlay.classList.add("hidden");
    }
  }

  function showUnsupported() {
    if (unsupportedEl) {
      unsupportedEl.classList.remove("hidden");
    }
  }

  function formatTime(sec) {
    const s = Math.floor(sec);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function startVideoOnMarker() {
    const video = document.getElementById("greenscreen-video");
    if (!video) return;
    const marker = document.querySelector("a-marker");
    if (!marker) return;

    marker.addEventListener("markerFound", () => {
      video.play().catch(() => {
        // 某些瀏覽器可能需要使用者互動才允許播放，忽略錯誤即可
      });
    });

    marker.addEventListener("markerLost", () => {
      video.pause();
    });
  }

  function setupBackButton() {
    if (!backBtn) return;
    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  function capturePhoto() {
    const sceneCanvas = document.querySelector("canvas");
    if (!sceneCanvas) {
      alert("找不到 AR 畫面，請稍候再試。");
      return;
    }
    const dataUrl = sceneCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ar-photo-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    mediaRecorder.stop();
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;
    document.body.classList.remove("recording");
  }

  function startRecording() {
    const sceneCanvas = document.querySelector("canvas");
    if (!sceneCanvas) {
      alert("找不到 AR 畫面，請稍候再試。");
      return;
    }

    if (typeof MediaRecorder === "undefined" || !sceneCanvas.captureStream) {
      alert("此瀏覽器不支援錄影（MediaRecorder / canvas.captureStream 不可用）。");
      return;
    }

    const stream = sceneCanvas.captureStream(30);
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9,opus",
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ar-record-${Date.now()}.webm`; // 註：大部分瀏覽器下載為 webm，若需要 mp4 需伺服器轉檔
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      recordedChunks = [];
    };

    mediaRecorder.start(100);
    recordStartTime = Date.now();
    document.body.classList.add("recording");

    recordTimerInterval = setInterval(() => {
      const elapsedSec = (Date.now() - recordStartTime) / 1000;
      recordTimerEl.textContent = formatTime(elapsedSec);
      if (elapsedSec >= MAX_SECONDS) {
        stopRecording();
      }
    }, 200);
  }

  function setupCaptureAndRecord() {
    if (photoBtn) {
      photoBtn.addEventListener("click", capturePhoto);
    }
    if (recordBtn) {
      recordBtn.addEventListener("click", () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          stopRecording();
        } else {
          recordTimerEl.textContent = "00:00";
          startRecording();
        }
      });
    }
  }

  function init() {
    if (!isArSupported()) {
      showUnsupported();
    }

    // 場景準備就緒後隱藏載入遮罩
    const scene = document.getElementById("ar-scene");
    if (scene) {
      scene.addEventListener("loaded", () => {
        hideLoading();
      });
    } else {
      hideLoading();
    }

    setupBackButton();
    setupCaptureAndRecord();
    startVideoOnMarker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();



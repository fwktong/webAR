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
  
  let cameraStream = null;
  let arSystem = null;
  let scene = null;
  let renderCheckInterval = null;

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

  // 監聽相機 stream 狀態，確保相機持續運作
  function monitorCameraStream() {
    if (!arSystem) return;
    
    const arController = arSystem.arController;
    if (!arController || !arController._video) return;
    
    const video = arController._video;
    
    // 檢查 video 是否還在播放
    if (video && video.readyState >= 2) {
      // 如果 video 暫停了，嘗試重新播放
      if (video.paused) {
        video.play().catch((err) => {
          console.warn("無法自動恢復相機播放:", err);
        });
      }
    }
    
    // 檢查 stream 是否還活躍
    if (cameraStream) {
      const tracks = cameraStream.getVideoTracks();
      const activeTracks = tracks.filter(t => t.readyState === 'live');
      if (activeTracks.length === 0) {
        console.warn("相機 stream 已中斷，嘗試重新初始化...");
        // 可以選擇重新初始化，但這可能會造成閃爍
        // 暫時只記錄警告
      }
    }
  }

  // 確保場景持續渲染
  function ensureSceneRendering() {
    if (!scene) return;
    
    const renderer = scene.renderer;
    if (!renderer) return;
    
    // 強制場景繼續渲染（防止瀏覽器暫停）
    if (renderer && renderer.render) {
      // 這個檢查確保渲染循環持續運作
      const canvas = renderer.domElement;
      if (canvas) {
        // 觸發一次渲染以保持活躍
        scene.tick();
      }
    }
  }

  // 初始化相機監聽
  function setupCameraMonitoring() {
    scene = document.getElementById("ar-scene");
    if (!scene) return;

    // 等待 AR.js 系統初始化
    scene.addEventListener("arjs-video-loaded", () => {
      console.log("AR.js 相機已載入");
      arSystem = scene.systems["arjs"];
      
      if (arSystem && arSystem.arController) {
        const video = arSystem.arController._video;
        if (video) {
          cameraStream = video.srcObject;
          
          // 監聽 video 事件
          video.addEventListener("play", () => {
            console.log("相機 video 開始播放");
          });
          
          video.addEventListener("pause", () => {
            console.warn("相機 video 被暫停，嘗試恢復...");
            video.play().catch(() => {});
          });
          
          video.addEventListener("ended", () => {
            console.warn("相機 video 結束，嘗試重新載入...");
            video.load();
            video.play().catch(() => {});
          });
          
          // 監聽 stream 的 track 事件
          if (cameraStream) {
            cameraStream.getVideoTracks().forEach(track => {
              track.addEventListener("ended", () => {
                console.warn("相機 track 已結束");
              });
              
              track.addEventListener("mute", () => {
                console.warn("相機 track 被靜音");
              });
            });
          }
        }
      }
    });

    // 定期檢查相機和渲染狀態
    renderCheckInterval = setInterval(() => {
      monitorCameraStream();
      ensureSceneRendering();
    }, 1000); // 每秒檢查一次
  }

  // 防止頁面進入背景時暫停
  function preventPagePause() {
    // 監聽頁面可見性變化
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && scene) {
        // 頁面重新可見時，確保場景繼續渲染
        console.log("頁面重新可見，恢復 AR 場景");
        setTimeout(() => {
          if (arSystem && arSystem.arController && arSystem.arController._video) {
            const video = arSystem.arController._video;
            if (video.paused || video.ended) {
              video.load();
              video.play().catch((err) => {
                console.warn("恢復相機播放失敗:", err);
              });
            }
          }
          if (scene && scene.isPlaying === false) {
            scene.play();
          }
        }, 100);
      } else if (document.hidden) {
        console.log("頁面進入背景");
      }
    });

    // 監聽頁面焦點
    window.addEventListener("focus", () => {
      console.log("視窗獲得焦點");
      if (scene) {
        setTimeout(() => {
          scene.play();
          if (arSystem && arSystem.arController && arSystem.arController._video) {
            const video = arSystem.arController._video;
            if (video.paused) {
              video.play().catch(() => {});
            }
          }
        }, 100);
      }
    });

    window.addEventListener("blur", () => {
      // 即使失去焦點也保持場景運作（但某些瀏覽器可能會強制暫停）
      console.log("視窗失去焦點");
    });
    
    // iOS Safari 特殊處理：防止自動暫停
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      // 定期觸發場景 tick 以保持活躍
      setInterval(() => {
        if (scene && scene.isPlaying) {
          // 觸發一次渲染
          scene.tick();
        }
      }, 100);
    }
  }

  function init() {
    if (!isArSupported()) {
      showUnsupported();
    }

    // 場景準備就緒後隱藏載入遮罩
    scene = document.getElementById("ar-scene");
    if (scene) {
      scene.addEventListener("loaded", () => {
        hideLoading();
        // 確保場景不會自動暫停
        scene.play();
      });
      
      // 監聽場景暫停事件
      scene.addEventListener("pause", () => {
        console.warn("場景被暫停，嘗試恢復...");
        setTimeout(() => {
          if (scene) {
            scene.play();
          }
        }, 100);
      });
    } else {
      hideLoading();
    }

    setupBackButton();
    setupCaptureAndRecord();
    startVideoOnMarker();
    setupCameraMonitoring();
    preventPagePause();
    
    // 確保頁面載入後場景立即開始渲染
    if (scene) {
      // 延遲一點確保 AR.js 已初始化
      setTimeout(() => {
        if (scene) {
          scene.play();
          console.log("場景已啟動，isPlaying:", scene.isPlaying);
        }
      }, 500);
    }
    
    // 額外保護：定期檢查場景是否還在播放
    setInterval(() => {
      if (scene && !scene.isPlaying) {
        console.warn("場景已停止，嘗試恢復...");
        scene.play();
      }
    }, 2000);
  }
  
  // 清理函數
  function cleanup() {
    if (renderCheckInterval) {
      clearInterval(renderCheckInterval);
      renderCheckInterval = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
  }
  
  // 頁面卸載時清理
  window.addEventListener("beforeunload", cleanup);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();







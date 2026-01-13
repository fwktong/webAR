// 自訂 chroma-key shader：將影片中的綠色背景去除
AFRAME.registerShader("chroma-key", {
  schema: {
    src: { type: "map" },
    keyColor: { type: "vec3", default: { x: 0.0, y: 1.0, z: 0.0 } },
    similarity: { type: "number", default: 0.4 }, // 類似度（越大越多被去掉）
    smoothness: { type: "number", default: 0.1 }, // 邊緣柔和度
  },

  init: function (data) {
    console.log("Chroma-key shader init, data.src:", data.src);
    
    // 確保 video texture 正確初始化
    let videoTexture = null;
    if (data.src) {
      if (data.src instanceof HTMLVideoElement) {
        // 如果是 video element，創建 texture
        console.log("創建 VideoTexture from HTMLVideoElement");
        videoTexture = new THREE.VideoTexture(data.src);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.format = THREE.RGBFormat;
        videoTexture.needsUpdate = true;
      } else if (data.src && data.src.isTexture) {
        // 如果已經是 texture
        console.log("使用現有的 Texture");
        videoTexture = data.src;
      } else {
        console.warn("data.src 不是 HTMLVideoElement 也不是 Texture:", data.src);
      }
    } else {
      console.warn("data.src 為空");
    }
    
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false, // 重要：確保透明材質正確渲染
      uniforms: {
        map: { value: videoTexture },
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
    console.log("Chroma-key shader update, data.src:", data.src);
    
    if (data.src) {
      let videoTexture = null;
      if (data.src instanceof HTMLVideoElement) {
        // 如果是 video element，創建或更新 texture
        if (!this.material.uniforms.map.value || !this.material.uniforms.map.value.isVideoTexture) {
          console.log("創建新的 VideoTexture");
          videoTexture = new THREE.VideoTexture(data.src);
          videoTexture.minFilter = THREE.LinearFilter;
          videoTexture.magFilter = THREE.LinearFilter;
          videoTexture.format = THREE.RGBFormat;
          this.material.uniforms.map.value = videoTexture;
        } else {
          // 更新現有的 texture
          console.log("更新現有的 VideoTexture");
          this.material.uniforms.map.value.image = data.src;
        }
      } else if (data.src && data.src.isTexture) {
        console.log("使用現有的 Texture");
        this.material.uniforms.map.value = data.src;
      } else {
        console.warn("data.src 類型未知，直接賦值:", typeof data.src);
        this.material.uniforms.map.value = data.src;
      }
      
      // 確保 texture 更新
      if (this.material.uniforms.map.value) {
        this.material.uniforms.map.value.needsUpdate = true;
        console.log("Texture needsUpdate 設置為 true");
      } else {
        console.warn("Texture 值為 null 或 undefined");
      }
    } else {
      console.warn("update: data.src 為空");
    }
    this.material.uniforms.keyColor.value = new THREE.Color(
      data.keyColor.x,
      data.keyColor.y,
      data.keyColor.z
    );
    this.material.uniforms.similarity.value = data.similarity;
    this.material.uniforms.smoothness.value = data.smoothness;
  },
  
  tick: function () {
    // 持續更新 video texture
    if (this.material && this.material.uniforms && this.material.uniforms.map) {
      const texture = this.material.uniforms.map.value;
      if (texture && texture.image && texture.image.readyState >= 2) {
        texture.needsUpdate = true;
      }
    }
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

  function playVideoOnMarker() {
    const video = document.getElementById("greenscreen-video");
    if (!video) {
      console.warn("playVideoOnMarker: 找不到影片元素");
      return;
    }
    
    const videoPlane = document.getElementById("video-plane");
    const testPlane = document.getElementById("test-plane");
    const marker = document.querySelector("a-marker");
    
    if (!videoPlane) {
      console.warn("playVideoOnMarker: 找不到影片平面元素");
      return;
    }
    
    console.log("標記已偵測到，嘗試播放影片");
    
    // 關鍵：強制設置 marker 和所有子元素為可見
    if (marker && marker.object3D) {
      marker.object3D.visible = true;
      console.log("強制設置 marker.object3D.visible = true");
      
      // 遍歷所有子元素，設置為可見
      marker.object3D.traverse((child) => {
        if (child.visible !== undefined) {
          child.visible = true;
        }
      });
      console.log("設置所有子元素為可見");
    }
    
    // 確保平面可見
    const planeMesh = videoPlane.getObject3D("mesh");
    const testMesh = testPlane ? testPlane.getObject3D("mesh") : null;
    
    if (planeMesh) {
      console.log("平面狀態 - visible:", planeMesh.visible, 
                 "position:", planeMesh.position,
                 "parent visible:", planeMesh.parent ? planeMesh.parent.visible : "N/A");
      
      // 強制設置為可見
      planeMesh.visible = true;
      
      // 確保父級（marker）也是可見的
      if (planeMesh.parent) {
        planeMesh.parent.visible = true;
        console.log("設置父級（marker）為可見");
      }
      
      // 確保位置正確
      planeMesh.position.set(0, 0.2, 0);
      console.log("設置平面為可見，位置:", planeMesh.position);
    }
    
    if (testMesh) {
      testMesh.visible = true;
      console.log("設置測試平面為可見");
    }
    
    // 確保影片播放
    if (video.paused || video.ended) {
      video.play().then(() => {
        console.log("影片播放成功");
      }).catch((err) => {
        console.warn("影片播放失敗:", err);
      });
    } else {
      console.log("影片已在播放中");
    }
    
    // 檢查並更新 shader 材質
    if (planeMesh && planeMesh.material) {
      console.log("更新材質，類型:", planeMesh.material.type);
      
      // 確保材質的 map 有正確的 video texture
      if (planeMesh.material.uniforms && planeMesh.material.uniforms.map) {
        const texture = planeMesh.material.uniforms.map.value;
        if (texture) {
          if (texture.isTexture) {
            console.log("Texture 存在，強制更新");
            texture.needsUpdate = true;
            // 如果是 VideoTexture，確保持續更新
            if (texture.image && texture.image instanceof HTMLVideoElement) {
              // VideoTexture 應該自動更新，但我們確保它被標記為需要更新
              texture.needsUpdate = true;
            }
          } else {
            console.warn("Texture 不是有效的 THREE.Texture");
          }
        } else {
          console.warn("Texture 值為 null 或 undefined");
        }
      } else {
        console.warn("材質沒有 uniforms.map");
      }
    } else {
      console.warn("找不到 mesh 或材質");
    }
  }

  function pauseVideoOnMarker() {
    const video = document.getElementById("greenscreen-video");
    if (video) {
      console.log("標記遺失，暫停影片");
      video.pause();
    }
  }
  
  // 檢查標記並更新可見性
  let lastMatrixString = "";
  function checkMarkerAndUpdateVisibility() {
    const marker = document.querySelector("a-marker");
    if (!marker || !marker.object3D) return;
    
    const videoPlane = document.getElementById("video-plane");
    const testPlane = document.getElementById("test-plane");
    if (!videoPlane) return;
    
    // 檢查 AR.js marker 組件的內部狀態
    let isMarkerDetected = false;
    
    // 方法1: 檢查矩陣是否在變化（最可靠的方法）
    const matrix = marker.object3D.matrix;
    if (matrix && matrix.elements) {
      // 將矩陣轉換為字符串來比較
      const matrixString = matrix.elements.join(",");
      
      // 如果矩陣改變了，表示標記被追蹤到
      if (matrixString !== lastMatrixString && lastMatrixString !== "") {
        isMarkerDetected = true;
        console.log("檢測到矩陣變化，標記被追蹤到");
      }
      
      // 檢查矩陣的平移部分（elements[12], [13], [14]）
      // 如果這些值不是 0，表示標記被偵測到
      const tx = Math.abs(matrix.elements[12]);
      const ty = Math.abs(matrix.elements[13]);
      const tz = Math.abs(matrix.elements[14]);
      
      // 如果平移值大於一個很小的閾值，表示標記被偵測到
      if (tx > 0.001 || ty > 0.001 || tz > 0.001) {
        isMarkerDetected = true;
      }
      
      // 檢查矩陣是否不是單位矩陣
      if (!matrix.isIdentity()) {
        // 進一步檢查：確保不是初始狀態
        // 如果矩陣有實際的變換值，標記應該被偵測到
        const hasRealTransform = tx > 0.01 || ty > 0.01 || tz > 0.01;
        if (hasRealTransform) {
          isMarkerDetected = true;
        }
      }
      
      lastMatrixString = matrixString;
    }
    
    // 方法2: 直接檢查 AR.js 的內部狀態
    if (marker.components && marker.components['arjs-marker']) {
      const arjsMarker = marker.components['arjs-marker'];
      if (arjsMarker.arMarker) {
        // 某些版本的 AR.js 可能會設置 visible
        // 但我們主要依賴矩陣檢查
      }
    }
    
    // 如果標記被偵測到，強制設置可見性
    if (isMarkerDetected) {
      // 強制設置 marker 和所有子元素為可見
      if (!marker.object3D.visible) {
        marker.object3D.visible = true;
        console.log("檢測到標記，強制設置 marker.object3D.visible = true");
      }
      
      // 確保所有子元素可見
      marker.object3D.traverse((child) => {
        if (child.visible !== undefined && !child.visible) {
          child.visible = true;
        }
      });
      
      // 播放影片
      const video = document.getElementById("greenscreen-video");
      if (video && video.paused) {
        video.play().catch(err => console.warn("自動播放失敗:", err));
      }
    }
    
    // 無論是否偵測到，都強制設置一次（用於測試）
    // 這可以幫助我們確認渲染是否正常
    // 先嘗試一次強制設置，看看是否能顯示
    if (!window.forceVisibleTested) {
      window.forceVisibleTested = true;
      console.log("強制設置測試：設置 marker 和子元素為可見（僅測試一次）");
      marker.object3D.visible = true;
      marker.object3D.traverse((child) => {
        if (child.visible !== undefined) {
          child.visible = true;
        }
      });
      
      // 也強制播放影片
      const video = document.getElementById("greenscreen-video");
      if (video) {
        video.play().catch(err => console.warn("強制播放失敗:", err));
      }
      
      // 輸出詳細狀態
      console.log("強制設置後的狀態:");
      console.log("  marker.object3D.visible:", marker.object3D.visible);
      const planeMesh = videoPlane.getObject3D("mesh");
      const testMesh = testPlane ? testPlane.getObject3D("mesh") : null;
      console.log("  planeMesh.visible:", planeMesh ? planeMesh.visible : "N/A");
      console.log("  testMesh.visible:", testMesh ? testMesh.visible : "N/A");
      console.log("  matrix:", matrix ? matrix.elements.slice(12, 15) : "N/A");
    }
  }

  function startVideoOnMarker() {
    const video = document.getElementById("greenscreen-video");
    if (!video) {
      console.error("找不到綠幕影片元素");
      return;
    }
    
    const marker = document.querySelector("a-marker");
    if (!marker) {
      console.error("找不到 marker 元素");
      return;
    }

    console.log("設置標記事件監聽器");

    // 使用 A-Frame 的事件系統
    marker.addEventListener("markerFound", () => {
      playVideoOnMarker();
    });

    marker.addEventListener("markerLost", () => {
      pauseVideoOnMarker();
    });
    
    // 額外：定期檢查標記狀態（作為備用機制）
    // 這個已經被 checkMarkerAndUpdateVisibility 取代，但保留作為最終備用
    let lastMarkerState = false;
    let markerCheckInterval = setInterval(() => {
      checkMarkerAndUpdateVisibility();
      
      // 調試信息：每5秒輸出一次狀態
      if (Math.random() < 0.01) { // 約每5秒一次
        const marker = document.querySelector("a-marker");
        const videoPlane = document.getElementById("video-plane");
        const planeMesh = videoPlane ? videoPlane.getObject3D("mesh") : null;
        const video = document.getElementById("greenscreen-video");
        
        console.log("標記調試 - marker.object3D.visible:", marker && marker.object3D ? marker.object3D.visible : "N/A",
                   "planeMesh.visible:", planeMesh ? planeMesh.visible : "N/A",
                   "video.paused:", video ? video.paused : "N/A",
                   "matrix isIdentity:", marker && marker.object3D && marker.object3D.matrix ? marker.object3D.matrix.isIdentity() : "N/A");
      }
    }, 200); // 每 200ms 檢查一次
    
    // 存儲 interval ID 以便清理
    if (window.arMarkerCheckInterval) {
      clearInterval(window.arMarkerCheckInterval);
    }
    window.arMarkerCheckInterval = markerCheckInterval;
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
    
    // 等待場景完全載入後再初始化
    if (scene) {
      scene.addEventListener("loaded", () => {
        console.log("場景已載入，開始初始化 AR 功能");
        
        // 等待 AR.js 系統完全初始化
        scene.addEventListener("arjs-video-loaded", () => {
          console.log("AR.js 相機已載入，開始設置標記監聽");
          
          // 再延遲一點確保所有組件都已初始化
          setTimeout(() => {
            startVideoOnMarker();
            setupCameraMonitoring();
            preventPagePause();
            
            // 確保場景播放
            if (scene) {
              scene.play();
              console.log("場景已啟動，isPlaying:", scene.isPlaying);
            }
            
            // 檢查影片狀態並確保載入
            const video = document.getElementById("greenscreen-video");
            if (video) {
              console.log("影片初始狀態 - readyState:", video.readyState, "paused:", video.paused);
              
              // 監聽影片載入事件
              video.addEventListener("canplay", () => {
                console.log("影片可以播放，readyState:", video.readyState);
              });
              
              video.addEventListener("loadedmetadata", () => {
                console.log("影片 metadata 已載入，尺寸:", video.videoWidth, "x", video.videoHeight);
              });
              
              // 預載影片
              video.load();
              
              // 檢查平面元素和材質
              const plane = document.getElementById("video-plane");
              if (plane) {
                console.log("影片平面元素存在");
                setTimeout(() => {
                  const mesh = plane.getObject3D("mesh");
                  if (mesh) {
                    console.log("Mesh 存在，材質:", mesh.material ? mesh.material.type : "無");
                    console.log("Mesh visible:", mesh.visible);
                    if (mesh.material && mesh.material.uniforms) {
                      const texture = mesh.material.uniforms.map.value;
                      console.log("Texture:", texture ? (texture.isTexture ? "是 Texture" : "不是 Texture") : "無");
                      if (texture && texture.isTexture) {
                        console.log("Texture 已準備好，等待標記偵測");
                        // 強制設置為可見（測試用）
                        mesh.visible = true;
                        console.log("強制設置平面為可見（測試）");
                      }
                    }
                  } else {
                    console.warn("找不到 mesh");
                  }
                }, 1000);
              }
              
              // 測試模式：檢查所有平面的狀態
              setTimeout(() => {
                const testPlane = document.getElementById("video-plane");
                const testRedPlane = document.getElementById("test-plane");
                const marker = document.querySelector("a-marker");
                
                console.log("=== 測試模式：檢查平面狀態 ===");
                
                if (testPlane) {
                  const testMesh = testPlane.getObject3D("mesh");
                  if (testMesh) {
                    console.log("影片平面 - visible:", testMesh.visible, 
                               "position:", testMesh.position,
                               "rotation:", testMesh.rotation,
                               "scale:", testMesh.scale);
                    // 強制設置為可見
                    testMesh.visible = true;
                    testMesh.position.set(0, 0.2, 0);
                    console.log("強制設置影片平面為可見");
                  }
                }
                
                if (testRedPlane) {
                  const redMesh = testRedPlane.getObject3D("mesh");
                  if (redMesh) {
                    console.log("紅色測試平面 - visible:", redMesh.visible,
                               "position:", redMesh.position);
                    redMesh.visible = true;
                    console.log("強制設置紅色測試平面為可見");
                  }
                }
                
                if (marker && marker.object3D) {
                  console.log("標記 - visible:", marker.object3D.visible,
                             "position:", marker.object3D.position);
                }
                
                // 檢查相機位置
                const camera = scene.camera;
                if (camera) {
                  console.log("相機位置:", camera.position);
                }
                
                const testVideo = document.getElementById("greenscreen-video");
                if (testVideo) {
                  testVideo.play().catch(err => console.warn("測試播放失敗:", err));
                }
              }, 2000);
            } else {
              console.error("找不到影片元素");
            }
          }, 500);
        });
        
        // 如果 arjs-video-loaded 事件沒有觸發，使用備用方案
        setTimeout(() => {
          if (!arSystem) {
            console.warn("AR.js 系統可能未完全初始化，使用備用初始化");
            startVideoOnMarker();
            setupCameraMonitoring();
            preventPagePause();
          }
        }, 3000);
      });
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
    if (window.arMarkerCheckInterval) {
      clearInterval(window.arMarkerCheckInterval);
      window.arMarkerCheckInterval = null;
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







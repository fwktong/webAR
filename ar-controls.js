// AR 控制 JavaScript
// ===========================

let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = 0;
let recordingTimer = null;
let videoElement = null;
let markerFound = false;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('AR 頁面載入完成');
    
    // 獲取元素
    const scene = document.querySelector('#arScene');
    const loadingScreen = document.getElementById('loadingScreen');
    const arUI = document.getElementById('arUI');
    const backBtn = document.getElementById('backBtn');
    const captureBtn = document.getElementById('captureBtn');
    const recordBtn = document.getElementById('recordBtn');
    const downloadLink = document.getElementById('downloadLink');
    const markerStatus = document.getElementById('markerStatus');
    const recordingTimerEl = document.getElementById('recordingTimer');
    const timerText = document.getElementById('timerText');
    const hintMessage = document.getElementById('hintMessage');
    
    videoElement = document.getElementById('greenScreenVideo');
    
    // 等待場景載入
    scene.addEventListener('loaded', function() {
        console.log('A-Frame 場景載入完成');
        
        // 延遲隱藏載入畫面
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
            arUI.classList.remove('hidden');
        }, 1500);
    });
    
    // 監聽標記偵測
    const marker = document.querySelector('#hiroMarker');
    
    marker.addEventListener('markerFound', function() {
        console.log('標記已找到！');
        markerFound = true;
        markerStatus.classList.add('found');
        markerStatus.querySelector('.status-text').textContent = '標記已鎖定 ✓';
        hintMessage.style.display = 'none';
        
        // 播放影片
        if (videoElement && videoElement.paused) {
            videoElement.play().catch(err => {
                console.log('影片播放失敗:', err);
            });
        }
    });
    
    marker.addEventListener('markerLost', function() {
        console.log('標記遺失');
        markerFound = false;
        markerStatus.classList.remove('found');
        markerStatus.querySelector('.status-text').textContent = '尋找標記中...';
        hintMessage.style.display = 'block';
    });
    
    // 返回按鈕
    backBtn.addEventListener('click', function() {
        if (isRecording) {
            stopRecording();
        }
        window.location.href = 'index.html';
    });
    
    // 拍照按鈕
    captureBtn.addEventListener('click', function() {
        captureScreenshot();
    });
    
    // 錄影按鈕
    recordBtn.addEventListener('click', function() {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });
});

// 拍照功能
function captureScreenshot() {
    console.log('開始拍照...');
    
    const scene = document.querySelector('a-scene');
    const canvas = scene.components.screenshot.getCanvas('perspective');
    
    if (!canvas) {
        // 備用方案：使用 renderer canvas
        const renderer = scene.renderer;
        const rendererCanvas = renderer.domElement;
        
        // 創建臨時 canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = rendererCanvas.width;
        tempCanvas.height = rendererCanvas.height;
        const ctx = tempCanvas.getContext('2d');
        
        // 繪製當前畫面
        ctx.drawImage(rendererCanvas, 0, 0);
        
        // 下載圖片
        tempCanvas.toBlob(function(blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().getTime();
            link.download = `AR_Photo_${timestamp}.png`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            
            // 視覺回饋
            showFlashEffect();
            console.log('照片已儲存');
        }, 'image/png');
    }
}

// 閃光效果
function showFlashEffect() {
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: white;
        z-index: 9999;
        pointer-events: none;
        animation: flashFade 0.3s ease-out;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes flashFade {
            0% { opacity: 0.8; }
            100% { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(flash);
    
    setTimeout(() => {
        document.body.removeChild(flash);
        document.head.removeChild(style);
    }, 300);
}

// 開始錄影
function startRecording() {
    console.log('開始錄影...');
    
    const scene = document.querySelector('a-scene');
    const canvas = scene.renderer.domElement;
    
    // 獲取 canvas stream
    const stream = canvas.captureStream(30); // 30 FPS
    
    // 設定 MediaRecorder
    const options = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000
    };
    
    // 檢查支援的格式
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm';
        }
    }
    
    try {
        mediaRecorder = new MediaRecorder(stream, options);
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = function(event) {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = function() {
            console.log('錄影停止，處理影片...');
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            // 顯示下載按鈕
            const downloadLink = document.getElementById('downloadLink');
            downloadLink.href = url;
            const timestamp = new Date().getTime();
            downloadLink.download = `AR_Video_${timestamp}.webm`;
            downloadLink.classList.remove('hidden');
            
            // 自動下載
            downloadLink.click();
            
            console.log('影片已準備下載');
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        
        // 更新 UI
        updateRecordingUI(true);
        
        // 開始計時器
        startRecordingTimer();
        
    } catch (error) {
        console.error('錄影啟動失敗:', error);
        alert('錄影功能啟動失敗，請確認瀏覽器支援。');
    }
}

// 停止錄影
function stopRecording() {
    if (mediaRecorder && isRecording) {
        console.log('停止錄影...');
        mediaRecorder.stop();
        isRecording = false;
        
        // 停止計時器
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // 更新 UI
        updateRecordingUI(false);
    }
}

// 更新錄影 UI
function updateRecordingUI(recording) {
    const recordBtn = document.getElementById('recordBtn');
    const recordingTimerEl = document.getElementById('recordingTimer');
    const captureBtn = document.getElementById('captureBtn');
    const backBtn = document.getElementById('backBtn');
    
    if (recording) {
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.record-icon').classList.add('hidden');
        recordBtn.querySelector('.stop-icon').classList.remove('hidden');
        recordBtn.querySelector('.record-text').classList.add('hidden');
        recordBtn.querySelector('.stop-text').classList.remove('hidden');
        recordingTimerEl.classList.remove('hidden');
        
        // 禁用其他按鈕
        captureBtn.style.opacity = '0.5';
        captureBtn.style.pointerEvents = 'none';
        backBtn.style.opacity = '0.5';
        backBtn.style.pointerEvents = 'none';
    } else {
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.record-icon').classList.remove('hidden');
        recordBtn.querySelector('.stop-icon').classList.add('hidden');
        recordBtn.querySelector('.record-text').classList.remove('hidden');
        recordBtn.querySelector('.stop-text').classList.add('hidden');
        recordingTimerEl.classList.add('hidden');
        
        // 啟用其他按鈕
        captureBtn.style.opacity = '1';
        captureBtn.style.pointerEvents = 'auto';
        backBtn.style.opacity = '1';
        backBtn.style.pointerEvents = 'auto';
    }
}

// 錄影計時器
function startRecordingTimer() {
    const timerText = document.getElementById('timerText');
    const maxDuration = 30000; // 30 秒
    
    recordingTimer = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        
        timerText.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        
        // 30 秒後自動停止
        if (elapsed >= maxDuration) {
            stopRecording();
        }
    }, 100);
}

// 處理頁面可見性變化
document.addEventListener('visibilitychange', function() {
    if (document.hidden && isRecording) {
        // 頁面隱藏時停止錄影
        stopRecording();
    }
});

// 處理頁面卸載
window.addEventListener('beforeunload', function() {
    if (isRecording) {
        stopRecording();
    }
});

// iOS Safari 特殊處理
if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    console.log('iOS 裝置偵測');
    
    // 確保影片可以自動播放
    document.addEventListener('touchstart', function() {
        if (videoElement && videoElement.paused && markerFound) {
            videoElement.play().catch(err => {
                console.log('iOS 影片播放需要用戶互動');
            });
        }
    }, { once: true });
}

// Android Chrome 特殊處理
if (/Android/.test(navigator.userAgent)) {
    console.log('Android 裝置偵測');
}

// 錯誤處理
window.addEventListener('error', function(event) {
    console.error('全域錯誤:', event.error);
});

// AR.js 錯誤處理
document.querySelector('a-scene').addEventListener('arjs-error', function(event) {
    console.error('AR.js 錯誤:', event.detail);
    alert('AR 初始化失敗，請確認：\n1. 已允許相機權限\n2. 使用 HTTPS 連線\n3. 瀏覽器支援 WebRTC');
});

console.log('AR 控制腳本載入完成');


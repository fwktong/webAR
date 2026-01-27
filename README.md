# 🌟 AR 擴增實境網站

一個完整的跨平台 Web AR 體驗，支援 iPhone 和 Android 行動裝置，使用 A-Frame 和 AR.js 實現標記追蹤與綠幕影片疊加。

## ✨ 功能特色

- 📱 **跨平台支援**：iOS Safari/Chrome 和 Android Chrome
- 🎯 **標記追蹤**：使用 AR.js Hiro 標記進行穩定追蹤
- 🎥 **綠幕去背**：自訂 shader 實現即時色鍵去背
- 📸 **拍照功能**：捕捉 AR 畫面並下載 PNG 圖片
- 🎬 **錄影功能**：錄製 30 秒 AR 影片並自動下載
- 🎨 **精美 UI**：現代化設計，流暢動畫效果
- ⚡ **輕量高效**：無需安裝 App，直接在瀏覽器運行

## 📁 檔案結構

```
testing/
├── index.html          # 首頁 Landing Page
├── ar.html            # AR 相機頁面
├── marker.html        # Hiro 標記顯示/列印頁面
├── styles.css         # 全域樣式表
├── ar-controls.js     # AR 控制邏輯
└── README.md          # 說明文件（本檔案）
```

## 🚀 快速開始

### 1. 部署網站

**重要：必須使用 HTTPS 才能存取相機！**

#### 選項 A：使用本地 HTTPS 伺服器

```bash
# 使用 Python (推薦)
python -m http.server 8000

# 然後使用 ngrok 建立 HTTPS 通道
ngrok http 8000
```

#### 選項 B：部署到雲端平台

- **GitHub Pages**：推送到 GitHub 並啟用 Pages（自動 HTTPS）
- **Netlify**：拖放資料夾即可部署
- **Vercel**：連接 Git 倉庫自動部署
- **Firebase Hosting**：`firebase deploy`

### 2. 準備 AR 標記

1. 在手機上開啟網站
2. 點擊「進入 AR 體驗」
3. 點擊「查看標記圖片」連結
4. 選擇以下方式之一：
   - **列印**：列印 Hiro 標記到 A4 紙上
   - **顯示**：在另一個裝置（電腦/平板）上顯示標記
   - **下載**：儲存標記圖片供日後使用

### 3. 開始體驗

1. 允許相機權限
2. 將相機對準 Hiro 標記
3. 看到 AR 影片出現在標記上
4. 使用底部按鈕拍照或錄影

## 🎬 更換綠幕影片

### 方法 1：使用線上影片

編輯 `ar.html` 第 30 行：

```html
<video 
    id="greenScreenVideo" 
    src="你的影片網址.mp4"
    preload="auto" 
    loop="true" 
    crossorigin="anonymous"
    playsinline
    webkit-playsinline
    muted>
</video>
```

### 方法 2：使用本地影片

1. 將影片檔案放入專案資料夾（例如：`video.mp4`）
2. 修改 `src` 屬性：

```html
<video 
    id="greenScreenVideo" 
    src="video.mp4"
    ...>
</video>
```

### 綠幕影片要求

- **格式**：MP4（H.264 編碼）
- **背景**：純綠色（RGB: 0, 255, 0 或相近色）
- **解析度**：建議 1280x720 或 1920x1080
- **檔案大小**：建議 < 10MB（行動裝置效能考量）

### 調整色鍵參數

如果去背效果不佳，可調整 `ar.html` 中的 shader 參數（第 68-70 行）：

```html
<a-plane
    material="shader: chromakey; 
              src: #greenScreenVideo; 
              color: 0.1 0.9 0.2;">  <!-- 調整此 RGB 值 -->
</a-plane>
```

或在 `ar.html` 第 90-91 行調整：

```javascript
keyColor: {type: 'v3', value: new THREE.Vector3(0.1, 0.9, 0.2)},  // 綠色
similarity: {type: 'f', value: 0.4},    // 相似度閾值（0.3-0.6）
smoothness: {type: 'f', value: 0.1},    // 邊緣平滑度（0.05-0.2）
```

## 🎨 自訂樣式

### 更改主題顏色

編輯 `styles.css`，搜尋以下顏色值並替換：

- `#00f5ff` - 主要青色
- `#ff00ea` - 主要粉色
- `#7000ff` - 主要紫色

### 調整 AR 影片大小

編輯 `ar.html` 第 64-66 行：

```html
<a-plane
    position="0 0 0"
    rotation="-90 0 0"
    width="1.6"      <!-- 寬度 -->
    height="0.9"     <!-- 高度 -->
    ...>
</a-plane>
```

## 📱 瀏覽器支援

| 平台 | 瀏覽器 | 支援狀態 |
|------|--------|----------|
| iOS 11+ | Safari | ✅ 完整支援 |
| iOS 11+ | Chrome | ✅ 完整支援 |
| Android 8+ | Chrome | ✅ 完整支援 |
| Android 8+ | Firefox | ⚠️ 部分支援 |
| 桌面 | Chrome/Edge | ✅ 測試用 |

## 🔧 疑難排解

### 相機無法啟動

- ✅ 確認使用 HTTPS 連線
- ✅ 檢查瀏覽器相機權限設定
- ✅ 重新整理頁面並重新授權

### 標記無法辨識

- ✅ 確保標記清晰、無反光
- ✅ 增加環境光線
- ✅ 保持相機距離 20-50 公分
- ✅ 確保標記完全在畫面內

### 影片不播放

- ✅ 檢查影片格式（需為 MP4）
- ✅ 確認影片 URL 可存取
- ✅ iOS 需要 `playsinline` 和 `muted` 屬性
- ✅ 點擊螢幕觸發播放（iOS 限制）

### 錄影功能無法使用

- ✅ 確認瀏覽器支援 MediaRecorder API
- ✅ iOS Safari 可能不支援錄影（使用 Chrome）
- ✅ 檢查儲存空間是否充足

### 綠幕去背效果不佳

- ✅ 調整 `similarity` 參數（增加以去除更多綠色）
- ✅ 調整 `smoothness` 參數（增加以平滑邊緣）
- ✅ 確保影片背景為純綠色
- ✅ 檢查影片光線是否均勻

## 🎯 效能優化建議

1. **影片優化**
   - 壓縮影片檔案（使用 HandBrake 或 FFmpeg）
   - 降低解析度至 720p
   - 使用 H.264 編碼

2. **載入優化**
   - 使用 CDN 託管影片
   - 啟用 gzip 壓縮
   - 預載關鍵資源

3. **追蹤優化**
   - 確保標記大小適中（建議 10-15cm）
   - 使用高對比度標記
   - 避免複雜背景

## 📚 技術堆疊

- **A-Frame 1.4.2** - WebVR/AR 框架
- **AR.js 3.4+** - 標記追蹤引擎
- **Three.js** - 3D 渲染（A-Frame 內建）
- **MediaRecorder API** - 影片錄製
- **Canvas API** - 截圖功能
- **WebRTC** - 相機存取

## 🔗 有用資源

- [AR.js 官方文件](https://ar-js-org.github.io/AR.js-Docs/)
- [A-Frame 官方網站](https://aframe.io/)
- [Hiro 標記下載](https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/hiro.png)
- [自訂標記生成器](https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html)

## 📄 授權

本專案採用 MIT 授權條款。

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📧 聯絡

如有問題或建議，請開啟 Issue。

---

**享受你的 AR 體驗！** 🚀✨


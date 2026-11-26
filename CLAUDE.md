# 網頁版打磚塊遊戲 (Breakout)

## 目標
純 HTML + CSS + JavaScript（Canvas 2D）打磚塊遊戲，不使用框架或建置工具，可直接雙擊開啟。

## 檔案結構
- `breakout/index.html` — 頁面骨架、`<canvas>`、分數/生命 HUD
- `breakout/style.css` — 置中版面、深色背景、響應式縮放
- `breakout/game.js` — 遊戲邏輯（單一檔案，分區塊）

## 實作步驟（逐步執行，完成後打勾）
- [x] 1. 骨架：canvas（480×640 邏輯解析度），CSS 縮放適應視窗
- [x] 2. 遊戲迴圈：`requestAnimationFrame` + delta time
- [x] 3. 擋板：鍵盤 ←/→（或 A/D）、滑鼠、觸控；限制在邊界內
- [x] 4. 球：發球前黏在擋板上，空白鍵/點擊發射；撞牆反彈；掉出底部扣一命
- [x] 5. 磚塊：二維陣列（8 列 × 10 欄），不同列不同顏色/分數
- [x] 6. 碰撞：牆、擋板（依擊中位置決定反射角）、磚塊（依穿透量判斷反彈軸）
- [x] 7. 遊戲狀態：ready → playing → paused → gameover/win；P 鍵暫停；3 條命；通關進下一關（球速略增）
- [x] 8. HUD 與回饋：分數、生命、關卡；最高分存 `localStorage`；簡單粒子/閃爍
- [x] 9. 音效（可選）：Web Audio API 產生嗶聲，不使用外部檔案
- [x] 10. 加分項：道具（加長擋板、多球、減速）、行動裝置優化

## 設計重點
- 球速設上限與最小垂直速度，避免球卡在水平來回
- 碰撞後將球推出重疊區，避免黏在磚塊/擋板內
- 邏輯與繪製分離（`update(dt)` / `draw()`）

## 驗證方式
- 瀏覽器直接開啟 `breakout/index.html`（或 `npx serve breakout`）
- 手動測試：三種輸入、牆/擋板/磚塊反彈、掉球扣命、通關、Game Over、暫停、最高分保存、視窗縮放
- Console 無錯誤

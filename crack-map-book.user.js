// ==UserScript==
// @name         크랙 지도 도감
// @namespace    crack-commandline
// @icon         https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/images/crack-commandline.svg
// @version      1.0.1.0
// @description  !지도로 지역과 이동 시간을 확인하고 커스텀 지도를 관리합니다. (version 관리방식: 데이터구조버전.크랙UI변경.기능추가및수정.버그수정)
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @noframes
// @require      https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-core.js
// @resource     ccCommon https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-common.css
// @resource     map01 https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/data/map01.json
// @resource     map01Background https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/images/map/map01.svg
// @grant        unsafeWindow
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @connect      identitytoolkit.googleapis.com
// @connect      securetoken.googleapis.com
// @connect      firebaseio.com
// @connect      firebasedatabase.app
// ==/UserScript==

/*
 * DB 데이터 스키마 — 저장소 선택·인증·통신은 core의 저장 핸들을 사용한다.
 * crack-map-book/
 * ├─ updatedAt: 밀리초 Unix timestamp
 * └─ custom_map/
 *    └─ {지도 이름}: { data: "지도 JSON 전체 문자열", background_images: "이미지 Data URL 또는 빈 문자열" }
 * 커스텀 지도는 최대 3개. 지도 본문 변경 후 updatedAt을 별도로 저장한다.
 * 열람용 영구 사본은 별도 IndexedDB에 보관하며 DB에는 중복 저장하지 않는다.
 *
 * 커스텀 지도 JSON 구조 — 아래 예시를 복사해 .json 파일로 저장한다.
 * {
 *   "name": "지도 이름",
 *   "width": 80,
 *   "height": 60,
 *   "distanceScale": 2,
 *   "backgroundImage": "",
 *   "regions": [
 *     { "id": 1, "name": "시작 마을", "type": "village", "scale": 1,
 *       "x": 10, "y": 20, "description": "여행자가 머무는 작은 마을.", "neighbors": [2] },
 *     { "id": 2, "name": "푸른 숲", "type": "forest", "scale": 4,
 *       "x": 20, "y": 20, "description": "약초와 오래된 나무가 많은 숲.", "neighbors": [1] }
 *   ]
 * }
 * name: 지도 이름. 추가창에서 다른 이름을 지정할 수 있다.
 * width/height: 양의 정수. 좌표는 정수이며 0 <= x < width, 0 <= y < height.
 * distanceScale: 0보다 큰 거리 환산 배율. 생략하면 1. 화면 확대 배율과 별개다.
 * 이동 시간: sqrt(dx² + dy²) / distanceScale 일. 1일=24시간, 가장 가까운 시간으로 반올림.
 * backgroundImage: 기본 지도만 images/map/의 파일 이름을 사용한다. 커스텀에서는 무시하며 이미지를 따로 선택한다.
 * regions: 지역 배열. id는 고유한 문자열 또는 숫자이며 1과 "1"은 같은 ID로 취급한다.
 * type 허용값(대소문자 구분):
 *   거점: kingdom 국가, capital 왕도, city 도시, town 소도시, village 마을,
 *         port 항구, fortress 요새, temple 성소
 *   자연: forest 숲, mountain 산, mountainRange 산맥, plains 평원, desert 사막, marsh 늪
 *   수역: coast 해안, sea 바다, river 강, lake 호수, island 섬
 *   미지·위험: ruins 유적, dungeon 던전, tower 마탑, rift 균열, volcano 화산
 * 알 수 없는 type은 ? 아이콘으로 표시한다.
 * scale: 1~5 정수. 클수록 아이콘과 글자가 크며, 5를 넘으면 5로 표시한다.
 * description: 한줄설명 문자열. 생략하면 빈 설명.
 * neighbors: 같은 지도에 존재하는 다른 지역 ID 배열. 생략하면 연결 없음.
 * 연결은 양방향이며 한쪽에만 적어도 된다. 중복 연결은 한 번만 그린다.
 */
(() => {
  'use strict';

  const book = unsafeWindow.CrackCommandline.register({
    id: 'crack-map-book', label: '지도', useDatabse: true, lambda: openBook,
  });
  const BUNDLED_MAPS = [{ data: 'map01', background: 'map01Background' }];
  const MAP_CSS = `
.cc-ui.ui-window.cc-map-window {
  --inset: 9px; position: fixed; z-index: 2147483600; left: max(12px, calc(50vw - 530px)); top: 74px;
  display: flex; flex-direction: column; padding: 4px; width: min(1060px, calc(100vw - 24px));
  height: min(700px, calc(100dvh - 98px)); min-width: 328px; min-height: 220px; max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); border-radius: 4px;
}
.cc-ui.cc-map-window[hidden], .cc-ui.cc-map-window [hidden] { display: none !important; }

.cc-ui.cc-map-window::before { inset: 5px; z-index: 20; opacity: .5; }
.cc-ui.cc-map-window .map-header { display: flex; align-items: center; justify-content: space-between; flex: 0 0 29px; padding: 0 3px 0 10px; background: linear-gradient(100deg, #aa946622, #10182022 60%, #aa946612); border-bottom: 1px solid #9e875b66; box-shadow: inset 0 1px #f6e0b30d, 0 1px #060a0e9c; }
.cc-ui.cc-map-window .map-header h1 { display: flex; align-items: center; gap: 7px; font: 700 13px/1.2 var(--heading-face); letter-spacing: .08em; }
.cc-ui.cc-map-window .map-header h1 svg { width: 15px; height: 15px; color: #c4ad80; }
.cc-ui.cc-map-window .map-header .icon-button { width: 28px; height: 25px; border-color: transparent; background: none; box-shadow: none; }
.cc-ui.cc-map-window .map-header .icon-button svg { width: 14px; height: 14px; }
.cc-ui.cc-map-window .map-body { display: flex; flex: 1; min-height: 0; position: relative; overflow: hidden; background: #152329; }
.cc-ui.cc-map-window .map-sidebar { flex: 0 0 49px; width: 49px; display: flex; flex-direction: column; z-index: 5; background: linear-gradient(90deg, #263039, #1d272d); border-right: 1px solid #8c7e5c80; box-shadow: 3px 0 12px #0004, inset -2px 0 #0e161b; overflow: hidden; }
.cc-ui.cc-map-window .map-sidebar.is-expanded { flex-basis: 174px; width: 174px; }
.cc-ui.cc-map-window .sidebar-top { padding: 5px 5px 6px; border-bottom: 1px solid #a08d654d; box-shadow: 0 1px #0006; }
.cc-ui.cc-map-window .sidebar-expand { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; height: 30px; color: #b8b8a6; }
.cc-ui.cc-map-window .sidebar-expand svg { width: 18px; height: 18px; }
.cc-ui.cc-map-window .sidebar-expand span { display: none; font-size: 10px; letter-spacing: .08em; white-space: nowrap; }
.cc-ui.cc-map-window .is-expanded .sidebar-expand { justify-content: flex-start; padding: 0 8px; }
.cc-ui.cc-map-window .is-expanded .sidebar-expand span { display: block; }
.cc-ui.cc-map-window .is-expanded .sidebar-expand svg { transform: rotate(180deg); }
.cc-ui.cc-map-window .map-picker { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; height: 32px; padding: 5px; border: 1px solid #99856180; border-radius: 2px; background: linear-gradient(#364047, #222c32); box-shadow: inset 0 1px #dfd2ab16, 0 1px 2px #0007; }
.cc-ui.cc-map-window .map-picker > svg:first-child { width: 19px; height: 19px; color: #d5bd8c; }
.cc-ui.cc-map-window .map-picker > span { display: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.cc-ui.cc-map-window .map-picker .picker-chevron { width: 9px; height: 12px; color: #b3a484; }
.cc-ui.cc-map-window .map-picker:hover, .cc-ui.cc-map-window .map-picker[aria-expanded=true] { border-color: #ccb17d; }
.cc-ui.cc-map-window .is-expanded .map-picker { justify-content: flex-start; padding: 5px 8px; }
.cc-ui.cc-map-window .is-expanded .map-picker > span { display: block; flex: 1; }
.cc-ui.cc-map-window .map-legend { overflow-y: auto; overflow-x: hidden; flex: 1; scrollbar-width: thin; scrollbar-color: #68705e #182126; overscroll-behavior: contain; padding: 3px 0 8px; }
.cc-ui.cc-map-window .legend-section + .legend-section { border-top: 1px solid #a5ab911f; margin-top: 4px; padding-top: 3px; }
.cc-ui.cc-map-window .legend-section h2 { height: 0; overflow: hidden; font-size: 9px; line-height: 1.4; color: #929b8f; letter-spacing: .15em; }
.cc-ui.cc-map-window .is-expanded .legend-section h2 { height: auto; padding: 6px 12px 2px; font-size: 9px; font-weight: 400; }
.cc-ui.cc-map-window .legend-item { display: flex; align-items: center; gap: 11px; height: 29px; padding: 3px 12px; color: var(--type-color); }
.cc-ui.cc-map-window .legend-item svg { width: 23px; height: 23px; stroke-width: 1.35; }
.cc-ui.cc-map-window .legend-item span { display: none; font-size: 11px; white-space: nowrap; color: #c4c7bb; }
.cc-ui.cc-map-window .is-expanded .legend-item span { display: inline; }
.cc-ui.cc-map-window .legend-item:hover { background: #e3d6b20a; }
.cc-ui.cc-map-window .map-menu { top: 70px; left: 52px; width: 235px; padding: 5px; z-index: 12; }
.cc-ui.cc-map-window .map-sidebar.is-expanded + .map-menu { left: 7px; top: 72px; width: 225px; }
.cc-ui.cc-map-window .menu-caption { padding: 5px 8px 7px; color: #adab98; font-size: 10px; border-bottom: 1px solid #a08d6538; }
.cc-ui.cc-map-window .map-option { display: flex; align-items: center; gap: 9px; min-height: 43px; width: 100%; padding: 7px 8px; text-align: left; border: 1px solid transparent; border-radius: 2px; }
.cc-ui.cc-map-window .map-option:hover { background: #ddc3940c; }
.cc-ui.cc-map-window .map-option.is-active { border-color: #b19b6666; background: #b19b6617; color: #e4c893; }
.cc-ui.cc-map-window .option-mark { font-size: 20px; color: #c4ad7d; }
.cc-ui.cc-map-window .map-option > span:nth-child(2) { min-width: 0; flex: 1; font-size: 12px; }
.cc-ui.cc-map-window .map-option small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: #98a199; }
.cc-ui.cc-map-window .option-check { opacity: 0; font-size: 12px; }
.cc-ui.cc-map-window .is-active .option-check { opacity: 1; }
.cc-ui.cc-map-window .custom-list-heading { display: flex; justify-content: space-between; padding: 9px 8px 5px; margin-top: 4px; border-top: 1px solid #a08d6538; color: #adab98; font-size: 10px; }
.cc-ui.cc-map-window .custom-option-row { display: flex; align-items: center; gap: 1px; }
.cc-ui.cc-map-window .custom-option-row > .map-option { flex: 1; min-width: 0; }
.cc-ui.cc-map-window .custom-option-row .icon-button { width: 25px; height: 27px; padding: 5px; }
.cc-ui.cc-map-window .custom-option-row .icon-button svg { width: 14px; height: 14px; }
.cc-ui.cc-map-window .custom-option-row .delete-map { color: #ca9c87; }
.cc-ui.cc-map-window .custom-add { width: 100%; display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 5px; min-height: 33px; color: #d2be95; border: 1px dashed #a58d615c; background: #d7c18a07; font-size: 11px; }
.cc-ui.cc-map-window .custom-add:hover { border-color: #bfa271; background: #d7c18a12; }
.cc-ui.cc-map-window .custom-add svg { width: 14px; height: 14px; }
.cc-ui.cc-map-window .custom-option-row .map-option > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-ui.cc-map-window .map-viewport { flex: 1; min-width: 0; position: relative; overflow: hidden; background: radial-gradient(ellipse at 45% 35%, #293c3b, #14242a 80%); }
.cc-ui.cc-map-window .map-viewport::after { content: ""; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 50px #07121570; border: 1px solid #d6c29715; z-index: 1; }
.cc-ui.cc-map-window svg.map-canvas { display: block; width: 100%; height: 100%; fill: none; stroke: none; touch-action: none; cursor: grab; user-select: none; }
.cc-ui.cc-map-window .map-canvas.is-dragging { cursor: grabbing; }
.cc-ui.cc-map-window .map-canvas .terrain-line { fill: none; stroke: #bac09a; stroke-width: .75; opacity: .16; }
.cc-ui.cc-map-window .map-canvas .map-road { fill: none; stroke: #d6c4a0; stroke-width: 1.25; opacity: .67; vector-effect: non-scaling-stroke; }
.cc-ui.cc-map-window .map-canvas .road-shadow { stroke: #0b1a1e; stroke-width: 3.5; opacity: .52; }
.cc-ui.cc-map-window .map-canvas.has-selection .map-road { opacity: .48; }
.cc-ui.cc-map-window .map-canvas.has-selection .road-shadow { opacity: .5; }
.cc-ui.cc-map-window .map-canvas .map-road.is-highlighted { stroke: #ffe0a1; stroke-width: 2.1; opacity: 1; }
.cc-ui.cc-map-window .map-canvas .map-region { cursor: pointer; outline: none; }
.cc-ui.cc-map-window .map-canvas .region-hit { fill: transparent; stroke: none; }
.cc-ui.cc-map-window .map-canvas .region-disc { fill: #1d2d29; stroke: currentColor; stroke-width: .8; }
.cc-ui.cc-map-window .map-canvas .region-symbol { fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linejoin: round; stroke-linecap: round; }
.cc-ui.cc-map-window .map-canvas .region-label { fill: #d7d7be; stroke: #152624; stroke-width: 3px; stroke-linejoin: round; paint-order: stroke; text-anchor: middle; font: 11px "Malgun Gothic", sans-serif; letter-spacing: .1px; pointer-events: none; }
.cc-ui.cc-map-window .map-canvas .region-label.region-scale-1 { font-size: 11px; }
.cc-ui.cc-map-window .map-canvas .region-label.region-scale-2 { font-size: 12px; }
.cc-ui.cc-map-window .map-canvas .region-label.region-scale-3 { font-size: 13px; }
.cc-ui.cc-map-window .map-canvas .region-label.region-scale-4 { font-size: 15px; }
.cc-ui.cc-map-window .map-canvas .region-label.region-scale-5 { font-size: 17px; letter-spacing: .7px; fill: #e4dbb8; }
.cc-ui.cc-map-window .map-canvas .map-region.is-neighbor .region-disc { fill: #3b3e2d; stroke: #e5ce9d; }
.cc-ui.cc-map-window .map-canvas .map-region.is-selected .region-disc, .cc-ui.cc-map-window .map-canvas .map-region:focus-visible .region-disc { fill: #514933; stroke: #ffe8b2; }
.cc-ui.cc-map-window .map-canvas .map-region.is-neighbor .region-symbol { stroke: #e5ce9d; }
.cc-ui.cc-map-window .map-canvas .map-region.is-selected .region-symbol, .cc-ui.cc-map-window .map-canvas .map-region:focus-visible .region-symbol { stroke: #ffe8b2; stroke-width: 1.8; }
.cc-ui.cc-map-window .map-canvas .region-label.is-selected { fill: #ffe8b2; }
.cc-ui.cc-map-window .map-canvas .distance-plate { fill: #142224; stroke: #c6ac7480; stroke-width: .7; }
.cc-ui.cc-map-window .map-canvas .distance-text { fill: #f4d8a3; stroke: none; font: 10px Consolas, monospace; text-anchor: middle; dominant-baseline: central; }
.cc-ui.cc-map-window .compass { position: absolute; left: 15px; top: 10px; display: flex; align-items: center; flex-direction: column; color: #c9b98b; pointer-events: none; }
.cc-ui.cc-map-window .compass span { font: 9px Georgia, serif; opacity: .7; }
.cc-ui.cc-map-window .compass svg { width: 39px; height: 39px; stroke-width: .65; opacity: .55; }
.cc-ui.cc-map-window .compass .needle { fill: #c9b98b; }
.cc-ui.cc-map-window .map-caption { position: absolute; left: 19px; bottom: 16px; pointer-events: none; display: flex; flex-direction: column; text-shadow: 0 2px 3px #061111; }
.cc-ui.cc-map-window .caption-rule { width: 35px; height: 1px; background: #ccb480; margin-bottom: 7px; opacity: .65; }
.cc-ui.cc-map-window .map-caption strong { font: 700 17px/1.4 var(--heading-face); color: #d6c59e; letter-spacing: .16em; }
.cc-ui.cc-map-window .map-caption > span:last-child { margin-top: 3px; color: #9bada4; font-size: 9px; letter-spacing: .09em; }
.cc-ui.cc-map-window .zoom-controls { position: absolute; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 3px; z-index: 3; align-items: center; }
.cc-ui.cc-map-window .zoom-controls .icon-button { width: 31px; height: 31px; background: linear-gradient(#35413fcc, #1c2c2edb); border-color: #a7936970; }
.cc-ui.cc-map-window .zoom-controls svg { width: 16px; height: 16px; stroke-width: 1.5; }
.cc-ui.cc-map-window .zoom-controls output { margin-top: 4px; color: #bbc0a9; font: 9px Consolas, monospace; text-shadow: 0 1px 2px #000; }
.cc-ui.cc-map-window .map-detail { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); display: flex; gap: 11px; width: min(375px, calc(100% - 132px)); padding: 12px 30px 12px 12px; z-index: 4; background: linear-gradient(120deg, #303d3bef, #1c2a2ded); border-color: #b69a63a6; }
.cc-ui.cc-map-window .detail-icon { display: grid; place-items: center; align-self: center; flex: 0 0 34px; height: 37px; color: #d7bd8b; background: linear-gradient(#8e795324, #8e795309); border: 1px solid #b69a634d; }
.cc-ui.cc-map-window .detail-icon svg { width: 25px; height: 25px; stroke-width: 1.3; }
.cc-ui.cc-map-window .detail-copy { min-width: 0; }
.cc-ui.cc-map-window #cc-map-detail-type { font-size: 9px; letter-spacing: .1em; color: #c5b58e; }
.cc-ui.cc-map-window #cc-map-detail-name { font: 700 15px/1.45 var(--heading-face); color: #f0dfb6; margin: 1px 0 4px; overflow-wrap: anywhere; }
.cc-ui.cc-map-window #cc-map-detail-description { margin: 0; font-size: 11px; line-height: 1.65; color: #c0c6b9; overflow-wrap: anywhere; }
.cc-ui.cc-map-window .map-detail > .icon-button { position: absolute; right: 3px; top: 3px; width: 23px; height: 23px; border: none; }
.cc-ui.cc-map-window .map-detail > .icon-button svg { width: 12px; height: 12px; }
.cc-ui.cc-map-window .custom-panel { top: 75px; left: 56px; width: min(320px, calc(100% - 68px)); padding: 12px; z-index: 15; }
.cc-ui.cc-map-window .custom-panel header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; margin-bottom: 9px; border-bottom: 1px solid #b69a6338; }
.cc-ui.cc-map-window .custom-panel h2 { font: 700 14px var(--heading-face); color: var(--accent); }
.cc-ui.cc-map-window .custom-panel header .icon-button { width: 24px; height: 24px; }
.cc-ui.cc-map-window .file-field { display: block; margin: 11px 0; }
.cc-ui.cc-map-window .file-field > span { display: flex; justify-content: space-between; font-size: 11px; color: #d8d7c8; margin-bottom: 5px; }
.cc-ui.cc-map-window .file-field small { color: #899a92; font-size: 9px; }
.cc-ui.cc-map-window .file-field input { width: 100%; color: #aeb9ae; font-size: 10px; }
.cc-ui.cc-map-window .file-field input::file-selector-button { margin-right: 8px; padding: 6px 9px; border: 1px solid #847b62; border-radius: 2px; color: #d8cfb7; background: #303c3d; font: inherit; cursor: pointer; }
.cc-ui.cc-map-window .custom-note { font-size: 10px; color: #96a49b; line-height: 1.6; }
.cc-ui.cc-map-window .custom-error { font-size: 11px; color: #f1aaa0; }
.cc-ui.cc-map-window .custom-panel > .button { width: 100%; min-height: 31px; }
.cc-ui.cc-map-window .custom-current-file { margin: -4px 0 8px; font-size: 10px; color: #b8ad91; overflow-wrap: anywhere; }
.cc-ui.cc-map-window .delete-panel { z-index: 16; left: 56px; top: 75px; width: min(300px, calc(100% - 68px)); padding: 14px; }
.cc-ui.cc-map-window .delete-panel h2 { font: 700 14px var(--heading-face); color: var(--accent); }
.cc-ui.cc-map-window .delete-panel p { font-size: 12px; overflow-wrap: anywhere; margin: 14px 0; color: #c6c9bb; }
.cc-ui.cc-map-window .delete-panel strong { color: #ece0be; font-weight: 500; }
.cc-ui.cc-map-window .delete-panel > div { display: flex; justify-content: flex-end; gap: 6px; }
@media (max-width: 640px) {
  .cc-ui.cc-map-window .map-sidebar { flex-basis: 44px; width: 44px; }
  .cc-ui.cc-map-window .map-sidebar.is-expanded { position: absolute; top: 0; bottom: 0; left: 0; width: 164px; box-shadow: 5px 0 20px #0008; }
  .cc-ui.cc-map-window .map-sidebar.is-expanded ~ .map-viewport { margin-left: 44px; }
  .cc-ui.cc-map-window .sidebar-top { padding: 4px; }
  .cc-ui.cc-map-window .legend-item { height: 33px; padding-left: 10px; }
  .cc-ui.cc-map-window .legend-item svg { width: 22px; height: 22px; }
  .cc-ui.cc-map-window .map-menu { left: 46px; top: 70px; width: min(235px, calc(100% - 52px)); }
  .cc-ui.cc-map-window .map-sidebar.is-expanded + .map-menu { left: 5px; width: min(235px, calc(100% - 10px)); }
  .cc-ui.cc-map-window .map-detail { top: 9px; left: 8px; transform: none; width: calc(100% - 54px); padding: 9px 24px 10px 9px; gap: 8px; }
  .cc-ui.cc-map-window .detail-icon { flex-basis: 26px; height: 31px; }
  .cc-ui.cc-map-window .detail-icon svg { width: 21px; height: 21px; }
  .cc-ui.cc-map-window #cc-map-detail-name { font-size: 13px; }
  .cc-ui.cc-map-window #cc-map-detail-description { font-size: 10px; }
  .cc-ui.cc-map-window .zoom-controls { top: 9px; right: 7px; }
  .cc-ui.cc-map-window .zoom-controls .icon-button { width: 32px; height: 34px; }
  .cc-ui.cc-map-window .compass { left: 8px; top: 10px; }
  .cc-ui.cc-map-window .compass svg { width: 30px; height: 30px; }
  .cc-ui.cc-map-window .map-caption { left: 11px; bottom: 12px; }
  .cc-ui.cc-map-window .map-caption strong { font-size: 14px; }
  .cc-ui.cc-map-window .custom-panel { left: 46px; width: calc(100% - 54px); top: 73px; }
  .cc-ui.cc-map-window .delete-panel { left: 46px; width: calc(100% - 54px); }
}
@media (max-height: 500px) and (min-width: 641px) {
}
.cc-ui.cc-map-window .map-notice { position: absolute; z-index: 18; bottom: 12px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 30px); width: max-content; padding: 8px 12px; font-size: 11px; white-space: pre-line; overflow-wrap: anywhere; pointer-events: none; }
.cc-ui.cc-map-window .map-notice.is-error { color: #f1aaa0; border-color: #b18a73; }
.cc-ui.cc-map-window .map-menu { max-height: calc(100% - 82px); overflow-y: auto; scrollbar-width: thin; }
.cc-ui.cc-map-window .map-detail { max-height: calc(100% - 26px); overflow-y: auto; }
`;
  const MAP_TEMPLATE = `<section id="cc-map-map-window" data-cc-book-window="crack-map-book" class="cc-ui ui-window cc-map-window" role="dialog" aria-modal="false" aria-labelledby="cc-map-map-title">
      <header class="map-header" data-cc-drag-handle>
        <h1 id="cc-map-map-title"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16"/></svg>지도</h1>
        <button id="cc-map-close-map" class="icon-button" aria-label="지도 닫기" title="닫기"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="map-body">
        <aside class="map-sidebar" id="cc-map-sidebar" aria-label="지도 선택과 지역 범례">
          <div class="sidebar-top">
            <button id="cc-map-expand-sidebar" class="sidebar-expand" aria-expanded="false" aria-controls="cc-map-legend" aria-label="범례 펼치기" title="범례 펼치기"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zm5 0v16m4-12 4 4-4 4"/></svg><span>지도 · 범례</span></button>
            <button id="cc-map-map-picker" class="map-picker" aria-expanded="false" aria-controls="cc-map-map-menu" title="지도 선택"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/></svg><span id="cc-map-map-choice">지도</span><svg class="picker-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
          </div>
          <div id="cc-map-legend" class="map-legend"></div>
        </aside>
        <div id="cc-map-map-menu" class="popover map-menu" hidden>
          <div class="menu-caption">지도 선택</div>
          <div id="cc-map-builtin-list"></div>
          <div class="custom-list-heading"><span>커스텀</span><span id="cc-map-custom-count">0 / 3</span></div>
          <div id="cc-map-custom-list"></div>
          <button id="cc-map-open-custom" class="custom-add"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>커스텀 추가</span></button>
        </div>
        <div class="map-viewport" id="cc-map-map-viewport">
          <svg id="cc-map-map-canvas" class="map-canvas" viewBox="0 0 960 720" aria-label="지도 지도">
            <defs id="cc-map-map-defs">
              <pattern id="cc-map-sea-grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0v48" fill="none" stroke="#9eb5ad" stroke-opacity=".055" stroke-width=".6"/><path d="M23 24h2m-1-1v2" stroke="#9eb5ad" stroke-opacity=".14" stroke-width=".6"/></pattern>
              <pattern id="cc-map-map-grain" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M1 1h.7M4 5h.5" stroke="#dfd6ad" stroke-opacity=".08" stroke-width=".6"/></pattern>
              <linearGradient id="cc-map-land-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#35483e"/><stop offset=".48" stop-color="#303e36"/><stop offset="1" stop-color="#4c4935"/></linearGradient>
              <linearGradient id="cc-map-desert-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#756343" stop-opacity=".07"/><stop offset="1" stop-color="#9d7c49" stop-opacity=".38"/></linearGradient>
            </defs>
            <g id="cc-map-map-camera"><g id="cc-map-map-terrain"></g><image id="cc-map-custom-background" x="0" y="0" width="960" height="720" preserveAspectRatio="none" hidden/><g id="cc-map-map-routes"></g><g id="cc-map-map-regions"></g><g id="cc-map-map-labels" pointer-events="none"></g><g id="cc-map-map-distances" pointer-events="none"></g></g>
          </svg>
          <div class="compass" aria-hidden="true"><span>N</span><svg viewBox="0 0 44 44"><path d="m22 3 5 14 14 5-14 5-5 14-5-14-14-5 14-5z"/><path d="m22 3 0 19 19 0M22 22 3 22m19 0v19"/><path class="needle" d="m22 3 5 14-5 5z"/></svg></div>
          <div class="map-caption"><span class="caption-rule"></span><strong id="cc-map-map-name">지도</strong><span id="cc-map-map-meta"></span></div>
          <div class="zoom-controls" aria-label="지도 배율">
            <button class="icon-button framed" id="cc-map-zoom-in" aria-label="확대" title="확대"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
            <button class="icon-button framed" id="cc-map-zoom-fit" aria-label="전체 지도 보기" title="전체 지도"><svg viewBox="0 0 24 24"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg></button>
            <button class="icon-button framed" id="cc-map-zoom-out" aria-label="축소" title="축소"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
            <output id="cc-map-zoom-value">100%</output>
          </div>
          <article class="popover map-detail" id="cc-map-map-detail" aria-live="polite" hidden>
            <div id="cc-map-detail-icon" class="detail-icon"></div><div class="detail-copy"><span id="cc-map-detail-type"></span><h2 id="cc-map-detail-name"></h2><p id="cc-map-detail-description"></p></div>
            <button id="cc-map-close-detail" class="icon-button" aria-label="지역 상세 닫기" title="닫기"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
          </article>
        </div>
        <section class="popover custom-panel" id="cc-map-custom-panel" aria-labelledby="cc-map-custom-title" hidden>
          <header><h2 id="cc-map-custom-title">커스텀 추가</h2><button class="icon-button" id="cc-map-close-custom" aria-label="커스텀 설정 닫기"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
          <label class="file-field"><span>이름</span><input id="cc-map-custom-map-name" class="text-input" type="text" maxlength="50" placeholder="비워두면 지도 이름 사용"></label>
          <label class="file-field"><span>지도 데이터 <small>JSON</small></span><input id="cc-map-custom-json" type="file" accept=".json,application/json"></label>
          <label class="file-field"><span>배경 이미지 <small>선택 사항</small></span><input id="cc-map-custom-image" type="file" accept="image/*"></label>
          <p id="cc-map-custom-current-file" class="custom-current-file" hidden></p>
          
          <p id="cc-map-custom-error" class="custom-error" role="alert" hidden></p>
          <button class="button primary" id="cc-map-apply-custom">추가</button>
        </section>
        <section class="popover delete-panel" id="cc-map-delete-panel" aria-labelledby="cc-map-delete-title" hidden>
          <h2 id="cc-map-delete-title">지도 삭제</h2><p><strong id="cc-map-delete-map-name"></strong> 지도를 삭제할까요?</p>
          <div><button class="button" id="cc-map-cancel-delete">취소</button><button class="button danger" id="cc-map-confirm-delete">삭제</button></div>
        </section>
      </div>
    </section>`;

  const NS = 'http://www.w3.org/2000/svg';
  const types = {
    kingdom: ['국가', '거점', '#ddc28a', '<path d="m3 8 4 3 5-7 5 7 4-3-2 11H5zM6 16h12"/>'],
    capital: ['왕도', '거점', '#ddc28a', '<path d="M4 20V9h4v3h3V5h3v7h3V9h3v11zM10 20v-5h4v5M9 5l3-3 3 3"/>'],
    city: ['도시', '거점', '#ddc28a', '<path d="M3 20h18M5 20V9h6v11m2 0V4h6v16M7 12h2m-2 3h2m6-8h2m-2 3h2m-2 3h2"/>'],
    town: ['소도시', '거점', '#ddc28a', '<path d="m3 12 5-5 5 5m-8-2v10h6V10m2 10V7l4-4 4 4v13zm3-9h2m-2 4h2"/>'],
    village: ['마을', '거점', '#ddc28a', '<path d="m3 11 9-7 9 7M6 10v10h12V10M10 20v-6h4v6M16 5V3"/>'],
    port: ['항구', '거점', '#ddc28a', '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7 10h10M4 14v3c0 4 16 4 16 0v-3M2 16l2-2 2 2m12 0 2-2 2 2"/>'],
    fortress: ['요새', '거점', '#ddc28a', '<path d="M4 20V5h4v3h3V5h3v3h3V5h3v15zM10 20v-5a2 2 0 0 1 4 0v5"/>'],
    temple: ['성소', '거점', '#ddc28a', '<path d="m3 9 9-6 9 6H3zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18M12 2v3"/>'],
    forest: ['숲', '자연', '#a4c391', '<path d="m8 3-5 8h3l-4 6h12l-4-6h3zm0 14v5m8-16-4 7h3l-2 4h8l-3-4h3zm0 11v5"/>'],
    mountain: ['산', '자연', '#a4c391', '<path d="m2 20 10-17 10 17zm6-10 4 3 4-3M6 20l4-5m8 5-3-4"/>'],
    mountainRange: ['산맥', '자연', '#a4c391', '<path d="m1 20 7-13 4 7 5-11 6 17H1zm9-3 2-3m-7-2 3 2 2-2m5-4 2 2 2-2"/>'],
    plains: ['평원', '자연', '#a4c391', '<path d="M2 17c5-8 10-8 20 0M2 21h20M12 15V7m0 4L8 8m4 1 4-3M5 20v-4m13 4v-4"/>'],
    desert: ['사막', '자연', '#a4c391', '<circle cx="17" cy="6" r="3"/><path d="M2 16c5-7 9-7 14-1m-8 5c5-8 10-8 14-4M2 21h20"/>'],
    marsh: ['늪', '자연', '#a4c391', '<path d="M2 18c4-3 7 3 11 0s6 2 9 0M3 22c4-3 7 3 11 0M8 16V4m0 5L4 6m4 6 4-4m5 8V8m0 4 3-3"/>'],
    coast: ['해안', '수역', '#89b8c3', '<path d="M5 2c7 5-4 9 3 14s-2 6-2 6M13 5c3-3 5 3 8 0m-7 7c3-3 5 3 8 0m-8 7c3-3 5 3 8 0"/>'],
    sea: ['바다', '수역', '#89b8c3', '<path d="M2 7c4-4 6 4 10 0s6 4 10 0M2 12c4-4 6 4 10 0s6 4 10 0M2 17c4-4 6 4 10 0s6 4 10 0"/>'],
    river: ['강', '수역', '#89b8c3', '<path d="M8 2c14 5-11 9 0 14s4 6 4 6M14 2c14 5-11 9 0 14s4 6 4 6"/>'],
    lake: ['호수', '수역', '#89b8c3', '<path d="M4 10c-4 5-2 11 6 10 6 3 14-1 11-7 2-5-8-4-10-7-4-3-6 0-7 4zM6 13c4-3 7 3 11 0m-9 4h6"/>'],
    island: ['섬', '수역', '#89b8c3', '<path d="M2 20c4-3 7 3 11 0s6 2 9 0M5 16l7-9 7 9H5zm7-9V3m0 0 5 2-5 1"/>'],
    ruins: ['유적', '미지 · 위험', '#c79685', '<path d="M3 21h18M5 21V6h4v4H7v11m8 0V9l3-2 2 2v12M4 4h6m4 1 4-3 4 3M11 21l2-5-3-3 3-4"/>'],
    dungeon: ['던전', '미지 · 위험', '#c79685', '<path d="m2 20 4-12 6-5 6 5 4 12H2zm7 0v-6a3 3 0 0 1 6 0v6M6 10l3-3m9 6-2-4"/>'],
    tower: ['마탑', '미지 · 위험', '#c79685', '<path d="m7 7 5-5 5 5H7zm2 0-2 14h10L15 7M6 21h12m-6-9v2m-1 7v-3h2v3"/>'],
    rift: ['균열', '미지 · 위험', '#c79685', '<path d="m14 2-7 8h5l-3 5h5l-3 7 8-11h-5l4-6h-5zM4 5l2 2m13 12 2 2M2 15h3m15-9h2"/>'],
    volcano: ['화산', '미지 · 위험', '#c79685', '<path d="m2 21 7-13h6l7 13H2zm7-13 3 4 3-4M11 5 9 2m5 3 2-3m-4 15v3"/>'],
    unknown: ['알 수 없음', '', '#b2b5a5', '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3h.01"/>'],
  };

  let ui;
  const $ = id => id === 'map-window' ? ui : ui.querySelector('#cc-map-' + id);
  let builtinMaps;
  let builtin;
  let map;
  const customMaps = [];
  let editingMap = null;
  let deletingMap = null;
  let selected = null;
  let hover = null;
  let regionById;
  let regionNodes;
  let regionLabels;
  let routesByRegion;
  let highlightedRegion = null;
  let pressedRegion = null;
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let drag;
  let pinch;
  const pointers = new Map();
  let suppressClick = false;
  let indexPromise;
  let cacheDatabase;
  let cacheReset;
  let busy = false;
  let noticeTimer;
  let lastTextScale;
  const MAX_STRING_BYTES = 10000000;

  function svgElement(tag, attributes = {}) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function icon(type) {
    const svg = svgElement('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    svg.append(svgElement('use', { href: `#cc-map-type-${Object.hasOwn(types, type) ? type : 'unknown'}` }));
    return svg;
  }

  function setupIcons() {
    for (const [type, [, , , paths]] of Object.entries(types)) {
      const symbol = svgElement('symbol', { id: `cc-map-type-${type}`, viewBox: '0 0 24 24' });
      symbol.innerHTML = paths;
      $('map-defs').append(symbol);
    }
    for (const group of ['거점', '자연', '수역', '미지 · 위험']) {
      const section = document.createElement('section');
      section.className = 'legend-section';
      const heading = document.createElement('h2');
      heading.textContent = group;
      section.append(heading);
      for (const [type, [label, category, color]] of Object.entries(types)) {
        if (category !== group) continue;
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.title = label;
        item.style.setProperty('--type-color', color);
        const name = document.createElement('span');
        name.textContent = label;
        item.append(icon(type), name);
        section.append(item);
      }
      $('legend').append(section);
    }
  }

  function terrain() {
    $('map-terrain').replaceChildren(svgElement('rect', {
      x: -3000, y: -3000, width: 7000, height: 7000, fill: 'url(#cc-map-sea-grid)',
    }));
  }

  function point(region) { return { x: (region.x + .5) * 12, y: (region.y + .5) * 12 }; }

  function renderMap(next) {
    pointers.clear(); drag = null; pinch = null;
    $('map-canvas').classList.remove('is-dragging');
    map = next;
    lastTextScale = undefined;
    selected = null;
    hover = null;
    $('map-detail').hidden = true;
    $('map-menu').hidden = true;
    $('map-picker').setAttribute('aria-expanded', 'false');
    regionById = new Map(map.regions.map(region => [String(region.id), region]));
    regionNodes = new Map();
    regionLabels = new Map();
    routesByRegion = new Map(map.regions.map(region => [String(region.id), []]));
    highlightedRegion = null;
    pressedRegion = null;
    $('map-canvas').classList.remove('has-selection');
    $('map-canvas').setAttribute('viewBox', `0 0 ${map.width * 12} ${map.height * 12}`);
    $('map-canvas').setAttribute('aria-label', `${map.name} 지도`);
    $('custom-background').setAttribute('width', map.width * 12);
    $('custom-background').setAttribute('height', map.height * 12);
    $('custom-background').toggleAttribute('hidden', !map.imageURL);
    $('custom-background').setAttribute('visibility', map.imageURL ? 'visible' : 'hidden');
    if (map.imageURL) $('custom-background').setAttribute('href', map.imageURL);
    else $('custom-background').removeAttribute('href');
    terrain();
    $('map-routes').replaceChildren();
    $('map-regions').replaceChildren();
    $('map-labels').replaceChildren();
    $('map-distances').replaceChildren();
    const seen = new Set();
    for (const region of map.regions) {
      for (const neighborId of region.neighbors || []) {
        const neighbor = regionById.get(String(neighborId));
        if (!neighbor || String(neighbor.id) === String(region.id)) continue;
        const key = JSON.stringify([String(region.id), String(neighbor.id)].sort());
        if (seen.has(key)) continue;
        seen.add(key);
        const a = point(region), b = point(neighbor);
        const shadow = svgElement('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'map-road road-shadow' });
        const line = svgElement('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'map-road' });
        const route = { a: String(region.id), b: String(neighbor.id), line };
        routesByRegion.get(route.a).push(route);
        routesByRegion.get(route.b).push(route);
        $('map-routes').append(shadow, line);
      }
      const type = regionType(region.type);
      const framed = type[1] === '거점' || type[1] === '미지 · 위험';
      const scale = Math.max(1, Math.min(5, Math.trunc(Number(region.scale)) || 1));
      const size = [0, 16, 24, 34, 48, 64][scale];
      const p = point(region);
      const group = svgElement('g', { class: `map-region region-scale-${scale}`, transform: `translate(${p.x} ${p.y})`,
        tabindex: '0', role: 'button', 'aria-label': `${region.name}, ${type[0]}`, 'aria-pressed': 'false' });
      group.style.color = type[2];
      group.append(svgElement('circle', { r: Math.max(20, size / 2 + 6), class: 'region-hit' }));
      if (framed) group.append(svgElement('circle', { r: size / 2 - 1, class: 'region-disc' }));
      group.append(svgElement('use', { href: `#cc-map-type-${Object.hasOwn(types, region.type) ? region.type : 'unknown'}`, x: -size / 2 + 3, y: -size / 2 + 3, width: size - 6, height: size - 6, class: 'region-symbol' }));
      const label = svgElement('text', { class: `region-label region-scale-${scale}`, 'dominant-baseline': 'hanging' });
      label.textContent = region.name;
      regionLabels.set(String(region.id), { node: label, p, bottom: size / 2 - (framed ? 1 : 3) });
      $('map-labels').append(label);
      group.addEventListener('click', event => {
        event.stopPropagation();
        if (!suppressClick) selectRegion(String(region.id));
      });
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRegion(String(region.id)); }
      });
      group.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'mouse' || drag) return;
        hover = String(region.id); highlight();
      });
      group.addEventListener('pointerleave', () => { hover = null; highlight(); });
      regionNodes.set(String(region.id), group);
      $('map-regions').append(group);
    }
    $('map-name').textContent = map.name;
    $('map-meta').textContent = `${map.width} × ${map.height} · ${map.regions.length}개 지역`;
    $('map-choice').textContent = map.name;
    renderCustomList();
    fit();
    if (window.matchMedia('(max-width: 640px)').matches) {
      zoomBy(Math.min(3, map.width * 12 / Math.max(1, $('map-viewport').clientWidth)));
    }
    highlight();
  }

  function highlight() {
    const active = hover || selected;
    if (pressedRegion !== selected) {
      regionNodes.get(pressedRegion)?.setAttribute('aria-pressed', 'false');
      regionNodes.get(selected)?.setAttribute('aria-pressed', 'true');
      pressedRegion = selected;
    }
    if (active === highlightedRegion) return;
    // 강조 변경은 이전·새 지역의 인접 연결만 순회한다.
    regionNodes.get(highlightedRegion)?.classList.remove('is-selected');
    regionLabels.get(highlightedRegion)?.node.classList.remove('is-selected');
    for (const route of routesByRegion.get(highlightedRegion) || []) {
      route.line.classList.remove('is-highlighted');
      regionNodes.get(route.a === highlightedRegion ? route.b : route.a).classList.remove('is-neighbor');
    }
    highlightedRegion = active;
    $('map-distances').replaceChildren();
    $('map-canvas').classList.toggle('has-selection', active !== null);
    if (active === null) return;
    regionNodes.get(active).classList.add('is-selected');
    regionLabels.get(active).node.classList.add('is-selected');
    const textScale = Math.min(1, 1 / screenScale());
    for (const route of routesByRegion.get(active)) {
      route.line.classList.add('is-highlighted');
      regionNodes.get(route.a === active ? route.b : route.a).classList.add('is-neighbor');
      const a = regionById.get(route.a), b = regionById.get(route.b);
      const pa = point(a), pb = point(b);
      const label = formatTravelTime(Math.hypot(a.x - b.x, a.y - b.y));
      const labelWidth = Math.max(36, label.length * 8 + 12);
      const x = (pa.x + pb.x) / 2, y = (pa.y + pb.y) / 2;
      const group = svgElement('g', { 'data-x': x, 'data-y': y,
        transform: `translate(${x} ${y}) scale(${textScale})` });
      group.append(svgElement('rect', { x: -labelWidth / 2, y: -10, width: labelWidth, height: 20, rx: 2, class: 'distance-plate' }));
      const text = svgElement('text', { class: 'distance-text', y: .5 });
      text.textContent = label;
      group.append(text);
      $('map-distances').append(group);
    }
  }

  function selectRegion(id) {
    selected = id;
    hover = null;
    const region = regionById.get(id);
    const type = regionType(region.type);
    $('detail-icon').replaceChildren(icon(region.type));
    $('detail-icon').style.color = type[2];
    $('detail-type').textContent = type[0];
    $('detail-name').textContent = region.name;
    $('detail-description').textContent = region.description || '';
    $('map-detail').hidden = false;
    highlight();
  }

  function formatTravelTime(distance) {
    const totalHours = Math.round(distance / (map.distanceScale ?? 1) * 24);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return [days ? `${days}일` : '', hours || !days ? `${hours}시간` : ''].filter(Boolean).join(' ');
  }

  function clearSelection() {
    if (selected === null && hover === null) return;
    selected = null; hover = null; $('map-detail').hidden = true; highlight();
  }

  function updateCamera() {
    $('map-camera').setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
    // 축소할 때는 함께 줄이고, 확대할 때만 보정하여 규모별 글자 크기의 상한을 유지한다.
    const textScale = Math.min(1, 1 / screenScale());
    // 이동만 할 때는 글자 크기가 같으므로 전체 라벨을 다시 쓰지 않는다.
    if (textScale !== lastTextScale) {
      lastTextScale = textScale;
      for (const { node, p, bottom } of regionLabels.values()) {
        node.setAttribute('transform', `translate(${p.x} ${p.y + bottom + 3 * textScale}) scale(${textScale})`);
      }
      for (const node of $('map-distances').children) {
        node.setAttribute('transform', `translate(${node.dataset.x} ${node.dataset.y}) scale(${textScale})`);
      }
    }
    $('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
    $('zoom-in').disabled = zoom >= 3.5;
    $('zoom-out').disabled = zoom <= .7;
  }

  function screenScale() {
    const matrix = $('map-canvas').getScreenCTM();
    return matrix ? Math.max(.001, Math.hypot(matrix.a, matrix.b) * zoom) : 1;
  }

  function fit() { zoom = 1; pan = { x: 0, y: 0 }; updateCamera(); }

  function zoomBy(factor, center = { x: map.width * 6, y: map.height * 6 }) {
    const next = Math.max(.7, Math.min(3.5, zoom * factor));
    pan.x = center.x - (center.x - pan.x) * next / zoom;
    pan.y = center.y - (center.y - pan.y) * next / zoom;
    zoom = next;
    updateCamera();
  }

  function pointerPoint(event) {
    return new window.DOMPoint(event.clientX, event.clientY).matrixTransform($('map-canvas').getScreenCTM().inverse());
  }

  function setupInteraction() {
    ui.addEventListener('pointerdown', event => {
      // 지도 조작은 채팅 포커스를 유지한다. 실제 입력·파일 선택·설명 복사는 허용한다.
      if (event.target !== ui && !event.target.closest('input, textarea, select, .file-field, .map-detail')) event.preventDefault();
    });
    $('custom-background').addEventListener('error', () => showNotice('배경 이미지를 표시할 수 없습니다. 이미지 파일을 확인하세요.', true));
    $('expand-sidebar').addEventListener('click', () => {
      const expanded = $('sidebar').classList.toggle('is-expanded');
      $('expand-sidebar').setAttribute('aria-expanded', expanded);
      $('expand-sidebar').title = expanded ? '범례 접기' : '범례 펼치기';
      $('expand-sidebar').setAttribute('aria-label', $('expand-sidebar').title);
      $('map-menu').hidden = true; $('map-picker').setAttribute('aria-expanded', 'false');
      updateCamera();
    });
    $('map-picker').addEventListener('click', () => {
      $('map-menu').hidden = !$('map-menu').hidden;
      $('map-picker').setAttribute('aria-expanded', !$('map-menu').hidden);
      $('custom-panel').hidden = true;
      if (!$('map-menu').hidden) runTask(async () => { await ensureIndex(); renderCustomList(); });
    });
    $('open-custom').addEventListener('click', () => openCustom());
    $('close-custom').addEventListener('click', () => { $('custom-panel').hidden = true; });
    $('close-detail').addEventListener('click', clearSelection);
    $('zoom-in').addEventListener('click', () => zoomBy(1.25));
    $('zoom-out').addEventListener('click', () => zoomBy(1 / 1.25));
    $('zoom-fit').addEventListener('click', fit);
    function beginPinch() {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom, pan: { ...pan } };
      drag = null;
      suppressClick = true;
      hover = null;
      highlight();
      for (const id of pointers.keys()) $('map-canvas').setPointerCapture(id);
    }
    $('map-canvas').addEventListener('wheel', event => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? $('map-viewport').clientHeight : 1);
      zoomBy(Math.exp(-delta * .0018), pointerPoint(event));
    }, { passive: false });
    $('map-canvas').addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const p = pointerPoint(event);
      pointers.set(event.pointerId, p);
      if (pointers.size === 1) {
        suppressClick = false;
        drag = { id: event.pointerId, start: p, original: { ...pan }, moved: false };
      } else if (pointers.size === 2) beginPinch();
    });
    $('map-canvas').addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      const p = pointerPoint(event);
      pointers.set(event.pointerId, p);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        zoom = Math.max(.7, Math.min(3.5, pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
        pan = { x: center.x - (pinch.center.x - pinch.pan.x) * zoom / pinch.zoom,
          y: center.y - (pinch.center.y - pinch.pan.y) * zoom / pinch.zoom };
        updateCamera();
        return;
      }
      if (!drag || event.pointerId !== drag.id) return;
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) {
        drag.moved = true; hover = null; highlight();
        $('map-canvas').setPointerCapture(event.pointerId);
        $('map-canvas').classList.add('is-dragging');
      }
      pan = { x: drag.original.x + dx, y: drag.original.y + dy };
      updateCamera();
    });
    function endDrag(event) {
      if (!pointers.has(event.pointerId)) return;
      if (pinch || drag?.moved) suppressClick = true;
      pointers.delete(event.pointerId);
      if ($('map-canvas').hasPointerCapture(event.pointerId)) $('map-canvas').releasePointerCapture(event.pointerId);
      pinch = null;
      drag = null;
      if (pointers.size >= 2) beginPinch();
      else if (pointers.size === 1) {
        const [id, p] = [...pointers][0];
        drag = { id, start: p, original: { ...pan }, moved: true };
      } else $('map-canvas').classList.remove('is-dragging');
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    $('map-canvas').addEventListener('click', event => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    document.addEventListener('click', event => {
      if (ui.hidden) return;
      if (!event.target.closest('.map-menu, #cc-map-map-picker')) { $('map-menu').hidden = true; $('map-picker').setAttribute('aria-expanded', 'false'); }
      if (!event.target.closest('.map-region, .map-detail, .zoom-controls') && !drag) clearSelection();
    });
    $('close-map').addEventListener('click', closeBook);
    $('apply-custom').addEventListener('click', () => runTask(importCustom));
    window.addEventListener('resize', () => { if (!ui.hidden) fitVisibleViewport(); }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => { if (!ui.hidden) fitVisibleViewport(); }, { passive: true });
      window.visualViewport.addEventListener('scroll', () => { if (!ui.hidden) fitVisibleViewport(); }, { passive: true });
    }
    $('cancel-delete').addEventListener('click', () => { deletingMap = null; $('delete-panel').hidden = true; });
    $('confirm-delete').addEventListener('click', () => runTask(async () => {
      if (!deletingMap) return;
      const name = deletingMap.name;
      const result = await persistChange({ action: 'delete', name });
      if (map.customName === name) renderMap(builtin);
      else renderCustomList();
      deletingMap = null;
      $('delete-panel').hidden = true;
      showNotice(result.warning || '삭제했습니다.', Boolean(result.warning));
    }));
  }

  function renderCustomList() {
    $('custom-list').replaceChildren();
    ui.querySelectorAll('[data-builtin]').forEach(button => {
      button.classList.toggle('is-active', map === builtinMaps[Number(button.dataset.builtin)]);
    });
    $('custom-count').textContent = `${customMaps.length} / 3`;
    $('open-custom').disabled = busy || customMaps.length >= 3;
    $('open-custom').title = customMaps.length >= 3 ? '커스텀 지도는 3개까지 추가할 수 있습니다.' : '커스텀 추가';
    for (const entry of customMaps) {
      const row = document.createElement('div');
      row.className = 'custom-option-row';
      const select = document.createElement('button');
      select.className = 'map-option';
      select.classList.toggle('is-active', map.customName === entry.name);
      select.title = entry.name;
      select.innerHTML = '<span class="option-mark">◇</span><span class="custom-label"><span></span><small></small></span><span class="option-check">✓</span>';
      select.querySelector('.custom-label > span').textContent = entry.name;
      select.querySelector('small').remove();
      select.dataset.customAction = '';
      select.addEventListener('click', () => runTask(() => selectCustom(entry.name)));
      row.append(select);
      for (const [action, label, paths] of [
        ['edit', '수정', '<path d="m14 4 6 6M4 20l5-1L21 7l-4-4L5 15z"/>'],
        ['delete', '삭제', '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'],
      ]) {
        const button = document.createElement('button');
        button.className = `icon-button ${action}-map`;
        button.dataset.customAction = '';
        button.title = `${entry.name} ${label}`;
        button.setAttribute('aria-label', button.title);
        const svg = svgElement('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
        svg.innerHTML = paths;
        button.append(svg);
        button.addEventListener('click', () => {
          if (action === 'edit') { openCustom(entry); return; }
          deletingMap = entry;
          $('delete-map-name').textContent = entry.name;
          $('delete-panel').hidden = false;
          $('map-menu').hidden = true;
          $('map-picker').setAttribute('aria-expanded', 'false');
        });
        row.append(button);
      }
      $('custom-list').append(row);
    }
  }

  function openCustom(entry = null) {
    if (!entry && customMaps.length >= 3) return;
    editingMap = entry;
    $('map-menu').hidden = true;
    $('map-picker').setAttribute('aria-expanded', 'false');
    $('delete-panel').hidden = true;
    $('custom-panel').hidden = false;
    $('custom-title').textContent = entry ? '커스텀 수정' : '커스텀 추가';
    $('apply-custom').textContent = entry ? '적용' : '추가';
    $('custom-map-name').value = entry?.name || '';
    $('custom-json').value = '';
    $('custom-image').value = '';
    $('custom-error').hidden = true;
    $('custom-current-file').hidden = !entry;
    $('custom-current-file').textContent = entry ? '파일을 선택하지 않으면 기존 데이터와 이미지를 유지합니다.' : '';
  }


  function regionType(type) {
    return Object.hasOwn(types, type) ? types[type] : types.unknown;
  }

  function validateMap(data) {
    if (!data || typeof data.name !== 'string' || !data.name.trim() ||
        !Number.isSafeInteger(data.width) || data.width <= 0 ||
        !Number.isSafeInteger(data.height) || data.height <= 0 || !Array.isArray(data.regions)) {
      throw new Error('지도 이름·크기·지역 목록을 확인하세요.');
    }
    if (data.distanceScale !== undefined && (!Number.isFinite(data.distanceScale) || data.distanceScale <= 0)) {
      throw new Error('distanceScale은 0보다 큰 숫자를 사용하세요.');
    }
    const ids = new Set();
    for (const region of data.regions) {
      if (!region || !['number', 'string'].includes(typeof region.id) ||
          (typeof region.id === 'number' && !Number.isFinite(region.id)) || !String(region.id).trim() ||
          ids.has(String(region.id)) || typeof region.name !== 'string' || !region.name.trim() ||
          typeof region.type !== 'string' || !Number.isInteger(region.scale) || region.scale < 1 ||
          !Number.isInteger(region.x) || !Number.isInteger(region.y) ||
          region.x < 0 || region.x >= data.width || region.y < 0 || region.y >= data.height ||
          (region.description !== undefined && typeof region.description !== 'string') ||
          (region.neighbors !== undefined && !Array.isArray(region.neighbors))) {
        throw new Error('지역의 ID·이름·종류·규모·좌표·인접 목록을 확인하세요.');
      }
      ids.add(String(region.id));
    }
    for (const region of data.regions) {
      if ((region.neighbors || []).some(id => !['number', 'string'].includes(typeof id) ||
          !ids.has(String(id)) || String(id) === String(region.id))) {
        throw new Error('neighbors에는 같은 지도에 존재하는 다른 지역의 ID를 넣으세요.');
      }
    }
    return data;
  }

  function validateName(name) {
    // eslint-disable-next-line no-control-regex -- 저장 경로에 사용할 Firebase 키를 검증한다.
    if (!name || name.length > 50 || /[.#$[\]/\u0000-\u001f\u007f]/u.test(name)) {
      throw new Error('지도 이름은 1~50자로 입력하고 . # $ [ ] / 및 제어 문자는 사용하지 마세요.');
    }
    return name;
  }

  function validateRecord(record) {
    if (!record || typeof record.data !== 'string' || typeof record.background_images !== 'string' ||
        (record.background_images && !/^data:image\/[a-z0-9.+-]+;base64,/i.test(record.background_images))) {
      throw new Error('저장된 지도의 JSON 또는 이미지 형식을 확인하세요.');
    }
    return record;
  }

  function readBuiltins() {
    if (builtinMaps) return;
    builtinMaps = BUNDLED_MAPS.map(resource => {
      const data = validateMap(JSON.parse(GM_getResourceText(resource.data)));
      let imageURL;
      if (data.backgroundImage) {
        if (/[\\/]/u.test(data.backgroundImage)) throw new Error('기본 지도 배경에는 파일 이름만 사용하세요.');
        const svg = GM_getResourceText(resource.background);
        if (!svg) throw new Error('기본 지도 배경을 읽을 수 없습니다.');
        imageURL = URL.createObjectURL(new window.Blob([svg], { type: 'image/svg+xml' }));
      }
      return { ...data, imageURL };
    });
    builtin = builtinMaps[0];
  }

  function makeWindow() {
    const host = document.createElement('div');
    host.innerHTML = MAP_TEMPLATE;
    ui = host.firstElementChild;
    ui.hidden = true;
    const style = document.createElement('style');
    style.textContent = MAP_CSS;
    ui.append(style);
    const notice = document.createElement('div');
    notice.id = 'cc-map-notice';
    notice.className = 'popover map-notice';
    notice.setAttribute('role', 'status');
    notice.hidden = true;
    ui.querySelector('.map-body').append(notice);
    ui.querySelectorAll('button').forEach(button => { button.type = 'button'; });
    document.body.append(ui);
    setupIcons();
    setupInteraction();
    ui.addEventListener('cc-book-escape', handleEscape);
    ui.addEventListener('cc-book-close-request', closeBook);
    const viewportResize = new ResizeObserver(() => { if (!ui.hidden && map) updateCamera(); });
    viewportResize.observe($('map-viewport'));
    renderBuiltinList();
  }

  function renderBuiltinList() {
    $('builtin-list').replaceChildren();
    builtinMaps.forEach((entry, index) => {
      const button = document.createElement('button');
      button.className = 'map-option';
      button.dataset.builtin = String(index);
      button.innerHTML = '<span class="option-mark">◇</span><span><span></span><small></small></span><span class="option-check">✓</span>';
      button.querySelector('span > span').textContent = entry.name;
      button.querySelector('small').textContent = `${entry.regions.length}개 지역`;
      button.addEventListener('click', () => renderMap(entry));
      $('builtin-list').append(button);
    });
  }

  function openBook() {
    try {
      if (!ui) { readBuiltins(); makeWindow(); }
      ui.hidden = false;
      ui.dispatchEvent(new Event('cc-book-open', { bubbles: true }));
      if (!map) renderMap(builtin);
      fitVisibleViewport();
    } catch (error) {
      if (ui?.isConnected) showNotice(error.message, true);
      else window.alert(error.message);
    }
  }

  function closeBook() {
    ui.hidden = true;
    pointers.clear(); drag = null; pinch = null;
    $('custom-panel').hidden = true; $('delete-panel').hidden = true;
    ui.dispatchEvent(new Event('cc-book-closed'));
    $('map-menu').hidden = true;
    $('map-picker').setAttribute('aria-expanded', 'false');
  }

  function handleEscape() {
    if (!$('delete-panel').hidden) $('cancel-delete').click();
    else if (!$('custom-panel').hidden) $('close-custom').click();
    else if (!$('map-menu').hidden) {
      $('map-menu').hidden = true;
      $('map-picker').setAttribute('aria-expanded', 'false');
    } else if (!$('map-detail').hidden) clearSelection();
    else closeBook();
  }

  function fitVisibleViewport() {
    if (!ui || ui.hidden || window.innerWidth > 640) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    const available = Math.max(0, height - 16);
    ui.style.maxWidth = `${Math.max(0, width - 16)}px`;
    ui.style.maxHeight = `${available}px`;
    ui.style.minWidth = `${Math.min(328, Math.max(0, width - 16))}px`;
    ui.style.minHeight = `${Math.min(220, available)}px`;
    const currentHeight = Math.min(480, Math.max(240, height - 165));
    ui.style.height = `${Math.min(currentHeight, available)}px`;
    const box = ui.getBoundingClientRect();
    const x = Number.parseFloat(ui.style.left), y = Number.parseFloat(ui.style.top);
    ui.style.left = `${Math.max(left + 8, Math.min(Number.isFinite(x) ? x : left + (width - box.width) / 2, left + width - box.width - 8))}px`;
    ui.style.top = `${Math.max(top + 8, Math.min(Number.isFinite(y) ? y : top + 12, top + height - box.height - 8))}px`;
    updateCamera();
  }

  function showNotice(message, error = false) {
    const notice = $('notice');
    notice.textContent = message;
    notice.classList.toggle('is-error', error);
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, error ? 6500 : 3000);
  }

  function updateBusy() {
    ui.setAttribute('aria-busy', String(busy));
    ui.querySelectorAll('[data-custom-action], #cc-map-apply-custom, #cc-map-confirm-delete')
      .forEach(button => { button.disabled = busy; });
    $('open-custom').disabled = busy || customMaps.length >= 3;
  }

  async function runTask(action) {
    if (busy) return;
    busy = true; updateBusy();
    try { await action(); }
    catch (error) {
      showNotice(error.code === 'CONFLICT' ? '다른 기기에서 데이터가 변경되었습니다. 새로고침 후 내용을 확인하세요.' : error.message, true);
    } finally { busy = false; updateBusy(); }
  }

  // 저장소 선택과 통신은 core에 맡기고, 여기서는 영구적인 열람용 사본만 관리한다.
  function openCache() {
    if (cacheDatabase) return cacheDatabase;
    cacheDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('crack-map-book-cache', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('meta');
        request.result.createObjectStore('maps');
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); cacheDatabase = null; };
        resolve(database);
      };
      request.onerror = () => { cacheDatabase = null; reject(new Error('지도 사본 저장소를 열 수 없습니다.')); };
    });
    return cacheDatabase;
  }

  async function readCache(storeName, key) {
    const database = await openCache();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      let value;
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(new Error('지도 사본을 읽을 수 없습니다.'));
      transaction.onerror = () => {};
    });
  }

  async function writeIndex(index) {
    const database = await openCache();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(['meta', 'maps'], 'readwrite');
      transaction.objectStore('meta').put(index, 'index');
      const maps = transaction.objectStore('maps');
      const request = maps.getAllKeys();
      request.onsuccess = () => {
        for (const name of request.result) if (!index.names.includes(name)) maps.delete(name);
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(new Error('지도 목록 사본을 저장할 수 없습니다.'));
      transaction.onerror = () => {};
    });
  }

  async function cacheMap(name, updatedAt, record) {
    const database = await openCache();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('maps', 'readwrite');
      transaction.objectStore('maps').put({ updatedAt, ...record }, name);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(new Error('지도 사본을 저장할 공간이 부족하거나 저장소를 사용할 수 없습니다.'));
      transaction.onerror = () => {};
    });
  }

  // 같은 페이지에서는 재조회하지 않는다. 다음 페이지의 첫 조회만 저장 날짜를 비교한다.
  function ensureIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = (async () => {
      await cacheReset;
      const [updatedAt, copy] = await Promise.all([book.load('updatedAt'), readCache('meta', 'index')]);
      if (updatedAt !== null && (!Number.isSafeInteger(updatedAt) || updatedAt < 0)) {
        throw new Error('저장된 지도의 updatedAt 형식을 확인하세요.');
      }
      let index = copy;
      if (!copy || copy.updatedAt !== updatedAt || !Array.isArray(copy.names)) {
        const names = await book.keys('custom_map');
        index = { updatedAt, names };
        try { await writeIndex(index); }
        catch (error) { showNotice(error.message, true); }
      }
      customMaps.splice(0, customMaps.length, ...index.names.map(name => ({ name })));
      return index;
    })().catch(error => { indexPromise = null; throw error; });
    return indexPromise;
  }

  async function selectCustom(name) {
    const index = await ensureIndex();
    if (!index.names.includes(name)) throw new Error('지도가 삭제되었습니다. 목록을 다시 확인하세요.');
    let record = await readCache('maps', name);
    if (!record || record.updatedAt !== index.updatedAt) {
      record = validateRecord(await book.load(`custom_map/${name}`));
      try { await cacheMap(name, index.updatedAt, record); }
      catch (error) { showNotice(error.message, true); }
    }
    renderRecord(name, record);
  }

  function renderRecord(name, record) {
    validateRecord(record);
    const data = validateMap(JSON.parse(record.data));
    renderMap({ ...data, name, customName: name, imageURL: record.background_images });
  }

  async function advanceCache(previous, index, changes) {
    const database = await openCache();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(['meta', 'maps'], 'readwrite');
      const maps = transaction.objectStore('maps');
      const cursor = maps.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (!index.names.includes(item.key)) item.delete();
        else if (!changes.has(item.key) && item.value.updatedAt === previous.updatedAt) {
          item.update({ ...item.value, updatedAt: index.updatedAt });
        }
        item.continue();
      };
      for (const [name, record] of changes) {
        if (record === null) maps.delete(name);
        else maps.put({ ...record, updatedAt: index.updatedAt }, name);
      }
      transaction.objectStore('meta').put(index, 'index');
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(new Error('DB 저장은 완료됐지만 로컬 사본을 저장하지 못했습니다.'));
      transaction.onerror = () => {};
    });
  }

  async function invalidateCache(changes) {
    const database = await openCache();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(['meta', 'maps'], 'readwrite');
      transaction.objectStore('meta').delete('index');
      for (const name of changes.keys()) transaction.objectStore('maps').delete(name);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {};
    });
  }

  // 지도 본문을 먼저 변경하고 마지막에 날짜를 쓴다. 중간 실패는 자동 재시도하지 않는다.
  async function persistChange({ action, name, newName = name, data, image }) {
    const previous = await ensureIndex();
    const changes = new Map();
    let record;
    let operationError;
    try {
      if (action === 'delete') {
        record = await book.load(`custom_map/${name}`);
        if (record === null) throw new Error('이미 삭제된 지도입니다. 페이지를 새로고침하세요.');
        await book.save(null, `custom_map/${name}`);
        changes.set(name, null);
      } else {
        if (action === 'add' && previous.names.length >= 3) throw new Error('커스텀 지도는 3개까지 추가할 수 있습니다.');
        const current = await book.load(`custom_map/${name}`);
        if (action === 'add' && current !== null) throw new Error('같은 이름의 지도가 이미 저장되어 있습니다.');
        if (action === 'edit' && current === null) throw new Error('지도가 삭제되었습니다. 페이지를 새로고침하세요.');
        if (action === 'edit') validateRecord(current);
        record = { data: data ?? current?.data, background_images: image ?? current?.background_images ?? '' };
        validateRecord(record);
        if (newName !== name) {
          if (await book.load(`custom_map/${newName}`) !== null) throw new Error('같은 이름의 지도가 이미 저장되어 있습니다.');
        }
        await book.save(record, `custom_map/${newName}`);
        changes.set(newName, record);
        if (newName !== name) {
          await book.save(null, `custom_map/${name}`);
          changes.set(name, null);
        }
      }
    } catch (error) {
      if (!changes.size) throw error;
      operationError = error;
    }
    let warning;
    const updatedAt = Math.max(Date.now(), (previous.updatedAt ?? 0) + 1);
    const names = new Set(previous.names);
    for (const [key, value] of changes) { if (value === null) names.delete(key); else names.add(key); }
    const index = { updatedAt, names: [...names] };
    try { await book.save(updatedAt, 'updatedAt'); }
    catch {
      warning = '지도 변경은 저장됐지만 날짜 갱신에 실패했습니다. 다른 기기에 반영되지 않을 수 있으니 다시 등록·수정하세요.';
    }
    if (!warning) {
      try { await advanceCache(previous, index, changes); }
      catch (error) { warning = error.message; }
      indexPromise = Promise.resolve(index);
    } else {
      indexPromise = null;
      try { await invalidateCache(changes); } catch { /* 다음 조회에서 오류를 안내한다. */ }
    }
    customMaps.splice(0, customMaps.length, ...[...names].map(key => ({ name: key })));
    if (operationError) throw new Error(`일부 변경만 저장됐습니다. 새로고침 후 목록을 확인하세요. ${operationError.message}`);
    return { record, name: newName, warning };
  }

  function stringBytes(value) { return new window.TextEncoder().encode(value).byteLength; }

  async function readImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('배경에는 이미지 파일을 선택하세요.');
    if (4 * Math.ceil(file.size / 3) + file.type.length + 13 > MAX_STRING_BYTES) {
      throw new Error('배경 이미지는 인코딩 후 10MB 이하여야 합니다. 더 작은 이미지 파일을 선택하세요.');
    }
    return new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
      reader.onabort = () => reject(new Error('이미지 읽기가 취소되었습니다.'));
      reader.readAsDataURL(file);
    });
  }

  async function importCustom() {
    const original = editingMap;
    const file = $('custom-json').files[0];
    const image = $('custom-image').files[0];
    $('custom-error').hidden = true;
    try {
      if (!file && !original) throw new Error('지도 JSON 파일을 선택하세요.');
      let text;
      let parsed;
      if (file) {
        if (file.size > MAX_STRING_BYTES) throw new Error('지도 JSON은 10MB 이하여야 합니다.');
        text = await file.text();
        if (stringBytes(text) > MAX_STRING_BYTES) throw new Error('지도 JSON은 10MB 이하여야 합니다.');
        parsed = validateMap(JSON.parse(text));
      }
      const name = validateName($('custom-map-name').value.trim() || parsed?.name || original?.name || '');
      if (original && !file && !image && name === original.name) { $('custom-panel').hidden = true; return; }
      const imageData = image ? await readImage(image) : undefined;
      const result = await persistChange({ action: original ? 'edit' : 'add',
        name: original?.name || name, newName: name, data: text, image: imageData });
      $('custom-panel').hidden = true;
      editingMap = null;
      renderRecord(result.name, result.record);
      showNotice(result.warning || '저장했습니다.', Boolean(result.warning));
    } catch (error) {
      $('custom-error').textContent = error instanceof SyntaxError ? 'JSON 파일의 형식을 확인하세요.' : error.message;
      $('custom-error').hidden = false;
    }
  }

  function clearReadState() { indexPromise = null; }
  document.addEventListener('cc-content-data-changed', event => {
    if (event.detail.id !== 'crack-map-book') return;
    clearReadState();
    customMaps.length = 0;
    if (ui && !ui.hidden) closeBook();
    if (map?.customName) map = null;
    cacheReset = openCache().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction(['meta', 'maps'], 'readwrite');
      transaction.objectStore('meta').clear();
      transaction.objectStore('maps').clear();
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(new Error('지도 사본을 초기화할 수 없습니다.'));
      transaction.onerror = () => {};
    }));
    cacheReset.catch(error => { if (ui) showNotice(error.message, true); });
  });
  if (window.navigation) window.navigation.addEventListener('navigatesuccess', clearReadState);
  else window.addEventListener('popstate', clearReadState);
  window.addEventListener('pagehide', clearReadState);
})();

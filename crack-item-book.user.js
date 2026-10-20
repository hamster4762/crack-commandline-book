// ==UserScript==
// @name         크랙 아이템 도감
// @namespace    crack-commandline
// @version      1.0.0.0
// @description  !아이템으로 인벤토리를 열고 프리셋별 즐겨찾기와 소지품을 관리합니다. (version 관리방식: 데이터스키마버전.크랙UI변경.기능추가및수정.버그수정)
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @noframes
// @require      https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-core.js
// @resource     ccCommon https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-common.css
// @resource     itemBook https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/data/item.json
// @grant        unsafeWindow
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @connect      identitytoolkit.googleapis.com
// @connect      securetoken.googleapis.com
// @connect      firebaseio.com
// @connect      firebasedatabase.app
// ==/UserScript==

/*
 * DB 저장 스키마 v1
 * crack-item-book/
 * └─ {프리셋 이름}/
 *    ├─ bookmark: ["아이템 이름", ...] — 즐겨찾기
 *    └─ inventory: ["아이템 이름", ...] — 소지중
 * 배열의 순서는 의미가 없다. 빈 목록은 생략하고, 양쪽 모두 비면 저장하지 않는다.
 * 분류·설명·등급·이미지 경로는 item.json에서 읽으며 DB에 저장하지 않는다.
 */
(() => {
  'use strict';

  const book = unsafeWindow.CrackCommandline.register({
    id: 'crack-item-book', label: '아이템', useDatabse: true, lambda: openBook,
  });
  const IMAGE_BASE = 'https://raw.githubusercontent.com/hamster4762/crack-commandline-book/refs/heads/main/images/item/';
  const ITEM_CSS = `.cc-ui.cc-item-window { position: fixed; left: min(58vw, calc(100vw - 434px)); top: 74px; display: flex; flex-direction: column; width: 404px; height: min(715px, calc(100dvh - 98px)); min-width: 328px; min-height: 255px; padding: 4px; border-radius: 3px; resize: both; overflow: hidden; max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); --inset: 10px; }
.cc-ui.cc-item-window::before { inset: 5px !important; opacity: .55 !important; z-index: 9 !important; }
.cc-ui.cc-item-window .item-header { flex: 0 0 28px; display: flex; justify-content: space-between; align-items: center; padding: 0 3px 0 9px; border-bottom: 1px solid #a08a5e77; background: linear-gradient(100deg, #a08e6128, #18212733 70%); cursor: move; touch-action: none; user-select: none; }
.cc-ui.cc-item-window .item-header h1 { display: flex; align-items: center; gap: 6px; font: 700 13px var(--heading-face); letter-spacing: .06em; }
.cc-ui.cc-item-window .item-header h1 svg { width: 14px; height: 14px; color: #c5ad7b; }
.cc-ui.cc-item-window .item-header > div { display: flex; gap: 1px; }
.cc-ui.cc-item-window .item-header .icon-button { width: 27px; height: 24px; }
.cc-ui.cc-item-window .item-header .icon-button svg { width: 14px; height: 14px; }
.cc-ui.cc-item-window [data-item-ui="save"] { color: #cfb787; }
.cc-ui.cc-item-window [data-item-ui="dirty"] { width: 5px; height: 5px; border-radius: 50%; background: #e06e61; box-shadow: 0 0 5px #ed76566b; }
.cc-ui.cc-item-window .item-toolbar { display: flex; gap: 5px; align-items: center; justify-content: space-between; padding: 6px 6px 5px; flex: 0 0 44px; border-bottom: 1px solid #69726b66; background: #151f2522; }
.cc-ui.cc-item-window .category-tabs, .cc-ui.cc-item-window .view-tools { display: flex; gap: 2px; }
.cc-ui.cc-item-window .view-tools { border-left: 1px solid #84725266; padding-left: 5px; }
.cc-ui.cc-item-window .item-toolbar button { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid transparent; border-radius: 2px; color: #acb4af; padding: 0; }
.cc-ui.cc-item-window .category-tabs button svg { width: 20px; height: 20px; }
.cc-ui.cc-item-window .view-tools button svg { width: 17px; height: 17px; }
.cc-ui.cc-item-window .item-toolbar button:hover { background: #d4c28d12; color: #e6d4a7; }
.cc-ui.cc-item-window .category-tabs button[aria-pressed=true] { color: #edd6a0; background: linear-gradient(#534b35, #34372f); border-color: #ad9361; box-shadow: inset 0 0 0 2px #111b2080, inset 0 1px #e5cfa933; }
.cc-ui.cc-item-window .view-tools button[aria-pressed=true] { color: #e3c78e; background: #b49e6020; border-color: #ae91594d; }
.cc-ui.cc-item-window button[aria-pressed=true] .fill-active { fill: currentColor; }
.cc-ui.cc-item-window .item-toolbar button:disabled { opacity: .25; }
.cc-ui.cc-item-window .inventory-meta { display: flex; justify-content: space-between; align-items: center; flex: 0 0 24px; padding: 2px 10px; color: #b9b39d; font-size: 10px; background: #080f162e; }
.cc-ui.cc-item-window [data-item-ui="item-count"] { color: #84958e; font: 10px Consolas, 'Malgun Gothic', sans-serif; }
.cc-ui.cc-item-window .item-items { flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #8f805655 #101a21; margin: 0 3px; padding: 8px 6px; background: radial-gradient(ellipse at 50% 0%, #43514a16, transparent), #0d171db3; box-shadow: inset 0 2px 6px #0006; }
.cc-ui.cc-item-window .grid-view { display: grid; grid-template-columns: repeat(auto-fill, 50px); align-content: start; justify-content: space-between; gap: 8px 5px; }
.cc-ui.cc-item-window .grid-view .item-art { width: 48px; margin-inline: auto; }
.cc-ui.cc-item-window .item-card { min-width: 0; position: relative; cursor: pointer; outline: none; }
.cc-ui.cc-item-window .item-card:focus-visible { outline: 1px solid #ead3a0; outline-offset: 2px; }
.cc-ui.cc-item-window .item-art { --rarity: #79858a; --rarity-bg: #353d3c; position: relative; display: block; width: 100%; aspect-ratio: 1; border: 1px solid var(--rarity); border-radius: 0; background: linear-gradient(130deg,#ffffff10,transparent 50%), radial-gradient(ellipse at 50% 85%,var(--rarity-bg),transparent 90%), linear-gradient(155deg,var(--rarity-bg),#080b0d 85%); box-shadow: inset 0 1px #f9e9b633, 0 1px 2px #000a; }
.cc-ui.cc-item-window .item-art img { display: block; width: 100%; height: 100%; object-fit: contain; padding: 0; filter: drop-shadow(0 2px 2px #000b); }
.cc-ui.cc-item-window .item-art::after { content: ''; position: absolute; pointer-events: none; }
.cc-ui.cc-item-window .rarity-1 { --rarity: #858d83; --rarity-bg: #444941; }
.cc-ui.cc-item-window .rarity-2 { --rarity: #64b462; --rarity-bg: #245329; }
.cc-ui.cc-item-window .rarity-3 { --rarity: #548fda; --rarity-bg: #244a77; }
.cc-ui.cc-item-window .rarity-4 { --rarity: #ad75da; --rarity-bg: #542d71; }
.cc-ui.cc-item-window .rarity-5 { --rarity: #df6c4f; --rarity-bg: #702e21; --ornament: #eac187; }
.cc-ui.cc-item-window .rarity-6 { --rarity: #f3d17a; --rarity-bg: #84601f; --ornament: #fff0bc; }
.cc-ui.cc-item-window .rarity-7 { --rarity: #fff; --rarity-bg: #edf4f2; --ornament: #fff; }
.cc-ui.cc-item-window .rarity-5::after, .cc-ui.cc-item-window .rarity-6::after, .cc-ui.cc-item-window .rarity-7::after { inset: -1px; background: linear-gradient(var(--ornament),var(--ornament)) left top/6px 1px no-repeat,linear-gradient(var(--ornament),var(--ornament)) left top/1px 6px no-repeat,linear-gradient(var(--ornament),var(--ornament)) right top/6px 1px no-repeat,linear-gradient(var(--ornament),var(--ornament)) right top/1px 6px no-repeat,linear-gradient(var(--ornament),var(--ornament)) left bottom/6px 1px no-repeat,linear-gradient(var(--ornament),var(--ornament)) left bottom/1px 6px no-repeat,linear-gradient(var(--ornament),var(--ornament)) right bottom/6px 1px no-repeat,linear-gradient(var(--ornament),var(--ornament)) right bottom/1px 6px no-repeat; }
.cc-ui.cc-item-window .rarity-6 { box-shadow: inset 0 1px #fff6, 0 0 5px #f3d17a99; }
.cc-ui.cc-item-window .item-art.rarity-7 { background: radial-gradient(ellipse at 50% 75%, #f2fcffbb, #b6ced27a 55%, #34434c 100%); box-shadow: 0 0 3px #fff, 0 0 9px #e4f7ff99, inset 0 0 5px #ffffff88; }
.cc-ui.cc-item-window .item-art.rarity-6::before, .cc-ui.cc-item-window .item-art.rarity-7::before { content: '◆'; position: absolute; z-index: 1; top: -5px; left: calc(50% - 3px); font-size: 6px; color: var(--ornament); text-shadow: 0 0 3px var(--rarity); }
.cc-ui.cc-item-window .item-card:hover .item-art { filter: brightness(1.2); }
.cc-ui.cc-item-window .item-name { display: block; font-size: 10px; line-height: 1.4; margin-top: 5px; color: #d3d3c4; text-align: center; height: 28px; overflow: hidden; word-break: keep-all; overflow-wrap: anywhere; }
.cc-ui.cc-item-window .item-toggles { position: absolute; right: -1px; bottom: -1px; display: flex; gap: 1px; z-index: 2; }
.cc-ui.cc-item-window .item-toggles button { width: 19px; height: 19px; padding: 3px; border: 1px solid #5a645c99; border-radius: 2px; background: #111c23eb; color: #8b9691; display: grid; place-items: center; }
.cc-ui.cc-item-window .item-toggles svg { width: 12px; height: 12px; stroke-width: 1.7; }
.cc-ui.cc-item-window .item-toggles button[aria-pressed=true] { color: #e5c886; border-color: #9c8b5e; background: #333a29f5; }
.cc-ui.cc-item-window .item-toggles button.owned[aria-pressed=true] { color: #b5d2a5; border-color: #758c67; }
.cc-ui.cc-item-window .list-view { padding: 0; display: block; }
.cc-ui.cc-item-window .list-view .item-card { display: grid; grid-template-columns: 39px minmax(67px, .9fr) 46px minmax(50px, 1fr) 41px; gap: 7px; align-items: center; min-height: 52px; padding: 5px 7px; border-bottom: 1px solid #6d787b30; background: #778c8b06; }
.cc-ui.cc-item-window .list-view .item-card:nth-child(even) { background: #7b999310; }
.cc-ui.cc-item-window .list-view .item-art { width: 37px; }
.cc-ui.cc-item-window .list-view .item-name { height: auto; margin: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.cc-ui.cc-item-window .item-subcategory { color: #b8ad8c; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-ui.cc-item-window .item-description { color: #929f9e; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-ui.cc-item-window .list-view .item-toggles { position: static; gap: 2px; }
.cc-ui.cc-item-window .list-view .item-toggles button { width: 19px; height: 25px; border-color: transparent; background: transparent; padding: 3px; }
.cc-ui.cc-item-window .grid-view .item-subcategory, .cc-ui.cc-item-window .grid-view .item-description { display: none; }
.cc-ui.cc-item-window .item-footer { display: flex; gap: 5px; padding: 7px 7px 6px; border-top: 1px solid #a08a5b66; flex: 0 0 43px; }
.cc-ui.cc-item-window .preset-toggle { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; min-height: 29px; padding: 3px 9px; border: 1px solid #707469; border-radius: 2px; background: linear-gradient(#2c393c, #17252c); box-shadow: inset 0 1px #e4d9af10; font-size: 11px; text-align: left; }
.cc-ui.cc-item-window .preset-toggle > svg:first-child { width: 15px; height: 15px; color: #a7b19c; }
.cc-ui.cc-item-window .preset-toggle > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-ui.cc-item-window .preset-toggle > svg:last-child { width: 12px; height: 12px; color: #bdb392; }
.cc-ui.cc-item-window .item-footer .icon-button { width: 29px; height: 29px; border: 1px solid #8c7955; background: var(--plate); color: #ddc69b; }
.cc-ui.cc-item-window .item-popover { position: absolute; z-index: 15; padding: 5px; border: 1px solid #a28d62; border-radius: 2px; background: linear-gradient(115deg,#303b3e,#18252d); box-shadow: 0 10px 30px #000a, inset 0 0 0 2px #14202a; }
.cc-ui.cc-item-window .subcategory-menu { right: 8px; top: 73px; min-width: 150px; max-height: calc(100% - 130px); overflow: auto; }
.cc-ui.cc-item-window .subcategory-menu button { display: block; width: 100%; text-align: left; font-size: 11px; padding: 6px 9px; }
.cc-ui.cc-item-window .subcategory-menu button[aria-pressed=true] { color: #e5cd98; background: #c7b47c17; }
.cc-ui.cc-item-window .subcategory-menu button:hover { background: #c7b47c12; }
.cc-ui.cc-item-window .preset-menu { left: 11px; right: 46px; bottom: 45px; max-height: 210px; overflow: auto; }
.cc-ui.cc-item-window .preset-row { display: flex; align-items: center; min-height: 32px; gap: 2px; }
.cc-ui.cc-item-window .preset-row > button:first-child { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; padding: 5px 7px; font-size: 11px; }
.cc-ui.cc-item-window .preset-row.is-active { background: #bba77a14; color: #e4cf9c; }
.cc-ui.cc-item-window .preset-row .icon-button { width: 24px; height: 26px; }
.cc-ui.cc-item-window .preset-row .icon-button svg { width: 12px; height: 12px; }
.cc-ui.cc-item-window .preset-delete-label { flex: 1; min-width: 0; padding: 4px 7px; color: var(--red); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-ui.cc-item-window .preset-row .delete-confirm { color: var(--red); }
.cc-ui.cc-item-window .item-toast { position: absolute; left: 50%; bottom: 54px; transform: translateX(-50%); max-width: 90%; z-index: 25; white-space: nowrap; font-size: 11px; padding: 8px 15px; color: #dedcc2; border: 1px solid #a4ad79; background: #23362ff5; box-shadow: 0 4px 15px #0009; }
.cc-ui.cc-item-window .empty-items { position: absolute; top: 40%; width: 100%; text-align: center; color: #8e9f95; font-size: 11px; pointer-events: none; }
.cc-ui.cc-item-window .empty-items span { display: block; font-size: 40px; margin-bottom: 10px; opacity: .5; }
.cc-ui.cc-item-window .item-detail { position: fixed; z-index: 50; width: min(304px, calc(100vw - 20px)); padding: 12px; background: linear-gradient(125deg,#29353a,#101c25 80%); border: 1px solid #ae9766; border-top: 2px solid #d3bb85; box-shadow: 0 8px 35px #000b, inset 0 0 0 2px #0a131a; border-radius: 2px; }
.cc-ui.cc-item-window .detail-top { display: flex; align-items: center; gap: 10px; }
.cc-ui.cc-item-window [data-item-ui="detail-art"] { width: 55px; flex-shrink: 0; }
.cc-ui.cc-item-window .detail-top > div:nth-child(2) { flex: 1; min-width: 0; }
.cc-ui.cc-item-window [data-item-ui="detail-grade"] { font-size: 10px; }
.cc-ui.cc-item-window [data-item-ui="detail-name"] { font: 600 14px/1.5 'Malgun Gothic', sans-serif; color: #eee4c9; margin: 1px 0; overflow-wrap: anywhere; }
.cc-ui.cc-item-window [data-item-ui="detail-category"] { color: #8faaa7; font-size: 10px; }
.cc-ui.cc-item-window [data-item-ui="close-detail"] { align-self: flex-start; width: 21px; height: 21px; }
.cc-ui.cc-item-window [data-item-ui="close-detail"] svg { width: 12px; height: 12px; }
.cc-ui.cc-item-window [data-item-ui="detail-description"] { border-top: 1px solid #7b815e55; padding-top: 10px; margin: 11px 0; font-size: 12px; line-height: 1.8; color: #c5cebf; user-select: text; cursor: text; }
.cc-ui.cc-item-window [data-item-ui="detail-status"] { display: flex; gap: 12px; font-size: 10px; color: #b9be9b; }
.cc-ui.cc-item-window [data-item-ui="detail-status"] span { display: flex; gap: 4px; align-items: center; }
.cc-ui.cc-item-window [data-item-ui="detail-status"] svg { width: 12px; height: 12px; }
.cc-ui.cc-item-window .warning-heading { font: 700 17px var(--heading-face); color: #e4cb96; }
.cc-ui.cc-item-window { z-index: 2147483600; }
.cc-ui.cc-item-window[hidden], .cc-ui.cc-item-window [hidden] { display: none !important; }

.cc-ui.cc-item-window .grid-view .item-card { height: 81px; content-visibility: auto; contain-intrinsic-size: auto 81px; }
.cc-ui.cc-item-window .list-view .item-card { content-visibility: auto; contain-intrinsic-size: auto 52px; }
.cc-ui.cc-item-window .item-detail { overflow: auto; }
.cc-ui.cc-item-window .preset-edit { display: flex; align-items: center; gap: 3px; width: 100%; }
.cc-ui.cc-item-window .preset-edit .text-input { flex: 1; min-width: 0; height: 29px; }
.cc-ui.cc-item-window .preset-edit .icon-button { flex-shrink: 0; }
.cc-ui.cc-item-window .item-toast { white-space: pre-line; overflow-wrap: anywhere; width: max-content; max-height: 120px; overflow: auto; }
.cc-ui.cc-item-window .item-toast.is-error { color: var(--red); border-color: #bb8371; background: linear-gradient(#4b3531, #2d2324); }
.cc-ui.cc-item-window .item-notice { position: absolute; z-index: 60; inset: 0; display: flex; align-items: center; justify-content: center; padding: 12px; background: #080e15c9; }
.cc-ui.cc-item-window .item-notice-panel { padding: 14px; width: 100%; border: 1px solid #ad9567; background: linear-gradient(130deg,#303940,#1b252d); box-shadow: inset 0 0 0 2px #111a20cc,0 9px 26px #000b; }
.cc-ui.cc-item-window .item-notice-panel p { font-size: 12px; line-height: 1.8; color: var(--muted); }
.cc-ui.cc-item-window .item-notice-panel .notice-detail { color: var(--accent); overflow-wrap: anywhere; }
.cc-ui.cc-item-window .item-notice-panel footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 5px; margin-top: 14px; }
.cc-ui.cc-item-window .item-notice-panel .button { padding: 6px 9px; font-size: 11px; }
.cc-ui.cc-item-window .grade-text-1 { color: #a1aeac; }
.cc-ui.cc-item-window .grade-text-2 { color: #8cbe98; }
.cc-ui.cc-item-window .grade-text-3 { color: #8abde6; }
.cc-ui.cc-item-window .grade-text-4 { color: #c5a9eb; }
.cc-ui.cc-item-window .grade-text-5 { color: #ea9f89; }
.cc-ui.cc-item-window .grade-text-6 { color: #f0d18e; }
.cc-ui.cc-item-window .grade-text-7 { color: #fff; }

@media(max-width: 640px) {
  .cc-ui.cc-item-window { left: 8px; top: 48px; width: calc(100vw - 16px); min-width: 0; height: min(480px, calc(100dvh - 190px)); min-height: 240px; resize: none; }
  .cc-ui.cc-item-window .item-toolbar { padding-left: 3px; padding-right: 3px; gap: 3px; }
  .cc-ui.cc-item-window .item-toolbar button { width: 27px; }
  .cc-ui.cc-item-window .view-tools { padding-left: 3px; }
  .cc-ui.cc-item-window .item-toggles button { width: 20px; height: 20px; }
}`;
  const ITEM_TEMPLATE = `<section data-item-ui="inventory" class="cc-ui ui-window cc-item-window" role="dialog" aria-modal="false" hidden aria-label="인벤토리">
      <header class="item-header" data-item-ui="drag-handle"><h1><svg viewBox="0 0 24 24"><path d="M4 8h16v13H4zM8 8V4h8v4M4 12h16M9 10v4m6-4v4"/></svg>인벤토리<i data-item-ui="dirty" hidden></i></h1><div><button data-item-ui="save" class="icon-button" title="저장" aria-label="저장" data-icon="save"></button><button data-item-ui="close" class="icon-button" title="닫기" aria-label="닫기" data-icon="close"></button></div></header>
      <div class="item-toolbar">
        <div data-item-ui="tabs" class="category-tabs" role="group" aria-label="아이템 분류"></div>
        <div class="view-tools"><button data-item-ui="subcategory" title="소분류 선택" aria-label="소분류 선택" aria-expanded="false" disabled data-icon="down"></button><button data-item-ui="filter-favorite" title="즐겨찾기 필터" aria-label="즐겨찾기 필터" aria-pressed="false" data-icon="star"></button><button data-item-ui="filter-owned" title="소지중 필터" aria-label="소지중 필터" aria-pressed="false" data-icon="bag"></button><button data-item-ui="view-mode" title="목록 보기" aria-label="목록 보기" data-icon="list"></button></div>
      </div>
      <div class="inventory-meta"><span data-item-ui="category-label">전체 아이템</span><span data-item-ui="item-count"></span></div>
      <div data-item-ui="items" class="item-items grid-view" aria-label="아이템 목록"></div>
      <div class="empty-items" data-item-ui="empty" hidden><span>◇</span>조건에 맞는 아이템이 없습니다.</div>
      <footer class="item-footer"><button data-item-ui="preset-toggle" class="preset-toggle" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM9 4v16M12 8h4m-4 4h4"/></svg><span data-item-ui="preset-name">모험 준비</span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></button><button data-item-ui="add-preset" class="icon-button" title="프리셋 추가" aria-label="프리셋 추가" data-icon="plus"></button></footer>
      <div data-item-ui="subcategory-menu" class="item-popover subcategory-menu" hidden></div>
      <div data-item-ui="preset-menu" class="item-popover preset-menu" hidden><div data-item-ui="presets"></div></div>
      <div data-item-ui="toast" class="item-toast" role="status" hidden></div>
    <aside data-item-ui="detail" class="cc-ui item-detail" hidden><div class="detail-top"><div data-item-ui="detail-art"></div><div><span data-item-ui="detail-grade"></span><h2 data-item-ui="detail-name"></h2><small data-item-ui="detail-category"></small></div><button data-item-ui="close-detail" class="icon-button" title="닫기" aria-label="상세 닫기" data-icon="close"></button></div><p data-item-ui="detail-description"></p><div data-item-ui="detail-status"></div></aside><div class="item-notice" data-item-ui="notice" hidden></div></section>`;
  const drawings = {
    all: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    equipment: '<path d="m5 20 13-13 2-5-5 2L2 17m6-5 5 5M4 16l4 4M17 14l5 5-3 3-5-5"/>',
    magic: '<path d="m12 2 7 6-2 11-5 3-5-3L5 8zm0 0v20M5 8l7 5 7-5m-12 11 5-6 5 6"/>',
    potion: '<path d="M9 3h6v6l5 8c2 5-18 5-16 0l5-8ZM8 3h8M7 15h10"/>',
    crafting: '<path d="m5 4 15 15-3 3L2 7zm11-2 6 6-5 4-4-4zM5 17l4 4m-2-6-5 5 2 2 5-5"/>',
    material: '<path d="m3 9 6-6 9 2 4 8-7 9-10-3Zm6-6 3 10 6-8M3 9l9 4 3 9m-3-9 10 0"/>',
    star: '<path class="fill-active" d="m12 2 3 6.5 7 1-5 5 1 7-6-3.5L6 21.5l1-7-5-5 7-1Z"/>',
    bag: '<path class="fill-active" d="m8 3 4 2 4-2-1 5c9 8 9 14-3 14S0 16 9 8Z"/><path d="M8 8h8"/>',
    list: '<path d="M9 5h12M9 12h12M9 19h12"/><rect x="3" y="3" width="3" height="4"/><rect x="3" y="10" width="3" height="4"/><rect x="3" y="17" width="3" height="4"/>',
    save: '<path d="M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8M14 4v3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>', down: '<path d="m6 9 6 6 6-6"/>', plus: '<path d="M12 4v16M4 12h16"/>',
    copy: '<rect x="8" y="8" width="13" height="13"/><path d="M16 8V3H3v13h5"/>',
    edit: '<path d="m4 16 12-12 4 4L8 20H4Zm10-10 4 4"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  };

  let ui;
  const $ = id => ui.querySelector(`[data-item-ui="${id}"]`);
  let catalog;
  let items;
  const itemByName = new Map();
  const cache = new Map();
  const drafts = new Map();
  const persistedNames = new Set();
  const createdNames = new Set();
  const names = new Set();
  let selectedPreset;
  let placeholderPreset;
  let tab = 0;
  let subcategory = '';
  let favoriteOnly = false;
  let ownedOnly = false;
  let listView = false;
  let activeDetail = null;
  let hoverTimer;
  let toastTimer;
  let drag;
  let busy = false;
  let ready = false;
  let events;
  let returnFocus;

  function element(tag, className = '', text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const host = element('span');
    host.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${drawings[name]}</svg>`;
    return host.firstElementChild;
  }

  function iconButton(name, title, handler) {
    const node = element('button', 'icon-button');
    node.type = 'button'; node.title = title; node.setAttribute('aria-label', title);
    node.append(icon(name));
    if (handler) node.addEventListener('click', handler);
    return node;
  }

  function readCatalog() {
    if (catalog) return;
    const data = JSON.parse(GM_getResourceText('itemBook'));
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.groups) ||
        !Array.isArray(data.grades) || !Array.isArray(data.items) ||
        typeof data.defaultPreset !== 'string' || typeof data.newPresetPrefix !== 'string') {
      throw new Error('아이템 데이터의 분류·등급·목록을 확인하세요.');
    }
    const categories = new Map(data.categories.map((category, i) => [category.name, { ...category, order: i }]));
    const seen = new Set();
    for (const item of data.items) {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || seen.has(item.name) ||
          !categories.get(item.category)?.subcategories.includes(item.subcategory) ||
          !data.grades.includes(item.grade) || typeof item.description !== 'string' ||
          (item.icon !== undefined && (typeof item.icon !== 'string' || !/^[\w.-]+$/u.test(item.icon)))) {
        throw new Error('아이템의 이름·분류·등급·설명·아이콘 파일 이름을 확인하세요.');
      }
      seen.add(item.name);
    }
    items = [...data.items].sort((a, b) => categories.get(a.category).order - categories.get(b.category).order ||
      categories.get(a.category).subcategories.indexOf(a.subcategory) - categories.get(b.category).subcategories.indexOf(b.subcategory) ||
      data.grades.indexOf(b.grade) - data.grades.indexOf(a.grade) || a.name.localeCompare(b.name, 'ko'));
    for (const item of items) itemByName.set(item.name, item);
    catalog = data;
  }

  // 캐시는 읽기/저장에 성공한 값, draft는 사용자 편집본(null은 프리셋 삭제)이다.
  function normalizePreset(value, knownOnly = false) {
    const clean = entries => [...new Set(entries || [])].filter(name => !knownOnly || itemByName.has(name)).sort((a, b) => a.localeCompare(b, 'ko'));
    return { bookmark: clean(value?.bookmark), inventory: clean(value?.inventory) };
  }

  function validatePreset(value, name) {
    if (value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value) || ['bookmark', 'inventory'].some(key =>
      value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some(item => typeof item !== 'string')))) {
      throw new Error(`“${name}”의 즐겨찾기·소지중 저장 형식을 확인하세요.`);
    }
    return normalizePreset(value);
  }

  function valueFor(name = selectedPreset) {
    return drafts.has(name) ? drafts.get(name) : cache.get(name);
  }

  function storageValue(value) {
    if (value === null) return null;
    const clean = normalizePreset(value, true), result = {};
    for (const key of ['bookmark', 'inventory']) if (clean[key].length) result[key] = clean[key];
    return Object.keys(result).length ? result : null;
  }

  async function loadPreset(name) {
    const value = validatePreset(await book.load(name), name);
    cache.set(name, value);
    return value;
  }

  function ensurePreset() {
    if (!names.size) {
      names.add(catalog.defaultPreset); createdNames.add(catalog.defaultPreset);
      placeholderPreset = catalog.defaultPreset;
    }
    if (!names.has(selectedPreset)) selectedPreset = names.values().next().value;
  }

  async function openBook() {
    if (ui && !ui.hidden) return;
    readCatalog();
    if (!ui) makeWindow();
    returnFocus = document.activeElement;
    ui.hidden = false; ready = false;
    fitVisibleViewport();
    events = new window.AbortController();
    for (const target of [window, window.visualViewport].filter(Boolean)) {
      target.addEventListener('resize', fitVisibleViewport, { passive: true, signal: events.signal });
    }
    window.visualViewport?.addEventListener('scroll', fitVisibleViewport, { passive: true, signal: events.signal });
    document.addEventListener('pointerdown', event => {
      if (!ui.contains(event.target)) { hideMenus(); hideDetail(); }
    }, { signal: events.signal });
    await run(async () => {
      const stored = await book.keys();
      if (stored.length && placeholderPreset && !drafts.has(placeholderPreset)) {
        createdNames.delete(placeholderPreset); cache.delete(placeholderPreset); placeholderPreset = undefined;
      }
      persistedNames.clear(); names.clear();
      for (const name of stored) {
        if (!createdNames.has(name) || !drafts.has(name)) { persistedNames.add(name); createdNames.delete(name); }
        names.add(name);
      }
      for (const name of createdNames) names.add(name);
      for (const [name, value] of drafts) {
        if (value === null) names.delete(name); else names.add(name);
      }
      ensurePreset();
      if (!createdNames.has(selectedPreset) || cache.has(selectedPreset)) await loadPreset(selectedPreset);
      ready = true;
    });
  }

  function makeWindow() {
    const host = element('div'); host.innerHTML = ITEM_TEMPLATE;
    ui = host.firstElementChild;
    const style = element('style'); style.textContent = ITEM_CSS; ui.append(style);
    ui.querySelectorAll('[data-icon]').forEach(node => node.replaceChildren(icon(node.dataset.icon)));
    const groups = [{ label: '전체', icon: 'all', categories: [] }, ...catalog.groups];
    for (const [index, group] of groups.entries()) {
      const button = iconButton(group.icon, group.label, () => {
        tab = index; subcategory = ''; hideMenus(); hideDetail(); render();
      });
      button.dataset.tab = index; $('tabs').append(button);
    }
    $('save').addEventListener('click', () => requestSave());
    $('close').addEventListener('click', requestClose);
    $('subcategory').addEventListener('click', renderSubcategories);
    $('filter-favorite').addEventListener('click', () => { favoriteOnly = !favoriteOnly; hideDetail(); render(); });
    $('filter-owned').addEventListener('click', () => { ownedOnly = !ownedOnly; hideDetail(); render(); });
    $('view-mode').addEventListener('click', () => { listView = !listView; hideDetail(); render(); });
    $('preset-toggle').addEventListener('click', () => {
      const show = $('preset-menu').hidden; hideMenus(); hideDetail(); renderPresets();
      $('preset-menu').hidden = !show; $('preset-toggle').setAttribute('aria-expanded', String(show));
    });
    $('add-preset').addEventListener('click', addPreset);
    $('close-detail').addEventListener('click', hideDetail);
    $('items').addEventListener('scroll', hideDetail, { passive: true });
    $('items').addEventListener('click', handleItemClick);
    $('items').addEventListener('keydown', event => {
      const card = event.target.closest('[data-item-name]');
      if (!card || event.target.closest('button') || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); const box = card.getBoundingClientRect(); showDetail(card.dataset.itemName, box.right, box.top);
    });
    $('items').addEventListener('pointerover', event => {
      const card = event.target.closest('[data-item-name]');
      if (!card || event.pointerType !== 'mouse' || card.contains(event.relatedTarget)) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showDetail(card.dataset.itemName, event.clientX, event.clientY), 260);
    });
    $('items').addEventListener('pointerout', event => {
      const card = event.target.closest('[data-item-name]');
      if (card && !card.contains(event.relatedTarget)) clearTimeout(hoverTimer);
    });
    ui.addEventListener('pointerdown', event => {
      if (!event.target.closest('.item-card, .item-detail')) hideDetail();
      if (!event.target.closest('.item-popover, [data-item-ui="preset-toggle"], [data-item-ui="subcategory"]')) hideMenus();
      if (event.pointerType === 'mouse' && event.target.closest('button')) event.preventDefault();
    });
    ui.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (!$('notice').hidden) $('notice').hidden = true;
      else if (!$('detail').hidden || !$('preset-menu').hidden || !$('subcategory-menu').hidden) { hideMenus(); hideDetail(); }
      else requestClose();
    });
    setupDrag(); document.body.append(ui);
  }

  function render() {
    if (!ui) return;
    const value = normalizePreset(valueFor(), true), favorite = new Set(value.bookmark), owned = new Set(value.inventory);
    const group = tab ? catalog.groups[tab - 1] : null;
    const visible = items.filter(item => (!group || group.categories.includes(item.category)) && (!subcategory || item.subcategory === subcategory) &&
      (!favoriteOnly || favorite.has(item.name)) && (!ownedOnly || owned.has(item.name)));
    $('category-label').textContent = subcategory || group?.label || '전체 아이템';
    $('item-count').textContent = `${visible.length} / ${items.length}`;
    $('items').className = `item-items ${listView ? 'list-view' : 'grid-view'}`;
    $('empty').hidden = visible.length > 0 || !ready;
    const fragment = document.createDocumentFragment();
    for (const item of visible) {
      const card = element('article', 'item-card'); card.tabIndex = 0; card.dataset.itemName = item.name;
      card.setAttribute('aria-label', `${item.name}, ${item.grade}`);
      const image = art(item), name = element('span', 'item-name', item.name);
      name.classList.add(`grade-text-${catalog.grades.indexOf(item.grade) + 1}`);
      const toggles = element('div', 'item-toggles');
      for (const [key, drawing, title, active] of [['bookmark', 'star', '즐겨찾기', favorite.has(item.name)], ['inventory', 'bag', '소지중', owned.has(item.name)]]) {
        const button = iconButton(drawing, `${item.name} ${title}`); button.dataset.toggle = key;
        button.setAttribute('aria-pressed', String(active)); if (key === 'inventory') button.classList.add('owned'); toggles.append(button);
      }
      card.append(image, name, element('span', 'item-subcategory', item.subcategory), element('span', 'item-description', item.description));
      if (listView) card.append(toggles); else image.append(toggles);
      fragment.append(card);
    }
    $('items').replaceChildren(fragment);
    $('preset-name').textContent = selectedPreset || catalog.defaultPreset;
    $('preset-toggle').title = selectedPreset || catalog.defaultPreset;
    $('tabs').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.tab) === tab)));
    $('filter-favorite').setAttribute('aria-pressed', String(favoriteOnly));
    $('filter-owned').setAttribute('aria-pressed', String(ownedOnly));
    $('view-mode').replaceChildren(icon(listView ? 'all' : 'list'));
    $('view-mode').title = listView ? '썸네일 보기' : '목록 보기'; $('view-mode').setAttribute('aria-label', $('view-mode').title);
    renderDirty(); setControls();
  }

  function art(item) {
    const frame = element('span', `item-art rarity-${catalog.grades.indexOf(item.grade) + 1}`);
    const image = element('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.width = 96; image.height = 96;
    image.src = IMAGE_BASE + encodeURIComponent(item.icon || 'dummy.svg');
    frame.append(image); return frame;
  }

  function handleItemClick(event) {
    const card = event.target.closest('[data-item-name]');
    if (!card || busy || !ready) return;
    const button = event.target.closest('[data-toggle]');
    if (!button) { clearTimeout(hoverTimer); showDetail(card.dataset.itemName, event.clientX, event.clientY); return; }
    const value = normalizePreset(valueFor()), key = button.dataset.toggle, name = card.dataset.itemName;
    const index = value[key].indexOf(name);
    if (index < 0) value[key].push(name); else value[key].splice(index, 1);
    editPreset(selectedPreset, value);
    if (favoriteOnly || ownedOnly) render();
    else button.setAttribute('aria-pressed', String(index < 0));
    if (activeDetail === name) renderDetailStatus(name);
  }

  function editPreset(name, value) {
    const next = value === null ? null : normalizePreset(value);
    if (next !== null && JSON.stringify(next) === JSON.stringify(normalizePreset(cache.get(name)))) drafts.delete(name);
    else drafts.set(name, next);
    renderDirty();
  }

  function renderDirty() {
    $('dirty').hidden = drafts.size === 0;
    if (drafts.size) window.addEventListener('beforeunload', warnUnsaved);
    else window.removeEventListener('beforeunload', warnUnsaved);
  }

  function warnUnsaved(event) {
    if (!drafts.size) return;
    event.preventDefault(); event.returnValue = '';
  }

  function renderSubcategories() {
    const show = $('subcategory-menu').hidden; hideMenus(); hideDetail();
    const group = catalog.groups[tab - 1];
    if (!group) return;
    const subcategories = [...new Set(catalog.categories.filter(category => group.categories.includes(category.name)).flatMap(category => category.subcategories))];
    $('subcategory-menu').replaceChildren();
    for (const name of ['', ...subcategories]) {
      const choice = element('button', '', name || '전체'); choice.type = 'button';
      choice.setAttribute('aria-pressed', String(name === subcategory));
      choice.addEventListener('click', () => { subcategory = name; hideMenus(); render(); }); $('subcategory-menu').append(choice);
    }
    $('subcategory-menu').hidden = !show; $('subcategory').setAttribute('aria-expanded', String(show));
  }

  function renderPresets() {
    $('presets').replaceChildren();
    for (const name of names) {
      const row = element('div', 'preset-row' + (name === selectedPreset ? ' is-active' : ''));
      const choose = element('button', '', name); choose.type = 'button';
      choose.addEventListener('click', () => void choosePreset(name));
      row.append(choose, iconButton('copy', '복제', () => void copyPreset(name)), iconButton('edit', '명칭 수정', () => void renamePreset(name)));
      row.append(iconButton('trash', '삭제', () => confirmDelete(name, row)));
      $('presets').append(row);
    }
    setControls();
  }

  async function choosePreset(name) {
    hideMenus(); hideDetail();
    return run(async () => {
      if (!createdNames.has(name) || cache.has(name)) await loadPreset(name);
      selectedPreset = name;
    });
  }

  function uniqueName(base) {
    let number = 2, name = base;
    while (names.has(name) || persistedNames.has(name) || drafts.has(name)) name = `${base} ${number++}`;
    return name;
  }

  function addPreset() {
    selectedPreset = uniqueName(catalog.newPresetPrefix);
    names.add(selectedPreset); createdNames.add(selectedPreset); drafts.set(selectedPreset, normalizePreset(null));
    hideMenus(); hideDetail(); render();
  }

  async function copyPreset(name) {
    if (!await choosePreset(name)) return;
    const next = uniqueName(name);
    names.add(next); createdNames.add(next); drafts.set(next, normalizePreset(valueFor(name)));
    selectedPreset = next; render();
  }

  function validatePresetName(name, previous) {
    // eslint-disable-next-line no-control-regex
    if (!name || /[.#$[\]/\u0000-\u001f\u007f]/u.test(name)) throw new Error('이름에는 . # $ [ ] / 또는 제어 문자를 사용할 수 없습니다.');
    if (name !== previous && (names.has(name) || persistedNames.has(name) || drafts.has(name))) throw new Error('이미 사용 중인 프리셋 이름입니다.');
  }

  async function renamePreset(name) {
    if (!await choosePreset(name)) return;
    renderPresets(); $('preset-menu').hidden = false; $('preset-toggle').setAttribute('aria-expanded', 'true');
    const row = [...$('presets').children].find(node => node.firstElementChild.textContent === name);
    const form = element('form', 'preset-edit');
    const input = element('input', 'text-input'); input.value = name; input.maxLength = 80; input.setAttribute('aria-label', '프리셋 이름');
    const apply = iconButton('check', '이름 변경 적용'); apply.type = 'submit';
    form.append(input, apply, iconButton('close', '이름 변경 취소', renderPresets));
    form.addEventListener('submit', event => {
      event.preventDefault(); const next = input.value.trim();
      try { validatePresetName(next, name); }
      catch (error) { showToast(error.message, true); return; }
      if (next !== name) {
        const value = normalizePreset(valueFor(name));
        names.delete(name); names.add(next); createdNames.delete(name); createdNames.add(next);
        if (persistedNames.has(name)) drafts.set(name, null); else drafts.delete(name);
        if (placeholderPreset === name) placeholderPreset = undefined;
        drafts.set(next, value); selectedPreset = next;
      }
      hideMenus(); render(); restoreFocus();
    });
    row.replaceChildren(form); input.focus({ preventScroll: true }); input.select();
  }

  function confirmDelete(name, row) {
    const label = element('span', 'preset-delete-label', `“${name}” 삭제?`);
    const remove = iconButton('trash', '삭제 적용', () => {
      names.delete(name); createdNames.delete(name);
      if (persistedNames.has(name)) drafts.set(name, null); else drafts.delete(name);
      if (placeholderPreset === name) placeholderPreset = undefined;
      ensurePreset(); hideMenus();
      if (createdNames.has(selectedPreset)) render(); else void choosePreset(selectedPreset);
    });
    remove.classList.add('delete-confirm');
    row.replaceChildren(label, remove, iconButton('close', '삭제 취소', renderPresets));
  }

  function requestSave(closeAfter = false) {
    if (busy || !ready) return;
    const empty = [...drafts].filter(([name, value]) => value !== null && names.has(name) && storageValue(value) === null).map(([name]) => name);
    const save = async () => { if (await saveChanges() && closeAfter) closeBook(); };
    if (!empty.length) { void save(); return; }
    showNotice('빈 프리셋', '빈 프리셋은 저장되지 않으며, 새로고침하면 사라집니다.', empty.join(' · '), [
      ['취소', '', () => {}], ['저장', 'primary', () => void save()],
    ]);
  }

  async function saveOne(name, value) {
    const data = storageValue(value);
    if (data === null && !persistedNames.has(name)) {
      if (drafts.get(name) === value) drafts.delete(name);
      return;
    }
    if (!cache.has(name)) await loadPreset(name);
    if (data !== null && createdNames.has(name) && !persistedNames.has(name) && cache.get(name) !== null) {
      throw new Error(`“${name}”이 저장소에 이미 있습니다. 다른 이름을 사용하세요.`);
    }
    const result = await book.save(data, name);
    cache.set(name, validatePreset(result, name));
    if (result === null) {
      persistedNames.delete(name); if (names.has(name)) createdNames.add(name);
    } else {
      persistedNames.add(name); createdNames.delete(name);
      if (placeholderPreset === name) placeholderPreset = undefined;
    }
    if (drafts.get(name) === value) drafts.delete(name);
  }

  async function saveChanges() {
    return run(async () => {
      const pending = new Map(drafts);
      // 카탈로그에서 사라진 이름은 읽을 때 숨기고, 저장 버튼을 눌렀을 때만 정리한다.
      for (const name of names) {
        const value = cache.get(name);
        if (value && !pending.has(name) && JSON.stringify(value) !== JSON.stringify(normalizePreset(value, true))) pending.set(name, value);
      }
      if (!pending.size) { showToast('저장할 변경사항이 없습니다.'); return; }
      const failures = [];
      for (const [name, value] of pending) {
        if (value === null) continue;
        try { await saveOne(name, value); }
        catch (error) { failures.push(`${name}: ${error.message}`); if (error.code === 'CONFLICT') cache.delete(name); }
      }
      // 이름 변경은 새 프리셋의 저장이 성공한 뒤 기존 경로를 지운다.
      if (!failures.length) for (const [name, value] of pending) {
        if (value !== null) continue;
        try { await saveOne(name, value); }
        catch (error) { failures.push(`${name}: ${error.message}`); if (error.code === 'CONFLICT') cache.delete(name); }
      }
      if (failures.length) throw new Error(failures.join('\n'));
      showToast('저장했습니다.');
    });
  }

  async function run(action) {
    if (busy) return false;
    busy = true; ui.setAttribute('aria-busy', 'true'); setControls();
    try { await action(); return true; }
    catch (error) { showToast(error.message, true); return false; }
    finally { busy = false; ui.removeAttribute('aria-busy'); render(); }
  }

  function setControls() {
    ui.querySelectorAll('button, input').forEach(control => { control.disabled = busy || !ready; });
    $('close').disabled = false; $('close-detail').disabled = false;
    $('subcategory').disabled = busy || !ready || tab === 0;
  }

  function showToast(message, error = false) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    $('toast').classList.toggle('is-error', error); $('toast').setAttribute('role', error ? 'alert' : 'status');
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 7000 : 2500);
  }

  function showDetail(name, x, y) {
    if (drag || !ready || ui.hidden) return;
    const item = itemByName.get(name); if (!item) return;
    activeDetail = name;
    $('detail-art').replaceChildren(art(item)); $('detail-name').textContent = name;
    $('detail-grade').textContent = item.grade; $('detail-grade').className = `grade-text-${catalog.grades.indexOf(item.grade) + 1}`;
    $('detail-category').textContent = `${item.category} · ${item.subcategory}`;
    $('detail-description').textContent = item.description; renderDetailStatus(name);
    $('detail').hidden = false;
    const detail = $('detail'), box = detail.getBoundingClientRect(), viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft ?? 0, topEdge = viewport?.offsetTop ?? 0;
    const right = leftEdge + (viewport?.width ?? window.innerWidth), bottom = topEdge + (viewport?.height ?? window.innerHeight);
    let left = x + 14; if (left + box.width > right - 10) left = x - box.width - 14;
    detail.style.left = `${Math.max(leftEdge + 10, Math.min(left, right - box.width - 10))}px`;
    detail.style.top = `${Math.max(topEdge + 10, Math.min(y + 10, bottom - box.height - 10))}px`;
    detail.style.maxHeight = `${Math.max(60, bottom - topEdge - 20)}px`;
  }

  function renderDetailStatus(name) {
    $('detail-status').replaceChildren();
    const value = normalizePreset(valueFor());
    for (const [key, drawing, title] of [['bookmark', 'star', '즐겨찾기'], ['inventory', 'bag', '소지중']]) {
      if (!value[key].includes(name)) continue;
      const label = element('span'); label.append(icon(drawing), document.createTextNode(title)); $('detail-status').append(label);
    }
  }

  function hideDetail() { clearTimeout(hoverTimer); $('detail').hidden = true; activeDetail = null; }
  function hideMenus() {
    $('subcategory-menu').hidden = true; $('preset-menu').hidden = true;
    $('preset-toggle').setAttribute('aria-expanded', 'false'); $('subcategory').setAttribute('aria-expanded', 'false');
  }

  function showNotice(title, message, detail, actions) {
    hideMenus(); hideDetail();
    const panel = element('section', 'item-notice-panel'); panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-label', title);
    panel.append(element('h2', 'warning-heading', title), element('p', '', message));
    if (detail) panel.append(element('p', 'notice-detail', detail));
    const footer = element('footer');
    for (const [label, className, action] of actions) {
      const button = element('button', `button ${className}`, label); button.type = 'button';
      button.addEventListener('click', () => { $('notice').hidden = true; action(); }); footer.append(button);
    }
    panel.append(footer); $('notice').replaceChildren(panel); $('notice').hidden = false;
  }

  function requestClose() {
    if (!drafts.size) { closeBook(); return; }
    const actions = [['돌아가기', '', () => {}], ['저장하지 않고 닫기', 'danger', closeBook]];
    if (!busy && ready) actions.push(['저장 후 닫기', 'primary', () => requestSave(true)]);
    showNotice('저장하지 않은 변경사항', '프리셋과 즐겨찾기·소지중 변경사항이 저장되지 않았습니다.', '', actions);
  }

  function closeBook() {
    drag = null; hideMenus(); hideDetail(); $('notice').hidden = true; $('toast').hidden = true;
    ui.hidden = true; events?.abort(); restoreFocus();
  }

  function restoreFocus() {
    if (returnFocus?.isConnected && ui.contains(document.activeElement)) returnFocus.focus({ preventScroll: true });
  }

  function fitVisibleViewport() {
    if (!ui || ui.hidden) return;
    const viewport = window.visualViewport, top = viewport?.offsetTop ?? 0, left = viewport?.offsetLeft ?? 0;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    const narrow = window.innerWidth <= 640, available = Math.max(0, height - 16);
    ui.style.maxWidth = `${Math.max(0, width - 16)}px`; ui.style.maxHeight = `${available}px`;
    ui.style.minHeight = `${Math.min(240, available)}px`;
    const currentHeight = Number.parseFloat(ui.style.height) || Math.min(narrow ? 480 : 715, Math.max(240, height - (narrow ? 165 : 98)));
    ui.style.height = `${Math.min(currentHeight, available)}px`;
    const box = ui.getBoundingClientRect();
    const x = Number.parseFloat(ui.style.left), y = Number.parseFloat(ui.style.top);
    ui.style.left = `${Math.max(left + 8, Math.min(Number.isFinite(x) ? x : left + width - box.width - (narrow ? 8 : 24), left + width - box.width - 8))}px`;
    ui.style.top = `${Math.max(top + 8, Math.min(Number.isFinite(y) ? y : top + (narrow ? 12 : 74), top + height - box.height - 8))}px`;
    hideDetail();
  }

  function setupDrag() {
    const header = $('drag-handle');
    header.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const box = ui.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - box.left, y: event.clientY - box.top };
      header.setPointerCapture(event.pointerId); hideDetail(); hideMenus(); event.preventDefault();
    });
    header.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const viewport = window.visualViewport, box = ui.getBoundingClientRect();
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const right = left + (viewport?.width ?? window.innerWidth), bottom = top + (viewport?.height ?? window.innerHeight);
      ui.style.left = `${Math.max(left, Math.min(event.clientX - drag.x, right - box.width))}px`;
      ui.style.top = `${Math.max(top, Math.min(event.clientY - drag.y, bottom - 30))}px`;
    });
    const finish = event => { if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId); drag = null; };
    header.addEventListener('pointerup', finish); header.addEventListener('pointercancel', finish);
  }

  function clearReadCache() {
    cache.clear(); ready = false;
    if (ui && !ui.hidden) closeBook();
  }
  if (window.navigation) window.navigation.addEventListener('navigatesuccess', clearReadCache);
  else window.addEventListener('popstate', clearReadCache);
  window.addEventListener('pagehide', clearReadCache);
})();

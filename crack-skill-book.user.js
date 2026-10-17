// ==UserScript==
// @name         크랙 스킬 도감
// @namespace    crack-commandline
// @version      1.0.0.0
// @description  !스킬로 스킬을 보고 프리셋별 즐겨찾기를 관리합니다. (version 관리방식: 데이터구조버전.크랙UI변경.기능추가및수정.버그수정)
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @noframes
// @require      https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-core.js
// @resource     ccCommon https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-common.css
// @resource     skillBook https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main//data/skill.json
// @resource     skillIcons https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main//images/skill/icons.svg
// @grant        unsafeWindow
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @connect      identitytoolkit.googleapis.com
// @connect      securetoken.googleapis.com
// @connect      firebaseio.com
// @connect      firebasedatabase.app
// ==/UserScript==

/*
 * 저장 스키마 v1 — 프리셋 이름은 경로의 키, 배열 순서는 즐겨찾기 표시 순서.
 * crack-skill-book/
 * └─ {프리셋 이름}: ["스킬명", "스킬명", ...]
 * 빈 프리셋은 페이지 메모리에만 유지한다. 분류·수준·설명·아이콘은 DB에 저장하지 않는다.
 */
(() => {
  'use strict';

  const core = unsafeWindow.CrackCommandline;
  const book = core.register({ id: 'crack-skill-book', label: '스킬', useDatabse: true, lambda: openBook });
  const SKILL_CSS = `
/* 스킬 도감: 채팅을 가리지 않는 비모달 창. 보기 방식과 무관하게 창 크기는 같다. */
.cc-ui.ui-window.cc-skill-window {
  position: fixed; left: 50%; top: 44%; z-index: 2147483600; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; width: min(760px, calc(100vw - 24px));
  height: min(510px, calc(100dvh - 170px)); min-height: 220px; max-height: calc(100dvh - 24px);
  padding: 4px; border-radius: 4px; --inset: 10px;
}
.cc-ui .cc-skill-sprite { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
.cc-ui .cc-skill-header {
  display: flex; align-items: center; justify-content: space-between; flex: 0 0 31px;
  min-height: 31px; padding: 0 5px 0 10px; border-bottom: 1px solid #a08c624d;
  background: linear-gradient(100deg, #aa94662a, #10182022 60%, #aa946612);
  box-shadow: inset 0 1px #f6e0b30d, 0 1px #060a0e9c;
}
.cc-ui h1.cc-skill-title {
  display: flex; align-items: center; gap: 7px; font: 700 13px/1.2 var(--heading-face); letter-spacing: .08em;
}
.cc-ui .cc-skill-dirty {
  width: 6px; height: 6px; border-radius: 50%; background: #eb7066;
  box-shadow: 0 0 5px #e1595560, inset 0 1px #ffc2a770;
}
.cc-ui .cc-skill-header-actions { display: flex; gap: 2px; }

.cc-ui .cc-skill-header-actions .icon-button { width: 27px; height: 25px; padding: 4px; border-color: transparent; background: none; box-shadow: none; }
.cc-ui .cc-skill-header-actions .icon-button:hover { border-color: #baa16d70; background: #ddc39410; }
.cc-ui .cc-skill-header-actions [data-action=save] { color: #d9c18d; }
.cc-ui .cc-skill-toolbar {
  display: grid; grid-template-columns: 36px minmax(0, 1fr) 32px 32px; align-items: center; gap: 5px;
  padding: 7px 8px; flex-shrink: 0; border-bottom: 1px solid #69706c70;
}
.cc-ui .cc-skill-toolbar > [data-action=categories] { width: 36px; height: 34px; }
.cc-ui .cc-skill-toolbar > [data-action=categories] svg { width: 25px; height: 25px; }

.cc-ui .cc-skill-status {
  position: absolute; bottom: 52px; z-index: 14; width: max-content; max-width: calc(100% - 24px);
  max-height: 90px; overflow: auto; font-size: 11px; white-space: pre-line; overflow-wrap: anywhere;
}
.cc-ui .cc-skill-status.is-error { color: var(--red); border-color: #bb8371; background: linear-gradient(#4b3531, #2d2324); pointer-events: auto; }
.cc-ui .cc-skill-detail { width: min(300px, calc(100% - 16px)); max-height: calc(100% - 16px); overflow: auto; padding: 11px 13px; }
.cc-ui .cc-skill-detail-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.cc-ui .cc-skill-detail-heading strong { color: var(--accent); font-size: 13px; overflow-wrap: anywhere; }
.cc-ui .cc-skill-detail p { margin: 8px 0 0; color: var(--text); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.cc-ui .cc-skill-list {
  flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; margin: 0 4px;
  scrollbar-width: thin; scrollbar-color: #9b875977 #111920; background: #11192177; box-shadow: inset 0 2px 5px #0004;
}
.cc-ui .cc-skill-row {
  display: grid; grid-template-columns: 42px minmax(100px, 1.1fr) 66px minmax(130px, 1.9fr) 28px;
  align-items: center; gap: 7px; min-height: 49px; padding: 5px 7px; border-bottom: 1px solid #56606948;
  background: linear-gradient(90deg, #46515c12, #222e360a); box-shadow: inset 0 1px #b8c7c403; cursor: pointer;
  content-visibility: auto; contain-intrinsic-size: auto 49px;
}
.cc-ui .cc-skill-row:nth-child(2n) { background: #7e8c9910; }
.cc-ui .cc-skill-row:hover { background: #c4ae7f12; }
.cc-ui .cc-skill-name { min-width: 0; color: #e9e0cc; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px #000; }
.cc-ui .cc-skill-level { font: 10px/1.3 "Malgun Gothic", sans-serif; color: #c9b78e; white-space: nowrap; }
.cc-ui .cc-skill-description { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #a6aeac; font-size: 11px; }
.cc-ui .cc-skill-art {
  position: relative; display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--skill-color), #e5d4ae 35%); border-radius: 2px;
  color: #f5e9cf; background:
    radial-gradient(ellipse at 35% 15%, #fff2, transparent 70%),
    linear-gradient(145deg, color-mix(in srgb, var(--skill-color), #131a20 15%), color-mix(in srgb, var(--skill-color), #080e16 70%));
  box-shadow: inset 0 0 0 2px #0b101b7d, inset 0 1px #ffeac23d, 0 2px 4px #0007;
}
.cc-ui .cc-skill-art > svg { width: 27px; height: 27px; stroke-width: 2; filter: drop-shadow(0 1px 1px #000b); }
.cc-ui .cc-skill-category-badge {
  position: absolute; left: -3px; bottom: -3px; display: grid; place-items: center; width: 15px; height: 15px;
  border: 1px solid #c5ab79; border-radius: 1px; background: linear-gradient(#4a4a42, #1a2429); color: #eddfba;
  box-shadow: inset 0 0 0 1px #0a111ba6, 0 1px 2px #0008;
}
.cc-ui .cc-skill-category-badge svg { width: 11px; height: 11px; stroke-width: 2.5; }
.cc-ui .cc-skill-favorite { width: 27px; height: 29px; padding: 4px; background: none; box-shadow: none; border-color: transparent; color: #7c858c; }
.cc-ui .cc-skill-favorite svg { width: 19px; height: 19px; }
.cc-ui .cc-skill-favorite[aria-pressed=true] { color: #e8c16d; }
.cc-ui .cc-skill-favorite[aria-pressed=true] svg { fill: #c9a35244; filter: drop-shadow(0 0 3px #d4b66c29); }
.cc-ui .cc-skill-list[data-view=grid] {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); grid-auto-rows: max-content; align-content: start; gap: 4px; padding: 6px;
}
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-row {
  position: relative; grid-template-columns: minmax(0, 1fr) 21px; grid-template-rows: 64px 14px 22px;
  justify-items: center; gap: 0; padding: 5px 4px 3px; min-height: 109px; border: 1px solid #736b5742; border-radius: 2px;
  background: linear-gradient(#74818a10, #10182033); contain-intrinsic-size: auto 109px;
}
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-art { width: 58px; height: 58px; grid-row: 1; grid-column: 1 / -1; }
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-art > svg { width: 45px; height: 45px; stroke-width: 1.65; }
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-category-badge { width: 19px; height: 19px; }
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-category-badge svg { width: 14px; height: 14px; }
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-level { grid-row: 2; grid-column: 1 / -1; font-size: 9px; }
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-name { grid-row: 3; grid-column: 1; width: 100%; text-align: center; font-size: 10px; }
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-favorite { grid-row: 3; grid-column: 2; width: 21px; height: 23px; padding: 2px; }
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-favorite svg { width: 16px; height: 16px; }
.cc-ui .cc-skill-list[data-view=grid] .cc-skill-description { display: none; }
.cc-ui .cc-skill-list[data-reorder=true] .cc-skill-row { cursor: grab; user-select: none; -webkit-user-select: none; }
.cc-ui .cc-skill-list.is-reordering .cc-skill-row { content-visibility: visible; }
.cc-ui .cc-skill-row.is-dragging { outline: 1px solid #e6c68c; outline-offset: -1px; background: #c6a96b26 !important; box-shadow: inset 3px 0 #d2b478; cursor: grabbing; }
.cc-ui .cc-skill-empty { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 135px; color: var(--dim); font-size: 12px; }
.cc-ui .cc-skill-empty svg { width: 25px; height: 25px; color: #a68d5e80; }
.cc-ui .cc-skill-footer { display: flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 7px 8px; border-top: 1px solid #a08c624d; box-shadow: inset 0 1px #091017aa; }

.cc-ui .cc-skill-category-menu { top: 79px; left: 12px; width: min(420px, calc(100% - 24px)); }
.cc-ui .cc-skill-category-line { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); padding: 4px 0; gap: 3px; border-bottom: 1px solid #a18c5f33; }
.cc-ui .cc-skill-category-line:last-child { border: 0; }
.cc-ui .cc-skill-category-option { display: flex; align-items: center; flex-direction: column; gap: 3px; padding: 6px 2px; min-width: 0; border: 1px solid transparent; border-radius: 2px; color: #c4bba6; }
.cc-ui .cc-skill-category-option > svg { width: 25px; height: 25px; filter: drop-shadow(0 1px 1px #000); }
.cc-ui .cc-skill-category-option > span { font-size: 10px; white-space: nowrap; }
.cc-ui .cc-skill-category-option:hover { background: #ddc39413; }
.cc-ui .cc-skill-category-option[aria-pressed=true] { border-color: #b19a6a88; color: #f3d296; background: linear-gradient(#b3996345, #a48c4c18); box-shadow: inset 0 1px #ffe7b122; }
.cc-ui .cc-skill-help { top: 79px; right: 12px; bottom: 51px; width: min(520px, calc(100% - 24px)); display: flex; flex-direction: column; }
.cc-ui .popover-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 2px 6px 6px; font-size: 12px; color: var(--accent); }
.cc-ui .popover-heading .icon-button { width: 24px; height: 24px; }
.cc-ui .cc-skill-help-text { flex: 1; min-height: 0; width: 100%; resize: none; border: 1px solid #606b6d; padding: 9px; background: #10181f; color: #c5c7be; font: 11px/1.8 "Malgun Gothic", sans-serif; scrollbar-width: thin; box-shadow: var(--recess); }
.cc-ui .cc-skill-preset-menu { left: 12px; right: 49px; bottom: 49px; max-height: calc(100% - 95px); overflow: auto; scrollbar-width: thin; }
.cc-ui .cc-skill-preset-row { display: flex; align-items: center; gap: 3px; min-height: 37px; border-bottom: 1px solid #8d805b33; }
.cc-ui .cc-skill-preset-row:last-child { border: 0; }
.cc-ui .cc-skill-preset-choice { flex: 1; min-width: 0; padding: 7px 8px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; border-left: 2px solid transparent; }
.cc-ui .cc-skill-preset-choice[aria-pressed=true] { color: #f3d296; border-color: #d4b17a; background: linear-gradient(90deg, #baa16b26, transparent); }
.cc-ui .cc-skill-preset-row > .icon-button { width: 27px; height: 27px; background: none; box-shadow: none; border-color: transparent; }
.cc-ui .cc-skill-preset-row > [data-remove] { color: #cf9986; }
.cc-ui .cc-skill-preset-edit { display: flex; align-items: center; gap: 4px; width: 100%; padding: 3px; }
.cc-ui .cc-skill-preset-edit .text-input { flex: 1; min-width: 0; height: 30px; font-size: 12px; }
.cc-ui .cc-skill-delete-label { flex: 1; padding: 4px 7px; color: var(--red); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-ui .cc-skill-notice-layer { position: absolute; z-index: 12; inset: 35px 4px 4px; display: grid; place-items: center; padding: 14px; background: #0b1119b3; }
.cc-ui .cc-skill-notice { width: min(390px, 100%); max-height: 100%; overflow: auto; padding: 16px; border: 1px solid #b89a65; border-radius: 3px; background: linear-gradient(135deg, #333b3f, #1a232b); box-shadow: inset 0 0 0 3px #0b141c99, 0 12px 32px #0009; }
.cc-ui .cc-skill-notice-title { display: flex; align-items: center; gap: 8px; color: var(--amber); font-size: 13px; }
.cc-ui .cc-skill-notice p { margin: 12px 0 8px; font-size: 12px; line-height: 1.8; color: var(--text); }
.cc-ui .cc-skill-empty-names { max-height: 65px; overflow: auto; padding: 7px; border-left: 2px solid #9c8055; background: #0e171e77; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.cc-ui .cc-skill-notice-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 13px; }
.cc-ui .cc-skill-notice-actions .button { min-height: 30px; min-width: 65px; padding: 5px 10px; font-size: 11px; }

@media (max-width: 540px) {
  .cc-ui.ui-window.cc-skill-window { top: 42%; height: min(510px, calc(100dvh - 165px)); }
  .cc-ui .cc-skill-row { grid-template-columns: 34px minmax(65px, 1fr) 49px minmax(50px, 1.2fr) 23px; gap: 4px; padding: 4px 5px; min-height: 44px; }
  .cc-ui .cc-skill-art { width: 29px; height: 29px; }
  .cc-ui .cc-skill-art > svg { width: 22px; height: 22px; }
  .cc-ui .cc-skill-name { font-size: 11px; }
  .cc-ui .cc-skill-level { font-size: 9px; }
  .cc-ui .cc-skill-description { font-size: 10px; }
  .cc-ui .cc-skill-favorite { width: 23px; }
  .cc-ui .cc-skill-list[data-view=grid] { gap: 3px; padding: 4px; }
  .cc-ui .cc-skill-list[data-view=grid] .cc-skill-row { grid-template-rows: 47px 12px 20px; grid-template-columns: minmax(0, 1fr) 17px; min-height: 90px; padding: 4px 2px 2px; }
  .cc-ui .cc-skill-list[data-view=grid] .cc-skill-art { width: 42px; height: 42px; }
  .cc-ui .cc-skill-list[data-view=grid] .cc-skill-art > svg { width: 33px; height: 33px; }
  .cc-ui .cc-skill-list[data-view=grid] .cc-skill-name { font-size: 9px; }
  .cc-ui .cc-skill-list[data-view=grid] .cc-skill-favorite { width: 17px; padding: 1px; }
  .cc-ui .cc-skill-list[data-view=grid] .cc-skill-favorite svg { width: 14px; height: 14px; }
  .cc-ui .cc-skill-list[data-view=grid] .cc-skill-category-badge { width: 15px; height: 15px; }
  .cc-ui .cc-skill-list[data-view=grid] .cc-skill-category-badge svg { width: 11px; height: 11px; }
}
`;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // cache는 읽기/저장에 성공한 원본, drafts는 사용자 편집본(null은 삭제 예약).
  // 로드와 오류 처리에서는 drafts를 변경하지 않는다.
  const cache = new Map();
  const drafts = new Map();
  const persistedNames = new Set();
  const createdNames = new Set();
  const names = new Set();
  const skillsByName = new Map();
  const categoriesByName = new Map();
  let catalog;
  let allSkills;
  let ui;
  let selectedPreset;
  let selectedCategory;
  let selectedSubcategory = '';
  let view = 'list';
  let busy = false;
  let ready = false;
  let events;
  let returnFocus;
  let drag;
  let suppressSkillClick = false;
  let statusTimer;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#cc-skill-${name}`);
    svg.append(use);
    return svg;
  }

  function iconButton(label, glyph, action) {
    const button = element('button', 'icon-button framed');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(icon(glyph));
    if (action) button.dataset.action = action;
    return button;
  }

  function readCatalog() {
    if (catalog) return;
    catalog = JSON.parse(GM_getResourceText('skillBook'));
    allSkills = [];
    for (const category of catalog.categories) {
      categoriesByName.set(category.name, category);
      for (const subcategory of category.subcategories) {
        for (const skill of subcategory.skills) {
          if (skillsByName.has(skill.name)) throw new Error(`중복된 스킬명: ${skill.name}`);
          const entry = { ...skill, category, subcategory };
          skillsByName.set(skill.name, entry);
          allSkills.push(entry);
        }
      }
    }
    selectedCategory = catalog.filters[1].name;
  }

  function makeWindow() {
    const root = element('section', 'cc-ui ui-window cc-skill-window');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'false');
    root.setAttribute('aria-label', catalog.title);
    root.hidden = true;

    const stylesheet = element('style');
    stylesheet.textContent = SKILL_CSS;
    const sprite = document.createElementNS(SVG_NS, 'svg');
    sprite.classList.add('cc-skill-sprite');
    sprite.setAttribute('aria-hidden', 'true');
    // 동봉한 SVG 정의를 한 번만 넣어 스킬별 이미지 요청을 만들지 않는다.
    const parsed = new window.DOMParser().parseFromString(GM_getResourceText('skillIcons'), 'image/svg+xml');
    const definitions = parsed.querySelector('defs');
    if (!definitions || parsed.querySelector('parsererror')) throw new Error('스킬 아이콘 파일을 읽을 수 없습니다.');
    sprite.append(document.importNode(definitions, true));

    const header = element('header', 'cc-skill-header');
    const title = element('h1', 'cc-skill-title', catalog.title);
    const dirty = element('span', 'cc-skill-dirty');
    dirty.hidden = true;
    dirty.title = '저장하지 않은 수정사항';
    dirty.setAttribute('role', 'status');
    dirty.setAttribute('aria-label', '저장하지 않은 수정사항');
    title.append(dirty);
    const actions = element('div', 'cc-skill-header-actions');
    const save = iconButton('저장', 'save', 'save');
    const close = iconButton('닫기', 'close', 'close');
    actions.append(save, close);
    header.append(title, actions);

    const toolbar = element('div', 'cc-skill-toolbar');
    const categoryButton = iconButton('대분류 선택', 'star', 'categories');
    categoryButton.setAttribute('aria-haspopup', 'dialog');
    categoryButton.setAttribute('aria-expanded', 'false');
    const subcategory = element('select', 'select-input cc-skill-subcategory');
    subcategory.setAttribute('aria-label', '소분류');
    const viewButton = iconButton('썸네일로 보기', 'grid', 'view');
    const helpButton = iconButton('수준표', 'question', 'help');
    helpButton.setAttribute('aria-haspopup', 'dialog');
    helpButton.setAttribute('aria-expanded', 'false');
    toolbar.append(categoryButton, subcategory, viewButton, helpButton);

    const categoryMenu = element('div', 'popover cc-skill-category-menu');
    categoryMenu.hidden = true;
    categoryMenu.setAttribute('role', 'dialog');
    categoryMenu.setAttribute('aria-label', '대분류 선택');
    for (const rowNames of [catalog.filters.map(filter => filter.name), ...catalog.categoryRows]) {
      const row = element('div', 'cc-skill-category-line');
      for (const name of rowNames) {
        const category = categoriesByName.get(name) || catalog.filters.find(filter => filter.name === name);
        const button = element('button', 'cc-skill-category-option');
        button.type = 'button';
        button.dataset.category = name;
        button.append(icon(category.icon), element('span', '', name));
        row.append(button);
      }
      categoryMenu.append(row);
    }

    const help = element('div', 'popover cc-skill-help');
    help.hidden = true;
    help.setAttribute('role', 'dialog');
    help.setAttribute('aria-label', '수준표');
    const helpTitle = element('div', 'popover-heading', '수준');
    helpTitle.append(iconButton('설명 닫기', 'close', 'dismiss'));
    const helpText = element('textarea', 'cc-skill-help-text');
    helpText.readOnly = true;
    helpText.setAttribute('aria-label', '계열별 수준 — 선택하여 복사');
    helpText.value = catalog.levelGuide;
    help.append(helpTitle, helpText);

    const status = element('div', 'cc-ui toast cc-skill-status');
    status.setAttribute('role', 'status');
    status.hidden = true;
    const list = element('div', 'cc-skill-list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', '스킬 목록');

    const footer = element('footer', 'cc-skill-footer');
    const presetButton = element('button', 'combobox-trigger cc-skill-preset-button');
    presetButton.type = 'button';
    presetButton.dataset.action = 'presets';
    presetButton.setAttribute('aria-label', '프리셋 선택');
    presetButton.setAttribute('aria-haspopup', 'dialog');
    presetButton.setAttribute('aria-expanded', 'false');
    const presetLabel = element('span');
    presetButton.append(presetLabel, icon('chevron'));
    footer.append(presetButton, iconButton('프리셋 추가', 'plus', 'add'));
    const presetMenu = element('div', 'popover cc-skill-preset-menu');
    presetMenu.hidden = true;
    presetMenu.setAttribute('role', 'dialog');
    presetMenu.setAttribute('aria-label', '프리셋 선택 및 편집');

    const notice = element('div', 'cc-skill-notice-layer');
    notice.hidden = true;
    const detail = element('div', 'popover cc-skill-detail');
    detail.hidden = true;
    detail.setAttribute('role', 'dialog');
    detail.setAttribute('aria-modal', 'false');
    detail.setAttribute('aria-label', '스킬 정보');
    root.append(stylesheet, sprite, header, toolbar, status, list, footer, categoryMenu, help, presetMenu, detail, notice);
    document.body.append(root);
    ui = { root, dirty, save, close, categoryButton, subcategory, viewButton, helpButton,
      categoryMenu, help, status, list, presetButton, presetLabel, presetMenu, detail, notice };
    root.addEventListener('click', handleClick);
    root.addEventListener('pointerdown', handlePointerDown);
    root.addEventListener('pointermove', handlePointerMove);
    root.addEventListener('pointerup', finishDrag);
    root.addEventListener('pointercancel', cancelDrag);
    root.addEventListener('touchmove', event => { if (drag?.active) event.preventDefault(); }, { passive: false });
    root.addEventListener('contextmenu', event => { if (drag) event.preventDefault(); });
    root.addEventListener('keydown', handleKeyDown);
    list.addEventListener('scroll', () => { detail.hidden = true; }, { passive: true });
    subcategory.addEventListener('change', () => {
      selectedSubcategory = subcategory.value;
      renderSkills();
      restoreFocus();
    });
  }

  // 스킬창을 열 때만 이름 목록과 현재 프리셋을 읽는다. 다른 프리셋 내용은 읽지 않는다.
  async function openBook() {
    if (ui && !ui.root.hidden) return;
    readCatalog();
    if (!ui) makeWindow();
    if (typeof book.keys !== 'function') throw new Error('스킬 도감에는 keys()를 제공하는 core가 필요합니다.');
    returnFocus = document.activeElement;
    ui.root.hidden = false;
    events = new window.AbortController();
    document.addEventListener('pointerdown', event => {
      if (!ui.root.contains(event.target)) dismissMenus();
    }, { signal: events.signal });
    renderToolbar();
    ready = false;
    await run(async () => {
      const stored = await book.keys();
      persistedNames.clear();
      names.clear();
      for (const name of stored) {
        if (!createdNames.has(name) || !drafts.has(name)) {
          persistedNames.add(name);
          createdNames.delete(name);
        }
        names.add(name);
      }
      for (const name of createdNames) names.add(name);
      for (const [name, value] of drafts) {
        if (value === null) names.delete(name);
        else names.add(name);
      }
      ensurePreset();
      if (!createdNames.has(selectedPreset) || cache.has(selectedPreset)) await loadPreset(selectedPreset);
      ready = true;
    });
  }

  function ensurePreset() {
    if (!names.size) {
      names.add(catalog.defaultPreset);
      createdNames.add(catalog.defaultPreset);
    }
    if (!names.has(selectedPreset)) selectedPreset = names.values().next().value;
  }

  async function loadPreset(name) {
    const value = await book.load(name);
    if (value !== null && (!Array.isArray(value) || value.some(skill => typeof skill !== 'string'))) {
      throw new Error(`“${name}”의 저장 형식이 스킬명 배열이 아닙니다.`);
    }
    cache.set(name, value === null ? null : [...value]);
    return value;
  }

  function closeBook() {
    cancelDrag();
    dismissMenus();
    ui.notice.hidden = true;
    setStatus('');
    ui.root.hidden = true;
    events?.abort();
    if (ui.root.contains(document.activeElement)) restoreFocus();
  }

  function restoreFocus() {
    if (returnFocus?.isConnected && !ui.root.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  }

  function selectedNames(name = selectedPreset) {
    const value = drafts.has(name) ? drafts.get(name) : cache.get(name);
    return Array.isArray(value) ? value : [];
  }

  function knownNames(value) {
    return [...new Set(value.filter(name => skillsByName.has(name)))];
  }

  // 편집 시에만 draft를 만든다. 캐시와 같아진 경우에는 미저장 변경이 없으므로 제거한다.
  function editPreset(name, value) {
    if (value !== null && JSON.stringify(value) === JSON.stringify(cache.get(name) ?? [])) drafts.delete(name);
    else drafts.set(name, value === null ? null : [...value]);
    renderDirty();
    setStatus('');
  }

  function renderDirty() {
    ui.dirty.hidden = drafts.size === 0;
    if (drafts.size) window.addEventListener('beforeunload', warnUnsaved);
    else window.removeEventListener('beforeunload', warnUnsaved);
  }

  // 새로고침·페이지 이탈 경고는 브라우저가 제공하는 기본 확인창을 사용한다.
  function warnUnsaved(event) {
    if (!drafts.size) return;
    event.preventDefault();
    event.returnValue = '';
  }

  function requestClose() {
    if (!drafts.size) { closeBook(); return; }
    dismissMenus();
    showNotice({ title: '저장하지 않은 변경사항',
      message: '변경사항이 저장되지 않았습니다. 저장하려면 취소한 뒤 상단 저장 버튼을 눌러 주세요.',
      confirmLabel: '닫기', onConfirm: closeBook });
  }

  function setStatus(message, error = false) {
    clearTimeout(statusTimer);
    ui.status.textContent = message;
    ui.status.hidden = !message;
    ui.status.classList.toggle('show', !!message);
    ui.status.classList.toggle('is-error', error);
    ui.status.setAttribute('role', error ? 'alert' : 'status');
    if (message) statusTimer = setTimeout(() => {
      ui.status.hidden = true;
      ui.status.classList.remove('show');
    }, error ? 7000 : 2500);
  }

  function renderToolbar() {
    const category = categoriesByName.get(selectedCategory);
    const selected = category || catalog.filters.find(filter => filter.name === selectedCategory);
    ui.categoryButton.replaceChildren(icon(selected.icon));
    ui.categoryButton.title = selectedCategory;
    ui.categoryButton.setAttribute('aria-label', `대분류: ${selectedCategory}`);
    ui.subcategory.replaceChildren();
    const all = element('option', '', '전체');
    all.value = '';
    ui.subcategory.append(all);
    if (category) for (const subcategory of category.subcategories) {
      const option = element('option', '', subcategory.name);
      option.value = subcategory.name;
      ui.subcategory.append(option);
    }
    ui.subcategory.value = selectedSubcategory;
    ui.subcategory.disabled = busy || !category;
    for (const button of ui.categoryMenu.querySelectorAll('[data-category]')) {
      button.setAttribute('aria-pressed', String(button.dataset.category === selectedCategory));
    }
    ui.viewButton.replaceChildren(icon(view === 'list' ? 'grid' : 'list'));
    ui.viewButton.title = view === 'list' ? '썸네일로 보기' : '목록으로 보기';
    ui.viewButton.setAttribute('aria-label', ui.viewButton.title);
  }

  function skillIcon(skill) {
    const tile = element('span', 'cc-skill-art');
    tile.style.setProperty('--skill-color', skill.subcategory.color);
    tile.append(icon(skill.icon));
    const badge = element('span', 'cc-skill-category-badge');
    badge.title = skill.category.name;
    badge.append(icon(skill.category.icon));
    tile.append(badge);
    return tile;
  }

  function showSkillDetail(name, clientX, clientY) {
    const skill = skillsByName.get(name);
    if (!skill) return;
    dismissMenus();
    const heading = element('div', 'cc-skill-detail-heading');
    heading.append(element('strong', '', skill.name), element('span', 'cc-skill-level', skill.level));
    ui.detail.replaceChildren(heading, element('p', '', skill.description));
    ui.detail.hidden = false;
    const bounds = ui.root.getBoundingClientRect();
    const size = ui.detail.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    ui.detail.style.left = `${Math.max(8, Math.min(x + 10, ui.root.clientWidth - size.width - 8))}px`;
    const top = y + 10 + size.height <= ui.root.clientHeight - 8 ? y + 10 : y - size.height - 10;
    ui.detail.style.top = `${Math.max(8, top)}px`;
  }

  function renderSkills() {
    const favorites = knownNames(selectedNames());
    const favoriteSet = new Set(favorites);
    let skills;
    if (selectedCategory === catalog.filters[1].name) skills = favorites.map(name => skillsByName.get(name));
    else if (selectedCategory === catalog.filters[0].name) skills = allSkills;
    else skills = allSkills.filter(skill => skill.category.name === selectedCategory &&
      (!selectedSubcategory || skill.subcategory.name === selectedSubcategory));
    ui.list.dataset.view = view;
    ui.list.dataset.reorder = String(selectedCategory === catalog.filters[1].name);
    const fragment = document.createDocumentFragment();
    for (const skill of skills) {
      const row = element('div', 'cc-skill-row');
      row.setAttribute('role', 'listitem');
      row.dataset.skillName = skill.name;
      const name = element('span', 'cc-skill-name', skill.name);
      const level = element('span', 'cc-skill-level', skill.level);
      const description = element('span', 'cc-skill-description', skill.description);
      const favorite = iconButton(`${skill.name} 즐겨찾기`, 'star');
      favorite.classList.remove('framed');
      favorite.classList.add('cc-skill-favorite');
      favorite.dataset.favorite = skill.name;
      favorite.setAttribute('aria-pressed', String(favoriteSet.has(skill.name)));
      favorite.disabled = busy || !ready;
      row.append(skillIcon(skill), name, level, description, favorite);
      fragment.append(row);
    }
    if (!skills.length) {
      const empty = element('div', 'cc-skill-empty');
      empty.append(icon(selectedCategory === catalog.filters[1].name ? 'star' : 'book'),
        element('span', '', selectedCategory === catalog.filters[1].name ? '즐겨찾기를 선택해 주세요.' : '표시할 스킬이 없습니다.'));
      fragment.append(empty);
    }
    ui.list.replaceChildren(fragment);
    ui.presetLabel.textContent = selectedPreset || catalog.defaultPreset;
    ui.presetButton.title = selectedPreset || catalog.defaultPreset;
    renderDirty();
  }

  function renderPresetMenu() {
    ui.presetMenu.replaceChildren();
    for (const name of names) {
      const row = element('div', 'cc-skill-preset-row');
      row.dataset.presetRow = name;
      const choose = element('button', 'cc-skill-preset-choice', name);
      choose.type = 'button';
      choose.dataset.preset = name;
      choose.setAttribute('aria-pressed', String(name === selectedPreset));
      const rename = iconButton(`${name} 이름 변경`, 'edit');
      rename.dataset.rename = name;
      const remove = iconButton(`${name} 삭제`, 'trash');
      remove.dataset.remove = name;
      row.append(choose, rename, remove);
      ui.presetMenu.append(row);
    }
  }

  function dismissMenus() {
    if (!ui) return;
    ui.detail.hidden = true;
    for (const [menu, trigger] of [[ui.categoryMenu, ui.categoryButton], [ui.help, ui.helpButton], [ui.presetMenu, ui.presetButton]]) {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleMenu(menu, trigger) {
    const show = menu.hidden;
    dismissMenus();
    menu.hidden = !show;
    trigger.setAttribute('aria-expanded', String(show));
  }

  async function choosePreset(name) {
    dismissMenus();
    return run(async () => {
      if (!createdNames.has(name) || cache.has(name)) await loadPreset(name);
      selectedPreset = name;
    });
  }

  function addPreset() {
    let index = 1;
    while (names.has(`${catalog.newPresetPrefix} ${index}`) || persistedNames.has(`${catalog.newPresetPrefix} ${index}`)) index += 1;
    selectedPreset = `${catalog.newPresetPrefix} ${index}`;
    names.add(selectedPreset);
    createdNames.add(selectedPreset);
    drafts.set(selectedPreset, []);
    dismissMenus();
    renderSkills();
    setStatus('');
  }

  function validatePresetName(name, previous) {
    // Firebase 키에 사용할 수 없는 문자와 제어 문자만 금지한다.
    // eslint-disable-next-line no-control-regex
    if (!name || /[.#$[\]/\u0000-\u001f\u007f]/u.test(name)) throw new Error('이름에는 . # $ [ ] / 또는 제어 문자를 사용할 수 없습니다.');
    if (name !== previous && (names.has(name) || persistedNames.has(name))) throw new Error('이미 사용 중인 프리셋 이름입니다.');
  }

  async function renamePreset(name) {
    if (!await choosePreset(name)) return;
    renderPresetMenu();
    const row = [...ui.presetMenu.children].find(item => item.dataset.presetRow === name);
    ui.presetMenu.hidden = false;
    ui.presetButton.setAttribute('aria-expanded', 'true');
    const form = element('form', 'cc-skill-preset-edit');
    const input = element('input', 'text-input');
    input.value = name;
    input.maxLength = 80;
    input.setAttribute('aria-label', '프리셋 이름');
    const confirm = iconButton('이름 변경 적용', 'check');
    confirm.type = 'submit';
    const cancel = iconButton('이름 변경 취소', 'close');
    cancel.addEventListener('click', renderPresetMenu);
    form.append(input, confirm, cancel);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const next = input.value.trim();
      try { validatePresetName(next, name); }
      catch (error) { setStatus(error.message, true); return; }
      if (next !== name) {
        const value = knownNames(selectedNames(name));
        names.delete(name);
        names.add(next);
        if (persistedNames.has(name)) drafts.set(name, null);
        else drafts.delete(name);
        createdNames.delete(name);
        createdNames.add(next);
        drafts.set(next, value);
        selectedPreset = next;
      }
      dismissMenus();
      renderSkills();
      setStatus('');
      restoreFocus();
    });
    row.replaceChildren(form);
    input.focus({ preventScroll: true });
    input.select();
  }

  function confirmDelete(name, row) {
    row.replaceChildren(element('span', 'cc-skill-delete-label', `“${name}” 삭제?`));
    const remove = iconButton('삭제 적용', 'trash');
    const cancel = iconButton('삭제 취소', 'close');
    remove.addEventListener('click', () => {
      names.delete(name);
      createdNames.delete(name);
      if (persistedNames.has(name)) drafts.set(name, null);
      else drafts.delete(name);
      ensurePreset();
      dismissMenus();
      renderDirty();
      // 다른 프리셋으로 전환하는 경우에만 그 프리셋을 읽는다.
      void choosePreset(selectedPreset);
    });
    cancel.addEventListener('click', renderPresetMenu);
    row.append(remove, cancel);
  }

  function emptyPresets() {
    return [...names].filter(name => (cache.has(name) || createdNames.has(name) || drafts.has(name)) &&
      knownNames(selectedNames(name)).length === 0);
  }

  function requestSave() {
    dismissMenus();
    const empty = emptyPresets();
    if (!empty.length) { void saveChanges(); return; }
    showNotice({ title: '빈 프리셋',
      message: '빈 프리셋은 저장되지 않으며, 새로고침하면 사라집니다.',
      detail: empty.join(' · '), confirmLabel: '저장', onConfirm: () => { void saveChanges(); } });
  }

  function showNotice({ title, message, detail, confirmLabel, onConfirm }) {
    const panel = element('div', 'cc-skill-notice');
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', title);
    const heading = element('div', 'cc-skill-notice-title');
    heading.append(icon('warning'), element('strong', '', title));
    const text = element('p', '', message);
    const actions = element('div', 'cc-skill-notice-actions');
    const cancel = element('button', 'button', '취소');
    const confirm = element('button', 'button primary', confirmLabel);
    cancel.type = confirm.type = 'button';
    cancel.addEventListener('click', () => { ui.notice.hidden = true; });
    confirm.addEventListener('click', () => { ui.notice.hidden = true; onConfirm(); });
    actions.append(cancel, confirm);
    panel.append(heading, text);
    if (detail) panel.append(element('div', 'cc-skill-empty-names', detail));
    panel.append(actions);
    ui.notice.replaceChildren(panel);
    ui.notice.hidden = false;
  }

  async function saveOne(name, value) {
    const clean = value === null ? null : knownNames(value);
    const data = clean?.length ? clean : null;
    // 새 빈 프리셋은 서버 경로를 만들지 않고 메모리에만 남긴다.
    if (data === null && !persistedNames.has(name)) {
      if (drafts.get(name) === value) drafts.delete(name);
      return;
    }
    if (!cache.has(name)) await loadPreset(name);
    if (createdNames.has(name) && !persistedNames.has(name) && cache.get(name) !== null) {
      throw new Error(`“${name}”이 저장소에 이미 있습니다. 다른 이름을 사용하세요.`);
    }
    const saved = await book.save(data, name);
    cache.set(name, saved === null ? null : [...saved]);
    if (saved === null) {
      persistedNames.delete(name);
      if (names.has(name)) createdNames.add(name);
    }
    else { persistedNames.add(name); createdNames.delete(name); }
    // 성공한 항목만 정리한다. 다른 항목의 실패가 이 결과를 되돌리지 않는다.
    if (drafts.get(name) === value) drafts.delete(name);
  }

  async function saveChanges() {
    await run(async () => {
      const pending = new Map(drafts);
      // 삭제된 카탈로그 항목은 표시만 숨긴다. 실제 정리는 사용자가 저장할 때 수행한다.
      for (const name of names) {
        const value = cache.get(name);
        if (!pending.has(name) && Array.isArray(value) && JSON.stringify(value) !== JSON.stringify(knownNames(value))) pending.set(name, value);
      }
      if (!pending.size) { setStatus('저장할 변경사항이 없습니다.'); return; }
      const failures = [];
      // 이름 변경은 새 경로 저장 후 원래 경로를 지운다. 새 값 저장에 실패하면 삭제를 보류한다.
      for (const [name, value] of pending) {
        if (value === null) continue;
        try { await saveOne(name, value); }
        catch (error) { failures.push(`${name}: ${error.message}`); }
      }
      if (!failures.length) for (const [name, value] of pending) {
        if (value !== null) continue;
        try { await saveOne(name, value); }
        catch (error) { failures.push(`${name}: ${error.message}`); }
      }
      if (failures.length) throw new Error(failures.join('\n'));
      setStatus('저장했습니다.');
    });
  }

  async function run(action) {
    if (busy) return false;
    busy = true;
    ui.root.setAttribute('aria-busy', 'true');
    setStatus('');
    setControls();
    try { await action(); return true; }
    catch (error) { setStatus(error.message, true); return false; }
    finally {
      busy = false;
      ui.root.removeAttribute('aria-busy');
      renderToolbar();
      renderSkills();
      setControls();
    }
  }

  function setControls() {
    for (const control of ui.root.querySelectorAll('button, select')) {
      control.disabled = control !== ui.close && (busy || (!ready && control !== ui.helpButton));
    }
    ui.subcategory.disabled = busy || !categoriesByName.has(selectedCategory);
  }

  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button) {
      const row = event.target.closest('[data-skill-name]');
      if (row && !suppressSkillClick) showSkillDetail(row.dataset.skillName, event.clientX, event.clientY);
      suppressSkillClick = false;
      return;
    }
    if (button.disabled) return;
    if (button.dataset.favorite) {
      const skillName = button.dataset.favorite;
      const value = knownNames(selectedNames());
      const index = value.indexOf(skillName);
      if (index < 0) value.push(skillName);
      else value.splice(index, 1);
      editPreset(selectedPreset, value);
      renderSkills();
      return;
    }
    if (button.dataset.category) {
      selectedCategory = button.dataset.category;
      selectedSubcategory = '';
      dismissMenus();
      renderToolbar();
      renderSkills();
      return;
    }
    if (button.dataset.preset) { void choosePreset(button.dataset.preset); return; }
    if (button.dataset.rename) { void renamePreset(button.dataset.rename); return; }
    if (button.dataset.remove) { confirmDelete(button.dataset.remove, button.parentElement); return; }
    switch (button.dataset.action) {
      case 'close': requestClose(); break;
      case 'save': requestSave(); break;
      case 'categories': toggleMenu(ui.categoryMenu, ui.categoryButton); break;
      case 'help': toggleMenu(ui.help, ui.helpButton); break;
      case 'presets': renderPresetMenu(); toggleMenu(ui.presetMenu, ui.presetButton); break;
      case 'add': addPreset(); break;
      case 'dismiss': dismissMenus(); break;
      case 'view':
        cancelDrag();
        view = view === 'list' ? 'grid' : 'list';
        renderToolbar();
        renderSkills();
        break;
    }
  }

  function handleKeyDown(event) {
    // 도감에서 입력한 키가 채팅창의 전송 단축키로 전파되지 않게 한다.
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (!ui.notice.hidden) ui.notice.hidden = true;
    else if ([ui.categoryMenu, ui.presetMenu, ui.help, ui.detail].some(menu => !menu.hidden)) dismissMenus();
    else requestClose();
    restoreFocus();
  }

  function handlePointerDown(event) {
    suppressSkillClick = false;
    const target = event.target;
    if (!ui.root.contains(document.activeElement)) returnFocus = document.activeElement;
    // 보기·버튼·드래그는 채팅 포커스를 유지한다. 이름 편집·설명 복사·select만 입력 포커스를 받는다.
    if (!target.closest('input, textarea, select')) event.preventDefault();
    if (!target.closest('.popover') && !target.closest('[data-action="categories"], [data-action="help"], [data-action="presets"]')) dismissMenus();
    const row = target.closest('.cc-skill-row');
    if (!row || target.closest('button') || busy || selectedCategory !== catalog.filters[1].name || event.button !== 0) return;
    cancelDrag();
    drag = { row, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
    drag.timer = setTimeout(() => {
      if (!drag) return;
      drag.active = true;
      row.classList.add('is-dragging');
      ui.list.classList.add('is-reordering');
      ui.root.setPointerCapture?.(drag.pointerId);
    }, 340);
  }

  function handlePointerMove(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7) cancelDrag();
      return;
    }
    event.preventDefault();
    const bounds = ui.list.getBoundingClientRect();
    if (event.clientY < bounds.top + 24) ui.list.scrollTop -= 12;
    else if (event.clientY > bounds.bottom - 24) ui.list.scrollTop += 12;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cc-skill-row');
    if (!target || target === drag.row || target.parentElement !== ui.list) return;
    const rect = target.getBoundingClientRect();
    const after = view === 'grid' ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
    ui.list.insertBefore(drag.row, after ? target.nextSibling : target);
  }

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.active) {
      suppressSkillClick = true;
      const ordered = [...ui.list.querySelectorAll('[data-skill-name]')].map(row => row.dataset.skillName);
      editPreset(selectedPreset, ordered);
    }
    clearDrag();
  }

  function clearDrag() {
    if (!drag) return;
    clearTimeout(drag.timer);
    drag.row.classList.remove('is-dragging');
    if (ui.root.hasPointerCapture?.(drag.pointerId)) ui.root.releasePointerCapture(drag.pointerId);
    ui.list.classList.remove('is-reordering');
    drag = undefined;
  }

  function cancelDrag() {
    if (!drag) return;
    const active = drag.active;
    clearDrag();
    if (active) renderSkills();
  }

  function clearReadCache() {
    cache.clear();
    ready = false;
    if (ui && !ui.root.hidden) closeBook();
  }
  if (window.navigation) window.navigation.addEventListener('navigatesuccess', clearReadCache);
  else window.addEventListener('popstate', clearReadCache);
  window.addEventListener('pagehide', clearReadCache);
})();

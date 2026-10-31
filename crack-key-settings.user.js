// ==UserScript==
// @name         크랙 키 설정
// @namespace    crack-commandline
// @icon         https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/images/crack-commandline.svg
// @version      1.0.0.0
// @description  PC 전용. !키설정으로 단축키를 변경합니다. 몰입 토글은 몰입모드 설치 시 동작합니다.  (version 관리방식: 데이터구조버전.크랙UI변경.기능추가및수정.버그수정)
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @noframes
// @require      https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-core.js
// @resource     ccCommon https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-common.css
// @grant        unsafeWindow
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @connect      identitytoolkit.googleapis.com
// @connect      securetoken.googleapis.com
// @connect      firebaseio.com
// @connect      firebasedatabase.app
// @updateURL    https://raw.githubusercontent.com/hamster4762/crack-commandline-book/refs/heads/main/crack-key-settings.user.js
// @downloadURL  https://raw.githubusercontent.com/hamster4762/crack-commandline-book/refs/heads/main/crack-key-settings.user.js
// ==/UserScript==

/* 공유 core가 먼저 실행된 스크립트의 권한을 사용하므로 Firebase 권한도 동일하게 선언한다. */
(() => {
  'use strict';

  const page = unsafeWindow;
  const doc = document;

  if (page.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

  let suspended = false;
  const EDITOR = '.__chat_input_textarea[contenteditable="true"],textarea.__chat_input_textarea';

  const make = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const combo = (code, ctrl = false, alt = false, shift = false, meta = false) => ({ code, ctrl, alt, shift, meta });
  const action = (id, name, short, binding, group) => ({ id, name, short, binding, group });

  const actions = [
    action('history', '대화 내역 열기 / 닫기', '내역', combo('KeyS', true, false, true), 'chat'),
    action('help', '크랙 도움말', '도움말', combo('Slash', true, false, true), 'chat'),
    action('input', '입력창 포커스', '입력', combo('Enter'), 'chat'),
    action('blur', '입력창 포커스 해제', '해제', combo('Escape'), 'chat'),
    action('new', '이 캐릭터와 새 대화', '새대화', combo('KeyN', true, true), 'chat'),
    action('note', '유저 노트', '노트', combo('KeyI', true), 'chat'),
    action('profile', '대화 프로필', '프로필', combo('KeyP', true, true), 'chat'),
    action('memory', '요약 메모리', '메모리', combo('KeyU', true, false, true), 'chat'),
    action('room', '채팅방 설정', '방설정', combo('Digit0', true), 'chat'),
    action('immersion', '몰입모드 토글', '몰입', combo('F9'), 'tools'),
    action('settings', '키 설정', '키설정', combo('KeyS', true, true), 'tools'),
    action('suggest', '추천 답변 받기', '추천', combo('Slash', true), 'chat'),
    action('choice1', '추천 답변 1 선택', '답변1', combo('Digit1', true), 'chat'),
    action('choice2', '추천 답변 2 선택', '답변2', combo('Digit2', true), 'chat'),
    action('choice3', '추천 답변 3 선택', '답변3', combo('Digit3', true), 'chat'),
    action('image', '상황 이미지 생성', '이미지', combo('KeyK', true), 'chat'),
    action('situation', '상황 추가', '상황', combo('KeyE', true, false, true), 'chat'),
    action('regenerate', '답변 재생성', '재생성', combo('KeyR', true, true), 'chat'),
    action('search', '메시지 검색', '검색', combo('KeyC', false, true), 'tools')
  ];

  const reserved = [
    ['KeyC', true, false, false, '복사'], ['KeyV', true, false, false, '붙여넣기'], ['KeyX', true, false, false, '잘라내기'],
    ['KeyA', true, false, false, '전체 선택'], ['KeyZ', true, false, false, '실행 취소'], ['KeyF', true, false, false, '페이지 찾기'],
    ['KeyS', true, false, false, '페이지 저장'], ['KeyT', true, false, false, '새 탭'], ['KeyW', true, false, false, '탭 닫기'],
    ['KeyL', true, false, false, '주소창'], ['KeyR', true, false, false, '새로고침'], ['F5', false, false, false, '새로고침'],
    ['F12', false, false, false, '개발자 도구'], ['F1', false, false, false, '브라우저 도움말'], ['F6', false, false, false, '주소창'],
    ['F7', false, false, false, '캐럿 탐색'], ['F10', false, false, false, '브라우저 메뉴'], ['F11', false, false, false, '전체 화면'],
    ['MetaLeft', false, false, false, 'OS 메뉴'], ['PrintScreen', false, false, false, '화면 캡처'], ['Tab', false, true, false, '창 전환'], ['F4', false, true, false, '창 닫기'],
    ['KeyN', true, false, false, '새 창'], ['KeyP', true, false, false, '인쇄'], ['KeyH', true, false, false, '방문 기록'], ['KeyF', false, true, false, '브라우저 메뉴'],
    ['Digit1', false, false, true, '! 명령어 · 보호']
  ].map(([code, ctrl, alt, shift, name]) => ({ binding: combo(code, ctrl, alt, shift), name, short: name, group: 'reserved' }));

  const colors = { chat: '#355765', model: '#614763', tools: '#786341', reserved: '#444f58' };

  const keyNames = {
    Backquote: '~',
    Minus: '−',
    Equal: '=',
    Backspace: 'Back',
    Tab: 'Tab',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    CapsLock: 'Caps',
    Semicolon: ';',
    Quote: "'",
    Enter: 'Enter',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    MetaLeft: 'Win',
    MetaRight: 'Win',
    Space: 'Space',
    ContextMenu: 'Menu',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Escape: 'Esc',
    PrintScreen: 'PrtSc',
    ScrollLock: 'ScrLk',
    Pause: 'Pause',
    Insert: 'Ins',
    Delete: 'Del',
    Home: 'Home',
    End: 'End',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    NumLock: 'Num',
    NumpadDivide: '/',
    NumpadMultiply: '*',
    NumpadSubtract: '−',
    NumpadAdd: '+',
    NumpadEnter: 'Enter',
    NumpadDecimal: '.'
  };

  const keyName = code => keyNames[code] || code.replace(/^Key|^Digit|^Numpad/, '');
  const format = binding => binding ? [binding.ctrl && 'Ctrl', binding.alt && 'Alt', binding.shift && 'Shift', binding.meta && 'Win', keyName(binding.code)].filter(Boolean).join(' + ') : '미설정';
  const matches = (a, b) => a && b && a.code === b.code && ['ctrl', 'alt', 'shift', 'meta'].every(key => !!a[key] === !!b[key]);

  const mainRows = [
    [['Escape', 1.3], ['F1'], ['F2'], ['F3'], ['F4'], ['F5'], ['F6'], ['F7'], ['F8'], ['F9'], ['F10'], ['F11'], ['F12']],
    ['Backquote', ...Array.from({ length: 9 }, (_, i)=>'Digit' + (i + 1)), 'Digit0', 'Minus', 'Equal', ['Backspace', 2]],
    [['Tab', 1.5], ...'QWERTYUIOP'.split('').map(k=>'Key' + k), 'BracketLeft', 'BracketRight', ['Backslash', 1.5]],
    [['CapsLock', 1.8], ...'ASDFGHJKL'.split('').map(k=>'Key' + k), 'Semicolon', 'Quote', ['Enter', 2.2]],
    [['ShiftLeft', 2.3], ...'ZXCVBNM'.split('').map(k=>'Key' + k), 'Comma', 'Period', 'Slash', ['ShiftRight', 2.7]],
    [['ControlLeft', 1.4], ['MetaLeft', 1.1], ['AltLeft', 1.2], ['Space', 6.3], ['AltRight', 1.2], ['ContextMenu', 1.2], ['ControlRight', 1.6]]
  ];

  const navRows = [['PrintScreen', 'ScrollLock', 'Pause'], ['Insert', 'Home', 'PageUp'], ['Delete', 'End', 'PageDown'], [null, null, null], [null, 'ArrowUp', null], ['ArrowLeft', 'ArrowDown', 'ArrowRight']];
  const numRows = [[null, null, null, null], ['NumLock', 'NumpadDivide', 'NumpadMultiply', 'NumpadSubtract'], ['Numpad7', 'Numpad8', 'Numpad9', 'NumpadAdd'], ['Numpad4', 'Numpad5', 'Numpad6', null], ['Numpad1', 'Numpad2', 'Numpad3', 'NumpadEnter'], [['Numpad0', 2], 'NumpadDecimal', null]];
  const baseBindings = Object.fromEntries(actions.map(item => [item.id, item.binding]));

  // 키 배정만 저장하며 화면 테마나 채팅 기록은 취급하지 않는다.
  function defaultSettings() {
    return { version: 1, bindings: { ...baseBindings } };
  }
  // 저장값 중 이 스크립트가 사용하는 유효한 설정만 받아들인다.
  function normalizeSettings(value) {
    const next = defaultSettings();
    if (!value || value.version !== 1) return next;
    for (const [id, binding] of Object.entries(value.bindings || {})) {
      if (!Object.hasOwn(baseBindings, id) && !id.startsWith('model:')) continue;
      if (binding === null) {
        next.bindings[id] = null;
        continue;
      }
      if (!binding || typeof binding.code !== 'string' || !binding.code || binding.code.length > 40) continue;
      if (binding.code === 'Escape' && id !== 'blur' || isBang(binding)) continue;
      next.bindings[id] = combo(binding.code, !!binding.ctrl, !!binding.alt, !!binding.shift, !!binding.meta);
    }
    return next;
  }
  // 명령어 시작에 쓰는 느낌표 키를 보호한다.
  function isBang(binding) {
    return binding?.code === 'Digit1' && binding.shift && !binding.ctrl && !binding.alt && !binding.meta;
  }
  let settings = defaultSettings();
  let draft = null;
  let database;
  let storageError = false;
  const storageReady = loadSettings().catch(() => {
    storageError = true;
  });

  // 새 전용 저장소를 열고 저장된 설정을 불러온다.
  async function loadSettings() {
    database = await new Promise((resolve, reject) => {
      const request = page.indexedDB.open('crack-key-settings-local', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('settings');

      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.onversionchange = () => database.close();
    const saved = await new Promise((resolve, reject) => {
      const transaction = database.transaction('settings');
      const config = transaction.objectStore('settings').get('current');

      transaction.oncomplete = () => resolve({ config: config.result });
      transaction.onerror = () => reject(transaction.error);
    });
    const value = saved.config === undefined ? await readLegacySettings() : saved;
    settings = normalizeSettings(value?.config);

    if (saved.config === undefined && value?.config) await persist(settings);
  }

  // 이전 통합판의 로컬 데이터 중 이 스크립트가 쓰는 값만 이어받는다.
  async function readLegacySettings() {
    if (!page.indexedDB.databases) return null;
    const databases = await page.indexedDB.databases();
    if (!databases.some(item => item.name === 'crack-key-focus-local')) return null;
    return new Promise((resolve, reject) => {
      const request = page.indexedDB.open('crack-key-focus-local');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const legacy = request.result;
        if (!legacy.objectStoreNames.contains('settings')) {
          legacy.close();
          resolve(null);
          return;
        }
        const transaction = legacy.transaction('settings');
        const config = transaction.objectStore('settings').get('current');

        transaction.oncomplete = () => {
          legacy.close();
          resolve({ config: config.result });
        };
        transaction.onerror = () => {
          legacy.close();
          reject(transaction.error);
        };
      };
    });
  }

  // 검증된 설정을 이 스크립트 전용 IndexedDB에 저장한다.
  async function persist(next) {
    if (!database || storageError) throw new Error('이 브라우저의 로컬 저장소를 열 수 없습니다.');
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put(next, 'current');

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error('설정 저장을 완료하지 못했습니다. 저장 공간을 확인해주세요.'));
      transaction.onabort = () => reject(new Error('설정 저장을 완료하지 못했습니다.'));
    });
  }

  // 현재 경로에서 채팅방 ID를 읽는다.
  function currentChatId() {
    return suspended ? '' : page.location.pathname.match(/\/episodes\/([^/?#]+)/)?.[1] || '';
  }

  // 크랙의 채팅 입력창을 찾는다.
  function editor() {
    return doc.querySelector(EDITOR);
  }

  let uiHost, ui, uiShell;
  let waitingId = null;
  let heldModifier = null;
  let allLayers = true;
  const modifiers = { ctrl: false, alt: false, shift: false };
  let models = [];
  let modelSnapshotKnown = false;
  let saving = false;
  let toastTimer;
  const $ = id => ui?.getElementById(id);

  const SETTINGS_HTML = String.raw`
<div class="settings-scrim" id="settings-scrim" hidden="">
  <section class="cc-ui ui-window focus-window" id="focus-window" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
    <header class="window-header">
      <div class="identity">
        <div class="brand-mark" aria-hidden="true">&gt;_</div>
        <div>
          <div class="eyebrow">CRACK COMMANDLINE</div>
          <h1 id="settings-title">키 설정</h1>
        </div>
      </div>
      <div class="header-end">
        <span class="local-label">설정은 이 기기에만 저장</span>
        <button class="icon-button" id="close-settings" aria-label="설정 닫기">×</button>
      </div>
    </header>
    <div id="keys-panel" class="keys-panel">
      <div class="keyboard-toolbar">
        <div class="modifier-filters" role="group" aria-label="보조키 조합">
          <button aria-pressed="true" data-mod="all">전체 배정</button>
          <i></i>
          <button aria-pressed="false" data-mod="ctrl">Ctrl</button>
          <button aria-pressed="false" data-mod="alt">Alt</button>
          <button aria-pressed="false" data-mod="shift">Shift</button>
          <span id="layer-label">모든 조합을 한눈에</span>
        </div>
        <div class="key-legend">
          <span class="legend-chat">채팅</span>
          <span class="legend-model">모델</span>
          <span class="legend-tools">도구</span>
          <span class="legend-reserved">예약 조합</span>
        </div>
      </div>
      <div class="keyboard" id="keyboard" aria-label="단축키 배정 키보드"></div>
      <div class="action-columns" id="action-columns"></div>
    </div>
    <footer class="window-footer">
      <div class="shortcut">
        명령어
        <kbd>!키설정</kbd>
      </div>
      <div class="footer-actions">
        <button class="button subtle" id="reset-keys">키 설정 초기화</button>
        <button class="button subtle" id="save-preview">설정 저장</button>
        <button class="button subtle" id="cancel-settings">취소</button>
      </div>
    </footer>
  </section>
</div>
<div class="cc-ui key-popover" id="key-popover" role="tooltip" hidden=""></div>
<div class="cc-ui preview-toast" id="toast" role="status" hidden=""></div>
`;


  const extensionCSS = String.raw`
    /* PC 키 설정: 키보드 배정 화면과 단축키 목록. */

    .settings-scrim {
      position: fixed;
      inset: 52px 0 0;
      background: #060b10a8;
      backdrop-filter: blur(3px);
      display: grid;
      place-items: center;
      z-index: 20;
      padding: 18px 22px;
    }

    .cc-ui.focus-window {
      width: min(1180px,100%);
      height: min(850px,calc(100dvh - 90px));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      --inset: 22px;
    }

    .focus-window .window-header {
      padding-top: 13px;
      padding-bottom: 12px;
      min-height: 72px;
    }

    .focus-window h1 {
      font-size: 22px;
    }

    .header-end {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .local-label {
      color: #9ca89e;
      font-size: 10px;
    }

    .focus-window .header-end .icon-button {
      border: 1px solid #74674d;
      background: var(--plate);
      font-size: 23px;
      width: 28px;
      height: 28px;
    }

    /* 키보드 그림과 보조키 조합 필터. */
    .keys-panel {
      flex: 1;
      min-height: 0;
      padding: 12px 22px 0;
      display: flex;
      flex-direction: column;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: #75644377 transparent;
    }

    .keyboard-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 11px;
    }

    .modifier-filters {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .modifier-filters button {
      border: 1px solid #525c60;
      background: #19232b;
      border-radius: 2px;
      padding: 3px 11px;
      font: 10px/1.7 Consolas,'Malgun Gothic',sans-serif;
    }

    .modifier-filters button[aria-pressed=true] {
      background: #c7ac78;
      border-color: #e3cca1;
      color: #192027;
      box-shadow: inset 0 1px #ffe9ba66;
    }

    .modifier-filters i {
      width: 1px;
      height: 18px;
      margin: 0 5px;
      background: #56605a;
    }

    #layer-label {
      margin-left: 7px;
      color: #95a29f;
      font-size: 10px;
    }

    .key-legend {
      display: flex;
      gap: 12px;
      font-size: 9px;
      color: #a7b1b1;
    }

    .key-legend span::before {
      content: '';
      width: 5px;
      height: 5px;
      background: var(--key-color);
      display: inline-block;
      margin: 0 5px 1px 0;
    }

    .legend-chat {
      --key-color: #76a4b7;
    }

    .legend-model {
      --key-color: #c094bd;
    }

    .legend-tools {
      --key-color: #c3a772;
    }

    .legend-reserved {
      --key-color: #75818a;
    }

    .keyboard {
      background: linear-gradient(145deg,#131b22,#1d2730);
      border: 1px solid #59615e;
      border-bottom: 3px solid #080e13;
      border-radius: 5px;
      box-shadow: inset 0 0 0 3px #0b1319,0 6px 12px #0004;
      padding: 10px;
      display: grid;
      grid-template-columns: minmax(0,15fr) minmax(0,3fr) minmax(0,4fr);
      gap: 11px;
      flex-shrink: 0;
    }

    .keyboard-main,
    .keyboard-nav,
    .keyboard-numpad {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .keyboard-row {
      display: flex;
      gap: 4px;
      min-width: 0;
    }

    .keyboard-row.function-row {
      margin-bottom: 6px;
    }

    .cc-ui .keyboard-key {
      position: relative;
      flex: var(--u,1) 1 0;
      min-width: 0;
      height: 45px;
      padding: 0;
      text-align: left;
      border: 1px solid #65707877;
      border-bottom: 3px solid #0a1016;
      border-radius: 3px;
      background: linear-gradient(#3c4650,#29343e);
      box-shadow: inset 0 1px #e9eff315,0 1px #000;
      overflow: hidden;
    }

    .keyboard-key .key-label {
      position: absolute;
      left: 5px;
      top: 2px;
      z-index: 3;
      font: 9px/1.4 Consolas,sans-serif;
      color: #c6cdcd;
      text-shadow: 0 1px #000;
    }

    .keyboard-key .key-slices {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
    }

    .key-slice {
      background: var(--slice-bg,#36434d);
      flex: 1;
      min-height: 0;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 0 3px 0 14px;
      font: 8px/1.1 'Malgun Gothic',sans-serif;
      color: #e0ebea;
      white-space: nowrap;
      overflow: hidden;
    }

    .key-slices.two .key-slice {
      position: absolute;
      inset: 0;
      clip-path: polygon(0 0,100% 0,100% 100%);
      align-items: flex-start;
      padding-top: 4px;
    }

    .key-slices.two .key-slice + .key-slice {
      clip-path: polygon(0 0,0 100%,100% 100%);
      align-items: flex-end;
      justify-content: flex-start;
      padding: 0 0 3px 4px;
    }

    .key-slices.many .key-slice {
      font-size: 7px;
    }

    .keyboard-key[data-selected=true] {
      border-color: #e6c98e;
      box-shadow: 0 0 0 1px #e6c98e,0 0 10px #d0ad6330;
    }

    .keyboard-key:hover {
      filter: brightness(1.2);
    }

    .key-spacer {
      flex: var(--u,1) 1 0;
      min-width: 0;
      height: 45px;
    }

    /* 키보드 아래 기능별 배정 목록. */
    .action-columns {
      margin-top: 8px;
      display: grid;
      grid-template-columns: repeat(4,minmax(0,1fr));
      gap: 17px;
      flex: 1;
      padding-bottom: 12px;
      align-content: start;
    }

    .action-group h2 {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 10px;
      color: #c4ad84;
      padding: 6px 0 6px 8px;
      border-left: 2px solid #a28b5f;
      background: linear-gradient(90deg,#ac95601c,transparent);
      margin-bottom: 5px;
    }

    .action-group h2 small {
      margin-left: auto;
      padding-right: 5px;
      color: #78898b;
      font: 9px Consolas,monospace;
    }

    .binding-row {
      display: flex;
      min-height: 25px;
      border-bottom: 1px solid #59645e22;
      align-items: center;
      gap: 2px;
    }

    .binding-row > .binding-button {
      display: flex;
      flex: 1;
      min-width: 0;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      padding: 3px 4px;
      text-align: left;
      color: #c2cdca;
      font-size: 10px;
    }

    .binding-row:hover {
      background: #d4bf8b0b;
    }

    .binding-button kbd {
      font-size: 9px;
      line-height: 1.1;
      padding: 2px 4px;
      border-color: #596660;
      white-space: nowrap;
      color: #c9c5ae;
    }

    .binding-button kbd.unbound {
      color: #67777e;
      border-color: transparent;
      background: none;
      box-shadow: none;
    }

    .binding-row.is-waiting {
      background: #b39a5d1f;
      outline: 1px solid #c7ad7160;
    }

    .binding-row .unbind {
      width: 16px;
      flex-shrink: 0;
      color: #67757b;
      padding: 0;
      font: 13px Consolas,monospace;
    }

    .binding-row .unbind:hover {
      color: #e6b3a3;
    }

    .binding-row .unbind:disabled {
      opacity: .15;
    }

    .focus-window .window-footer {
      padding-top: 9px;
      padding-bottom: 9px;
      min-height: 52px;
    }

    .footer-actions {
      display: flex;
      gap: 7px;
    }

    /* 선택한 키의 배정 툴팁과 저장 알림. */
    .cc-ui.key-popover {
      position: fixed;
      z-index: 40;
      max-width: 420px;
      padding: 9px 12px;
      background: #1a262e;
      border: 1px solid #9d895e;
      box-shadow: 0 6px 22px #0007;
      pointer-events: none;
      font-size: 10px;
    }

    .popover-title {
      display: block;
      font: 12px Consolas,monospace;
      color: #e5cda0;
      margin-bottom: 6px;
    }

    .popover-grid {
      display: grid;
      grid-template-columns: minmax(100px,1fr) max-content;
      align-items: center;
      gap: 6px 22px;
    }

    .popover-grid small {
      color: #7e959c;
      font-size: 8px;
      border-bottom: 1px solid #66736a55;
      padding-bottom: 3px;
    }

    .popover-grid kbd {
      font: 9px Consolas,monospace;
      color: #c8d3cd;
      white-space: nowrap;
    }

    .reserved-note,
    .empty-key {
      color: #87969b;
    }

    .cc-ui.preview-toast {
      position: fixed;
      bottom: 25px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 50;
      max-width: 650px;
      padding: 10px 18px;
      border: 1px solid #a08a5c;
      background: #243039;
      box-shadow: 0 5px 25px #0007;
      font-size: 11px;
    }

    @media (max-height:840px) {
      .cc-ui.focus-window {
        height: calc(100dvh - 78px);
      }

      .settings-scrim {
        padding: 13px 20px;
      }

      .focus-window .window-header {
        min-height: 61px;
        padding-top: 9px;
        padding-bottom: 8px;
      }

      .focus-window h1 {
        font-size: 19px;
      }

      .cc-ui .keyboard-key,
      .key-spacer {
        height: 32px;
      }

      .keyboard {
        padding: 8px;
      }

      .keyboard-row,
      .keyboard-main,
      .keyboard-nav,
      .keyboard-numpad {
        gap: 3px;
      }

      .keyboard-row.function-row {
        margin-bottom: 4px;
      }

      .binding-row {
        min-height: 21px;
      }

      .binding-row > .binding-button {
        font-size: 9px;
        padding-top: 2px;
        padding-bottom: 2px;
      }

      .focus-window .window-footer {
        min-height: 45px;
        padding-top: 6px;
        padding-bottom: 6px;
      }

      .action-group h2 {
        padding-top: 4px;
        padding-bottom: 4px;
        font-size: 9px;
        margin-bottom: 4px;
      }

      .keyboard-toolbar {
        margin-bottom: 7px;
      }

      .keys-panel {
        padding-top: 9px;
      }
    }

    @media (max-width:1180px) {
      .cc-ui.focus-window {
        --inset: 16px;
      }

      .keys-panel {
        padding-left: 16px;
        padding-right: 16px;
      }

      .key-legend {
        gap: 7px;
      }

      .keyboard {
        gap: 7px;
      }

      .keyboard-key .key-label {
        font-size: 8px;
        left: 3px;
      }

      .key-slice {
        font-size: 7px;
      }

      .action-columns {
        gap: 12px;
      }
    }

    @media (max-width:1000px) {
      .settings-scrim {
        min-width: 960px;
        padding-left: 12px;
        padding-right: 12px;
      }

      #layer-label {
        display: none;
      }

      .key-legend {
        font-size: 8px;
      }

      .key-slice {
        font-size: 6px;
      }
    }

    :host {
      font: 13px/1.6 'Segoe UI','Malgun Gothic',sans-serif;
      color: #e4dfd4;
      color-scheme: dark;
    }

    .settings-scrim {
      inset: 0;
      pointer-events: auto;
      z-index: 1;
    }

    .cc-ui.focus-window {
      position: relative;
    }

    .cc-ui.preview-toast,
    .cc-ui.key-popover {
      pointer-events: none;
    }

    .settings-scrim[hidden],
    .cc-ui [hidden],
    [hidden] {
      display: none !important;
    }
  `;
  const commonCSS = GM_getResourceText('ccCommon');
  let sharedSheet;
  if (page.CSSStyleSheet?.prototype.replaceSync) {
    sharedSheet = new page.CSSStyleSheet();
    sharedSheet.replaceSync(extensionCSS);
  }

  // 각 Shadow DOM에 이 스크립트의 전용 CSS와 필요한 공용 프레임을 적용한다.
  function addStyle(root, common = false) {
    if (sharedSheet) root.adoptedStyleSheets = [sharedSheet];
    else {
      const style = make('style');
      style.textContent = extensionCSS;
      root.append(style);
    }
    if (common) {
      const style = make('style');
      style.textContent = commonCSS;
      root.prepend(style);
    }
  }

  // 현재 설정의 키 배정을 실행 가능한 동작 목록에 합친다.
  function configuredActions(config = draft || settings) {
    return [...actions, ...models].map(item => ({ ...item, binding: config.bindings[item.id] || null }));
  }

  // 설정창을 한 번 만들고 편집 이벤트를 연결한다.
  function ensureUI() {
    if (ui) return;
    uiHost = make('div');
    uiHost.id = 'cc-key-settings-host';
    uiHost.dataset.ccKeysOwned = '';
    uiHost.style.cssText = 'position:fixed;inset:0;z-index:2147483600;pointer-events:none;';
    ui = uiHost.attachShadow({ mode: 'open' });
    addStyle(ui, true);
    uiShell = make('div');
    uiShell.innerHTML = SETTINGS_HTML;
    ui.append(uiShell);
    doc.body.append(uiHost);
    ui.addEventListener('keydown', event => event.stopPropagation());
    ui.addEventListener('keyup', event => event.stopPropagation());
    ui.addEventListener('pointerdown', event => {
      if (!event.target.closest('.keyboard-key')) hideKeyPopup();
    });
    $('keys-panel').addEventListener('scroll', hideKeyPopup);
    ui.querySelectorAll('[data-mod]').forEach(button => button.addEventListener('click', () => {
      const mod = button.dataset.mod;
      if (mod === 'all') {
        allLayers = true;
        Object.keys(modifiers).forEach(key => modifiers[key] = false);
      } else {
        allLayers = false;
        modifiers[mod] = !modifiers[mod];
      }
      ui.querySelectorAll('[data-mod]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.mod === 'all' ? allLayers : modifiers[node.dataset.mod])));
      $('layer-label').textContent = allLayers ? '모든 조합을 한눈에' : [modifiers.ctrl && 'Ctrl', modifiers.alt && 'Alt', modifiers.shift && 'Shift', '키'].filter(Boolean).join(' + ');
      renderKeyboard();
    }));
    $('close-settings').addEventListener('click', closeSettings);
    $('cancel-settings').addEventListener('click', closeSettings);
    $('save-preview').addEventListener('click', saveSettings);
    $('reset-keys').addEventListener('click', () => {
      draft.bindings = { ...baseBindings };
      waitingId = null;
      heldModifier = null;
      refreshBindings();
    });
  }

  // 작업 결과를 설정창 위에 잠시 표시한다.
  function toast(message) {
    if (!doc.body) return;
    ensureUI();
    $('toast').textContent = message;
    $('toast').hidden = false;
    page.clearTimeout(toastTimer);
    toastTimer = page.setTimeout(() => {
      $('toast').hidden = true;
    }, 4000);
  }

  // 중단된 요청을 제외한 오류를 사용자에게 표시한다.
  function showError(error) {
    if (!suspended && error?.name !== 'AbortError') toast(error.message || '작업을 완료하지 못했습니다.');
  }

  // 설정창을 열 때 현재 모델 목록과 저장된 키 배정을 표시한다.
  async function openSettings() {
    await storageReady;
    if (!doc.body) return;
    ensureUI();
    if (draft) {
      $('focus-window').focus();
      return;
    }
    try {
      await readModels();
    } catch (error) {
      showError(error);
    }
    draft = page.structuredClone(settings);
    $('settings-scrim').hidden = false;
    refreshBindings();
    $('close-settings').focus();
    if (storageError) toast('로컬 저장소를 열지 못했습니다. 저장을 사용할 수 없습니다.');
  }

  // 취소 시 편집 중인 키 배정을 버리고 채팅 입력창으로 돌아간다.
  function closeSettings() {
    if (saving) return;
    waitingId = null;
    heldModifier = null;
    hideKeyPopup();
    $('settings-scrim').hidden = true;
    draft = null;
    editor()?.focus();
  }

  // 삭제된 모델의 배정을 정리하고 키 설정만 저장한다.
  async function saveSettings() {
    if (!draft || saving) return;
    saving = true;
    $('save-preview').disabled = true;
    try {
      if (modelSnapshotKnown) {
        const ids = new Set(models.map(item => item.id));
        for (const id of Object.keys(draft.bindings)) if (id.startsWith('model:') && !ids.has(id)) delete draft.bindings[id];
      }
      const next = normalizeSettings(draft);
      await persist(next);
      settings = next;
      toast('키 설정을 이 브라우저에 저장했습니다.');
    } catch (error) {
      showError(error);
    } finally {
      saving = false;
      $('save-preview').disabled = false;
    }
  }

  // 한 키에 배정된 동작과 브라우저 예약키를 모은다.
  function bindingsFor(code) {
    return [...configuredActions(), ...reserved].filter(item => item.binding?.code === code);
  }

  // 키 배정 툴팁을 닫는다.
  function hideKeyPopup() {
    if ($('key-popover')) $('key-popover').hidden = true;
  }

  // 선택한 키의 모든 배정을 보여준다.
  function showKeyPopup(key, code) {
    const popup = $('key-popover');
    popup.replaceChildren(make('strong', 'popover-title', keyName(code)));
    const entries = bindingsFor(code);
    if (!entries.length) popup.append(make('span', 'empty-key', '배정 없음'));
    else {
      const table = make('div', 'popover-grid');
      table.append(make('small', '', '기능'), make('small', '', '배정 키'));
      entries.forEach(item => table.append(make('span', item.group === 'reserved' ? 'reserved-note' : '', item.name), make('kbd', '', format(item.binding))));
      popup.append(table);
    }
    popup.hidden = false;
    const rect = key.getBoundingClientRect(), bounds = popup.getBoundingClientRect();
    popup.style.left = Math.min(Math.max(10, rect.left), page.innerWidth - bounds.width - 10) + 'px';
    popup.style.top = (rect.bottom + bounds.height + 8 < page.innerHeight ? rect.bottom + 8 : rect.top - bounds.height - 8) + 'px';
  }

  // 배정 상태와 보조키 필터를 키보드 그림에 반영한다.
  function renderKeyboard() {
    if (!ui || !draft) return;
    hideKeyPopup();
    $('keyboard').replaceChildren();
    for (const [part, rows] of [['main', mainRows], ['nav', navRows], ['numpad', numRows]]) {
      const group = make('div', 'keyboard-' + part);
      rows.forEach((row, rowIndex) => {
        const line = make('div', 'keyboard-row' + (rowIndex === 0 ? ' function-row' : ''));
        row.forEach(spec => {
          const [code, width] = Array.isArray(spec) ? spec : [spec, 1];
          const key = make(code ? 'button' : 'span', code ? 'keyboard-key' : 'key-spacer');
          key.style.setProperty('--u', width || 1);
          if (code) {
            key.dataset.code = code;
            key.tabIndex = -1;
            key.setAttribute('aria-label', keyName(code) + ' 키 · 배정 보기');
            const entries = bindingsFor(code).filter(item => allLayers || ['ctrl', 'alt', 'shift'].every(mod => item.binding[mod] === modifiers[mod]));
            const slices = make('span', 'key-slices ' + (entries.length === 2 ? 'two' : entries.length > 2 ? 'many' : ''));
            entries.forEach(item => {
              const slice = make('span', 'key-slice', item.short);
              slice.style.setProperty('--slice-bg', colors[item.group]);
              slices.append(slice);
            });
            key.append(slices, make('span', 'key-label', keyName(code)));
            key.addEventListener('pointerdown', event => event.preventDefault());
            key.addEventListener('click', () => showKeyPopup(key, code));
          }
          line.append(key);
        });
        group.append(line);
      });
      $('keyboard').append(group);
    }
  }

  // 기능 목록과 키 입력 대기 상태를 표시한다.
  function renderActions() {
    if (!draft) return;
    $('action-columns').replaceChildren();
    const list = configuredActions(), tail = list.slice(16), split = Math.ceil(tail.length / 2);
    const columns = [['화면 · 채팅', list.slice(0, 8)], ['도구 · 답변', list.slice(8, 16)], ['도구 · 모델', tail.slice(0, split)], ['모델 선택', tail.slice(split)]];
    for (const [title, items] of columns) {
      const section = make('section', 'action-group'), heading = make('h2', '', title);
      heading.append(make('small', '', items.length + '개'));
      section.append(heading);
      for (const item of items) {
        const row = make('div', 'binding-row' + (waitingId === item.id ? ' is-waiting' : ''));
        const button = make('button', 'binding-button');
        button.dataset.action = item.id;
        button.setAttribute('aria-label', item.name + ' 단축키 설정');
        button.append(make('span', '', item.name), make('kbd', item.binding ? '' : 'unbound', waitingId === item.id ? '키 입력 대기…' : format(item.binding)));
        button.addEventListener('click', () => {
          waitingId = item.id;
          heldModifier = null;
          hideKeyPopup();
          renderActions();
          [...$('action-columns').querySelectorAll('[data-action]')].find(node => node.dataset.action === item.id)?.focus();
        });
        const unbind = make('button', 'unbind', '×');
        unbind.setAttribute('aria-label', item.name + ' 단축키 해제');
        unbind.disabled = !item.binding;
        unbind.addEventListener('click', () => {
          draft.bindings[item.id] = null;
          waitingId = null;
          refreshBindings();
        });
        row.append(button, unbind);
        section.append(row);
      }
      $('action-columns').append(section);
    }
  }

  // 키보드와 기능 목록을 함께 갱신한다.
  function refreshBindings() {
    renderKeyboard();
    renderActions();
  }

  // 중복과 보호키를 확인한 뒤 선택한 기능의 키를 변경한다.
  function setBinding(binding) {
    if (binding.code === 'Escape' || isBang(binding)) {
      toast('!와 Esc는 메뉴 열기·닫기를 위해 보호됩니다.');
      return;
    }
    const conflict = configuredActions().find(item => item.id !== waitingId && matches(item.binding, binding));
    if (conflict) {
      toast(format(binding) + '는 「' + conflict.name + '」에 배정돼 있습니다.');
      return;
    }
    draft.bindings[waitingId] = binding;
    waitingId = null;
    heldModifier = null;
    refreshBindings();
    const warning = reserved.find(item => matches(item.binding, binding));
    if (warning) toast('배정했습니다. 브라우저의 ' + warning.name + '와 겹치는 조합입니다.');
  }

  // 크랙의 현재 모델 선택 버튼을 찾는다.
  function modelTrigger() {
    return doc.querySelector('button[aria-label="메시지 검색"]')?.parentElement.querySelector('button[aria-haspopup="dialog"]');
  }

  // 열린 모델 메뉴에서 선택 가능한 항목을 읽는다.
  function modelOptions(trigger = modelTrigger()) {
    const popover = trigger && doc.getElementById(trigger.getAttribute('aria-controls'));
    return [...(popover?.querySelectorAll('button[aria-current]') || [])].map(button => {
      const image = button.querySelector('img[src*="/model-icon/"]');
      const name = (image?.nextElementSibling?.textContent || button.querySelector('.truncate')?.textContent || '').trim();
      const iconId = image ? new page.URL(image.src).pathname.split('/').pop().replace(/\.[^.]+$/, '') : '';
      return { button, id: 'model:' + (iconId || name), name };
    }).filter(item => item.name);
  }

  // 크랙의 모델 목록을 단축키 동작으로 반영한다.
  function adoptModels(options) {
    models = options.map(item => action(item.id, item.name, item.name.replace('챗', '').replace('하이퍼', '하'), null, 'model'));
    modelSnapshotKnown = true;
    if (draft && waitingId?.startsWith('model:') && !models.some(item => item.id === waitingId)) waitingId = null;
    if (draft) refreshBindings();
  }

  // 모델 메뉴가 열렸을 때 실제 항목을 읽고 관찰을 해제한다.
  async function readModels(keepOpen = false) {
    const trigger = modelTrigger();
    if (!trigger) return [];
    const openedHere = trigger.getAttribute('aria-expanded') !== 'true';
    if (openedHere) trigger.click();
    try {
      const options = await new Promise((resolve, reject) => {
        const current = modelOptions(trigger);
        if (current.length) {
          resolve(current);
          return;
        }
        const observer = new page.MutationObserver(() => {
          const result = modelOptions(trigger);
          if (result.length) {
            observer.disconnect();
            page.clearTimeout(timer);
            resolve(result);
          }
        });
        const timer = page.setTimeout(() => {
          observer.disconnect();
          reject(new Error('모델 목록을 읽지 못했습니다. 채팅방 모델 메뉴를 열고 다시 시도해주세요.'));
        }, 2500);
        observer.observe(doc.body, { childList: true, subtree: true });
      });
      adoptModels(options);
      return options;
    } finally {
      if (!keepOpen && openedHere && trigger.isConnected && trigger.getAttribute('aria-expanded') === 'true') trigger.click();
    }
  }

  // 크랙의 기존 메뉴를 통해 지정한 모델을 선택한다.
  async function selectModel(id) {
    const trigger = modelTrigger();
    if (!trigger) {
      toast('채팅방 모델 메뉴를 찾지 못했습니다.');
      return;
    }
    const options = await readModels(true);
    const current = options.find(item => item.id === id);
    if (!current || current.button.disabled) {
      if (trigger.getAttribute('aria-expanded') === 'true') trigger.click();
      toast('현재 선택할 수 없는 모델입니다. 저장 시 삭제된 모델의 배정을 정리합니다.');
      return;
    }
    current.button.click();
  }

  let chatId = '';
  let replaying = false;
  const blockedKeyUps = new Set();

  // 키 이벤트를 저장된 배정과 비교 가능한 값으로 바꾼다.
  function eventCombo(event) {
    return combo(event.code, event.ctrlKey, event.altKey, event.shiftKey, event.metaKey);
  }

  // 명령어를 입력 중인지 확인한다.
  function commandInputActive() {
    const input = editor();
    const text = input?.tagName === 'TEXTAREA' ? input.value : input?.textContent;
    return input && (doc.activeElement === input || input.contains(doc.activeElement)) && /(?:^|\s)![^\s!]{0,40}$/.test(text || '');
  }

  // 변경한 단축키를 크랙의 기존 키 이벤트로 전달한다.
  function replayNative(item, target) {
    if (item.id === 'input') {
      editor()?.focus();
      return;
    }
    if (item.id === 'blur') {
      editor()?.blur();
      return;
    }
    const binding = item.binding;
    let key = keyName(binding.code), keyCode = 0;
    if (/^Key[A-Z]$/.test(binding.code)) {
      key = binding.shift ? binding.code.slice(3) : binding.code.slice(3).toLowerCase();
      keyCode = binding.code.charCodeAt(3);
    } else if (/^Digit[0-9]$/.test(binding.code)) {
      key = binding.code.slice(5);
      keyCode = key.charCodeAt(0);
    } else if (binding.code === 'Slash') {
      key = binding.shift ? '?' : '/';
      keyCode = 191;
    }
    const receiver = target instanceof page.Element && target.isConnected ? target : editor() || doc.body;
    replaying = true;
    try {
      for (const type of ['keydown', 'keyup']) receiver.dispatchEvent(new page.KeyboardEvent(type, {
        key,
        code: binding.code,
        keyCode,
        which: keyCode,
        ctrlKey: binding.ctrl,
        altKey: binding.alt,
        shiftKey: binding.shift,
        metaKey: binding.meta,
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
    } finally {
      replaying = false;
    }
  }

  // 크랙 메뉴가 렌더링될 때까지만 관찰하고 즉시 해제한다.
  function waitFor(find) {
    const current = find();
    if (current) return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const observer = new page.MutationObserver(() => {
        const result = find();
        if (result) {
          observer.disconnect();
          page.clearTimeout(timer);
          resolve(result);
        }
      });
      const timer = page.setTimeout(() => {
        observer.disconnect();
        reject(new Error('크랙 메뉴를 찾지 못했습니다.'));
      }, 2500);
      observer.observe(doc.body, { childList: true, subtree: true });
    });
  }
  // 크랙의 대화 프로필 메뉴를 열거나 닫는다.
  async function openChatProfile() {
    const dialog = [...doc.querySelectorAll('[role=dialog]')].find(node => node.getClientRects().length &&
      /^대화\s*프로필(?:\s*(?:추가|수정))?$/.test(node.querySelector('h1,h2,h3')?.textContent?.trim() || ''));
    if (dialog) {
      dialog.querySelector('button[aria-label="닫기"]')?.click();
      return;
    }
    const find = () => [...doc.querySelectorAll('button,[role="button"]')].find(node =>
      [...node.querySelectorAll('span')].some(label => label.textContent.trim() === '대화 프로필'));
    let button = find();
    const toggle = !button && doc.querySelector('button[aria-label="사이드 패널 열기"]');
    try {
      if (toggle) {
        toggle.click();
        button = await waitFor(find);
      }
      if (!button) throw new Error('대화 프로필 메뉴를 찾지 못했습니다. 채팅방 설정에서 확인해주세요.');
      button.click();
    } finally {
      if (toggle) doc.querySelector('button[aria-label="사이드 패널 닫기"]')?.click();
    }
  }
  // 선택한 단축키 동작을 실행한다.
  function executeAction(item, event) {
    if (item.id === 'immersion') {
      doc.dispatchEvent(new page.Event('cc:immersion-toggle'));
      return;
    }
    if (item.id === 'settings') {
      openSettings().catch(showError);
      return;
    }
    if (item.id === 'search') {
      doc.dispatchEvent(new page.Event('cc:message-search'));
      if (doc.querySelector('button[aria-label="검색 닫기"]')) doc.querySelector('input[aria-label="메시지 검색어"]')?.focus();
      else doc.querySelector('button[aria-label="메시지 검색"]')?.click();
      return;
    }
    if (item.group === 'model') {
      selectModel(item.id).catch(showError);
      return;
    }
    if (item.id === 'profile') {
      openChatProfile().catch(showError);
      return;
    }
    if (item.id === 'note') {
      const dialog = [...doc.querySelectorAll('[role=dialog]')].find(node => node.getClientRects().length && /유저\s*노트/.test(node.querySelector('h1,h2,h3')?.textContent || ''));
      const close = dialog?.querySelector('button[aria-label="닫기"]');
      if (close) {
        close.click();
        return;
      }
    }
    if (item.id === 'room') {
      const toggle = doc.querySelector('button[aria-label="사이드 패널 닫기"],button[aria-label="사이드 패널 열기"]');
      if (toggle) {
        toggle.click();
        return;
      }
    }
    const native = actions.find(action => action.id === item.id);
    if (native) replayNative(native, event.target);
  }
  // 입력 대기 중인 기능에 새 키 조합을 배정한다.
  function captureKey(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') {
      waitingId = null;
      heldModifier = null;
      renderActions();
      return;
    }
    const modifier = { Control: 'ctrl', Alt: 'alt', Shift: 'shift', Meta: 'meta' }[event.key];
    if (modifier) {
      heldModifier = eventCombo(event);
      heldModifier[modifier] = false;
      return;
    }
    heldModifier = null;
    setBinding(eventCombo(event));
  }

  // 다른 독립 스크립트의 설정창을 편집하는 동안에는 전역 단축키를 실행하지 않는다.
  function inSettingsDialog(event) {
    return event.composedPath().some(node => node.getAttribute?.('aria-modal') === 'true' && node.getRootNode()?.host);
  }

  page.addEventListener('keydown', event => {
    if (replaying || event.isComposing || event.keyCode === 229) return;
    if (!draft && inSettingsDialog(event)) return;
    if (draft) {
      if (waitingId) {
        captureKey(event);
        return;
      }
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeSettings();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...ui.querySelectorAll('#focus-window button:not(:disabled),#focus-window input,#focus-window textarea,#focus-window summary')]
          .filter(node => node.getClientRects().length && node.tabIndex !== -1 && !node.hidden);
        if (event.shiftKey && ui.activeElement === focusable[0]) {
          event.preventDefault();
          focusable.at(-1)?.focus();
        } else if (!event.shiftKey && ui.activeElement === focusable.at(-1)) {
          event.preventDefault();
          focusable[0]?.focus();
        }
      }
      return;
    }
    if (!chatId || event.repeat || event.code === 'Escape' || isBang(eventCombo(event)) || commandInputActive()) return;
    const binding = eventCombo(event);
    const item = configuredActions(settings).find(action => matches(action.binding, binding));
    const native = actions.find(action => matches(action.binding, binding));
    const inEditor = editor() && (event.target === editor() || editor().contains(event.target));
    if (binding.code === 'Enter' && inEditor && (!item || item.id === 'input')) return;
    // 변경하지 않은 크랙 키는 원래의 이벤트·포커스 규칙을 그대로 사용한다.
    if (item && item.group === 'chat' && item.id !== 'profile' && matches(actions.find(action => action.id === item.id)?.binding, binding)) return;
    if (item || native && !matches(settings.bindings[native.id], native.binding)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      blockedKeyUps.add(event.code);
      if (item) executeAction(item, event);
    }
  }, true);

  page.addEventListener('keyup', event => {
    if (replaying) return;
    if (!draft && inSettingsDialog(event)) return;
    if (draft && waitingId && heldModifier?.code === event.code) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const binding = heldModifier;
      heldModifier = null;
      setBinding(binding);
      return;
    }
    if (blockedKeyUps.delete(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (!draft && chatId && !commandInputActive() && event.code === 'Enter' && !matches(settings.bindings.input, baseBindings.input)) {
      event.stopImmediatePropagation();
    }
  }, true);

  page.addEventListener('blur', () => {
    heldModifier = null;
    blockedKeyUps.clear();
  });

  page.addEventListener('resize', hideKeyPopup);
  if (page.navigation) page.navigation.addEventListener('navigatesuccess', scheduleSync);
  else page.addEventListener('popstate', scheduleSync);
  doc.addEventListener('click', scheduleSync, true);
  doc.addEventListener('keyup', scheduleSync, true);
  let syncFrame = 0;
  let lastModelSignature = '';
  // 같은 프레임의 화면 갱신 요청을 하나로 합친다.
  function scheduleSync() {
    if (suspended) return;
    if (!syncFrame) syncFrame = page.requestAnimationFrame(() => {
      syncFrame = 0;
      syncPage();
    });
  }

  // 채팅방 이동과 모델 목록 변경만 반영한다.
  function syncPage() {
    const nextChat = currentChatId();
    if (nextChat !== chatId) {
      chatId = nextChat;
      models = [];
      modelSnapshotKnown = false;
      lastModelSignature = '';
    }
    if (!chatId) return;
    const options = modelOptions();
    if (!options.length) return;
    const signature = options.map(item => item.id + ':' + item.name).join('|');
    if (signature !== lastModelSignature) {
      lastModelSignature = signature;
      adoptModels(options);
    }
  }

  // 명령어 등록 후 PC 키 설정 UI를 준비한다.
  async function boot() {
    await storageReady;
    // 설치 여부와 관계없이 이 스크립트가 F9의 변경·해제 상태까지 관리한다.
    doc.documentElement.setAttribute('data-cc-immersion-shortcut-managed', '');
    ensureUI();
    syncPage();
  }
  page.CrackCommandline.register({ id: 'crack-key-settings', label: '키설정', useDatabse: false, lambda: openSettings });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => boot().catch(showError), { once: true });
  else boot().catch(showError);
  page.addEventListener('pagehide', () => {
    suspended = true;
    page.cancelAnimationFrame(syncFrame);
    syncFrame = 0;
  });
  page.addEventListener('pageshow', event => {
    if (event.persisted && suspended) {
      suspended = false;
      boot().catch(showError);
    }
  });
})();

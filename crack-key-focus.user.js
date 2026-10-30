// ==UserScript==
// @name         크랙 키앤포커스
// @namespace    crack-commandline
// @version      1.0.0.2
// @description  !키설정으로 단축키·몰입모드·대사 테마를 설정합니다. 설정과 화자 이미지는 이 브라우저에만 저장합니다.
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @noframes
// @require      https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-core.js
// @resource     ccCommon https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/scripts/crack-commandline-common.css
// @grant        unsafeWindow
// @grant        GM_getResourceText
// ==/UserScript==

/*
 * IndexedDB crack-key-focus-local: settings(설정), portraits(이름별 정사각형 이미지).
 * 채팅 본문·메시지 ID·인증 헤더는 저장하지 않는다.
 * 인증은 크랙 자체 요청에서 관찰한 헤더를 페이지 메모리에서만 사용한다.
 * GET으로 기록을 읽으며, 메시지 생성·수정·삭제 API는 호출하지 않는다.
 */
(() => {
  'use strict';
  const page = unsafeWindow;
  const doc = document;
  let suspended = false;
  const EDITOR = '.__chat_input_textarea[contenteditable="true"],textarea.__chat_input_textarea';
  const API_ORIGIN = 'https://crack-api.wrtn.ai';
  const own = node => node?.nodeType === 1 && (node.matches('[data-cc-focus-owned]') || !!node.closest('[data-cc-focus-owned]'));
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
    action('memory', '요약 메모리', '메모리', combo('KeyU', true, false, true), 'chat'),
    action('room', '채팅방 설정', '방설정', combo('Digit0', true), 'chat'),
    action('immersion', '몰입모드 토글', '몰입', combo('F9'), 'focus'),
    action('settings', '키앤포커스 설정', '키설정', combo('KeyS', true, true), 'focus'),
    action('suggest', '추천 답변 받기', '추천', combo('Slash', true), 'chat'),
    action('choice1', '추천 답변 1 선택', '답변1', combo('Digit1', true), 'chat'),
    action('choice2', '추천 답변 2 선택', '답변2', combo('Digit2', true), 'chat'),
    action('choice3', '추천 답변 3 선택', '답변3', combo('Digit3', true), 'chat'),
    action('image', '상황 이미지 생성', '이미지', combo('KeyK', true), 'chat'),
    action('situation', '상황 추가', '상황', combo('KeyE', true, false, true), 'chat'),
    action('regenerate', '답변 재생성', '재생성', combo('KeyR', true, true), 'chat'),
    action('search', '메시지 검색', '검색', combo('KeyC', false, true), 'focus')
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
  const colors = { chat: '#355765', model: '#614763', focus: '#786341', reserved: '#444f58' };
  const keyNames = { Backquote: '~', Minus: '−', Equal: '=', Backspace: 'Back', Tab: 'Tab', BracketLeft: '[', BracketRight: ']', Backslash: '\\', CapsLock: 'Caps', Semicolon: ';', Quote: "'", Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Win', MetaRight: 'Win', Space: 'Space', ContextMenu: 'Menu', Comma: ',', Period: '.', Slash: '/', Escape: 'Esc', PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Pause: 'Pause', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', NumLock: 'Num', NumpadDivide: '/', NumpadMultiply: '*', NumpadSubtract: '−', NumpadAdd: '+', NumpadEnter: 'Enter', NumpadDecimal: '.' };
  const keyName = code => keyNames[code] || code.replace(/^Key|^Digit|^Numpad/, '');
  const format = binding => binding ? [binding.ctrl && 'Ctrl', binding.alt && 'Alt', binding.shift && 'Shift', binding.meta && 'Win', keyName(binding.code)].filter(Boolean).join(' + ') : '미설정';
  const matches = (a, b) => a && b && a.code === b.code && ['ctrl', 'alt', 'shift', 'meta'].every(key => !!a[key] === !!b[key]);
  const mainRows = [
    [['Escape',1.3],['F1'],['F2'],['F3'],['F4'],['F5'],['F6'],['F7'],['F8'],['F9'],['F10'],['F11'],['F12']],
    ['Backquote', ...Array.from({length:9},(_,i)=>'Digit'+(i+1)), 'Digit0','Minus','Equal',['Backspace',2]],
    [['Tab',1.5], ...'QWERTYUIOP'.split('').map(k=>'Key'+k),'BracketLeft','BracketRight',['Backslash',1.5]],
    [['CapsLock',1.8], ...'ASDFGHJKL'.split('').map(k=>'Key'+k),'Semicolon','Quote',['Enter',2.2]],
    [['ShiftLeft',2.3], ...'ZXCVBNM'.split('').map(k=>'Key'+k),'Comma','Period','Slash',['ShiftRight',2.7]],
    [['ControlLeft',1.4],['MetaLeft',1.1],['AltLeft',1.2],['Space',6.3],['AltRight',1.2],['ContextMenu',1.2],['ControlRight',1.6]]
  ];
  const navRows = [['PrintScreen','ScrollLock','Pause'],['Insert','Home','PageUp'],['Delete','End','PageDown'],[null,null,null],[null,'ArrowUp',null],['ArrowLeft','ArrowDown','ArrowRight']];
  const numRows = [[null,null,null,null],['NumLock','NumpadDivide','NumpadMultiply','NumpadSubtract'],['Numpad7','Numpad8','Numpad9','NumpadAdd'],['Numpad4','Numpad5','Numpad6',null],['Numpad1','Numpad2','Numpad3','NumpadEnter'],[['Numpad0',2],'NumpadDecimal',null]];
  const presets = [
    {name:'이름 + 대사',hint:'**이름 |** "대사"',sample:'**루엔 |** "별이 사라져도, 이 길의 끝에서 기다리겠습니다."',regex:'^\\*\\*(?<name>[^|｜*]+)\\s*[|｜]\\*\\*\\s*["“](?<speech>[^"”\\n]+)["”]$'},
    {name:'외국어 대사 + 번역',hint:'**이름 |** "대사"\n(한국어 번역)',sample:'**Aerin |** "Even the longest night gives way to dawn."\n(가장 긴 밤도 결국 새벽에게 길을 내어주지요.)',regex:'^\\*\\*(?<name>[^|｜*]+)\\s*[|｜]\\*\\*\\s*["“](?<speech>[^"”]+)["”]\\s*\\((?<translation>[^)]+)\\)$'},
    {name:'장식 이름 + 번역명',hint:'⧙ **이름** *번역명* ⧙\n❝ 대사 *번역* ❞',sample:'⧙ **Aerin** *에린* ⧙\n❝ Follow the silver light. *은빛을 따라오세요.* ❞',regex:'^⧙\\s*\\*\\*(?<name>[^*]+)\\*\\*\\s*\\*(?<translatedName>[^*]+)\\*\\s*⧙\\s*❝\\s*(?<speech>[^*]+?)\\s*\\*(?<translation>[^*]+)\\*\\s*❞$'},
    {name:'원문 + 발음 + 번역',hint:'⧙ 이름 번역명 ⧙\n"원문 / 한글 발음 / 번역"',sample:'⧙ Aerin 에린 ⧙\n" Lux inter tenebras.\n룩스 인테르 테네브라스.\n어둠 속에서도 빛은 남아 있습니다. "',regex:'^⧙\\s*(?<name>\\S+)\\s+(?<translatedName>[^⧙]+?)\\s*⧙\\s*"\\s*(?<speech>[^\\n]+)\\n(?<pronunciation>[^\\n]+)\\n(?<translation>[^"\\n]+?)\\s*"$'}
  ];
  const themes = [['none','미설정','—'],['fantasy','판타지','✦'],['dark','정통 판타지','⚜'],['game','게임 말풍선','···'],['sf','SF 통신','⌁'],['urban','어반 판타지','↗'],['noir','느와르','◒'],['ink','수묵','墨'],['terminal','터미널','>_'],['letter','편지','✉'],['comic','코믹','!'],['glass','글라스','◌']];
  const SETTINGS_HTML = "  <div class=\"settings-scrim\" id=\"settings-scrim\" hidden>\n    <section class=\"cc-ui ui-window focus-window\" id=\"focus-window\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"settings-title\">\n      <header class=\"window-header\"><div class=\"identity\"><div class=\"brand-mark\" aria-hidden=\"true\">&gt;_</div><div><div class=\"eyebrow\">CRACK COMMANDLINE</div><h1 id=\"settings-title\">키앤포커스 설정</h1></div></div><div class=\"header-end\"><span class=\"local-label\">설정은 이 기기에만 저장</span><button class=\"icon-button\" id=\"close-settings\" aria-label=\"설정 닫기\">×</button></div></header>\n      <nav class=\"settings-tabs\" role=\"tablist\" aria-label=\"설정 분류\"><button id=\"keys-tab\" role=\"tab\" aria-selected=\"true\" aria-controls=\"keys-panel\" data-tab=\"keys\">⌨ 키 설정</button><button id=\"immersion-tab\" role=\"tab\" aria-selected=\"false\" aria-controls=\"immersion-panel\" data-tab=\"immersion\">◇ 몰입 · 대사 강조</button></nav>\n\n      <div id=\"keys-panel\" class=\"keys-panel\" role=\"tabpanel\" aria-labelledby=\"keys-tab\">\n        <div class=\"keyboard-toolbar\"><div class=\"modifier-filters\" role=\"group\" aria-label=\"보조키 조합\"><button aria-pressed=\"true\" data-mod=\"all\">전체 배정</button><i></i><button aria-pressed=\"false\" data-mod=\"ctrl\">Ctrl</button><button aria-pressed=\"false\" data-mod=\"alt\">Alt</button><button aria-pressed=\"false\" data-mod=\"shift\">Shift</button><span id=\"layer-label\">모든 조합을 한눈에</span></div><div class=\"key-legend\"><span class=\"legend-chat\">채팅</span><span class=\"legend-model\">모델</span><span class=\"legend-focus\">몰입</span><span class=\"legend-reserved\">예약 조합</span></div></div>\n        <div class=\"keyboard\" id=\"keyboard\" aria-label=\"단축키 배정 키보드\"></div>\n        <div class=\"action-columns\" id=\"action-columns\"></div>\n      </div>\n\n      <div id=\"immersion-panel\" class=\"immersion-panel\" role=\"tabpanel\" aria-labelledby=\"immersion-tab\" hidden>\n        <div class=\"immersion-options\">\n          <section class=\"section\"><div class=\"section-heading\"><div class=\"section-title\"><span class=\"section-number\">01</span><h2>몰입 화면</h2></div></div>\n            <label class=\"setting-line\"><span>왼쪽 채팅 목록 숨기기</span><input class=\"switch\" id=\"hide-left\" type=\"checkbox\" checked></label>\n            <label class=\"setting-line\"><span>사이트 상단 메뉴 숨기기</span><input class=\"switch\" id=\"hide-top\" type=\"checkbox\" checked></label>\n            <label class=\"setting-line\"><span>진입할 때 오른쪽 메뉴 닫기</span><input class=\"switch\" id=\"close-right\" type=\"checkbox\" checked></label>\n            <label class=\"setting-line\"><span>입력창 자동 늘리기<small>최대 화면 높이의 50%</small></span><input class=\"switch\" id=\"auto-grow\" type=\"checkbox\" checked></label>\n            <label class=\"setting-line\"><span>턴 슬라이더 표시</span><input class=\"switch\" id=\"show-slider\" type=\"checkbox\" checked></label>\n          </section>\n          <section class=\"section\"><div class=\"section-heading\"><div class=\"section-title\"><span class=\"section-number\">02</span><h2>대사 인식 패턴</h2></div></div><div id=\"preset-list\" class=\"preset-list\" role=\"group\" aria-label=\"대사 패턴\"></div>\n            <div id=\"custom-pattern\" hidden><label class=\"field-label\" for=\"regex-input\">인식할 정규식</label><textarea id=\"regex-input\" class=\"text-input regex-input\" spellcheck=\"false\" aria-label=\"대사 인식 정규식\"></textarea>\n              <details class=\"regex-guide\"><summary>처음 만드는 정규식</summary><ol><li>원문의 고정 기호를 그대로 적습니다.</li><li>바뀌는 부분을 아래 그룹으로 바꿉니다.</li><li>오른쪽 원문으로 인식 결과를 확인합니다.</li></ol><div class=\"guide-example\"><span>원문</span><code>에린: 안녕!</code><span>정규식</span><code>^(?&lt;name&gt;.+?): (?&lt;speech&gt;.+)$</code></div><dl><dt><code>(?&lt;name&gt;.+?)</code></dt><dd>화자 이름</dd><dt><code>(?&lt;translatedName&gt;.+?)</code></dt><dd>번역된 이름</dd><dt><code>(?&lt;speech&gt;.+?)</code></dt><dd>대사 · 필수</dd><dt><code>(?&lt;translation&gt;.+?)</code></dt><dd>한국어 번역</dd><dt><code>(?&lt;pronunciation&gt;.+?)</code></dt><dd>한글 발음</dd></dl><p><code>.+?</code> 짧게 읽기 · <code>\\n</code> 줄바꿈</p><p><code>\\*</code> 별표 · <code>\\|</code> 세로줄 · <code>&quot;</code> 따옴표 그대로</p><p><code>^</code> 시작 · <code>$</code> 끝 · <code>.+</code> 한 글자 이상</p><p><code>[\\s\\S]+?</code> 줄바꿈도 포함해 읽기</p><p>없는 항목의 그룹은 생략하세요.</p><p>양끝의 <code>/</code> 없이 식만 입력합니다.</p><button class=\"button subtle\" id=\"load-regex-example\">이 예제로 시작</button></details>\n            </div></section>\n        </div>\n        <div class=\"dialogue-options\">\n          <div class=\"appearance-grid\"><section class=\"section\"><div class=\"section-heading\"><div class=\"section-title\"><span class=\"section-number\">03</span><h2>대사 테마</h2></div></div><div class=\"theme-picker\" id=\"theme-picker\" role=\"group\" aria-label=\"대사 테마\"></div></section>\n          <section class=\"section speaker-section\"><div class=\"section-heading\"><div class=\"section-title\"><span class=\"section-number\">04</span><h2>화자 이미지</h2></div></div><form id=\"speaker-form\" class=\"speaker-form\"><input id=\"speaker-name\" class=\"text-input\" placeholder=\"원문에 나오는 이름\" aria-label=\"이미지를 연결할 화자 이름\" value=\"\"><button class=\"button subtle\" type=\"submit\">이미지 등록</button></form><input id=\"speaker-file\" type=\"file\" accept=\"image/png,image/webp,image/jpeg,image/gif\" hidden><small class=\"speaker-help\">이름당 1장 · 정사각형 · PNG / WebP 투명 지원</small><div id=\"speaker-list\" class=\"speaker-list\"></div></section></div>\n          <section class=\"sample-section\"><div class=\"sample-heading\"><h2>실시간 미리보기</h2><div class=\"sample-tools\"><span id=\"sample-match\">패턴 인식됨</span><div class=\"scene-mode\" role=\"group\" aria-label=\"채팅 배경 미리보기\"><button data-scene-mode=\"dark\" aria-pressed=\"true\">☾ 다크</button><button data-scene-mode=\"light\" aria-pressed=\"false\">☀ 라이트</button></div></div></div><div id=\"dialogue-preview\" class=\"dialogue-preview\"></div><label class=\"field-label\" for=\"sample-input\">예시 원문 <span>직접 바꿔볼 수 있습니다</span></label><textarea id=\"sample-input\" class=\"text-input sample-input\" spellcheck=\"false\"></textarea></section>\n        </div>\n      </div>\n      <footer class=\"window-footer\"><div class=\"shortcut\">명령어 <kbd>!키설정</kbd></div><div class=\"footer-actions\"><button class=\"button subtle\" id=\"reset-keys\">키 설정 초기화</button><button class=\"button subtle\" id=\"save-preview\">설정 저장</button><button class=\"button subtle\" id=\"cancel-settings\">취소</button></div></footer>\n    </section>\n  </div>\n<div class=\"cc-ui key-popover\" id=\"key-popover\" role=\"tooltip\" hidden></div><div class=\"cc-ui preview-toast\" id=\"toast\" role=\"status\" hidden></div>";
  const baseBindings = Object.fromEntries(actions.map(item => [item.id, item.binding]));
  function defaultSettings() {
    return { version: 1, bindings: { ...baseBindings }, hideLeft: true, hideTop: true, closeRight: true,
      autoGrow: true, showSlider: true, theme: 'none', pattern: 0, customRegex: presets[0].regex };
  }
  function normalizeSettings(value) {
    const next = defaultSettings();
    if (!value || value.version !== 1) return next;
    for (const key of ['hideLeft', 'hideTop', 'closeRight', 'autoGrow', 'showSlider']) {
      if (typeof value[key] === 'boolean') next[key] = value[key];
    }
    if (themes.some(([id]) => id === value.theme)) next.theme = value.theme;
    if (value.pattern === 'custom' || Number.isInteger(value.pattern) && presets[value.pattern]) next.pattern = value.pattern;
    if (typeof value.customRegex === 'string') next.customRegex = value.customRegex.slice(0, 4096);
    for (const [id, binding] of Object.entries(value.bindings || {})) {
      if (!Object.hasOwn(baseBindings, id) && !id.startsWith('model:')) continue;
      if (binding === null) { next.bindings[id] = null; continue; }
      if (!binding || typeof binding.code !== 'string' || !binding.code || binding.code.length > 40) continue;
      if (binding.code === 'Escape' && id !== 'blur' || isBang(binding)) continue;
      next.bindings[id] = combo(binding.code, !!binding.ctrl, !!binding.alt, !!binding.shift, !!binding.meta);
    }
    return next;
  }
  function isBang(binding) { return binding?.code === 'Digit1' && binding.shift && !binding.ctrl && !binding.alt && !binding.meta; }
  function normalizeName(name) { return String(name || '').replace(/\*\*/g, '').trim().normalize('NFKC').replace(/\s+/g, ' '); }
  let settings = defaultSettings();
  let portraits = new Map();
  let draft = null;
  let draftPortraits = null;
  let database;
  let storageError = false;
  const storageReady = new Promise((resolve, reject) => {
    const request = page.indexedDB.open('crack-key-focus-local', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('settings');
      request.result.createObjectStore('portraits', { keyPath: 'name' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      database = request.result;
      database.onversionchange = () => database.close();
      const transaction = database.transaction(['settings', 'portraits']);
      const config = transaction.objectStore('settings').get('current');
      const images = transaction.objectStore('portraits').getAll();
      transaction.oncomplete = () => {
        settings = normalizeSettings(config.result);
        portraits = new Map((images.result || []).filter(item => typeof item.name === 'string' && item.blob instanceof page.Blob).map(item => [normalizeName(item.name), item.blob]));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }).catch(() => { storageError = true; });
  async function persist(next, images) {
    await storageReady;
    if (!database || storageError) throw new Error('이 브라우저의 로컬 저장소를 열 수 없습니다.');
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(['settings', 'portraits'], 'readwrite');
      transaction.objectStore('settings').put(next, 'current');
      const store = transaction.objectStore('portraits');
      for (const name of portraits.keys()) if (!images.has(name)) store.delete(name);
      for (const [name, blob] of images) if (portraits.get(name) !== blob) store.put({ name, blob });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error('저장 공간을 확인해주세요. 설정을 저장하지 못했습니다.'));
      transaction.onabort = () => reject(new Error('설정 저장을 완료하지 못했습니다.'));
    });
  }

  // 인증값은 이 클로저에만 남고 IndexedDB·로그·DOM·postMessage로 보내지 않는다.
  let authorization = '';
  const authWaiters = new Set();
  const nativeFetch = page.fetch.bind(page);
  const xhrRecords = new WeakMap();
  const xhrOpen = page.XMLHttpRequest.prototype.open;
  const xhrHeader = page.XMLHttpRequest.prototype.setRequestHeader;
  const xhrSend = page.XMLHttpRequest.prototype.send;
  function apiUrl(input) {
    try { const url = new page.URL(typeof input === 'string' ? input : input.url, page.location.href); return url.origin === API_ORIGIN ? url : null; }
    catch { return null; }
  }
  function observeAuthorization(url, headers) {
    if (!url) return;
    const value = new page.Headers(headers).get('authorization');
    if (!value || !/^Bearer\s+\S+/i.test(value)) return;
    authorization = value;
    for (const resolve of authWaiters) resolve();
    authWaiters.clear();
  }
  function messageRoute(url) {
    const match = url?.pathname.match(/^\/crack-gen\/v3\/chats\/([^/]+)\/messages(?:\/|$)/);
    return match?.[1] || null;
  }
  page.fetch = function (input, init) {
    const url = apiUrl(input);
    if (url) {
      observeAuthorization(url, init?.headers || (typeof input === 'object' ? input.headers : undefined));
      if (messageRoute(url)) restoreHighlights();
    }
    return nativeFetch(input, init).then(response => {
      if (messageRoute(url)) {
        restoreHighlights(); scheduleSync();
        if ((init?.method || input?.method || 'GET').toUpperCase() === 'GET' && response.ok) {
          response.clone().json().then(value => ingestNative(url, value)).catch(() => {});
        } else if (['DELETE', 'PATCH', 'PUT'].includes((init?.method || '').toUpperCase())) invalidateIndex();
      }
      return response;
    });
  };
  page.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    xhrRecords.set(this, { method: String(method).toUpperCase(), url: apiUrl(String(url)), headers: {} });
    return xhrOpen.call(this, method, url, ...rest);
  };
  page.XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
    const record = xhrRecords.get(this);
    if (record?.url && key.toLowerCase() === 'authorization') {
      record.headers.authorization = value;
      observeAuthorization(record.url, record.headers);
    }
    return xhrHeader.call(this, key, value);
  };
  page.XMLHttpRequest.prototype.send = function (...args) {
    const record = xhrRecords.get(this);
    if (messageRoute(record?.url)) {
      restoreHighlights();
      this.addEventListener('load', () => {
        restoreHighlights(); scheduleSync();
        if (this.status < 200 || this.status >= 300) return;
        if (record.method !== 'GET') { if (['DELETE', 'PATCH', 'PUT'].includes(record.method)) invalidateIndex(); return; }
        try { ingestNative(record.url, this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); }
        catch { /* 스트림과 바이너리는 기록 목록이 아니다. */ }
      }, { once: true });
    }
    return xhrSend.apply(this, args);
  };
  async function requireAuthorization() {
    if (authorization) return;
    await new Promise((resolve, reject) => {
      const done = () => { page.clearTimeout(timer); resolve(); };
      const timer = page.setTimeout(() => { authWaiters.delete(done); reject(new Error('크랙 요청을 기다리고 있습니다. 메시지 검색을 한 번 열거나 페이지를 새로고침해주세요.')); }, 8000);
      authWaiters.add(done);
    });
  }
  async function readMessages(path, signal) {
    await requireAuthorization();
    const response = await nativeFetch(API_ORIGIN + '/crack-gen/v3/chats/' + encodeURIComponent(chatId) + '/messages' + path, {
      method: 'GET', headers: { authorization }, credentials: 'include', signal,
    });
    if (response.status === 401 || response.status === 403) throw new Error('크랙 인증을 갱신한 뒤 다시 시도해주세요.');
    if (!response.ok) throw new Error('기록을 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.');
    const value = await response.json();
    if (!value.data || !Array.isArray(value.data.messages)) throw new Error('크랙의 기록 응답 형식이 변경되었습니다.');
    return value.data;
  }

  let chatId = '';
  let immersive = false;
  let routeGeneration = 0;
  let metadata = new Map();
  let turns = [];
  let ordinal = new Map();
  let indexComplete = false;
  let indexJob = null;
  let indexAbort = null;
  let latestMessageId = '';
  let pendingTurn = null;
  let seeking = false;
  let aroundTimer;
  let latestRefresh = null;
  let lastRefreshAt = 0;
  function currentChatId() { return suspended ? '' : page.location.pathname.match(/\/episodes\/([^/?#]+)/)?.[1] || ''; }
  function remember(messages) {
    for (const item of messages) {
      if (!item || typeof item._id !== 'string' || !['user', 'assistant'].includes(item.role)) continue;
      metadata.set(item._id, { id: item._id, role: item.role, turnId: item.turnId, parentTurnId: item.parentTurnId,
        createdAt: item.createdAt || '', status: item.status });
    }
  }
  function buildTurns() {
    const byTurn = new Map([...metadata.values()].filter(item => item.turnId).map(item => [item.turnId, item]));
    const latest = metadata.get(latestMessageId);
    if (!latest) return;
    const chain = [];
    const visited = new Set();
    let item = latest;
    while (item && !visited.has(item.id)) {
      chain.push(item); visited.add(item.id);
      item = item.parentTurnId ? byTurn.get(item.parentTurnId) : null;
    }
    chain.reverse();
    turns = []; ordinal = new Map();
    let turn = 0;
    for (const message of chain) {
      if (message.role === 'user') turn += 1;
      turns[turn] = { id: message.id };
      ordinal.set(message.id, turn);
    }
    if (!turns[0] && turns[1]) turns[0] = turns[1];
    updateChronicle();
  }
  function ingestNative(url, value) {
    if (messageRoute(url) !== chatId || !Array.isArray(value?.data?.messages)) return;
    const messages = value.data.messages;
    remember(messages);
    const isLatestPage = !url.pathname.endsWith('/around') && !url.searchParams.has('cursor') && url.searchParams.get('sortOrder') !== 'asc';
    if (isLatestPage && messages[0]?._id) latestMessageId = messages[0]._id;
    if (indexComplete) buildTurns();
    scheduleSync();
  }
  function invalidateIndex() {
    indexComplete = false;
    indexAbort?.abort(); indexJob = null;
    if (immersive) startIndex().catch(showError);
  }
  function refreshLatest() {
    if (!indexComplete || latestRefresh || Date.now() - lastRefreshAt < 1500) return;
    const newest = doc.querySelector('[data-message-group-id]')?.dataset.messageGroupId.replace(/^search:/, '');
    if (!newest || metadata.has(newest)) return;
    const generation = routeGeneration;
    lastRefreshAt = Date.now();
    latestRefresh = readMessages('?limit=200&sortOrder=desc').then(data => {
      if (generation !== routeGeneration || suspended) return;
      remember(data.messages);
      if (data.messages[0]?._id) latestMessageId = data.messages[0]._id;
      buildTurns();
    }).catch(showError).finally(() => { latestRefresh = null; });
  }
  async function startIndex() {
    if (indexComplete || !chatId) return;
    if (indexJob) return indexJob;
    const generation = routeGeneration;
    const controller = new page.AbortController();
    indexAbort = controller;
    indexJob = (async () => {
      updateChronicle('기록 연결 중');
      let cursor = '';
      const seen = new Set();
      do {
        const query = new page.URLSearchParams({ limit: '200', sortOrder: 'desc' });
        if (cursor) query.set('cursor', cursor);
        const data = await readMessages('?' + query, controller.signal);
        if (generation !== routeGeneration) return;
        remember(data.messages);
        if (!cursor && data.messages[0]?._id) latestMessageId = data.messages[0]._id;
        cursor = data.hasNext === false || !data.messages.length ? '' : data.nextCursor || '';
        if (cursor && seen.has(cursor)) throw new Error('기록 커서가 반복되어 조회를 중단했습니다.');
        seen.add(cursor);
        updateChronicle('기록 ' + metadata.size + '개 확인');
      } while (cursor && !controller.signal.aborted);
      if (generation !== routeGeneration || controller.signal.aborted) return;
      indexComplete = true; buildTurns();
    })().finally(() => {
      if (indexAbort === controller) { indexJob = null; indexAbort = null; }
    });
    return indexJob;
  }
  let uiHost, ui, uiShell;
  let waitingId = null;
  let heldModifier = null;
  let activeTab = 'keys';
  let allLayers = true;
  const modifiers = { ctrl: false, alt: false, shift: false };
  let models = [];
  let modelSnapshotKnown = false;
  let saving = false;
  let toastTimer;
  let previewRevision = 0;
  const imageUrls = new Map();
  const $ = id => ui?.getElementById(id);
  const focusCSS = "/* 별에서 이어지는 한 줄의 항로. 눈금 없이 턴 비율만 표시한다. */\n.chronicle { position:absolute; left:20px; top:95px; bottom:145px; width:70px; z-index:3; display:flex; flex-direction:column; align-items:center; color:#cbb485; }\n.chronicle-cap { width:47px; height:47px; flex-shrink:0; position:relative; z-index:2; filter:drop-shadow(0 0 8px #cfa76544); }\n.chronicle-cap svg { width:100%; height:100%; fill:#263036; stroke:#c6ab77; stroke-width:1; }\n.chronicle-cap svg path:first-of-type { fill:#d2b780; stroke:none; }\n.chronicle-scale { flex:1; width:100%; min-height:100px; position:relative; margin-top:-1px; }\n.chronicle-spine { position:absolute; left:calc(50% - 1px); top:0; bottom:0; width:2px; background:#293337; box-shadow:0 0 0 1px #96805a44; }\n.chronicle-fill { height:60%; background:linear-gradient(#b99c66,#f2d9a1); width:100%; box-shadow:0 0 8px #d9b67544; }\n.chronicle-gem { position:absolute; left:50%; top:60%; width:13px; height:13px; border:1px solid #f4db9d; border-radius:50%; transform:translate(-50%,-50%); background:radial-gradient(circle,#fff3c9,#b28f51 50%,#37403f 60%); box-shadow:0 0 0 3px #c5a66d22,0 0 14px #e4c98480; pointer-events:none; }\n#turn-range { position:absolute; left:-17px; top:-8px; width:36px; height:calc(100% + 16px); margin:0; writing-mode:vertical-lr; direction:ltr; opacity:0; cursor:pointer; }\n.chronicle-spine:focus-within { outline:1px solid #ddc394; outline-offset:8px; }\n.chronicle-position { display:flex; align-items:baseline; gap:5px; padding-top:13px; font-family:Georgia,serif; font-variant-numeric:tabular-nums; white-space:nowrap; }\n.chronicle-position strong { font-size:19px; font-weight:400; color:#e4cfa4; }\n.chronicle-position i { font-size:12px; font-weight:400; font-style:italic; color:#756c57; }\n.chronicle-position small { color:#9a8c71; font-size:12px; }\n.demo-app:not(.immersive) .chronicle { display:none; }\n\n/* 게임도감 공용 프레임 위에 키보드와 설정 내용만 추가한다. */\n.settings-scrim { position: fixed; inset: 52px 0 0; background: #060b10a8; backdrop-filter: blur(3px); display: grid; place-items: center; z-index: 20; padding: 18px 22px; }\n.cc-ui.focus-window { width: min(1180px,100%); height: min(850px,calc(100dvh - 90px)); display: flex; flex-direction: column; overflow: hidden; --inset: 22px; }\n.focus-window .window-header { padding-top: 13px; padding-bottom: 12px; min-height: 72px; }\n.focus-window h1 { font-size: 22px; }\n.header-end { display: flex; align-items: center; gap: 20px; }\n.local-label { color: #9ca89e; font-size: 10px; }\n.focus-window .header-end .icon-button { border: 1px solid #74674d; background: var(--plate); font-size: 23px; width: 28px; height: 28px; }\n.settings-tabs { display: flex; align-items: stretch; padding: 0 22px; border-bottom: 1px solid #81704a66; background: #111a2180; min-height: 39px; flex-shrink: 0; }\n.settings-tabs [role=tab] { padding: 9px 22px; font-size: 11px; color: #8e9a9e; border-bottom: 2px solid transparent; }\n.settings-tabs [aria-selected=true] { color: #efd5a2; border-bottom-color: #c5a771; background: linear-gradient(0deg,#c5a77119,transparent); }\n.settings-tabs > span { margin-left: auto; color: #78868a; font-size: 10px; align-self: center; }\n.keys-panel { flex: 1; min-height: 0; padding: 12px 22px 0; display: flex; flex-direction: column; overflow: auto; scrollbar-width: thin; scrollbar-color: #75644377 transparent; }\n.keyboard-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 11px; }\n.modifier-filters { display: flex; gap: 4px; align-items: center; }\n.modifier-filters button { border: 1px solid #525c60; background: #19232b; border-radius: 2px; padding: 3px 11px; font: 10px/1.7 Consolas,'Malgun Gothic',sans-serif; }\n.modifier-filters button[aria-pressed=true] { background: #c7ac78; border-color: #e3cca1; color: #192027; box-shadow: inset 0 1px #ffe9ba66; }\n.modifier-filters i { width: 1px; height: 18px; margin: 0 5px; background: #56605a; }\n#layer-label { margin-left: 7px; color: #95a29f; font-size: 10px; }\n.key-legend { display: flex; gap: 12px; font-size: 9px; color: #a7b1b1; }\n.key-legend span::before { content: ''; width: 5px; height: 5px; background: var(--key-color); display: inline-block; margin: 0 5px 1px 0; }\n.legend-chat { --key-color: #76a4b7; }.legend-model { --key-color: #c094bd; }.legend-focus { --key-color: #c3a772; }.legend-reserved { --key-color: #75818a; }\n.keyboard { background: linear-gradient(145deg,#131b22,#1d2730); border: 1px solid #59615e; border-bottom: 3px solid #080e13; border-radius: 5px; box-shadow: inset 0 0 0 3px #0b1319,0 6px 12px #0004; padding: 10px; display: grid; grid-template-columns: minmax(0,15fr) minmax(0,3fr) minmax(0,4fr); gap: 11px; flex-shrink: 0; }\n.keyboard-main,.keyboard-nav,.keyboard-numpad { display: flex; flex-direction: column; gap: 4px; min-width: 0; }\n.keyboard-row { display: flex; gap: 4px; min-width: 0; }\n.keyboard-row.function-row { margin-bottom: 6px; }\n.cc-ui .keyboard-key { position: relative; flex: var(--u,1) 1 0; min-width: 0; height: 45px; padding: 0; text-align: left; border: 1px solid #65707877; border-bottom: 3px solid #0a1016; border-radius: 3px; background: linear-gradient(#3c4650,#29343e); box-shadow: inset 0 1px #e9eff315,0 1px #000; overflow: hidden; }\n.keyboard-key .key-label { position: absolute; left: 5px; top: 2px; z-index: 3; font: 9px/1.4 Consolas,sans-serif; color: #c6cdcd; text-shadow: 0 1px #000; }\n.keyboard-key .key-slices { position: absolute; inset: 0; display: flex; flex-direction: column; }\n.key-slice { background: var(--slice-bg,#36434d); flex: 1; min-height: 0; display: flex; justify-content: flex-end; align-items: center; padding: 0 3px 0 14px; font: 8px/1.1 'Malgun Gothic',sans-serif; color: #e0ebea; white-space: nowrap; overflow: hidden; }\n.key-slices.two .key-slice { position: absolute; inset: 0; clip-path: polygon(0 0,100% 0,100% 100%); align-items: flex-start; padding-top: 4px; }\n.key-slices.two .key-slice + .key-slice { clip-path: polygon(0 0,0 100%,100% 100%); align-items: flex-end; justify-content: flex-start; padding: 0 0 3px 4px; }\n.key-slices.many .key-slice { font-size: 7px; }\n.keyboard-key[data-selected=true] { border-color: #e6c98e; box-shadow: 0 0 0 1px #e6c98e,0 0 10px #d0ad6330; }\n.keyboard-key:hover { filter: brightness(1.2); }\n.key-spacer { flex: var(--u,1) 1 0; min-width: 0; height: 45px; }\n.action-columns { margin-top:8px; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 17px; flex: 1; padding-bottom: 12px; align-content: start; }\n.action-group h2 { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #c4ad84; padding: 6px 0 6px 8px; border-left: 2px solid #a28b5f; background: linear-gradient(90deg,#ac95601c,transparent); margin-bottom: 5px; }\n.action-group h2 small { margin-left: auto; padding-right: 5px; color: #78898b; font: 9px Consolas,monospace; }\n.binding-row { display: flex; min-height: 25px; border-bottom: 1px solid #59645e22; align-items: center; gap: 2px; }\n.binding-row > .binding-button { display: flex; flex: 1; min-width: 0; align-items: center; justify-content: space-between; gap: 4px; padding: 3px 4px; text-align: left; color: #c2cdca; font-size: 10px; }\n.binding-row:hover { background: #d4bf8b0b; }\n.binding-button kbd { font-size: 9px; line-height: 1.1; padding: 2px 4px; border-color: #596660; white-space: nowrap; color: #c9c5ae; }\n.binding-button kbd.unbound { color: #67777e; border-color: transparent; background: none; box-shadow: none; }\n.binding-row.is-waiting { background: #b39a5d1f; outline: 1px solid #c7ad7160; }\n.binding-row .unbind { width: 16px; flex-shrink: 0; color: #67757b; padding: 0; font: 13px Consolas,monospace; }\n.binding-row .unbind:hover { color: #e6b3a3; }\n.binding-row .unbind:disabled { opacity: .15; }\n.focus-window .window-footer { padding-top: 9px; padding-bottom: 9px; min-height: 52px; }\n.footer-actions { display: flex; gap: 7px; }\n.prototype-note { color: #6f8085; margin-left: 12px; font-size: 9px; }\n\n.immersion-panel { flex: 1; min-height: 0; overflow: auto; padding: 3px 22px 16px; display: grid; grid-template-columns: 320px minmax(0,1fr); gap: 28px; scrollbar-width: thin; scrollbar-color: #75644377 transparent; }\n.immersion-panel .section { padding: 14px 0; }\n.setting-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 37px; font-size: 11px; color: #c5ceca; border-bottom: 1px solid #63706a1a; }\n.setting-line small { color: #7d8d91; display: block; font-size: 9px; }\n.switch { appearance: none; width: 29px; height: 15px; border: 1px solid #68716b; background: #101820; border-radius: 9px; position: relative; flex-shrink: 0; cursor: pointer; margin: 0; }\n.switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 9px; height: 9px; background: #718086; border-radius: 50%; transition: transform .12s; }\n.switch:checked { background: #b3975c55; border-color: #c8ac75; }.switch:checked::after { background: #e5ce9f; transform: translateX(14px); }\n.preset-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; }\n.preset-choice:last-child { grid-column:1 / -1; }\n.cc-ui .preset-choice { text-align: left; border: 1px solid #56635f; padding: 7px 10px; background: #131e25a3; border-radius: 2px; position: relative; }\n.preset-choice strong { display: block; font-size: 10px; font-weight: 500; color: #b9c7c6; }\n.preset-choice code { display: block; font-size: 9px; color: #748b93; margin-top: 3px; white-space: pre-line; line-height: 1.5; }\n.preset-choice[aria-pressed=true] { border-color: #b79b67; background: #9e885018; }.preset-choice[aria-pressed=true]::after { content: '✓'; position: absolute; top: 6px; right: 9px; color: #d8bb7e; }\n.preset-choice[aria-pressed=true] strong { color: #e1c89d; }\n#custom-pattern { margin-top:9px; font-size:10px; color:#a5b4b4; }\n.cc-ui .regex-input { display:block; min-height:62px; height:62px; resize:vertical; font:10px/1.6 Consolas,monospace; overflow-wrap:anywhere; }\n.regex-guide { margin-top:7px; border-top:1px solid #66716b44; padding-top:6px; }\n.regex-guide summary { cursor:pointer; color:#c9b98f; }\n.regex-guide ol { padding-left:18px; font-size:10px; line-height:2; margin:7px 0; }\n.regex-guide p { margin:5px 0; font-size:9px; }\n.regex-guide dl { display:grid; grid-template-columns:145px 1fr; gap:3px 10px; margin:8px 0; font-size:9px; }\n.regex-guide dt { font-family:Consolas,monospace; color:#dcc79c; }.regex-guide dd { margin:0; }\n.guide-example { display:grid; gap:3px; padding:7px; background:#101920; border-left:2px solid #9c865a; }\n.guide-example span { color:#7d9195; font-size:8px; }.guide-example code { font:9px/1.8 Consolas,monospace; white-space:nowrap; }\n.regex-guide .button { min-height:24px; font-size:9px; margin-top:5px; }\n.appearance-grid { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:20px; }\n.theme-picker { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; }\n.cc-ui .theme-choice { min-height:30px; display:flex; align-items:center; gap:6px; padding:3px 6px; border:1px solid #54605b; background:#172129; border-radius:2px; font-size:9px; color:#aeb8b5; white-space:nowrap; }\n.theme-choice[aria-pressed=true] { border-color:#d0b27a; color:#efdaad; background:#b79c5d1c; }\n.theme-art { flex-shrink:0; display:grid; place-items:center; width:23px; height:21px; color:#c8b486; font:16px Georgia,serif; border-radius:2px; background:#111a22; }\n.theme-art.fantasy { background:#263c3c; color:#bdd7cc; }.theme-art.dark { background:#302c27; color:#d4bd8f; }.theme-art.game { background:#2c3540; color:#bfcfe1; }\n.theme-art.sf { background:repeating-linear-gradient(0deg,#11474d 0 1px,#092d35 1px 3px); color:#7ffff2; }.theme-art.urban { background:#302c3a; color:#d4c9e5; }\n.theme-art.noir { background:#292a2d; color:#d7d2ce; }.theme-art.ink { background:#303536; color:#e0e2dc; }.theme-art.terminal { background:#1a292c; color:#b7d0cf; font:11px Consolas,monospace; }\n.theme-art.letter { background:#35322e; color:#ded3bf; }.theme-art.comic { background:#30333b; color:#e5d6d9; font-weight:900; }.theme-art.glass { background:linear-gradient(135deg,#79adcd44,#d2a4c522); color:#c7e8fb; }\n.speaker-form { display:flex; gap:5px; }\n.cc-ui .speaker-form input { width:0; flex:1; min-width:0; height:28px; padding:4px 7px; font-size:10px; }\n.speaker-form .button { min-height:28px; padding:3px 7px; font-size:9px; white-space:nowrap; }\n.speaker-help { display:block; color:#84979b; font-size:8px; margin:5px 0 8px; white-space:nowrap; }\n.speaker-list { display:grid; gap:4px; max-height:80px; overflow:auto; scrollbar-width:thin; }\n.speaker-row { display:flex; align-items:center; gap:7px; background:#111c23; border:1px solid #6d755f33; padding:2px 5px; min-height:32px; }\n.speaker-thumb { width:26px; height:26px; object-fit:cover; background:repeating-conic-gradient(#354247 0% 25%,#27333a 0% 50%) 0/8px 8px; }\n.speaker-edit { flex:1; min-width:0; text-align:left; font-size:10px; color:#c8d3cc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.speaker-remove { width:18px; color:#8c9a99; font-size:14px; }\n.sample-section { margin-top:8px; }\n.sample-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:7px; }\n.sample-heading h2 { color:#b9c5c3; font-size:11px; }.sample-heading span { color:#acc695; font-size:9px; }\n.dialogue-preview { min-height:140px; padding:10px 15px; background:radial-gradient(ellipse at 50% 0,#57604a14,transparent),#101a21; border:1px solid #59645b55; margin-bottom:9px; display:flex; align-items:center; }\n.dialogue-preview > * { width:100%; }\n.cc-ui .sample-input { height:88px; resize:vertical; font:10px/1.7 Consolas,'Malgun Gothic',sans-serif; color:#b1c5c5; }\n\n/* 바탕에 맞춰 색을 바꾸며, 테마의 구별은 프레임과 조판으로 만든다. */\n.dialogue { --paper:#232a32; --ink:#e5e9ed; --secondary:#c7cfd7; --subtle:#adb8c3; --edge:#53606c; --edge-soft:#53606c66; --accent:#c3d2df; --wash:#c3d2df0a; position:relative; display:flex; align-items:center; gap:10px; margin:13px 0; padding:9px 12px; color:var(--ink); font-size:13px; background:var(--paper); border:1px solid var(--edge); isolation:isolate; }\n[data-scene-mode=light] .dialogue { --paper:#f8f9fa; --ink:#28343d; --secondary:#46535f; --subtle:#586671; --edge:#a9b4be; --edge-soft:#a9b4be66; --accent:#455e71; --wash:#455e7108; }\n.dialogue-body { flex:1; min-width:0; position:relative; z-index:1; }\n.dialogue-name { display:flex; align-items:baseline; gap:7px; margin-bottom:2px; font:700 11px/1.5 Georgia,'Batang',serif; color:var(--accent); }\n.dialogue-name small { font:9px 'Malgun Gothic',sans-serif; color:var(--subtle); }\n.dialogue-speech { margin:0; font:13px/1.7 Georgia,'Batang',serif; white-space:pre-line; overflow-wrap:anywhere; }\n.dialogue-pronunciation { margin:1px 0 0; color:var(--subtle); font:10px/1.5 'Malgun Gothic',sans-serif; }\n.dialogue-translation { margin:3px 0 0; color:var(--secondary); font:12px/1.6 'Malgun Gothic',sans-serif; white-space:pre-line; }\n.speaker-portrait { display:block; width:54px; height:54px; flex-shrink:0; object-fit:cover; align-self:center; }\n\n/* 판타지: 은빛 별과 잔잔한 청록, 고서의 장식을 가볍게. */\n.dialogue[data-theme=fantasy] { --paper:#202f31; --ink:#e4ece7; --secondary:#c5d5cc; --subtle:#acbfb6; --edge:#6d8b85; --edge-soft:#6d8b8555; --accent:#c4dcd0; background:radial-gradient(ellipse at 0 0,#a6d1b312,transparent 65%),var(--paper); border-radius:2px 14px 2px 14px; border-block-color:var(--edge-soft); }\n[data-scene-mode=light] .dialogue[data-theme=fantasy] { --paper:#f1f6f2; --ink:#293e38; --secondary:#425c50; --subtle:#596e62; --edge:#8ca99c; --edge-soft:#8ca99c66; --accent:#406b57; }\n.dialogue[data-theme=fantasy]::after { content:'✧'; position:absolute; right:7px; top:0; color:var(--accent); font:19px Georgia,serif; }\n.dialogue[data-theme=fantasy] .speaker-portrait { width:59px; height:70px; margin:-10px 0 -9px -4px; object-fit:contain; object-position:bottom; align-self:flex-end; }\n.dialogue[data-theme=fantasy] .dialogue-name { letter-spacing:.04em; }\n\n/* 정통 판타지: 새긴 금속 테두리와 네 귀의 매듭 장식. */\n.dialogue[data-theme=dark] { --paper:#292a27; --ink:#e8e1d1; --secondary:#d1c7b3; --subtle:#b7ad98; --edge:#8d7a55; --edge-soft:#8d7a5566; --accent:#dac394; padding:10px 17px; border-block:3px double var(--edge); background:radial-gradient(ellipse at 50% 100%,#ac8e4f0b,transparent 70%),var(--paper); box-shadow:inset 0 0 14px #0003,0 2px 4px #0002; }\n[data-scene-mode=light] .dialogue[data-theme=dark] { --paper:#f0eadd; --ink:#39352e; --secondary:#514a3d; --subtle:#6c614f; --edge:#a68c60; --edge-soft:#a68c6066; --accent:#70572f; box-shadow:inset 0 0 14px #8c71420a,0 2px 4px #3d2d1610; }\n.medieval-frame { position:absolute; inset:0; pointer-events:none; z-index:2; color:var(--accent); }\n.medieval-frame::before { content:''; position:absolute; inset:3px; border:1px solid var(--edge-soft); clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px),0 12px); }\n.medieval-frame::after { content:'◆'; position:absolute; left:50%; bottom:-9px; font-size:8px; transform:translateX(-50%); color:var(--edge); text-shadow:0 1px var(--paper); }\n.medieval-frame i { position:absolute; top:-5px; left:-5px; width:30px; height:30px; background:var(--accent); filter:drop-shadow(0 1px #0005); mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cg fill='none' stroke='white' stroke-width='1.2'%3E%3Cpath d='M3 31V3h28M8 27V8h19M3 17l7-7 7-7M8 22l5-5-4-4 4-4 4 4 5-5M13 17q6 0 6-6M3 3l5 5'/%3E%3Ccircle cx='3' cy='3' r='2'/%3E%3Cpath d='m24 3 3-3 3 3-3 3Zm-21 21 3 3-3 3-3-3Z' fill='white' stroke='none'/%3E%3C/g%3E%3C/svg%3E\") center/contain no-repeat; }\n.medieval-frame i:nth-child(2) { left:auto; right:-5px; transform:rotate(90deg); }.medieval-frame i:nth-child(3) { top:auto; bottom:-5px; left:auto; right:-5px; transform:rotate(180deg); }.medieval-frame i:nth-child(4) { top:auto; bottom:-5px; transform:rotate(270deg); }\n.dialogue[data-theme=dark] .speaker-portrait { order:2; width:47px; height:58px; border:3px double var(--edge); border-radius:45% 45% 3px 3px; object-fit:cover; background:var(--wash); filter:saturate(.65); }\n.dialogue[data-theme=dark] .dialogue-name { font-variant:small-caps; letter-spacing:.07em; }\n\n/* 게임 말풍선: 얇은 윤곽과 작은 꼬리, 가벼운 메신저 조판. */\n.dialogue[data-theme=game] { --paper:#28313d; --accent:#c9d9ed; --edge:#566479; border-radius:12px 12px 12px 3px; padding:7px 11px; max-width:95%; box-shadow:0 2px 4px #0001; }\n[data-scene-mode=light] .dialogue[data-theme=game] { --paper:#f6f8fc; --accent:#49627f; --edge:#b7c4d5; }\n.dialogue[data-theme=game]::after { content:''; position:absolute; left:13px; bottom:-5px; width:8px; height:8px; background:var(--paper); border-right:1px solid var(--edge); border-bottom:1px solid var(--edge); transform:skewY(-30deg); }\n.dialogue[data-theme=game] .speaker-portrait { width:28px; height:28px; border-radius:50%; background:var(--wash); align-self:flex-start; }\n.dialogue[data-theme=game] .dialogue-name { font:600 10px/1.5 'Malgun Gothic',sans-serif; }.dialogue[data-theme=game] .dialogue-speech { font-family:'Malgun Gothic',sans-serif; }\n\n/* SF와 글라스는 기존 형태를 유지하고 밝은 배경용 명도만 분리한다. */\n.dialogue[data-theme=sf] { --paper:#0a1d29; --ink:#d1fff3; --secondary:#afe0d8; --subtle:#91c4c8; --edge:#39c2bc; --accent:#80ffe9; background:repeating-linear-gradient(0deg,#1bf6e908 0 1px,transparent 1px 3px),linear-gradient(105deg,#07363c,var(--paper) 70%); border-left:4px solid var(--accent); clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px)); box-shadow:inset 0 0 20px #00e5de18; }\n[data-scene-mode=light] .dialogue[data-theme=sf] { --paper:#ecf7f8; --ink:#173e48; --secondary:#315e64; --subtle:#426e75; --edge:#539eaa; --accent:#126a76; background:repeating-linear-gradient(0deg,#007d8007 0 1px,transparent 1px 3px),linear-gradient(105deg,#d9f0ef,var(--paper) 70%); }\n.dialogue[data-theme=sf]::after { content:'RX ▰▰▰▱ / 07'; position:absolute; right:10px; top:5px; font:8px Consolas,monospace; color:var(--subtle); letter-spacing:1px; }\n.dialogue[data-theme=sf] .speaker-portrait { width:48px; height:61px; border:1px solid var(--edge); filter:grayscale(1) sepia(.7) hue-rotate(110deg); opacity:.9; clip-path:polygon(12px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 12px); }\n.dialogue[data-theme=sf] .dialogue-name { text-shadow:1px 0 #ff4e8544,-1px 0 #19baff66; font:700 10px Consolas,'Malgun Gothic',monospace; }\n.dialogue[data-theme=sf] .dialogue-speech { text-shadow:.5px 0 #35ffff22; }\n\n/* 어반 판타지: 차콜과 회보라, 잘린 모서리와 편집 디자인. */\n.dialogue[data-theme=urban] { --paper:#292832; --accent:#d8cee9; --edge:#716a85; --wash:#d8cee916; border:0; border-left:2px solid var(--accent); border-radius:0 8px 0 0; background:linear-gradient(100deg,var(--wash),transparent 65%),var(--paper); box-shadow:0 1px 0 var(--edge); padding:8px 13px; }\n[data-scene-mode=light] .dialogue[data-theme=urban] { --paper:#f5f3f8; --accent:#625275; --edge:#ada3bb; --wash:#6252750a; }\n.dialogue[data-theme=urban]::after { content:''; position:absolute; bottom:0; right:0; width:26px; height:5px; background:var(--edge); clip-path:polygon(5px 0,100% 0,100% 100%,0 100%); }\n.dialogue[data-theme=urban] .dialogue-name { width:fit-content; border-bottom:1px solid var(--edge); padding:0 10px 2px 0; margin-bottom:4px; font:700 10px/1.4 'Malgun Gothic',sans-serif; letter-spacing:.04em; }\n.dialogue[data-theme=urban] .speaker-portrait { order:2; width:61px; height:69px; object-fit:contain; margin:-9px 0 -8px; align-self:flex-end; filter:drop-shadow(-2px 2px #0002); }\n\n/* 느와르: 사진과 인쇄 활자, 색보다 강약으로 구분한다. */\n.dialogue[data-theme=noir] { --paper:#242527; --ink:#eeebe6; --secondary:#d0cbc5; --subtle:#b0aba6; --accent:#d9b8ae; --edge:#81736d; border:0; border-block:1px solid var(--edge); padding:8px 12px 8px 0; background:linear-gradient(90deg,var(--paper),transparent); }\n[data-scene-mode=light] .dialogue[data-theme=noir] { --paper:#f4f1ed; --ink:#302c2b; --secondary:#4d4642; --subtle:#6e625b; --accent:#79544a; --edge:#a89991; }\n.dialogue[data-theme=noir] .speaker-portrait { width:42px; height:59px; filter:grayscale(1) contrast(1.1); background:var(--wash); margin-left:5px; border:1px solid var(--edge); }\n.dialogue[data-theme=noir] .dialogue-name { font:italic 12px/1.5 Georgia,'Batang',serif; }.dialogue[data-theme=noir] .dialogue-name::after { content:''; height:1px; width:22px; background:var(--edge); }\n\n/* 수묵: 붓줄과 작은 인장. 번역명도 생략하지 않는다. */\n.dialogue[data-theme=ink] { --paper:#262d2c; --ink:#e1e6df; --secondary:#c6cfc6; --subtle:#acb9b0; --accent:#dfb1a6; --edge:#6d8073; border:0; border-left:3px solid var(--edge); background:linear-gradient(90deg,var(--paper),transparent); padding:7px 12px; }\n[data-scene-mode=light] .dialogue[data-theme=ink] { --paper:#f3f4ef; --ink:#2e3832; --secondary:#48574c; --subtle:#606c62; --accent:#8e4e43; --edge:#9aa99a; }\n.dialogue[data-theme=ink]::before { content:''; position:absolute; top:0; left:-3px; width:20px; height:1px; background:var(--edge); }\n.dialogue[data-theme=ink] .speaker-portrait { order:2; width:32px; height:32px; filter:grayscale(1); border-radius:2px; opacity:.9; }\n.dialogue[data-theme=ink] .dialogue-name { font-size:10px; width:fit-content; padding:1px 5px; border:1px solid var(--accent); border-radius:1px; margin-bottom:4px; }\n\n/* 터미널: 컬러 모니터보다 차분한 전문 장비의 화면. */\n.dialogue[data-theme=terminal] { --paper:#1c2a2d; --ink:#deebea; --secondary:#bcd3d0; --subtle:#a4bebc; --accent:#b3d9d2; --edge:#5b7c7b; background:linear-gradient(90deg,var(--wash) 30px,transparent 30px),var(--paper); border:1px solid var(--edge); border-radius:2px; padding:7px 11px; }\n[data-scene-mode=light] .dialogue[data-theme=terminal] { --paper:#f0f6f5; --ink:#29413f; --secondary:#3e5d59; --subtle:#53726f; --accent:#386e65; --edge:#92b1aa; }\n.dialogue[data-theme=terminal] .speaker-portrait { width:20px; height:20px; align-self:flex-start; filter:grayscale(.8); }\n.dialogue[data-theme=terminal] .dialogue-name { font:10px/1.5 Consolas,'Malgun Gothic',monospace; }.dialogue[data-theme=terminal] .dialogue-name::before { content:'›'; color:var(--subtle); font-weight:400; }\n.dialogue[data-theme=terminal] .dialogue-speech { font-family:Consolas,'Malgun Gothic',monospace; }\n\n/* 편지: 끝에 놓인 서명과 우표 크기의 초상. */\n.dialogue[data-theme=letter] { --paper:#302e2a; --ink:#e9e3d9; --secondary:#d0c7b9; --subtle:#b8ae9e; --accent:#dbc6a5; --edge:#897d69; border:0; border-top:1px solid var(--edge); border-bottom:1px solid var(--edge-soft); background:linear-gradient(90deg,var(--paper),transparent); padding:9px 12px; }\n[data-scene-mode=light] .dialogue[data-theme=letter] { --paper:#f7f3eb; --ink:#38332b; --secondary:#544b3f; --subtle:#6e6352; --accent:#775f3d; --edge:#b5a68c; }\n.dialogue[data-theme=letter] .dialogue-body { display:flex; flex-direction:column; }.dialogue[data-theme=letter] .dialogue-name { order:3; align-self:flex-end; margin:3px 0 0; font:italic 11px/1.4 Georgia,'Batang',serif; }\n.dialogue[data-theme=letter] .dialogue-name::before { content:'—'; font-weight:400; }\n.dialogue[data-theme=letter] .speaker-portrait { order:2; width:36px; height:43px; border:3px double var(--edge); filter:saturate(.45); align-self:flex-end; }\n\n/* 코믹: 노란 바탕 대신 잉크 윤곽과 작은 비대칭 말풍선. */\n.dialogue[data-theme=comic] { --paper:#2d3039; --ink:#f0edf0; --secondary:#d0cbd4; --subtle:#b8b1bf; --accent:#e2bcc7; --edge:#a09aa9; border:1.5px solid var(--edge); border-radius:12px 5px 14px 4px; box-shadow:2px 2px 0 var(--edge-soft); background:radial-gradient(circle at 100% 0,var(--wash),transparent 60%),var(--paper); }\n[data-scene-mode=light] .dialogue[data-theme=comic] { --paper:#fffafc; --ink:#302a32; --secondary:#514750; --subtle:#70616d; --accent:#8f4f65; --edge:#7d6e7c; }\n.dialogue[data-theme=comic]::before { content:''; position:absolute; left:25px; bottom:-7px; width:12px; height:8px; border-left:1.5px solid var(--edge); background:var(--paper); transform:skewX(-30deg); clip-path:polygon(0 0,100% 0,0 100%); }\n.dialogue[data-theme=comic] .speaker-portrait { width:53px; height:63px; object-fit:contain; margin:-9px 0 -9px -5px; align-self:flex-end; }\n.dialogue[data-theme=comic] .dialogue-name { font:700 10px/1.5 'Malgun Gothic',sans-serif; }.dialogue[data-theme=comic] .dialogue-speech { font-family:'Malgun Gothic',sans-serif; }\n\n.dialogue[data-theme=glass] { --paper:#19242dcc; --ink:#e5edf2; --secondary:#c9d8e0; --subtle:#a9bfcc; --accent:#c7e0ee; --edge:#8fb6cc66; background:linear-gradient(120deg,#79adcd20,#d2a4c50b),var(--paper); border:1px solid var(--edge); border-radius:13px; box-shadow:inset 0 1px #ffffff12; backdrop-filter:blur(8px); }\n[data-scene-mode=light] .dialogue[data-theme=glass] { --paper:#ffffffc9; --ink:#253f4c; --secondary:#3c5a6b; --subtle:#526d7b; --accent:#3c657b; --edge:#7695a266; box-shadow:inset 0 1px #fff,0 2px 6px #496b7d09; }\n.dialogue[data-theme=glass] .speaker-portrait { width:35px; height:35px; border:1px solid var(--edge); border-radius:50%; background:var(--wash); }\n.dialogue[data-theme=glass] .dialogue-name { font:500 10px/1.5 'Malgun Gothic',sans-serif; }\n.plain-dialogue { white-space:pre-wrap; color:#bac5c1; font:13px/1.7 'Batang','Malgun Gothic',serif; margin:13px 0; padding:0 2px; }\n\n/* 설정 프레임은 공용 디자인을 유지하고 대화 바탕만 비교한다. */\n.sample-tools { display:flex; align-items:center; gap:12px; }.scene-mode { display:flex; padding:2px; border:1px solid #68736d66; border-radius:3px; }\n.cc-ui .scene-mode button { padding:2px 8px; color:#9baeb4; font-size:9px; }\n.scene-mode button[aria-pressed=true] { background:#6f848b33; color:#e0e8e8; border-radius:2px; }\n[data-scene-mode=light] .dialogue-preview { background:#eaeef0; border-color:#8d9da866; }\n[data-scene-mode=light] .chat-stage { background:radial-gradient(ellipse at 50% 0,#fff8,transparent 65%),#eaeef0; }\n[data-scene-mode=light] .narrative { color:#4d5c63; }[data-scene-mode=light] .plain-dialogue { color:#3e515b; }\n[data-scene-mode=light] .user-message { color:#455761; background:#fff6; border-color:#7c8f9a44; }\n[data-scene-mode=light] .chat-top { border-color:#8e9da633; }[data-scene-mode=light] .chat-top b { color:#48545a; }[data-scene-mode=light] .chat-top span { color:#62727b; }\n[data-scene-mode=light] .chapter-line { color:#766b53; }[data-scene-mode=light] .scene-footer { color:#657780; }\n[data-scene-mode=light] .composer { background:#f8fafb; border-color:#a4afb4; box-shadow:0 4px 15px #455b6b0b; }[data-scene-mode=light] .composer textarea { color:#344b58; }\n[data-scene-mode=light] .chronicle { filter:drop-shadow(0 1px 1px #fff); }[data-scene-mode=light] .chronicle-position strong { color:#745e35; }[data-scene-mode=light] .chronicle-position small { color:#746a55; }\n\n.cc-ui.key-popover { position:fixed; z-index:40; max-width:420px; padding:9px 12px; background:#1a262e; border:1px solid #9d895e; box-shadow:0 6px 22px #0007; pointer-events:none; font-size:10px; }\n.popover-title { display:block; font:12px Consolas,monospace; color:#e5cda0; margin-bottom:6px; }\n.popover-grid { display:grid; grid-template-columns:minmax(100px,1fr) max-content; align-items:center; gap:6px 22px; }\n.popover-grid small { color:#7e959c; font-size:8px; border-bottom:1px solid #66736a55; padding-bottom:3px; }\n.popover-grid kbd { font:9px Consolas,monospace; color:#c8d3cd; white-space:nowrap; }\n.reserved-note,.empty-key { color:#87969b; }\n.cc-ui.preview-toast { position:fixed; bottom:25px; left:50%; transform:translateX(-50%); z-index:50; max-width:650px; padding:10px 18px; border:1px solid #a08a5c; background:#243039; box-shadow:0 5px 25px #0007; font-size:11px; }\n.mock-models { position:relative; font-size:10px; }\n.mock-models summary { cursor:pointer; list-style:none; padding:5px 9px; border:1px solid #59615a; border-radius:3px; }\n.mock-model-menu { position:absolute; right:0; top:100%; min-width:150px; max-height:340px; overflow:auto; z-index:10; background:#1a252d; border:1px solid #99865d; box-shadow:0 5px 20px #0008; }\n.mock-model-menu button { display:block; width:100%; padding:6px 10px; text-align:left; font-size:10px; }.mock-model-menu button:hover { background:#8f7b492c; }\n.chat-top { position:relative; z-index:7; }\n\n@media (max-height:840px) {\n  .cc-ui.focus-window { height:calc(100dvh - 78px); }.settings-scrim { padding:13px 20px; }\n  .focus-window .window-header { min-height:61px; padding-top:9px; padding-bottom:8px; }.focus-window h1 { font-size:19px; }\n  .cc-ui .keyboard-key,.key-spacer { height:32px; }.keyboard { padding:8px; }\n  .keyboard-row,.keyboard-main,.keyboard-nav,.keyboard-numpad { gap:3px; }.keyboard-row.function-row { margin-bottom:4px; }\n  .binding-row { min-height:21px; }.binding-row > .binding-button { font-size:9px; padding-top:2px; padding-bottom:2px; }\n  .focus-window .window-footer { min-height:45px; padding-top:6px; padding-bottom:6px; }\n  .action-group h2 { padding-top:4px; padding-bottom:4px; font-size:9px; margin-bottom:4px; }\n  .keyboard-toolbar { margin-bottom:7px; }.keys-panel { padding-top:9px; }\n  .immersion-panel .section { padding:10px 0; }.immersion-panel .section-heading { min-height:28px; margin-bottom:7px; }\n  .setting-line { min-height:28px; font-size:10px; }.preset-choice strong { font-size:9px; }\n  .cc-ui .preset-choice { padding:5px 9px; }.preset-choice code { font-size:8px; line-height:1.4; }\n  .dialogue-preview { min-height:133px; }.cc-ui .sample-input { height:78px; }\n}\n@media (max-width:1180px) {\n  .preview-brand small { display:none; }.cc-ui.focus-window { --inset:16px; }\n  .keys-panel { padding-left:16px; padding-right:16px; }.key-legend { gap:7px; }.keyboard { gap:7px; }\n  .keyboard-key .key-label { font-size:8px; left:3px; }.key-slice { font-size:7px; }.action-columns { gap:12px; }\n  .immersion-panel { grid-template-columns:285px minmax(0,1fr); gap:20px; }.prototype-note { display:none; }\n  .appearance-grid { grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; }.theme-picker { grid-template-columns:repeat(2,minmax(0,1fr)); }\n}\n@media (max-width:1000px) {\n  body { min-width:960px; }.preview-bar { padding:0 16px; }.preview-brand { font-size:10px; }\n  .settings-scrim { min-width:960px; padding-left:12px; padding-right:12px; }#layer-label { display:none; }\n  .key-legend { font-size:8px; }.key-slice { font-size:6px; }\n  .immersion-panel { gap:16px; grid-template-columns:270px minmax(0,1fr); }.dialogue-preview { padding-inline:10px; }\n  .speaker-help { white-space:normal; }\n}\n\n/* 사용자 스크립트의 Shadow DOM 안에서만 적용하는 설정 창 보정. */\n:host { font:13px/1.6 'Segoe UI','Malgun Gothic',sans-serif; color:#e4dfd4; color-scheme:dark; }\n.settings-scrim { inset:0; pointer-events:auto; z-index:1; }\n.cc-ui.focus-window { position:relative; }\n.sample-tools #sample-match { max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.cc-ui.preview-toast,.cc-ui.key-popover { pointer-events:none; }\n.chronicle.cc-live-chronicle { position:relative; top:auto; left:auto; bottom:auto; width:70px; height:100%; }\n.cc-live-chronicle .chronicle-position { padding-top:10px; }\n\n.settings-scrim[hidden], .cc-ui [hidden], [hidden] { display: none !important; }\n";
  const commonCSS = GM_getResourceText('ccCommon');
  let sharedSheet;
  if (page.CSSStyleSheet?.prototype.replaceSync) {
    sharedSheet = new page.CSSStyleSheet();
    sharedSheet.replaceSync(focusCSS);
  }
  function addStyle(root, common = false) {
    if (sharedSheet) root.adoptedStyleSheets = [sharedSheet];
    else { const style = make('style'); style.textContent = focusCSS; root.append(style); }
    if (common) { const style = make('style'); style.textContent = commonCSS; root.prepend(style); }
  }
  function configuredActions(config = draft || settings) {
    return [...actions, ...models].map(item => ({ ...item, binding: config.bindings[item.id] || null }));
  }
  function imageUrl(blob) {
    if (!imageUrls.has(blob)) imageUrls.set(blob, page.URL.createObjectURL(blob));
    return imageUrls.get(blob);
  }
  function releaseUnusedImages() {
    const keep = new Set([...portraits.values(), ...(draftPortraits?.values() || [])]);
    for (const [blob, url] of imageUrls) if (!keep.has(blob)) { page.URL.revokeObjectURL(url); imageUrls.delete(blob); }
  }
  function ensureUI() {
    if (ui) return;
    uiHost = make('div'); uiHost.id = 'cc-focus-host'; uiHost.dataset.ccFocusOwned = '';
    uiHost.style.cssText = 'position:fixed;inset:0;z-index:2147483600;pointer-events:none;';
    ui = uiHost.attachShadow({ mode: 'open' }); addStyle(ui, true);
    uiShell = make('div'); uiShell.innerHTML = SETTINGS_HTML; ui.append(uiShell); doc.body.append(uiHost);
    ui.addEventListener('keydown', event => event.stopPropagation());
    ui.addEventListener('keyup', event => event.stopPropagation());
    ui.addEventListener('pointerdown', event => { if (!event.target.closest('.keyboard-key')) hideKeyPopup(); });
    $('keys-panel').addEventListener('scroll', hideKeyPopup);
    ui.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
    ui.querySelectorAll('[data-mod]').forEach(button => button.addEventListener('click', () => {
      const mod = button.dataset.mod;
      if (mod === 'all') { allLayers = true; Object.keys(modifiers).forEach(key => modifiers[key] = false); }
      else { allLayers = false; modifiers[mod] = !modifiers[mod]; }
      ui.querySelectorAll('[data-mod]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.mod === 'all' ? allLayers : modifiers[node.dataset.mod])));
      $('layer-label').textContent = allLayers ? '모든 조합을 한눈에' : [modifiers.ctrl && 'Ctrl', modifiers.alt && 'Alt', modifiers.shift && 'Shift', '키'].filter(Boolean).join(' + ');
      renderKeyboard();
    }));
    for (const [id, key] of Object.entries({ 'hide-left': 'hideLeft', 'hide-top': 'hideTop', 'close-right': 'closeRight', 'auto-grow': 'autoGrow', 'show-slider': 'showSlider' })) {
      $(id).addEventListener('change', () => { if (draft) draft[key] = $(id).checked; });
    }
    [...presets, { name: '직접 작성', hint: '커스텀 정규식' }].forEach((preset, index) => {
      const button = make('button', 'preset-choice');
      button.dataset.preset = index === presets.length ? 'custom' : String(index);
      button.append(make('strong', '', preset.name), make('code', '', preset.hint));
      button.addEventListener('click', () => selectPattern(index === presets.length ? 'custom' : index));
      $('preset-list').append(button);
    });
    themes.forEach(([id, label, symbol]) => {
      const button = make('button', 'theme-choice'); button.dataset.theme = id;
      button.append(make('span', 'theme-art ' + id, symbol), make('span', '', label));
      button.addEventListener('click', () => { draft.theme = id; renderThemeButtons(); updatePreview(); });
      $('theme-picker').append(button);
    });
    ui.querySelectorAll('button[data-scene-mode]').forEach(button => button.addEventListener('click', () => setPreviewMode(button.dataset.sceneMode)));
    $('regex-input').addEventListener('input', () => { draft.customRegex = $('regex-input').value; updatePreview(); });
    $('sample-input').addEventListener('input', updatePreview);
    $('load-regex-example').addEventListener('click', () => {
      draft.customRegex = '^(?<name>.+?): (?<speech>.+)$'; $('regex-input').value = draft.customRegex;
      $('sample-input').value = '에린: 안녕!'; updatePreview();
    });
    $('speaker-form').addEventListener('submit', event => {
      event.preventDefault();
      const name = normalizeName($('speaker-name').value);
      if (!name) { toast('대사 원문에 나오는 화자 이름을 입력해주세요.'); return; }
      chooseImage(name);
    });
    $('speaker-file').addEventListener('change', uploadPortrait);
    $('close-settings').addEventListener('click', closeSettings);
    $('cancel-settings').addEventListener('click', closeSettings);
    $('save-preview').addEventListener('click', saveSettings);
    $('reset-keys').addEventListener('click', () => {
      draft.bindings = { ...baseBindings }; waitingId = null; heldModifier = null; refreshBindings();
    });
  }
  function toast(message) {
    if (!doc.body) return;
    ensureUI(); $('toast').textContent = message; $('toast').hidden = false;
    page.clearTimeout(toastTimer); toastTimer = page.setTimeout(() => { $('toast').hidden = true; }, 4000);
  }
  function showError(error) { if (!suspended && error?.name !== 'AbortError') toast(error.message || '작업을 완료하지 못했습니다.'); }
  function selectTab(tab) {
    activeTab = tab; waitingId = null; heldModifier = null; hideKeyPopup();
    ui.querySelectorAll('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    $('keys-panel').hidden = tab !== 'keys'; $('immersion-panel').hidden = tab !== 'immersion'; $('reset-keys').hidden = tab !== 'keys';
    renderActions();
  }
  async function openSettings() {
    await storageReady;
    if (!doc.body) return;
    ensureUI();
    if (draft) { $('focus-window').focus(); return; }
    try { await readModels(); } catch (error) { showError(error); }
    draft = page.structuredClone(settings); draftPortraits = new Map(portraits);
    for (const [id, key] of Object.entries({ 'hide-left': 'hideLeft', 'hide-top': 'hideTop', 'close-right': 'closeRight', 'auto-grow': 'autoGrow', 'show-slider': 'showSlider' })) $(id).checked = draft[key];
    $('sample-input').value = presets[typeof draft.pattern === 'number' ? draft.pattern : 0].sample;
    $('regex-input').value = draft.customRegex;
    $('settings-scrim').hidden = false; setPreviewMode(sceneMode()); selectTab(activeTab);
    renderPatternButtons(); renderThemeButtons(); renderSpeakers(); refreshBindings(); updatePreview();
    $(activeTab === 'keys' ? 'keys-tab' : 'immersion-tab').focus();
    if (storageError) toast('로컬 저장소를 열지 못했습니다. 저장을 사용할 수 없습니다.');
  }
  function closeSettings() {
    if (saving) return;
    waitingId = null; heldModifier = null; previewRevision += 1; hideKeyPopup();
    $('settings-scrim').hidden = true; draft = null; draftPortraits = null; releaseUnusedImages();
    editor()?.focus();
  }
  async function saveSettings() {
    if (!draft || saving) return;
    saving = true; $('save-preview').disabled = true;
    try {
      if (draft.pattern === 'custom') {
        const result = await findMatches($('sample-input').value, draft);
        if (result.error) throw new Error(result.error);
      }
      if (modelSnapshotKnown) {
        const ids = new Set(models.map(item => item.id));
        for (const id of Object.keys(draft.bindings)) if (id.startsWith('model:') && !ids.has(id)) delete draft.bindings[id];
      }
      const next = normalizeSettings(draft);
      await persist(next, draftPortraits);
      settings = next; portraits = new Map(draftPortraits); highlightRevision += 1;
      restoreHighlights(); updateImmersion(); syncPage();
      toast('설정을 이 브라우저에 저장했습니다.');
    } catch (error) { showError(error); }
    finally { saving = false; $('save-preview').disabled = false; releaseUnusedImages(); }
  }
  function bindingsFor(code) { return [...configuredActions(), ...reserved].filter(item => item.binding?.code === code); }
  function hideKeyPopup() { if ($('key-popover')) $('key-popover').hidden = true; }
  function showKeyPopup(key, code) {
    const popup = $('key-popover'); popup.replaceChildren(make('strong', 'popover-title', keyName(code)));
    const entries = bindingsFor(code);
    if (!entries.length) popup.append(make('span', 'empty-key', '배정 없음'));
    else {
      const table = make('div', 'popover-grid'); table.append(make('small', '', '기능'), make('small', '', '배정 키'));
      entries.forEach(item => table.append(make('span', item.group === 'reserved' ? 'reserved-note' : '', item.name), make('kbd', '', format(item.binding))));
      popup.append(table);
    }
    popup.hidden = false;
    const rect = key.getBoundingClientRect(), bounds = popup.getBoundingClientRect();
    popup.style.left = Math.min(Math.max(10, rect.left), page.innerWidth - bounds.width - 10) + 'px';
    popup.style.top = (rect.bottom + bounds.height + 8 < page.innerHeight ? rect.bottom + 8 : rect.top - bounds.height - 8) + 'px';
  }
  function renderKeyboard() {
    if (!ui || !draft) return;
    hideKeyPopup(); $('keyboard').replaceChildren();
    for (const [part, rows] of [['main', mainRows], ['nav', navRows], ['numpad', numRows]]) {
      const group = make('div', 'keyboard-' + part);
      rows.forEach((row, rowIndex) => {
        const line = make('div', 'keyboard-row' + (rowIndex === 0 ? ' function-row' : ''));
        row.forEach(spec => {
          const [code, width] = Array.isArray(spec) ? spec : [spec, 1];
          const key = make(code ? 'button' : 'span', code ? 'keyboard-key' : 'key-spacer'); key.style.setProperty('--u', width || 1);
          if (code) {
            key.dataset.code = code; key.tabIndex = -1; key.setAttribute('aria-label', keyName(code) + ' 키 · 배정 보기');
            const entries = bindingsFor(code).filter(item => allLayers || ['ctrl', 'alt', 'shift'].every(mod => item.binding[mod] === modifiers[mod]));
            const slices = make('span', 'key-slices ' + (entries.length === 2 ? 'two' : entries.length > 2 ? 'many' : ''));
            entries.forEach(item => { const slice = make('span', 'key-slice', item.short); slice.style.setProperty('--slice-bg', colors[item.group]); slices.append(slice); });
            key.append(slices, make('span', 'key-label', keyName(code)));
            key.addEventListener('pointerdown', event => event.preventDefault());
            key.addEventListener('click', () => showKeyPopup(key, code));
          }
          line.append(key);
        }); group.append(line);
      }); $('keyboard').append(group);
    }
  }
  function renderActions() {
    if (!draft) return;
    $('action-columns').replaceChildren();
    const list = configuredActions(), tail = list.slice(16), split = Math.ceil(tail.length / 2);
    const columns = [['화면 · 채팅', list.slice(0, 8)], ['몰입 · 답변', list.slice(8, 16)], ['도구 · 모델', tail.slice(0, split)], ['모델 선택', tail.slice(split)]];
    for (const [title, items] of columns) {
      const section = make('section', 'action-group'), heading = make('h2', '', title);
      heading.append(make('small', '', items.length + '개')); section.append(heading);
      for (const item of items) {
        const row = make('div', 'binding-row' + (waitingId === item.id ? ' is-waiting' : ''));
        const button = make('button', 'binding-button'); button.dataset.action = item.id;
        button.setAttribute('aria-label', item.name + ' 단축키 설정');
        button.append(make('span', '', item.name), make('kbd', item.binding ? '' : 'unbound', waitingId === item.id ? '키 입력 대기…' : format(item.binding)));
        button.addEventListener('click', () => {
          waitingId = item.id; heldModifier = null; hideKeyPopup(); renderActions();
          [...$('action-columns').querySelectorAll('[data-action]')].find(node => node.dataset.action === item.id)?.focus();
        });
        const unbind = make('button', 'unbind', '×'); unbind.setAttribute('aria-label', item.name + ' 단축키 해제'); unbind.disabled = !item.binding;
        unbind.addEventListener('click', () => { draft.bindings[item.id] = null; waitingId = null; refreshBindings(); });
        row.append(button, unbind); section.append(row);
      }
      $('action-columns').append(section);
    }
  }
  function refreshBindings() { renderKeyboard(); renderActions(); }
  function setBinding(binding) {
    if (binding.code === 'Escape' || isBang(binding)) { toast('!와 Esc는 메뉴 열기·닫기를 위해 보호됩니다.'); return; }
    const conflict = configuredActions().find(item => item.id !== waitingId && matches(item.binding, binding));
    if (conflict) { toast(format(binding) + '는 「' + conflict.name + '」에 배정돼 있습니다.'); return; }
    draft.bindings[waitingId] = binding; waitingId = null; heldModifier = null; refreshBindings();
    const warning = reserved.find(item => matches(item.binding, binding));
    if (warning) toast('배정했습니다. 브라우저의 ' + warning.name + '와 겹치는 조합입니다.');
  }
  function modelTrigger() { return doc.querySelector('button[aria-label="메시지 검색"]')?.parentElement.querySelector('button[aria-haspopup="dialog"]'); }
  function modelOptions(trigger = modelTrigger()) {
    const popover = trigger && doc.getElementById(trigger.getAttribute('aria-controls'));
    return [...(popover?.querySelectorAll('button[aria-current]') || [])].map(button => {
      const image = button.querySelector('img[src*="/model-icon/"]');
      const name = (image?.nextElementSibling?.textContent || button.querySelector('.truncate')?.textContent || '').trim();
      const iconId = image ? new page.URL(image.src).pathname.split('/').pop().replace(/\.[^.]+$/, '') : '';
      return { button, id: 'model:' + (iconId || name), name };
    }).filter(item => item.name);
  }
  function adoptModels(options) {
    models = options.map(item => action(item.id, item.name, item.name.replace('챗', '').replace('하이퍼', '하'), null, 'model'));
    modelSnapshotKnown = true;
    if (draft && waitingId?.startsWith('model:') && !models.some(item => item.id === waitingId)) waitingId = null;
    if (draft) refreshBindings();
  }
  async function readModels(keepOpen = false) {
    const trigger = modelTrigger();
    if (!trigger) return [];
    const openedHere = trigger.getAttribute('aria-expanded') !== 'true';
    if (openedHere) trigger.click();
    try {
      const options = await new Promise((resolve, reject) => {
        const current = modelOptions(trigger);
        if (current.length) { resolve(current); return; }
        const observer = new page.MutationObserver(() => {
          const result = modelOptions(trigger);
          if (result.length) { observer.disconnect(); page.clearTimeout(timer); resolve(result); }
        });
        const timer = page.setTimeout(() => { observer.disconnect(); reject(new Error('모델 목록을 읽지 못했습니다. 채팅방 모델 메뉴를 열고 다시 시도해주세요.')); }, 2500);
        observer.observe(doc.body, { childList: true, subtree: true });
      });
      adoptModels(options); return options;
    } finally { if (!keepOpen && openedHere && trigger.isConnected && trigger.getAttribute('aria-expanded') === 'true') trigger.click(); }
  }
  async function selectModel(id) {
    const trigger = modelTrigger();
    if (!trigger) { toast('채팅방 모델 메뉴를 찾지 못했습니다.'); return; }
    const options = await readModels(true);
    const current = options.find(item => item.id === id);
    if (!current || current.button.disabled) {
      if (trigger.getAttribute('aria-expanded') === 'true') trigger.click();
      toast('현재 선택할 수 없는 모델입니다. 저장 시 삭제된 모델의 배정을 정리합니다.'); return;
    }
    current.button.click();
  }
  let regexWorker = null;
  let regexSequence = 0;
  const regexJobs = new Map();
  function scanText(text, source) {
    const expression = new RegExp(source, 'gmu');
    const matches = [];
    for (const match of text.matchAll(expression)) {
      if (!match[0] || !match.groups?.speech) continue;
      const fields = {};
      for (const key of ['name', 'translatedName', 'speech', 'translation', 'pronunciation']) {
        if (match.groups[key]?.trim()) fields[key] = match.groups[key].trim();
      }
      matches.push({ start: match.index, end: match.index + match[0].length, fields });
      if (matches.length >= 200) break;
    }
    return matches;
  }
  function stopRegexWorker(message) {
    regexWorker?.terminate(); regexWorker = null;
    for (const job of regexJobs.values()) { page.clearTimeout(job.timer); job.resolve({ matches: [], error: message }); }
    regexJobs.clear();
  }
  async function findMatches(text, config) {
    if (text.length > 1000000) return { matches: [], error: '대사가 너무 길어 원문으로 표시합니다.' };
    const source = config.pattern === 'custom' ? config.customRegex : presets[config.pattern].regex;
    if (!source) return { matches: [] };
    if (config.pattern !== 'custom') {
      try { return { matches: scanText(text, source) }; }
      catch { return { matches: [], error: '정규식의 괄호와 기호를 확인해주세요.' }; }
    }
    // 사용자가 입력한 식은 별도 워커에서 실행해 페이지가 멈추지 않게 한다.
    if (!regexWorker) {
      try {
        const code = 'const scanText=' + scanText.toString() + ';self.onmessage=({data})=>{try{self.postMessage({id:data.id,matches:scanText(data.text,data.source)});}catch{self.postMessage({id:data.id,matches:[],error:"정규식의 괄호와 기호를 확인해주세요."});}};';
        const url = page.URL.createObjectURL(new page.Blob([code], { type: 'text/javascript' }));
        try { regexWorker = new page.Worker(url); }
        finally { page.URL.revokeObjectURL(url); }
        regexWorker.onmessage = event => {
          const job = regexJobs.get(event.data.id);
          if (!job) return;
          page.clearTimeout(job.timer); regexJobs.delete(event.data.id); job.resolve(event.data);
        };
        regexWorker.onerror = () => stopRegexWorker('커스텀 정규식 실행을 시작하지 못했습니다.');
      } catch { return { matches: [], error: '이 브라우저에서는 커스텀 정규식 실행을 시작할 수 없습니다.' }; }
    }
    return new Promise(resolve => {
      const id = ++regexSequence;
      const timer = page.setTimeout(() => stopRegexWorker('정규식 처리 시간이 길어 중단했습니다. 반복 기호를 줄여주세요.'), 500);
      regexJobs.set(id, { resolve, timer }); regexWorker.postMessage({ id, text, source });
    });
  }
  function sceneMode() {
    for (let node = doc.querySelector('main'); node; node = node.parentElement) {
      const values = page.getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
      if (values && (values.length < 4 || values[3] > .5)) return values[0] * .2126 + values[1] * .7152 + values[2] * .0722 > 150 ? 'light' : 'dark';
    }
    const root = doc.documentElement;
    if (root.classList.contains('dark') || root.dataset.theme === 'dark') return 'dark';
    if (root.classList.contains('light') || root.dataset.theme === 'light') return 'light';
    return page.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function setPreviewMode(mode) {
    uiShell.dataset.sceneMode = mode;
    ui.querySelectorAll('button[data-scene-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sceneMode === mode)));
    updatePreview();
  }
  function renderPatternButtons() {
    ui.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === String(draft.pattern))));
    $('custom-pattern').hidden = draft.pattern !== 'custom';
  }
  function selectPattern(pattern) {
    draft.pattern = pattern;
    if (typeof pattern === 'number') $('sample-input').value = presets[pattern].sample;
    $('regex-input').value = draft.customRegex; renderPatternButtons(); updatePreview();
  }
  function renderThemeButtons() { ui.querySelectorAll('.theme-choice').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === draft.theme))); }
  function makeDialogue(fields, config, images, mode = sceneMode()) {
    const host = make('cc-focus-dialogue'); host.dataset.ccFocusOwned = ''; host.style.display = 'block';
    const shadow = host.attachShadow({ mode: 'open' }); addStyle(shadow);
    const wrapper = make('div'); wrapper.dataset.sceneMode = mode;
    const bubble = make('article', 'dialogue'); bubble.dataset.theme = config.theme;
    if (config.theme === 'dark') {
      const frame = make('span', 'medieval-frame'); frame.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 4; i += 1) frame.append(make('i'));
      bubble.append(frame);
    }
    const blob = images.get(normalizeName(fields.name)) || images.get(normalizeName(fields.translatedName));
    if (blob) {
      const image = make('img', 'speaker-portrait'); image.src = imageUrl(blob); image.alt = '';
      bubble.append(image); bubble.classList.add('has-portrait');
    }
    const body = make('div', 'dialogue-body');
    if (fields.name || fields.translatedName) {
      const name = make('div', 'dialogue-name', fields.name || fields.translatedName);
      if (fields.name && fields.translatedName) name.append(make('small', '', fields.translatedName));
      body.append(name);
    }
    body.append(make('p', 'dialogue-speech', fields.speech));
    if (fields.pronunciation) body.append(make('p', 'dialogue-pronunciation', fields.pronunciation));
    if (fields.translation) body.append(make('p', 'dialogue-translation', fields.translation));
    bubble.append(body); wrapper.append(bubble); shadow.append(wrapper);
    return host;
  }
  function renderInline(text, parent) {
    const tokens = /(!?\[[^\]\n]*\]\(https?:\/\/[^)\s]+\)|\x60[^\x60]+\x60|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
    let offset = 0;
    for (const match of text.matchAll(tokens)) {
      parent.append(doc.createTextNode(text.slice(offset, match.index)));
      const token = match[0];
      if (token.startsWith('\x60')) parent.append(make('code', '', token.slice(1, -1)));
      else if (token.startsWith('**')) parent.append(make('strong', '', token.slice(2, -2)));
      else if (token.startsWith('*')) parent.append(make('em', '', token.slice(1, -1)));
      else {
        const link = token.match(/^(!?)\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);
        const node = make(link[1] ? 'img' : 'a');
        if (link[1]) { node.src = link[3]; node.alt = link[2]; node.loading = 'lazy'; node.style.maxWidth = '100%'; }
        else { node.href = link[3]; node.target = '_blank'; node.rel = 'noopener noreferrer'; node.textContent = link[2]; }
        parent.append(node);
      }
      offset = match.index + token.length;
    }
    parent.append(doc.createTextNode(text.slice(offset)));
  }
  function appendMarkdown(parent, text) {
    if (!text.trim()) return;
    const parts = text.split(/(\x60\x60\x60[\s\S]*?\x60\x60\x60)/g);
    for (const part of parts) {
      if (!part.trim()) continue;
      if (part.startsWith('\x60\x60\x60')) { const pre = make('pre'); pre.append(make('code', '', part.slice(3, -3).replace(/^[^\n]*\n/, ''))); parent.append(pre); continue; }
      for (const paragraph of part.trim().split(/\n{2,}/)) {
        const p = make('p'); p.style.cssText = 'white-space:pre-wrap;margin:8px 0;overflow-wrap:anywhere;';
        renderInline(paragraph, p); parent.append(p);
      }
    }
  }
  async function updatePreview() {
    if (!draft || !ui || !$('sample-input')) return;
    const revision = ++previewRevision, config = page.structuredClone(draft);
    const raw = $('sample-input').value, result = await findMatches(raw, config);
    if (revision !== previewRevision || !draft) return;
    const output = $('dialogue-preview'); output.replaceChildren();
    if (config.theme === 'none' || !result.matches.length || result.error) appendMarkdown(output, raw);
    else output.append(makeDialogue(result.matches[0].fields, config, draftPortraits, uiShell.dataset.sceneMode));
    $('sample-match').textContent = result.error ? '정규식 확인 필요' : config.theme === 'none' ? '원문 표시' : result.matches.length ? '패턴 인식됨' : '인식 안 됨 · 원문 표시';
    $('sample-match').title = result.error || '';
  }
  let uploadName = '';
  function chooseImage(name) { uploadName = name; $('speaker-file').value = ''; $('speaker-file').click(); }
  function renderSpeakers() {
    $('speaker-list').replaceChildren();
    for (const [name, blob] of draftPortraits) {
      const row = make('div', 'speaker-row'), image = make('img', 'speaker-thumb');
      image.src = imageUrl(blob); image.alt = '';
      const edit = make('button', 'speaker-edit', name); edit.title = '이미지 바꾸기'; edit.addEventListener('click', () => chooseImage(name));
      const remove = make('button', 'speaker-remove', '×'); remove.setAttribute('aria-label', name + ' 이미지 삭제');
      remove.addEventListener('click', () => { draftPortraits.delete(name); renderSpeakers(); updatePreview(); releaseUnusedImages(); });
      row.append(image, edit, remove); $('speaker-list').append(row);
    }
  }
  async function uploadPortrait() {
    const file = $('speaker-file').files[0], name = uploadName, session = draft;
    if (!file || !session) return;
    if (!['image/png', 'image/webp', 'image/jpeg', 'image/gif'].includes(file.type)) { toast('PNG·WebP·JPEG·GIF 이미지를 선택해주세요.'); return; }
    try {
      const image = await page.createImageBitmap(file);
      const canvas = make('canvas'); canvas.width = 512; canvas.height = 512;
      const size = Math.min(image.width, image.height);
      canvas.getContext('2d').drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 512, 512);
      image.close();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('이미지를 변환하지 못했습니다.');
      if (draft !== session) return;
      draftPortraits.set(name, blob); renderSpeakers(); updatePreview(); releaseUnusedImages();
    } catch { toast('이미지를 읽지 못했습니다. 다른 파일을 선택해주세요.'); }
  }

  let highlightRevision = 0;
  const highlighted = new Map();
  function serializeInline(node) {
    if (node.nodeType === page.Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== page.Node.ELEMENT_NODE) return '';
    if (node.tagName === 'BR') return '\n';
    const text = [...node.childNodes].map(serializeInline).join('');
    if (['STRONG', 'B'].includes(node.tagName)) return '**' + text + '**';
    if (['EM', 'I'].includes(node.tagName)) return '*' + text + '*';
    if (node.tagName === 'CODE') return '\x60' + text + '\x60';
    return text;
  }
  function paragraphRuns(root) {
    const runs = []; let run = [];
    for (const node of root.children) {
      if (own(node)) continue;
      if (node.tagName === 'P' && !node.querySelector('img,video,iframe,pre')) {
        run.push({ node, text: serializeInline(node) });
      } else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    return runs;
  }
  function clearHighlight(record) {
    record.overlays.forEach(node => node.remove());
    record.sources.forEach(node => node.removeAttribute('data-cc-focus-source'));
    record.overlays = []; record.sources = [];
  }
  function restoreHighlights() {
    for (const record of highlighted.values()) clearHighlight(record);
    highlighted.clear();
  }
  async function emphasizeRoot(root) {
    if (!immersive || settings.theme === 'none' || !root.isConnected) return;
    const runs = paragraphRuns(root);
    const signature = highlightRevision + ':' + runs.map(run => run.map(block => block.text).join('\n')).join('\uFFFF');
    const previous = highlighted.get(root);
    if (previous?.signature === signature) return;
    if (previous) clearHighlight(previous);
    const record = { signature, overlays: [], sources: [] }; highlighted.set(root, record);
    for (const run of runs) {
      let offset = 0;
      const chunks = run.map(block => { const chunk = { ...block, start: offset, end: offset + block.text.length }; offset = chunk.end + 1; return chunk; });
      const text = run.map(block => block.text).join('\n');
      const result = await findMatches(text, settings);
      if (highlighted.get(root) !== record || !immersive || !root.isConnected) return;
      if (result.error) continue;
      const groups = [];
      for (const match of result.matches) {
        const first = chunks.findIndex(chunk => chunk.end > match.start);
        let last = chunks.findLastIndex(chunk => chunk.start < match.end);
        if (first < 0 || last < first) continue;
        last = Math.max(first, last);
        const previousGroup = groups.at(-1);
        if (previousGroup && first <= previousGroup.last) { previousGroup.last = last; previousGroup.matches.push(match); }
        else groups.push({ first, last, matches: [match] });
      }
      for (const group of groups) {
        if (!chunks[group.first].node.isConnected) continue;
        const overlay = make('div'); overlay.dataset.ccFocusOwned = '';
        let position = chunks[group.first].start;
        for (const match of group.matches) {
          appendMarkdown(overlay, text.slice(position, match.start));
          overlay.append(makeDialogue(match.fields, settings, portraits));
          position = match.end;
        }
        appendMarkdown(overlay, text.slice(position, chunks[group.last].end));
        chunks[group.first].node.before(overlay);
        for (let i = group.first; i <= group.last; i += 1) { chunks[i].node.dataset.ccFocusSource = ''; record.sources.push(chunks[i].node); }
        record.overlays.push(overlay);
      }
    }
  }
  function editor() { return doc.querySelector(EDITOR); }
  function nativeScroller() { return crackNavigation.scroller(); }
  // 크랙 내부 검색 상태와 연결하는 곳. 빌드마다 바뀌는 모듈 번호·export 이름은 사용하지 않는다.
  const crackNavigation = {
    sessionLabel: 'character-web/feature-chat-search/searchSession',
    sessionAtom: null,
    serial: 0,
    stopWaiting: null,
    scroller() {
      const roots = [...doc.querySelectorAll('.stick-to-bottom > div')];
      return doc.querySelector('button[aria-label="검색 닫기"]')
        ? roots.find(root => root.querySelector('[data-message-group-id^="search:"]')) || roots[0]
        : roots[0];
    },
    async session() {
      let input = doc.querySelector('input[aria-label="메시지 검색어"]');
      if (!input) {
        doc.querySelector('button[aria-label="메시지 검색"]')?.click();
        await this.waitFor(() => doc.querySelector('input[aria-label="메시지 검색어"]'));
        input = doc.querySelector('input[aria-label="메시지 검색어"]');
      }
      if (!this.sessionAtom) {
        const chunks = page.webpackChunk_N_E;
        if (!Array.isArray(chunks)) throw new Error('크랙의 기록 이동 기능에 연결하지 못했습니다.');
        const entry = chunks.flatMap(chunk => Object.entries(chunk[1] || {}))
          .find(([, factory]) => String(factory).includes(this.sessionLabel));
        if (!entry) throw new Error('크랙의 기록 이동 기능이 변경되었습니다.');
        let require;
        const marker = [['cc-key-focus-' + Date.now()], {}, runtime => { require = runtime; }];
        chunks.push(marker);
        if (chunks.at(-1) === marker) chunks.pop();
        this.sessionAtom = Object.values(require?.(entry[0]) || {}).find(value => value?.debugLabel === this.sessionLabel);
      }
      let fiber = input?.[Object.keys(input).find(key => key.startsWith('__reactFiber$'))];
      for (let depth = 0; fiber && depth < 35; depth += 1, fiber = fiber.return) {
        if (typeof fiber.type !== 'function') continue;
        for (let hook = fiber.memoizedState; hook; hook = hook.next) {
          for (const value of hook.memoizedState?.deps || []) {
            if (value && typeof value.get === 'function' && typeof value.set === 'function' && typeof value.sub === 'function' && this.sessionAtom) {
              return { store: value, atom: this.sessionAtom };
            }
          }
        }
      }
      throw new Error('크랙의 기록 이동 기능에 연결하지 못했습니다.');
    },
    waitFor(find) {
      this.stopWaiting?.();
      const ready = find();
      if (ready) return Promise.resolve(ready);
      // 이동 요청 중에만 감시하고 성공·실패 즉시 해제한다. 유휴 상태에서는 실행하지 않는다.
      return new Promise((resolve, reject) => {
        const finish = (value, error) => {
          observer.disconnect(); page.clearTimeout(timer);
          if (this.stopWaiting === cancel) this.stopWaiting = null;
          if (error) reject(error); else resolve(value);
        };
        const cancel = () => finish(null);
        const observer = new page.MutationObserver(() => {
          const value = find();
          if (value) finish(value);
        });
        const timer = page.setTimeout(() => finish(null, new Error('크랙의 기록 이동을 완료하지 못했습니다.')), 8000);
        this.stopWaiting = cancel;
        observer.observe(doc.body, { childList: true, subtree: true });
      });
    },
    groups() { return [...(this.scroller()?.querySelectorAll('[data-message-group-id]') || [])]; },
    async jump(message) {
      const serial = ++this.serial;
      const { store, atom } = await this.session();
      if (serial !== this.serial || !immersive) return false;
      restoreHighlights();
      // 검색의 원래 앵커 경로만 전달한다. around 요청·본문·페이징·DOM은 전부 크랙이 처리한다.
      // 검색 결과의 기존 항목은 보존한다. 본문 텍스트는 복제하거나 검색어로 보내지 않는다.
      store.set(atom, { type: 'setSpeakerFilter', filter: 'all' });
      store.set(atom, { type: 'receiveSearchPage', page: {
        results: [{ messageId: message.id, role: message.role, createdAt: message.createdAt, highlights: [],
          snippets: [{ text: '', matches: [], highlightIndex: 0 }] }],
        nextCursor: store.get(atom).cursors.search, ...store.get(atom).flags,
        totalScannedMessageCount: store.get(atom).totalScannedMessageCount,
      } });
      store.set(atom, { type: 'landAt', key: message.id + ':0' });
      await this.waitFor(() => this.groups().find(group => group.dataset.messageGroupId === 'search:' + message.id));
      if (serial !== this.serial || !immersive) return false;
      await new Promise(resolve => page.requestAnimationFrame(() => page.requestAnimationFrame(resolve)));
      return true;
    },
    latest() {
      this.serial += 1;
      this.stopWaiting?.();
      doc.querySelector('button[aria-label="검색 닫기"]')?.click();
    },
  };
  const hiddenLayout = new Set();
  const grownEditors = new Map();
  let chronicleHost = null, chronicleUI = null;
  let scrollFrame = 0;
  let runtimeStyle;
  function hideLayout(node, hide) {
    if (!node) return;
    if (hide) { node.dataset.ccFocusHidden = ''; hiddenLayout.add(node); }
    else if (hiddenLayout.has(node)) { node.removeAttribute('data-cc-focus-hidden'); hiddenLayout.delete(node); }
  }
  function restoreLayout() {
    for (const node of hiddenLayout) node.removeAttribute('data-cc-focus-hidden');
    hiddenLayout.clear();
  }
  function updateImmersion(entering = false) {
    restoreLayout();
    const main = doc.querySelector('main'), input = editor();
    if (!immersive || !main || !input || !chatId) {
      chronicleHost?.remove(); chronicleHost = null; chronicleUI = null;
      restoreHighlights(); cancelSeek();
      for (const [node, height] of grownEditors) { node.removeAttribute('data-cc-focus-grow'); node.style.height = height; }
      grownEditors.clear(); return;
    }
    const column = main.parentElement, layout = column?.parentElement;
    const left = [...(layout?.children || [])].find(node => node !== column && node.querySelector?.('button[aria-label="사이드바 접기"],button[aria-label="사이드바 펼치기"]'));
    hideLayout(left, settings.hideLeft);
    hideLayout(main.previousElementSibling, settings.hideTop);
    if (entering && settings.closeRight) doc.querySelector('button[aria-label="사이드 패널 닫기"]')?.click();
    if (settings.autoGrow) {
      if (!grownEditors.has(input)) grownEditors.set(input, input.style.height);
      input.dataset.ccFocusGrow = ''; resizeInput();
    } else {
      for (const [node, height] of grownEditors) { node.removeAttribute('data-cc-focus-grow'); node.style.height = height; }
      grownEditors.clear();
    }
    if (settings.showSlider) {
      ensureChronicle(); positionOverlays(); startIndex().catch(showError);
    } else { chronicleHost?.remove(); chronicleHost = null; chronicleUI = null; }
  }
  function toggleImmersion() {
    if (!currentChatId() || !editor()) { toast('크랙 채팅방에서 사용할 수 있습니다.'); return; }
    immersive = !immersive; updateImmersion(immersive); scheduleSync();
  }
  function resizeInput() {
    const input = editor();
    if (!input || !immersive || !settings.autoGrow) return;
    if (input.tagName === 'TEXTAREA') { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, page.innerHeight * .5) + 'px'; }
    positionOverlays();
  }
  function ensureChronicle() {
    if (chronicleHost) return;
    chronicleHost = make('cc-focus-chronicle'); chronicleHost.dataset.ccFocusOwned = '';
    chronicleHost.style.cssText = 'position:fixed;z-index:900;width:70px;pointer-events:auto;';
    chronicleUI = chronicleHost.attachShadow({ mode: 'open' }); addStyle(chronicleUI);
    const wrap = make('aside', 'chronicle cc-live-chronicle'); wrap.setAttribute('aria-label', '턴 탐색');
    wrap.innerHTML = '<div class="chronicle-cap" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/><path d="M32 0 37 27 64 32 37 37 32 64 27 37 0 32 27 27Z"/><path d="m14 14 18 12 18-12-12 18 12 18-18-12-18 12 12-18Z"/><circle cx="32" cy="32" r="3"/></svg></div><div class="chronicle-scale"><div class="chronicle-spine"><div class="chronicle-fill"></div><div class="chronicle-gem"></div><input id="turn-range" type="range" min="0" max="0" value="0" step="1" aria-label="대화 턴 이동" disabled></div></div><div class="chronicle-position"><strong>…</strong><i>/</i><small>…</small></div>';
    chronicleUI.append(wrap); doc.body.append(chronicleHost);
    const slider = chronicleUI.getElementById('turn-range');
    slider.addEventListener('input', () => {
      seeking = true; pendingTurn = Number(slider.value); updateChronicle(); page.clearTimeout(aroundTimer);
      aroundTimer = page.setTimeout(() => jumpToTurn(pendingTurn).catch(showError), 100);
    });
    slider.addEventListener('change', () => { page.clearTimeout(aroundTimer); jumpToTurn(Number(slider.value)).catch(showError); });
    updateChronicle();
  }
  function positionOverlays() {
    if (!immersive) return;
    const main = doc.querySelector('main'), input = editor();
    if (!main || !input) return;
    const rect = main.getBoundingClientRect();
    if (chronicleHost) {
      chronicleHost.style.left = rect.left + 12 + 'px'; chronicleHost.style.top = rect.top + 76 + 'px';
      chronicleHost.style.height = Math.max(140, Math.min(rect.bottom - 110, input.getBoundingClientRect().top - 30) - rect.top - 76) + 'px';
    }
  }
  function updateChronicle(status = '') {
    if (!chronicleUI) return;
    const slider = chronicleUI.getElementById('turn-range');
    const maximum = Math.max(0, turns.length - 1), current = Math.min(maximum, pendingTurn ?? maximum);
    slider.disabled = !indexComplete || !turns.length; slider.max = String(maximum); slider.value = String(current);
    slider.title = status || (indexComplete ? '' : '기록 연결 중');
    chronicleUI.querySelector('.chronicle-position strong').textContent = indexComplete ? current : '…';
    chronicleUI.querySelector('.chronicle-position small').textContent = indexComplete ? maximum : '…';
    const percent = maximum ? current / maximum * 100 : 0;
    chronicleUI.querySelector('.chronicle-fill').style.height = percent + '%';
    chronicleUI.querySelector('.chronicle-gem').style.top = percent + '%';
    chronicleHost.dataset.sceneMode = sceneMode();
  }
  function cancelSeek() {
    crackNavigation.serial += 1;
    crackNavigation.stopWaiting?.();
    page.clearTimeout(aroundTimer);
    pendingTurn = null; seeking = false;
  }
  async function jumpToTurn(turn) {
    if (!immersive || !indexComplete || !turns[turn]) return;
    const generation = routeGeneration;
    seeking = true; pendingTurn = turn; updateChronicle();
    try {
      if (turn === turns.length - 1) {
        crackNavigation.latest();
        await new Promise(resolve => page.requestAnimationFrame(resolve));
        const scroll = nativeScroller();
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
      } else {
        const id = turns[turn].id;
        const existing = crackNavigation.groups().find(group => group.dataset.messageGroupId.replace(/^search:/, '') === id);
        if (existing) {
          const scroll = existing.closest('.stick-to-bottom')?.firstElementChild || nativeScroller();
          if (scroll) scroll.scrollTop += existing.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
        } else if (!await crackNavigation.jump(turns[turn])) return;
      }
      if (generation === routeGeneration && immersive && pendingTurn === turn) syncPage();
    } finally {
      if (generation === routeGeneration && pendingTurn === turn) { seeking = false; updateChronicle(); }
    }
  }
  let replaying = false;
  const blockedKeyUps = new Set();
  function eventCombo(event) { return combo(event.code, event.ctrlKey, event.altKey, event.shiftKey, event.metaKey); }
  function commandInputActive() {
    const input = editor();
    const text = input?.tagName === 'TEXTAREA' ? input.value : input?.textContent;
    return input && (doc.activeElement === input || input.contains(doc.activeElement)) && /(?:^|\s)![^\s!]{0,40}$/.test(text || '');
  }
  function replayNative(item, target) {
    if (item.id === 'input') { editor()?.focus(); return; }
    if (item.id === 'blur') { editor()?.blur(); return; }
    const binding = item.binding;
    let key = keyName(binding.code), keyCode = 0;
    if (/^Key[A-Z]$/.test(binding.code)) { key = binding.shift ? binding.code.slice(3) : binding.code.slice(3).toLowerCase(); keyCode = binding.code.charCodeAt(3); }
    else if (/^Digit[0-9]$/.test(binding.code)) { key = binding.code.slice(5); keyCode = key.charCodeAt(0); }
    else if (binding.code === 'Slash') { key = binding.shift ? '?' : '/'; keyCode = 191; }
    const receiver = target instanceof page.Element && target.isConnected ? target : editor() || doc.body;
    replaying = true;
    try {
      for (const type of ['keydown', 'keyup']) receiver.dispatchEvent(new page.KeyboardEvent(type, {
        key, code: binding.code, keyCode, which: keyCode, ctrlKey: binding.ctrl, altKey: binding.alt,
        shiftKey: binding.shift, metaKey: binding.meta, bubbles: true, cancelable: true, composed: true,
      }));
    } finally { replaying = false; }
  }
  function executeAction(item, event) {
    if (item.id === 'immersion') { toggleImmersion(); return; }
    if (item.id === 'settings') { openSettings().catch(showError); return; }
    if (item.id === 'search') { doc.querySelector('button[aria-label="메시지 검색"]')?.click(); return; }
    if (item.group === 'model') { selectModel(item.id).catch(showError); return; }
    restoreHighlights();
    if (item.id === 'note') {
      const dialog = [...doc.querySelectorAll('[role=dialog]')].find(node => node.getClientRects().length && /유저\s*노트/.test(node.querySelector('h1,h2,h3')?.textContent || ''));
      const close = dialog?.querySelector('button[aria-label="닫기"]');
      if (close) { close.click(); return; }
    }
    if (item.id === 'room') {
      const toggle = doc.querySelector('button[aria-label="사이드 패널 닫기"],button[aria-label="사이드 패널 열기"]');
      if (toggle) { toggle.click(); return; }
    }
    const native = actions.find(action => action.id === item.id);
    if (native) replayNative(native, event.target);
  }
  function captureKey(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.code === 'Escape') { waitingId = null; heldModifier = null; renderActions(); return; }
    const modifier = { Control: 'ctrl', Alt: 'alt', Shift: 'shift', Meta: 'meta' }[event.key];
    if (modifier) { heldModifier = eventCombo(event); heldModifier[modifier] = false; return; }
    heldModifier = null; setBinding(eventCombo(event));
  }
  page.addEventListener('keydown', event => {
    if (replaying || event.isComposing || event.keyCode === 229) return;
    if (draft) {
      if (waitingId) { captureKey(event); return; }
      if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeSettings(); return; }
      if (event.key === 'Tab') {
        const focusable = [...ui.querySelectorAll('#focus-window button:not(:disabled),#focus-window input,#focus-window textarea,#focus-window summary')]
          .filter(node => node.getClientRects().length && node.tabIndex !== -1 && !node.hidden);
        if (event.shiftKey && ui.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && ui.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
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
    if (item && item.group === 'chat' && matches(actions.find(action => action.id === item.id)?.binding, binding)) return;
    if (item || native && !matches(settings.bindings[native.id], native.binding)) {
      event.preventDefault(); event.stopImmediatePropagation(); blockedKeyUps.add(event.code);
      if (item) executeAction(item, event);
    }
  }, true);
  page.addEventListener('keyup', event => {
    if (replaying) return;
    if (draft && waitingId && heldModifier?.code === event.code) {
      event.preventDefault(); event.stopImmediatePropagation(); const binding = heldModifier; heldModifier = null; setBinding(binding); return;
    }
    if (blockedKeyUps.delete(event.code)) { event.preventDefault(); event.stopImmediatePropagation(); }
    if (!draft && chatId && !commandInputActive() && event.code === 'Enter' && !matches(settings.bindings.input, baseBindings.input)) {
      event.stopImmediatePropagation();
    }
  }, true);
  page.addEventListener('blur', () => { heldModifier = null; blockedKeyUps.clear(); });
  doc.addEventListener('pointerdown', event => {
    if (!event.composedPath().includes(uiHost)) { restoreHighlights(); scheduleSync(); }
  }, true);
  doc.addEventListener('input', event => { if (event.target.matches?.(EDITOR) || event.target.closest?.(EDITOR)) resizeInput(); }, true);
  doc.addEventListener('scroll', event => {
    if (!immersive || event.target !== nativeScroller() || scrollFrame) return;
    scrollFrame = page.requestAnimationFrame(() => {
      scrollFrame = 0;
      if (seeking || !indexComplete) return;
      scheduleSync();
      const scroll = nativeScroller(), rect = scroll?.getBoundingClientRect();
      if (!rect) return;
      let nearest = null, distance = Infinity;
      for (const group of crackNavigation.groups()) {
        const id = group.dataset.messageGroupId.replace(/^search:/, ''), turn = ordinal.get(id);
        if (turn === undefined) continue;
        const bounds = group.getBoundingClientRect(), delta = Math.abs(bounds.top - (rect.top + rect.height * .35));
        if (bounds.bottom >= rect.top && bounds.top <= rect.bottom && delta < distance) { distance = delta; nearest = turn; }
      }
      if (nearest !== null) { pendingTurn = nearest; updateChronicle(); }
    });
  }, true);
  page.addEventListener('resize', () => { hideKeyPopup(); resizeInput(); positionOverlays(); });
  if (page.navigation) page.navigation.addEventListener('navigatesuccess', scheduleSync);
  else page.addEventListener('popstate', scheduleSync);
  doc.addEventListener('click', scheduleSync, true);
  doc.addEventListener('keyup', scheduleSync, true);

  let syncFrame = 0;
  let lastModelSignature = '';
  function scheduleSync() {
    if (suspended) return;
    if (!syncFrame) syncFrame = page.requestAnimationFrame(() => { syncFrame = 0; syncPage(); });
  }
  function syncPage() {
    const nextChat = currentChatId();
    if (nextChat !== chatId) {
      routeGeneration += 1; indexAbort?.abort();
      metadata = new Map(); turns = []; ordinal = new Map(); indexComplete = false; indexJob = null; latestMessageId = '';
      models = []; modelSnapshotKnown = false; lastModelSignature = ''; restoreHighlights(); cancelSeek();
      chatId = nextChat;
      if (!chatId) immersive = false;
      updateImmersion(immersive);
    }
    if (!chatId) return;
    const options = modelOptions();
    if (options.length) {
      const signature = options.map(item => item.id + ':' + item.name).join('|');
      if (signature !== lastModelSignature) { lastModelSignature = signature; adoptModels(options); }
    }
    for (const [root, record] of highlighted) if (!root.isConnected) { clearHighlight(record); highlighted.delete(root); }
    if (immersive) {
      updateImmersion();
      refreshLatest();
      if (settings.theme !== 'none') {
        const rect = nativeScroller()?.getBoundingClientRect();
        for (const root of nativeScroller()?.querySelectorAll('[data-message-group-id] .wrtn-markdown') || []) {
          const bounds = root.getBoundingClientRect();
          if (rect && bounds.bottom > rect.top - rect.height && bounds.top < rect.bottom + rect.height) emphasizeRoot(root).catch(showError);
        }
      }
    }
  }
  async function boot() {
    await storageReady;
    runtimeStyle?.remove();
    runtimeStyle = make('style'); runtimeStyle.id = 'cc-key-focus-runtime-style'; runtimeStyle.dataset.ccFocusOwned = '';
    runtimeStyle.textContent = '[data-cc-focus-hidden],[data-cc-focus-source]{display:none!important}[data-cc-focus-grow]{max-height:50dvh!important;overflow-y:auto!important;min-height:0!important}';
    (doc.head || doc.documentElement).append(runtimeStyle);
    ensureUI();
    syncPage();
  }
  page.CrackCommandline.register({ id: 'crack-key-focus', label: '키설정', useDatabse: false, lambda: openSettings });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => boot().catch(showError), { once: true });
  else boot().catch(showError);
  page.addEventListener('pagehide', () => {
    suspended = true;
    page.cancelAnimationFrame(syncFrame); page.cancelAnimationFrame(scrollFrame); syncFrame = 0; scrollFrame = 0;
    cancelSeek(); restoreHighlights(); indexAbort?.abort(); stopRegexWorker('페이지를 닫았습니다.');
  });
  page.addEventListener('pageshow', event => { if (event.persisted && suspended) { suspended = false; boot().catch(showError); } });
})();

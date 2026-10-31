// ==UserScript==
// @name         크랙 몰입모드
// @namespace    crack-commandline
// @icon         https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/images/crack-commandline.svg
// @version      1.0.0.0
// @description  PC·모바일 지원. !몰입모드로 화면과 대사 테마를 설정하고 F9로 몰입모드를 전환합니다.  (version 관리방식: 데이터구조버전.크랙UI변경.기능추가및수정.버그수정)
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
// @updateURL    https://raw.githubusercontent.com/hamster4762/crack-commandline-book/refs/heads/main/crack-immersion.user.js
// @downloadURL  https://raw.githubusercontent.com/hamster4762/crack-commandline-book/refs/heads/main/crack-immersion.user.js
// ==/UserScript==

/* 공유 core가 먼저 실행된 스크립트의 권한을 사용하므로 Firebase 권한도 동일하게 선언한다. */
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

  const presets = [
    {
      name: '이름 + 대사',
      hint: '**이름 |** "대사"',
      sample: '**루엔 |** "별이 사라져도, 이 길의 끝에서 기다리겠습니다."',
      regex: '^\\*\\*(?<name>[^|｜*]+)\\s*[|｜]\\*\\*\\s*["“](?<speech>[^"”\\n]+)["”]$'
    },
    {
      name: '외국어 대사 + 번역',
      hint: '**이름 |** "대사"\n(한국어 번역)',
      sample: '**Aerin |** "Even the longest night gives way to dawn."\n(가장 긴 밤도 결국 새벽에게 길을 내어주지요.)',
      regex: '^\\*\\*(?<name>[^|｜*]+)\\s*[|｜]\\*\\*\\s*["“](?<speech>[^"”]+)["”]\\s*\\((?<translation>[^)]+)\\)$'
    },
    {
      name: '장식 이름 + 번역명',
      hint: '⧙ **이름** *번역명* ⧙\n❝ 대사 *번역* ❞',
      sample: '⧙ **Aerin** *에린* ⧙\n❝ Follow the silver light. *은빛을 따라오세요.* ❞',
      regex: '^⧙\\s*\\*\\*(?<name>[^*]+)\\*\\*\\s*\\*(?<translatedName>[^*]+)\\*\\s*⧙\\s*❝\\s*(?<speech>[^*]+?)\\s*\\*(?<translation>[^*]+)\\*\\s*❞$'
    },
    {
      name: '원문 + 발음 + 번역',
      hint: '⧙ 이름 번역명 ⧙\n"원문 / 한글 발음 / 번역"',
      sample: '⧙ Aerin 에린 ⧙\n" Lux inter tenebras.\n룩스 인테르 테네브라스.\n어둠 속에서도 빛은 남아 있습니다. "',
      regex: '^⧙\\s*(?<name>\\S+)\\s+(?<translatedName>[^⧙]+?)\\s*⧙\\s*"\\s*(?<speech>[^\\n]+)\\n(?<pronunciation>[^\\n]+)\\n(?<translation>[^"\\n]+?)\\s*"$'
    }
  ];

  const themes = [['none', '미설정', '—'], ['fantasy', '판타지', '✦'], ['dark', '정통 판타지', '⚜'], ['game', '게임 말풍선', '···'], ['sf', 'SF 통신', '⌁'], ['urban', '어반 판타지', '↗'], ['noir', '느와르', '◒'], ['ink', '수묵', '墨'], ['terminal', '터미널', '>_'], ['letter', '편지', '✉'], ['comic', '코믹', '!'], ['glass', '글라스', '◌']];

  // 화면 설정과 대사 테마만 저장한다. 키 배정은 이 스크립트에서 다루지 않는다.
  function defaultSettings() {
    return {
      version: 1,
      hideLeft: true,
      hideTop: true,
      closeRight: true,
      autoGrow: true,
      showSlider: true,
      theme: 'none',
      pattern: 0,
      customRegex: presets[0].regex
    };
  }
  // 저장값 중 이 스크립트가 사용하는 유효한 설정만 받아들인다.
  function normalizeSettings(value) {
    const next = defaultSettings();
    if (!value || value.version !== 1) return next;
    for (const key of ['hideLeft', 'hideTop', 'closeRight', 'autoGrow', 'showSlider']) {
      if (typeof value[key] === 'boolean') next[key] = value[key];
    }
    if (themes.some(([id]) => id === value.theme)) next.theme = value.theme;
    if (value.pattern === 'custom' || Number.isInteger(value.pattern) && presets[value.pattern]) next.pattern = value.pattern;
    if (typeof value.customRegex === 'string') next.customRegex = value.customRegex.slice(0, 4096);
    return next;
  }
  // 화자 이름을 이미지 검색에 사용할 형태로 정리한다.
  function normalizeName(name) {
    return String(name || '').replace(/\*\*/g, '').trim().normalize('NFKC').replace(/\s+/g, ' ');
  }
  let settings = defaultSettings();
  let portraits = new Map();
  let persistedPortraits = new Map();
  let draft = null;
  let draftPortraits = null;
  let database;
  let storageError = false;
  const storageReady = loadSettings().catch(() => {
    storageError = true;
  });

  // 새 전용 저장소를 열고 저장된 설정을 불러온다.
  async function loadSettings() {
    database = await new Promise((resolve, reject) => {
      const request = page.indexedDB.open('crack-immersion-local', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('settings');
        request.result.createObjectStore('portraits', { keyPath: 'name' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.onversionchange = () => database.close();
    const saved = await new Promise((resolve, reject) => {
      const transaction = database.transaction(['settings', 'portraits']);
      const config = transaction.objectStore('settings').get('current');
      const images = transaction.objectStore('portraits').getAll();
      transaction.oncomplete = () => resolve({ config: config.result, images: images.result });
      transaction.onerror = () => reject(transaction.error);
    });
    const value = saved.config === undefined ? await readLegacySettings() : saved;
    settings = normalizeSettings(value?.config);
    persistedPortraits = new Map((saved.images || []).map(item => [normalizeName(item.name), item.blob]));
    portraits = new Map((value?.images || []).filter(item => typeof item.name === 'string' && item.blob instanceof page.Blob).map(item => [normalizeName(item.name), item.blob]));
    if (saved.config === undefined && value?.config) await persist(settings, portraits);
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
        const transaction = legacy.transaction(['settings', 'portraits']);
        const config = transaction.objectStore('settings').get('current');
        const images = transaction.objectStore('portraits').getAll();
        transaction.oncomplete = () => {
          legacy.close();
          resolve({ config: config.result, images: images.result });
        };
        transaction.onerror = () => {
          legacy.close();
          reject(transaction.error);
        };
      };
    });
  }

  // 검증된 설정과 변경된 화자 이미지를 이 스크립트 전용 IndexedDB에 저장한다.
  async function persist(next, images) {
    if (!database || storageError) throw new Error('이 브라우저의 로컬 저장소를 열 수 없습니다.');
    const nextPortraits = new Map(images);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(['settings', 'portraits'], 'readwrite');
      transaction.objectStore('settings').put(next, 'current');
      const store = transaction.objectStore('portraits');
      for (const name of persistedPortraits.keys()) if (!nextPortraits.has(name)) store.delete(name);
      for (const [name, blob] of nextPortraits) if (persistedPortraits.get(name) !== blob) store.put({ name, blob });
      transaction.oncomplete = () => {
        persistedPortraits = nextPortraits;
        resolve();
      };
      transaction.onerror = () => reject(new Error('설정 저장을 완료하지 못했습니다. 저장 공간을 확인해주세요.'));
      transaction.onabort = () => reject(new Error('설정 저장을 완료하지 못했습니다.'));
    });
  }

  // 인증 헤더와 메시지 순서는 페이지 메모리에서만 사용한다.
  let authorization = '';
  const authWaiters = new Set();
  const nativeFetch = page.fetch.bind(page);
  const xhrRecords = new WeakMap();
  const xhrOpen = page.XMLHttpRequest.prototype.open;
  const xhrHeader = page.XMLHttpRequest.prototype.setRequestHeader;
  const xhrSend = page.XMLHttpRequest.prototype.send;

  // 크랙 API 요청만 관찰 대상으로 분류한다.
  function apiUrl(input) {
    try {
      const url = new page.URL(typeof input === 'string' ? input : input.url, page.location.href);
      return url.origin === API_ORIGIN ? url : null;
    } catch {
      return null;
    }
  }

  // 크랙 요청에서 인증 헤더를 관찰해 메모리에만 보관한다.
  function observeAuthorization(url, headers) {
    if (!url) return;
    const value = new page.Headers(headers).get('authorization');
    if (!value || !/^Bearer\s+\S+/i.test(value)) return;
    authorization = value;
    for (const resolve of authWaiters) resolve();
    authWaiters.clear();
  }

  // 메시지 요청의 채팅방을 구분한다.
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
        restoreHighlights();
        scheduleSync();
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
        restoreHighlights();
        scheduleSync();
        if (this.status < 200 || this.status >= 300) return;
        if (record.method !== 'GET') {
          if (['DELETE', 'PATCH', 'PUT'].includes(record.method)) invalidateIndex();
          return;
        }
        try {
          ingestNative(record.url, this.responseType === 'json' ? this.response : JSON.parse(this.responseText));
        } catch { /* 스트림과 바이너리는 기록 목록이 아니다. */ }
      }, { once: true });
    }
    return xhrSend.apply(this, args);
  };

  // 크랙의 실제 인증 요청이 관찰될 때까지 기다린다.
  async function requireAuthorization() {
    if (authorization) return;
    await new Promise((resolve, reject) => {
      const done = () => {
        page.clearTimeout(timer);
        resolve();
      };
      const timer = page.setTimeout(() => {
        authWaiters.delete(done);
        reject(new Error('크랙 요청을 기다리고 있습니다. 메시지 검색을 한 번 열거나 페이지를 새로고침해주세요.'));
      }, 8000);
      authWaiters.add(done);
    });
  }

  // 크랙 기록을 GET으로 읽는다.
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

  // 현재 경로에서 채팅방 ID를 읽는다.
  function currentChatId() {
    return suspended ? '' : page.location.pathname.match(/\/episodes\/([^/?#]+)/)?.[1] || '';
  }

  // 턴 탐색에 필요한 메시지 메타데이터만 보관한다.
  function remember(messages) {
    for (const item of messages) {
      if (!item || typeof item._id !== 'string' || !['user', 'assistant'].includes(item.role)) continue;
      metadata.set(item._id, {
        id: item._id,
        role: item.role,
        turnId: item.turnId,
        parentTurnId: item.parentTurnId,
        createdAt: item.createdAt || '',
        status: item.status
      });
    }
  }

  // 부모 턴 연결을 따라 현재 대화의 턴 순서를 만든다.
  function buildTurns() {
    const byTurn = new Map([...metadata.values()].filter(item => item.turnId).map(item => [item.turnId, item]));
    const latest = metadata.get(latestMessageId);
    if (!latest) return;
    const chain = [];
    const visited = new Set();
    let item = latest;
    while (item && !visited.has(item.id)) {
      chain.push(item);
      visited.add(item.id);
      item = item.parentTurnId ? byTurn.get(item.parentTurnId) : null;
    }
    chain.reverse();
    turns = [];
    ordinal = new Map();
    let turn = 0;
    for (const message of chain) {
      if (message.role === 'user') turn += 1;
      turns[turn] = { id: message.id };
      ordinal.set(message.id, turn);
    }
    if (!turns[0] && turns[1]) turns[0] = turns[1];
    updateChronicle();
  }

  // 크랙이 이미 읽은 기록에서 턴 메타데이터를 갱신한다.
  function ingestNative(url, value) {
    if (messageRoute(url) !== chatId || !Array.isArray(value?.data?.messages)) return;
    const messages = value.data.messages;
    remember(messages);
    const isLatestPage = !url.pathname.endsWith('/around') && !url.searchParams.has('cursor') && url.searchParams.get('sortOrder') !== 'asc';
    if (isLatestPage && messages[0]?._id) latestMessageId = messages[0]._id;
    if (indexComplete) buildTurns();
    scheduleSync();
  }

  // 수정·삭제 이후 턴 순서를 다시 조회한다.
  function invalidateIndex() {
    indexComplete = false;
    indexAbort?.abort();
    indexJob = null;
    if (immersive) startIndex().catch(showError);
  }

  // 새 메시지가 생기면 최신 턴만 갱신한다.
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
    }).catch(showError).finally(() => {
      latestRefresh = null;
    });
  }

  // 기록을 페이지 단위로 읽어 턴 인덱스를 구성한다.
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
      indexComplete = true;
      buildTurns();
    })().finally(() => {
      if (indexAbort === controller) {
        indexJob = null;
        indexAbort = null;
      }
    });
    return indexJob;
  }

  let uiHost, ui, uiShell;
  let saving = false;
  let toastTimer;
  let previewRevision = 0;
  const imageUrls = new Map();
  const $ = id => ui?.getElementById(id);
  let activeTab = 'screen';

  const SETTINGS_HTML = String.raw`
<div class="settings-scrim" id="settings-scrim" hidden="">
  <section class="cc-ui ui-window focus-window" id="focus-window" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
    <header class="window-header">
      <div class="identity">
        <div class="brand-mark" aria-hidden="true">&gt;_</div>
        <div>
          <div class="eyebrow">CRACK COMMANDLINE</div>
          <h1 id="settings-title">몰입모드 설정</h1>
        </div>
      </div>
      <div class="header-end">
        <span class="local-label">설정은 이 기기에만 저장</span>
        <button class="icon-button" id="close-settings" aria-label="설정 닫기">×</button>
      </div>
    </header>
    <nav class="settings-tabs" role="tablist" aria-label="몰입모드 설정 분류">
      <button id="screen-tab" role="tab" aria-selected="true" aria-controls="screen-panel" data-tab="screen">몰입 화면</button>
      <button id="theme-tab" role="tab" aria-selected="false" aria-controls="theme-panel" data-tab="theme">대사 테마</button>
    </nav>
    <div class="settings-content">
      <div id="screen-panel" class="screen-panel" role="tabpanel" aria-labelledby="screen-tab">
        <section class="section">
          <div class="section-heading">
            <div class="section-title">
              <span class="section-number">01</span>
              <h2>몰입 화면</h2>
            </div>
          </div>
          <label class="setting-line"><span>왼쪽 채팅 목록 숨기기</span><input class="switch" id="hide-left" type="checkbox" checked=""></label>
          <label class="setting-line"><span>사이트 상단 메뉴 숨기기</span><input class="switch" id="hide-top" type="checkbox" checked=""></label>
          <label class="setting-line"><span>진입할 때 오른쪽 메뉴 닫기</span><input class="switch" id="close-right" type="checkbox" checked=""></label>
          <label class="setting-line"><span>입력창 자동 늘리기<small>최대 화면 높이의 50%</small></span><input class="switch" id="auto-grow" type="checkbox" checked=""></label>
          <label class="setting-line"><span>턴 슬라이더 표시</span><input class="switch" id="show-slider" type="checkbox" checked=""></label>
        </section>
      </div>
      <div id="theme-panel" class="theme-panel" role="tabpanel" aria-labelledby="theme-tab">
        <section class="section theme-section">
          <div class="section-heading">
            <div class="section-title">
              <span class="section-number">02</span>
              <h2>대사 테마</h2>
            </div>
          </div>
          <div class="theme-picker" id="theme-picker" role="group" aria-label="대사 테마"></div>
        </section>
        <section class="sample-section">
          <div class="sample-heading">
            <h2>실시간 미리보기</h2>
            <div class="sample-tools">
              <span id="sample-match">패턴 인식됨</span>
              <div class="scene-mode" role="group" aria-label="채팅 배경 미리보기">
                <button data-scene-mode="dark" aria-pressed="true">☾ 다크</button>
                <button data-scene-mode="light" aria-pressed="false">☀ 라이트</button>
              </div>
            </div>
          </div>
          <div id="dialogue-preview" class="dialogue-preview"></div>
          <label class="field-label" for="sample-input">예시 원문 <span>직접 바꿔볼 수 있습니다</span></label>
          <textarea id="sample-input" class="text-input sample-input" spellcheck="false"></textarea>
        </section>
        <section class="section pattern-section">
          <div class="section-heading">
            <div class="section-title">
              <span class="section-number">03</span>
              <h2>대사 인식 패턴</h2>
            </div>
          </div>
          <div id="preset-list" class="preset-list" role="group" aria-label="대사 패턴"></div>
          <div id="custom-pattern" hidden="">
            <label class="field-label" for="regex-input">인식할 정규식</label>
            <textarea id="regex-input" class="text-input regex-input" spellcheck="false" aria-label="대사 인식 정규식"></textarea>
            <details class="regex-guide">
              <summary>처음 만드는 정규식</summary>
              <ol>
                <li>원문의 고정 기호를 그대로 적습니다.</li>
                <li>바뀌는 부분을 아래 그룹으로 바꿉니다.</li>
                <li>오른쪽 원문으로 인식 결과를 확인합니다.</li>
              </ol>
              <div class="guide-example">
                <span>원문</span>
                <code>에린: 안녕!</code>
                <span>정규식</span>
                <code>^(?&lt;name&gt;.+?): (?&lt;speech&gt;.+)$</code>
              </div>
              <dl>
                <dt><code>(?&lt;name&gt;.+?)</code></dt>
                <dd>화자 이름</dd>
                <dt><code>(?&lt;translatedName&gt;.+?)</code></dt>
                <dd>번역된 이름</dd>
                <dt><code>(?&lt;speech&gt;.+?)</code></dt>
                <dd>대사 · 필수</dd>
                <dt><code>(?&lt;translation&gt;.+?)</code></dt>
                <dd>한국어 번역</dd>
                <dt><code>(?&lt;pronunciation&gt;.+?)</code></dt>
                <dd>한글 발음</dd>
              </dl>
              <p><code>.+?</code> 짧게 읽기 · <code>\n</code> 줄바꿈</p>
              <p><code>\*</code> 별표 · <code>\|</code> 세로줄 · <code>"</code> 따옴표 그대로</p>
              <p><code>^</code> 시작 · <code>$</code> 끝 · <code>.+</code> 한 글자 이상</p>
              <p><code>[\s\S]+?</code> 줄바꿈도 포함해 읽기</p>
              <p>없는 항목의 그룹은 생략하세요.</p>
              <p>양끝의 <code>/</code> 없이 식만 입력합니다.</p>
              <button class="button subtle" id="load-regex-example">이 예제로 시작</button>
            </details>
          </div>
        </section>
        <section class="section speaker-section">
          <div class="section-heading">
            <div class="section-title">
              <span class="section-number">04</span>
              <h2>화자 이미지</h2>
            </div>
          </div>
          <form id="speaker-form" class="speaker-form">
            <input id="speaker-name" class="text-input" placeholder="원문에 나오는 이름" aria-label="이미지를 연결할 화자 이름" value="">
            <button class="button subtle" type="submit">이미지 등록</button>
          </form>
          <input id="speaker-file" type="file" accept="image/png,image/webp,image/jpeg,image/gif" hidden="">
          <small class="speaker-help">이름당 1장 · 정사각형 · PNG / WebP 투명 지원</small>
          <div id="speaker-list" class="speaker-list"></div>
        </section>
      </div>
    </div>
    <footer class="window-footer">
      <button class="button" id="toggle-immersion">몰입모드 켜기</button>
      <div class="footer-actions">
        <button class="button subtle" id="save-preview">설정 저장</button>
        <button class="button subtle" id="cancel-settings">취소</button>
      </div>
    </footer>
  </section>
</div>
<div class="cc-ui preview-toast" id="toast" role="status" hidden=""></div>
`;


  const extensionCSS = String.raw`
    /* 몰입모드: 설정창, 턴 슬라이더, 대사 테마. */

    /* 턴 슬라이더: 화면 가장자리에서 일정한 길이로 표시한다. */

    .chronicle {
      position: absolute;
      left: 20px;
      top: 95px;
      bottom: 145px;
      width: 40px;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: center;
      color: #cbb485;
    }

    .chronicle-cap {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      position: relative;
      z-index: 2;
      filter: drop-shadow(0 0 8px #cfa76544);
    }

    .chronicle-cap svg {
      width: 100%;
      height: 100%;
      fill: #263036;
      stroke: #c6ab77;
      stroke-width: 1;
    }

    .chronicle-cap svg path:first-of-type {
      fill: #d2b780;
      stroke: none;
    }

    .chronicle-scale {
      flex: 1;
      width: 100%;
      min-height: 100px;
      position: relative;
      margin-top: -1px;
    }

    .chronicle-spine {
      position: absolute;
      left: calc(50% - 1px);
      top: 0;
      bottom: 0;
      width: 2px;
      background: #293337;
      box-shadow: 0 0 0 1px #96805a44;
    }

    .chronicle-fill {
      height: 60%;
      background: linear-gradient(#b99c66,#f2d9a1);
      width: 100%;
      box-shadow: 0 0 8px #d9b67544;
    }

    .chronicle-gem {
      position: absolute;
      left: 50%;
      top: 60%;
      width: 13px;
      height: 13px;
      border: 1px solid #f4db9d;
      border-radius: 50%;
      transform: translate(-50%,-50%);
      background: radial-gradient(circle,#fff3c9,#b28f51 50%,#37403f 60%);
      box-shadow: 0 0 0 3px #c5a66d22,0 0 14px #e4c98480;
      pointer-events: none;
    }

    #turn-range {
      position: absolute;
      left: -11px;
      top: -8px;
      width: 24px;
      height: calc(100% + 16px);
      margin: 0;
      writing-mode: vertical-lr;
      direction: ltr;
      opacity: 0;
      cursor: pointer;
    }

    #turn-range:focus {
      outline: none;
    }

    .chronicle-position {
      display: grid;
      justify-items: center;
      gap: 2px;
      padding-top: 13px;
      line-height: 1.2;
      font-family: Georgia,serif;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .chronicle-position strong {
      font-size: 19px;
      font-weight: 400;
      color: #e4cfa4;
    }

    .chronicle-position i {
      width: 14px;
      height: 1px;
      background: #756c57;
      font-size: 0;
    }

    .chronicle-position small {
      color: #9a8c71;
      font-size: 12px;
    }

    /* 설정창 공용 프레임과 대분류 탭. */
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

    .settings-tabs {
      display: flex;
      align-items: stretch;
      padding: 0 22px;
      border-bottom: 1px solid #81704a66;
      background: #111a2180;
      min-height: 39px;
      flex-shrink: 0;
    }

    .settings-tabs [role=tab] {
      padding: 9px 22px;
      font-size: 11px;
      color: #8e9a9e;
      border-bottom: 2px solid transparent;
    }

    .settings-tabs [aria-selected=true] {
      color: #efd5a2;
      border-bottom-color: #c5a771;
      background: linear-gradient(0deg,#c5a77119,transparent);
    }

    .settings-tabs > span {
      margin-left: auto;
      color: #78868a;
      font-size: 10px;
      align-self: center;
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

    /* 몰입 화면 옵션. */
    .setting-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 37px;
      font-size: 11px;
      color: #c5ceca;
      border-bottom: 1px solid #63706a1a;
    }

    .setting-line small {
      color: #7d8d91;
      display: block;
      font-size: 9px;
    }

    .switch {
      appearance: none;
      width: 29px;
      height: 15px;
      border: 1px solid #68716b;
      background: #101820;
      border-radius: 9px;
      position: relative;
      flex-shrink: 0;
      cursor: pointer;
      margin: 0;
    }

    .switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 9px;
      height: 9px;
      background: #718086;
      border-radius: 50%;
      transition: transform .12s;
    }

    .switch:checked {
      background: #b3975c55;
      border-color: #c8ac75;
    }

    .switch:checked::after {
      background: #e5ce9f;
      transform: translateX(14px);
    }

    /* 대사 인식 패턴과 사용자 정규식 안내. */
    .preset-list {
      display: grid;
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: 5px;
    }

    .preset-choice:last-child {
      grid-column: 1 / -1;
    }

    .cc-ui .preset-choice {
      text-align: left;
      border: 1px solid #56635f;
      padding: 7px 10px;
      background: #131e25a3;
      border-radius: 2px;
      position: relative;
    }

    .preset-choice strong {
      display: block;
      font-size: 10px;
      font-weight: 500;
      color: #b9c7c6;
    }

    .preset-choice code {
      display: block;
      font-size: 9px;
      color: #748b93;
      margin-top: 3px;
      white-space: pre-line;
      line-height: 1.5;
    }

    .preset-choice[aria-pressed=true] {
      border-color: #b79b67;
      background: #9e885018;
    }

    .preset-choice[aria-pressed=true]::after {
      content: '✓';
      position: absolute;
      top: 6px;
      right: 9px;
      color: #d8bb7e;
    }

    .preset-choice[aria-pressed=true] strong {
      color: #e1c89d;
    }

    #custom-pattern {
      margin-top: 9px;
      font-size: 10px;
      color: #a5b4b4;
    }

    .cc-ui .regex-input {
      display: block;
      min-height: 62px;
      height: 62px;
      resize: vertical;
      font: 10px/1.6 Consolas,monospace;
      overflow-wrap: anywhere;
    }

    .regex-guide {
      margin-top: 7px;
      border-top: 1px solid #66716b44;
      padding-top: 6px;
    }

    .regex-guide summary {
      cursor: pointer;
      color: #c9b98f;
    }

    .regex-guide ol {
      padding-left: 18px;
      font-size: 10px;
      line-height: 2;
      margin: 7px 0;
    }

    .regex-guide p {
      margin: 5px 0;
      font-size: 9px;
    }

    .regex-guide dl {
      display: grid;
      grid-template-columns: 145px 1fr;
      gap: 3px 10px;
      margin: 8px 0;
      font-size: 9px;
    }

    .regex-guide dt {
      font-family: Consolas,monospace;
      color: #dcc79c;
    }

    .regex-guide dd {
      margin: 0;
    }

    .guide-example {
      display: grid;
      gap: 3px;
      padding: 7px;
      background: #101920;
      border-left: 2px solid #9c865a;
    }

    .guide-example span {
      color: #7d9195;
      font-size: 8px;
    }

    .guide-example code {
      font: 9px/1.8 Consolas,monospace;
      white-space: nowrap;
    }

    .regex-guide .button {
      min-height: 24px;
      font-size: 9px;
      margin-top: 5px;
    }

    /* 테마 선택, 화자 이미지, 미리보기. */
    .theme-picker {
      display: grid;
      grid-template-columns: repeat(3,minmax(0,1fr));
      gap: 5px;
    }

    .cc-ui .theme-choice {
      min-height: 30px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 6px;
      border: 1px solid #54605b;
      background: #172129;
      border-radius: 2px;
      font-size: 9px;
      color: #aeb8b5;
      white-space: nowrap;
    }

    .theme-choice[aria-pressed=true] {
      border-color: #d0b27a;
      color: #efdaad;
      background: #b79c5d1c;
    }

    .theme-art {
      flex-shrink: 0;
      display: grid;
      place-items: center;
      width: 23px;
      height: 21px;
      color: #c8b486;
      font: 16px Georgia,serif;
      border-radius: 2px;
      background: #111a22;
    }

    .theme-art.fantasy {
      background: #263c3c;
      color: #bdd7cc;
    }

    .theme-art.dark {
      background: #302c27;
      color: #d4bd8f;
    }

    .theme-art.game {
      background: #2c3540;
      color: #bfcfe1;
    }

    .theme-art.sf {
      background: repeating-linear-gradient(0deg,#11474d 0 1px,#092d35 1px 3px);
      color: #7ffff2;
    }

    .theme-art.urban {
      background: #302c3a;
      color: #d4c9e5;
    }

    .theme-art.noir {
      background: #292a2d;
      color: #d7d2ce;
    }

    .theme-art.ink {
      background: #303536;
      color: #e0e2dc;
    }

    .theme-art.terminal {
      background: #1a292c;
      color: #b7d0cf;
      font: 11px Consolas,monospace;
    }

    .theme-art.letter {
      background: #35322e;
      color: #ded3bf;
    }

    .theme-art.comic {
      background: #30333b;
      color: #e5d6d9;
      font-weight: 900;
    }

    .theme-art.glass {
      background: linear-gradient(135deg,#79adcd44,#d2a4c522);
      color: #c7e8fb;
    }

    .speaker-form {
      display: flex;
      gap: 5px;
    }

    .cc-ui .speaker-form input {
      width: 0;
      flex: 1;
      min-width: 0;
      height: 28px;
      padding: 4px 7px;
      font-size: 10px;
    }

    .speaker-form .button {
      min-height: 28px;
      padding: 3px 7px;
      font-size: 9px;
      white-space: nowrap;
    }

    .speaker-help {
      display: block;
      color: #84979b;
      font-size: 8px;
      margin: 5px 0 8px;
      white-space: nowrap;
    }

    .speaker-list {
      display: grid;
      gap: 4px;
      max-height: 80px;
      overflow: auto;
      scrollbar-width: thin;
    }

    .speaker-row {
      display: flex;
      align-items: center;
      gap: 7px;
      background: #111c23;
      border: 1px solid #6d755f33;
      padding: 2px 5px;
      min-height: 32px;
    }

    .speaker-thumb {
      width: 26px;
      height: 26px;
      object-fit: cover;
      background: repeating-conic-gradient(#354247 0% 25%,#27333a 0% 50%) 0/8px 8px;
    }

    .speaker-edit {
      flex: 1;
      min-width: 0;
      text-align: left;
      font-size: 10px;
      color: #c8d3cc;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .speaker-remove {
      width: 18px;
      color: #8c9a99;
      font-size: 14px;
    }

    .sample-section {
      margin-top: 8px;
    }

    .sample-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 7px;
    }

    .sample-heading h2 {
      color: #b9c5c3;
      font-size: 11px;
    }

    .sample-heading span {
      color: #acc695;
      font-size: 9px;
    }

    .dialogue-preview {
      min-height: 140px;
      padding: 10px 15px;
      background: radial-gradient(ellipse at 50% 0,#57604a14,transparent),#101a21;
      border: 1px solid #59645b55;
      margin-bottom: 9px;
      display: flex;
      align-items: center;
    }

    .dialogue-preview > * {
      width: 100%;
    }

    .cc-ui .sample-input {
      height: 88px;
      resize: vertical;
      font: 10px/1.7 Consolas,'Malgun Gothic',sans-serif;
      color: #b1c5c5;
    }

    /* 실제 대사 렌더러. 각 테마의 다크·라이트 색상을 이 아래에서 정의한다. */
    .dialogue {
      --paper: #232a32;
      --ink: #e5e9ed;
      --secondary: #c7cfd7;
      --subtle: #adb8c3;
      --edge: #53606c;
      --edge-soft: #53606c66;
      --accent: #c3d2df;
      --wash: #c3d2df0a;
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 13px 0;
      padding: 9px 12px;
      color: var(--ink);
      font-size: 13px;
      background: var(--paper);
      border: 1px solid var(--edge);
      isolation: isolate;
    }

    [data-scene-mode=light] .dialogue {
      --paper: #f8f9fa;
      --ink: #28343d;
      --secondary: #46535f;
      --subtle: #586671;
      --edge: #a9b4be;
      --edge-soft: #a9b4be66;
      --accent: #455e71;
      --wash: #455e7108;
    }

    .dialogue-body {
      flex: 1;
      min-width: 0;
      position: relative;
      z-index: 1;
    }

    .dialogue-name {
      display: flex;
      align-items: baseline;
      gap: 7px;
      margin-bottom: 2px;
      font: 700 11px/1.5 Georgia,'Batang',serif;
      color: var(--accent);
    }

    .dialogue-name small {
      font: 9px 'Malgun Gothic',sans-serif;
      color: var(--subtle);
    }

    .dialogue-speech {
      margin: 0;
      font: 13px/1.7 Georgia,'Batang',serif;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }

    .dialogue-pronunciation {
      margin: 1px 0 0;
      color: var(--subtle);
      font: 10px/1.5 'Malgun Gothic',sans-serif;
    }

    .dialogue-translation {
      margin: 3px 0 0;
      color: var(--secondary);
      font: 12px/1.6 'Malgun Gothic',sans-serif;
      white-space: pre-line;
    }

    .speaker-portrait {
      display: block;
      width: 54px;
      height: 54px;
      flex-shrink: 0;
      object-fit: cover;
      align-self: center;
    }

    .dialogue[data-theme=fantasy] {
      --paper: #202f31;
      --ink: #e4ece7;
      --secondary: #c5d5cc;
      --subtle: #acbfb6;
      --edge: #6d8b85;
      --edge-soft: #6d8b8555;
      --accent: #c4dcd0;
      background: radial-gradient(ellipse at 0 0,#a6d1b312,transparent 65%),var(--paper);
      border-radius: 2px 14px 2px 14px;
      border-block-color: var(--edge-soft);
    }

    [data-scene-mode=light] .dialogue[data-theme=fantasy] {
      --paper: #f1f6f2;
      --ink: #293e38;
      --secondary: #425c50;
      --subtle: #596e62;
      --edge: #8ca99c;
      --edge-soft: #8ca99c66;
      --accent: #406b57;
    }

    .dialogue[data-theme=fantasy]::after {
      content: '✧';
      position: absolute;
      right: 7px;
      top: 0;
      color: var(--accent);
      font: 19px Georgia,serif;
    }

    .dialogue[data-theme=fantasy] .speaker-portrait {
      width: 59px;
      height: 70px;
      margin: -10px 0 -9px -4px;
      object-fit: contain;
      object-position: bottom;
      align-self: flex-end;
    }

    .dialogue[data-theme=fantasy] .dialogue-name {
      letter-spacing: .04em;
    }

    .dialogue[data-theme=dark] {
      --paper: #292a27;
      --ink: #e8e1d1;
      --secondary: #d1c7b3;
      --subtle: #b7ad98;
      --edge: #8d7a55;
      --edge-soft: #8d7a5566;
      --accent: #dac394;
      padding: 10px 17px;
      border-block: 3px double var(--edge);
      background: radial-gradient(ellipse at 50% 100%,#ac8e4f0b,transparent 70%),var(--paper);
      box-shadow: inset 0 0 14px #0003,0 2px 4px #0002;
    }

    [data-scene-mode=light] .dialogue[data-theme=dark] {
      --paper: #f0eadd;
      --ink: #39352e;
      --secondary: #514a3d;
      --subtle: #6c614f;
      --edge: #a68c60;
      --edge-soft: #a68c6066;
      --accent: #70572f;
      box-shadow: inset 0 0 14px #8c71420a,0 2px 4px #3d2d1610;
    }

    .medieval-frame {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      color: var(--accent);
    }

    .medieval-frame::before {
      content: '';
      position: absolute;
      inset: 3px;
      border: 1px solid var(--edge-soft);
      clip-path: polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px),0 12px);
    }

    .medieval-frame::after {
      content: '◆';
      position: absolute;
      left: 50%;
      bottom: -9px;
      font-size: 8px;
      transform: translateX(-50%);
      color: var(--edge);
      text-shadow: 0 1px var(--paper);
    }

    .medieval-frame i {
      position: absolute;
      top: -5px;
      left: -5px;
      width: 30px;
      height: 30px;
      background: var(--accent);
      filter: drop-shadow(0 1px #0005);
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cg fill='none' stroke='white' stroke-width='1.2'%3E%3Cpath d='M3 31V3h28M8 27V8h19M3 17l7-7 7-7M8 22l5-5-4-4 4-4 4 4 5-5M13 17q6 0 6-6M3 3l5 5'/%3E%3Ccircle cx='3' cy='3' r='2'/%3E%3Cpath d='m24 3 3-3 3 3-3 3Zm-21 21 3 3-3 3-3-3Z' fill='white' stroke='none'/%3E%3C/g%3E%3C/svg%3E") center/contain no-repeat;
    }

    .medieval-frame i:nth-child(2) {
      left: auto;
      right: -5px;
      transform: rotate(90deg);
    }

    .medieval-frame i:nth-child(3) {
      top: auto;
      bottom: -5px;
      left: auto;
      right: -5px;
      transform: rotate(180deg);
    }

    .medieval-frame i:nth-child(4) {
      top: auto;
      bottom: -5px;
      transform: rotate(270deg);
    }

    .dialogue[data-theme=dark] .speaker-portrait {
      order: 2;
      width: 47px;
      height: 58px;
      border: 3px double var(--edge);
      border-radius: 45% 45% 3px 3px;
      object-fit: cover;
      background: var(--wash);
      filter: saturate(.65);
    }

    .dialogue[data-theme=dark] .dialogue-name {
      font-variant: small-caps;
      letter-spacing: .07em;
    }

    .dialogue[data-theme=game] {
      --paper: #28313d;
      --accent: #c9d9ed;
      --edge: #566479;
      border-radius: 12px 12px 12px 3px;
      padding: 7px 11px;
      max-width: 95%;
      box-shadow: 0 2px 4px #0001;
    }

    [data-scene-mode=light] .dialogue[data-theme=game] {
      --paper: #f6f8fc;
      --accent: #49627f;
      --edge: #b7c4d5;
    }

    .dialogue[data-theme=game]::after {
      content: '';
      position: absolute;
      left: 13px;
      bottom: -5px;
      width: 8px;
      height: 8px;
      background: var(--paper);
      border-right: 1px solid var(--edge);
      border-bottom: 1px solid var(--edge);
      transform: skewY(-30deg);
    }

    .dialogue[data-theme=game] .speaker-portrait {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--wash);
      align-self: flex-start;
    }

    .dialogue[data-theme=game] .dialogue-name {
      font: 600 10px/1.5 'Malgun Gothic',sans-serif;
    }

    .dialogue[data-theme=game] .dialogue-speech {
      font-family: 'Malgun Gothic',sans-serif;
    }

    .dialogue[data-theme=sf] {
      --paper: #0a1d29;
      --ink: #d1fff3;
      --secondary: #afe0d8;
      --subtle: #91c4c8;
      --edge: #39c2bc;
      --accent: #80ffe9;
      background: repeating-linear-gradient(0deg,#1bf6e908 0 1px,transparent 1px 3px),linear-gradient(105deg,#07363c,var(--paper) 70%);
      border-left: 4px solid var(--accent);
      clip-path: polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px));
      box-shadow: inset 0 0 20px #00e5de18;
    }

    [data-scene-mode=light] .dialogue[data-theme=sf] {
      --paper: #ecf7f8;
      --ink: #173e48;
      --secondary: #315e64;
      --subtle: #426e75;
      --edge: #539eaa;
      --accent: #126a76;
      background: repeating-linear-gradient(0deg,#007d8007 0 1px,transparent 1px 3px),linear-gradient(105deg,#d9f0ef,var(--paper) 70%);
    }

    .dialogue[data-theme=sf]::after {
      content: 'RX ▰▰▰▱ / 07';
      position: absolute;
      right: 10px;
      top: 5px;
      font: 8px Consolas,monospace;
      color: var(--subtle);
      letter-spacing: 1px;
    }

    .dialogue[data-theme=sf] .speaker-portrait {
      width: 48px;
      height: 61px;
      border: 1px solid var(--edge);
      filter: grayscale(1) sepia(.7) hue-rotate(110deg);
      opacity: .9;
      clip-path: polygon(12px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 12px);
    }

    .dialogue[data-theme=sf] .dialogue-name {
      text-shadow: 1px 0 #ff4e8544,-1px 0 #19baff66;
      font: 700 10px Consolas,'Malgun Gothic',monospace;
    }

    .dialogue[data-theme=sf] .dialogue-speech {
      text-shadow: .5px 0 #35ffff22;
    }

    .dialogue[data-theme=urban] {
      --paper: #292832;
      --accent: #d8cee9;
      --edge: #716a85;
      --wash: #d8cee916;
      border: 0;
      border-left: 2px solid var(--accent);
      border-radius: 0 8px 0 0;
      background: linear-gradient(100deg,var(--wash),transparent 65%),var(--paper);
      box-shadow: 0 1px 0 var(--edge);
      padding: 8px 13px;
    }

    [data-scene-mode=light] .dialogue[data-theme=urban] {
      --paper: #f5f3f8;
      --accent: #625275;
      --edge: #ada3bb;
      --wash: #6252750a;
    }

    .dialogue[data-theme=urban]::after {
      content: '';
      position: absolute;
      bottom: 0;
      right: 0;
      width: 26px;
      height: 5px;
      background: var(--edge);
      clip-path: polygon(5px 0,100% 0,100% 100%,0 100%);
    }

    .dialogue[data-theme=urban] .dialogue-name {
      width: fit-content;
      border-bottom: 1px solid var(--edge);
      padding: 0 10px 2px 0;
      margin-bottom: 4px;
      font: 700 10px/1.4 'Malgun Gothic',sans-serif;
      letter-spacing: .04em;
    }

    .dialogue[data-theme=urban] .speaker-portrait {
      order: 2;
      width: 61px;
      height: 69px;
      object-fit: contain;
      margin: -9px 0 -8px;
      align-self: flex-end;
      filter: drop-shadow(-2px 2px #0002);
    }

    .dialogue[data-theme=noir] {
      --paper: #242527;
      --ink: #eeebe6;
      --secondary: #d0cbc5;
      --subtle: #b0aba6;
      --accent: #d9b8ae;
      --edge: #81736d;
      border: 0;
      border-block: 1px solid var(--edge);
      padding: 8px 12px 8px 0;
      background: linear-gradient(90deg,var(--paper),transparent);
    }

    [data-scene-mode=light] .dialogue[data-theme=noir] {
      --paper: #f4f1ed;
      --ink: #302c2b;
      --secondary: #4d4642;
      --subtle: #6e625b;
      --accent: #79544a;
      --edge: #a89991;
    }

    .dialogue[data-theme=noir] .speaker-portrait {
      width: 42px;
      height: 59px;
      filter: grayscale(1) contrast(1.1);
      background: var(--wash);
      margin-left: 5px;
      border: 1px solid var(--edge);
    }

    .dialogue[data-theme=noir] .dialogue-name {
      font: italic 12px/1.5 Georgia,'Batang',serif;
    }

    .dialogue[data-theme=noir] .dialogue-name::after {
      content: '';
      height: 1px;
      width: 22px;
      background: var(--edge);
    }

    .dialogue[data-theme=ink] {
      --paper: #262d2c;
      --ink: #e1e6df;
      --secondary: #c6cfc6;
      --subtle: #acb9b0;
      --accent: #dfb1a6;
      --edge: #6d8073;
      border: 0;
      border-left: 3px solid var(--edge);
      background: linear-gradient(90deg,var(--paper),transparent);
      padding: 7px 12px;
    }

    [data-scene-mode=light] .dialogue[data-theme=ink] {
      --paper: #f3f4ef;
      --ink: #2e3832;
      --secondary: #48574c;
      --subtle: #606c62;
      --accent: #8e4e43;
      --edge: #9aa99a;
    }

    .dialogue[data-theme=ink]::before {
      content: '';
      position: absolute;
      top: 0;
      left: -3px;
      width: 20px;
      height: 1px;
      background: var(--edge);
    }

    .dialogue[data-theme=ink] .speaker-portrait {
      order: 2;
      width: 32px;
      height: 32px;
      filter: grayscale(1);
      border-radius: 2px;
      opacity: .9;
    }

    .dialogue[data-theme=ink] .dialogue-name {
      font-size: 10px;
      width: fit-content;
      padding: 1px 5px;
      border: 1px solid var(--accent);
      border-radius: 1px;
      margin-bottom: 4px;
    }

    .dialogue[data-theme=terminal] {
      --paper: #1c2a2d;
      --ink: #deebea;
      --secondary: #bcd3d0;
      --subtle: #a4bebc;
      --accent: #b3d9d2;
      --edge: #5b7c7b;
      background: linear-gradient(90deg,var(--wash) 30px,transparent 30px),var(--paper);
      border: 1px solid var(--edge);
      border-radius: 2px;
      padding: 7px 11px;
    }

    [data-scene-mode=light] .dialogue[data-theme=terminal] {
      --paper: #f0f6f5;
      --ink: #29413f;
      --secondary: #3e5d59;
      --subtle: #53726f;
      --accent: #386e65;
      --edge: #92b1aa;
    }

    .dialogue[data-theme=terminal] .speaker-portrait {
      width: 20px;
      height: 20px;
      align-self: flex-start;
      filter: grayscale(.8);
    }

    .dialogue[data-theme=terminal] .dialogue-name {
      font: 10px/1.5 Consolas,'Malgun Gothic',monospace;
    }

    .dialogue[data-theme=terminal] .dialogue-name::before {
      content: '›';
      color: var(--subtle);
      font-weight: 400;
    }

    .dialogue[data-theme=terminal] .dialogue-speech {
      font-family: Consolas,'Malgun Gothic',monospace;
    }

    .dialogue[data-theme=letter] {
      --paper: #302e2a;
      --ink: #e9e3d9;
      --secondary: #d0c7b9;
      --subtle: #b8ae9e;
      --accent: #dbc6a5;
      --edge: #897d69;
      border: 0;
      border-top: 1px solid var(--edge);
      border-bottom: 1px solid var(--edge-soft);
      background: linear-gradient(90deg,var(--paper),transparent);
      padding: 9px 12px;
    }

    [data-scene-mode=light] .dialogue[data-theme=letter] {
      --paper: #f7f3eb;
      --ink: #38332b;
      --secondary: #544b3f;
      --subtle: #6e6352;
      --accent: #775f3d;
      --edge: #b5a68c;
    }

    .dialogue[data-theme=letter] .dialogue-body {
      display: flex;
      flex-direction: column;
    }

    .dialogue[data-theme=letter] .dialogue-name {
      order: 3;
      align-self: flex-end;
      margin: 3px 0 0;
      font: italic 11px/1.4 Georgia,'Batang',serif;
    }

    .dialogue[data-theme=letter] .dialogue-name::before {
      content: '—';
      font-weight: 400;
    }

    .dialogue[data-theme=letter] .speaker-portrait {
      order: 2;
      width: 36px;
      height: 43px;
      border: 3px double var(--edge);
      filter: saturate(.45);
      align-self: flex-end;
    }

    .dialogue[data-theme=comic] {
      --paper: #2d3039;
      --ink: #f0edf0;
      --secondary: #d0cbd4;
      --subtle: #b8b1bf;
      --accent: #e2bcc7;
      --edge: #a09aa9;
      border: 1.5px solid var(--edge);
      border-radius: 12px 5px 14px 4px;
      box-shadow: 2px 2px 0 var(--edge-soft);
      background: radial-gradient(circle at 100% 0,var(--wash),transparent 60%),var(--paper);
    }

    [data-scene-mode=light] .dialogue[data-theme=comic] {
      --paper: #fffafc;
      --ink: #302a32;
      --secondary: #514750;
      --subtle: #70616d;
      --accent: #8f4f65;
      --edge: #7d6e7c;
    }

    .dialogue[data-theme=comic]::before {
      content: '';
      position: absolute;
      left: 25px;
      bottom: -7px;
      width: 12px;
      height: 8px;
      border-left: 1.5px solid var(--edge);
      background: var(--paper);
      transform: skewX(-30deg);
      clip-path: polygon(0 0,100% 0,0 100%);
    }

    .dialogue[data-theme=comic] .speaker-portrait {
      width: 53px;
      height: 63px;
      object-fit: contain;
      margin: -9px 0 -9px -5px;
      align-self: flex-end;
    }

    .dialogue[data-theme=comic] .dialogue-name {
      font: 700 10px/1.5 'Malgun Gothic',sans-serif;
    }

    .dialogue[data-theme=comic] .dialogue-speech {
      font-family: 'Malgun Gothic',sans-serif;
    }

    .dialogue[data-theme=glass] {
      --paper: #19242dcc;
      --ink: #e5edf2;
      --secondary: #c9d8e0;
      --subtle: #a9bfcc;
      --accent: #c7e0ee;
      --edge: #8fb6cc66;
      background: linear-gradient(120deg,#79adcd20,#d2a4c50b),var(--paper);
      border: 1px solid var(--edge);
      border-radius: 13px;
      box-shadow: inset 0 1px #ffffff12;
      backdrop-filter: blur(8px);
    }

    [data-scene-mode=light] .dialogue[data-theme=glass] {
      --paper: #ffffffc9;
      --ink: #253f4c;
      --secondary: #3c5a6b;
      --subtle: #526d7b;
      --accent: #3c657b;
      --edge: #7695a266;
      box-shadow: inset 0 1px #fff,0 2px 6px #496b7d09;
    }

    .dialogue[data-theme=glass] .speaker-portrait {
      width: 35px;
      height: 35px;
      border: 1px solid var(--edge);
      border-radius: 50%;
      background: var(--wash);
    }

    .dialogue[data-theme=glass] .dialogue-name {
      font: 500 10px/1.5 'Malgun Gothic',sans-serif;
    }

    .sample-tools {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .scene-mode {
      display: flex;
      padding: 2px;
      border: 1px solid #68736d66;
      border-radius: 3px;
    }

    .cc-ui .scene-mode button {
      padding: 2px 8px;
      color: #9baeb4;
      font-size: 9px;
    }

    .scene-mode button[aria-pressed=true] {
      background: #6f848b33;
      color: #e0e8e8;
      border-radius: 2px;
    }

    [data-scene-mode=light] .dialogue-preview {
      background: #eaeef0;
      border-color: #8d9da866;
    }

    [data-scene-mode=light] .chronicle {
      filter: drop-shadow(0 1px 1px #fff);
    }

    [data-scene-mode=light] .chronicle-position strong {
      color: #745e35;
    }

    [data-scene-mode=light] .chronicle-position small {
      color: #746a55;
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

      .focus-window .window-footer {
        min-height: 45px;
        padding-top: 6px;
        padding-bottom: 6px;
      }

      .setting-line {
        min-height: 28px;
        font-size: 10px;
      }

      .preset-choice strong {
        font-size: 9px;
      }

      .cc-ui .preset-choice {
        padding: 5px 9px;
      }

      .preset-choice code {
        font-size: 8px;
        line-height: 1.4;
      }

      .dialogue-preview {
        min-height: 133px;
      }

      .cc-ui .sample-input {
        height: 78px;
      }
    }

    @media (max-width:1180px) {
      .cc-ui.focus-window {
        --inset: 16px;
      }

      .theme-picker {
        grid-template-columns: repeat(2,minmax(0,1fr));
      }
    }

    @media (max-width:1000px) {
      .settings-scrim {
        padding-left: 12px;
        padding-right: 12px;
      }

      .dialogue-preview {
        padding-inline: 10px;
      }

      .speaker-help {
        white-space: normal;
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

    .sample-tools #sample-match {
      max-width: 170px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cc-ui.preview-toast {
      pointer-events: none;
    }

    .chronicle.cc-live-chronicle {
      position: relative;
      top: auto;
      left: auto;
      bottom: auto;
      width: 100%;
      height: 100%;
    }

    .cc-live-chronicle .chronicle-position {
      padding-top: 10px;
    }

    @media (max-width:767px) {
      .cc-live-chronicle .chronicle-cap {
        width: 24px;
        height: 24px;
      }

      .cc-live-chronicle .chronicle-position strong {
        font-size: 16px;
      }

      .cc-live-chronicle .chronicle-position small {
        font-size: 10px;
      }
    }

    .settings-scrim[hidden],
    .cc-ui [hidden],
    [hidden] {
      display: none !important;
    }

    /* PC 설정창: 화면 설정과 대사 설정을 나란히 배치한다. */
    .settings-content {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 24px;
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 4px 22px 18px;
      scrollbar-width: thin;
    }

    .screen-panel,
    .theme-panel {
      min-width: 0;
    }

    .screen-panel .section,
    .theme-panel .section {
      padding: 12px 0;
    }

    .theme-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: "themes speakers" "preview preview" "patterns patterns";
      gap: 10px 20px;
      align-content: start;
    }

    .theme-section {
      grid-area: themes;
    }

    .sample-section {
      grid-area: preview;
    }

    .pattern-section {
      grid-area: patterns;
    }

    .speaker-section {
      grid-area: speakers;
    }

    .sample-heading {
      flex-wrap: wrap;
      gap: 8px;
    }

    .sample-tools {
      min-width: 0;
      flex-wrap: wrap;
    }

    @media (min-width: 768px) {
      .settings-tabs {
        display: none;
      }
    }

    /* 모바일 설정창: 대분류를 탭으로 나누고 대사 설정은 문서 순서대로 표시한다. */
    @media (max-width: 767px) {
      .settings-scrim {
        padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
      }

      .cc-ui.focus-window {
        width: 100%;
        height: 100%;
        max-height: 100dvh;
        min-width: 0;
        --inset: 14px;
      }

      .focus-window .window-header {
        min-height: 64px;
        padding: 12px 14px;
      }

      .focus-window h1 {
        font-size: 20px;
      }

      .local-label {
        display: none;
      }

      .focus-window .header-end .icon-button {
        width: 40px;
        height: 40px;
      }

      .settings-tabs {
        padding: 0 14px;
        flex-shrink: 0;
      }

      .settings-tabs [role="tab"] {
        flex: 1;
        min-height: 44px;
        padding: 10px 6px;
        font-size: 13px;
      }

      .settings-content {
        display: block;
        padding: 4px 14px 16px;
      }

      .theme-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .setting-line {
        min-height: 48px;
        font-size: 13px;
        gap: 10px;
      }

      .setting-line small {
        font-size: 11px;
      }

      .switch {
        width: 36px;
        height: 22px;
        border-radius: 12px;
      }

      .switch::after {
        width: 14px;
        height: 14px;
        top: 3px;
        left: 3px;
      }

      .theme-picker {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }

      .cc-ui .theme-choice {
        min-height: 44px;
        padding: 6px;
        font-size: 11px;
        white-space: normal;
      }

      .cc-ui .preset-choice {
        min-height: 54px;
        padding: 9px;
      }

      .preset-choice strong {
        font-size: 12px;
      }

      .preset-choice code {
        font-size: 10px;
        overflow-wrap: anywhere;
      }

      .sample-tools {
        gap: 8px;
      }

      .cc-ui .scene-mode button {
        min-height: 36px;
        font-size: 11px;
      }

      .cc-ui .text-input {
        font-size: 16px;
      }

      .cc-ui .sample-input {
        min-height: 110px;
      }

      .regex-guide dl {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 6px 8px;
      }

      .regex-guide code,
      .guide-example code {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }

      .speaker-form {
        gap: 6px;
      }

      .speaker-help {
        font-size: 11px;
      }

      .focus-window .window-footer {
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px 14px;
      }

      .window-footer .button {
        min-height: 42px;
        padding: 8px 10px;
        font-size: 12px;
      }

      .cc-ui.preview-toast {
        width: calc(100vw - 32px);
        bottom: max(16px, env(safe-area-inset-bottom));
        box-sizing: border-box;
      }
    }

    @media (max-width: 380px) {
      .theme-picker {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .preset-list {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `;
  const pageCSS = String.raw`
    /* 크랙 원본 DOM에 적용하는 몰입 표시 제어. 설정창·대사 스타일은 Shadow DOM 전용 CSS에 둔다. */
    [data-cc-focus-hidden],
    [data-cc-focus-source] {
      display: none !important;
    }

    /* 입력창은 화면 높이의 절반까지만 늘어난다. */
    [data-cc-focus-grow] {
      max-height: 50dvh !important;
      overflow-y: auto !important;
      min-height: 0 !important;
    }

    /* 슬라이더 이동 중 검색 조작 UI만 숨긴다. 명시적으로 검색을 열면 이 상태를 해제한다. */
    [data-cc-focus-navigation] div:has(> section[aria-label="메시지 검색"]),
    [data-cc-focus-navigation] [role="toolbar"][aria-label="검색 결과 이동"] {
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

  // 화자 이미지 Blob마다 재사용할 URL을 만든다.
  function imageUrl(blob) {
    if (!imageUrls.has(blob)) imageUrls.set(blob, page.URL.createObjectURL(blob));
    return imageUrls.get(blob);
  }

  // 더 이상 쓰지 않는 이미지 URL을 해제한다.
  function releaseUnusedImages() {
    const keep = new Set([...portraits.values(), ...(draftPortraits?.values() || [])]);
    for (const [blob, url] of imageUrls) if (!keep.has(blob)) {
      page.URL.revokeObjectURL(url);
      imageUrls.delete(blob);
    }
  }

  // 설정창을 한 번 만들고 편집 이벤트를 연결한다.
  function ensureUI() {
    if (ui) return;
    uiHost = make('div');
    uiHost.id = 'cc-immersion-host';
    uiHost.dataset.ccFocusOwned = '';
    uiHost.style.cssText = 'position:fixed;inset:0;z-index:2147483600;pointer-events:none;';
    ui = uiHost.attachShadow({ mode: 'open' });
    addStyle(ui, true);
    uiShell = make('div');
    uiShell.innerHTML = SETTINGS_HTML;
    ui.append(uiShell);
    doc.body.append(uiHost);
    ui.addEventListener('keydown', event => event.stopPropagation());
    ui.addEventListener('keyup', event => event.stopPropagation());
    ui.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
    for (const [id, key] of Object.entries({
      'hide-left': 'hideLeft',
      'hide-top': 'hideTop',
      'close-right': 'closeRight',
      'auto-grow': 'autoGrow',
      'show-slider': 'showSlider'
    })) {
      $(id).addEventListener('change', () => {
        if (draft) draft[key] = $(id).checked;
      });
    }
    [...presets, { name: '직접 작성', hint: '커스텀 정규식' }].forEach((preset, index) => {
      const button = make('button', 'preset-choice');
      button.dataset.preset = index === presets.length ? 'custom' : String(index);
      button.append(make('strong', '', preset.name), make('code', '', preset.hint));
      button.addEventListener('click', () => selectPattern(index === presets.length ? 'custom' : index));
      $('preset-list').append(button);
    });
    themes.forEach(([id, label, symbol]) => {
      const button = make('button', 'theme-choice');
      button.dataset.theme = id;
      button.append(make('span', 'theme-art ' + id, symbol), make('span', '', label));
      button.addEventListener('click', () => {
        draft.theme = id;
        renderThemeButtons();
        updatePreview();
      });
      $('theme-picker').append(button);
    });
    ui.querySelectorAll('button[data-scene-mode]').forEach(button => button.addEventListener('click', () => setPreviewMode(button.dataset.sceneMode)));
    $('regex-input').addEventListener('input', () => {
      draft.customRegex = $('regex-input').value;
      updatePreview();
    });
    $('sample-input').addEventListener('input', updatePreview);
    $('load-regex-example').addEventListener('click', () => {
      draft.customRegex = '^(?<name>.+?): (?<speech>.+)$';
      $('regex-input').value = draft.customRegex;
      $('sample-input').value = '에린: 안녕!';
      updatePreview();
    });
    $('speaker-form').addEventListener('submit', event => {
      event.preventDefault();
      const name = normalizeName($('speaker-name').value);
      if (!name) {
        toast('대사 원문에 나오는 화자 이름을 입력해주세요.');
        return;
      }
      chooseImage(name);
    });
    $('speaker-file').addEventListener('change', uploadPortrait);
    $('close-settings').addEventListener('click', closeSettings);
    $('cancel-settings').addEventListener('click', closeSettings);
    $('save-preview').addEventListener('click', saveSettings);
    $('toggle-immersion').addEventListener('click', toggleImmersion);
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

  // 모바일은 한 탭만 표시하고 PC는 두 대분류를 나란히 표시한다.
  function selectTab(tab) {
    activeTab = tab;
    const mobile = page.matchMedia('(max-width: 767px)').matches;
    ui.querySelectorAll('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $('screen-panel').hidden = mobile && tab !== 'screen';
    $('theme-panel').hidden = mobile && tab !== 'theme';
  }

  // 화면·대사 설정의 편집 사본을 만들고 미리보기를 준비한다.
  async function openSettings() {
    await storageReady;
    if (!doc.body) return;
    ensureUI();
    if (draft) {
      $('focus-window').focus();
      return;
    }
    draft = page.structuredClone(settings);
    draftPortraits = new Map(portraits);
    for (const [id, key] of Object.entries({
      'hide-left': 'hideLeft',
      'hide-top': 'hideTop',
      'close-right': 'closeRight',
      'auto-grow': 'autoGrow',
      'show-slider': 'showSlider'
    })) $(id).checked = draft[key];
    $('sample-input').value = presets[typeof draft.pattern === 'number' ? draft.pattern : 0].sample;
    $('regex-input').value = draft.customRegex;
    $('settings-scrim').hidden = false;
    setPreviewMode(sceneMode());
    selectTab(activeTab);
    renderPatternButtons();
    renderThemeButtons();
    renderSpeakers();
    updatePreview();
    updateToggleButton();
    $('close-settings').focus();
    if (storageError) toast('로컬 저장소를 열지 못했습니다. 저장을 사용할 수 없습니다.');
  }

  // 취소하면 설정 사본과 미리보기에만 쓰던 이미지 URL을 정리한다.
  function closeSettings() {
    if (saving) return;
    previewRevision += 1;
    $('settings-scrim').hidden = true;
    draft = null;
    draftPortraits = null;
    releaseUnusedImages();
    editor()?.focus();
  }

  // 대사 패턴을 검증한 뒤 저장된 설정을 실제 몰입 화면에도 반영한다.
  async function saveSettings() {
    if (!draft || saving) return;
    saving = true;
    $('save-preview').disabled = true;
    try {
      if (draft.pattern === 'custom') {
        const result = await findMatches($('sample-input').value, draft);
        if (result.error) throw new Error(result.error);
      }
      const next = normalizeSettings(draft);
      await persist(next, draftPortraits);
      settings = next;
      portraits = new Map(draftPortraits);
      highlightRevision += 1;
      restoreHighlights();
      updateImmersion();
      syncPage();
      toast('몰입모드 설정을 이 브라우저에 저장했습니다.');
    } catch (error) {
      showError(error);
    } finally {
      saving = false;
      $('save-preview').disabled = false;
      releaseUnusedImages();
    }
  }

  // 정규식 실행, 미리보기, 화자 이미지 관리.
  let regexWorker = null;
  let regexSequence = 0;
  const regexJobs = new Map();

  // 정규식의 이름 있는 그룹에서 대사 필드를 추출한다.
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

  // 사용자 정규식 워커와 대기 작업을 정리한다.
  function stopRegexWorker(message) {
    regexWorker?.terminate();
    regexWorker = null;
    for (const job of regexJobs.values()) {
      page.clearTimeout(job.timer);
      job.resolve({ matches: [], error: message });
    }
    regexJobs.clear();
  }

  // 기본 패턴은 직접, 사용자 패턴은 제한시간이 있는 워커에서 실행한다.
  async function findMatches(text, config) {
    if (text.length > 1000000) return { matches: [], error: '대사가 너무 길어 원문으로 표시합니다.' };
    const source = config.pattern === 'custom' ? config.customRegex : presets[config.pattern].regex;
    if (!source) return { matches: [] };
    if (config.pattern !== 'custom') {
      try {
        return { matches: scanText(text, source) };
      } catch {
        return { matches: [], error: '정규식의 괄호와 기호를 확인해주세요.' };
      }
    }
    // 사용자가 입력한 식은 별도 워커에서 실행해 페이지가 멈추지 않게 한다.
    if (!regexWorker) {
      try {
        const code = `
          const scanText = ${scanText.toString()};
          self.onmessage = ({ data }) => {
            try {
              self.postMessage({ id: data.id, matches: scanText(data.text, data.source) });
            } catch {
              self.postMessage({ id: data.id, matches: [], error: '정규식의 괄호와 기호를 확인해주세요.' });
            }
          };
        `;
        const url = page.URL.createObjectURL(new page.Blob([code], { type: 'text/javascript' }));
        try {
          regexWorker = new page.Worker(url);
        } finally {
          page.URL.revokeObjectURL(url);
        }
        regexWorker.onmessage = event => {
          const job = regexJobs.get(event.data.id);
          if (!job) return;
          page.clearTimeout(job.timer);
          regexJobs.delete(event.data.id);
          job.resolve(event.data);
        };
        regexWorker.onerror = () => stopRegexWorker('커스텀 정규식 실행을 시작하지 못했습니다.');
      } catch {
        return { matches: [], error: '이 브라우저에서는 커스텀 정규식 실행을 시작할 수 없습니다.' };
      }
    }
    return new Promise(resolve => {
      const id = ++regexSequence;
      const timer = page.setTimeout(() => stopRegexWorker('정규식 처리 시간이 길어 중단했습니다. 반복 기호를 줄여주세요.'), 500);
      regexJobs.set(id, { resolve, timer });
      regexWorker.postMessage({ id, text, source });
    });
  }

  // 크랙 화면의 밝기를 읽어 대사 테마 색상을 선택한다.
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

  // 미리보기의 밝기 모드를 변경한다.
  function setPreviewMode(mode) {
    uiShell.dataset.sceneMode = mode;
    ui.querySelectorAll('button[data-scene-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sceneMode === mode)));
    updatePreview();
  }

  // 선택한 대사 인식 패턴을 표시한다.
  function renderPatternButtons() {
    ui.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === String(draft.pattern))));
    $('custom-pattern').hidden = draft.pattern !== 'custom';
  }

  // 패턴을 바꾸고 예시와 미리보기를 갱신한다.
  function selectPattern(pattern) {
    draft.pattern = pattern;
    if (typeof pattern === 'number') $('sample-input').value = presets[pattern].sample;
    $('regex-input').value = draft.customRegex;
    renderPatternButtons();
    updatePreview();
  }

  // 현재 대사 테마를 선택 표시한다.
  function renderThemeButtons() {
    ui.querySelectorAll('.theme-choice').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === draft.theme)));
  }

  // 감지된 대사를 전용 Shadow DOM 테마로 그린다.
  function makeDialogue(fields, config, images, mode = sceneMode()) {
    const host = make('cc-focus-dialogue');
    host.dataset.ccFocusOwned = '';
    host.style.display = 'block';
    const shadow = host.attachShadow({ mode: 'open' });
    addStyle(shadow);
    const wrapper = make('div');
    wrapper.dataset.sceneMode = mode;
    const bubble = make('article', 'dialogue');
    bubble.dataset.theme = config.theme;
    if (config.theme === 'dark') {
      const frame = make('span', 'medieval-frame');
      frame.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 4; i += 1) frame.append(make('i'));
      bubble.append(frame);
    }
    const blob = images.get(normalizeName(fields.name)) || images.get(normalizeName(fields.translatedName));
    if (blob) {
      const image = make('img', 'speaker-portrait');
      image.src = imageUrl(blob);
      image.alt = '';
      bubble.append(image);
      bubble.classList.add('has-portrait');
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
    bubble.append(body);
    wrapper.append(bubble);
    shadow.append(wrapper);
    return host;
  }

  // 미리보기에 필요한 기본 인라인 마크다운을 그린다.
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
        if (link[1]) {
          node.src = link[3];
          node.alt = link[2];
          node.loading = 'lazy';
          node.style.maxWidth = '100%';
        } else {
          node.href = link[3];
          node.target = '_blank';
          node.rel = 'noopener noreferrer';
          node.textContent = link[2];
        }
        parent.append(node);
      }
      offset = match.index + token.length;
    }
    parent.append(doc.createTextNode(text.slice(offset)));
  }

  // 매칭되지 않은 텍스트를 원문에 가까운 형태로 표시한다.
  function appendMarkdown(parent, text) {
    if (!text.trim()) return;
    const parts = text.split(/(\x60\x60\x60[\s\S]*?\x60\x60\x60)/g);
    for (const part of parts) {
      if (!part.trim()) continue;
      if (part.startsWith('\x60\x60\x60')) {
        const pre = make('pre');
        pre.append(make('code', '', part.slice(3, -3).replace(/^[^\n]*\n/, '')));
        parent.append(pre);
        continue;
      }
      for (const paragraph of part.trim().split(/\n{2,}/)) {
        const p = make('p');
        p.style.cssText = 'white-space:pre-wrap;margin:8px 0;overflow-wrap:anywhere;';
        renderInline(paragraph, p);
        parent.append(p);
      }
    }
  }

  // 편집 중인 설정으로 대사 인식 결과를 미리 보여준다.
  async function updatePreview() {
    if (!draft || !ui || !$('sample-input')) return;
    const revision = ++previewRevision, config = page.structuredClone(draft);
    const raw = $('sample-input').value, result = await findMatches(raw, config);
    if (revision !== previewRevision || !draft) return;
    const output = $('dialogue-preview');
    output.replaceChildren();
    if (config.theme === 'none' || !result.matches.length || result.error) appendMarkdown(output, raw);
    else output.append(makeDialogue(result.matches[0].fields, config, draftPortraits, uiShell.dataset.sceneMode));
    $('sample-match').textContent = result.error ? '정규식 확인 필요' : config.theme === 'none' ? '원문 표시' : result.matches.length ? '패턴 인식됨' : '인식 안 됨 · 원문 표시';
    $('sample-match').title = result.error || '';
  }

  let uploadName = '';

  // 지정한 화자의 이미지 파일 선택창을 연다.
  function chooseImage(name) {
    uploadName = name;
    $('speaker-file').value = '';
    $('speaker-file').click();
  }

  // 화자별 이미지와 변경·삭제 버튼을 표시한다.
  function renderSpeakers() {
    $('speaker-list').replaceChildren();
    for (const [name, blob] of draftPortraits) {
      const row = make('div', 'speaker-row'), image = make('img', 'speaker-thumb');
      image.src = imageUrl(blob);
      image.alt = '';
      const edit = make('button', 'speaker-edit', name);
      edit.title = '이미지 바꾸기';
      edit.addEventListener('click', () => chooseImage(name));
      const remove = make('button', 'speaker-remove', '×');
      remove.setAttribute('aria-label', name + ' 이미지 삭제');
      remove.addEventListener('click', () => {
        draftPortraits.delete(name);
        renderSpeakers();
        updatePreview();
        releaseUnusedImages();
      });
      row.append(image, edit, remove);
      $('speaker-list').append(row);
    }
  }

  // 선택한 이미지를 정사각형으로 맞춰 편집 사본에 보관한다.
  async function uploadPortrait() {
    const file = $('speaker-file').files[0], name = uploadName, session = draft;
    if (!file || !session) return;
    if (!['image/png', 'image/webp', 'image/jpeg', 'image/gif'].includes(file.type)) {
      toast('PNG·WebP·JPEG·GIF 이미지를 선택해주세요.');
      return;
    }
    try {
      const image = await page.createImageBitmap(file);
      const canvas = make('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const size = Math.min(image.width, image.height);
      canvas.getContext('2d').drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 512, 512);
      image.close();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('이미지를 변환하지 못했습니다.');
      if (draft !== session) return;
      draftPortraits.set(name, blob);
      renderSpeakers();
      updatePreview();
      releaseUnusedImages();
    } catch {
      toast('이미지를 읽지 못했습니다. 다른 파일을 선택해주세요.');
    }
  }

  let highlightRevision = 0;
  const highlighted = new Map();

  // 인라인 서식을 유지하며 텍스트를 직렬화한다.
  function serializeInline(node) {
    if (own(node)) return '';
    if (node.nodeType === page.Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== page.Node.ELEMENT_NODE) return '';
    if (node.tagName === 'BR') return '\n';
    const text = [...node.childNodes].map(serializeInline).join('');
    if (['STRONG', 'B'].includes(node.tagName)) return '**' + text + '**';
    if (['EM', 'I'].includes(node.tagName)) return '*' + text + '*';
    if (node.tagName === 'CODE') return '\x60' + text + '\x60';
    return text;
  }

  // 텍스트가 아닌 요소를 경계로 대사를 읽을 구간을 모은다.
  function paragraphRuns(root) {
    const runs = [];
    let run = [];
    const flush = () => {
      if (run.length) runs.push(run);
      run = [];
    };
    // 텍스트가 아닌 요소는 경계로 두고, 연속된 텍스트와 인라인 서식만 대사 패턴에 전달한다.
    const textOnly = node => node.nodeType === page.Node.TEXT_NODE || node.nodeType === 1 &&
      (node.tagName === 'BR' || node.tagName !== 'PRE' && node.childNodes.length > 0 && [...node.childNodes].every(textOnly));
    function collect(container) {
      let nodes = [];
      const block = () => {
        const text = nodes.map(serializeInline).join('');
        if (text.trim()) run.push({ node: nodes[0], nodes, text });
        nodes = [];
      };
      for (const node of container.childNodes) {
        if (own(node)) continue;
        if (textOnly(node)) nodes.push(node);
        else {
          block();
          flush();
          if (node.nodeType === 1 && node.tagName !== 'PRE') collect(node);
          flush();
        }
      }
      block();
    }
    for (const node of root.children) {
      if (own(node)) continue;
      if (node.tagName !== 'P') {
        flush();
        continue;
      }
      if (textOnly(node)) run.push({ node, nodes: [node], text: serializeInline(node) });
      else {
        flush();
        collect(node);
        flush();
      }
    }
    flush();
    return runs;
  }

  // 테마 표시를 제거하고 원래 텍스트 노드를 복원한다.
  function clearHighlight(record) {
    record.overlays.forEach(node => node.remove());
    record.sources.forEach(node => node.removeAttribute('data-cc-focus-source'));
    record.textSources.forEach(node => node.replaceWith(...node.childNodes));
    record.overlays = [];
    record.sources = [];
    record.textSources = [];
  }

  // 크랙이 DOM을 갱신하기 전에 원문을 복원한다.
  function restoreHighlights() {
    for (const record of highlighted.values()) clearHighlight(record);
    highlighted.clear();
  }

  // 대사 패턴에 맞는 텍스트 구간을 테마로 표시한다.
  async function emphasizeRoot(root) {
    if (!immersive || settings.theme === 'none' || !root.isConnected) return;
    let runs = paragraphRuns(root);
    const signature = highlightRevision + ':' + runs.map(run => run.map(block => block.text).join('\n')).join('\uFFFF');
    const previous = highlighted.get(root);
    if (previous?.signature === signature) return;
    if (previous) {
      clearHighlight(previous);
      runs = paragraphRuns(root);
    }
    const record = { signature, overlays: [], sources: [], textSources: [] };
    highlighted.set(root, record);
    for (const run of runs) {
      let offset = 0;
      const chunks = run.map(block => {
        const chunk = { ...block, start: offset, end: offset + block.text.length };
        offset = chunk.end + 1;
        return chunk;
      });
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
        if (previousGroup && first <= previousGroup.last) {
          previousGroup.last = last;
          previousGroup.matches.push(match);
        } else groups.push({ first, last, matches: [match] });
      }
      for (const group of groups) {
        if (!chunks[group.first].node.isConnected) continue;
        const overlay = make('div');
        overlay.dataset.ccFocusOwned = '';
        let position = chunks[group.first].start;
        for (const match of group.matches) {
          appendMarkdown(overlay, text.slice(position, match.start));
          overlay.append(makeDialogue(match.fields, settings, portraits));
          position = match.end;
        }
        appendMarkdown(overlay, text.slice(position, chunks[group.last].end));
        chunks[group.first].node.before(overlay);
        for (let i = group.first; i <= group.last; i += 1) {
          for (const node of chunks[i].nodes) {
            let source = node;
            if (node.nodeType === page.Node.TEXT_NODE) {
              source = make('span');
              node.before(source);
              source.append(node);
              record.textSources.push(source);
            }
            source.dataset.ccFocusSource = '';
            record.sources.push(source);
          }
        }
        record.overlays.push(overlay);
      }
    }
  }

  // 기존 크랙 렌더러를 사용하는 턴 탐색과 몰입 레이아웃.
  function editor() {
    return doc.querySelector(EDITOR);
  }

  // 현재 크랙 기록 화면의 스크롤 영역을 찾는다.
  function nativeScroller() {
    return crackNavigation.scroller();
  }

  const crackNavigation = {
    sessionLabel: 'character-web/feature-chat-search/searchSession',
    sessionAtom: null,
    serial: 0,
    stopWaiting: null,
    showSearch() {
      doc.documentElement.removeAttribute('data-cc-focus-navigation');
    },
    scroller() {
      const roots = [...doc.querySelectorAll('.stick-to-bottom > div')];
      return doc.querySelector('button[aria-label="검색 닫기"]')
        ? roots.find(root => root.querySelector('[data-message-group-id^="search:"]')) || roots[0]
        : roots[0];
    },
    async session() {
      // 기존 검색 렌더러를 사용하되 슬라이더 이동 중에는 검색 조작 UI만 CSS로 숨긴다.
      doc.documentElement.dataset.ccFocusNavigation = '';
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
        const marker = [['cc-key-focus-' + Date.now()], {}, runtime => {
          require = runtime;
        }];
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
          observer.disconnect();
          page.clearTimeout(timer);
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
    groups() {
      return [...(this.scroller()?.querySelectorAll('[data-message-group-id]') || [])];
    },
    async jump(message) {
      const serial = ++this.serial;
      const { store, atom } = await this.session();
      if (serial !== this.serial || !immersive) return false;
      restoreHighlights();
      // 검색의 원래 앵커 경로만 전달한다. around 요청·본문·페이징·DOM은 전부 크랙이 처리한다.
      // 검색 결과의 기존 항목은 보존한다. 본문 텍스트는 복제하거나 검색어로 보내지 않는다.
      store.set(atom, { type: 'setSpeakerFilter', filter: 'all' });
      store.set(atom, {
        type: 'receiveSearchPage',
        page: {
          results: [{
            messageId: message.id,
            role: message.role,
            createdAt: message.createdAt,
            highlights: [],
            snippets: [{ text: '', matches: [], highlightIndex: 0 }]
          }],
          nextCursor: store.get(atom).cursors.search,
          ...store.get(atom).flags,
          totalScannedMessageCount: store.get(atom).totalScannedMessageCount,
        }
      });
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
      this.showSearch();
    },
  };

  const hiddenLayout = new Set();
  const grownEditors = new Map();
  let chronicleHost = null, chronicleUI = null;
  let scrollFrame = 0;
  let runtimeStyle;

  // 몰입 설정에 따라 기존 화면 요소의 표시만 전환한다.
  function hideLayout(node, hide) {
    if (!node) return;
    if (hide) {
      node.dataset.ccFocusHidden = '';
      hiddenLayout.add(node);
    } else if (hiddenLayout.has(node)) {
      node.removeAttribute('data-cc-focus-hidden');
      hiddenLayout.delete(node);
    }
  }

  // 몰입모드가 숨긴 화면 요소를 복원한다.
  function restoreLayout() {
    for (const node of hiddenLayout) node.removeAttribute('data-cc-focus-hidden');
    hiddenLayout.clear();
  }

  // 현재 설정을 크랙 레이아웃과 입력창에 반영한다.
  function updateImmersion(entering = false) {
    restoreLayout();
    const main = doc.querySelector('main'), input = editor();
    if (!immersive || !main || !input || !chatId) {
      chronicleHost?.remove();
      chronicleHost = null;
      chronicleUI = null;
      restoreHighlights();
      cancelSeek();
      for (const [node, height] of grownEditors) {
        node.removeAttribute('data-cc-focus-grow');
        node.style.height = height;
      }
      grownEditors.clear();
      return;
    }
    const column = main.parentElement, layout = column?.parentElement;
    const left = [...(layout?.children || [])].find(node => node !== column && node.querySelector?.('button[aria-label="사이드바 접기"],button[aria-label="사이드바 펼치기"]'));
    hideLayout(left, settings.hideLeft);
    hideLayout(main.previousElementSibling, settings.hideTop);
    if (entering && settings.closeRight) doc.querySelector('button[aria-label="사이드 패널 닫기"]')?.click();
    if (settings.autoGrow) {
      if (!grownEditors.has(input)) grownEditors.set(input, input.style.height);
      input.dataset.ccFocusGrow = '';
      resizeInput();
    } else {
      for (const [node, height] of grownEditors) {
        node.removeAttribute('data-cc-focus-grow');
        node.style.height = height;
      }
      grownEditors.clear();
    }
    if (settings.showSlider) {
      ensureChronicle();
      positionOverlays();
      startIndex().catch(showError);
    } else {
      chronicleHost?.remove();
      chronicleHost = null;
      chronicleUI = null;
    }
  }

  // 현재 채팅방의 몰입모드를 켜거나 끈다.
  function toggleImmersion() {
    if (!currentChatId() || !editor()) {
      toast('크랙 채팅방에서 사용할 수 있습니다.');
      return;
    }
    immersive = !immersive;
    updateImmersion(immersive);
    updateToggleButton();
    scheduleSync();
  }

  // 입력창 자동 높이와 오버레이 위치를 갱신한다.
  function resizeInput() {
    const input = editor();
    if (!input || !immersive || !settings.autoGrow) return;
    if (input.tagName === 'TEXTAREA') {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, page.innerHeight * .5) + 'px';
    }
    positionOverlays();
  }

  // 턴 슬라이더를 한 번 만들고 이동 이벤트를 연결한다.
  function ensureChronicle() {
    if (chronicleHost) return;
    chronicleHost = make('cc-focus-chronicle');
    chronicleHost.dataset.ccFocusOwned = '';
    chronicleHost.style.cssText = 'position:fixed;z-index:900;width:40px;pointer-events:auto;';
    chronicleUI = chronicleHost.attachShadow({ mode: 'open' });
    addStyle(chronicleUI);
    const wrap = make('aside', 'chronicle cc-live-chronicle');
    wrap.setAttribute('aria-label', '턴 탐색');
    wrap.innerHTML = String.raw`
<div class="chronicle-cap" aria-hidden="true">
  <svg viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="20"></circle>
    <path d="M32 0 37 27 64 32 37 37 32 64 27 37 0 32 27 27Z"></path>
    <path d="m14 14 18 12 18-12-12 18 12 18-18-12-18 12 12-18Z"></path>
    <circle cx="32" cy="32" r="3"></circle>
  </svg>
</div>
<div class="chronicle-scale">
  <div class="chronicle-spine">
    <div class="chronicle-fill"></div>
    <div class="chronicle-gem"></div>
    <input id="turn-range" type="range" min="0" max="0" value="0" step="1" aria-label="대화 턴 이동" disabled="">
  </div>
</div>
<div class="chronicle-position">
  <strong>…</strong>
  <i>/</i>
  <small>…</small>
</div>
`;
    chronicleUI.append(wrap);
    doc.body.append(chronicleHost);
    const slider = chronicleUI.getElementById('turn-range');
    slider.addEventListener('input', () => {
      seeking = true;
      pendingTurn = Number(slider.value);
      updateChronicle();
      page.clearTimeout(aroundTimer);
      aroundTimer = page.setTimeout(() => jumpToTurn(pendingTurn).catch(showError), 100);
    });
    slider.addEventListener('change', () => {
      page.clearTimeout(aroundTimer);
      jumpToTurn(Number(slider.value)).catch(showError);
    });
    updateChronicle();
  }

  // 화면 너비에 맞춰 슬라이더 위치와 길이를 계산한다.
  function positionOverlays() {
    if (!immersive) return;
    const main = doc.querySelector('main'), input = editor();
    if (!main || !input) return;
    const rect = main.getBoundingClientRect();
    if (chronicleHost) {
      const mobile = page.matchMedia('(max-width: 767px)').matches;
      chronicleHost.style.width = mobile ? '28px' : '40px';
      chronicleHost.style.left = Math.max(0, rect.left + (mobile ? 0 : 4)) + 'px';
      chronicleHost.style.top = rect.top + 76 + 'px';
      chronicleHost.style.height = Math.max(140, Math.min(rect.bottom, page.innerHeight) - rect.top - 76 - 110) + 'px';
    }
  }

  // 현재 턴과 전체 턴을 슬라이더에 반영한다.
  function updateChronicle(status = '') {
    if (!chronicleUI) return;
    const slider = chronicleUI.getElementById('turn-range');
    const maximum = Math.max(0, turns.length - 1), current = Math.min(maximum, pendingTurn ?? maximum);
    slider.disabled = !indexComplete || !turns.length;
    slider.max = String(maximum);
    slider.value = String(current);
    slider.title = status || (indexComplete ? '' : '기록 연결 중');
    chronicleUI.querySelector('.chronicle-position strong').textContent = indexComplete ? current : '…';
    chronicleUI.querySelector('.chronicle-position small').textContent = indexComplete ? maximum : '…';
    const percent = maximum ? current / maximum * 100 : 0;
    chronicleUI.querySelector('.chronicle-fill').style.height = percent + '%';
    chronicleUI.querySelector('.chronicle-gem').style.top = percent + '%';
    chronicleHost.dataset.sceneMode = sceneMode();
  }

  // 진행 중인 기록 이동을 취소한다.
  function cancelSeek() {
    crackNavigation.serial += 1;
    crackNavigation.stopWaiting?.();
    crackNavigation.showSearch();
    page.clearTimeout(aroundTimer);
    pendingTurn = null;
    seeking = false;
  }

  // 크랙의 기존 기록 화면을 사용해 선택한 턴으로 이동한다.
  async function jumpToTurn(turn) {
    if (!immersive || !indexComplete || !turns[turn]) return;
    const generation = routeGeneration;
    seeking = true;
    pendingTurn = turn;
    updateChronicle();
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
    } catch (error) {
      crackNavigation.showSearch();
      throw error;
    } finally {
      if (generation === routeGeneration && pendingTurn === turn) {
        seeking = false;
        updateChronicle();
      }
    }
  }

  // 모바일에서도 설정창의 버튼으로 몰입모드를 전환한다.
  function updateToggleButton() {
    if ($('toggle-immersion')) $('toggle-immersion').textContent = immersive ? '몰입모드 끄기' : '몰입모드 켜기';
  }

  // 다른 스크립트와는 토글 요청만 주고받고 키 배정 코드는 공유하지 않는다.
  doc.addEventListener('cc:immersion-toggle', toggleImmersion);
  doc.addEventListener('cc:message-search', () => crackNavigation.showSearch());

  // 외부에서 토글 키를 관리하지 않는 경우에만 고정된 기본 F9를 실행한다.
  doc.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || event.isComposing) return;
    if (draft) {
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
    const modal = event.composedPath().some(node => node.getAttribute?.('aria-modal') === 'true');
    const shortcutManaged = doc.documentElement.hasAttribute('data-cc-immersion-shortcut-managed');
    if (!shortcutManaged && event.code === 'F9' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !modal && currentChatId()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleImmersion();
    } else if (!event.composedPath().includes(uiHost)) restoreHighlights();
  }, true);
  doc.addEventListener('pointerdown', event => {
    if (event.target.closest?.('button[aria-label="메시지 검색"]')) crackNavigation.showSearch();
    if (!event.composedPath().includes(uiHost)) {
      restoreHighlights();
      scheduleSync();
    }
  }, true);
  doc.addEventListener('input', event => {
    if (event.target.matches?.(EDITOR) || event.target.closest?.(EDITOR)) resizeInput();
  }, true);
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
        if (bounds.bottom >= rect.top && bounds.top <= rect.bottom && delta < distance) {
          distance = delta;
          nearest = turn;
        }
      }
      if (nearest !== null) {
        pendingTurn = nearest;
        updateChronicle();
      }
    });
  }, true);
  page.addEventListener('resize', () => {
    if (ui) selectTab(activeTab);
    resizeInput();
    positionOverlays();
  });
  page.visualViewport?.addEventListener('resize', positionOverlays);
  if (page.navigation) page.navigation.addEventListener('navigatesuccess', scheduleSync);
  else page.addEventListener('popstate', scheduleSync);
  doc.addEventListener('click', event => {
    if (!event.composedPath().includes(uiHost)) restoreHighlights();
    scheduleSync();
  }, true);
  doc.addEventListener('keyup', scheduleSync, true);
  let syncFrame = 0;
  // 같은 프레임의 화면 갱신 요청을 하나로 합친다.
  function scheduleSync() {
    if (suspended) return;
    if (!syncFrame) syncFrame = page.requestAnimationFrame(() => {
      syncFrame = 0;
      syncPage();
    });
  }
  // 채팅방 변경과 몰입 화면의 현재 상태를 동기화한다.
  function syncPage() {
    const nextChat = currentChatId();
    if (nextChat !== chatId) {
      routeGeneration += 1;
      indexAbort?.abort();
      metadata = new Map();
      turns = [];
      ordinal = new Map();
      indexComplete = false;
      indexJob = null;
      latestMessageId = '';
      restoreHighlights();
      cancelSeek();
      chatId = nextChat;
      if (!chatId) immersive = false;
      updateImmersion(immersive);
      updateToggleButton();
    }
    if (!chatId) return;
    for (const [root, record] of highlighted) if (!root.isConnected) {
      clearHighlight(record);
      highlighted.delete(root);
    }
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
  // 문서와 저장소가 준비되면 화면을 초기화한다.
  async function boot() {
    await storageReady;
    runtimeStyle?.remove();
    runtimeStyle = make('style');
    runtimeStyle.id = 'cc-immersion-runtime-style';
    runtimeStyle.dataset.ccFocusOwned = '';
    runtimeStyle.textContent = pageCSS;
    (doc.head || doc.documentElement).append(runtimeStyle);
    ensureUI();
    syncPage();
  }
  page.CrackCommandline.register({ id: 'crack-immersion', label: '몰입모드', useDatabse: false, lambda: openSettings });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => boot().catch(showError), { once: true });
  else boot().catch(showError);
  page.addEventListener('pagehide', () => {
    suspended = true;
    page.cancelAnimationFrame(syncFrame);
    page.cancelAnimationFrame(scrollFrame);
    syncFrame = 0;
    scrollFrame = 0;
    cancelSeek();
    restoreHighlights();
    indexAbort?.abort();
    stopRegexWorker('페이지를 닫았습니다.');
  });
  page.addEventListener('pageshow', event => {
    if (event.persisted && suspended) {
      suspended = false;
      boot().catch(showError);
    }
  });
})();

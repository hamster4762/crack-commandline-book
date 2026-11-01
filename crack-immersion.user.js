// ==UserScript==
// @name         크랙 몰입모드
// @namespace    crack-commandline
// @icon         https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/images/crack-commandline.svg
// @version      1.0.1.0
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
// @connect      api.github.com
// @connect      github.com
// @connect      objects.githubusercontent.com
// @connect      release-assets.githubusercontent.com
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
  const MESSAGE_ROOT = '[data-message-group-id] .wrtn-markdown';
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

  const themes = [
    ['none', '미설정', '—'],
    ['game', '게임 말풍선', '···'],
    ['sf', 'SF 통신', '⌁'],
    ['glass', '글라스', '◌'],
    ['ashen', '고딕 금장', '◆'],
    ['neon', '네온 태그', '//'],
    ['menhera', '분홍 하트', '♡'],
    ['grave', '고딕 초상', '⚜'],
    ['telegram', '황동 액자', '✉'],
    ['aurora', '은빛 방패', '✦'],
    ['peach', '파스텔 구름', '☁']
  ];

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
      autoPronunciation: false,
      pronunciationLanguage: 'ja',
      pattern: 0,
      customTemplate: '',
      customRegex: presets[0].regex
    };
  }
  // 저장값 중 이 스크립트가 사용하는 유효한 설정만 받아들인다.
  function normalizeSettings(value) {
    const next = defaultSettings();
    if (!value || value.version !== 1) return next;
    for (const key of ['hideLeft', 'hideTop', 'closeRight', 'autoGrow', 'showSlider', 'autoPronunciation']) {
      if (typeof value[key] === 'boolean') next[key] = value[key];
    }
    if (themes.some(([id]) => id === value.theme)) next.theme = value.theme;
    if (value.pattern === 'custom' || Number.isInteger(value.pattern) && presets[value.pattern]) next.pattern = value.pattern;
    if (typeof value.customTemplate === 'string') next.customTemplate = value.customTemplate.slice(0, 4096);
    if (typeof value.customRegex === 'string') next.customRegex = value.customRegex.slice(0, 4096);
    return next;
  }

  // 고정 기호는 이스케이프하고 대사 항목만 이름 있는 정규식 그룹으로 바꾼다.
  function templateToRegex(template) {
    const fields = new Set();
    const source = template.replace(/\r\n?/g, '\n').split(/(\{[a-zA-Z]+\})/).map(part => {
      const token = /^\{([a-zA-Z]+)\}$/.exec(part);
      if (!token) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\n');
      const field = token[1];
      if (!['name', 'translatedName', 'speech', 'translation', 'pronunciation'].includes(field)) {
        throw new Error('지원하지 않는 항목입니다: {' + field + '}');
      }
      if (fields.has(field)) throw new Error('같은 항목은 한 번만 사용해주세요: {' + field + '}');
      fields.add(field);
      return '(?<' + field + '>[^\\n]+?)';
    }).join('');
    if (!fields.has('speech')) throw new Error('대사 형식에 {speech}를 넣어주세요.');
    if (source.length + 2 > 4096) throw new Error('대사 형식이 너무 깁니다. 내용을 줄여주세요.');
    return '^' + source + '$';
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
    }
    return nativeFetch(input, init).then(response => {
      if (messageRoute(url)) {
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
      this.addEventListener('load', () => {
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
    let previousRole = '';
    for (const message of chain) {
      // user → assistant만 한 턴으로 묶고, 단독 메시지는 각각 한 턴으로 센다.
      if (message.role !== 'assistant' || previousRole !== 'user') turn += 1;
      turns[turn] = { id: message.id };
      ordinal.set(message.id, turn);
      previousRole = message.role;
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
            <label class="field-label" for="template-input">대사 형식</label>
            <textarea id="template-input" class="text-input template-input" spellcheck="false" maxlength="4096" placeholder="&gt; {name} ―&#10;&gt; &quot;{speech}&quot;&#10;&gt; ({translation})"></textarea>
            <small class="template-help"><code>{name}</code> 이름 · <code>{translatedName}</code> 번역명 · <code>{speech}</code> 대사(필수) · <code>{translation}</code> 번역 · <code>{pronunciation}</code> 발음</small>
            <button class="button subtle" id="convert-template">정규식으로 변환</button>
            <label class="field-label" for="regex-input">인식할 정규식</label>
            <textarea id="regex-input" class="text-input regex-input" spellcheck="false" aria-label="대사 인식 정규식"></textarea>
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
        <section class="section pronunciation-section">
          <div class="section-heading">
            <div class="section-title">
              <span class="section-number">05</span>
              <h2>자동 발음</h2>
            </div>
          </div>
          <label class="setting-line"><span>발음 자동 생성<small>원문에 발음이 없을 때 대사에서 한글 발음 생성</small></span><input class="switch" id="auto-pronunciation" type="checkbox"></label>
          <label class="field-label" for="pronunciation-language">대사 언어</label>
          <select class="text-input" id="pronunciation-language" disabled><option value="ja">일본어 → 한글 발음</option></select>
          <small class="template-help">인명·고유명사의 읽기는 실제 발음과 다를 수 있습니다.</small>
          <small class="template-help" id="pronunciation-status" role="status">자동 발음 꺼짐 · 사전 미로드</small>
          <small class="template-help">사전 출처: <a href="https://github.com/hexenq/kuroshiro-analyzer-kuromoji" target="_blank" rel="noopener noreferrer">Kuromoji Analyzer (MIT)</a> · <a href="https://github.com/takuyaa/kuromoji.js" target="_blank" rel="noopener noreferrer">Kuromoji (Apache-2.0)</a> · <a href="https://github.com/Doublevil/JmdictFurigana" target="_blank" rel="noopener noreferrer">JMdictFurigana / Doublevil</a> · <a href="https://www.edrdg.org/jmdict/j_jmdict.html" target="_blank" rel="noopener noreferrer">JMdict / EDRDG (CC BY-SA)</a></small>
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

    /* 대사 인식 패턴과 대사 형식 변환기. */
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

    .cc-ui .regex-input,
    .cc-ui .template-input {
      display: block;
      min-height: 62px;
      height: 62px;
      resize: vertical;
      font: 10px/1.6 Consolas,monospace;
      overflow-wrap: anywhere;
    }

    .template-help {
      display: block;
      margin: 5px 0;
      font-size: 9px;
      line-height: 1.8;
      overflow-wrap: anywhere;
    }

    .template-help code {
      color: #dcc79c;
    }

    #convert-template {
      margin-bottom: 9px;
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

    .theme-art.game {
      background: #2c3540;
      color: #bfcfe1;
    }

    .theme-art.sf {
      background: repeating-linear-gradient(0deg,#11474d 0 1px,#092d35 1px 3px);
      color: #7ffff2;
    }

    .theme-art.glass {
      background: linear-gradient(135deg,#79adcd44,#d2a4c522);
      color: #c7e8fb;
    }

    .theme-art.ashen {
      background: #20211f;
      color: #bda26c;
    }

    .theme-art.neon {
      background: #222935;
      color: #b8e870;
    }

    .theme-art.menhera {
      background: #3c2439;
      color: #ff9cc7;
    }

    .theme-art.grave {
      background: #20211f;
      color: #c8af78;
    }

    .theme-art.telegram {
      background: #29251f;
      color: #c5a36f;
    }

    .theme-art.aurora {
      background: #354953;
      color: #dbe8b7;
    }

    .theme-art.peach {
      background: #dceaf0;
      color: #557d8f;
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

    .dialogue:is([data-theme=ashen],[data-theme=neon],[data-theme=menhera],[data-theme=grave],[data-theme=telegram],[data-theme=aurora],[data-theme=peach]) {
      box-sizing: border-box;
      font: 13px/1.55 'Malgun Gothic',sans-serif;
    }

    .dialogue:is([data-theme=ashen],[data-theme=neon],[data-theme=menhera],[data-theme=grave],[data-theme=telegram],[data-theme=aurora],[data-theme=peach]) .dialogue-name {
      flex-wrap: wrap;
      overflow-wrap: anywhere;
    }

    .dialogue:is([data-theme=ashen],[data-theme=neon],[data-theme=menhera],[data-theme=grave],[data-theme=telegram],[data-theme=aurora],[data-theme=peach]) .dialogue-speech {
      font: inherit;
    }

    .dialogue:is([data-theme=ashen],[data-theme=neon],[data-theme=menhera],[data-theme=grave],[data-theme=telegram],[data-theme=aurora],[data-theme=peach]) .dialogue-translation {
      font-size: 10px;
      overflow-wrap: anywhere;
    }

    .dialogue[data-theme=ashen] {
      --ink: #ddd9cd;
      --accent: #bda26c;
      --subtle: #787c78;
      --secondary: #a7a59c;
      padding: 7px 12px;
      background: radial-gradient(circle at 70% 0,#8870460c,transparent 45%),linear-gradient(90deg,#20211f,#161716);
      border: 1px solid #55544d;
      border-left: 3px solid #877650;
      box-shadow: inset 0 0 18px #0008,0 2px 7px #0004;
    }

    .dialogue[data-theme=ashen]::before {
      content: '';
      position: absolute;
      inset: 3px;
      pointer-events: none;
      border: 1px solid #8d7e5a22;
      clip-path: polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px);
    }

    .dialogue[data-theme=ashen] .speaker-portrait {
      width: 42px;
      height: 51px;
      align-self: flex-end;
      margin-bottom: -7px;
      filter: saturate(.45) contrast(1.08);
      border-left: 1px solid #8e7c54;
      border-right: 1px solid #34342f;
      mask-image: linear-gradient(#000 75%,transparent);
    }

    .dialogue[data-theme=ashen] .dialogue-name {
      letter-spacing: .08em;
    }

    .dialogue[data-theme=ashen] .dialogue-name::before {
      content: '◆';
      color: #756645;
      font-size: 6px;
    }

    .dialogue[data-theme=ashen] .dialogue-name small {
      color: #77766e;
    }

    .dialogue[data-theme=ashen] .dialogue-speech {
      font-family: Georgia,'Batang',serif;
    }

    .dialogue[data-theme=ashen] .dialogue-pronunciation {
      font-style: italic;
    }

    .dialogue[data-theme=neon] {
      --ink: #ebeff1;
      --accent: #b8e870;
      --subtle: #698fa5;
      --secondary: #b9bdc5;
      padding: 6px 10px;
      background: linear-gradient(105deg,#222935,#181d26 70%);
      border: 1px solid #454d5d;
      clip-path: polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px));
      box-shadow: inset 30px 0 30px #8a73d00c;
    }

    .dialogue[data-theme=neon]::before {
      content: '//';
      position: absolute;
      right: 10px;
      top: 3px;
      color: #d05ec9;
      opacity: .7;
      font: 900 10px Arial,sans-serif;
    }

    .dialogue[data-theme=neon] .speaker-portrait {
      width: 36px;
      height: 36px;
      align-self: flex-start;
      border-radius: 3px;
      border: 1px solid #667587;
      transform: rotate(-2deg);
      box-shadow: 3px 3px 0 #473b62;
    }

    .dialogue[data-theme=neon] .dialogue-name {
      width: fit-content;
      padding: 0 5px;
      color: #14171b;
      background: #b8e870;
      font: 800 11px/1.5 Arial,'Malgun Gothic',sans-serif;
      letter-spacing: .04em;
      transform: skew(-8deg);
    }

    .dialogue[data-theme=neon] .dialogue-name small {
      color: #473b62;
      font: 8px Consolas,monospace;
    }

    .dialogue[data-theme=neon] .dialogue-speech {
      font-weight: 500;
    }

    .dialogue[data-theme=neon] .dialogue-pronunciation {
      font-family: Consolas,monospace;
    }

    .dialogue[data-theme=neon] .dialogue-translation {
      width: fit-content;
      padding: 0 4px;
      background: #ffffff07;
    }

    .dialogue[data-theme=menhera] {
      --ink: #f5e9f2;
      --accent: #ff9cc7;
      --subtle: #9a82aa;
      --secondary: #c7b1c3;
      padding: 6px 10px;
      background: linear-gradient(110deg,#3c2439,#211d2c 65%);
      border: 1px solid #83566f;
      border-radius: 9px 2px 9px 2px;
      box-shadow: inset 0 0 16px #ff73b50d;
    }

    .dialogue[data-theme=menhera]::before {
      content: '♡×';
      position: absolute;
      right: 7px;
      top: 2px;
      color: #f783ba;
      font: 800 10px Arial,sans-serif;
      transform: rotate(5deg);
    }

    .dialogue[data-theme=menhera] .speaker-portrait {
      box-sizing: border-box;
      width: 35px;
      height: 35px;
      align-self: flex-start;
      border-radius: 50%;
      border: 2px solid #f18cb9;
      box-shadow: 0 0 0 2px #251c28,3px 1px 0 #705282;
    }

    .dialogue[data-theme=menhera] .dialogue-name {
      font: 700 10px/1.5 'Malgun Gothic',sans-serif;
    }

    .dialogue[data-theme=menhera] .dialogue-name::before {
      content: '♥';
      color: #d96a9f;
      font-size: 7px;
    }

    .dialogue[data-theme=menhera] .dialogue-name small {
      padding: 0 4px;
      color: #bb9fc0;
      background: #ffffff08;
      border-radius: 8px;
    }

    .dialogue[data-theme=menhera] .dialogue-speech {
      font-weight: 500;
    }

    .dialogue[data-theme=grave] {
      --ink: #dfdbd1;
      --accent: #c8af78;
      --subtle: #717570;
      --secondary: #a4a198;
      padding: 7px 11px;
      background: linear-gradient(90deg,#20211f,#171817);
      border: 0;
      border-top: 1px solid #5a574e;
      border-bottom: 1px solid #31312d;
      box-shadow: inset 0 0 20px #0008;
    }

    .dialogue[data-theme=grave] .speaker-portrait {
      box-sizing: border-box;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px double #786b4e;
      filter: grayscale(.35) saturate(.55);
    }

    .dialogue[data-theme=grave] .dialogue-name {
      font: 700 11px/1.5 Georgia,'Batang',serif;
      letter-spacing: .07em;
    }

    .dialogue[data-theme=grave] .dialogue-name small {
      color: #6f6d67;
    }

    .dialogue[data-theme=grave] .dialogue-speech {
      font-family: Georgia,'Batang',serif;
    }

    .dialogue[data-theme=grave] .dialogue-pronunciation {
      font: italic 9px/1.45 Georgia,'Batang',serif;
    }

    .dialogue[data-theme=telegram] {
      --ink: #ded5c6;
      --accent: #c5a36f;
      --subtle: #82796d;
      --secondary: #a9a091;
      padding: 7px 12px;
      background: linear-gradient(90deg,#29251f,#1f1d19);
      border: 0;
      border-left: 5px double #8f7146;
      border-top: 1px solid #5d4e38;
      border-bottom: 1px solid #463b2e;
    }

    .dialogue[data-theme=telegram] .speaker-portrait {
      box-sizing: border-box;
      order: 2;
      width: 34px;
      height: 40px;
      align-self: flex-start;
      padding: 2px;
      border: 2px solid #8b7048;
      filter: sepia(.4) saturate(.55);
    }

    .dialogue[data-theme=telegram] .dialogue-name {
      letter-spacing: .04em;
    }

    .dialogue[data-theme=telegram] .dialogue-name small {
      color: #776b5c;
    }

    .dialogue[data-theme=telegram] .dialogue-speech {
      font-family: Georgia,'Batang',serif;
    }

    .dialogue[data-theme=telegram] .dialogue-pronunciation {
      font: 8px/1.5 'Courier New',monospace;
    }

    .dialogue[data-theme=telegram] .dialogue-pronunciation::before {
      content: 'PHONOGRAPH / ';
      color: #595249;
    }

    .dialogue[data-theme=telegram] .dialogue-translation {
      padding-top: 2px;
      border-top: 1px dotted #51483b;
    }

    .dialogue[data-theme=aurora] {
      --ink: #edf1f2;
      --accent: #dbe8b7;
      --subtle: #78949e;
      --secondary: #aec0c4;
      padding: 5px 9px;
      overflow: hidden;
      background: linear-gradient(180deg,#354953,#263841);
      border: 1px solid #718b98;
      border-radius: 6px 13px 6px 13px;
      box-shadow: inset 0 1px #ffffff1c;
    }

    .dialogue[data-theme=aurora] .speaker-portrait {
      box-sizing: border-box;
      width: 34px;
      height: 39px;
      border: 1px solid #a0b7c1;
      border-radius: 4px 4px 12px 12px;
    }

    .dialogue[data-theme=aurora] .dialogue-name::before {
      content: '✦';
      color: #b4c68e;
      font-size: 7px;
    }

    .dialogue[data-theme=aurora] .dialogue-name small {
      color: #88a0aa;
    }

    .dialogue[data-theme=aurora] .dialogue-speech {
      font-family: Georgia,'Batang',serif;
    }

    .dialogue[data-theme=aurora] .dialogue-pronunciation {
      font-size: 8px;
    }

    .dialogue[data-theme=aurora] .dialogue-translation {
      margin: 3px -9px -5px;
      padding: 2px 8px;
      background: #16272d77;
      border-top: 1px solid #ffffff0d;
    }

    .dialogue[data-theme=peach] {
      --ink: #46515a;
      --accent: #557d8f;
      --subtle: #80949d;
      --secondary: #726e78;
      padding: 8px 12px;
      background: linear-gradient(115deg,#dceaf0,#f0e8ef);
      border: 1px solid #b8cad2;
      border-radius: 14px;
      box-shadow: inset 0 -3px #a8bec726;
    }

    .dialogue[data-theme=peach] .speaker-portrait {
      box-sizing: border-box;
      width: 34px;
      height: 34px;
      transform: rotate(-3deg);
      border: 2px solid white;
      border-radius: 11px;
      box-shadow: 0 2px 0 #a9bbc4;
    }

    .dialogue[data-theme=peach] .dialogue-name {
      font: 700 10px/1.5 'Malgun Gothic',sans-serif;
    }

    .dialogue[data-theme=peach] .dialogue-name::before {
      content: '☁';
      color: #8db8c7;
    }

    .dialogue[data-theme=peach] .dialogue-name small {
      color: #8b8290;
    }

    .dialogue[data-theme=peach] .dialogue-pronunciation {
      font-size: 8px;
    }

    .dialogue[data-theme=peach] .dialogue-translation {
      display: inline-block;
      padding: 1px 7px;
      background: #ffffff70;
      border: 1px solid #cad5da;
      border-radius: 9px;
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
      grid-template-areas: "themes speakers" "preview preview" "patterns patterns" "pronunciation pronunciation";
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

    .pronunciation-section {
      grid-area: pronunciation;
    }

    #pronunciation-language {
      width: 100%;
      color: #c5ceca;
      background: #101820;
    }

    #pronunciation-status {
      white-space: pre-line;
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
        padding: max(48px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(48px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
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
    $('template-input').addEventListener('input', () => {
      draft.customTemplate = $('template-input').value;
    });
    $('convert-template').addEventListener('click', () => {
      try {
        draft.customRegex = templateToRegex(draft.customTemplate);
        $('regex-input').value = draft.customRegex;
        updatePreview();
      } catch (error) {
        showError(error);
      }
    });
    $('regex-input').addEventListener('input', () => {
      draft.customRegex = $('regex-input').value;
      updatePreview();
    });
    $('sample-input').addEventListener('input', updatePreview);
    $('auto-pronunciation').addEventListener('change', () => {
      if (!draft) return;
      draft.autoPronunciation = $('auto-pronunciation').checked;
      if (draft.autoPronunciation && (pronunciationError || pronunciationStatus.jmdict.startsWith('보조 사전 로드 실패'))) stopPronunciationWorker();
      syncPronunciationWorker();
      updatePreview();
    });
    $('pronunciation-language').addEventListener('change', () => {
      if (!draft) return;
      draft.pronunciationLanguage = $('pronunciation-language').value;
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
    $('template-input').value = draft.customTemplate;
    $('regex-input').value = draft.customRegex;
    $('auto-pronunciation').checked = draft.autoPronunciation;
    $('pronunciation-language').value = draft.pronunciationLanguage;
    syncPronunciationWorker();
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
    syncPronunciationWorker();
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
      syncPronunciationWorker();
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

  // 사전 다운로드 이후의 압축 해제·색인·발음 변환은 모두 전용 워커에서 수행한다.
  function japanesePronunciationWorker() {
    const status = (dictionary, text) => self.postMessage({ type: 'status', dictionary, text });
    const hira = text => String(text).normalize('NFKC').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 96));
    const isHan = text => /\p{Script=Han}/u.test(text);
    const validReading = text => typeof text === 'string' && text.length > 0 && text !== '*' && !isHan(text);
    let analyzerReady, supplementalReady, remoteSequence = 0;
    const remoteJobs = new Map();

    function init() {
      if (!analyzerReady) analyzerReady = (async () => {
        status('kuromoji', '기본 사전 불러오는 중…');
        importScripts('https://cdn.jsdelivr.net/npm/kuroshiro-analyzer-kuromoji@1.1.0/dist/kuroshiro-analyzer-kuromoji.min.js');
        const exported = self.KuromojiAnalyzer;
        const Analyzer = typeof exported === 'function' ? exported : exported.default;
        const analyzer = new Analyzer({ dictPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/' });
        await analyzer.init();
        status('kuromoji', '기본 사전 준비됨');
        return analyzer;
      })();
      return analyzerReady;
    }

    function download(url) {
      return new Promise((resolve, reject) => {
        const requestId = ++remoteSequence;
        remoteJobs.set(requestId, { resolve, reject });
        self.postMessage({ type: 'download', requestId, url });
      });
    }

    function supplemental() {
      if (!supplementalReady) supplementalReady = (async () => {
        status('jmdict', '보조 사전 릴리스 확인 중…');
        const metadata = JSON.parse(new TextDecoder().decode(await download('https://api.github.com/repos/Doublevil/JmdictFurigana/releases/latest')));
        const asset = metadata.assets?.find(item => item.name === 'JmdictFurigana.json.gz')
          || metadata.assets?.find(item => item.name === 'JmdictFurigana.json');
        if (!asset) throw new Error('보조 사전 파일을 찾지 못했습니다.');
        status('jmdict', '보조 사전 다운로드 중…');
        const bytes = await download(asset.browser_download_url);
        status('jmdict', '보조 사전 압축 해제·색인 생성 중…');
        const stream = new Blob([bytes]).stream();
        const json = await new Response(asset.name.endsWith('.gz') ? stream.pipeThrough(new DecompressionStream('gzip')) : stream).json();
        const entries = new Map();
        for (const item of json) {
          if (typeof item.text !== 'string' || !isHan(item.text) || item.text.length > 20 || !validReading(item.reading)) continue;
          if (!entries.has(item.text)) entries.set(item.text, hira(item.reading));
        }
        status('jmdict', '보조 사전 준비됨');
        return entries;
      })().catch(error => {
        status('jmdict', '보조 사전 로드 실패: ' + error.message);
        return null;
      });
      return supplementalReady;
    }

    const kana = new Map([
      'あ:아 い:이 う:우 え:에 お:오 か:카 き:키 く:쿠 け:케 こ:코 さ:사 し:시 す:스 せ:세 そ:소 た:타 ち:치 つ:츠 て:테 と:토 な:나 に:니 ぬ:누 ね:네 の:노 は:하 ひ:히 ふ:후 へ:헤 ほ:호 ま:마 み:미 む:무 め:메 も:모 や:야 ゆ:유 よ:요 ら:라 り:리 る:루 れ:레 ろ:로 わ:와 を:오',
      'が:가 ぎ:기 ぐ:구 げ:게 ご:고 ざ:자 じ:지 ず:즈 ぜ:제 ぞ:조 だ:다 ぢ:지 づ:즈 で:데 ど:도 ば:바 び:비 ぶ:부 べ:베 ぼ:보 ぱ:파 ぴ:피 ぷ:푸 ぺ:페 ぽ:포',
      'きゃ:캬 きゅ:큐 きょ:쿄 しゃ:샤 しゅ:슈 しょ:쇼 ちゃ:차 ちゅ:추 ちょ:초 にゃ:냐 にゅ:뉴 にょ:뇨 ひゃ:햐 ひゅ:휴 ひょ:효 みゃ:먀 みゅ:뮤 みょ:묘 りゃ:랴 りゅ:류 りょ:료',
      'ぎゃ:갸 ぎゅ:규 ぎょ:교 じゃ:자 じゅ:주 じょ:조 びゃ:뱌 びゅ:뷰 びょ:뵤 ぴゃ:퍄 ぴゅ:퓨 ぴょ:표',
      'ふぁ:파 ふぃ:피 ふぇ:페 ふぉ:포 てぃ:티 でぃ:디 とぅ:투 どぅ:두 しぇ:셰 じぇ:제 ちぇ:체 うぃ:위 うぇ:웨 うぉ:워 ゔ:브 ゔぁ:바 ゔぃ:비 ゔぇ:베 ゔぉ:보 ぁ:아 ぃ:이 ぅ:우 ぇ:에 ぉ:오 ゃ:야 ゅ:유 ょ:요 ゎ:와'
    ].join(' ').split(/\s+/).map(pair => pair.split(':')));

    function toKorean(value) {
      const text = hira(value).replace(/([おこそとのほもよろをごぞどぼぽょ])う/g, '$1お');
      let output = '';
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i], code = output.charCodeAt(output.length - 1);
        if (ch === 'っ' || ch === 'ん') {
          if (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 0) {
            output = output.slice(0, -1) + String.fromCharCode(code + (ch === 'っ' ? 19 : 4));
          } else output += ch === 'ん' ? '응' : '읏';
        } else if (ch === 'ー') {
          if (code >= 0xac00 && code <= 0xd7a3) {
            output += ['아', '애', '아', '애', '어', '에', '어', '에', '오', '아', '애', '에', '오', '우', '어', '에', '이', '우', '으', '이', '이'][Math.floor((code - 0xac00) / 28) % 21];
          }
        } else {
          const pair = kana.get(text.slice(i, i + 2));
          output += pair || kana.get(ch) || ch;
          if (pair) i += 1;
        }
      }
      return output.replace(/[\u00a0\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ')
        .replace(/([,，、;；:：])(?=\S)/g, '$1 ')
        .replace(/((?:…)+|\.{3,})(?=\S)/g, '$1 ')
        .replace(/([!?。！？]|(?<!\.)\.(?!\.))(?=[^\s」』”’）)\]])/g, '$1 ').trim();
    }

    async function convert(text) {
      const analyzer = await init();
      const tokens = await analyzer.parse(text.normalize('NFKC'));
      const units = tokens.map(token => ({
        surface: token.surface_form,
        value: validReading(token.pronunciation) ? hira(token.pronunciation)
          : validReading(token.reading) ? hira(token.reading) : isHan(token.surface_form) ? null : hira(token.surface_form),
        pos: token.pos
      }));
      // 미등록 한자어는 주변 토큰까지 포함해 가장 긴 실제 표제어로 다시 찾는다.
      const lexicon = units.some(unit => unit.value === null) ? await supplemental() : null;
      if (lexicon) for (let i = 0; i < units.length; i += 1) {
        if (units[i].value !== null) continue;
        let best;
        for (let start = Math.max(0, i - 3); start <= i; start += 1) {
          let surface = '';
          for (let end = start; end < Math.min(units.length, i + 5); end += 1) {
            surface += units[end].surface;
            if (surface.length > 20) break;
            if (end < i || !lexicon.has(surface)) continue;
            if (!best || surface.length > best.surface.length) best = { start, end, surface, value: lexicon.get(surface), pos: '名詞' };
          }
        }
        if (best) {
          units.splice(best.start, best.end - best.start + 1, best);
          i = best.start - 1;
        }
      }
      let output = '', previous;
      for (const unit of units) {
        if (unit.value === null) unit.value = '〔미확인:' + unit.surface + '〕';
        if (unit.pos === '助詞') unit.value = ({ 'は': 'わ', 'へ': 'え', 'を': 'お' })[unit.surface] || unit.value;
        const punct = /^[、。，．！？!?…・「」『』（）()\s]+$/u.test(unit.surface);
        const opening = /^[「『（(]+$/u.test(unit.surface);
        const attach = !output || punct || opening || unit.pos === '助詞' || unit.pos === '助動詞'
          || unit.pos === '接尾' || previous?.opening || ['助詞', '助動詞', '接頭詞'].includes(previous?.pos);
        if (!attach && !/[\s、。！？!?…]$/u.test(output)) output += ' ';
        output += unit.value;
        previous = { pos: unit.pos, opening };
      }
      return toKorean(output);
    }

    self.onmessage = async ({ data }) => {
      if (data.type === 'download-result') {
        const job = remoteJobs.get(data.requestId);
        if (!job) return;
        remoteJobs.delete(data.requestId);
        if (data.error) job.reject(new Error(data.error));
        else job.resolve(data.bytes);
        return;
      }
      try {
        const text = await convert(data.text);
        self.postMessage({ id: data.id, text });
      } catch (error) {
        self.postMessage({ id: data.id, error: error.message });
      }
    };
  }

  let pronunciationWorker = null, pronunciationSequence = 0, pronunciationError = '';
  const pronunciationJobs = new Map(), pronunciationCache = new Map(), pronunciationDownloads = new Set();
  const pronunciationStatus = { kuromoji: '기본 사전 미로드', jmdict: '보조 사전 미로드 · 미등록 한자어가 있을 때 로드' };

  function renderPronunciationStatus() {
    if (!ui) return;
    const config = draft || settings;
    $('pronunciation-language').disabled = !config.autoPronunciation;
    $('pronunciation-status').textContent = config.autoPronunciation
      ? pronunciationError || Object.values(pronunciationStatus).join('\n')
      : '자동 발음 꺼짐' + (settings.autoPronunciation && draft ? ' · 저장 전까지 채팅에는 기존 설정 적용' : ' · 사전 미로드');
  }

  function stopPronunciationWorker(error = '') {
    pronunciationWorker?.terminate();
    pronunciationWorker = null;
    pronunciationError = error;
    for (const request of pronunciationDownloads) request.abort();
    pronunciationDownloads.clear();
    for (const job of pronunciationJobs.values()) {
      page.clearTimeout(job.timer);
      job.resolve('');
    }
    pronunciationJobs.clear();
    pronunciationCache.clear();
    pronunciationStatus.kuromoji = '기본 사전 미로드';
    pronunciationStatus.jmdict = '보조 사전 미로드 · 미등록 한자어가 있을 때 로드';
    renderPronunciationStatus();
  }

  function syncPronunciationWorker() {
    if (!settings.autoPronunciation && !draft?.autoPronunciation) stopPronunciationWorker();
    renderPronunciationStatus();
  }

  // GM은 CORS가 필요한 사전 다운로드만 중계하고 바이너리를 그대로 워커에 넘긴다.
  function downloadPronunciationDictionary(worker, data) {
    const reply = result => {
      if (pronunciationWorker !== worker) return;
      worker.postMessage({ type: 'download-result', requestId: data.requestId, ...result }, result.bytes ? [result.bytes] : []);
    };
    const release = 'https://api.github.com/repos/Doublevil/JmdictFurigana/releases/latest';
    let request;
    const finish = result => {
      pronunciationDownloads.delete(request);
      reply(result);
    };
    try {
      const url = new page.URL(data.url);
      if (data.url !== release && !(url.protocol === 'https:' && ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(url.hostname))) {
        throw new Error('허용되지 않은 사전 주소입니다.');
      }
      request = GM_xmlhttpRequest({
        method: 'GET', url: data.url, anonymous: true, responseType: 'arraybuffer', timeout: 60000,
        headers: data.url === release ? { Accept: 'application/vnd.github+json' } : {},
        onload: response => finish(response.status >= 200 && response.status < 300
          ? { bytes: response.response } : { error: '사전 다운로드 실패: HTTP ' + response.status }),
        onerror: () => finish({ error: '사전 다운로드에 실패했습니다. 연결 및 스크립트 권한을 확인해주세요.' }),
        ontimeout: () => finish({ error: '사전 다운로드 제한 시간을 초과했습니다.' }),
        onabort: () => finish({ error: '사전 다운로드가 취소되었습니다.' })
      });
      pronunciationDownloads.add(request);
    } catch (error) {
      finish({ error: error.message });
    }
  }

  function getPronunciation(text) {
    if (suspended || pronunciationError || !settings.autoPronunciation && !draft?.autoPronunciation) return Promise.resolve('');
    if (pronunciationCache.has(text)) return pronunciationCache.get(text);
    if (!pronunciationWorker) {
      try {
        const url = page.URL.createObjectURL(new page.Blob(['(' + japanesePronunciationWorker.toString() + ')();'], { type: 'text/javascript' }));
        try {
          pronunciationWorker = new page.Worker(url);
        } finally {
          page.URL.revokeObjectURL(url);
        }
        const worker = pronunciationWorker;
        worker.onmessage = ({ data }) => {
          if (worker !== pronunciationWorker) return;
          if (data.type === 'download') {
            downloadPronunciationDictionary(worker, data);
            return;
          }
          if (data.type === 'status') {
            pronunciationStatus[data.dictionary] = data.text;
            renderPronunciationStatus();
            return;
          }
          const job = pronunciationJobs.get(data.id);
          if (!job) return;
          if (data.error) {
            stopPronunciationWorker('발음 생성 실패: ' + data.error + ' 자동 발음을 껐다 켜면 다시 시도합니다.');
            return;
          }
          page.clearTimeout(job.timer);
          pronunciationJobs.delete(data.id);
          job.resolve(data.text);
        };
        worker.onerror = () => stopPronunciationWorker('일본어 사전 Worker를 실행하지 못했습니다. 자동 발음을 껐다 켜면 다시 시도합니다.');
        worker.onmessageerror = worker.onerror;
      } catch {
        stopPronunciationWorker('이 브라우저에서는 일본어 사전 Worker를 실행할 수 없습니다.');
        return Promise.resolve('');
      }
    }
    const promise = new Promise(resolve => {
      const id = ++pronunciationSequence;
      const timer = page.setTimeout(() => stopPronunciationWorker('사전 처리 제한 시간을 초과했습니다. 자동 발음을 껐다 켜면 다시 시도합니다.'), 180000);
      pronunciationJobs.set(id, { resolve, timer });
      try {
        pronunciationWorker.postMessage({ id, text });
      } catch {
        stopPronunciationWorker('발음 변환 요청을 전달하지 못했습니다. 자동 발음을 껐다 켜면 다시 시도합니다.');
      }
    });
    pronunciationCache.set(text, promise);
    if (pronunciationCache.size > 300) pronunciationCache.delete(pronunciationCache.keys().next().value);
    return promise;
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
    else if (config.autoPronunciation && config.pronunciationLanguage === 'ja' && /[\u3040-\u30ff\uff66-\uff9d\p{Script=Han}]/u.test(fields.speech)) {
      const pronunciation = make('p', 'dialogue-pronunciation', '발음 생성 중…');
      body.append(pronunciation);
      getPronunciation(fields.speech).then(value => {
        if (!host.isConnected || suspended) return;
        pronunciation.textContent = value || '발음을 생성하지 못했습니다.';
        pronunciation.title = value ? '' : pronunciationError || pronunciationStatus.jmdict;
      });
    }
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
  const changedMessages = new Set();
  let messageFrame = 0;
  let messageScroller = null;
  let observedBody = null;
  const messageObserver = new page.MutationObserver(observeMessages);

  // 변경된 본문만 모으고, 같은 프레임의 중복 변경은 한 번만 처리한다.
  function queueMessage(root) {
    if (!immersive || settings.theme === 'none') return;
    changedMessages.add(root);
    if (!messageFrame) messageFrame = page.requestAnimationFrame(() => {
      messageFrame = 0;
      const roots = [...changedMessages];
      changedMessages.clear();
      for (const root of roots) {
        if (root.isConnected && root.matches(MESSAGE_ROOT)) emphasizeRoot(root).catch(showError);
        else {
          const record = highlighted.get(root);
          if (record) clearHighlight(record);
          highlighted.delete(root);
        }
      }
    });
  }

  // 기존 목록 전체가 아니라 이번에 추가·제거된 하위 트리만 확인한다.
  function collectMessages(node) {
    if (node.nodeType !== 1 || own(node)) return false;
    let found = false;
    const collect = root => {
      if (!root.matches(MESSAGE_ROOT) && !highlighted.has(root)) return;
      queueMessage(root);
      found = true;
    };
    if (node.matches('.wrtn-markdown')) collect(node);
    node.querySelectorAll('.wrtn-markdown').forEach(collect);
    return found;
  }

  function observeMessages(records) {
    if (suspended) return;
    if (currentChatId() !== chatId) scheduleSync();
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!target || own(target)) continue;
      const root = target.closest(MESSAGE_ROOT);
      if (root) queueMessage(root);
      if (record.type !== 'childList') continue;
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (collectMessages(node)) scheduleSync();
        if (node.nodeType === 1 && !own(node) &&
          (node.matches('main,' + EDITOR) || node.querySelector(EDITOR))) scheduleSync();
      }
    }
  }

  // 대기 중인 변경은 회수하고, 테마 DOM을 조작하는 동안만 관찰을 멈춘다.
  function changeHighlights(change) {
    observeMessages(messageObserver.takeRecords());
    messageObserver.disconnect();
    try {
      change();
    } finally {
      if (observedBody && !suspended) messageObserver.observe(observedBody, { childList: true, subtree: true, characterData: true });
    }
  }

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
    changeHighlights(() => {
      record.overlays.forEach(node => node.remove());
      record.sources.forEach(node => node.removeAttribute('data-cc-focus-source'));
      record.textSources.forEach(node => node.replaceWith(...node.childNodes));
    });
    record.overlays = [];
    record.sources = [];
    record.textSources = [];
  }

  // 모드·설정·채팅방이 바뀔 때 테마 표시를 모두 복원한다.
  function restoreHighlights() {
    for (const record of highlighted.values()) clearHighlight(record);
    highlighted.clear();
    changedMessages.clear();
    messageScroller = null;
  }

  // 대사 패턴에 맞는 텍스트 구간을 테마로 표시한다.
  async function emphasizeRoot(root) {
    if (!immersive || settings.theme === 'none' || !root.isConnected) return;
    let runs = paragraphRuns(root);
    const signature = highlightRevision + ':' + runs.map(run => run.map(block => block.text).join('\n')).join('\uFFFF');
    const previous = highlighted.get(root);
    if (previous?.signature === signature &&
      previous.nodes.every(node => root.contains(node)) &&
      previous.sources.every(node => root.contains(node) && node.hasAttribute('data-cc-focus-source')) &&
      previous.overlays.every(node => root.contains(node))) return;
    if (previous) {
      clearHighlight(previous);
      runs = paragraphRuns(root);
    }
    const record = { signature, nodes: runs.flatMap(run => run.flatMap(block => block.nodes)), overlays: [], sources: [], textSources: [] };
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
      changeHighlights(() => {
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
      });
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
    stopScroll(scroll) {
      const root = scroll?.closest('.stick-to-bottom');
      let fiber = root?.[Object.keys(root).find(key => key.startsWith('__reactFiber$'))];
      for (let depth = 0; fiber && depth < 5; depth += 1, fiber = fiber.return) {
        const value = fiber.memoizedProps?.value;
        if (typeof value?.stopScroll === 'function' && typeof value.scrollToBottom === 'function') {
          value.stopScroll();
          return true;
        }
      }
      return false;
    },
    async jump(message) {
      const serial = ++this.serial;
      const { store, atom } = await this.session();
      if (serial !== this.serial || !immersive) return false;
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
    if (!immersive && (!currentChatId() || !editor())) {
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
    const navigating = doc.documentElement.hasAttribute('data-cc-focus-navigation');
    crackNavigation.serial += 1;
    crackNavigation.stopWaiting?.();
    if (navigating) doc.querySelector('button[aria-label="검색 닫기"]')?.click();
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
          // 하단 고정을 먼저 풀어야 대사 테마·이미지 높이가 바뀌어도 마지막 턴으로 되돌아가지 않는다.
          if (crackNavigation.stopScroll(scroll)) {
            scroll.scrollTop += existing.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
          } else if (!await crackNavigation.jump(turns[turn])) return;
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
    }
  }, true);
  doc.addEventListener('pointerdown', event => {
    if (event.target.closest?.('button[aria-label="메시지 검색"]')) crackNavigation.showSearch();
  }, true);
  doc.addEventListener('input', event => {
    if (event.target.matches?.(EDITOR) || event.target.closest?.(EDITOR)) resizeInput();
  }, true);
  doc.addEventListener('scroll', event => {
    if (!immersive || event.target !== nativeScroller() || scrollFrame) return;
    scrollFrame = page.requestAnimationFrame(() => {
      scrollFrame = 0;
      if (seeking || !indexComplete) return;
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
    if (immersive) {
      updateImmersion();
      refreshLatest();
      const scroll = nativeScroller();
      if (scroll !== messageScroller) {
        messageScroller = scroll;
        scroll?.querySelectorAll(MESSAGE_ROOT).forEach(queueMessage);
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
    observedBody = doc.body;
    messageObserver.observe(observedBody, { childList: true, subtree: true, characterData: true });
    syncPage();
  }
  page.CrackCommandline.register({ id: 'crack-immersion', label: '몰입모드', useDatabse: false, lambda: openSettings });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => boot().catch(showError), { once: true });
  else boot().catch(showError);
  page.addEventListener('pagehide', () => {
    suspended = true;
    messageObserver.disconnect();
    observedBody = null;
    page.cancelAnimationFrame(syncFrame);
    page.cancelAnimationFrame(scrollFrame);
    page.cancelAnimationFrame(messageFrame);
    messageFrame = 0;
    syncFrame = 0;
    scrollFrame = 0;
    cancelSeek();
    restoreHighlights();
    indexAbort?.abort();
    stopRegexWorker('페이지를 닫았습니다.');
    stopPronunciationWorker();
  });
  page.addEventListener('pageshow', event => {
    if (event.persisted && suspended) {
      suspended = false;
      boot().catch(showError);
    }
  });
})();

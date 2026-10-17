/* Crack Commandline Core 1.0.0 · Tampermonkey @require 라이브러리 */
(() => {
  'use strict';

  const page = typeof unsafeWindow === 'object' ? unsafeWindow : window;
  if (page.CrackCommandline) return;

  // 공개 API: CrackCommandline 객체와 register()가 반환하는 저장 핸들만 외부에서 사용한다.
  /** @typedef {(null|boolean|number|string|Array<JsonValue>|Object<string, JsonValue>)} JsonValue */

  /**
   * @typedef {Object} ContentStorage
   * @property {(path?: string) => Promise<JsonValue>} load 선택한 저장소에서 JSON 값 또는 null을 읽는다.
   * @property {(path?: string) => Promise<string[]>} keys 지정 경로 바로 아래의 키 이름만 읽는다. 저장용 ETag는 만들지 않는다.
   * @property {(data: JsonValue, path?: string) => Promise<JsonValue>} save 지정 경로를 JSON 값으로 교체한다. 경로 생략 시 콘텐츠 전체를 교체한다.
   */

  /**
   * 페이지 공유 API. 내부 함수와 상태는 이 객체에 포함하지 않는다.
   * @namespace CrackCommandline
   * @example
   * const core = unsafeWindow.CrackCommandline;
   * const book = core.register({ id: 'my-book', label: '도감', useDatabse: true, lambda: openBook });
   * const data = await book.load();
   */
  const api = Object.freeze({
    /**
     * 명령어와 실행 함수를 등록하고 해당 콘텐츠 전용 저장 핸들을 반환한다.
     * @param {object} definition 명령어 등록 정보.
     * @param {string} definition.id 저장 경로/키. 문자·숫자·밑줄·하이픈 1~128자.
     * @param {string} definition.label ! 뒤의 명령어. 공백·느낌표 없이 1~40자. 설정은 예약어.
     * @param {boolean} definition.useDatabse 저장 기능 사용 여부.
     * @param {Function} definition.lambda 인자 없이 호출할 함수. Promise도 반환할 수 있다.
     * @returns {ContentStorage} 등록한 id에 한정된 저장 핸들. 저장 메서드는 모두 Promise를 반환한다.
     * @throws {CoreError} INVALID_ID/LABEL/REGISTRATION: 형식 오류. DUPLICATE_ID/LABEL: 중복 등록.
     */
    register(definition) {
      const id = registerContent(definition);
      return Object.freeze({
        /**
         * 지정 경로 바로 아래의 키 이름을 조회한다. Firebase 목록은 페이지 메모리에 캐시하며 하위 값은 다운로드하지 않는다.
         * @param {string} [path=""] 콘텐츠 내부의 상대 경로. 생략하면 콘텐츠 바로 아래.
         * @returns {Promise<string[]>} 키 목록. 데이터가 없거나 원시 값이면 빈 배열. 순서는 보장하지 않는다.
         * @throws {CoreError} DATABASE_DISABLED/INVALID_PATH/LOGIN_REQUIRED 또는 조회 오류.
         * 이 호출은 저장 기준을 만들지 않는다. save() 전에는 같은 경로의 load()가 필요하다.
         */
        keys(path = '') { return exclusive(id, () => listContentKeys(id, path)); },
        /**
         * 선택한 저장소에서 데이터를 읽는다. Firebase는 페이지에서 해당 경로를 처음 읽을 때 서버에 요청하고 이후 캐시를 사용한다.
         * @param {string} [path=""] 콘텐츠 내부의 상대 경로. 생략하면 전체.
         * @returns {Promise<JsonValue>} 저장된 데이터. 데이터가 없으면 null.
         * 부모·자식 경로 중 하나를 저장하면 다른 쪽의 캐시는 무효화되며, 다음 load()에서 다시 조회한다.
         * @throws {CoreError} DATABASE_DISABLED: 저장 미사용. INVALID_PATH: 잘못된 경로. LOGIN_REQUIRED: Firebase 로그인 필요.
         */
        load(path = '') { return exclusive(id, () => loadContent(id, path)); },
        /**
         * 지정 경로의 데이터를 교체한다. Firebase는 같은 경로의 load()를 먼저 호출해야 한다.
         * @param {JsonValue} data 저장할 JSON 값. null은 지정 경로 삭제.
         * 객체 구조나 문자열 내용은 해석하지 않는다. Local 배열 내부 경로는 기존 인덱스 또는 바로 다음 인덱스만 쓸 수 있다.
         * @param {string} [path=""] 콘텐츠 내부의 상대 경로. 예: element, presets/preset1. 생략하면 전체.
         * @returns {Promise<JsonValue>} 저장한 값.
         * @throws {CoreError} INVALID_DATA: 저장 불가 값. INVALID_PATH: 잘못된 경로. LOAD_REQUIRED: 같은 경로를 먼저 읽어야 함.
         * INVALID_ARRAY_INDEX: 배열에 숫자가 아닌 키를 쓰거나 빈 슬롯을 만드는 경로.
         * CONFLICT: 원격 변경으로 저장 거절. error.latestData 확인 후 load()로 다시 읽는다.
         * ETAG_MISSING: 직전 응답에 식별자가 없어 페이지 새로고침 필요. 그 밖의 저장 실패도 reject된다.
         */
        save(data, path = '') { return exclusive(id, () => saveContent(id, data, path)); },
      });
    },

  });

  // 내부 구현: 아래 선언은 IIFE의 지역 스코프에만 존재하며 외부에서 접근할 수 없다.

  const CONFIG_KEY = 'crack-commandline:firebase-config';
  const SESSION_KEY = 'crack-commandline:firebase-session';
  const DB_NAME = 'crack-commandline';
  const commands = new Map();
  const queues = new Map();
  const remoteCache = new Map();
  const remoteKeyCache = new Map();
  let cacheGeneration = 0;
  // 한글 완성형의 초성 순서. 'ㅅ', '설', '설ㅈ'처럼 초성·음절을 섞은 검색에 사용한다.
  const HANGUL_INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const CHAT_SELECTOR = '.__chat_input_textarea[contenteditable="true"],textarea.__chat_input_textarea';
  let databasePromise;
  let config;
  let session;
  let connectionRevision = 0;
  let tokenRefresh;
  let settingsDialog;
  let suggestionBox;
  let activeEditor;
  let activeToken;
  let candidates = [];
  let selectedCandidate = -1;
  let composing = false;
  let suggestionFrame;
  let toastTimer;
  let toastElement;
  let dialogSequence = 0;

  class CoreError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = 'CrackCommandlineError';
      this.code = code;
      Object.assign(this, details);
    }
  }

  config = readStoredConfig();
  session = readStoredSession();

  function readSetting(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }

  function readStoredConfig() {
    try { return normalizeConfig(readSetting(CONFIG_KEY)); }
    catch { return null; }
  }

  function readStoredSession() {
    const value = readSetting(SESSION_KEY);
    if (!config || !value || value.databaseURL !== config.databaseURL ||
        !['uid', 'email', 'idToken', 'refreshToken'].every(key => typeof value[key] === 'string') ||
        !value.uid || !value.idToken || !value.refreshToken || !Number.isFinite(value.expiresAt)) return null;
    return value;
  }

  function writeSetting(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      throw new CoreError('STORAGE_UNAVAILABLE', '브라우저 설정 저장 공간을 사용할 수 없습니다.');
    }
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        for (const name of ['data', 'providers']) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        }
        if (request.result.objectStoreNames.contains('cache')) request.result.deleteObjectStore('cache');
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); databasePromise = null; };
        resolve(database);
      };
      request.onerror = () => { databasePromise = null; reject(request.error); };
      request.onblocked = () => {
        databasePromise = null;
        reject(new CoreError('DB_BLOCKED', '다른 탭에서 사용 중인 저장소를 닫고 다시 시도하세요.'));
      };
    });
    return databasePromise;
  }

  async function readStore(storeName, key) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || request.error);
      transaction.onerror = () => {};
    });
  }

  async function writeStore(storeName, key, value) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      if (value === undefined) store.delete(key);
      else store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {};
    });
  }

  async function listStoredIds() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(['data', 'providers'], 'readonly');
      const ids = new Set();
      for (const name of ['data', 'providers']) {
        const request = transaction.objectStore(name).getAllKeys();
        request.onsuccess = () => request.result.forEach(id => ids.add(id));
      }
      transaction.oncomplete = () => resolve([...ids]);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {};
    });
  }

  function cloneData(value) {
    const seen = new Set();
    function validate(item) {
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
      if (typeof item === 'number' && Number.isFinite(item)) return;
      if (typeof item !== 'object' || seen.has(item)) {
        throw new CoreError('INVALID_DATA', '순환 참조 없이 JSON으로 표현할 수 있는 데이터를 사용하세요.');
      }
      const type = Object.prototype.toString.call(item);
      if (type !== '[object Object]' && type !== '[object Array]') {
        throw new CoreError('INVALID_DATA', 'Date, Map 등은 JSON 값으로 변환한 뒤 저장하세요.');
      }
      seen.add(item);
      for (const key of Object.keys(item)) {
        // eslint-disable-next-line no-control-regex -- Firebase 키의 ASCII 제어 문자를 거부한다.
        if (!Array.isArray(item) && /[.#$[\]/\u0000-\u001f\u007f]/u.test(key)) {
          throw new CoreError('INVALID_DATA', '데이터 키에는 . # $ [ ] / 또는 제어 문자를 사용할 수 없습니다.');
        }
        validate(item[key]);
      }
      if (Array.isArray(item) && Object.keys(item).length !== item.length) {
        throw new CoreError('INVALID_DATA', '빈 슬롯이 있는 배열은 저장할 수 없습니다.');
      }
      seen.delete(item);
    }
    validate(value);
    return JSON.parse(JSON.stringify(value));
  }

  function requireContent(id, needsDatabase = true) {
    const command = commands.get(id);
    if (!command) throw new CoreError('NOT_REGISTERED', '먼저 콘텐츠를 등록하세요.');
    if (needsDatabase && !command.useDatabse) {
      throw new CoreError('DATABASE_DISABLED', '이 콘텐츠는 저장 기능을 사용하지 않습니다.');
    }
    return command;
  }

  function exclusive(id, operation) {
    const previous = queues.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    queues.set(id, next);
    next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
    return next;
  }

  function normalizeConfig(value) {
    const input = typeof value === 'string' ? JSON.parse(value) : value;
    if (!input || typeof input.apiKey !== 'string' || !input.apiKey.trim()) {
      throw new CoreError('INVALID_CONFIG', 'Firebase apiKey를 확인하세요.');
    }
    let url;
    try { url = new URL(input.databaseURL); }
    catch { throw new CoreError('INVALID_CONFIG', 'Firebase databaseURL을 확인하세요.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        (url.pathname !== '/' && url.pathname !== '') ||
        !/^[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)$/i.test(url.hostname)) {
      throw new CoreError('INVALID_CONFIG', 'databaseURL에는 Firebase Realtime Database의 HTTPS 루트 주소를 입력하세요.');
    }
    return { apiKey: input.apiKey.trim(), databaseURL: url.origin,
      ...(typeof input.projectId === 'string' ? { projectId: input.projectId } : {}),
      ...(typeof input.authDomain === 'string' ? { authDomain: input.authDomain } : {}),
      ...(typeof input.appId === 'string' ? { appId: input.appId } : {}) };
  }

  function responseEtag(headers) {
    return /^etag:\s*(.+?)\s*$/im.exec(headers || '')?.[1] || null;
  }

  function requestJson(method, url, data, headers = {}) {
    if (typeof GM_xmlhttpRequest !== 'function') {
      return Promise.reject(new CoreError('MISSING_GRANT', 'Firebase 기능에는 GM_xmlhttpRequest 권한이 필요합니다.'));
    }
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url, headers, timeout: 20000, anonymous: true,
        ...(data !== undefined ? { data: headers['Content-Type'] === 'application/x-www-form-urlencoded'
          ? data : JSON.stringify(data) } : {}),
        onload(response) {
          let body = null;
          try { if (response.responseText) body = JSON.parse(response.responseText); }
          catch { reject(new CoreError('INVALID_RESPONSE', 'Firebase에서 올바르지 않은 응답을 받았습니다.')); return; }
          resolve({ status: response.status, data: body, etag: responseEtag(response.responseHeaders) });
        },
        onerror: () => reject(new CoreError('NETWORK_ERROR', 'Firebase 요청에 실패했습니다. 연결 상태와 @connect 설정을 확인하세요.')),
        ontimeout: () => reject(new CoreError('NETWORK_TIMEOUT', 'Firebase 응답 시간이 초과되었습니다.')),
        onabort: () => reject(new CoreError('NETWORK_ABORTED', 'Firebase 요청이 취소되었습니다.')),
      });
    });
  }

  function checkResponse(response) {
    if (response.status >= 200 && response.status < 300) return;
    const reason = response.data?.error?.message;
    const messages = {
      INVALID_LOGIN_CREDENTIALS: '이메일 또는 비밀번호를 확인하세요.',
      EMAIL_NOT_FOUND: '등록된 사용자를 찾을 수 없습니다.',
      INVALID_PASSWORD: '이메일 또는 비밀번호를 확인하세요.',
      USER_DISABLED: '사용 중지된 Firebase 사용자입니다.',
      TOO_MANY_ATTEMPTS_TRY_LATER: '로그인 시도가 많습니다. 잠시 후 다시 시도하세요.',
    };
    throw new CoreError(response.status === 401 || response.status === 403 ? 'PERMISSION_DENIED' : 'FIREBASE_ERROR',
      messages[reason] || (response.status === 401 || response.status === 403
        ? 'Firebase 로그인 또는 보안규칙을 확인하세요.' : 'Firebase 요청을 완료하지 못했습니다.'),
      { status: response.status });
  }

  async function connectFirebase(configuration, email, password) {
    const nextConfig = normalizeConfig(configuration);
    const revision = connectionRevision;
    const response = await requestJson('POST',
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(nextConfig.apiKey)}`,
      { email, password, returnSecureToken: true }, { 'Content-Type': 'application/json' });
    checkResponse(response);
    if (revision !== connectionRevision) throw new CoreError('CONNECTION_CHANGED', '연결 설정이 변경되었습니다. 다시 로그인하세요.');
    const account = response.data;
    if (!account.idToken || !account.refreshToken || !account.localId) {
      throw new CoreError('INVALID_RESPONSE', 'Firebase 로그인 응답을 확인할 수 없습니다.');
    }
    const nextSession = { uid: account.localId, email: account.email || email,
      idToken: account.idToken, refreshToken: account.refreshToken,
      expiresAt: Date.now() + Number(account.expiresIn) * 1000,
      databaseURL: nextConfig.databaseURL };
    writeSetting(CONFIG_KEY, nextConfig);
    writeSetting(SESSION_KEY, nextSession);
    config = nextConfig;
    session = nextSession;
    connectionRevision += 1;
    remoteCache.clear();

    remoteKeyCache.clear();
  }

  function signOut() {
    writeSetting(SESSION_KEY, null);
    session = null;
    connectionRevision += 1;
    remoteCache.clear();

    remoteKeyCache.clear();
  }

  async function getAccessToken() {
    if (!config || !session || session.databaseURL !== config.databaseURL) {
      throw new CoreError('LOGIN_REQUIRED', '!설정에서 Firebase에 로그인하세요.');
    }
    if (session.expiresAt > Date.now() + 60000) return session.idToken;
    if (!tokenRefresh) {
      const current = session;
      tokenRefresh = (async () => {
        const response = await requestJson('POST',
          `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`,
          new URLSearchParams({ grant_type: 'refresh_token', refresh_token: current.refreshToken }).toString(),
          { 'Content-Type': 'application/x-www-form-urlencoded' });
        checkResponse(response);
        if (session !== current) throw new CoreError('CONNECTION_CHANGED', '로그인 상태가 변경되었습니다.');
        const account = response.data;
        if (!account.id_token || !account.refresh_token) throw new CoreError('INVALID_RESPONSE', '로그인 갱신에 실패했습니다. 다시 로그인하세요.');
        const renewed = { ...current, idToken: account.id_token, refreshToken: account.refresh_token,
          expiresAt: Date.now() + Number(account.expires_in) * 1000 };
        writeSetting(SESSION_KEY, renewed);
        session = renewed;
        return renewed.idToken;
      })().finally(() => { tokenRefresh = null; });
    }
    return tokenRefresh;
  }

  function pathSegments(path) {
    if (path === '') return [];
    // eslint-disable-next-line no-control-regex -- Firebase 경로의 금지 문자와 빈 구간을 거부한다.
    if (typeof path !== 'string' || path.split('/').some(part => !part || /[.#$[\]\u0000-\u001f\u007f]/u.test(part))) {
      throw new CoreError('INVALID_PATH', '상대 경로에는 비어 있지 않은 Firebase 키를 /로 구분해 사용하세요.');
    }
    return path.split('/');
  }

  function valueAtPath(data, parts) {
    for (const part of parts) {
      if (data === null || typeof data !== 'object' || !Object.hasOwn(data, part)) return null;
      data = data[part];
    }
    return data;
  }

  function replaceAtPath(data, parts, value, index = 0) {
    if (index === parts.length) return value;
    const key = parts[index];
    // 존재하지 않는 하위 경로 삭제는 부모의 값이나 빈 컨테이너를 바꾸지 않는다.
    if (value === null && (data === null || typeof data !== 'object' || !Object.hasOwn(data, key))) return data;
    const keepArray = Array.isArray(data);
    if (keepArray && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) > data.length || Number(key) >= 4294967295)) {
      throw new CoreError('INVALID_ARRAY_INDEX', '배열 경로에는 기존 인덱스 또는 바로 다음 인덱스를 사용하세요.');
    }
    const node = keepArray ? data.slice() : Object.assign(Object.create(null), data && typeof data === 'object' ? data : {});
    const child = Object.hasOwn(node, key) ? node[key] : null;
    const next = replaceAtPath(child, parts, value, index + 1);
    if (value === null && index + 1 < parts.length && next === child) return data;
    if (keepArray) {
      node[Number(key)] = next;
    } else if (next === null) delete node[key];
    else Object.defineProperty(node, key, { value: next, writable: true, enumerable: true, configurable: true });
    return Object.keys(node).length ? node : null;
  }

  async function saveLocalPath(id, parts, data) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('data', 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.get(id);
      let failure;
      request.onsuccess = () => {
        try {
          const root = replaceAtPath(request.result ?? null, parts, data);
          if (root === null) store.delete(id);
          else store.put(root, id);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(failure || transaction.error);
      transaction.onerror = () => {};
    });
  }

  async function remoteContext(id, path = '') {
    const token = await getAccessToken();
    const location = [id, ...pathSegments(path)].join('/');
    return { revision: connectionRevision, generation: cacheGeneration, location,
      databaseURL: config.databaseURL,
      url: `${config.databaseURL}/${location.split('/').map(encodeURIComponent).join('/')}.json?auth=${encodeURIComponent(token)}` };
  }

  function cacheRemoteResult(context, record, conflicted = false, written = false) {
    for (const [location, cached] of remoteCache) {
      if (cached.databaseURL !== context.databaseURL || location === context.location) continue;
      let previous;
      let current;
      if (context.location.startsWith(`${location}/`)) {
        previous = valueAtPath(cached.data, context.location.slice(location.length + 1).split('/'));
        current = record.data;
      } else if (location.startsWith(`${context.location}/`)) {
        previous = cached.data;
        current = valueAtPath(record.data, location.slice(context.location.length + 1).split('/'));
      } else continue;
      // 다른 경로의 ETag는 갱신할 수 없으므로, 값이 달라졌거나 저장한 경우 다시 읽게 한다.
      if (written || JSON.stringify(previous) !== JSON.stringify(current)) remoteCache.delete(location);
    }
    // 관련 경로의 ETag는 추측하지 않는다. 각 경로에서 받은 ETag만 조건부 저장에 사용한다.
    remoteCache.set(context.location, { ...record, databaseURL: context.databaseURL,
      revision: context.revision, generation: context.generation, conflicted });
    // 키 목록은 값/ETag 캐시와 분리한다. 저장·조회 응답으로 확인한 경로만 갱신한다.
    for (const [location, keys] of remoteKeyCache) {
      if (location === context.location || location.startsWith(`${context.location}/`)) {
        const relative = location.slice(context.location.length + 1);
        const value = relative ? valueAtPath(record.data, relative.split('/')) : record.data;
        remoteKeyCache.set(location, remoteKeys(value));
      } else if (context.location.startsWith(`${location}/`)) {
        const relative = context.location.slice(location.length + 1);
        const child = relative.split('/')[0];
        if (record.data !== null) {
          if (!keys.includes(child)) remoteKeyCache.set(location, [...keys, child]);
        } else if (relative.includes('/')) {
          // 깊은 경로 삭제로 상위 노드까지 사라졌는지는 응답만으로 추측하지 않는다.
          remoteKeyCache.delete(location);
        } else remoteKeyCache.set(location, keys.filter(key => key !== child));
      }
    }
  }

  function remoteKeys(value) {
    return value !== null && typeof value === 'object' ? Object.keys(value).filter(key => value[key] !== null) : [];
  }

  function checkConnection(context) {
    if (context.revision !== connectionRevision || context.generation !== cacheGeneration) {
      throw new CoreError('CONNECTION_CHANGED', '페이지 또는 Firebase 연결이 변경되었습니다. 다시 불러오세요.');
    }
  }

  async function readRemote(id, path = '') {
    const context = await remoteContext(id, path);
    let record = remoteCache.get(context.location);
    if (!record || record.databaseURL !== context.databaseURL) {
      const response = await requestJson('GET', context.url, undefined, { 'X-Firebase-ETag': 'true' });
      checkResponse(response);
      checkConnection(context);
      if (!response.etag) throw new CoreError('ETAG_MISSING', 'Firebase ETag를 읽을 수 없습니다. GM_xmlhttpRequest 설정을 확인하세요.');
      record = { data: response.data, etag: response.etag };
      cacheRemoteResult(context, record);
    } else record.conflicted = false;
    checkConnection(context);
    return cloneData(record.data);
  }

  // 캐시 ETag로 바로 PUT한다. 저장 전 GET이나 자동 재시도는 하지 않는다.
  async function writeRemote(id, data, path = '', baseline = remoteCache.get(path ? `${id}/${path}` : id)) {
    const context = await remoteContext(id, path);
    if (baseline && !baseline.etag && !baseline.conflicted) {
      throw new CoreError('ETAG_MISSING', '이전 저장 응답에 ETag가 없습니다. 페이지를 새로고침한 뒤 다시 불러오세요.');
    }
    if (!baseline || baseline.databaseURL !== context.databaseURL || baseline.revision !== context.revision ||
        baseline.generation !== context.generation || baseline.conflicted) {
      throw new CoreError('LOAD_REQUIRED', '저장할 경로를 먼저 불러오세요. 충돌 후에는 해당 경로의 최신본을 확인해야 합니다.');
    }
    const response = await requestJson('PUT', context.url, data,
      { 'Content-Type': 'application/json', 'X-Firebase-ETag': 'true', 'if-match': baseline.etag });
    checkConnection(context);
    if (response.status === 412) {
      cacheRemoteResult(context, { data: response.data, etag: response.etag }, true, true);
      throw new CoreError('CONFLICT', '서버의 데이터가 변경되었습니다. 최신본을 불러와 확인한 뒤 다시 저장하세요.',
        { latestData: cloneData(response.data) });
    }
    checkResponse(response);
    cacheRemoteResult(context, { data: response.data, etag: response.etag }, false, true);
  }

  async function currentProvider(id) {
    return await readStore('providers', id) === 'firebase' ? 'firebase' : 'local';
  }

  async function loadContent(id, path = '') {
    requireContent(id);
    const parts = pathSegments(path);
    if (await currentProvider(id) === 'firebase') return readRemote(id, path);
    const value = await readStore('data', id);
    return cloneData(valueAtPath(value ?? null, parts));
  }

  async function listContentKeys(id, path = '') {
    requireContent(id);
    const parts = pathSegments(path);
    let value;
    if (await currentProvider(id) === 'firebase') {
      const context = await remoteContext(id, path);
      if (remoteKeyCache.has(context.location)) return [...remoteKeyCache.get(context.location)];
      const response = await requestJson('GET', `${context.url}&shallow=true`);
      checkResponse(response);
      checkConnection(context);
      const keys = remoteKeys(response.data);
      remoteKeyCache.set(context.location, keys);
      return [...keys];
    } else {
      value = valueAtPath(await readStore('data', id) ?? null, parts);
    }
    return value !== null && typeof value === 'object' ? Object.keys(value) : [];
  }

  async function saveContent(id, value, path = '') {
    requireContent(id);
    const parts = pathSegments(path);
    const data = cloneData(value);
    if (await currentProvider(id) === 'firebase') {
      await writeRemote(id, data, path);
    } else if (parts.length) {
      await saveLocalPath(id, parts, data);
    } else {
      await writeStore('data', id, data === null ? undefined : data);
    }
    return cloneData(data);
  }

  async function commitProvider(id, target, localValue, expectedLocal) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(['data', 'providers'], 'readwrite');
      const data = transaction.objectStore('data');
      let failure;
      const request = data.get(id);
      request.onsuccess = () => {
        if (target === 'local' && JSON.stringify(request.result ?? null) !== JSON.stringify(expectedLocal)) {
          failure = new CoreError('LOCAL_CONFLICT', '다른 탭에서 로컬 데이터가 변경되었습니다. 다시 선택하세요.');
          transaction.abort();
          return;
        }
        if (target === 'local') {
          if (localValue === null) data.delete(id);
          else data.put(localValue, id);
          transaction.objectStore('providers').delete(id);
        } else transaction.objectStore('providers').put('firebase', id);
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(failure || transaction.error);
      transaction.onerror = () => {};
    });
  }

  async function switchProvider(id, target) {
    const command = requireContent(id);
    if (!['local', 'firebase'].includes(target)) throw new CoreError('INVALID_PROVIDER', 'local 또는 firebase를 선택하세요.');
    const from = await currentProvider(id);
    if (from === target) return from;
    const local = (await readStore('data', id)) ?? null;
    const remote = await readRemote(id);
    const baseline = { ...remoteCache.get(id) };
    // 한쪽만 비어 있으면 데이터가 있는 쪽을 사용한다. 양쪽에 있을 때만 선택받는다.
    let choice = local === null ? 'firebase' : remote === null ? 'local' : null;
    if (choice === null) {
      choice = await chooseSwitchData(command.label, from, target);
      if (choice === null) return from;
    }
    if (target === 'firebase' && choice === 'local') {
      const currentLocal = (await readStore('data', id)) ?? null;
      if (JSON.stringify(currentLocal) !== JSON.stringify(local)) {
        throw new CoreError('LOCAL_CONFLICT', '다른 탭에서 로컬 데이터가 변경되었습니다. 다시 선택하세요.');
      }
      // 선택한 스냅샷을 전송하며, 전송 도중 바뀐 Local 원본은 덮어쓰지 않는다.
      await writeRemote(id, local, '', baseline);
    }
    const nextLocal = choice === 'firebase' ? remote : local;
    await commitProvider(id, target, nextLocal, local);
    return target;
  }

  function initialOf(character) {
    const number = character.charCodeAt(0) - 0xac00;
    return number >= 0 && number <= 11171 ? HANGUL_INITIALS[Math.floor(number / 588)] : character;
  }

  function matchesLabel(label, query) {
    const text = [...label.toLocaleLowerCase()];
    const search = [...query.toLocaleLowerCase()];
    return search.every((character, index) => text[index] !== undefined &&
      (HANGUL_INITIALS.includes(character) ? initialOf(text[index]) === character : text[index] === character));
  }

  function commandItems(query) {
    return [{ id: '__settings', label: '설정', lambda: openSettingsDialog }, ...commands.values()]
      .filter(command => matchesLabel(command.label, query));
  }

  function registerContent(definition) {
    if (!definition || typeof definition.id !== 'string' || !/^[\p{L}\p{N}_-]{1,128}$/u.test(definition.id)) {
      throw new CoreError('INVALID_ID', 'id에는 문자·숫자·밑줄·하이픈을 사용하세요.');
    }
    const { id, label, useDatabse, lambda } = definition;
    if (commands.has(id)) throw new CoreError('DUPLICATE_ID', `이미 등록된 id입니다: ${id}`);
    if (typeof label !== 'string' || !/^[^\s!]{1,40}$/u.test(label) || label === '설정') {
      throw new CoreError('INVALID_LABEL', 'label에는 공백·느낌표 없는 명령어를 입력하세요. 설정은 예약 명령어입니다.');
    }
    if ([...commands.values()].some(command => command.label === label)) {
      throw new CoreError('DUPLICATE_LABEL', `이미 등록된 명령어입니다: ${label}`);
    }
    if (typeof useDatabse !== 'boolean' || typeof lambda !== 'function') {
      throw new CoreError('INVALID_REGISTRATION', 'useDatabse는 boolean, lambda는 함수여야 합니다.');
    }
    commands.set(id, Object.freeze({ id, label, useDatabse, lambda }));
    renderSettingsList().catch(showError);
    return id;
  }

  const ICONS = {
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 8.8a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 1.9-2.2 3.5M12 16.5h.01"/>',
    shield: '<path d="m12 3 8 3v5c0 5-5 8.5-8 10-3-1.5-8-5-8-10V6z"/><path d="m8.5 12 2.3 2.3 4.7-5"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
    local: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    firebase: '<path d="M6 18a4 4 0 0 1-.7-7.9A6.5 6.5 0 0 1 18 8.5 4.8 4.8 0 0 1 18 18z"/>',
    box: '<path d="m12 2 9 5-9 5-9-5zm-9 5v10l9 5 9-5V7m-9 5v10M7.5 4.5l9 5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    folder: '<path d="M3 8V5h7l2 3h9v12H3zm0 0h9"/>',
    warning: '<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 3h7v7m0-7L10 14m0-11H3v18h18v-7"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
    off: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function providerLabel(provider) { return provider === 'local' ? 'Local' : 'Firebase'; }

  function showToast(message) {
    if (!toastElement) {
      toastElement = document.createElement('div');
      toastElement.className = 'cc-ui toast';
      toastElement.setAttribute('role', 'status');
      toastElement.setAttribute('aria-live', 'polite');
      toastElement.innerHTML = `${icon('check')}<span></span>`;
    }
    // native dialog의 top layer 안에 두어 배경이나 다른 창에 가려지지 않게 한다.
    const dialogs = document.querySelectorAll('dialog.cc-ui[open]');
    const host = dialogs[dialogs.length - 1] || document.body;
    if (toastElement.parentElement !== host) host.append(toastElement);
    toastElement.querySelector('span').textContent = message;
    toastElement.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastElement.classList.remove('show'), 3500);
  }

  function showError(error) {
    showToast(error instanceof Error ? error.message : String(error));
  }

  function createDialog(title, body, footer, options = {}) {
    const dialog = document.createElement('dialog');
    const titleId = `cc-dialog-title-${++dialogSequence}`;
    dialog.className = `cc-ui ${options.className || ''}`;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.innerHTML = `
      <header class="dialog-header">
        <div class="dialog-title ${options.warning ? 'warning' : ''}">${icon(options.icon || 'code')}<h3 id="${titleId}">${escapeHtml(title)}</h3></div>
        <button class="icon-button" data-action="close" aria-label="닫기">${icon('close')}</button>
      </header>
      <div class="dialog-body">${body}</div>
      <footer class="dialog-footer">${footer}</footer>`;
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-action="close"]')) dialog.close();
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  function chooseSwitchData(label, from, target) {
    return new Promise(resolve => {
      let choice = from;
      let result = null;
      const choices = ['local', 'firebase'].map(provider => `
        <button class="data-choice" role="radio" data-choice="${provider}" aria-checked="false">
          <span class="choice-top"><span class="choice-name">${icon(provider)}${providerLabel(provider)}</span><span class="choice-radio" aria-hidden="true"></span></span>
          <div class="choice-detail">${provider === 'local' ? '이 브라우저' : 'Firebase'}에 저장된 데이터</div>
          <div class="choice-result"><span></span></div>
        </button>`).join('');
      const dialog = createDialog('사용할 데이터를 선택하세요', `
        <div class="transition-path"><strong>${escapeHtml(label)}</strong><span class="transition-direction">${providerLabel(from)}${icon('arrow')}${providerLabel(target)}</span></div>
        <p class="dialog-question">양쪽 저장소에 데이터가 있습니다.<br>전환 후 사용할 데이터를 선택하세요.</p>
        <div class="data-choices" role="radiogroup" aria-label="사용할 데이터">${choices}</div>
        <div class="effect-box" aria-live="polite"></div>`,
      '<button class="button" data-action="close">취소</button><button class="button primary" data-action="apply">적용</button>',
      { icon: 'warning', warning: true });

      function render() {
        dialog.querySelectorAll('[data-choice]').forEach(button => {
          const selected = button.dataset.choice === choice;
          const overwritten = !selected && button.dataset.choice === target;
          button.setAttribute('aria-checked', String(selected));
          button.classList.toggle('overwritten', overwritten);
          button.querySelector('.choice-result').innerHTML = `${icon(selected ? 'check' : overwritten ? 'trash' : 'shield')}<span>${selected ? '사용할 데이터' : overwritten ? '덮어쓸 데이터' : '기존 데이터 유지'}</span>`;
        });
        const effect = dialog.querySelector('.effect-box');
        if (choice !== target) {
          effect.innerHTML = `<strong>${providerLabel(choice)} 데이터를 ${providerLabel(target)}로 복사합니다.</strong><br>${providerLabel(target)}의 기존 데이터는 삭제되고 선택한 데이터로 대체됩니다.<br><span class="preserved">${providerLabel(from)} 원본은 유지됩니다. 이 작업은 되돌릴 수 없습니다.</span>`;
        } else {
          effect.innerHTML = `<strong>기존 ${providerLabel(target)} 데이터를 사용합니다.</strong><br>데이터를 덮어쓰지 않고 저장소를 전환합니다.<br><span class="preserved">${providerLabel(from)} 데이터도 변경하지 않습니다.</span>`;
        }
        dialog.querySelector('[data-action="apply"]').textContent = choice !== target ? '덮어쓰고 적용' : '이 데이터로 적용';
      }
      dialog.querySelectorAll('[data-choice]').forEach(button => {
        button.addEventListener('click', () => { choice = button.dataset.choice; render(); });
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          choice = choice === 'local' ? 'firebase' : 'local';
          render();
          dialog.querySelector(`[data-choice="${choice}"]`).focus();
        });
      });
      dialog.querySelector('[data-action="apply"]').addEventListener('click', () => { result = choice; dialog.close(); });
      dialog.addEventListener('close', () => resolve(result), { once: true });
      render();
    });
  }

  async function removeOrphan(id) {
    if (commands.has(id)) throw new CoreError('CONTENT_REGISTERED', '등록된 콘텐츠는 이 화면에서 삭제할 수 없습니다.');
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(['data', 'providers'], 'readwrite');
      transaction.objectStore('data').delete(id);
      transaction.objectStore('providers').delete(id);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {};
    });
    for (const cache of [remoteCache, remoteKeyCache]) {
      for (const location of cache.keys()) {
        if (location === id || location.startsWith(`${id}/`)) cache.delete(location);
      }
    }
  }

  function confirmOrphanDelete(id) {
    const dialog = createDialog('로컬 데이터를 삭제할까요?',
      `<div class="delete-id mono">${escapeHtml(id)}</div><p class="warning-copy">현재 등록되지 않은 명령어의 로컬 데이터입니다.<br><strong>삭제하면 복구할 수 없습니다.</strong> Firebase 데이터는 변경하지 않습니다.</p>`,
      `<button class="button" data-action="close">취소</button><button class="button danger" data-action="delete">${icon('trash')}로컬 데이터 삭제</button>`,
      { icon: 'trash', warning: true });
    dialog.querySelector('[data-action="delete"]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try {
        await exclusive(id, () => removeOrphan(id));
        dialog.close();
        await renderSettingsList();
      } catch (error) { showError(error); event.target.disabled = false; }
    });
  }

  async function renderSettingsList() {
    const dialog = settingsDialog;
    if (!dialog?.open) return;
    const providers = await Promise.all([...commands.values()].map(async command => ({
      ...command, provider: command.useDatabse ? await currentProvider(command.id) : null,
    })));
    const orphanIds = (await listStoredIds()).filter(id => !commands.has(id));
    if (dialog !== settingsDialog || !dialog.open) return;
    dialog.querySelector('[data-command-count]').textContent = String(providers.length);
    const list = dialog.querySelector('[data-command-list]');
    list.replaceChildren();
    for (const command of providers) {
      const row = document.createElement('div');
      row.className = 'command-row';
      row.dataset.commandId = command.id;
      row.innerHTML = `
        <div class="command-info"><span class="content-icon">${icon('box')}</span><div><div class="command-name"><span class="bang">!</span>${escapeHtml(command.label)}</div><div class="command-id mono">${escapeHtml(command.id)}</div></div></div>
        ${command.useDatabse ? `<div class="segmented" role="group" aria-label="${escapeHtml(command.label)} 저장소">${['local', 'firebase'].map(provider => `<button class="segment" data-provider="${provider}" aria-pressed="${command.provider === provider}">${icon(provider)}${providerLabel(provider)}</button>`).join('')}</div>` : `<span class="no-storage">${icon('off')}저장기능 미사용</span>`}`;
      row.querySelectorAll('[data-provider]').forEach(button => button.addEventListener('click', async () => {
        row.querySelectorAll('button').forEach(item => { item.disabled = true; });
        try {
          await exclusive(command.id, () => switchProvider(command.id, button.dataset.provider));
        } catch (error) { showError(error); }
        await renderSettingsList();
      }));
      list.append(row);
    }
    if (providers.length === 0) list.innerHTML = '<div class="empty-orphans">등록된 콘텐츠 없음</div>';
    let orphanSection = dialog.querySelector('[data-orphan-section]');
    if (orphanIds.length === 0) {
      orphanSection?.remove();
      return;
    }
    if (!orphanSection) {
      orphanSection = document.createElement('section');
      orphanSection.className = 'section';
      orphanSection.dataset.orphanSection = '';
      orphanSection.innerHTML = '<div class="section-heading orphan-heading"><div class="section-title"><span class="section-number">03</span><h2>미등록 로컬 데이터</h2></div><span class="section-meta" data-orphan-count></span></div><div data-orphan-list></div>';
      dialog.querySelector('.settings-body').append(orphanSection);
    }
    const orphanList = orphanSection.querySelector('[data-orphan-list]');
    orphanList.replaceChildren();
    dialog.querySelector('[data-orphan-count]').textContent = `${orphanIds.length}개`;
    for (const id of orphanIds) {
      const row = document.createElement('div');
      row.className = 'orphan-row';
      row.innerHTML = `<span class="orphan-label">${icon('folder')}<span class="mono">${escapeHtml(id)}</span></span><button class="icon-button" aria-label="${escapeHtml(id)} 로컬 데이터 삭제" title="로컬 데이터 삭제">${icon('trash')}</button>`;
      row.querySelector('button').addEventListener('click', () => confirmOrphanDelete(id));
      orphanList.append(row);
    }
  }

  function updateConnectionStatus() {
    if (!settingsDialog?.open) return;
    const connected = !!session && session.databaseURL === config?.databaseURL;
    const status = settingsDialog.querySelector('[data-connection-status]');
    status.innerHTML = `<span class="dot"></span>${connected ? '로그인됨' : '로그인 필요'}`;
    status.classList.toggle('disconnected', !connected);
    settingsDialog.querySelector('[data-uid]').textContent = connected ? `UID · ${session.uid}` : '';
    settingsDialog.querySelector('[data-sign-out]').hidden = !connected;
  }

  function showRules() {
    if (!session) { showError(new CoreError('LOGIN_REQUIRED', '규칙을 생성하려면 먼저 Firebase에 로그인하세요.')); return; }
    const rules = Object.assign(Object.create(null), { '.read': false, '.write': false });
    const expression = `auth != null && auth.uid === ${JSON.stringify(session.uid)}`;
    const ids = [...commands.values()].filter(command => command.useDatabse).map(command => command.id);
    for (const id of ids) rules[id] = { '.read': expression, '.write': expression };
    const dialog = createDialog('Firebase 보안규칙',
      `<div class="rules-meta"><span class="tag">Realtime Database</span><span class="tag mono">UID: ${escapeHtml(session.uid)}</span></div><textarea class="rules-code" aria-label="복사할 보안규칙" readonly spellcheck="false"></textarea><p class="rules-notice">기존 규칙을 교체합니다. 다른 용도로 사용하는 DB라면 기존 규칙도 함께 확인하세요.<br>등록된 저장 기능 사용 콘텐츠만 허용합니다. UID는 데이터 경로에 포함되지 않습니다.</p>`,
      `<button class="button" data-action="close">닫기</button><button class="button primary" data-action="copy">${icon('copy')}규칙 복사</button>`,
      { icon: 'shield', className: 'rules-dialog' });
    const textarea = dialog.querySelector('textarea');
    textarea.value = JSON.stringify({ rules }, null, 2);
    dialog.querySelector('[data-action="copy"]').addEventListener('click', () => {
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      showToast(copied ? '규칙을 복사했어요.' : 'Ctrl+C 또는 ⌘C로 복사하세요.');
    });
  }

  async function openSettingsDialog() {
    hideSuggestions();
    if (settingsDialog?.open) return settingsDialog;
    const dialog = document.createElement('dialog');
    settingsDialog = dialog;
    dialog.className = 'cc-ui ui-window settings';
    dialog.setAttribute('aria-label', 'Crack Commandline 설정');
    dialog.innerHTML = `
      <header class="window-header settings-header"><div class="identity"><div class="brand-mark" aria-hidden="true">&gt;_</div><div><div class="eyebrow">CRACK COMMANDLINE</div><h1>설정</h1></div></div><button class="icon-button" data-action="close" aria-label="설정 닫기">${icon('close')}</button></header>
      <div class="settings-body">
        <section class="section"><div class="section-heading"><div class="section-title"><span class="section-number">01</span><h2>Firebase 연결</h2></div><div class="actions"><button class="button subtle" data-action="guide">${icon('help')}연동 가이드</button><button class="button subtle" data-action="rules">${icon('shield')}보안규칙</button></div></div>
          <div class="config-box"><div class="config-top"><span class="file-tag">${icon('code')}<span class="mono">firebaseConfig</span></span><span>Realtime Database</span></div><textarea class="config-input" data-config aria-label="Firebase config" spellcheck="false" placeholder='{"apiKey":"…","databaseURL":"https://…"}'></textarea></div>
          <form data-auth-form><div class="auth-line"><div><label class="field-label" for="cc-email">이메일</label><input class="text-input" id="cc-email" type="email" autocomplete="username" required></div><div><label class="field-label" for="cc-password">비밀번호</label><div class="password-field"><input class="text-input" id="cc-password" type="password" autocomplete="current-password" required><button class="icon-button" type="button" data-action="password" aria-label="비밀번호 표시" aria-pressed="false">${icon('eye')}</button></div></div><button class="button auth-button" type="submit">연결 설정 적용</button></div></form>
          <div class="connection-strip"><span class="connection-status" data-connection-status></span><span class="uid mono" data-uid></span><button class="button subtle" data-sign-out>로그아웃</button></div><div class="cc-inline-error" data-auth-error role="alert"></div>
        </section>
        <section class="section"><div class="section-heading"><div class="section-title"><span class="section-number">02</span><h2>명령어별 저장소</h2></div><span class="section-meta">등록된 명령어 <span data-command-count>0</span></span></div><div class="command-list" data-command-list></div></section>
      </div>
      <footer class="window-footer"><span class="shortcut">명령어 <kbd>!설정</kbd></span><button class="button primary" data-action="close">완료</button></footer>`;
    dialog.querySelector('[data-config]').value = config ? JSON.stringify(config, null, 2) : '';
    dialog.querySelector('#cc-email').value = session?.email || '';
    dialog.querySelectorAll('[data-action="close"]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => { dialog.remove(); if (settingsDialog === dialog) settingsDialog = null; }, { once: true });
    dialog.querySelector('[data-action="guide"]').addEventListener('click', () => createDialog('Firebase 연동 가이드', GUIDE_BODY,
      '<button class="button primary" data-action="close">확인</button>', { icon: 'help', className: 'guide-dialog' }));
    dialog.querySelector('[data-action="rules"]').addEventListener('click', showRules);
    dialog.querySelector('[data-action="password"]').addEventListener('click', event => {
      const button = event.currentTarget;
      const field = dialog.querySelector('#cc-password');
      const visible = field.type === 'password';
      field.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? '비밀번호 숨기기' : '비밀번호 표시');
    });
    dialog.querySelector('[data-auth-form]').addEventListener('submit', async event => {
      event.preventDefault();
      const button = dialog.querySelector('[type="submit"]');
      const errorField = dialog.querySelector('[data-auth-error]');
      button.disabled = true;
      errorField.textContent = '';
      try {
        await connectFirebase(dialog.querySelector('[data-config]').value,
          dialog.querySelector('#cc-email').value.trim(), dialog.querySelector('#cc-password').value);
        updateConnectionStatus();
        showToast('Firebase에 로그인했어요.');
      } catch (error) { errorField.textContent = error instanceof SyntaxError ? 'Firebase config를 JSON 형식으로 입력하세요.' : error.message; }
      finally { dialog.querySelector('#cc-password').value = ''; button.disabled = false; }
    });
    dialog.querySelector('[data-sign-out]').addEventListener('click', async () => {
      try { await signOut(); updateConnectionStatus(); }
      catch (error) { showError(error); }
    });
    document.body.append(dialog);
    dialog.showModal();
    updateConnectionStatus();
    await renderSettingsList();
    return dialog;
  }

  function editorFrom(target) {
    if (!(target instanceof Element)) return null;
    const editor = target.closest(CHAT_SELECTOR);
    if (!editor || editor.closest('.cc-ui') || editor.getAttribute('contenteditable') === 'false') return null;
    return editor;
  }

  function fragmentText(root) {
    let text = '';
    for (const node of root.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
      else if (node.nodeName === 'BR') text += '\n';
      else {
        if (/^(P|DIV|LI)$/.test(node.nodeName) && text && !text.endsWith('\n')) text += '\n';
        text += fragmentText(node);
      }
    }
    return text;
  }

  function tokenAtCaret(editor) {
    let prefix;
    let range;
    let rawOffset;
    if (editor instanceof HTMLTextAreaElement) {
      if (editor.selectionStart !== editor.selectionEnd) return null;
      prefix = editor.value.slice(0, editor.selectionStart);
      rawOffset = editor.selectionStart;
    } else {
      const selection = document.getSelection();
      if (!selection?.rangeCount || !selection.isCollapsed || !editor.contains(selection.anchorNode)) return null;
      range = selection.getRangeAt(0).cloneRange();
      const before = range.cloneRange();
      before.selectNodeContents(editor);
      before.setEnd(range.endContainer, range.endOffset);
      rawOffset = before.toString().length;
      prefix = fragmentText(before.cloneContents());
    }
    const match = /(?:^|\s)!([^\s!]*)$/u.exec(prefix);
    if (!match) return null;
    return { editor, query: match[1], rawOffset, range };
  }

  function ensureSuggestions() {
    if (suggestionBox) return;
    suggestionBox = document.createElement('div');
    suggestionBox.id = 'crack-commandline-suggestions';
    suggestionBox.className = 'cc-ui cc-suggestions';
    suggestionBox.setAttribute('role', 'listbox');
    suggestionBox.setAttribute('aria-label', '명령어 자동완성');
    suggestionBox.hidden = true;
    suggestionBox.addEventListener('pointerdown', event => event.preventDefault());
    suggestionBox.addEventListener('click', event => {
      const option = event.target.closest('[data-command-index]');
      if (option) executeCommand(candidates[Number(option.dataset.commandIndex)]);
    });
    document.body.append(suggestionBox);
  }

  function positionSuggestions() {
    suggestionFrame = null;
    if (!activeEditor?.isConnected || !suggestionBox || suggestionBox.hidden) { hideSuggestions(); return; }
    const bounds = activeEditor.getBoundingClientRect();
    const width = Math.min(Math.max(bounds.width, 220), 360, window.innerWidth - 16);
    const availableAbove = Math.max(80, bounds.top - 12);
    suggestionBox.style.width = `${width}px`;
    suggestionBox.style.maxHeight = `${Math.min(220, availableAbove)}px`;
    suggestionBox.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8))}px`;
    suggestionBox.style.top = `${Math.max(8, bounds.top - Math.min(suggestionBox.scrollHeight, 220, availableAbove) - 7)}px`;
  }

  function scheduleSuggestionPosition() {
    if (!suggestionFrame) suggestionFrame = requestAnimationFrame(positionSuggestions);
  }

  function selectSuggestion(index) {
    selectedCandidate = (index + candidates.length) % candidates.length;
    suggestionBox.querySelectorAll('[data-command-index]').forEach((option, optionIndex) => {
      option.setAttribute('aria-selected', String(optionIndex === selectedCandidate));
    });
    const selected = suggestionBox.children[selectedCandidate];
    activeEditor?.setAttribute('aria-activedescendant', selected.id);
    selected.scrollIntoView?.({ block: 'nearest' });
  }

  function hideSuggestions() {
    if (suggestionBox) suggestionBox.hidden = true;
    activeEditor?.removeAttribute('aria-activedescendant');
    activeEditor?.removeAttribute('aria-controls');
    activeToken = null;
    candidates = [];
    selectedCandidate = -1;
    window.removeEventListener('resize', scheduleSuggestionPosition);
    window.removeEventListener('scroll', scheduleSuggestionPosition, true);
    if (suggestionFrame) cancelAnimationFrame(suggestionFrame);
    suggestionFrame = null;
  }

  function updateSuggestions(editor) {
    activeEditor = editor;
    const text = editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent;
    if (!text.includes('!')) { hideSuggestions(); return; }
    const token = tokenAtCaret(editor);
    if (!token) { hideSuggestions(); return; }
    const nextCandidates = commandItems(token.query);
    if (!nextCandidates.length) { hideSuggestions(); return; }
    const unchanged = activeToken?.editor === editor && activeToken.query === token.query && activeToken.rawOffset === token.rawOffset &&
      nextCandidates.length === candidates.length && nextCandidates.every((command, index) => command.id === candidates[index].id);
    activeToken = token;
    candidates = nextCandidates;
    ensureSuggestions();
    if (!unchanged || suggestionBox.hidden) {
      suggestionBox.innerHTML = candidates.map((command, index) => `<button type="button" role="option" id="cc-suggestion-${index}" data-command-index="${index}" aria-selected="false"><span>${icon(command.id === '__settings' ? 'code' : 'box')}<span class="cc-command-bang">!</span>${escapeHtml(command.label)}</span>${icon('arrow')}</button>`).join('');
      selectedCandidate = -1;
    }
    suggestionBox.hidden = false;
    editor.setAttribute('aria-controls', suggestionBox.id);
    if (selectedCandidate >= 0) editor.setAttribute('aria-activedescendant', `cc-suggestion-${selectedCandidate}`);
    else editor.removeAttribute('aria-activedescendant');
    positionSuggestions();
    window.addEventListener('resize', scheduleSuggestionPosition, { passive: true });
    window.addEventListener('scroll', scheduleSuggestionPosition, { passive: true, capture: true });
  }

  function removeCommandToken(token) {
    const { editor, query, rawOffset, range } = token;
    const start = rawOffset - query.length - 1;
    if (editor instanceof HTMLTextAreaElement) {
      const value = editor.value.slice(0, start) + editor.value.slice(rawOffset);
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, value);
      editor.setSelectionRange(start, start);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      return;
    }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node;
    let remaining = start;
    while ((node = walker.nextNode())) {
      if (remaining <= node.textContent.length) break;
      remaining -= node.textContent.length;
    }
    if (!node || !range) throw new CoreError('EDITOR_CHANGED', '입력창이 변경되었습니다. 명령어를 다시 입력하세요.');
    const removal = range.cloneRange();
    removal.setStart(node, remaining);
    const selection = document.getSelection();
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(removal);
    // 직접 DOM을 지우면 ProseMirror 상태와 어긋난다. 브라우저 편집 명령으로 input 이벤트를 발생시킨다.
    if (!document.execCommand('delete', false)) {
      throw new CoreError('EDITOR_UNSUPPORTED', '입력창에서 명령어를 제거하지 못했습니다. 전송하지 말고 다시 시도하세요.');
    }
  }

  function executeCommand(command) {
    const token = activeToken;
    if (!command || !token) return;
    hideSuggestions();
    try {
      removeCommandToken(token);
      Promise.resolve(command.lambda()).catch(showError);
    } catch (error) { showError(error); }
  }

  function startCommandInput() {
    document.addEventListener('input', event => {
      const editor = editorFrom(event.target);
      if (editor) updateSuggestions(editor);
    }, true);
    document.addEventListener('compositionstart', event => { if (editorFrom(event.target)) composing = true; }, true);
    document.addEventListener('compositionend', event => {
      composing = false;
      const editor = editorFrom(event.target);
      if (editor) updateSuggestions(editor);
    }, true);
    document.addEventListener('focusin', event => {
      const editor = editorFrom(event.target);
      if (editor) updateSuggestions(editor);
      else if (!suggestionBox?.contains(event.target)) hideSuggestions();
    }, true);
    document.addEventListener('keydown', event => {
      const editor = editorFrom(event.target);
      if (!editor || composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { hideSuggestions(); return; }
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      updateSuggestions(editor);
      if (!activeToken || !candidates.length) return;
      // 단순 입력·일반 Enter는 채팅 동작이다. 방향키로 고른 항목만 Enter로 실행한다.
      if (event.key === 'Enter' && selectedCandidate < 0) { hideSuggestions(); return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'ArrowDown') selectSuggestion(selectedCandidate + 1);
      else if (event.key === 'ArrowUp') selectSuggestion(selectedCandidate < 0 ? candidates.length - 1 : selectedCandidate - 1);
      else executeCommand(candidates[selectedCandidate]);
    }, true);
    document.addEventListener('selectionchange', () => {
      if (!suggestionBox?.hidden && activeEditor && document.activeElement === activeEditor) updateSuggestions(activeEditor);
    });
  }

  const GUIDE_BODY = `
<div class="guide-intro"><span class="tag">Realtime Database · 이메일 / 비밀번호</span><a class="button subtle" href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer">Firebase 콘솔<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.external}</svg></a></div>
      <div class="guide-stack">
        <details open><summary><span class="step-number">01</span>프로젝트 생성<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">${ICONS.down}</svg></summary><div class="guide-content"><ol><li>Firebase 콘솔에서 <strong>프로젝트 만들기</strong>를 누르고 프로젝트 이름을 입력합니다.</li><li>안내에 따라 프로젝트를 만듭니다. 이 확장에는 Google Analytics가 필요하지 않습니다.</li><li><strong>프로젝트 개요 → 웹 앱 추가(&lt;/&gt;)</strong>를 선택합니다. 앱 닉네임을 입력하고 <strong>앱 등록</strong>을 누릅니다. Hosting 설정은 필요하지 않습니다.</li><li>표시되는 <code>firebaseConfig</code>의 <strong>{ … } 객체</strong>를 복사합니다. 입력할 때는 JSON 형식으로 키와 문자열에 큰따옴표를 사용하고 마지막 쉼표를 제거합니다. 나중에 다시 찾으려면 <strong>프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성</strong>으로 이동합니다.</li></ol></div></details>
        <details><summary><span class="step-number">02</span>데이터베이스 생성<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">${ICONS.down}</svg></summary><div class="guide-content"><ol><li>콘솔의 <strong>Databases &amp; Storage → Realtime Database</strong>로 이동해 <strong>데이터베이스 만들기</strong>를 누릅니다. 이전 콘솔에서는 <strong>빌드(Build)</strong> 아래에 있습니다.</li><li>데이터베이스 위치를 선택하고 <strong>잠금 모드</strong>로 생성합니다.</li><li><strong>데이터(Data)</strong> 탭 상단의 DB URL을 복사합니다. <code>firebaseConfig</code>에 <code>databaseURL</code> 항목이 없다면 이 URL을 추가합니다.</li><li>이 설정창의 <strong>firebaseConfig</strong> 입력란에 구성 객체를 붙여넣습니다.</li></ol></div></details>
        <details><summary><span class="step-number">03</span>로그인 사용자 등록<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">${ICONS.down}</svg></summary><div class="guide-content"><ol><li>콘솔에서 <strong>Security → Authentication</strong>으로 이동합니다. 이전 콘솔에서는 <strong>빌드(Build)</strong> 아래에 있습니다. 처음이라면 <strong>시작하기</strong>를 누릅니다.</li><li><strong>로그인 방법(Sign-in method) → 이메일/비밀번호</strong>에서 이메일/비밀번호 방식을 활성화하고 <strong>저장</strong>합니다. 이메일 링크 방식은 필요하지 않습니다.</li><li><strong>사용자(Users) → 사용자 추가(Add user)</strong>에서 이 확장 전용 이메일 형식의 주소와 비밀번호를 입력하고 추가합니다.</li></ol><div class="guide-tip">실제 사용하는 메일 대신, 메일함이 없는 전용 주소를 사용해도 됩니다. 예: <code>book-user@example.invalid</code><br><strong>다른 서비스와 겹치지 않는 이메일·비밀번호</strong>를 권장합니다.</div></div></details>
        <details><summary><span class="step-number">04</span>확장에서 로그인<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">${ICONS.down}</svg></summary><div class="guide-content"><ol><li>이 설정창으로 돌아와 등록한 <strong>이메일·비밀번호</strong>를 입력합니다.</li><li><strong>연결 설정 적용</strong>을 누릅니다.</li><li><strong>로그인됨</strong> 상태와 사용자 UID가 표시되는지 확인합니다. 다음 단계에서 이 UID가 포함된 보안규칙을 사용합니다.</li></ol></div></details>
        <details><summary><span class="step-number">05</span>보안규칙 게시<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">${ICONS.down}</svg></summary><div class="guide-content"><ol><li>이 설정창의 <strong>보안규칙</strong> 버튼을 누르고 규칙을 복사합니다.</li><li>Firebase 콘솔에서 <strong>Realtime Database → 규칙(Rules)</strong> 탭을 엽니다.</li><li>이 확장 전용 DB라면 기존 내용을 복사한 규칙으로 교체하고 <strong>게시(Publish)</strong>를 누릅니다. 다른 용도로도 쓰는 DB라면 기존 규칙을 보존해 함께 구성합니다.</li><li>설정창에서 원하는 명령어의 저장소를 <strong>Firebase</strong>로 선택합니다. 등록한 콘텐츠가 추가되면 보안규칙에도 해당 ID를 반영합니다.</li></ol><div class="guide-tip">데이터 경로는 <code>/item</code>, <code>/skill</code>처럼 콘텐츠 ID 바로 아래입니다. UID는 접근 권한 확인에만 사용합니다.</div></div></details>
      </div>
      <p class="guide-source">가이드 예시 기준: Realtime Database. <a href="https://firebase.google.com/docs/database/web/start?hl=ko" target="_blank" rel="noopener noreferrer">DB 설정</a> · <a href="https://firebase.google.com/docs/auth/web/password-auth?hl=ko" target="_blank" rel="noopener noreferrer">이메일 인증</a> · <a href="https://support.google.com/firebase/answer/6400802?hl=ko" target="_blank" rel="noopener noreferrer">사용자 추가</a></p>`;
  const stylesheet = document.createElement('style');
  stylesheet.id = 'crack-commandline-style';
  stylesheet.textContent = GM_getResourceText('ccCommon');
  (document.head || document.documentElement).append(stylesheet);

  Object.defineProperty(page, 'CrackCommandline', { value: api, enumerable: false, writable: false, configurable: false });
  // 다른 탭의 로그인/로그아웃을 반영한다. 데이터 다운로드나 주기 작업은 하지 않는다.
  window.addEventListener('storage', event => {
    if (event.key !== CONFIG_KEY && event.key !== SESSION_KEY && event.key !== null) return;
    config = readStoredConfig();
    session = readStoredSession();
    connectionRevision += 1;
    remoteCache.clear();

    remoteKeyCache.clear();
    updateConnectionStatus();
  });
  function resetPageCache() {
    remoteCache.clear();

    remoteKeyCache.clear();
    cacheGeneration += 1;
  }
  if (window.navigation) window.navigation.addEventListener('navigatesuccess', resetPageCache);
  else window.addEventListener('popstate', resetPageCache);
  window.addEventListener('pagehide', resetPageCache);
  startCommandInput();
})();

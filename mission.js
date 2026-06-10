/* ============================================================
   MissionService — общая доска миссий "Rise of the Republic"
   Хранилище: Firebase Realtime Database (общее для всех игроков).
   Если Firebase config не вставлен — сервис автоматически работает
   в локальном режиме (localStorage), чтобы сайт открывался и без
   настройки. Индикатор на странице покажет "LOCAL".

   Статусы миссии:
     available — свободна
     locked    — занята игроком (lockedBy / lockedAt)
     pending   — игрок отправил отчёт, ждёт подтверждения GM (notes)
     completed — подтверждена геймастером
   ============================================================ */
(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // Firebase config. Для Realtime Database достаточно databaseURL.
  // Если позже понадобится Auth/Storage — добавь остальные поля
  // из Firebase Console → Project Settings → General → Your apps.
  // ──────────────────────────────────────────────────────────
  const firebaseConfig = {
    databaseURL: "https://swrotr-default-rtdb.firebaseio.com"
  };

  const LOCK_EXPIRE_MS = 60 * 60 * 1000; // 60 минут до статуса "ПРОСРОЧЕНО"
  const STORAGE_KEY = 'cs_missions_v2';
  const LOG_KEY = 'cs_mission_logs_v1';
  const TERR_KEY = 'cs_territories_v1';
  const MAX_LOGS = 50;

  const defaultMissions = {
    'mission-alpha': {
      title: 'Захват ретранслятора',
      summary: 'Стабилизируйте башню связи и перехватите чистый поток данных.',
      difficulty: 'Высокий риск',
      reward: '750 XP + Приоритетный лут',
      status: 'available',
      order: 1
    },
    'mission-bravo': {
      title: 'Призрачная эвакуация',
      summary: 'Эвакуируйте сбитого оперативника, не активируя тепловые датчики.',
      difficulty: 'Скрытность',
      reward: '600 XP + Скрытый тайник',
      status: 'available',
      order: 2
    },
    'mission-charlie': {
      title: 'Перегрузка энергосети',
      summary: 'Отключите вражеские источники питания и перенаправьте энергию на союзные ядра.',
      difficulty: 'Технический',
      reward: '500 XP + Кредиты ядра',
      status: 'available',
      order: 3
    }
  };

  // ── Фракции для карты территорий (добавляй новые здесь) ────
  // type: 'gang' | 'gov' | 'trade' | 'neutral' — используется фильтрами на карте
  const FACTIONS = {
    neutral: { name: 'Нейтральная',       type: 'neutral', color: '#8a93ad', emblem: '⚪' },
    pdc:     { name: 'Police Department', type: 'gov',     color: '#4da6ff', emblem: '🛡️' },
    bounty:  { name: 'Bounty Hunters',    type: 'gang',    color: '#ff5544', emblem: '💀' },
    traders: { name: 'Торговая Гильдия',  type: 'trade',   color: '#FFD700', emblem: '💰' },
    mercs:   { name: 'Независимые Наёмники', type: 'merc', color: '#a86bff', emblem: '⚔️' },
    family:  { name: 'Семья Trehkorochkin',  type: 'gang', color: '#ff4d9d', emblem: '🎩' }
  };

  // ── Территории города (владельцев меняет GM из admin.html) ─
  const defaultTerritories = {
    port:       { name: 'Зона Порта',              map: 1, owner: 'traders', status: 'controlled' },
    industrial: { name: 'Индустриальная Зона',     map: 1, owner: 'neutral', status: 'controlled' },
    highway:    { name: 'Магистральный Путь',      map: 1, owner: 'neutral', status: 'controlled' },
    police:     { name: 'Полицейский Департамент', map: 1, owner: 'pdc',     status: 'controlled' },
    bank:       { name: 'Центральный Банк',        map: 1, owner: 'pdc',     status: 'controlled' },
    free:       { name: 'Свободный Сектор',        map: 1, owner: 'neutral', status: 'contested' },
    baraholka:  { name: 'Барахолка',               map: 2, owner: 'traders', status: 'controlled' },
    club:       { name: 'Клуб Из Семи Залуп',      map: 2, owner: 'bounty',  status: 'controlled' },
    customs:    { name: 'Таможня',                 map: 2, owner: 'pdc',     status: 'controlled' },
    terminal:   { name: 'Терминал',                map: 2, owner: 'traders', status: 'controlled' },
    skupshik:   { name: 'Скупщик',                 map: 2, owner: 'neutral', status: 'controlled' }
  };

  // ───────────────────────── Общее состояние ─────────────────

  let cache = [];          // актуальный список миссий (массив)
  let logsCache = [];      // последние записи журнала
  let terrCache = {};      // территории карты (id -> {name, map, owner, status})
  let connState = 'offline'; // 'online' | 'offline' | 'local'

  const missionSubs = [];
  const connSubs = [];
  const logSubs = [];
  const terrSubs = [];

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const notifyMissions = () => missionSubs.forEach((fn) => {
    try { fn(clone(cache)); } catch (err) { console.error('Mission subscriber error', err); }
  });
  const notifyLogs = () => logSubs.forEach((fn) => {
    try { fn(clone(logsCache)); } catch (err) { console.error('Log subscriber error', err); }
  });
  const notifyTerr = () => terrSubs.forEach((fn) => {
    try { fn(clone(terrCache)); } catch (err) { console.error('Territory subscriber error', err); }
  });

  // дополняем сохранённые территории дефолтами — новые зоны из кода
  // появятся даже если в базе лежит старый набор
  const mergeTerritories = (val) => {
    const out = {};
    Object.keys(defaultTerritories).forEach((id) => {
      out[id] = { ...defaultTerritories[id], ...((val && val[id]) || {}) };
    });
    return out;
  };
  const setConn = (state) => {
    connState = state;
    connSubs.forEach((fn) => {
      try { fn(connState); } catch (err) { console.error('Connection subscriber error', err); }
    });
  };

  // Firebase не хранит null-поля, поэтому приводим записи к полной форме
  const normalize = (id, raw) => ({
    id,
    title: raw.title || 'Без названия',
    summary: raw.summary || '',
    difficulty: raw.difficulty || 'Standard',
    reward: raw.reward || 'XP',
    status: raw.status || 'available',
    lockedBy: raw.lockedBy || null,
    lockedAt: raw.lockedAt || null,
    notes: raw.notes || '',
    completedAt: raw.completedAt || null,
    order: raw.order || 0
  });

  const toList = (map) => Object.keys(map || {})
    .map((id) => normalize(id, map[id]))
    .sort((a, b) => a.order - b.order);

  const makeId = () => 'mission-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ───────────────────────── Firebase backend ────────────────

  function createFirebaseBackend() {
    const db = firebase.database();
    const missionsRef = db.ref('missions');
    const logsRef = db.ref('logs');

    missionsRef.on('value', (snap) => {
      const val = snap.val();
      if (!val) {
        // первая инициализация базы — заливаем стартовый набор
        missionsRef.set(clone(defaultMissions));
        return;
      }
      cache = toList(val);
      notifyMissions();
    });

    logsRef.limitToLast(MAX_LOGS).on('value', (snap) => {
      const val = snap.val() || {};
      logsCache = Object.keys(val)
        .map((key) => ({ id: key, ...val[key] }))
        .sort((a, b) => b.timestamp - a.timestamp);
      notifyLogs();
    });

    const territoriesRef = db.ref('territories');
    territoriesRef.on('value', (snap) => {
      const val = snap.val();
      if (!val) {
        // первая инициализация — заливаем стартовую расстановку
        territoriesRef.set(clone(defaultTerritories));
        return;
      }
      terrCache = mergeTerritories(val);
      notifyTerr();
    });

    db.ref('.info/connected').on('value', (snap) => {
      setConn(snap.val() ? 'online' : 'offline');
    });

    const logAction = (action, details) => {
      logsRef.push({ timestamp: Date.now(), action, details });
    };

    // Транзакция по одной миссии. mutate(current) возвращает либо новый
    // объект миссии, либо { __fail: reason } для отказа. Транзакции
    // Firebase исключают гонку, когда два игрока берут миссию одновременно.
    const runTx = (id, mutate) => new Promise((resolve) => {
      let failReason = null;
      missionsRef.child(id).transaction((current) => {
        failReason = null;
        // первый прогон может прийти с null — возвращаем null,
        // Firebase перезапустит транзакцию с реальными данными
        if (current === null) return null;
        const result = mutate(current);
        if (result && result.__fail) {
          failReason = result.__fail;
          return; // undefined = отмена транзакции
        }
        return result;
      }, (error, committed, snapshot) => {
        if (error) return resolve({ success: false, reason: 'error' });
        if (!committed) return resolve({ success: false, reason: failReason || 'conflict' });
        if (!snapshot || snapshot.val() === null) return resolve({ success: false, reason: 'not-found' });
        resolve({ success: true, mission: normalize(id, snapshot.val()) });
      });
    });

    return {
      mode: 'firebase',
      logAction,
      clearLogs: () => logsRef.remove(),

      setTerritory(id, updates) {
        const safe = {};
        ['owner', 'status'].forEach((k) => { if (updates[k] !== undefined) safe[k] = updates[k]; });
        return territoriesRef.child(id).update(safe).then(() => {
          const t = terrCache[id] || defaultTerritories[id] || { name: id };
          const f = FACTIONS[safe.owner];
          logAction('TERRITORY_UPDATE', `Территория "${t.name}": ${safe.owner ? 'владелец → ' + (f ? f.name : safe.owner) : ''}${safe.status ? ' статус → ' + (safe.status === 'contested' ? 'оспаривается' : 'контролируется') : ''}`);
          return { success: true };
        });
      },

      // Транзакция по всему списку миссий: атомарно проверяем, что у
      // игрока нет другой активной миссии (правило "1 Game ID = 1 миссия"),
      // и что миссия свободна. Гонки двух вкладок/игроков исключены.
      lockMission(id, playerId) {
        if (!playerId) return Promise.resolve({ success: false, reason: 'missing-player' });
        return new Promise((resolve) => {
          let failReason = null;
          let busyTitle = null;
          missionsRef.transaction((all) => {
            failReason = null;
            busyTitle = null;
            if (all === null) return all; // первый прогон без данных — Firebase перезапустит
            const m = all[id];
            if (!m) { failReason = 'not-found'; return; }
            if (m.status === 'locked' && m.lockedBy === playerId) return all; // уже твоя
            if (m.status !== 'available') {
              failReason = m.status === 'locked' ? 'locked-by-other' : 'wrong-status';
              return;
            }
            const activeId = Object.keys(all).find((k) =>
              all[k] && all[k].status === 'locked' && all[k].lockedBy === playerId);
            if (activeId) {
              failReason = 'already-has-mission';
              busyTitle = all[activeId].title || '';
              return;
            }
            return {
              ...all,
              [id]: { ...m, status: 'locked', lockedBy: playerId, lockedAt: Date.now(), notes: null, completedAt: null }
            };
          }, (error, committed, snapshot) => {
            if (error) return resolve({ success: false, reason: 'error' });
            if (!committed) return resolve({ success: false, reason: failReason || 'conflict', busyTitle });
            const val = snapshot && snapshot.val();
            const m = val && val[id];
            if (!m) return resolve({ success: false, reason: 'not-found' });
            if (m.lockedBy !== playerId) return resolve({ success: false, reason: 'locked-by-other' });
            logAction('MISSION_LOCK', `Миссия "${m.title}" занята игроком ${playerId}`);
            resolve({ success: true, mission: normalize(id, m) });
          });
        });
      },

      // GM засчитывает миссию напрямую (проверил выполнение в игре)
      forceCompleteMission(id) {
        return runTx(id, (m) => {
          if (m.status !== 'locked' && m.status !== 'pending') return { __fail: 'wrong-status' };
          return { ...m, status: 'completed', completedAt: m.completedAt || Date.now() };
        }).then((res) => {
          if (res.success) logAction('MISSION_APPROVE', `GM засчитал миссию "${res.mission.title}" (игрок ${res.mission.lockedBy})`);
          return res;
        });
      },

      releaseMission(id, playerId) {
        return runTx(id, (m) => {
          if (m.status === 'available') return m;
          // playerId == null означает принудительное освобождение (админ)
          if (playerId && m.lockedBy && m.lockedBy !== playerId) {
            return { __fail: 'locked-by-other' };
          }
          return { ...m, status: 'available', lockedBy: null, lockedAt: null, notes: null, completedAt: null };
        }).then((res) => {
          if (res.success) logAction('MISSION_RELEASE', `Миссия "${res.mission.title}" освобождена`);
          return res;
        });
      },

      completeMission(id, playerId, notes) {
        if (!playerId) return Promise.resolve({ success: false, reason: 'missing-player' });
        return runTx(id, (m) => {
          if (m.status !== 'locked') return { __fail: 'wrong-status' };
          if (m.lockedBy !== playerId) return { __fail: 'locked-by-other' };
          return { ...m, status: 'pending', notes: (notes || '').trim(), completedAt: Date.now() };
        }).then((res) => {
          if (res.success) logAction('MISSION_PENDING', `Игрок ${playerId} отправил миссию "${res.mission.title}" на проверку`);
          return res;
        });
      },

      approveMission(id) {
        return runTx(id, (m) => {
          if (m.status !== 'pending') return { __fail: 'wrong-status' };
          return { ...m, status: 'completed' };
        }).then((res) => {
          if (res.success) logAction('MISSION_APPROVE', `Миссия "${res.mission.title}" подтверждена GM (игрок ${res.mission.lockedBy})`);
          return res;
        });
      },

      rejectMission(id) {
        return runTx(id, (m) => {
          if (m.status !== 'pending') return { __fail: 'wrong-status' };
          return { ...m, status: 'available', lockedBy: null, lockedAt: null, notes: null, completedAt: null };
        }).then((res) => {
          if (res.success) logAction('MISSION_REJECT', `Миссия "${res.mission.title}" отклонена GM и возвращена на доску`);
          return res;
        });
      },

      addMission(data) {
        const id = data.id || makeId();
        const mission = {
          title: (data.title || '').trim() || 'Untitled Mission',
          summary: (data.summary || '').trim(),
          difficulty: data.difficulty || 'Standard',
          reward: data.reward || 'XP',
          status: 'available',
          order: Date.now()
        };
        return missionsRef.child(id).set(mission).then(() => {
          logAction('MISSION_CREATE', `Создана миссия: ${mission.title}`);
          return { success: true };
        });
      },

      updateMission(id, updates) {
        const safe = {};
        ['title', 'summary', 'difficulty', 'reward'].forEach((key) => {
          if (updates[key] !== undefined) safe[key] = updates[key];
        });
        return missionsRef.child(id).update(safe).then(() => {
          logAction('MISSION_UPDATE', `Обновлена миссия: ${safe.title || id}`);
          return { success: true };
        });
      },

      removeMission(id) {
        const mission = cache.find((m) => m.id === id);
        return missionsRef.child(id).remove().then(() => {
          if (mission) logAction('MISSION_DELETE', `Удалена миссия: ${mission.title}`);
          return { success: true };
        });
      },

      reset() {
        return missionsRef.set(clone(defaultMissions)).then(() => {
          logAction('SYSTEM_RESET', 'Сброс всех миссий к начальным настройкам');
          return { success: true };
        });
      }
    };
  }

  // ───────────────────── Локальный fallback (localStorage) ────

  function createLocalBackend() {
    const loadMap = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch (err) { return null; }
    };
    const saveMap = (m) => localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    const loadLogs = () => {
      try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; }
      catch (err) { return []; }
    };
    const saveLogs = (l) => localStorage.setItem(LOG_KEY, JSON.stringify(l));

    const loadTerr = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(TERR_KEY));
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch (err) { return null; }
    };
    const saveTerr = (t) => localStorage.setItem(TERR_KEY, JSON.stringify(t));

    let map = loadMap();
    if (!map) { map = clone(defaultMissions); saveMap(map); }
    let logs = loadLogs();
    let terrMap = loadTerr() || clone(defaultTerritories);

    const sync = () => { cache = toList(map); notifyMissions(); };
    const syncLogs = () => { logsCache = clone(logs); notifyLogs(); };
    const syncTerr = () => { terrCache = mergeTerritories(terrMap); notifyTerr(); };

    // синхронизация между вкладками одного браузера
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) { map = loadMap() || {}; sync(); }
      if (e.key === LOG_KEY) { logs = loadLogs(); syncLogs(); }
      if (e.key === TERR_KEY) { terrMap = loadTerr() || {}; syncTerr(); }
    });

    const logAction = (action, details) => {
      logs.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        timestamp: Date.now(),
        action,
        details
      });
      if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
      saveLogs(logs);
      syncLogs();
    };

    const commit = (mission, action, details) => {
      saveMap(map);
      sync();
      if (action) logAction(action, details);
      return Promise.resolve({ success: true, mission: clone(mission) });
    };
    const fail = (reason) => Promise.resolve({ success: false, reason });

    cache = toList(map);
    logsCache = clone(logs);
    terrCache = mergeTerritories(terrMap);
    connState = 'local';

    return {
      mode: 'local',
      logAction,
      clearLogs: () => { logs = []; saveLogs(logs); syncLogs(); return Promise.resolve({ success: true }); },

      setTerritory(id, updates) {
        if (!defaultTerritories[id]) return fail('not-found');
        if (!terrMap[id]) terrMap[id] = clone(defaultTerritories[id]);
        ['owner', 'status'].forEach((k) => { if (updates[k] !== undefined) terrMap[id][k] = updates[k]; });
        saveTerr(terrMap);
        syncTerr();
        const t = terrCache[id];
        const f = FACTIONS[t.owner];
        logAction('TERRITORY_UPDATE', `Территория "${t.name}": владелец → ${f ? f.name : t.owner}, статус → ${t.status === 'contested' ? 'оспаривается' : 'контролируется'}`);
        return Promise.resolve({ success: true });
      },

      lockMission(id, playerId) {
        if (!playerId) return fail('missing-player');
        const m = map[id];
        if (!m) return fail('not-found');
        if (m.status === 'locked' && m.lockedBy === playerId) return Promise.resolve({ success: true, mission: clone(m) });
        if (m.status !== 'available') return fail(m.status === 'locked' ? 'locked-by-other' : 'wrong-status');
        // правило "1 Game ID = 1 активная миссия"
        const activeId = Object.keys(map).find((k) =>
          k !== id && map[k].status === 'locked' && map[k].lockedBy === playerId);
        if (activeId) {
          return Promise.resolve({ success: false, reason: 'already-has-mission', busyTitle: map[activeId].title || '' });
        }
        Object.assign(m, { status: 'locked', lockedBy: playerId, lockedAt: Date.now(), notes: '', completedAt: null });
        return commit(m, 'MISSION_LOCK', `Миссия "${m.title}" занята игроком ${playerId}`);
      },

      forceCompleteMission(id) {
        const m = map[id];
        if (!m) return fail('not-found');
        if (m.status !== 'locked' && m.status !== 'pending') return fail('wrong-status');
        m.status = 'completed';
        if (!m.completedAt) m.completedAt = Date.now();
        return commit(m, 'MISSION_APPROVE', `GM засчитал миссию "${m.title}" (игрок ${m.lockedBy})`);
      },

      releaseMission(id, playerId) {
        const m = map[id];
        if (!m) return fail('not-found');
        if (m.status === 'available') return Promise.resolve({ success: true, mission: clone(m) });
        if (playerId && m.lockedBy && m.lockedBy !== playerId) return fail('locked-by-other');
        Object.assign(m, { status: 'available', lockedBy: null, lockedAt: null, notes: '', completedAt: null });
        return commit(m, 'MISSION_RELEASE', `Миссия "${m.title}" освобождена`);
      },

      completeMission(id, playerId, notes) {
        if (!playerId) return fail('missing-player');
        const m = map[id];
        if (!m) return fail('not-found');
        if (m.status !== 'locked') return fail('wrong-status');
        if (m.lockedBy !== playerId) return fail('locked-by-other');
        Object.assign(m, { status: 'pending', notes: (notes || '').trim(), completedAt: Date.now() });
        return commit(m, 'MISSION_PENDING', `Игрок ${playerId} отправил миссию "${m.title}" на проверку`);
      },

      approveMission(id) {
        const m = map[id];
        if (!m) return fail('not-found');
        if (m.status !== 'pending') return fail('wrong-status');
        m.status = 'completed';
        return commit(m, 'MISSION_APPROVE', `Миссия "${m.title}" подтверждена GM (игрок ${m.lockedBy})`);
      },

      rejectMission(id) {
        const m = map[id];
        if (!m) return fail('not-found');
        if (m.status !== 'pending') return fail('wrong-status');
        Object.assign(m, { status: 'available', lockedBy: null, lockedAt: null, notes: '', completedAt: null });
        return commit(m, 'MISSION_REJECT', `Миссия "${m.title}" отклонена GM и возвращена на доску`);
      },

      addMission(data) {
        const id = data.id || makeId();
        map[id] = {
          title: (data.title || '').trim() || 'Untitled Mission',
          summary: (data.summary || '').trim(),
          difficulty: data.difficulty || 'Standard',
          reward: data.reward || 'XP',
          status: 'available',
          order: Date.now()
        };
        return commit(map[id], 'MISSION_CREATE', `Создана миссия: ${map[id].title}`);
      },

      updateMission(id, updates) {
        const m = map[id];
        if (!m) return fail('not-found');
        ['title', 'summary', 'difficulty', 'reward'].forEach((key) => {
          if (updates[key] !== undefined) m[key] = updates[key];
        });
        return commit(m, 'MISSION_UPDATE', `Обновлена миссия: ${m.title}`);
      },

      removeMission(id) {
        const m = map[id];
        if (!m) return fail('not-found');
        const title = m.title;
        delete map[id];
        return commit(null, 'MISSION_DELETE', `Удалена миссия: ${title}`);
      },

      reset() {
        map = clone(defaultMissions);
        return commit(null, 'SYSTEM_RESET', 'Сброс всех миссий к начальным настройкам');
      }
    };
  }

  // ───────────────────────── Выбор backend ───────────────────

  let backend;
  const configured = typeof firebase !== 'undefined' &&
    firebaseConfig.databaseURL &&
    firebaseConfig.databaseURL.indexOf('your-project') === -1;

  if (configured) {
    try {
      firebase.initializeApp(firebaseConfig);
      backend = createFirebaseBackend();
    } catch (err) {
      console.warn('Firebase init failed — переключаюсь на localStorage', err);
      backend = createLocalBackend();
    }
  } else {
    if (typeof firebase === 'undefined') {
      console.info('Firebase SDK не подключён — MissionService работает локально.');
    } else {
      console.info('Firebase config не заполнен — MissionService работает локально. Вставь config в mission.js.');
    }
    backend = createLocalBackend();
  }

  // ───────────────────────── Публичное API ───────────────────

  const unsubscriber = (arr, fn) => () => {
    const idx = arr.indexOf(fn);
    if (idx !== -1) arr.splice(idx, 1);
  };

  window.MissionService = {
    LOCK_EXPIRE_MS,
    getMode: () => backend.mode,

    // снимок текущего списка (синхронно, из кэша)
    getAll: () => clone(cache),
    getLogs: () => clone(logsCache),

    // реалтайм-подписки; колбэк вызывается сразу с текущим состоянием
    subscribe(fn) { missionSubs.push(fn); fn(clone(cache)); return unsubscriber(missionSubs, fn); },
    subscribeLogs(fn) { logSubs.push(fn); fn(clone(logsCache)); return unsubscriber(logSubs, fn); },
    onConnectionChange(fn) { connSubs.push(fn); fn(connState); return unsubscriber(connSubs, fn); },

    // все мутации возвращают Promise<{success, reason?, mission?}>
    lockMission: (id, playerId) => backend.lockMission(id, playerId),
    releaseMission: (id, playerId) => backend.releaseMission(id, playerId),
    completeMission: (id, playerId, notes) => backend.completeMission(id, playerId, notes),
    approveMission: (id) => backend.approveMission(id),
    rejectMission: (id) => backend.rejectMission(id),
    forceCompleteMission: (id) => backend.forceCompleteMission(id),
    addMission: (data) => backend.addMission(data),
    updateMission: (id, updates) => backend.updateMission(id, updates),
    removeMission: (id) => backend.removeMission(id),
    reset: () => backend.reset(),
    logAction: (action, details) => backend.logAction(action, details),
    clearLogs: () => backend.clearLogs()
  };

  // ── Сервис территорий (карта города, sector1.html + admin.html) ──
  window.TerritoryService = {
    FACTIONS: clone(FACTIONS),
    getAll: () => clone(terrCache),
    subscribe(fn) { terrSubs.push(fn); fn(clone(terrCache)); return unsubscriber(terrSubs, fn); },
    setTerritory: (id, updates) => backend.setTerritory(id, updates)
  };
})();

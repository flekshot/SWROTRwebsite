(function () {
  const STORAGE_KEY = 'cs_missions_v1';

  const defaultMissions = [
    {
      id: 'mission-alpha',
      title: 'Захват ретранслятора',
      summary: 'Стабилизируйте башню связи и перехватите чистый поток данных.',
      difficulty: 'Высокий риск',
      reward: '750 XP + Приоритетный лут',
      status: 'available',
      lockedBy: null,
      lockedAt: null
    },
    {
      id: 'mission-bravo',
      title: 'Призрачная эвакуация',
      summary: 'Эвакуируйте сбитого оперативника, не активируя тепловые датчики.',
      difficulty: 'Скрытность',
      reward: '600 XP + Скрытый тайник',
      status: 'available',
      lockedBy: null,
      lockedAt: null
    },
    {
      id: 'mission-charlie',
      title: 'Перегрузка энергосети',
      summary: 'Отключите вражеские источники питания и перенаправьте энергию на союзные ядра.',
      difficulty: 'Технический',
      reward: '500 XP + Кредиты ядра',
      status: 'available',
      lockedBy: null,
      lockedAt: null
    }
  ];

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const save = (list) => localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

  const load = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (err) {
      console.warn('Mission storage parse failed', err);
      return null;
    }
  };

  const ensureList = () => {
    const cached = load();
    if (cached && Array.isArray(cached)) {
      return cached;
    }
    const seeded = clone(defaultMissions);
    save(seeded);
    return seeded;
  };

  const persist = (list) => {
    save(list);
    return clone(list);
  };

  const getAll = () => clone(ensureList());

  const addMission = (data) => {
    const list = ensureList();
    const id = data.id || `mission-${Date.now()}`;
    const mission = {
      id,
      title: data.title?.trim() || 'Untitled Mission',
      summary: data.summary?.trim() || '',
      difficulty: data.difficulty || 'Standard',
      reward: data.reward || 'XP',
      status: 'available',
      lockedBy: null,
      lockedAt: null
    };
    list.push(mission);
    persist(list);
    return mission;
  };

  const updateMission = (id, updates) => {
    const list = ensureList();
    const idx = list.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    list[idx] = {
      ...list[idx],
      ...updates,
      id: list[idx].id
    };
    persist(list);
    return list[idx];
  };

  const removeMission = (id) => {
    const list = ensureList().filter((m) => m.id !== id);
    persist(list);
    return true;
  };

  const lockMission = (id, playerId) => {
    if (!playerId) return { success: false, reason: 'missing-player' };
    const list = ensureList();
    const mission = list.find((m) => m.id === id);
    if (!mission) return { success: false, reason: 'not-found' };
    if (mission.status === 'locked' && mission.lockedBy && mission.lockedBy !== playerId) {
      return { success: false, reason: 'locked-by-other', mission };
    }
    mission.status = 'locked';
    mission.lockedBy = playerId;
    mission.lockedAt = Date.now();
    persist(list);
    return { success: true, mission };
  };

  const releaseMission = (id, playerId) => {
    const list = ensureList();
    const mission = list.find((m) => m.id === id);
    if (!mission) return { success: false, reason: 'not-found' };
    if (mission.status === 'locked' && mission.lockedBy && playerId && mission.lockedBy !== playerId) {
      return { success: false, reason: 'locked-by-other', mission };
    }
    mission.status = 'available';
    mission.lockedBy = null;
    mission.lockedAt = null;
    persist(list);
    return { success: true, mission };
  };

  const reset = () => persist(clone(defaultMissions));

  window.MissionService = {
    getAll,
    addMission,
    updateMission,
    removeMission,
    lockMission,
    releaseMission,
    reset
  };
})();

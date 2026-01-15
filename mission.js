(function () {
  const STORAGE_KEY = 'cs_missions_v1';

  const defaultMissions = [
    {
      id: 'mission-alpha',
      title: 'Secure the Relay',
      summary: 'Stabilize the uplink tower and capture a clean data stream.',
      difficulty: 'High Risk',
      reward: '750 XP + Priority Loot',
      status: 'available',
      lockedBy: null,
      lockedAt: null
    },
    {
      id: 'mission-bravo',
      title: 'Ghost Extraction',
      summary: 'Extract a downed operative without triggering thermal sensors.',
      difficulty: 'Stealth',
      reward: '600 XP + Stealth Cache',
      status: 'available',
      lockedBy: null,
      lockedAt: null
    },
    {
      id: 'mission-charlie',
      title: 'Power Grid Override',
      summary: 'Cut hostile power feeds and reroute to friendly cores.',
      difficulty: 'Technical',
      reward: '500 XP + Core Credits',
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

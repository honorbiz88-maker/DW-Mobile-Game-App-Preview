'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const cloudSource = fs.readFileSync(path.join(__dirname, '..', 'firebase-cloud.js'), 'utf8');

// Compile the real production function body from game.js with controlled dependencies.
// This exercises game logic without booting or rewriting the browser application.
function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing game function: ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse function body: ${name}`);
}

function gameFunction(name, dependencies = {}) {
  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return new Function(...names, `return (${extractFunction(name)});`)(...values);
}

test('cloud queue is scoped to the authenticated owner and cannot cross accounts', () => {
  const match = cloudSource.match(/function pendingBelongsToUser\(pending, user\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'Missing account-scoped pending-save guard');
  const belongs = new Function(`return (${match[0]});`)();
  assert.equal(belongs({ uid: 'account-A', payload: { cash: 10 } }, { uid: 'account-A' }), true);
  assert.equal(belongs({ uid: 'account-A', payload: { cash: 10 } }, { uid: 'account-B' }), false);
  assert.equal(belongs({ uid: 'account-A' }, null), false);
  assert.match(cloudSource, /currentUser\.uid !== expectedUid/);
  assert.match(cloudSource, /pendingBelongsToUser\(pendingPayload, currentUser\)/);
});

test('account sign-in never replaces a different established local career', () => {
  const start = cloudSource.indexOf('if (local?.ownerUid && local.ownerUid !== user.uid)');
  const end = cloudSource.indexOf('const cloud = snap.exists()', start);
  assert.ok(start >= 0 && end > start);
  const guard = cloudSource.slice(start, end);
  assert.match(guard, /showConflict\(local.raw, cloudData, local.ownerUid\)/);
  assert.match(guard, /return;/);
  assert.doesNotMatch(guard, /restoreCloudCareer|localStorage\.setItem\(LOCAL_KEY|location\.reload/);
});

test('local gameplay saves remain independent from cloud connectivity', () => {
  const save = extractFunction('saveState');
  assert.match(save, /localStorage\.setItem\('delwin_v4_save', JSON\.stringify\(state\)\)/);
  assert.match(save, /window\.DelWinCloud\.queueSave/);
  assert.match(save, /reportLocalSaveError/);
  assert.doesNotMatch(save, /await |getDoc|runTransaction/);
});

test('standard tire purchase deducts cash and persists inventory in the same local-first checkpoint', () => {
  const state = { cash: 200, stdTires: 0, hdTires: 0, plugs: 0 };
  const saves = [];
  let hudUpdates = 0;
  const purchase = gameFunction('buyStock', {
    state,
    getActiveRigObj: () => ({ name: 'Starter Rig', capStd: 3, capHd: 1, capPlugs: 6 }),
    getStockPricing: () => ({ stdCost: 45, hdCost: 95, plugPackCost: 20, plugPackQty: 3 }),
    SoundFX: { torqueClick: () => {} },
    saveState: checkpoint => saves.push({ checkpoint, cash: state.cash, stdTires: state.stdTires }),
    updateHUD: () => { hudUpdates += 1; },
    showAlert: () => { throw new Error('Unexpected purchase alert'); }
  });
  purchase('std');
  assert.equal(state.cash, 155);
  assert.equal(state.stdTires, 1);
  assert.deepEqual(saves, [{ checkpoint: 'purchase', cash: 155, stdTires: 1 }]);
  assert.equal(hudUpdates, 1);
});

test('local storage failure is surfaced instead of silently treating gameplay as saved', () => {
  let reported = null;
  const errors = [];
  const save = gameFunction('saveState', {
    state: { cash: 100 },
    window: { DelWinCloud: { reportLocalSaveError: error => { reported = error; } } },
    localStorage: { setItem: () => { throw new Error('quota exceeded'); } },
    console: { error: (...args) => errors.push(args) }
  });
  save();
  assert.match(reported.message, /quota exceeded/);
  assert.equal(errors.length, 1);
});

test('durable outbox is persisted before network work and cleared only after matching acknowledgement', () => {
  const queueStart = cloudSource.indexOf('function queueSave(');
  const queueEnd = cloudSource.indexOf('function isRestorePending()', queueStart);
  const queue = cloudSource.slice(queueStart, queueEnd);
  const persist = queue.indexOf('persistDurableOutbox(ownerUid, payload, checkpointType)');
  const pending = queue.indexOf('pendingPayload = { uid: queuedUid');
  assert.ok(queueStart >= 0 && queueEnd > queueStart && persist >= 0 && pending > persist);
  assert.match(cloudSource, /clearDurableOutboxIfMatches\(expectedUid, next\)/);
  assert.match(cloudSource, /queued\?\.uid === uid && sameValue\(queued.payload, payload\)/);
});

test('only a device without an established local career restores an account cloud save', () => {
  const start = cloudSource.indexOf('if (!local && cloud)');
  const end = cloudSource.indexOf('// Brand-new account and device', start);
  assert.ok(start >= 0 && end > start);
  assert.match(cloudSource.slice(start, end), /localStorage\.setItem\(LOCAL_KEY, JSON\.stringify\(cloud.payload\)\)/);
  assert.match(cloudSource.slice(start, end), /location\.reload\(\)/);
});

test('cloud writes use revision compare-and-set and retain failed snapshots for retry', () => {
  assert.match(cloudSource, /async function writeCloud\(payload, expectedUid = currentUser\?\.uid/);
  assert.match(cloudSource, /actualRevision !== expectedRevision/);
  assert.match(cloudSource, /save\/revision-conflict/);
  assert.match(cloudSource, /retryDelay = 5000/);
  assert.match(cloudSource, /retrying automatically/);
});

test('stock pricing scales with rig and territory multipliers', () => {
  const pricing = gameFunction('getStockPricing', {
    getActiveRigObj: () => ({ mult: 1.12 }),
    getZone: () => ({ mult: 1.25 })
  })();
  const scale = 1 + ((1.12 * 1.25) - 1) * 0.55;
  assert.deepEqual(pricing, {
    plugPackCost: Math.round(20 * scale),
    plugPackQty: 3,
    stdCost: Math.round(45 * scale),
    hdCost: Math.round(95 * scale)
  });
});

test('partial plug restock estimate uses marginal per-kit cost and respects cargo cap', () => {
  const estimate = gameFunction('getSupplyReplacementCost', {
    state: { plugs: 5 },
    getActiveRigObj: () => ({ capPlugs: 6, mult: 1 }),
    getStockPricing: () => ({ plugPackCost: 20, plugPackQty: 3, stdCost: 45, hdCost: 95 })
  });
  assert.equal(estimate({ dmg: { action: 'plug' } }), 7);
  assert.equal(estimate({ dmg: { action: 'swap' }, veh: { heavy: true } }), 95);
  assert.equal(estimate({ dmg: { action: 'swap' }, veh: { heavy: false } }), 45);
  assert.equal(estimate(null), 0);
});

test('quoted fleet overhead is preserved; new quotes include heavy and rig factors', () => {
  const calc = gameFunction('getFleetOverheadFee', {
    getActiveRigObj: () => ({ mult: 1.12 }),
    getZone: () => ({ mult: 1.25 }),
    getRigConditionSurcharge: () => 0.10
  });
  assert.equal(calc({ operatingOverhead: 77, veh: { heavy: true } }), 77);
  assert.equal(calc({ veh: { heavy: true } }), Math.round(12 * 1.12 * 1.25 * 1.25 * 1.10));
  assert.equal(calc({ veh: { heavy: false } }), Math.round(12 * 1.12 * 1.25 * 1.10));
});

test('clean-streak Gear reward only pays at 20-call intervals', () => {
  const reward = gameFunction('getStreakGearReward', {
    CLEAN_STREAK_GEAR_INTERVAL: 20,
    STREAK_GEAR_MILESTONES: { 20: 1 }
  });
  for (const count of [0, 1, 3, 6, 9, 12, 15, 19, 21, 39]) assert.equal(reward(count), 0);
  assert.equal(reward(20), 1);
  assert.equal(reward(40), 1);
});

test('tool breakthrough Gear costs match the approved five milestone tiers', () => {
  const expected = new Map([[4, 1], [8, 2], [12, 3], [16, 4], [20, 5]]);
  for (const [level, gears] of expected) {
    const spec = gameFunction('getToolUpgradeSpec', {
      state: { tools: { jack: { level, baseCost: 100 } } }
    })('jack');
    assert.equal(spec.gears, gears, `level ${level}`);
    assert.equal(spec.isBreakthrough, true);
  }
  const ordinary = gameFunction('getToolUpgradeSpec', {
    state: { tools: { jack: { level: 5, baseCost: 100 } } }
  })('jack');
  assert.equal(ordinary.gears, 0);
  assert.equal(ordinary.isBreakthrough, false);
});

test('dispatch risk score adds the disclosed risk factors', () => {
  const score = gameFunction('getDispatchRiskScore', {
    WEATHER_CONDITIONS: [{ id: 'clear' }]
  });
  assert.equal(score({ isRusted: true, hasWheelLock: true, weather: { id: 'rain' }, veh: { heavy: true }, vip: true }), 7);
  assert.equal(score({ weather: { id: 'clear' }, veh: { heavy: false } }), 0);
});

test('wheel chocks cannot be set before traffic cones; the safety penalty remains', () => {
  const state = { activeJob: { step: 1, conesSet: false, chocked: false } };
  let penalty = null;
  let alert = null;
  const action = gameFunction('setChocks', {
    state,
    addBayPenalty: (...args) => { penalty = args; },
    showAlert: (...args) => { alert = args; },
    renderBay: () => {},
    dismissAlert: () => {},
    SoundFX: { chock: () => {} }
  });
  action();
  assert.equal(state.activeJob.chocked, false);
  assert.equal(penalty[1], 10);
  assert.match(alert[0], /CONE ALERT/);
});

test('diagnostic scan is stage-gated and cannot be repeated', () => {
  const job = { step: 2, scanned: false };
  let hints = 0;
  let alerts = 0;
  const action = gameFunction('runScan', {
    state: { activeJob: job },
    showBayActionHint: () => { hints += 1; },
    showAlert: () => { alerts += 1; },
    SoundFX: { scan: () => {} },
    renderBay: () => {}
  });
  action();
  assert.equal(hints, 1);
  assert.equal(job.scanned, false);
  job.step = 3;
  action();
  assert.equal(job.scanned, true);
  action();
  assert.equal(alerts, 1);
});

test('repair requires scan, rejects the wrong repair, then consumes exactly one correct kit', () => {
  const job = { step: 3, scanned: false, fixed: false, dmg: { action: 'plug' }, veh: { heavy: false } };
  const state = { activeJob: job, plugs: 2, stdTires: 1, hdTires: 0 };
  const alerts = [];
  const action = gameFunction('performRepair', {
    state,
    showBayActionHint: () => {},
    showAlert: (title) => alerts.push(title),
    addBayPenalty: () => {},
    dismissAlert: () => {},
    SoundFX: { impact: () => {} },
    document: { getElementById: () => ({ classList: { add: () => {}, remove: () => {} } }) },
    setTimeout: () => {},
    updateHUD: () => {},
    renderBay: () => {}
  });
  action('plug');
  assert.equal(job.fixed, false);
  assert.equal(state.plugs, 2);
  assert.match(alerts.at(-1), /SCAN THE TIRE FIRST/);
  job.scanned = true;
  action('swap');
  assert.equal(job.fixed, false);
  assert.equal(state.plugs, 2);
  action('plug');
  assert.equal(job.fixed, true);
  assert.equal(job.step, 4);
  assert.equal(state.plugs, 1);
});

test('repair cannot consume stock when the required supply is unavailable', () => {
  const job = { step: 3, scanned: true, fixed: false, dmg: { action: 'swap' }, veh: { heavy: true } };
  const state = { activeJob: job, plugs: 1, stdTires: 1, hdTires: 0 };
  let alert = '';
  const action = gameFunction('performRepair', {
    state,
    showBayActionHint: () => {},
    showAlert: (title) => { alert = title; },
    addBayPenalty: () => {},
    dismissAlert: () => {},
    SoundFX: { impact: () => {} },
    document: { getElementById: () => ({ classList: { add: () => {}, remove: () => {} } }) },
    setTimeout: () => {},
    updateHUD: () => {},
    renderBay: () => {}
  });
  action('swap');
  assert.equal(job.fixed, false);
  assert.equal(state.hdTires, 0);
  assert.match(alert, /OUT OF HEAVY-DUTY TIRES/);
});

test('contract career Gear is awarded exactly on every sixth claimed contract', () => {
  const state = {
    contract: { progress: 2, target: 2, rewardZoneMult: 1, rewardContractRank: 6, rewardBonusRate: 0, rewardCash: 100, rewardRep: 10, rewardTokens: 2, rewardPart: 0, title: 'Test Contract' },
    contractsCompleted: 5, cash: 0, tokens: 0, parts: 0, rep: 0
  };
  let modal = '';
  const claim = gameFunction('claimContract', {
    state,
    SoundFX: { success: () => {} },
    getZone: () => ({ mult: 1 }),
    rollNewContract: () => { state.contract = null; },
    saveState: () => {},
    updateHUD: () => {},
    renderContractBanner: () => {},
    openModal: (html) => { modal = html; }
  });
  claim();
  assert.equal(state.contractsCompleted, 6);
  assert.equal(state.parts, 1);
  assert.equal(state.cash, 100);
  assert.equal(state.tokens, 2);
  assert.equal(state.rep, 10);
  assert.match(modal, /Contract career milestone:/);
});

test('incomplete contracts cannot be claimed or grant resources', () => {
  const state = {
    contract: { progress: 1, target: 2, rewardCash: 100, rewardRep: 10, rewardTokens: 2, rewardPart: 1 },
    contractsCompleted: 5, cash: 0, tokens: 0, parts: 0, rep: 0
  };
  const claim = gameFunction('claimContract', {
    state,
    SoundFX: { success: () => { throw new Error('should not claim'); } }
  });
  claim();
  assert.equal(state.contractsCompleted, 5);
  assert.equal(state.parts, 0);
  assert.equal(state.cash, 0);
});


test('live job completion calculates payout, REP, milestone Gear, contract progress, and saves once', () => {
  const job = {
    isTutorial: false, pay: 100, surgeMultiplier: 1.5,
    timeLeft: 60, timeLimit: 100, penalties: 10, repPenalties: 6,
    baseRep: 40, dmg: { action: 'plug' }, veh: { heavy: false },
    fixed: true, step: 5, torqueIdx: 5, jackLowered: true, title: 'Regression Roadside Call', penaltyLog: []
  };
  const state = {
    activeJob: job, cash: 500, rep: 20, jobsCompleted: 9, parts: 0,
    rigCondition: 100, streak: 7, claimedCareerGearMilestones: [],
    contract: { type: 'fast', progress: 0, target: 1 },
    ratings: [], jobs: []
  };
  let saves = 0;
  let hudUpdates = 0;
  let invoice = '';
  const finish = gameFunction('completeJob', {
    state,
    stopHoldPsi: () => {},
    SoundFX: { success: () => {} },
    getFleetOverheadFee: () => 12,
    getZone: () => ({ mult: 1 }),
    getStreakGearReward: () => 0,
    MAX_STREAK_ROLLOVER: 20,
    refreshJobs: () => {},
    saveState: () => { saves += 1; },
    updateHUD: () => { hudUpdates += 1; },
    openModal: (html) => { invoice = html; }
  });

  finish();
  assert.equal(state.activeJob, null);
  assert.equal(state.cash, 636); // $150 gross + $8 fast bonus - $10 penalty - $12 overhead
  assert.equal(state.rep, 64); // 40 base + 10 fast bonus - 6 REP penalty + 20 starting REP
  assert.equal(state.jobsCompleted, 10);
  assert.equal(state.parts, 1); // call-10 career milestone only
  assert.equal(state.rigCondition, 98.5);
  assert.equal(state.contract.progress, 1);
  assert.equal(state.ratings.at(-1), 4.9);
  assert.match(invoice, /Net Collected:/);
  assert.match(invoice, /\$136/);
  assert.equal(saves, 1);
  assert.equal(hudUpdates, 1);

  finish();
  assert.equal(state.cash, 636);
  assert.equal(state.jobsCompleted, 10);
  assert.equal(saves, 1);
});

test('tool breakthrough purchase atomically charges cash and Gold Gears', () => {
  const state = {
    cash: 150, parts: 1,
    tools: { jack: { name: 'Hydraulic Jack', level: 4 } }
  };
  let saves = 0;
  let updates = 0;
  const upgrade = gameFunction('upgradeTool', {
    state,
    getToolUpgradeSpec: () => ({ cost: 100, gears: 1 }),
    previewToolTiers: {},
    SoundFX: { success: () => {} },
    saveState: () => { saves += 1; },
    updateHUD: () => { updates += 1; },
    renderGarage: () => {}
  });
  upgrade('jack');
  assert.equal(state.cash, 50);
  assert.equal(state.parts, 0);
  assert.equal(state.tools.jack.level, 5);
  assert.equal(saves, 1);
  assert.equal(updates, 1);
});

test('tool breakthrough purchase rejects missing Gear without charging cash', () => {
  const state = {
    cash: 500, parts: 0,
    tools: { jack: { name: 'Hydraulic Jack', level: 4 } }
  };
  let saves = 0;
  let alert = '';
  const upgrade = gameFunction('upgradeTool', {
    state,
    getToolUpgradeSpec: () => ({ cost: 100, gears: 1 }),
    previewToolTiers: {},
    showAlert: (title) => { alert = title; },
    SoundFX: { success: () => {} },
    saveState: () => { saves += 1; },
    updateHUD: () => {},
    renderGarage: () => {}
  });
  upgrade('jack');
  assert.equal(state.cash, 500);
  assert.equal(state.parts, 0);
  assert.equal(state.tools.jack.level, 4);
  assert.match(alert, /GOLD GEARS REQUIRED/);
  assert.equal(saves, 0);
});

test('rig commission enforces sequential tier, tool level, cash, and Gear gates before charging', () => {
  const rig = {
    name: 'Tier 2 Service Rig', reqLvl: 4, cashCost: 1800, partCost: 1,
    perk: 'Expanded fleet capacity', capStd: 4, capHd: 2, capPlugs: 6
  };
  const state = { unlockedRigTier: 1, cash: 2000, parts: 1 };
  let saves = 0;
  let updates = 0;
  const commission = gameFunction('purchaseRigTier', {
    RIG_TIERS: [null, rig],
    state,
    getMinToolLevel: () => 4,
    SoundFX: { success: () => {} },
    saveState: () => { saves += 1; },
    updateHUD: () => { updates += 1; },
    renderGarage: () => {},
    openModal: () => {}
  });
  commission(2);
  assert.equal(state.cash, 200);
  assert.equal(state.parts, 0);
  assert.equal(state.unlockedRigTier, 2);
  assert.equal(saves, 1);
  assert.equal(updates, 1);
});

test('legacy local save migration clamps and backfills fields without duplicating earned milestones', () => {
  const legacy = {
    tires: 3,
    jobsCompleted: 30,
    tools: { jack: { level: 30 } },
    rigCondition: 140,
    contractsCompleted: 'invalid',
    ratings: [],
    customerLedger: [],
    jobs: [null, { veh: {}, dmg: {} }, { veh: null, dmg: {} }],
    activeJob: { step: 3 },
    zoneId: 'missing-zone',
    contract: { type: 'fast', progress: 0, target: 3 }
  };
  const state = {
    tools: {
      impact: { level: 1 }, jack: { level: 1 },
      comp: { level: 1 }, radar: { level: 1 }
    },
    jobs: [], activeJob: null, ratings: [], customerLedger: {},
    claimedCareerGearMilestones: []
  };
  const load = gameFunction('loadState', {
    state,
    localStorage: { getItem: () => JSON.stringify(legacy) },
    ZONES: [{ id: 'z1', mult: 1 }],
    rollNewContract: () => { state.contract = { type: 'fast', progress: 0, target: 3 }; },
    canDispatchHeavyJobs: () => false,
    getZone: () => ({ mult: 1 }),
    MAX_DISPATCH_SCANS: 3,
    MAX_SURGE_CHARGES: 3,
    Date: { now: () => 123456 }
  });
  load();
  assert.equal(state.stdTires, 3);
  assert.equal(state.tools.jack.level, 24);
  assert.equal(state.tools.impact.level, 1);
  assert.equal(state.rigCondition, 100);
  assert.equal(state.contractsCompleted, 0);
  assert.deepEqual(state.claimedCareerGearMilestones, [10, 30]);
  assert.deepEqual(state.ratings, [5.0]);
  assert.deepEqual(state.customerLedger, {});
  assert.equal(state.jobs.length, 1);
  assert.equal(state.activeJob, null);
  assert.equal(state.zoneId, 'z1');
  assert.equal(state.firstDispatchBriefingSeen, true);
  assert.equal(state.dispatchScans, 3);
  assert.equal(state.surgeCharges, 3);
  assert.equal(state.lastScanRechargeAt, 123456);
  assert.equal(state.lastSurgeRechargeAt, 123456);
});

test('local save survives a fresh-state reload with career, active repair, inventory, and tool progress intact', () => {
  const store = new Map();
  const localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value))
  };
  const original = {
    cash: 18450, rep: 9200, jobsCompleted: 63, gears: 4, tokens: 125,
    zoneId: 'z5', unlockedRigTier: 3, contractsCompleted: 11,
    claimedCareerGearMilestones: [10, 30, 60],
    tools: {
      impact: { level: 9 }, jack: { level: 9 },
      comp: { level: 9 }, radar: { level: 9 }
    },
    stdTires: 7, hdTires: 2, plugs: 5, parts: 3,
    activeJob: { step: 4, veh: { id: 'car-1' }, dmg: { action: 'replace' }, torqueDone: [1, 3] },
    jobs: [{ id: 'job-1', veh: { id: 'car-2' }, dmg: { action: 'plug' } }],
    ratings: [5, 4.8], customerLedger: { customerA: 2 },
    rigCondition: 82, contract: { type: 'fast', progress: 2, target: 4, rewardZoneMult: 1.2, rewardContractRank: 12, rewardBonusRate: 0.25 },
    bizName: 'DelWin Road Service', avatarEmoji: '🛞',
    dispatchScans: 2, lastScanRechargeAt: 123456, surgeCharges: 1, lastSurgeRechargeAt: 123999,
    firstDispatchBriefingSeen: true
  };
  const save = gameFunction('saveState', {
    state: original, localStorage, window: { DelWinCloud: { queueSave: () => {} } }
  });
  save();

  const restored = {
    tools: {
      impact: { level: 1 }, jack: { level: 1 },
      comp: { level: 1 }, radar: { level: 1 }
    },
    jobs: [], activeJob: null, ratings: [], customerLedger: {},
    claimedCareerGearMilestones: []
  };
  const load = gameFunction('loadState', {
    state: restored, localStorage,
    ZONES: [{ id: 'z1', mult: 1 }, { id: 'z5', mult: 1.2 }],
    rollNewContract: () => { throw new Error('Existing contract should not be replaced'); },
    canDispatchHeavyJobs: () => true,
    getZone: () => ({ mult: 1.2 }),
    MAX_DISPATCH_SCANS: 3, MAX_SURGE_CHARGES: 3,
    Date: { now: () => 999999 }
  });
  load();
  assert.equal(restored.cash, original.cash);
  assert.equal(restored.rep, original.rep);
  assert.equal(restored.gears, original.gears);
  assert.equal(restored.tokens, original.tokens);
  assert.equal(restored.zoneId, 'z5');
  assert.equal(restored.unlockedRigTier, 3);
  assert.deepEqual(restored.tools, original.tools);
  assert.equal(restored.stdTires, 7);
  assert.equal(restored.hdTires, 2);
  assert.equal(restored.plugs, 5);
  assert.equal(restored.parts, 3);
  assert.deepEqual(restored.activeJob, original.activeJob);
  assert.deepEqual(restored.jobs, original.jobs);
  assert.deepEqual(restored.claimedCareerGearMilestones, [10, 30, 60]);
  assert.deepEqual(restored.contract, original.contract);
  assert.deepEqual(restored.customerLedger, original.customerLedger);
  assert.equal(restored.rigCondition, 82);
  assert.equal(restored.dispatchScans, 2);
  assert.equal(restored.surgeCharges, 1);
});

test('corrupt local JSON does not crash loading or overwrite the unreadable stored bytes', () => {
  const corrupt = '{broken-json';
  let writes = 0;
  const state = {
    cash: 900, jobs: [{ veh: {}, dmg: {} }], activeJob: { veh: {}, dmg: {} },
    tools: { impact: { level: 1 }, jack: { level: 1 }, comp: { level: 1 }, radar: { level: 1 } }
  };
  const localStorage = {
    getItem: key => { assert.equal(key, 'delwin_v4_save'); return corrupt; },
    setItem: () => { writes += 1; }
  };
  const load = gameFunction('loadState', {
    state, localStorage, ZONES: [{ id: 'z1', mult: 1 }],
    rollNewContract: () => {}, canDispatchHeavyJobs: () => false,
    getZone: () => ({ mult: 1 }), MAX_DISPATCH_SCANS: 3, MAX_SURGE_CHARGES: 3,
    Date: { now: () => 123456 }
  });
  assert.doesNotThrow(load);
  assert.equal(state.cash, 900);
  assert.deepEqual(state.jobs, []);
  assert.equal(state.activeJob, null);
  assert.equal(writes, 0);
});

test('local save writes the current state and queues the same state for cloud sync', () => {
  const state = { cash: 123, jobsCompleted: 4 };
  let localValue = '';
  let queued = null;
  const save = gameFunction('saveState', {
    state,
    localStorage: { setItem: (key, value) => { assert.equal(key, 'delwin_v4_save'); localValue = value; } },
    window: { DelWinCloud: { queueSave: (value) => { queued = value; } } }
  });
  save();
  assert.deepEqual(JSON.parse(localValue), state);
  assert.equal(queued, state);
});


test('repair safety sequence requires cones and chocks before lifting, with distinct repeat-safe penalties', () => {
  const job = { step: 1, conesSet: false, chocked: false, liftPct: 0, penalties: 0, repPenalties: 0, penaltyLog: [], veh: { axleWeight: 1 } };
  const state = { activeJob: job, tools: { jack: { level: 1 } } };
  const alerts = [];
  const penalties = [];
  const deps = {
    state,
    addBayPenalty: (...args) => { penalties.push(args); const j=args[0]; if (!j.penaltyLog.some(x=>x.reason===args[2])) { j.penalties+=args[1]; j.repPenalties+=args[3]; j.penaltyLog.push({reason:args[2]}); } },
    showAlert: (title) => alerts.push(title),
    showBayActionHint: () => {},
    renderBay: () => {},
    dismissAlert: () => {},
    SoundFX: { chock: () => {}, jack: () => {} }
  };
  const chocks = gameFunction('setChocks', deps);
  const pump = gameFunction('pumpJack', deps);
  const cones = gameFunction('setCones', deps);
  chocks();
  assert.equal(job.chocked, false);
  assert.equal(job.penalties, 10);
  chocks();
  assert.equal(job.penalties, 10, 'same safety violation must not stack on repeated taps');
  pump();
  assert.equal(job.liftPct, 0);
  assert.equal(job.penalties, 20, 'lifting without cones is a separate violation');
  cones();
  chocks();
  assert.equal(job.conesSet, true);
  assert.equal(job.chocked, true);
  pump();
  assert.ok(job.liftPct > 0);
  while (job.step === 1) pump();
  assert.equal(job.liftPct, 100);
  assert.equal(job.step, 2);
  assert.ok(alerts.some(x => /DOT CONE ALERT/.test(x)));
});

test('wheel lugs reject early work, missing night lights, and unsecured lock lugs', () => {
  const job = { step: 1, weather: {id:'night'}, floodlightsOn:false, hasWheelLock:true, lockLugId:3, lockKeyApplied:false, lugHealth:{1:1,2:1,3:1,4:1,5:1}, lugsRemoved:[], penalties:0, repPenalties:0, penaltyLog:[] };
  const state = { activeJob:job, tools:{impact:{level:1}} };
  const alerts=[];
  const addBayPenalty=(j,cash,reason,rep)=>{if(!j.penaltyLog.some(x=>x.reason===reason)){j.penalties+=cash;j.repPenalties+=rep;j.penaltyLog.push({reason});}};
  const tap=gameFunction('tapLug',{state,WEATHER_CONDITIONS:[{id:'clear'}],STAR_ORDER:[1,3,5,2,4],addBayPenalty,showAlert:(t)=>alerts.push(t),showBayActionHint:()=>{},renderBay:()=>{},SoundFX:{error:()=>{},impact:()=>{},torqueClick:()=>{}},triggerLugSpin:()=>{},Math:{random:()=>1,floor:Math.floor,max:Math.max,min:Math.min}});
  tap(1);
  assert.equal(job.penalties,10);
  job.step=2;
  tap(1);
  assert.equal(job.penalties,18);
  job.floodlightsOn=true;
  tap(3);
  assert.equal(job.penalties,28);
  assert.deepEqual(job.lugsRemoved,[]);
  assert.ok(alerts.some(x=>/SECURITY WHEEL LOCK/.test(x)));
});

test('removing all five lugs advances to diagnostic stage and ignores duplicate or invalid lug taps', () => {
  const job={step:2,weather:{id:'clear'},floodlightsOn:true,hasWheelLock:false,lugHealth:{1:1,2:1,3:1,4:1,5:1},lugsRemoved:[],penalties:0,repPenalties:0,penaltyLog:[]};
  const state={activeJob:job,tools:{impact:{level:1}}};
  const tap=gameFunction('tapLug',{state,WEATHER_CONDITIONS:[{id:'clear'}],STAR_ORDER:[1,3,5,2,4],addBayPenalty:()=>{},showAlert:()=>{},showBayActionHint:()=>{},renderBay:()=>{},dismissAlert:()=>{},SoundFX:{error:()=>{},impact:()=>{},torqueClick:()=>{}},triggerLugSpin:()=>{},Math:{random:()=>1,floor:Math.floor,max:Math.max}});
  tap(0); tap(6); tap(1); tap(1);
  assert.deepEqual(job.lugsRemoved,[1]);
  for(const id of [2,3,4,5]) tap(id);
  assert.equal(job.step,3);
  assert.equal(job.lugsRemoved.length,5);
  tap(5);
  assert.equal(job.lugsRemoved.length,5);
});

test('torque stage enforces star order and only advances after all five lugs', () => {
  const job={step:5,torqueIdx:0,weather:{id:'clear'},floodlightsOn:true,penalties:0,repPenalties:0,penaltyLog:[]};
  const state={activeJob:job};
  const alerts=[];
  const tap=gameFunction('tapLug',{state,WEATHER_CONDITIONS:[{id:'clear'}],STAR_ORDER:[1,3,5,2,4],addBayPenalty:(j,c,r,p)=>{if(!j.penaltyLog.some(x=>x.reason===r)){j.penalties+=c;j.repPenalties+=p;j.penaltyLog.push({reason:r});}},showAlert:(t)=>alerts.push(t),showBayActionHint:()=>{},renderBay:()=>{},dismissAlert:()=>{},SoundFX:{error:()=>{},impact:()=>{},torqueClick:()=>{}},triggerLugSpin:()=>{},Math:{random:()=>1,floor:Math.floor,max:Math.max}});
  tap(3);
  assert.equal(job.torqueIdx,0);
  assert.equal(job.penalties,12);
  for(const id of [1,3,5,2,4]) tap(id);
  assert.equal(job.torqueIdx,5);
  assert.ok(alerts.some(x=>/STAR-PATTERN/.test(x)));
});

test('PSI calibration clamps input, flags dangerous over-inflation once, and permits safe bleeding', () => {
  const job={step:4,psi:32,veh:{targetPsi:35},penalties:0,repPenalties:0,penaltyLog:[]};
  const state={activeJob:job};
  const alerts=[];
  let meterUpdates=0, stopped=0;
  const apply=gameFunction('applyPsiTick',{state,stopHoldPsi:()=>{stopped++;},addBayPenalty:(j,c,r,p)=>{if(!j.penaltyLog.some(x=>x.reason===r)){j.penalties+=c;j.repPenalties+=p;j.penaltyLog.push({reason:r});}},showAlert:(t)=>alerts.push(t),renderBay:()=>{},SoundFX:{air:()=>{}},updateLivePsiMeter:()=>{meterUpdates++;}});
  apply(200);
  assert.equal(job.psi,130);
  assert.equal(job.penalties,15);
  apply(1);
  assert.equal(job.penalties,15);
  apply(-95);
  assert.equal(job.psi,35);
  assert.ok(meterUpdates>=2);
  assert.ok(stopped>=1);
});

test('PSI lock rejects out-of-range pressure then advances only when within tool tolerance', () => {
  const job={step:4,fixed:true,psi:45,veh:{targetPsi:35}};
  const state={activeJob:job,tools:{comp:{level:1}}};
  const alerts=[];
  const lock=gameFunction('lockPsi',{state,showBayActionHint:()=>{},showAlert:(t)=>alerts.push(t),addBayPenalty:()=>{},renderBay:()=>{},dismissAlert:()=>{},SoundFX:{torqueClick:()=>{}}});
  lock();
  assert.equal(job.step,4);
  job.psi=37;
  lock();
  assert.equal(job.step,5);
  assert.ok(alerts.some(x=>/PSI OUT OF SPEC/.test(x)));
});

test('vehicle cannot be released until repair and all five torque steps are complete', () => {
  const job={step:5,torqueIdx:4,fixed:true,jackLowered:false};
  const state={activeJob:job};
  const alerts=[];
  const lower=gameFunction('lowerJackAndFinish',{state,showBayActionHint:()=>{},showAlert:(t)=>alerts.push(t),SoundFX:{jack:()=>{}},renderBay:()=>{},setTimeout:()=>{}});
  lower();
  assert.equal(job.jackLowered,false);
  assert.ok(alerts.some(x=>/TORQUE ALL FIVE/.test(x)));
  job.torqueIdx=5;
  job.fixed=false;
  lower();
  assert.equal(job.jackLowered,false);
  job.fixed=true;
  lower();
  assert.equal(job.jackLowered,true);
});


test('complete clean roadside repair traverses every bay stage in order without penalties', () => {
  const job={
    step:1,conesSet:false,chocked:false,liftPct:0,weather:{id:'clear'},floodlightsOn:true,
    hasWheelLock:false,lockKeyApplied:true,lugHealth:{1:1,2:1,3:1,4:1,5:1},lugsRemoved:[],
    scanned:false,fixed:false,psi:12,torqueIdx:0,jackLowered:false,
    dmg:{action:'plug',title:'Center tread nail'},veh:{axleWeight:1,targetPsi:35,heavy:false},
    penalties:0,repPenalties:0,penaltyLog:[]
  };
  const state={activeJob:job,tools:{jack:{level:1},impact:{level:1},comp:{level:1}},plugs:1};
  const calls=[];
  const deps={
    state,WEATHER_CONDITIONS:[{id:'clear'}],STAR_ORDER:[1,3,5,2,4],
    addBayPenalty:(j,c,r,p)=>{j.penalties+=c;j.repPenalties+=p;j.penaltyLog.push({reason:r});},
    showAlert:(t)=>calls.push(t),showBayActionHint:()=>{},renderBay:()=>{},dismissAlert:()=>{},
    updateHUD:()=>{},SoundFX:{chock:()=>{},jack:()=>{},impact:()=>{},scan:()=>{},air:()=>{},torqueClick:()=>{},success:()=>{}},
    triggerLugSpin:()=>{},stopHoldPsi:()=>{},updateLivePsiMeter:()=>{},
    setTimeout:(fn)=>fn(),completeJob:()=>{calls.push('completed');state.activeJob=null;}
  };
  gameFunction('setCones',deps)();
  assert.equal(job.conesSet,true);
  gameFunction('setChocks',deps)();
  assert.equal(job.chocked,true);
  const pump=gameFunction('pumpJack',deps);
  while(job.step===1) pump();
  assert.equal(job.step,2);
  for(const id of [1,2,3,4,5]) gameFunction('tapLug',deps)(id);
  assert.equal(job.step,3);
  gameFunction('runScan',deps)();
  assert.equal(job.scanned,true);
  gameFunction('performRepair',deps)('plug');
  assert.equal(job.fixed,true);
  assert.equal(state.plugs,0);
  assert.equal(job.step,4);
  gameFunction('applyPsiTick',deps)(23);
  assert.equal(job.psi,35);
  gameFunction('lockPsi',deps)();
  assert.equal(job.step,5);
  for(const id of [1,3,5,2,4]) gameFunction('tapLug',deps)(id);
  assert.equal(job.torqueIdx,5);
  gameFunction('lowerJackAndFinish',deps)();
  assert.equal(job.jackLowered,true);
  assert.equal(state.activeJob,null);
  assert.ok(calls.includes('completed'));
  assert.equal(job.penalties,0);
  assert.equal(job.repPenalties,0);
});

test('wheel-lock adapter is stage-gated, required only for locked wheels, and repeat-safe', () => {
  const job={step:1,hasWheelLock:true,lockKeyApplied:false};
  const state={activeJob:job};
  const alerts=[];
  let clicks=0;
  const deps={state,showBayActionHint:()=>{},showAlert:(t)=>alerts.push(t),dismissAlert:()=>{},renderBay:()=>{},SoundFX:{torqueClick:()=>{clicks++;}}};
  const apply=gameFunction('applyWheelLockKey',deps);
  apply();
  assert.equal(job.lockKeyApplied,false);
  job.step=2;
  apply();
  assert.equal(job.lockKeyApplied,true);
  apply();
  assert.equal(job.lockKeyApplied,true);
  assert.equal(clicks,1);
  assert.ok(alerts.some(x=>/KEY ALREADY SEATED/.test(x)));
});


test('job completion cannot bypass the repair, torque, or jack-release gates', () => {
  const job={isTutorial:false,step:4,torqueIdx:0,fixed:false,jackLowered:false};
  const state={activeJob:job,cash:0,rep:0,jobsCompleted:0,parts:0,rigCondition:100,streak:0,claimedCareerGearMilestones:[],ratings:[],jobs:[]};
  let saves=0,modals=0;
  const finish=gameFunction('completeJob',{
    state,stopHoldPsi:()=>{},SoundFX:{success:()=>{}},getFleetOverheadFee:()=>0,
    getZone:()=>({mult:1}),getStreakGearReward:()=>0,MAX_STREAK_ROLLOVER:20,
    refreshJobs:()=>{},saveState:()=>{saves++;},updateHUD:()=>{},openModal:()=>{modals++;}
  });
  finish();
  assert.equal(state.activeJob,job);
  assert.equal(state.jobsCompleted,0);
  assert.equal(saves,0);
  assert.equal(modals,0);
  job.step=5; job.torqueIdx=5; job.fixed=true;
  finish();
  assert.equal(state.activeJob,job,'jack must still be lowered before completion');
  assert.equal(state.jobsCompleted,0);
  job.jackLowered=true;
  finish();
  assert.equal(state.activeJob,null);
  assert.equal(state.jobsCompleted,1);
  assert.equal(saves,1);
  assert.equal(modals,1);
});


test('night floodlights toggle safely and reject use after a call ends', () => {
  const job = { floodlightsOn: false };
  const state = { activeJob: job };
  let renders = 0;
  let clicks = 0;
  const toggle = gameFunction('toggleBayFloodlights', {
    state,
    SoundFX: { torqueClick: () => { clicks += 1; } },
    renderBay: () => { renders += 1; }
  });
  toggle();
  assert.equal(job.floodlightsOn, true);
  toggle();
  assert.equal(job.floodlightsOn, false);
  assert.equal(renders, 2);
  assert.equal(clicks, 2);
  state.activeJob = null;
  toggle();
  assert.equal(renders, 2);
  assert.equal(clicks, 2);
});

test('wheel-lock key adapter only seats during stage two on an actually locked wheel', () => {
  const job = { step: 1, hasWheelLock: true, lockKeyApplied: false };
  const state = { activeJob: job };
  const alerts = [];
  let renders = 0;
  const apply = gameFunction('applyWheelLockKey', {
    state,
    showBayActionHint: (action, step) => alerts.push(`stage-${step}`),
    showAlert: (title) => alerts.push(title),
    dismissAlert: () => {},
    SoundFX: { torqueClick: () => {} },
    renderBay: () => { renders += 1; }
  });
  apply();
  assert.equal(job.lockKeyApplied, false);
  assert.ok(alerts.includes('stage-2'));
  job.step = 2;
  job.hasWheelLock = false;
  apply();
  assert.equal(job.lockKeyApplied, false);
  assert.ok(alerts.some(x => /NO SECURITY LOCK/.test(x)));
  job.hasWheelLock = true;
  apply();
  assert.equal(job.lockKeyApplied, true);
  assert.equal(renders, 1);
  apply();
  assert.equal(job.lockKeyApplied, true);
  assert.ok(alerts.some(x => /KEY ALREADY SEATED/.test(x)));
});


test('rain-slicked lug slip causes no removal until a successful retry', () => {
  const job = {
    step: 2, weather: { id: 'rain' }, floodlightsOn: true,
    hasWheelLock: false, lugHealth: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    lugsRemoved: [], penalties: 0, repPenalties: 0, penaltyLog: []
  };
  const state = { activeJob: job, tools: { impact: { level: 1 } } };
  const alerts = [];
  const randomValues = [0.1, 0.5];
  const tap = gameFunction('tapLug', {
    state, WEATHER_CONDITIONS: [{ id: 'clear' }], STAR_ORDER: [1, 3, 5, 2, 4],
    addBayPenalty: () => {}, showAlert: title => alerts.push(title),
    showBayActionHint: () => {}, renderBay: () => {}, dismissAlert: () => {},
    SoundFX: { error: () => {}, impact: () => {}, torqueClick: () => {} },
    triggerLugSpin: () => {},
    Math: { random: () => randomValues.shift(), floor: Math.floor, max: Math.max }
  });
  tap(1);
  assert.equal(job.lugHealth[1], 1);
  assert.deepEqual(job.lugsRemoved, []);
  assert.ok(alerts.some(x => /WET SOCKET SLIP/.test(x)));
  tap(1);
  assert.equal(job.lugHealth[1], 0);
  assert.deepEqual(job.lugsRemoved, [1]);
});

test('rusted lug health requires repeated impact power before removal', () => {
  const job = {
    step: 2, weather: { id: 'clear' }, floodlightsOn: true,
    hasWheelLock: false, isRusted: true, lugHealth: { 1: 3, 2: 1, 3: 1, 4: 1, 5: 1 },
    lugsRemoved: [], penalties: 0, repPenalties: 0, penaltyLog: []
  };
  const state = { activeJob: job, tools: { impact: { level: 1 } } };
  const tap = gameFunction('tapLug', {
    state, WEATHER_CONDITIONS: [{ id: 'clear' }], STAR_ORDER: [1, 3, 5, 2, 4],
    addBayPenalty: () => {}, showAlert: () => {}, showBayActionHint: () => {},
    renderBay: () => {}, dismissAlert: () => {},
    SoundFX: { error: () => {}, impact: () => {}, torqueClick: () => {} },
    triggerLugSpin: () => {},
    Math: { random: () => 1, floor: Math.floor, max: Math.max }
  });
  tap(1);
  assert.equal(job.lugHealth[1], 2);
  assert.deepEqual(job.lugsRemoved, []);
  tap(1);
  assert.equal(job.lugHealth[1], 1);
  assert.deepEqual(job.lugsRemoved, []);
  tap(1);
  assert.equal(job.lugHealth[1], 0);
  assert.deepEqual(job.lugsRemoved, [1]);
});


test('incorrect repair choice is penalized without consuming stock, then correct plug consumes once', () => {
  const job={step:3,scanned:true,fixed:false,dmg:{action:'plug',title:'Center tread nail'}};
  const state={activeJob:job,plugs:1};
  const alerts=[];
  let renders=0;
  const repair=gameFunction('performRepair',{
    state,showBayActionHint:()=>{},showAlert:title=>alerts.push(title),addBayPenalty:(j,c,r,p)=>{if(!j.penaltyLog)j.penaltyLog=[];if(j.penaltyLog.some(x=>x.reason===r))return;j.penaltyLog.push({reason:r});j.penalties=(j.penalties||0)+c;j.repPenalties=(j.repPenalties||0)+p;},
    dismissAlert:()=>{},SoundFX:{impact:()=>{}},updateHUD:()=>{},renderBay:()=>{renders++;},
    document:{getElementById:()=>({classList:{add:()=>{},remove:()=>{}}})},setTimeout:()=>{}
  });
  repair('swap');
  assert.equal(state.plugs,1);
  assert.equal(job.fixed,false);
  assert.equal(job.step,3);
  assert.equal(job.penalties,20);
  repair('plug');
  assert.equal(state.plugs,0);
  assert.equal(job.fixed,true);
  assert.equal(job.step,4);
  repair('plug');
  assert.equal(state.plugs,0);
  assert.equal(renders,2);
});

test('correct repair refuses to consume inventory when stock is empty', () => {
  const job={step:3,scanned:true,fixed:false,dmg:{action:'plug',title:'Center tread nail'}};
  const state={activeJob:job,plugs:0};
  const alerts=[];
  const repair=gameFunction('performRepair',{
    state,showBayActionHint:()=>{},showAlert:title=>alerts.push(title),addBayPenalty:()=>{},
    dismissAlert:()=>{},SoundFX:{impact:()=>{}},updateHUD:()=>{},renderBay:()=>{},
    document:{getElementById:()=>({classList:{add:()=>{},remove:()=>{}}})},setTimeout:()=>{}
  });
  repair('plug');
  assert.equal(state.plugs,0);
  assert.equal(job.fixed,false);
  assert.equal(job.step,3);
  assert.ok(alerts.some(x=>/OUT OF PLUGS/.test(x)));
});

test('emergency drone drop charges exact token cost once and respects existing tire stock', () => {
  const job={step:3,scanned:true,fixed:false,veh:{heavy:false}};
  const state={activeJob:job,tokens:5,stdTires:0,hdTires:0};
  let updates=0,renders=0;
  const alerts=[];
  const drop=gameFunction('droneDrop',{
    state,showAlert:title=>alerts.push(title),goPage:()=>{},SoundFX:{success:()=>{}},
    updateHUD:()=>{updates++;},renderBay:()=>{renders++;}
  });
  drop();
  assert.equal(state.tokens,2);
  assert.equal(state.stdTires,1);
  drop();
  assert.equal(state.tokens,2);
  assert.equal(state.stdTires,1);
  assert.ok(alerts.some(x=>/NOT NEEDED/.test(x)));
  assert.equal(updates,1);
  assert.equal(renders,1);
});

test('over-inflation repeat taps do not stack the same safety penalty', () => {
  const job={step:4,psi:45,veh:{targetPsi:35},penalties:0,repPenalties:0,penaltyLog:[]};
  const state={activeJob:job};
  const alerts=[];
  let stops=0;
  const apply=gameFunction('applyPsiTick',{
    state,stopHoldPsi:()=>{stops++;},
    addBayPenalty:(j,c,r,p)=>{if(j.penaltyLog.some(x=>x.reason===r))return;j.penalties+=c;j.repPenalties+=p;j.penaltyLog.push({reason:r});},
    showAlert:title=>alerts.push(title),renderBay:()=>{},SoundFX:{air:()=>{}},updateLivePsiMeter:()=>{}
  });
  apply(1);
  apply(1);
  assert.equal(job.penalties,15);
  assert.equal(job.repPenalties,8);
  assert.equal(job.psi,47);
  assert.ok(stops>=2);
  assert.ok(alerts.length>=1);
});


test('tire swap consumes only the matching standard or heavy-duty inventory once', () => {
  for (const scenario of [
    { heavy:false, stdTires:1, hdTires:7, expectedStd:0, expectedHd:7 },
    { heavy:true, stdTires:7, hdTires:1, expectedStd:7, expectedHd:0 }
  ]) {
    const job={step:3,scanned:true,fixed:false,dmg:{action:'swap',title:'Sidewall damage'},veh:{heavy:scenario.heavy}};
    const state={activeJob:job,stdTires:scenario.stdTires,hdTires:scenario.hdTires};
    const repair=gameFunction('performRepair',{
      state,showBayActionHint:()=>{},showAlert:()=>{},addBayPenalty:()=>{},dismissAlert:()=>{},
      SoundFX:{impact:()=>{}},updateHUD:()=>{},renderBay:()=>{},
      document:{getElementById:()=>({classList:{add:()=>{},remove:()=>{}}})},setTimeout:()=>{}
    });
    repair('swap');
    assert.equal(state.stdTires,scenario.expectedStd);
    assert.equal(state.hdTires,scenario.expectedHd);
    assert.equal(job.fixed,true);
    assert.equal(job.step,4);
    repair('swap');
    assert.equal(state.stdTires,scenario.expectedStd);
    assert.equal(state.hdTires,scenario.expectedHd);
  }
});

test('heavy-duty emergency drone drop costs five tokens and supplies only a heavy tire', () => {
  const job={step:3,scanned:true,fixed:false,veh:{heavy:true}};
  const state={activeJob:job,tokens:6,stdTires:0,hdTires:0};
  const drop=gameFunction('droneDrop',{
    state,showAlert:()=>{},goPage:()=>{},SoundFX:{success:()=>{}},updateHUD:()=>{},renderBay:()=>{}
  });
  drop();
  assert.equal(state.tokens,1);
  assert.equal(state.hdTires,1);
  assert.equal(state.stdTires,0);
});


test('territory selection enforces live REP gates across all six hubs and locks during active calls', () => {
  const readArray = name => {
    const match = source.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\n\\]);'));
    assert.ok(match, `Could not read ${name} from game.js`);
    return vm.runInNewContext(match[1]);
  };
  const zones = readArray('ZONES');
  const hubs = readArray('HUB_TIERS');
  const state={rep:0,zoneId:'z1',activeJob:null};
  const alerts=[];
  let saves=0,refreshes=0,pages=0;
  const select=gameFunction('selectZone',{
    state,ZONES:zones,
    showAlert:(title)=>alerts.push(title),goPage:()=>{pages++;},
    SoundFX:{torqueClick:()=>{}},saveState:()=>{saves++;},updateHUD:()=>{},
    refreshJobs:()=>{refreshes++;}
  });
  for (const hub of hubs.slice(1)) {
    const entryZone = zones.find(zone => zone.hubNum === hub.hubNum);
    assert.ok(entryZone, `Hub ${hub.hubNum} must have an entry territory`);
    state.rep = hub.entryRep - 1;
    const previousZone = state.zoneId;
    select(entryZone.id);
    assert.equal(state.zoneId, previousZone, `Hub ${hub.hubNum} must reject one REP below its entry gate`);
    state.rep = hub.entryRep;
    select(entryZone.id);
    assert.equal(state.zoneId, entryZone.id, `Hub ${hub.hubNum} must unlock at its exact REP gate`);
  }
  const selectedZone = state.zoneId;
  const savesBeforeActiveCall = saves;
  state.activeJob={step:2};
  select('z1');
  assert.equal(state.zoneId,selectedZone);
  assert.equal(saves,savesBeforeActiveCall);
  assert.ok(alerts.some(x=>/ACTIVE CALL IN PROGRESS/.test(x)));
  assert.equal(pages,6); // five successful hub selections and active-call redirect
  assert.equal(refreshes,5);
});

test('heavy dispatch and heavy contracts remain locked until both Hub 2 and Tier 2 rig are active', () => {
  const state={zoneId:'z1',unlockedRigTier:1,contract:{id:'c_fast'}};
  const canDispatch=gameFunction('canDispatchHeavyJobs',{
    state,getZone:()=>({hubNum:state.zoneId==='z1'?1:2}),getRigTier:()=>state.unlockedRigTier
  });
  assert.equal(canDispatch(),false);
  state.zoneId='z5';
  assert.equal(canDispatch(),false);
  state.unlockedRigTier=2;
  assert.equal(canDispatch(),true);

  const availability=gameFunction('isContractAvailable',{
    canDispatchHeavyJobs:()=>canDispatch()
  });
  assert.equal(availability({type:'heavy'}),true);
  state.unlockedRigTier=1;
  assert.equal(availability({type:'heavy'}),false);
  assert.equal(availability({type:'plugs'}),true);
});

test('new contract rolls exclude the previous contract and unavailable heavy objectives', () => {
  const state={
    contract:{id:'c_fast'},contractsCompleted:5,zoneId:'z1'
  };
  const pool=[
    {id:'c_fast',type:'fast',rewardPart:0},
    {id:'c_heavy',type:'heavy',rewardPart:0},
    {id:'c_plugs',type:'plugs',rewardPart:0}
  ];
  let randomCalls=0;
  const roll=gameFunction('rollNewContract',{
    state,CONTRACT_POOL:pool,
    isContractAvailable:c=>c.type!=='heavy',
    getZone:()=>({mult:1.25}),
    Math:{random:()=>{randomCalls++;return 0;},floor:Math.floor,max:Math.max,min:Math.min}
  });
  roll();
  assert.equal(state.contract.id,'c_plugs');
  assert.equal(state.contract.progress,0);
  assert.equal(state.contract.rewardZoneMult,1.25);
  assert.equal(state.contract.rewardContractRank,6);
  assert.equal(state.contract.rewardBonusRate,0.10);
  assert.equal(randomCalls,1);
});


test('tool upgrade rejects insufficient cash and Gold Gears without mutating career state', () => {
  const tool={level:4,name:'Impact Wrench'};
  const state={tools:{impact:tool},cash:500,parts:0};
  const alerts=[];
  let saves=0,renders=0;
  const upgrade=gameFunction('upgradeTool',{
    state,getToolUpgradeSpec:()=>({cost:1000,gears:1}),
    showAlert:(title)=>alerts.push(title),SoundFX:{success:()=>{}},
    saveState:()=>{saves++;},updateHUD:()=>{},renderGarage:()=>{renders++;},
    previewToolTiers:{}
  });
  upgrade('impact');
  assert.equal(state.cash,500);
  assert.equal(state.parts,0);
  assert.equal(tool.level,4);
  assert.ok(alerts.some(x=>/INSUFFICIENT CASH/.test(x)));
  state.cash=2000;
  upgrade('impact');
  assert.equal(state.cash,2000);
  assert.equal(state.parts,0);
  assert.equal(tool.level,4);
  assert.ok(alerts.some(x=>/GOLD GEARS REQUIRED/.test(x)));
  assert.equal(saves,0);
  assert.equal(renders,0);
});

test('successful breakthrough upgrade spends exact cash and one Gear exactly once', () => {
  const tool={level:4,name:'Impact Wrench'};
  const state={tools:{impact:tool},cash:2500,parts:1};
  let saves=0,renders=0;
  const previewToolTiers={};
  const upgrade=gameFunction('upgradeTool',{
    state,getToolUpgradeSpec:()=>({cost:1800,gears:1}),
    showAlert:()=>{},SoundFX:{success:()=>{}},
    saveState:()=>{saves++;},updateHUD:()=>{},renderGarage:()=>{renders++;},
    previewToolTiers
  });
  upgrade('impact');
  assert.equal(state.cash,700);
  assert.equal(state.parts,0);
  assert.equal(tool.level,5);
  assert.equal(previewToolTiers.impact,2);
  upgrade('impact');
  assert.equal(state.cash,700);
  assert.equal(state.parts,0);
  assert.equal(tool.level,5);
  assert.equal(saves,1);
  assert.equal(renders,1);
});

test('tool upgrade refuses unknown tools and level-cap purchases', () => {
  const state={tools:{impact:{level:24,name:'Impact Wrench'}},cash:999999,parts:99};
  let saves=0;
  const upgrade=gameFunction('upgradeTool',{
    state,getToolUpgradeSpec:()=>({cost:1,gears:0}),showAlert:()=>{},
    SoundFX:{success:()=>{}},saveState:()=>{saves++;},updateHUD:()=>{},
    renderGarage:()=>{},previewToolTiers:{}
  });
  upgrade('unknown');
  upgrade('impact');
  assert.equal(state.tools.impact.level,24);
  assert.equal(state.cash,999999);
  assert.equal(state.parts,99);
  assert.equal(saves,0);
});

test('rig commission enforces sequential tier, all-tool milestone, cash and Gear requirements', () => {
  const rigs=[
    {name:'Rig 1',reqLvl:1,cashCost:0,partCost:0,perk:'base',capStd:3,capHd:1,capPlugs:6},
    {name:'Rig 2',reqLvl:5,cashCost:1800,partCost:1,perk:'upgrade',capStd:4,capHd:2,capPlugs:9},
    {name:'Rig 3',reqLvl:9,cashCost:9500,partCost:2,perk:'advanced',capStd:6,capHd:3,capPlugs:12}
  ];
  const state={unlockedRigTier:1,cash:1000,parts:0};
  const alerts=[];
  let saves=0,renders=0,modals=0;
  const minLevels={impact:5,jack:5,comp:5,radar:4};
  const commission=gameFunction('purchaseRigTier',{
    state,RIG_TIERS:rigs,getMinToolLevel:()=>Math.min(...Object.values(minLevels)),
    showAlert:title=>alerts.push(title),SoundFX:{success:()=>{}},
    saveState:()=>{saves++;},updateHUD:()=>{},renderGarage:()=>{},
    openModal:()=>{modals++;}
  });
  commission(3);
  assert.equal(state.unlockedRigTier,1);
  assert.ok(alerts.some(x=>/SEQUENTIAL RIG UNLOCK/.test(x)));
  commission(2);
  assert.equal(state.unlockedRigTier,1);
  assert.ok(alerts.some(x=>/TOOL MILESTONE REQUIRED/.test(x)));
  minLevels.radar=5;
  commission(2);
  assert.equal(state.unlockedRigTier,1);
  assert.ok(alerts.some(x=>/INSUFFICIENT RIG COMMISSION RESOURCES/.test(x)));
  assert.equal(saves,0);
  assert.equal(modals,0);
});

test('rig commission deducts exact resources once and cannot re-commission an unlocked tier', () => {
  const rigs=[
    {name:'Rig 1',reqLvl:1,cashCost:0,partCost:0,perk:'base',capStd:3,capHd:1,capPlugs:6},
    {name:'Rig 2',reqLvl:5,cashCost:1800,partCost:1,perk:'upgrade',capStd:4,capHd:2,capPlugs:9}
  ];
  const state={unlockedRigTier:1,cash:2000,parts:1};
  let saves=0,renders=0,modals=0;
  const commission=gameFunction('purchaseRigTier',{
    state,RIG_TIERS:rigs,getMinToolLevel:()=>5,showAlert:()=>{},
    SoundFX:{success:()=>{}},saveState:()=>{saves++;},updateHUD:()=>{},
    renderGarage:()=>{renders++;},openModal:()=>{modals++;}
  });
  commission(2);
  assert.equal(state.unlockedRigTier,2);
  assert.equal(state.cash,200);
  assert.equal(state.parts,0);
  commission(2);
  assert.equal(state.unlockedRigTier,2);
  assert.equal(state.cash,200);
  assert.equal(state.parts,0);
  assert.equal(saves,1);
  assert.equal(renders,1);
  assert.equal(modals,1);
});


test('six hub entry REP gates align with the live HUB_TIERS and ZONES source data', () => {
  const readArray = name => {
    const match = source.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\n\\]);'));
    assert.ok(match, `Could not read ${name} from game.js`);
    return vm.runInNewContext(match[1]);
  };
  const hubs = readArray('HUB_TIERS');
  const zones = readArray('ZONES');
  assert.equal(hubs.length, 6);
  for (const hub of hubs) {
    const hubZones = zones.filter(zone => zone.hubNum === hub.hubNum);
    assert.equal(hubZones.length, 4, `Hub ${hub.hubNum} territory count`);
    assert.equal(hubZones[0].unlockRep, hub.entryRep, `Hub ${hub.hubNum} entry REP`);
    assert.ok(hubZones.every((zone, index) => index === 0 || zone.unlockRep > hubZones[index - 1].unlockRep),
      `Hub ${hub.hubNum} territory REP must increase`);
  }
});

test('six rig tiers validate the live RIG_TIERS source data and Gear budget', () => {
  const match = source.match(/const\s+RIG_TIERS\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(match, 'Could not read RIG_TIERS from game.js');
  const rigs = vm.runInNewContext(match[1]);
  assert.equal(rigs.length, 6);
  assert.deepEqual(Array.from(rigs, rig => rig.reqLvl), [1, 5, 9, 13, 17, 21]);
  assert.deepEqual(Array.from(rigs.slice(1), rig => rig.partCost), [1, 2, 3, 4, 5]);
  assert.equal(rigs.slice(1).reduce((sum, rig) => sum + rig.partCost, 0), 15);
  for (let i = 0; i < rigs.length; i++) {
    assert.equal(rigs[i].tier, i + 1);
    if (i > 0) assert.equal(rigs[i].reqLvl, rigs[i - 1].reqLvl + 4);
  }
});

test('career call milestones award exactly 15 Gold Gears by call 275 and never repeat', () => {
  const rewards={10:1,30:2,60:2,100:3,175:3,275:4};
  const state={activeJob:null,cash:0,rep:0,jobsCompleted:0,parts:0,rigCondition:100,streak:0,claimedCareerGearMilestones:[],ratings:[],jobs:[],contract:null};
  const finish=gameFunction('completeJob',{
    state,stopHoldPsi:()=>{},SoundFX:{success:()=>{}},getFleetOverheadFee:()=>0,getZone:()=>({mult:1}),
    getStreakGearReward:()=>0,MAX_STREAK_ROLLOVER:20,refreshJobs:()=>{},saveState:()=>{},updateHUD:()=>{},openModal:()=>{}
  });
  for(let call=1;call<=275;call++){
    state.activeJob={isTutorial:false,pay:0,surgeMultiplier:1,timeLeft:0,timeLimit:100,penalties:0,repPenalties:0,baseRep:0,dmg:{action:'plug'},veh:{heavy:false},fixed:true,step:5,torqueIdx:5,jackLowered:true,title:'Milestone test'};
    finish();
    assert.equal(state.jobsCompleted,call);
    assert.equal(state.parts,Object.entries(rewards).filter(([m])=>call>=Number(m)).reduce((n,[,v])=>n+v,0));
  }
  assert.equal(state.parts,15);
  assert.deepEqual(state.claimedCareerGearMilestones,[10,30,60,100,175,275]);
  state.activeJob={isTutorial:false,pay:0,surgeMultiplier:1,timeLeft:0,timeLimit:100,penalties:0,repPenalties:0,baseRep:0,dmg:{action:'plug'},veh:{heavy:false},fixed:true,step:5,torqueIdx:5,jackLowered:true,title:'Post-milestone test'};
  finish();
  assert.equal(state.parts,15);
});

test('clean streak pays one Gear at 20 while preserving independent career milestone awards', () => {
  const state={activeJob:null,cash:0,rep:0,jobsCompleted:0,parts:0,rigCondition:100,streak:0,claimedCareerGearMilestones:[],ratings:[],jobs:[],contract:null};
  const finish=gameFunction('completeJob',{
    state,stopHoldPsi:()=>{},SoundFX:{success:()=>{}},getFleetOverheadFee:()=>0,getZone:()=>({mult:1}),
    getStreakGearReward:n=>n%20===0?1:0,MAX_STREAK_ROLLOVER:20,refreshJobs:()=>{},saveState:()=>{},updateHUD:()=>{},openModal:()=>{}
  });
  const careerGearAt=n=>Object.entries({10:1,30:2,60:2,100:3,175:3,275:4})
    .filter(([milestone])=>n>=Number(milestone)).reduce((sum,[,reward])=>sum+reward,0);
  for(let call=1;call<=20;call++){
    state.activeJob={isTutorial:false,pay:0,surgeMultiplier:1,timeLeft:0,timeLimit:100,penalties:0,repPenalties:0,baseRep:0,dmg:{action:'plug'},veh:{heavy:false},fixed:true,step:5,torqueIdx:5,jackLowered:true,title:'Clean streak test'};
    finish();
    assert.equal(state.parts,careerGearAt(call)+(call===20?1:0),`first clean streak call ${call}`);
  }
  assert.equal(state.streak,0);
  for(let call=21;call<=39;call++){
    state.activeJob={isTutorial:false,pay:0,surgeMultiplier:1,timeLeft:0,timeLimit:100,penalties:0,repPenalties:0,baseRep:0,dmg:{action:'plug'},veh:{heavy:false},fixed:true,step:5,torqueIdx:5,jackLowered:true,title:'Second streak test'};
    finish();
    assert.equal(state.parts,careerGearAt(call)+1,`second clean streak call ${call}`);
  }
  state.activeJob={isTutorial:false,pay:0,surgeMultiplier:1,timeLeft:0,timeLimit:100,penalties:0,repPenalties:0,baseRep:0,dmg:{action:'plug'},veh:{heavy:false},fixed:true,step:5,torqueIdx:5,jackLowered:true,title:'Second streak reward'};
  finish();
  assert.equal(state.parts,careerGearAt(40)+2);
  assert.equal(state.streak,0);
});


test('guest play remains available and optional Firebase account controls are wired into the page', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /Your progress and game economy save automatically in this browser/);
  assert.match(html, /No account or sign-up is required/);
  assert.match(html, /id="cloud-account-card"/);
  for (const id of ['cloud-signed-out', 'cloud-signed-in', 'cloud-email', 'cloud-password', 'cloud-create', 'cloud-signin', 'cloud-reset', 'cloud-signout', 'cloud-account-status', 'cloud-user-email']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Missing account UI element: ' + id);
  }
  assert.match(html, /<script type="module" src="firebase-cloud\.js"><\/script>/);
  assert.match(html, /<main id="page-dispatch" class="page active">/,
    'Dispatch must remain the active initial page without an account gate');
  assert.match(source, /localStorage\.setItem\('delwin_v4_save', JSON\.stringify\(state\)\)/,
    'Guest local saving must remain independent of cloud sync');
});

test('temporary Firebase diagnostics are not exposed in the player account panel', () => {
  assert.doesNotMatch(cloudSource, /TEMPORARY PREVIEW-ONLY AUTH API KEY DIAGNOSTIC/);
  assert.doesNotMatch(cloudSource, /RUN AUTH CONNECTION CHECK/);
  assert.match(cloudSource, /onAuthStateChanged\(auth, user =>/);
  assert.match(cloudSource, /Sign in to back up your career across devices/);
});


// Execute the real cloud module against a deterministic Firebase/DOM harness.
// This validates module behavior and account/save transitions without claiming
// that the live Firebase project or a real browser has been exercised.
function cloudModuleHarness({ local = {}, cloud = {}, user = null, online = true, failWrites = 0 } = {}) {
  const store = new Map(Object.entries(local));
  const sessionStore = new Map();
  const cloudDocs = new Map(Object.entries(cloud));
  const elements = new Map();
  const timers = new Map();
  const calls = { gets: [], writes: [], transactions: 0, reloads: 0, modal: '', listeners: {}, windowListeners: {}, snapshots: [] };
  const elementIds = [
    'cloud-account-card', 'cloud-create', 'cloud-signin', 'cloud-reset', 'cloud-signout',
    'cloud-email', 'cloud-password', 'cloud-account-status', 'cloud-signed-out',
    'cloud-signed-in', 'cloud-user-email'
  ];
  for (const id of elementIds) {
    elements.set(id, {
      id, value: '', hidden: false, textContent: '', style: {}, dataset: {},
      addEventListener(type, callback) { calls.listeners[id + ':' + type] = callback; }
    });
  }
  const document = { getElementById: id => elements.get(id) || null };
  const localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
  const auth = { currentUser: user };
  let authObserver = null;
  const db = {};
  const pathKey = ref => ref.path;
  const context = {
    document, localStorage, sessionStorage: {
      getItem: key => sessionStore.has(key) ? sessionStore.get(key) : null,
      setItem: (key, value) => sessionStore.set(key, String(value)),
      removeItem: key => sessionStore.delete(key)
    }, navigator: { onLine: online },
    crypto: { randomUUID: () => 'test-device-id' },
    Date, Math, JSON, console,
    setTimeout(callback, delay) { const id = timers.size + 1; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    window: {
      addEventListener(type, callback) { calls.windowListeners[type] = callback; if (type === 'online') this.__onlineHandler = callback; },
      openModal(html) { calls.modal = html; },
      closeModal() { calls.modal = ''; }
    },
    location: { reload() { calls.reloads += 1; } },
    initializeApp: config => ({ config }),
    getAuth: () => auth,
    getFirestore: () => db,
    onAuthStateChanged(_auth, callback) { authObserver = callback; callback(auth.currentUser); },
    onSnapshot: (ref, next, error) => {
      calls.snapshots.push({ path: pathKey(ref), next, error });
      return () => { calls.snapshots = calls.snapshots.filter(item => item.next !== next); };
    },
    createUserWithEmailAndPassword: async (_auth, email) => {
      auth.currentUser = { uid: 'account-new', email };
      authObserver(auth.currentUser);
      return { user: auth.currentUser };
    },
    signInWithEmailAndPassword: async (_auth, email) => {
      auth.currentUser = { uid: 'account-signin', email };
      authObserver(auth.currentUser);
      return { user: auth.currentUser };
    },
    sendPasswordResetEmail: async () => {},
    signOut: async () => { auth.currentUser = null; authObserver(null); },
    doc: (_db, ...parts) => ({ path: parts.join('/') }),
    getDoc: async ref => {
      calls.gets.push(pathKey(ref));
      const value = cloudDocs.get(pathKey(ref));
      return { exists: () => value !== undefined, data: () => value };
    },
    runTransaction: async (_db, callback) => {
      calls.transactions += 1;
      const writes = [];
      const transaction = {
        get: async ref => {
          const value = cloudDocs.get(pathKey(ref));
          return { exists: () => value !== undefined, data: () => value };
        },
        set: (ref, value) => writes.push({ ref, value })
      };
      await callback(transaction);
      for (const item of writes) {
        calls.writes.push({ path: pathKey(item.ref), value: item.value });
        if (failWrites > 0) { failWrites -= 1; throw new Error('simulated offline write'); }
        cloudDocs.set(pathKey(item.ref), item.value);
      }
    },
    serverTimestamp: () => ({ seconds: 123456 }),
    localSnapshot: undefined
  };
  const executable = cloudSource.slice(cloudSource.indexOf('const firebaseConfig'));
  vm.runInNewContext(executable, context, { timeout: 1000 });
  return { store, cloudDocs, elements, calls, timers, context, auth, trigger: async (id, type = 'click') => {
    const callback = calls.listeners[id + ':' + type];
    assert.equal(typeof callback, 'function', 'Missing event handler for ' + id);
    await callback();
    await new Promise(resolve => setImmediate(resolve));
  } };
}

test('Firebase module leaves guest careers local until the player opts into an account', async () => {
  const career = { cash: 425, jobsCompleted: 7 };
  const h = cloudModuleHarness({ local: { delwin_v4_save: JSON.stringify(career) } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.store.get('delwin_v4_save'), JSON.stringify(career));
  assert.equal(h.calls.gets.length, 0);
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.elements.get('cloud-signed-out').hidden, false);
  assert.match(h.elements.get('cloud-account-status').textContent, /Sign in to back up/);
});

test('creating an account links and backs up the existing guest career', async () => {
  const career = { cash: 875, jobsCompleted: 19, parts: 4 };
  const h = cloudModuleHarness({ local: { delwin_v4_save: JSON.stringify(career) } });
  h.elements.get('cloud-email').value = 'player@example.com';
  h.elements.get('cloud-password').value = 'test-password';
  await h.trigger('cloud-create');
  await new Promise(resolve => setImmediate(resolve));
  const ref = 'users/account-new/saves/current';
  assert.equal(h.store.get('delwin_v4_save'), JSON.stringify(career));
  assert.equal(h.store.get('delwin_cloud_owner_uid'), 'account-new');
  assert.equal(h.elements.get('cloud-signed-in').hidden, false);
  assert.equal(h.calls.writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.cloudDocs.get(ref).payload)), career);
});

test('failed initial account backup remains queued and retries after reconnect', async () => {
  const career = { cash: 875, jobsCompleted: 19, parts: 4 };
  const h = cloudModuleHarness({
    local: { delwin_v4_save: JSON.stringify(career) },
    failWrites: 1,
    online: true
  });
  h.elements.get('cloud-email').value = 'player@example.com';
  h.elements.get('cloud-password').value = 'test-password';
  await h.trigger('cloud-create');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.store.get('delwin_cloud_owner_uid'), 'account-new');
  assert.equal(h.store.get('delwin_v4_save'), JSON.stringify(career));
  assert.equal(h.cloudDocs.has('users/account-new/saves/current'), false);
  assert.ok(h.store.has('delwin_cloud_pending_outbox_v1'));
  h.context.navigator.onLine = true;
  await h.context.window.__onlineHandler();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(h.cloudDocs.get('users/account-new/saves/current').payload)), career);
});

test('signing into a different account preserves the established local career', async () => {
  const localCareer = { cash: 900, jobsCompleted: 25 };
  const cloudCareer = { cash: 120, jobsCompleted: 4 };
  const h = cloudModuleHarness({
    local: { delwin_v4_save: JSON.stringify(localCareer), delwin_cloud_owner_uid: 'account-A' },
    cloud: { 'users/account-B/saves/current': { schemaVersion: 1, payload: cloudCareer, updatedAt: {}, deviceId: 'other-device' } },
    user: { uid: 'account-B', email: 'b@example.com' }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.writes.length, 0);
  assert.match(h.calls.modal, /Device progress protected/);
  assert.doesNotMatch(h.calls.modal, /RESTORE CLOUD CAREER|KEEP DEVICE SAVE AND BACK UP/);
  assert.deepEqual(JSON.parse(h.store.get('delwin_v4_save')), localCareer);
  assert.equal(h.store.get('delwin_cloud_owner_uid'), 'account-A');
  assert.equal(h.calls.reloads, 0);
});

test('restore marker blocks startup writes until a deliberately selected restore is reconciled', () => {
  const start = cloudSource.indexOf('function isRestorePending()');
  const end = cloudSource.indexOf('window.DelWinCloud =', start);
  const guard = cloudSource.slice(start, end);
  assert.match(guard, /localStorage.getItem\(RESTORE_MARKER_KEY\)/);
  assert.match(guard, /return !!marker\?\.uid && \(!currentUser \|\| marker.uid === currentUser.uid\)/);
});

test('gameplay save writes local state before queueing any cloud backup', () => {
  const save = extractFunction('saveState');
  const localWrite = save.indexOf("localStorage.setItem('delwin_v4_save'");
  const cloudQueue = save.indexOf('window.DelWinCloud.queueSave');
  assert.ok(localWrite >= 0 && cloudQueue > localWrite);
  assert.match(save, /reportLocalSaveError/);
  assert.doesNotMatch(save, /await |getDoc|runTransaction/);
});

test('returning linked account preserves the local career without a restore prompt or reload', async () => {
  const deviceCareer = { cash: 900, jobsCompleted: 25, parts: 2 };
  const cloudCareer = { cash: 640, jobsCompleted: 12, parts: 3 };
  const h = cloudModuleHarness({
    local: { delwin_v4_save: JSON.stringify(deviceCareer), delwin_cloud_owner_uid: 'account-C' },
    cloud: { 'users/account-C/saves/current': { schemaVersion: 1, payload: cloudCareer, updatedAt: {}, deviceId: 'account-C-device' } },
    user: { uid: 'account-C', email: 'c@example.com' }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.modal, '');
  assert.deepEqual(JSON.parse(h.store.get('delwin_v4_save')), deviceCareer);
  assert.equal(h.calls.reloads, 0);
  assert.equal(h.calls.gets.length, 1);
});

test('cloud reconnect flushes queued saves without re-reading the account career', async () => {
  const career = { cash: 50 };
  const h = cloudModuleHarness({
    local: { delwin_v4_save: JSON.stringify(career), delwin_cloud_owner_uid: 'account-D' },
    user: { uid: 'account-D', email: 'd@example.com' },
    cloud: { 'users/account-D/saves/current': { schemaVersion: 1, revision: 1, payload: career, updatedAt: {}, deviceId: 'd' } },
    online: false
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.gets.length, 1);
  h.context.window.DelWinCloud.queueSave({ cash: 75 });
  h.context.navigator.onLine = true;
  await h.context.window.__onlineHandler();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.gets.length, 1);
  assert.equal(h.calls.writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.writes[0].value.payload)), { cash: 75 });
});

test('fresh device restores a valid cloud career and records its account owner', async () => {
  const cloudCareer = { cash: 640, jobsCompleted: 12, parts: 3 };
  const h = cloudModuleHarness({
    cloud: { 'users/account-C/saves/current': { schemaVersion: 1, payload: cloudCareer, updatedAt: { seconds: 10 }, deviceId: 'first-device' } },
    user: { uid: 'account-C', email: 'c@example.com' }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(h.store.get('delwin_v4_save')), cloudCareer);
  assert.equal(h.store.get('delwin_cloud_owner_uid'), 'account-C');
  assert.equal(h.calls.reloads, 1);
  assert.equal(h.calls.writes.length, 0);
});

test('stale device revision cannot overwrite a newer cloud career', async () => {
  const deviceCareer = { cash: 500, jobsCompleted: 8 };
  const newerCloud = { cash: 950, jobsCompleted: 17 };
  const h = cloudModuleHarness({
    local: {
      delwin_v4_save: JSON.stringify(deviceCareer),
      delwin_cloud_owner_uid: 'account-revision',
      delwin_cloud_synced_snapshot: JSON.stringify({ cash: 900, jobsCompleted: 16 })
    },
    user: { uid: 'account-revision', email: 'revision@example.com' },
    cloud: { 'users/account-revision/saves/current': { schemaVersion: 1, revision: 4, payload: { cash: 900, jobsCompleted: 16 }, updatedAt: {}, deviceId: 'newer-device' } },
    online: false
  });
  for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve));
  h.context.window.DelWinCloud.queueSave({ cash: 525, jobsCompleted: 9 });
  h.cloudDocs.set('users/account-revision/saves/current', {
    schemaVersion: 1, revision: 5, payload: newerCloud, updatedAt: {}, deviceId: 'newer-device'
  });
  h.context.navigator.onLine = true;
  await h.context.window.__onlineHandler();
  for (let pass = 0; pass < 10 && h.timers.size; pass += 1) {
    const scheduled = Array.from(h.timers.values());
    h.timers.clear();
    for (const timer of scheduled) await timer.callback();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(h.calls.transactions, 1, 'The queued save must attempt its compare-and-set transaction');
  assert.equal(h.cloudDocs.get('users/account-revision/saves/current').revision, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(h.cloudDocs.get('users/account-revision/saves/current').payload)), newerCloud);
  assert.match(h.calls.modal, /Device progress protected/);
  assert.doesNotMatch(h.elements.get('cloud-account-status').textContent, /Cloud save synced/i);
});

test('mobile repair layout brings action controls closer to the first phone viewport', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*480px\)[\s\S]*?#page-bay\s*\{[^}]*padding:\s*9px/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)[\s\S]*?\.bay-stage\s*\{[^}]*height:\s*190px/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)[\s\S]*?#bay-controls\s*\{[^}]*padding:\s*10px/);
  assert.match(css, /@media\s*\(max-width:\s*360px\)[\s\S]*?\.bay-stage\s*\{[^}]*height:\s*180px/);
});

test('a fresh device restores a valid cloud career and records its account owner', async () => {
  const cloudCareer = { cash: 640, jobsCompleted: 12, parts: 3 };
  const cloudDoc = { schemaVersion: 1, payload: cloudCareer, updatedAt: { seconds: 10 }, deviceId: 'first-device' };
  const h = cloudModuleHarness({
    cloud: { 'users/account-C/saves/current': cloudDoc },
    user: { uid: 'account-C', email: 'c@example.com' }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(h.store.get('delwin_v4_save')), cloudCareer);
  assert.equal(h.store.get('delwin_cloud_owner_uid'), 'account-C');
  assert.equal(h.calls.reloads, 1);
  assert.equal(h.calls.writes.length, 0);
});

test('offline saves stay local and do not attempt a cloud write', async () => {
  const h = cloudModuleHarness({
    local: { delwin_v4_save: JSON.stringify({ cash: 50 }), delwin_cloud_owner_uid: 'account-D' },
    user: { uid: 'account-D', email: 'd@example.com' },
    cloud: { 'users/account-D/saves/current': { schemaVersion: 1, payload: { cash: 50 }, updatedAt: {}, deviceId: 'd' } },
    online: false
  });
  await new Promise(resolve => setImmediate(resolve));
  h.context.window.DelWinCloud.queueSave({ cash: 75 });
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.store.get('delwin_v4_save'), JSON.stringify({ cash: 50 }));
});

test('mobile interaction targets, viewport, and touch cancellation safeguards stay intact', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(html, /name="viewport"[^>]*width=device-width/,
    'The page must use the device viewport');
  assert.match(css, /\.app-shell\s*\{[\s\S]*?max-width:\s*480px/,
    'The mobile game shell must remain constrained to a phone-sized layout');
  assert.match(css, /html,\s*body\s*\{[\s\S]*?overflow-x:\s*hidden/,
    'The page must not introduce horizontal scrolling');
  assert.match(css, /\.lug-btn\s*\{[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/,
    'Wheel lug hit targets must remain at least 44px square');
  assert.match(css, /\.hold-btn\s*\{[\s\S]*?min-height:\s*48px[\s\S]*?touch-action:\s*none/,
    'Continuous PSI controls must retain large touch targets and suppress browser gestures');
  assert.match(css, /\.primary-btn\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.secondary-btn\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.nav-btn\s*\{[\s\S]*?min-height:\s*48px/,
    'Bottom navigation must retain a usable touch height');
  assert.match(source, /onpointerup="stopHoldPsi\(\)"/);
  assert.match(source, /onpointerleave="stopHoldPsi\(\)"/);
  assert.match(source, /onpointercancel="stopHoldPsi\(\)"/,
    'PSI hold must stop when a touch is cancelled');
  assert.match(source, /window\.addEventListener\('blur', stopHoldPsi\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange',[\s\S]*?stopHoldPsi\(\)/,
    'PSI hold must stop when the app is backgrounded');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    'Reduced-motion preferences must be respected');
});

test('linked devices observe cloud revisions and protect both careers on true conflicts', () => {
  assert.match(cloudSource, /onSnapshot, runTransaction/);
  assert.match(cloudSource, /function watchCloud\(user\)/);
  assert.match(cloudSource, /revision <= lastObservedCloudRevision/);
  assert.match(cloudSource, /showConflict\(local\.raw, cloud, local\.ownerUid\)/);
  assert.match(cloudSource, /save\/revision-conflict/);
  assert.match(cloudSource, /cloudWatchUnsubscribe\?\.\(\)/);
});

test('each device records the cloud revision acknowledged by compare-and-set', () => {
  assert.match(cloudSource, /const LOCAL_REVISION_KEY = "delwin_cloud_revision"/);
  assert.match(cloudSource, /localStorage\.setItem\(LOCAL_REVISION_KEY, String\(nextRevision\)\)/);
  assert.match(cloudSource, /localStorage\.setItem\(LOCAL_REVISION_KEY, String\(revision\)\)/);
  assert.match(cloudSource, /localStorage\.setItem\(SYNCED_SNAPSHOT_KEY, JSON\.stringify\(payload\)\)/);
});

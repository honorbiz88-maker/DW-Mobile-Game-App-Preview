'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');

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

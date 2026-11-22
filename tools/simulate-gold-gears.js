#!/usr/bin/env node
'use strict';

// Gear-only career model for the Preview economy.
// Run: node tools/simulate-gold-gears.js
// This intentionally does not model cash, REP, inventory, or individual bay mistakes.

const CAREER_AWARDS = new Map([[10, 1], [30, 2], [60, 2], [100, 3], [175, 3], [275, 4]]);
const CONTRACTS = [
  { type: 'clean_streak', target: 4 },
  { type: 'plugs', target: 3 },
  { type: 'swaps', target: 3 },
  { type: 'fast', target: 3 },
  { type: 'heavy', target: 2 }
];
const HUB_GEAR_COST = [0, 5, 10, 15, 20, 25];

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function simulate(seed, options = {}) {
  const {
    cleanRate = 0.75,
    fastRate = 0.65,
    claimDelay = 0,
    streakRewards = true,
    maxCalls = 30000,
    stopAt75 = false
  } = options;
  const random = mulberry32(seed);
  let gearBalance = 0;
  let totalEarned = 0;
  let contractsClaimed = 0;
  let hub = 1;
  let cleanStreak = 0;
  let contract = CONTRACTS[0];
  let contractProgress = 0;
  let contractReady = false;
  let claimDelayLeft = 0;
  let firstHub2Call = null;

  for (let call = 1; call <= maxCalls; call += 1) {
    // The game requires manual claim; a ready contract blocks the next assignment.
    if (contractReady) {
      if (claimDelayLeft <= 0) {
        contractsClaimed += 1;
        if (contractsClaimed % 6 === 0) {
          gearBalance += 1;
          totalEarned += 1;
        }
        const available = CONTRACTS.filter((entry) =>
          entry.type !== contract.type && (entry.type !== 'heavy' || hub >= 2)
        );
        contract = available[Math.floor(random() * available.length)];
        contractProgress = 0;
        contractReady = false;
      } else {
        claimDelayLeft -= 1;
      }
    }

    const careerAward = CAREER_AWARDS.get(call) || 0;
    gearBalance += careerAward;
    totalEarned += careerAward;

    // Spend Gears in progression order: four tool breakthroughs plus rig commission per Hub.
    while (hub < 6 && gearBalance >= HUB_GEAR_COST[hub + 1]) {
      gearBalance -= HUB_GEAR_COST[hub + 1];
      hub += 1;
      if (hub === 2 && firstHub2Call === null) firstHub2Call = call;
    }

    const clean = random() < cleanRate;
    const fast = random() < fastRate;
    const plug = random() < 0.20;
    const swap = !plug;
    const heavyVehicle = hub >= 2 && random() < 0.40;

    cleanStreak = clean ? cleanStreak + 1 : 0;
    if (streakRewards && cleanStreak === 20) {
      gearBalance += 1;
      totalEarned += 1;
      cleanStreak = 0;
    }

    if (!contractReady) {
      if (contract.type === 'clean_streak') {
        contractProgress = clean ? contractProgress + 1 : 0;
      } else if (contract.type === 'plugs' && plug) {
        contractProgress += 1;
      } else if (contract.type === 'swaps' && swap) {
        contractProgress += 1;
      } else if (contract.type === 'fast' && fast) {
        contractProgress += 1;
      } else if (contract.type === 'heavy' && heavyVehicle && swap) {
        contractProgress += 1;
      }
      if (contractProgress >= contract.target) {
        contractReady = true;
        claimDelayLeft = claimDelay;
      }
    }

    if (stopAt75 && totalEarned >= 75) {
      return { calls: call, totalEarned, contractsClaimed, hub, gearBalance, firstHub2Call };
    }
  }

  return { calls: maxCalls, totalEarned, contractsClaimed, hub, gearBalance, firstHub2Call };
}

function summarize(name, options, runs, maxCalls = 2600) {
  const rows = Array.from({ length: runs }, (_, index) => simulate(20261122 + index, { ...options, maxCalls }));
  const gears = rows.map((row) => row.totalEarned);
  const contracts = rows.map((row) => row.contractsClaimed);
  const hubs = rows.map((row) => row.hub);
  const to75 = Array.from({ length: 2000 }, (_, index) =>
    simulate(90261122 + index, { ...options, maxCalls: 30000, stopAt75: true }).calls
  );
  return {
    scenario: name,
    meanGearsAt2600: Number((gears.reduce((a, b) => a + b, 0) / gears.length).toFixed(1)),
    p10Gears: Number(percentile(gears, 0.10).toFixed(1)),
    medianGears: Number(percentile(gears, 0.50).toFixed(1)),
    p90Gears: Number(percentile(gears, 0.90).toFixed(1)),
    meanContracts: Number((contracts.reduce((a, b) => a + b, 0) / contracts.length).toFixed(1)),
    medianHub: percentile(hubs, 0.50),
    medianCallsTo75: Math.round(percentile(to75, 0.50)),
    p10CallsTo75: Math.round(percentile(to75, 0.10)),
    p90CallsTo75: Math.round(percentile(to75, 0.90))
  };
}

const scenarios = [
  ['Strong', { cleanRate: 0.90, fastRate: 0.85, claimDelay: 0 }],
  ['Typical', { cleanRate: 0.75, fastRate: 0.65, claimDelay: 0 }],
  ['Typical, no streak rewards', { cleanRate: 0.75, fastRate: 0.65, claimDelay: 0, streakRewards: false }],
  ['Rough', { cleanRate: 0.55, fastRate: 0.40, claimDelay: 2 }],
  ['Poor', { cleanRate: 0.35, fastRate: 0.30, claimDelay: 5 }]
];

for (const [name, options] of scenarios) {
  console.log(JSON.stringify(summarize(name, options, 5000)));
}

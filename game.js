// DelWin Mobile: Roadside Tire Rescue
// Full Build with:
// - Hub-aligned Tool Tiers (Hubs 1-6 map directly to Tool Tiers 1-6 across 24 zones)
// - Calibrated Gradual Milestone Curve: Early Hook (4-5 calls) -> Early-Mid (8-10) -> Mid (20-25) -> Upper-Mid (50-60) -> Late (150-200) -> Endgame (300-350)
// - Tightened 3-call clean-streak Gold Gear interval + streak milestone bonuses (9 -> +2, 15 -> +3)
// - Zero broken-image text flash (empty alt + cached src swap)
// - Press-and-Hold smooth PSI inflation & bleeding (eliminates mobile double-tap zoom)
// - Top currency pills ($ Cash, ⚙️ Gold Gears, ⚡ Tokens) linked directly to Dispatch Shop
// - 2X Surge Ad Charges (3 max, 1 ad = +1 charge, 8h recharge per charge, or 3 ⚡ instant surge)
// - Token Ad Drop (3 max, 1 ad = +3 ⚡, 6h recharge per charge)
// - Per-call Fleet Operating Overhead based on Rig Tier & Zone Multiplier
// - Preserves all exact asset filenames: rig-t1..t6, tool-impact/jack/comp/radar-t1..t6, veh-*, bay-tire-*, bay-hd-tire-*

const SoundFX = (() => {
  let enabled = true;
  let ctx = null;
  function beep(freq, dur = 0.08, type = 'triangle', gainVal = 0.08) {
    if (!enabled) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = gainVal;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  }
  return {
    toggle() { enabled = !enabled; return enabled; },
    chock() { beep(180, 0.07, 'square', 0.07); },
    jack() { beep(130, 0.11, 'sawtooth', 0.08); },
    impact() { beep(240, 0.06, 'square', 0.09); setTimeout(() => beep(310, 0.05, 'square', 0.07), 45); },
    scan() { beep(520, 0.09, 'sine', 0.07); setTimeout(() => beep(740, 0.12, 'sine', 0.07), 80); },
    air() { beep(420, 0.06, 'sine', 0.045); },
    torqueClick() { beep(640, 0.06, 'triangle', 0.09); },
    success() { beep(523, 0.09); setTimeout(() => beep(659, 0.09), 90); setTimeout(() => beep(784, 0.16), 180); },
    error() { beep(140, 0.18, 'sawtooth', 0.1); }
  };
})();

const TIER_NAMES = ['Novice', 'Intermediate', 'Pro', 'Commercial', 'Heavy-Duty', 'Master'];

const HUB_TIERS = [
  { hubNum: 1, key: 'HUB 1 · ATLANTA METRO', name: 'Atlanta Metro', toolTier: 1, levels: 'Lvl 1–4', entryRep: 0 },
  { hubNum: 2, key: 'HUB 2 · GEORGIA FREIGHT', name: 'Georgia Freight', toolTier: 2, levels: 'Lvl 5–8', entryRep: 1800 },
  { hubNum: 3, key: 'HUB 3 · COASTAL PORTS', name: 'Coastal Ports', toolTier: 3, levels: 'Lvl 9–12', entryRep: 7500 },
  { hubNum: 4, key: 'HUB 4 · SOUTHEAST EXPRESS', name: 'Southeast Express', toolTier: 4, levels: 'Lvl 13–16', entryRep: 21000 },
  { hubNum: 5, key: 'HUB 5 · GULF CORRIDOR', name: 'Gulf Corridor', toolTier: 5, levels: 'Lvl 17–20', entryRep: 45000 },
  { hubNum: 6, key: 'HUB 6 · APEX SYNDICATE', name: 'Apex Syndicate', toolTier: 6, levels: 'Lvl 21–24', entryRep: 80000 }
];

const RIG_TIERS = [
  { tier: 1, name: 'Tier 1: Novice Roadside Van', img: 'assets/rig-t1.png', color: '#cbd5e1', reqLvl: 1, req: 'Starting Rig', cashCost: 0, partCost: 0, tokenCost: 0, mult: 1.00, capPlugs: 6, capStd: 3, capHd: 1, perk: 'Standard highway response rig (1.00x Payouts).' },
  { tier: 2, name: 'Tier 2: Intermediate Utility Pickup', img: 'assets/rig-t2.png', color: '#38bdf8', reqLvl: 5, req: 'All Tools Lvl 5+', cashCost: 2200, partCost: 2, tokenCost: 12, mult: 1.12, capPlugs: 9, capStd: 4, capHd: 2, perk: '1.12x Base Payouts & Twin Amber Strobes.' },
  { tier: 3, name: 'Tier 3: Pro Extended Tire Truck', img: 'assets/rig-t3.png', color: '#f59e0b', reqLvl: 9, req: 'All Tools Lvl 9+', cashCost: 9500, partCost: 4, tokenCost: 25, mult: 1.25, capPlugs: 12, capStd: 6, capHd: 3, perk: '1.25x Base Payouts & Exterior Spare Tire Rack.' },
  { tier: 4, name: 'Tier 4: Commercial Dually Rig', img: 'assets/rig-t4.png', color: '#a855f7', reqLvl: 13, req: 'All Tools Lvl 13+', cashCost: 36000, partCost: 8, tokenCost: 45, mult: 1.40, capPlugs: 16, capStd: 8, capHd: 4, perk: '1.40x Base Payouts & Dual-Wheel Hydraulic Lift.' },
  { tier: 5, name: 'Tier 5: Heavy-Duty Fleet Rescue Box', img: 'assets/rig-t5.png', color: '#ef4444', reqLvl: 17, req: 'All Tools Lvl 17+', cashCost: 135000, partCost: 14, tokenCost: 75, mult: 1.56, capPlugs: 22, capStd: 10, capHd: 6, perk: '1.56x Base Payouts & Commercial Fleet Priority.' },
  { tier: 6, name: 'Tier 6: Master Apex Syndicate Flagship', img: 'assets/rig-t6.png', color: '#fde047', reqLvl: 21, req: 'All Tools Lvl 21+', cashCost: 450000, partCost: 22, tokenCost: 110, mult: 1.74, capPlugs: 30, capStd: 14, capHd: 8, perk: '1.74x Base Payouts & Maximum Corridor Prestige.' }
];

const ZONES = [
  // Hub 1 (Atlanta Metro · Tool Tier 1 · Lvl 1-4)
  { id: 'z1', hubNum: 1, hub: 'HUB 1 · ATLANTA METRO', name: 'I-285 North Perimeter', mult: 1.00, unlockRep: 0, rustChance: 0.15, desc: 'Steady commuter flats and shoulder punctures.' },
  { id: 'z2', hubNum: 1, hub: 'HUB 1 · ATLANTA METRO', name: 'I-75 Downtown Connector', mult: 1.07, unlockRep: 450, rustChance: 0.20, desc: 'High-density commuter & SUV roadside calls.' },
  { id: 'z3', hubNum: 1, hub: 'HUB 1 · ATLANTA METRO', name: 'GA-400 Buckhead Express', mult: 1.14, unlockRep: 900, rustChance: 0.22, desc: 'Luxury sedans and evening rush-hour flats.' },
  { id: 'z4', hubNum: 1, hub: 'HUB 1 · ATLANTA METRO', name: 'I-285 Airport South Loop', mult: 1.22, unlockRep: 1350, rustChance: 0.28, desc: 'Shuttle vans, pickups, and cargo sprinters.' },
  // Hub 2 (Georgia Freight · Tool Tier 2 · Lvl 5-8)
  { id: 'z5', hubNum: 2, hub: 'HUB 2 · GEORGIA FREIGHT', name: 'I-20 West Freight Corridor', mult: 1.30, unlockRep: 1800, rustChance: 0.35, desc: 'Commercial box trucks and highway blowouts.' },
  { id: 'z6', hubNum: 2, hub: 'HUB 2 · GEORGIA FREIGHT', name: 'I-85 Gwinnett Logistics', mult: 1.38, unlockRep: 3200, rustChance: 0.38, desc: 'Distribution hub semi-trailers & duals.' },
  { id: 'z7', hubNum: 2, hub: 'HUB 2 · GEORGIA FREIGHT', name: 'I-75 Macon Bypass', mult: 1.47, unlockRep: 4650, rustChance: 0.40, desc: 'Long-haul freight and heavy pickup rescues.' },
  { id: 'z8', hubNum: 2, hub: 'HUB 2 · GEORGIA FREIGHT', name: 'I-16 Central Freightway', mult: 1.56, unlockRep: 6100, rustChance: 0.44, desc: 'High-speed interstate retread delaminations.' },
  // Hub 3 (Coastal Ports · Tool Tier 3 · Lvl 9-12)
  { id: 'z9', hubNum: 3, hub: 'HUB 3 · COASTAL PORTS', name: 'Savannah Port Gate 1', mult: 1.65, unlockRep: 7500, rustChance: 0.55, desc: 'Salt-air 18-wheeler port containers & seized lugs.' },
  { id: 'z10', hubNum: 3, hub: 'HUB 3 · COASTAL PORTS', name: 'Talmadge Bridge Approach', mult: 1.75, unlockRep: 10900, rustChance: 0.58, desc: 'Heavy container tractor-trailers.' },
  { id: 'z11', hubNum: 3, hub: 'HUB 3 · COASTAL PORTS', name: 'Brunswick Auto Terminal', mult: 1.85, unlockRep: 14250, rustChance: 0.60, desc: 'Fleet carriers and multi-axle haulers.' },
  { id: 'z12', hubNum: 3, hub: 'HUB 3 · COASTAL PORTS', name: 'Pooler Logistics Park', mult: 1.95, unlockRep: 17600, rustChance: 0.62, desc: '24/7 commercial warehouse dispatch grid.' },
  // Hub 4 (Southeast Express · Tool Tier 4 · Lvl 13-16)
  { id: 'z13', hubNum: 4, hub: 'HUB 4 · SOUTHEAST EXPRESS', name: 'I-95 Coastal Freightway', mult: 2.06, unlockRep: 21000, rustChance: 0.65, desc: 'Interstate night-shift emergency fleet calls.' },
  { id: 'z14', hubNum: 4, hub: 'HUB 4 · SOUTHEAST EXPRESS', name: 'I-26 Charleston Spur', mult: 2.17, unlockRep: 27000, rustChance: 0.65, desc: 'Port-to-inland heavy commercial rigs.' },
  { id: 'z15', hubNum: 4, hub: 'HUB 4 · SOUTHEAST EXPRESS', name: 'I-77 Charlotte Corridor', mult: 2.28, unlockRep: 33000, rustChance: 0.68, desc: 'High-speed regional freight & VIP calls.' },
  { id: 'z16', hubNum: 4, hub: 'HUB 4 · SOUTHEAST EXPRESS', name: 'I-40 Piedmont Ridge', mult: 2.39, unlockRep: 39000, rustChance: 0.70, desc: 'Steep-grade heavy truck tire blowouts.' },
  // Hub 5 (Gulf Corridor · Tool Tier 5 · Lvl 17-20)
  { id: 'z17', hubNum: 5, hub: 'HUB 5 · GULF CORRIDOR', name: 'I-10 Jacksonville Interchange', mult: 2.51, unlockRep: 45000, rustChance: 0.72, desc: 'Cross-country 18-wheeler hub.' },
  { id: 'z18', hubNum: 5, hub: 'HUB 5 · GULF CORRIDOR', name: 'I-65 Mobile Bayway', mult: 2.63, unlockRep: 53750, rustChance: 0.75, desc: 'Coastal bridge heavy-duty rescue.' },
  { id: 'z19', hubNum: 5, hub: 'HUB 5 · GULF CORRIDOR', name: 'I-10 Baton Rouge Refinery', mult: 2.75, unlockRep: 62500, rustChance: 0.76, desc: 'Industrial tanker & commercial fleet calls.' },
  { id: 'z20', hubNum: 5, hub: 'HUB 5 · GULF CORRIDOR', name: 'I-45 Houston Ship Channel', mult: 2.87, unlockRep: 71250, rustChance: 0.78, desc: 'Maximum-volume freight tire emergencies.' },
  // Hub 6 (Apex Syndicate · Tool Tier 6 · Lvl 21-24)
  { id: 'z21', hubNum: 6, hub: 'HUB 6 · APEX SYNDICATE', name: 'Apex Night-Shift Sector A', mult: 2.99, unlockRep: 80000, rustChance: 0.80, desc: 'Executive fleet & high-priority contracts.' },
  { id: 'z22', hubNum: 6, hub: 'HUB 6 · APEX SYNDICATE', name: 'Apex Heavy Convoy Lane', mult: 3.12, unlockRep: 87000, rustChance: 0.82, desc: 'Multi-rig commercial rescue operations.' },
  { id: 'z23', hubNum: 6, hub: 'HUB 6 · APEX SYNDICATE', name: 'Apex Interstate Command', mult: 3.25, unlockRep: 94000, rustChance: 0.85, desc: 'Elite zero-margin-for-error dispatches.' },
  { id: 'z24', hubNum: 6, hub: 'HUB 6 · APEX SYNDICATE', name: 'Apex Pinnacle Terminal', mult: 3.40, unlockRep: 101000, rustChance: 0.88, desc: 'Top-tier syndicate payouts across all classes.' }
];

const VEHICLES = [
  { id: 'sedan', label: 'COMMUTER SEDAN', heavy: false, basePay: 75, targetPsi: 35, timeSec: 64, axleWeight: 1.0, lockChance: 0.25, bodyColor: '#64748b', img: 'assets/veh-sedan.png' },
  { id: 'suv', label: 'FAMILY SUV', heavy: false, basePay: 88, targetPsi: 36, timeSec: 60, axleWeight: 1.15, lockChance: 0.45, bodyColor: '#475569', img: 'assets/veh-suv.png' },
  { id: 'pickup', label: 'LIFTED 4X4 PICKUP', heavy: false, basePay: 100, targetPsi: 40, timeSec: 58, axleWeight: 1.30, lockChance: 0.35, bodyColor: '#b91c1c', img: 'assets/veh-pickup.png' },
  { id: 'boxtruck', label: 'COMMERCIAL BOX TRUCK', heavy: true, basePay: 155, targetPsi: 95, timeSec: 70, axleWeight: 1.75, lockChance: 0.15, bodyColor: '#cbd5e1', img: 'assets/veh-boxtruck.png' },
  { id: 'semi', label: '18-WHEELER TRACTOR', heavy: true, basePay: 195, targetPsi: 105, timeSec: 76, axleWeight: 2.10, lockChance: 0.15, bodyColor: '#1d4ed8', img: 'assets/veh-semi.png' }
];

const WEATHER_CONDITIONS = [
  { id: 'clear', label: '☀️ CLEAR DAY', mult: 1.00 },
  { id: 'night', label: '🌙 NIGHT SHIFT (+20%)', mult: 1.20 },
  { id: 'rain', label: '🌧️ GA DOWNPOUR (+35%)', mult: 1.35 }
];

const DAMAGES = [
  {
    key: 'center_nail',
    title: 'Center-Tread Nail Puncture',
    action: 'plug',
    fileKey: 'nail',
    verdict: 'REPAIRABLE · PLUG ONLY',
    desc: 'Steel nail embedded cleanly in center tread crown. Safe to ream & vulcanize plug.'
  },
  {
    key: 'bulge',
    title: 'Sidewall Impact Bulge',
    action: 'swap',
    fileKey: 'bulge',
    verdict: 'UNREPAIRABLE · TIRE SWAP ONLY',
    desc: 'Internal sidewall cords ruptured. Bubble will blow at highway speed—must swap tire.'
  },
  {
    key: 'blowout',
    title: 'High-Speed Sidewall Blowout',
    action: 'swap',
    fileKey: 'blowout',
    verdict: 'UNREPAIRABLE · TIRE SWAP ONLY',
    desc: 'Violently ruptured sidewall casing with exposed steel plies. Full tire swap required.'
  },
  {
    key: 'gash',
    title: 'Outer Shoulder Curb Gash',
    action: 'swap',
    fileKey: 'gash',
    verdict: 'UNREPAIRABLE · TIRE SWAP ONLY',
    desc: 'Deep structural slash across the non-repairable outer shoulder. Must swap tire.'
  },
  {
    key: 'shredded',
    title: 'Shredded / Delaminated Tread',
    action: 'swap',
    fileKey: 'shredded',
    verdict: 'UNREPAIRABLE · TIRE SWAP ONLY',
    desc: 'Separated tread strips and frayed steel belts. Full tire swap required.'
  }
];

const CONTRACT_POOL = [
  { id: 'c_clean4', title: 'Zero-Penalty Streak', desc: 'Complete 4 calls with $0 protocol or safety penalties.', type: 'clean_streak', target: 4, rewardCash: 185, rewardTokens: 2, rewardPart: 0, rewardRep: 95 },
  { id: 'c_plug3', title: 'Crown Plug Specialist', desc: 'Properly plug 3 center-tread nail punctures.', type: 'plugs', target: 3, rewardCash: 150, rewardTokens: 1, rewardPart: 0, rewardRep: 80 },
  { id: 'c_swap3', title: 'Casing Replacement Pro', desc: 'Complete 3 tire swaps (Standard or Heavy-Duty).', type: 'swaps', target: 3, rewardCash: 210, rewardTokens: 2, rewardPart: 0, rewardRep: 105 },
  { id: 'c_fast3', title: 'Rapid Highway Response', desc: 'Finish 3 calls with ≥45% SLA timer remaining.', type: 'fast', target: 3, rewardCash: 225, rewardTokens: 2, rewardPart: 1, rewardRep: 120 },
  { id: 'c_heavy2', title: 'Commercial Fleet Rescue', desc: 'Service 2 Box Trucks or 18-Wheelers with HD tires.', type: 'heavy', target: 2, rewardCash: 280, rewardTokens: 3, rewardPart: 1, rewardRep: 145 }
];

const LUG_COORDS = [
  { id: 1, x: 50, y: 24 },
  { id: 2, x: 75, y: 42 },
  { id: 3, x: 65, y: 72 },
  { id: 4, x: 35, y: 72 },
  { id: 5, x: 25, y: 42 }
];
const STAR_ORDER = [1, 3, 5, 2, 4];
const AVATAR_PRESETS = ['🛞', '🚛', '🔧', '⚡', '🏆', '🔥', '🛡️', '👑'];

const MAX_DISPATCH_SCANS = 2;
const SCAN_RECHARGE_MS = 2 * 60 * 60 * 1000;

const MAX_SURGE_CHARGES = 3;
const SURGE_RECHARGE_MS = 8 * 60 * 60 * 1000;

const MAX_TOKEN_DROPS = 3;
const TOKEN_DROP_RECHARGE_MS = 6 * 60 * 60 * 1000;

// Tightened 3-call clean-streak Gold Gear interval + streak milestone bonuses
const CLEAN_STREAK_GEAR_INTERVAL = 3;
const STREAK_GEAR_MILESTONES = { 9: 2, 15: 3 };
const MAX_STREAK_ROLLOVER = 15;
const TOKEN_TO_GEAR_COST = 15;

let state = {
  bizName: 'DelWin Mobile Tire Rescue',
  avatarEmoji: '🛞',
  avatarImg: '',
  cash: 140,
  tokens: 8,
  parts: 0, // Represents Gold Gears (⚙️)
  rep: 0,
  unlockedRigTier: 1,
  dispatchScans: 2,
  lastScanRechargeAt: Date.now(),
  surgeCharges: 3,
  lastSurgeRechargeAt: Date.now(),
  tokenDropCharges: 3,
  lastTokenDropRechargeAt: Date.now(),
  streak: 0,
  jobsCompleted: 0,
  zoneId: 'z1',
  surgeJobs: 0,
  plugs: 4,
  stdTires: 2,
  hdTires: 1,
  ratings: [5.0, 5.0, 5.0, 5.0, 5.0],
  tutorialDone: false,
  contract: {
    id: 'c_clean4',
    title: 'Zero-Penalty Streak',
    desc: 'Complete 4 calls with $0 protocol or safety penalties.',
    type: 'clean_streak',
    target: 4,
    progress: 0,
    rewardCash: 185,
    rewardTokens: 2,
    rewardPart: 0,
    rewardRep: 95
  },
  tools: {
    impact: { name: 'Pneumatic Impact Wrench', level: 1, baseCost: 75, prefix: 'tool-impact', icon: '🔫' },
    jack: { name: 'Hydraulic Floor Jack', level: 1, baseCost: 70, prefix: 'tool-jack', icon: '🏗️' },
    comp: { name: 'Portable Air Compressor', level: 1, baseCost: 80, prefix: 'tool-comp', icon: '💨' },
    radar: { name: 'Dispatch GPS Radar', level: 1, baseCost: 90, prefix: 'tool-radar', icon: '📡' }
  },
  jobs: [],
  activeJob: null
};

let previewRigTier = null;
let previewToolTiers = {};
let bayTimerInterval = null;
let dispatchCooldownInterval = null;
let spinClearTimeout = null;
let holdPsiInterval = null;

function loadState() {
  try {
    const raw = localStorage.getItem('delwin_v4_save');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.tires === 'number' && typeof parsed.stdTires !== 'number') {
          parsed.stdTires = parsed.tires;
        }
        const savedTools = parsed.tools && typeof parsed.tools === 'object' ? parsed.tools : null;
        delete parsed.tools;
        Object.assign(state, parsed);
        if (savedTools) {
          Object.keys(state.tools).forEach((k) => {
            if (savedTools[k] && typeof savedTools[k].level === 'number') {
              state.tools[k].level = Math.max(1, Math.min(24, Math.floor(savedTools[k].level)));
            }
          });
        }
      }
    }
    if (!Array.isArray(state.ratings) || state.ratings.length === 0) state.ratings = [5.0];
    if (!Array.isArray(state.jobs)) state.jobs = [];
    state.jobs = state.jobs.filter((j) => j && j.veh && typeof j.veh === 'object' && j.dmg && typeof j.dmg === 'object');
    if (state.activeJob && (!state.activeJob.veh || typeof state.activeJob.veh !== 'object' || !state.activeJob.dmg || typeof state.activeJob.dmg !== 'object')) {
      state.activeJob = null;
    }
    if (!ZONES.some((z) => z.id === state.zoneId)) state.zoneId = 'z1';
    if (!state.contract || typeof state.contract !== 'object') rollNewContract();
    if (!state.bizName) state.bizName = 'DelWin Mobile Tire Rescue';
    if (!state.avatarEmoji) state.avatarEmoji = '🛞';
    if (!state.unlockedRigTier) state.unlockedRigTier = 1;
    if (typeof state.dispatchScans !== 'number') state.dispatchScans = MAX_DISPATCH_SCANS;
    if (!state.lastScanRechargeAt) state.lastScanRechargeAt = Date.now();
    if (typeof state.surgeCharges !== 'number') state.surgeCharges = MAX_SURGE_CHARGES;
    if (!state.lastSurgeRechargeAt) state.lastSurgeRechargeAt = Date.now();
    if (typeof state.tokenDropCharges !== 'number') state.tokenDropCharges = MAX_TOKEN_DROPS;
    if (!state.lastTokenDropRechargeAt) state.lastTokenDropRechargeAt = Date.now();
  } catch (e) {
    state.jobs = [];
    state.activeJob = null;
  }
}

function saveState() {
  try {
    localStorage.setItem('delwin_v4_save', JSON.stringify(state));
    if (window.DelWinCloud && typeof window.DelWinCloud.queueSave === 'function') {
      window.DelWinCloud.queueSave(state);
    }
  } catch (e) {}
}

function syncPoolRecharge(countKey, tsKey, maxVal, intervalMs) {
  if (state[countKey] >= maxVal) {
    state[countKey] = maxVal;
    state[tsKey] = Date.now();
    return 0;
  }
  const now = Date.now();
  const elapsed = now - state[tsKey];
  if (elapsed >= intervalMs) {
    const gained = Math.floor(elapsed / intervalMs);
    state[countKey] = Math.min(maxVal, state[countKey] + gained);
    if (state[countKey] >= maxVal) {
      state[tsKey] = now;
      return 0;
    } else {
      state[tsKey] += gained * intervalMs;
    }
  }
  return Math.max(0, intervalMs - (Date.now() - state[tsKey]));
}

function syncDispatchScanRecharge() {
  return syncPoolRecharge('dispatchScans', 'lastScanRechargeAt', MAX_DISPATCH_SCANS, SCAN_RECHARGE_MS);
}

function syncSurgeRecharge() {
  return syncPoolRecharge('surgeCharges', 'lastSurgeRechargeAt', MAX_SURGE_CHARGES, SURGE_RECHARGE_MS);
}

function syncTokenDropRecharge() {
  return syncPoolRecharge('tokenDropCharges', 'lastTokenDropRechargeAt', MAX_TOKEN_DROPS, TOKEN_DROP_RECHARGE_MS);
}

function formatMs(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function getRigTier() {
  const maxByTools = Math.min(6, Math.floor((getMinToolLevel() - 1) / 4) + 1);
  return Math.min(state.unlockedRigTier || 1, maxByTools);
}

function getActiveRigObj() {
  return RIG_TIERS[getRigTier() - 1] || RIG_TIERS[0];
}

function getMinToolLevel() {
  return Math.min(...Object.values(state.tools).map((t) => t.level));
}

function getZone() {
  return ZONES.find((z) => z.id === state.zoneId) || ZONES[0];
}

function getCurrentHubTier() {
  const z = getZone();
  return HUB_TIERS.find((h) => h.hubNum === (z.hubNum || Math.floor((ZONES.indexOf(z)) / 4) + 1)) || HUB_TIERS[0];
}

function getStockPricing() {
  const rig = getActiveRigObj();
  const z = getZone();
  const supplyScale = 1 + ((rig.mult * z.mult) - 1) * 0.55;
  return {
    plugPackCost: Math.round(20 * supplyScale),
    plugPackQty: 3,
    stdCost: Math.round(45 * supplyScale),
    hdCost: Math.round(95 * supplyScale)
  };
}

function getFleetOverheadFee(job) {
  const rig = getActiveRigObj();
  const z = getZone();
  const heavyFactor = job && job.veh && job.veh.heavy ? 1.25 : 1.0;
  return Math.round(12 * rig.mult * z.mult * heavyFactor);
}

function getRatingAvg() {
  return state.ratings.reduce((a, b) => a + b, 0) / state.ratings.length;
}

function getRatingTierInfo() {
  const avg = getRatingAvg();
  if (avg >= 4.8) return { label: 'ELITE 5-STAR', mult: 1.15, bonusPct: '+15%', vipChance: 0.45, color: '#10b981' };
  if (avg >= 4.4) return { label: 'TRUSTED PRO', mult: 1.08, bonusPct: '+8%', vipChance: 0.30, color: '#38bdf8' };
  if (avg >= 4.0) return { label: 'STANDARD', mult: 1.00, bonusPct: '0%', vipChance: 0.15, color: '#cbd5e1' };
  return { label: 'PROBATION', mult: 0.85, bonusPct: '-15%', vipChance: 0.0, color: '#ef4444' };
}

function getStreakGearReward(streakVal) {
  if (!streakVal || streakVal <= 0 || streakVal % CLEAN_STREAK_GEAR_INTERVAL !== 0) return 0;
  return STREAK_GEAR_MILESTONES[streakVal] || 1;
}

function getCallsUntilNextGear(streakVal) {
  const s = streakVal || 0;
  const rem = s % CLEAN_STREAK_GEAR_INTERVAL;
  return rem === 0 ? CLEAN_STREAK_GEAR_INTERVAL : (CLEAN_STREAK_GEAR_INTERVAL - rem);
}

function getToolUpgradeSpec(key) {
  const tool = state.tools[key];
  if (!tool) return { cost: 0, gears: 0, isBreakthrough: false, tierIndex: 1 };
  const lvl = tool.level;
  const tierIndex = Math.min(6, Math.floor((lvl - 1) / 4) + 1);
  const isBreakthrough = lvl < 24 && lvl % 4 === 0;
  // Calibrated Gradual Milestone Curve:
  // Early Hook (4-5 calls) -> Early-Mid (8-10) -> Mid (20-25) -> Upper-Mid (50-60) -> Late (150-200) -> Endgame (300-350)
  const tierSteps = Math.floor((lvl - 1) / 4);
  const upperMidBoost = lvl >= 13 ? 1.14 : 1.0;
  const rawCost =
    tool.baseCost *
    3.68 *
    Math.pow(1.250, lvl - 1) *
    Math.pow(1.250, tierSteps) *
    upperMidBoost *
    (isBreakthrough ? 1.18 : 1.0);
  const roundStep = rawCost >= 50000 ? 500 : rawCost >= 10000 ? 100 : rawCost >= 1000 ? 50 : 10;
  const cost = Math.round(rawCost / roundStep) * roundStep;

  // Gold Gear breakthrough costs scaled to the faster 3-call streak + 9/15 milestone earn rate:
  // Lvl 4->5 (Tier 2): 2 ⚙️ | Lvl 8->9 (Tier 3): 4 ⚙️ | Lvl 12->13 (Tier 4): 8 ⚙️ | Lvl 16->17 (Tier 5): 12 ⚙️ | Lvl 20->21 (Tier 6): 16 ⚙️
  let gears = 0;
  if (isBreakthrough) {
    if (lvl === 4) gears = 2;
    else if (lvl === 8) gears = 4;
    else if (lvl === 12) gears = 8;
    else if (lvl === 16) gears = 12;
    else if (lvl === 20) gears = 16;
    else gears = Math.min(18, Math.floor(lvl / 2) + 2);
  }
  return { cost, gears, isBreakthrough, tierIndex };
}

function getToolEffectSummary(key, level) {
  if (key === 'impact') {
    const breakPower = 1 + Math.floor((level - 1) / 4);
    return `Breaks ${breakPower} rust layer${breakPower > 1 ? 's' : ''}/tap · Fast spin-off`;
  }
  if (key === 'jack') {
    const liftForce = 26 + level * 4;
    return `Lift Force: ${liftForce}%/pump (Crushes heavy commercial axles)`;
  }
  if (key === 'comp') {
    const psiStep = 4 + Math.floor((level - 1) / 3);
    const tol = 2 + Math.floor((level - 1) / 8);
    return `+${psiStep} PSI/tick (Hold) · ±${tol} PSI green band`;
  }
  if (key === 'radar') {
    const extraSec = (level - 1) * 2;
    return `+${extraSec}s SLA Buffer · Previews rusted lugs, locks & weather`;
  }
  return '';
}

function injectCustomStyles() {
  if (document.getElementById('delwin-v44-styles')) return;
  const st = document.createElement('style');
  st.id = 'delwin-v44-styles';
  st.textContent = `
    .stage-cones {
      position: absolute; bottom: 28px; right: 16px;
      display: flex; gap: 6px; z-index: 6;
      opacity: 0.25; transition: all 0.25s ease;
    }
    .stage-cones.set { opacity: 1; transform: scale(1.06); }
    .cone-item {
      width: 12px; height: 18px;
      background: linear-gradient(180deg, #f97316 0%, #f97316 42%, #f8fafc 42%, #f8fafc 64%, #f97316 64%);
      clip-path: polygon(35% 0%, 65% 0%, 95% 100%, 5% 100%);
      border-bottom: 2px solid #090c12;
    }
    .stage-cones.set .cone-item { box-shadow: 0 0 8px rgba(249, 115, 22, 0.7); }

    .dw-stock-btn {
      background: #0f172a !important;
      color: #f8fafc !important;
      border: 1px solid #334155 !important;
      border-radius: 10px !important;
      padding: 8px 4px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      line-height: 1.35 !important;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      text-align: center;
    }
    .dw-stock-btn:active { background: #1e293b !important; transform: scale(0.98); }
    .dw-stock-btn.low { border-color: #ef4444 !important; background: rgba(239, 68, 68, 0.12) !important; }
    .dw-stock-btn.full { border-color: #10b981 !important; opacity: 0.85; }

    .lug-btn.rusted {
      background: radial-gradient(circle, #9a3412 30%, #431407 95%) !important;
      border: 2px dashed #f97316 !important;
      color: #ffedd5 !important;
      box-shadow: 0 0 8px rgba(234, 88, 12, 0.65);
    }

    .rig-visual-box {
      position: relative; width: 100%; height: 104px;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 70%, rgba(245, 158, 11, 0.12), transparent 72%);
      border-radius: 10px; margin: 6px 0; overflow: hidden;
    }
    .rig-visual-box img {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: contain; z-index: 2;
    }
    .tool-thumb-hybrid {
      position: relative; width: 54px; height: 54px; border-radius: 10px;
      background: #090c12; border: 1px solid #334155;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; overflow: hidden;
    }
    .tool-thumb-hybrid img {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: contain; z-index: 2; background: #090c12;
    }

    .player-hud-left {
      display: flex; align-items: center; gap: 8px;
      cursor: pointer; min-width: 0; flex: 1;
    }
    .hud-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: #1e293b; border: 1.5px solid var(--amber);
      display: flex; align-items: center; justify-content: center;
      font-size: 17px; overflow: hidden; flex-shrink: 0;
    }
    .hud-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .hud-curr-row {
      display: flex; align-items: center; gap: 5px; flex-shrink: 0;
    }
    .hud-pill-compact {
      background: #0f172a; border: 1px solid #334155;
      padding: 4px 7px; border-radius: 8px;
      font-size: 11px; font-weight: 800; white-space: nowrap;
      cursor: pointer;
    }
    .hud-pill-compact:hover { border-color: var(--amber); }

    .profile-pill {
      display: flex; align-items: center; gap: 8px;
      background: #0f172a; border: 1px solid var(--border);
      padding: 8px 10px; border-radius: 10px; margin-bottom: 8px;
    }
    .emoji-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
    .emoji-opt {
      padding: 8px; font-size: 20px; border-radius: 8px;
      background: #0f172a; border: 1px solid var(--border); cursor: pointer;
    }
    .emoji-opt.active { border-color: var(--amber); background: #1e293b; }
  `;
  document.head.appendChild(st);
}

// --- TOP HEADER PLAYER COMMAND BAR (Currency pills open Dispatch Shop) ---
function ensureTopBarElement() {
  let topBar = document.querySelector('.top-bar, header, #top-bar, .hud-bar, .app-header, #hud-header');
  if (!topBar && document.body) {
    topBar = document.createElement('header');
    topBar.className = 'top-bar';
    topBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#0b1120;border-bottom:1px solid #1e293b;position:sticky;top:0;z-index:40;';
    const appRoot = document.querySelector('.app, #app, main') || document.body;
    appRoot.insertBefore(topBar, appRoot.firstChild);
  }
  return topBar;
}

function ensureMenuDrawerElements() {
  if (!document.body) return;
  let backdrop = document.getElementById('drawer-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'drawer-backdrop';
    backdrop.className = 'drawer-backdrop hidden';
    backdrop.onclick = () => toggleDrawer(false);
    document.body.appendChild(backdrop);
  }
  let drawer = document.getElementById('menu-drawer');
  if (!drawer) {
    drawer = document.createElement('aside');
    drawer.id = 'menu-drawer';
    drawer.className = 'menu-drawer hidden';
    drawer.innerHTML = `
      <div class="drawer-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong>DELWIN MOBILE</strong>
        <button type="button" class="icon-btn" onclick="toggleDrawer(false)">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
        <div class="item-card" style="padding:8px 10px;">
          <div>Gold Gears: <strong id="drawer-parts" style="color:var(--amber);">0 ⚙️</strong></div>
          <div>Fleet Rating: <strong id="drawer-rating" style="color:var(--green);">5.0 ★</strong></div>
          <div>Corridor: <strong id="drawer-zone">I-285 North Perimeter</strong></div>
        </div>
        <button type="button" class="secondary-btn" onclick="toggleDrawer(false); goPage('zones');">🗺️ Highway Corridors & Hubs</button>
        <button type="button" class="secondary-btn" onclick="toggleDrawer(false); goPage('shop');">🛒 Dispatch Supply Shop</button>
        <button type="button" class="secondary-btn" id="sound-toggle-btn" onclick="toggleSound()">🔊 Mechanical Audio: ON</button>
        <button type="button" class="ghost-btn" style="color:#f87171;border-color:#7f1d1d;" onclick="if(confirm('Reset all DelWin Mobile progress?')) resetSave();">⚠️ Reset Save Data</button>
      </div>
    `;
    document.body.appendChild(drawer);
  }
}

function renderTopHeader() {
  ensureMenuDrawerElements();
  const topBar = ensureTopBarElement();
  if (!topBar) return;
  const avatarHtml = state.avatarImg
    ? `<img src="${state.avatarImg}" alt="" />`
    : `<span>${state.avatarEmoji}</span>`;
  const ratingAvg = getRatingAvg().toFixed(1);

  topBar.innerHTML = `
    <div class="player-hud-left" onclick="openProfileEditor()" title="Tap to edit Business Name & Logo">
      <div class="hud-avatar">${avatarHtml}</div>
      <div style="min-width:0;">
        <div style="font-size:12px;font-weight:900;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:118px;">
          ${state.bizName}
        </div>
        <div style="font-size:10px;font-weight:700;color:var(--amber);">
          T${getRigTier()} · ${ratingAvg} ★
        </div>
      </div>
    </div>
    <div class="hud-curr-row">
      <button type="button" class="hud-pill-compact" style="color:var(--green);" onclick="goPage('shop')" title="Open Dispatch Supply Shop">$<span id="hud-cash">${state.cash.toLocaleString()}</span>+</button>
      <button type="button" class="hud-pill-compact" style="color:var(--amber);" onclick="goPage('shop')" title="Open Dispatch Supply Shop"><span id="hud-parts">${state.parts}</span> ⚙️+</button>
      <button type="button" class="hud-pill-compact" style="color:#38bdf8;" onclick="goPage('shop')" title="Open Dispatch Supply Shop"><span id="hud-tokens">${state.tokens}</span> ⚡+</button>
      <button type="button" class="icon-btn" onclick="toggleDrawer(true)" style="padding:6px 9px;font-size:15px;">☰</button>
    </div>
  `;
}

function renderProfileCard() {
  const drawer = document.getElementById('menu-drawer');
  if (!drawer) return;
  const drawerTitle = drawer.querySelector('.drawer-header strong') || drawer.querySelector('.drawer-header h3');
  if (drawerTitle) {
    drawerTitle.innerHTML = `DELWIN MOBILE<br><span style="font-size:10px;color:var(--amber);font-weight:700;">ROADSIDE TIRE RESCUE</span>`;
  }
  let card = document.getElementById('biz-profile-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'biz-profile-card';
    const header = drawer.querySelector('.drawer-header');
    if (header && header.nextSibling) drawer.insertBefore(card, header.nextSibling);
    else drawer.prepend(card);
  }
  const avatarHtml = state.avatarImg
    ? `<img src="${state.avatarImg}" alt="" />`
    : `<span>${state.avatarEmoji}</span>`;
  card.innerHTML = `
    <div class="profile-pill">
      <div class="hud-avatar">${avatarHtml}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${state.bizName}</div>
        <div style="font-size:11px;color:var(--amber);">Tier ${getRigTier()} Rig · ${state.rep.toLocaleString()} REP</div>
      </div>
      <button class="ghost-btn" style="padding:4px 8px;font-size:11px;" onclick="toggleDrawer(false); openProfileEditor();">Edit</button>
    </div>`;
}

function openProfileEditor() {
  const presetBtns = AVATAR_PRESETS.map((em) =>
    `<button type="button" class="emoji-opt ${!state.avatarImg && state.avatarEmoji === em ? 'active' : ''}" onclick="selectAvatarEmoji('${em}')">${em}</button>`
  ).join('');
  openModal(`
    <span class="badge">COMPANY IDENTITY</span>
    <h3>Edit Business Name & Logo</h3>
    <label style="font-size:12px;color:var(--muted);">Business / Fleet Name</label>
    <input id="edit-biz-input" type="text" maxlength="28" value="${state.bizName.replace(/"/g, '&quot;')}"
      style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:#090c12;color:var(--text);font-weight:700;" />
    <label style="font-size:12px;color:var(--muted);margin-top:4px;">Choose Fleet Badge</label>
    <div class="emoji-grid">${presetBtns}</div>
    <label style="font-size:12px;color:var(--muted);">Or Upload Custom Logo / Photo</label>
    <input type="file" accept="image/*" onchange="handleAvatarUpload(event)" style="font-size:12px;color:var(--muted);" />
    <div class="ctrl-grid-2" style="margin-top:6px;">
      <button class="secondary-btn" onclick="closeModal()">CANCEL</button>
      <button class="primary-btn" onclick="saveProfileEdits()">SAVE PROFILE</button>
    </div>
  `);
}

function selectAvatarEmoji(em) {
  state.avatarEmoji = em;
  state.avatarImg = '';
  openProfileEditor();
}

function handleAvatarUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 96, 96);
      state.avatarImg = canvas.toDataURL('image/jpeg', 0.8);
      saveState();
      updateHUD();
      if (document.getElementById('page-league').classList.contains('active')) renderLeague();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function saveProfileEdits() {
  const inp = document.getElementById('edit-biz-input');
  if (inp && inp.value.trim()) {
    state.bizName = inp.value.trim();
  }
  saveState();
  updateHUD();
  if (document.getElementById('page-league').classList.contains('active')) renderLeague();
  closeModal();
}

// --- CONTRACTS ---
function rollNewContract() {
  const currentId = state.contract ? state.contract.id : '';
  const options = CONTRACT_POOL.filter((c) => c.id !== currentId);
  const pick = options[Math.floor(Math.random() * options.length)];
  state.contract = { ...pick, progress: 0 };
}

function claimContract() {
  const c = state.contract;
  if (!c || c.progress < c.target) return;
  SoundFX.success();
  const zMult = getZone().mult;
  const cashWon = Math.round(c.rewardCash * zMult);
  const repWon = Math.round(c.rewardRep * zMult);
  state.cash += cashWon;
  state.tokens += c.rewardTokens;
  state.parts += c.rewardPart || 0;
  state.rep += repWon;
  rollNewContract();
  saveState();
  updateHUD();
  renderContractBanner();
  openModal(`
    <span class="badge">DELWIN MOBILE CONTRACT CLEARED</span>
    <h3>${c.title}</h3>
    <div style="background:#090c12;padding:12px;border-radius:10px;font-size:13px;display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;justify-content:space-between;"><span>Contract Cash Bonus:</span><strong style="color:var(--green);">+$${cashWon}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Dispatch Tokens:</span><strong style="color:var(--amber);">+${c.rewardTokens} ⚡</strong></div>
      ${c.rewardPart ? `<div style="display:flex;justify-content:space-between;"><span>Gold Gear:</span><strong style="color:var(--amber);">+${c.rewardPart} ⚙️</strong></div>` : ''}
      <div style="display:flex;justify-content:space-between;"><span>Corridor Reputation:</span><strong style="color:var(--blue);">+${repWon} REP</strong></div>
    </div>
    <button class="primary-btn" onclick="closeModal()">NEXT CONTRACT ASSIGNED</button>
  `);
}

function renderContractBanner() {
  const dispatchPage = document.getElementById('page-dispatch');
  if (!dispatchPage) return;
  let box = document.getElementById('delwin-contract-card');
  if (!box) {
    box = document.createElement('div');
    box.id = 'delwin-contract-card';
    box.className = 'item-card';
    box.style.borderColor = 'var(--amber)';
    box.style.marginBottom = '8px';
    const jobList = document.getElementById('job-list');
    dispatchPage.insertBefore(box, jobList);
  }
  const c = state.contract;
  const ready = c.progress >= c.target;
  const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
  const zMult = getZone().mult;
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span class="badge">📋 CONTRACT</span>
      <strong style="font-size:12px;color:var(--amber);">
        $${Math.round(c.rewardCash * zMult)} + ${c.rewardTokens}⚡${c.rewardPart ? ` + ${c.rewardPart}⚙️` : ''}
      </strong>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
      <strong style="font-size:14px;">${c.title}</strong>
      <span style="font-size:12px;font-weight:800;color:${ready ? 'var(--green)' : 'var(--muted)'};">${c.progress}/${c.target}</span>
    </div>
    <p style="font-size:12px;color:var(--muted);">${c.desc}</p>
    <div style="height:6px;background:#090c12;border-radius:99px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:${ready ? 'var(--green)' : 'var(--amber)'};"></div>
    </div>
    ${ready ? `<button class="primary-btn" onclick="claimContract()">CLAIM CONTRACT REWARD</button>` : ''}
  `;
}

// --- HIGH-DETAIL VECTOR GRAPHICS (Fallback when PNGs aren't uploaded yet) ---
function renderRigSVG(tierObj) {
  const t = tierObj.tier;
  const isBox = t >= 5;
  const isDually = t >= 4;
  return `
    <svg viewBox="0 0 280 100" width="260" height="92">
      <ellipse cx="140" cy="90" rx="116" ry="6" fill="rgba(0,0,0,0.65)"/>
      ${isBox
        ? `<rect x="28" y="20" width="144" height="54" rx="6" fill="#1e293b" stroke="${tierObj.color}" stroke-width="2.5"/>
           <line x1="34" y1="36" x2="166" y2="36" stroke="${tierObj.color}" stroke-width="1.5" opacity="0.6"/>`
        : `<rect x="34" y="34" width="136" height="40" rx="7" fill="#1e293b" stroke="${tierObj.color}" stroke-width="2.5"/>
           ${t >= 3 ? `<circle cx="58" cy="28" r="11" fill="#0f172a" stroke="#94a3b8" stroke-width="2.5"/><circle cx="84" cy="28" r="11" fill="#0f172a" stroke="#94a3b8" stroke-width="2.5"/>` : ''}`
      }
      <path d="M172 34 L216 34 L236 54 L236 74 L172 74 Z" fill="#0f172a" stroke="${tierObj.color}" stroke-width="2.5"/>
      <polygon points="178,39 211,39 225,53 178,53" fill="#38bdf8" opacity="0.5"/>
      <rect x="178" y="26" width="28" height="6" rx="3" fill="#f59e0b"/>
      <text x="50" y="56" fill="#f8fafc" font-size="13" font-weight="900" font-family="sans-serif">DELWIN T${t}</text>
      <text x="50" y="68" fill="${tierObj.color}" font-size="9" font-weight="800" font-family="sans-serif">${tierObj.mult.toFixed(2)}X FLEET</text>
      <circle cx="68" cy="76" r="15" fill="#090c12" stroke="#94a3b8" stroke-width="3"/>
      <circle cx="68" cy="76" r="6" fill="${tierObj.color}"/>
      ${isDually ? `<circle cx="102" cy="76" r="15" fill="#090c12" stroke="#94a3b8" stroke-width="3"/><circle cx="102" cy="76" r="6" fill="${tierObj.color}"/>` : ''}
      <circle cx="204" cy="76" r="15" fill="#090c12" stroke="#94a3b8" stroke-width="3"/>
      <circle cx="204" cy="76" r="6" fill="${tierObj.color}"/>
    </svg>`;
}

function renderToolSVG(key, tier) {
  const colors = ['#cbd5e1', '#38bdf8', '#f59e0b', '#a855f7', '#ef4444', '#fde047'];
  const c = colors[(tier - 1) % colors.length];
  if (key === 'impact') {
    return `<svg viewBox="0 0 60 60" width="46" height="46">
      <rect x="12" y="16" width="30" height="14" rx="4" fill="#1e293b" stroke="${c}" stroke-width="2.5"/>
      <rect x="42" y="20" width="10" height="6" rx="2" fill="${c}"/>
      <path d="M20 30 L16 48 L26 48 L29 30 Z" fill="#334155" stroke="${c}" stroke-width="2"/>
    </svg>`;
  }
  if (key === 'jack') {
    return `<svg viewBox="0 0 60 60" width="46" height="46">
      <rect x="10" y="42" width="36" height="7" rx="3" fill="#1e293b" stroke="${c}" stroke-width="2.5"/>
      <line x1="22" y1="42" x2="36" y2="24" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
      <rect x="30" y="19" width="12" height="5" rx="2" fill="#f8fafc"/>
      <line x1="12" y1="42" x2="6" y2="16" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;
  }
  if (key === 'comp') {
    return `<svg viewBox="0 0 60 60" width="46" height="46">
      <rect x="12" y="22" width="36" height="22" rx="10" fill="#1e293b" stroke="${c}" stroke-width="2.5"/>
      <circle cx="30" cy="15" r="6" fill="#0f172a" stroke="${c}" stroke-width="2"/>
      <line x1="30" y1="15" x2="33" y2="12" stroke="#f8fafc" stroke-width="1.5"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 60 60" width="46" height="46">
    <circle cx="30" cy="30" r="18" fill="#0f172a" stroke="${c}" stroke-width="2.5"/>
    <circle cx="30" cy="30" r="10" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="4 3"/>
    <circle cx="30" cy="30" r="3" fill="#f8fafc"/>
    <line x1="30" y1="30" x2="43" y2="19" stroke="#10b981" stroke-width="2"/>
  </svg>`;
}

function renderVehicleSVG(veh) {
  return `
    <svg viewBox="0 0 280 90" width="275" height="90">
      <path d="M24 68 L24 44 L66 40 L98 18 L194 18 L224 40 L256 46 L256 68 Z" fill="${veh.bodyColor}" stroke="#94a3b8" stroke-width="2"/>
      <polygon points="102,23 188,23 210,39 82,39" fill="#0f172a" opacity="0.85"/>
      <path d="M104 68 A36 36 0 0 1 176 68 Z" fill="#090c12" stroke="#f59e0b" stroke-width="2.2"/>
    </svg>`;
}

function renderTireSVG(job, size = 130) {
  const dmg = job.dmg.key;
  let dmgLayer = '';
  if (!job.fixed) {
    if (dmg === 'center_nail') {
      dmgLayer = `
        <circle cx="65" cy="14" r="12" fill="rgba(239,68,68,0.3)" stroke="#ef4444" stroke-width="2"/>
        <line x1="65" y1="2" x2="65" y2="18" stroke="#f8fafc" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="59" y1="2" x2="71" y2="2" stroke="#f8fafc" stroke-width="3"/>`;
    } else if (dmg === 'bulge') {
      dmgLayer = `
        <ellipse cx="17" cy="70" rx="13" ry="19" fill="#334155" stroke="#ef4444" stroke-width="2.5"/>
        <text x="17" y="74" text-anchor="middle" fill="#fecaca" font-size="10" font-weight="900">!</text>`;
    } else if (dmg === 'blowout') {
      dmgLayer = `
        <polygon points="12,54 27,63 15,74 28,85 10,89 5,69" fill="#ef4444" stroke="#fecaca" stroke-width="1.5"/>`;
    } else if (dmg === 'gash') {
      dmgLayer = `
        <line x1="20" y1="22" x2="42" y2="44" stroke="#ef4444" stroke-width="5" stroke-linecap="round"/>`;
    } else if (dmg === 'shredded') {
      dmgLayer = `
        <path d="M22 22 L11 11 M44 10 L40 1 M86 10 L92 1 M108 24 L119 15" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>`;
    }
  }
  return `
    <svg viewBox="0 0 130 130" width="${size}" height="${size}">
      <circle cx="65" cy="65" r="56" fill="#111827" stroke="${job.fixed ? '#10b981' : '#334155'}" stroke-width="6"/>
      <circle cx="65" cy="65" r="46" fill="none" stroke="#1f2937" stroke-width="6" stroke-dasharray="8 6"/>
      <circle cx="65" cy="65" r="32" fill="#1e293b" stroke="#94a3b8" stroke-width="2.5"/>
      <circle cx="65" cy="65" r="11" fill="#0f172a" stroke="#f59e0b" stroke-width="2"/>
      ${dmgLayer}
    </svg>`;
}

// --- INVENTORY & RIG CARGO CAPACITY BAR ---
function renderStockBar() {
  const dispatchPage = document.getElementById('page-dispatch');
  if (!dispatchPage) return;
  let bar = document.getElementById('delwin-stock-grid');
  const legacyBar = dispatchPage.querySelector('.stock-bar:not(#delwin-stock-grid)');
  if (legacyBar) legacyBar.style.display = 'none';

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'delwin-stock-grid';
    bar.style.display = 'grid';
    bar.style.gridTemplateColumns = '1fr 1fr 1fr';
    bar.style.gap = '6px';
    bar.style.marginBottom = '8px';
    const targetAnchor = document.getElementById('delwin-contract-card') || document.getElementById('job-list');
    dispatchPage.insertBefore(bar, targetAnchor);
  }
  const rig = getActiveRigObj();
  const sp = getStockPricing();
  const plugFull = state.plugs >= rig.capPlugs;
  const stdFull = state.stdTires >= rig.capStd;
  const hdFull = state.hdTires >= rig.capHd;

  bar.innerHTML = `
    <button class="dw-stock-btn ${state.plugs === 0 ? 'low' : plugFull ? 'full' : ''}" onclick="buyStock('plug')">
      Plugs: <strong>${state.plugs}/${rig.capPlugs}</strong><br><span style="color:var(--amber);">${plugFull ? 'CARGO FULL' : `+${sp.plugPackQty} ($${sp.plugPackCost})`}</span>
    </button>
    <button class="dw-stock-btn ${state.stdTires === 0 ? 'low' : stdFull ? 'full' : ''}" onclick="buyStock('std')">
      Std Tires: <strong>${state.stdTires}/${rig.capStd}</strong><br><span style="color:var(--amber);">${stdFull ? 'CARGO FULL' : `+1 ($${sp.stdCost})`}</span>
    </button>
    <button class="dw-stock-btn ${state.hdTires === 0 ? 'low' : hdFull ? 'full' : ''}" onclick="buyStock('hd')">
      HD Tires: <strong>${state.hdTires}/${rig.capHd}</strong><br><span style="color:var(--amber);">${hdFull ? 'CARGO FULL' : `+1 ($${sp.hdCost})`}</span>
    </button>`;
}

function renderDispatchScanControl() {
  const dispatchPage = document.getElementById('page-dispatch');
  if (!dispatchPage) return;

  dispatchPage.querySelectorAll('button').forEach((btn) => {
    if (btn.getAttribute('onclick') === 'refreshJobs()' && btn.id !== 'dispatch-scan-btn') {
      btn.style.display = 'none';
    }
  });

  let scanBox = document.getElementById('dispatch-scan-panel');
  if (!scanBox) {
    scanBox = document.createElement('div');
    scanBox.id = 'dispatch-scan-panel';
    scanBox.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:8px;';
    const jobList = document.getElementById('job-list');
    dispatchPage.insertBefore(scanBox, jobList);
  }

  const remainMs = syncDispatchScanRecharge();
  const hasFreeScan = state.dispatchScans > 0;
  const cdText = hasFreeScan
    ? (state.dispatchScans < MAX_DISPATCH_SCANS ? `Next charge in ${formatMs(remainMs)}` : 'Full Capacity')
    : `Next free scan in ${formatMs(remainMs)}`;

  if (hasFreeScan) {
    scanBox.innerHTML = `
      <button id="dispatch-scan-btn" class="secondary-btn" onclick="triggerDispatchScan('free')" style="display:flex;justify-content:space-between;align-items:center;">
        <span>📡 SCAN FOR NEW CALLS (${state.dispatchScans}/${MAX_DISPATCH_SCANS} FREE)</span>
        <span style="font-size:10px;color:var(--amber);">${cdText}</span>
      </button>`;
  } else {
    scanBox.innerHTML = `
      <div style="font-size:11px;color:var(--amber);text-align:center;font-weight:700;">
        📡 Radar Recharging · ${cdText}
      </div>
      <div class="ctrl-grid-2">
        <button class="secondary-btn" onclick="triggerDispatchScan('ad')" style="font-size:11px;padding:9px 4px;">
          📺 WATCH AD (+1 SCAN)
        </button>
        <button class="primary-btn" onclick="triggerDispatchScan('token')" style="font-size:11px;padding:9px 4px;">
          ⚡ INSTANT SCAN (2 ⚡)
        </button>
      </div>`;
  }
}

function triggerDispatchScan(mode) {
  syncDispatchScanRecharge();
  if (mode === 'free') {
    if (state.dispatchScans <= 0) {
      renderDispatchScanControl();
      return;
    }
    if (state.dispatchScans === MAX_DISPATCH_SCANS) {
      state.lastScanRechargeAt = Date.now();
    }
    state.dispatchScans -= 1;
    SoundFX.scan();
    refreshJobs();
    saveState();
    updateHUD();
    return;
  }
  if (mode === 'token') {
    if (state.tokens < 2) {
      showAlert('INSUFFICIENT TOKENS', 'Instant Radar Scan requires 2 ⚡ Dispatch Tokens, or watch a sponsor ad.');
      goPage('shop');
      return;
    }
    state.tokens -= 2;
    SoundFX.scan();
    refreshJobs();
    saveState();
    updateHUD();
    return;
  }
  if (mode === 'ad') {
    watchRewardedAd('scan');
  }
}

function triggerSurgeAction() {
  const remMs = syncSurgeRecharge();
  const hasAdCharge = state.surgeCharges > 0;
  openModal(`
    <span class="badge">2X SURGE DISPATCH MULTIPLIER</span>
    <h3>Boost Next Call Payout (2x)</h3>
    <p style="font-size:12px;color:var(--muted);">
      Active Stacked Surges: <strong style="color:var(--amber);">${state.surgeJobs}</strong> · Ad Charges: <strong style="color:var(--green);">${state.surgeCharges}/${MAX_SURGE_CHARGES}</strong>
      ${state.surgeCharges < MAX_SURGE_CHARGES ? `<br>Next ad charge recharges in <strong>${formatMs(remMs)}</strong> (8h per charge).` : ''}
    </p>
    <button class="secondary-btn" ${!hasAdCharge ? 'disabled' : ''} onclick="closeModal(); watchRewardedAd('surge');">
      ${hasAdCharge ? `📺 WATCH AD FOR +1 SURGE (${state.surgeCharges}/${MAX_SURGE_CHARGES} LEFT)` : `⏳ SURGE AD RECHARGING (${formatMs(remMs)})`}
    </button>
    <button class="primary-btn" onclick="closeModal(); activateInstantSurgeToken();">
      ⚡ INSTANT +1 SURGE (3 ⚡ TOKENS)
    </button>
    <button class="ghost-btn" onclick="closeModal()">CLOSE</button>
  `);
}

function activateInstantSurgeToken() {
  if (state.tokens < 3) {
    showAlert('INSUFFICIENT TOKENS', 'Instant 2X Surge requires 3 ⚡ Dispatch Tokens.');
    goPage('shop');
    return;
  }
  state.tokens -= 3;
  state.surgeJobs += 1;
  SoundFX.success();
  saveState();
  updateHUD();
  renderJobs();
}

function startDispatchCooldownTicker() {
  if (dispatchCooldownInterval) clearInterval(dispatchCooldownInterval);
  dispatchCooldownInterval = setInterval(() => {
    if (document.getElementById('page-dispatch').classList.contains('active')) {
      renderDispatchScanControl();
      updateHUD();
    }
    if (document.getElementById('page-shop').classList.contains('active')) {
      renderShop();
    }
  }, 1000);
}

function renderRatingPerkBanner() {
  const dispatchPage = document.getElementById('page-dispatch');
  if (!dispatchPage) return;
  let pill = document.getElementById('rating-perk-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'rating-perk-pill';
    pill.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#0f172a;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:11px;margin-bottom:6px;';
    const anchor = document.getElementById('delwin-stock-grid') || document.getElementById('job-list');
    dispatchPage.insertBefore(pill, anchor);
  }
  const avg = getRatingAvg().toFixed(2);
  const info = getRatingTierInfo();
  const nextGearIn = getCallsUntilNextGear(state.streak || 0);
  const hubObj = getCurrentHubTier();
  pill.innerHTML = `
    <span>Rating: <strong style="color:${info.color};">${avg} ★</strong> · Hub ${hubObj.hubNum} (T${hubObj.toolTier}) · Clean: <strong style="color:var(--amber);">${state.streak || 0}</strong> (${nextGearIn}→⚙️)</span>
    <span style="color:${info.color};font-weight:800;">Pay ${info.bonusPct}</span>
  `;
}

function updateHUD() {
  syncSurgeRecharge();
  syncTokenDropRecharge();
  renderTopHeader();
  const drawerParts = document.getElementById('drawer-parts');
  if (drawerParts) drawerParts.textContent = `${state.parts} ⚙️`;
  const avg = getRatingAvg().toFixed(1);
  const rInfo = getRatingTierInfo();
  const drawerRating = document.getElementById('drawer-rating');
  if (drawerRating) drawerRating.textContent = `${avg} ★ (${rInfo.bonusPct})`;
  const z = getZone();
  const hubObj = getCurrentHubTier();
  const drawerZone = document.getElementById('drawer-zone');
  if (drawerZone) drawerZone.textContent = `${z.name} · Hub ${hubObj.hubNum} (T${hubObj.toolTier})`;
  const zoneLbl = document.getElementById('dispatch-zone-label');
  if (zoneLbl) zoneLbl.textContent = `${z.name.toUpperCase()} (${z.mult}x · H${hubObj.hubNum} T${hubObj.toolTier})`;
  const boostLbl = document.getElementById('dispatch-boost-label');
  if (boostLbl) {
    boostLbl.textContent = state.surgeJobs > 0
      ? `2X SURGE: ${state.surgeJobs} ACTIVE (${state.surgeCharges}/${MAX_SURGE_CHARGES} AD)`
      : `2X SURGE (${state.surgeCharges}/${MAX_SURGE_CHARGES} AD)`;
  }
  renderContractBanner();
  renderStockBar();
  renderRatingPerkBanner();
  renderDispatchScanControl();
  renderProfileCard();
}

function goPage(pageId) {
  stopHoldPsi();
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById(`page-${pageId}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  const nav = document.getElementById(`nav-${pageId}`);
  if (nav) nav.classList.add('active');
  if (pageId === 'dispatch') {
    renderContractBanner();
    renderStockBar();
    renderRatingPerkBanner();
    renderDispatchScanControl();
  }
  if (pageId === 'garage') {
    previewRigTier = getRigTier();
    renderGarage();
  }
  if (pageId === 'league') renderLeague();
  if (pageId === 'zones') renderZones();
  if (pageId === 'bay') renderBay();
  if (pageId === 'shop') renderShop();
}

function toggleDrawer(open) {
  ensureMenuDrawerElements();
  renderProfileCard();
  const backdrop = document.getElementById('drawer-backdrop');
  const drawer = document.getElementById('menu-drawer');
  if (backdrop) backdrop.classList.toggle('hidden', !open);
  if (drawer) drawer.classList.toggle('hidden', !open);
}

function toggleSound() {
  const on = SoundFX.toggle();
  document.getElementById('sound-toggle-btn').textContent = `🔊 Mechanical Audio: ${on ? 'ON' : 'OFF'}`;
}

// --- DISPATCH & JOB GENERATION ---
function generateJob(vip = false) {
  const z = getZone();
  const pool = z.id === 'z1' ? VEHICLES.slice(0, 3) : VEHICLES;
  const veh = pool[Math.floor(Math.random() * pool.length)];
  const dmg = DAMAGES[Math.floor(Math.random() * DAMAGES.length)];
  const weather = WEATHER_CONDITIONS[Math.floor(Math.random() * WEATHER_CONDITIONS.length)];
  const mile = Math.floor(Math.random() * 65) + 4;
  const rig = RIG_TIERS[getRigTier() - 1];
  const rInfo = getRatingTierInfo();

  const isRusted = Math.random() < (z.rustChance + (vip ? 0.15 : 0));
  const rustLayers = isRusted ? (z.mult >= 2.0 ? 3 : 2) : 0;

  const hasWheelLock = Math.random() < veh.lockChance;
  const lockLugId = hasWheelLock ? (Math.floor(Math.random() * 5) + 1) : null;

  const basePay = Math.round(
    veh.basePay * z.mult * rig.mult * rInfo.mult * weather.mult *
    (vip ? 1.65 : 1) * (isRusted ? 1.12 : 1) * (hasWheelLock ? 1.08 : 1)
  );
  const radarBonusSec = (state.tools.radar.level - 1) * 2;
  const swapTimeAdj = dmg.action === 'swap' ? 4 : -4;
  const hazardTimeAdj = (isRusted ? 3 : 0) + (hasWheelLock ? 3 : 0) - (vip ? 5 : 0);
  const timeLimit = Math.max(42, veh.timeSec + swapTimeAdj + hazardTimeAdj + radarBonusSec);

  const actionRepBase = dmg.action === 'swap' ? 32 : 24;
  const vehRepBonus = veh.id === 'semi' ? 16 : (veh.id === 'boxtruck' ? 11 : (veh.id === 'pickup' ? 5 : (veh.id === 'suv' ? 3 : 0)));
  const hazardRepBonus = (isRusted ? 5 : 0) + (hasWheelLock ? 5 : 0) + (weather.id === 'rain' ? 6 : (weather.id === 'night' ? 3 : 0)) + (vip ? 14 : 0);
  const baseRepValue = Math.round((actionRepBase + vehRepBonus + hazardRepBonus) * z.mult);

  return {
    id: 'job_' + Math.random().toString(36).slice(2, 8),
    title: `${z.name.split(' ')[0]} Mile ${mile} — Stranded ${veh.label.split(' ')[1]}`,
    veh,
    dmg,
    weather,
    isRusted,
    rustLayers,
    hasWheelLock,
    lockLugId,
    pay: basePay,
    baseRep: baseRepValue,
    timeLimit,
    vip,
    snipeCost: vip ? 4 : 0
  };
}

function refreshJobs() {
  const rInfo = getRatingTierInfo();
  const hasVipSlot = Math.random() < (rInfo.vipChance + 0.55);
  state.jobs = [
    generateJob(false),
    generateJob(false),
    generateJob(false),
    generateJob(rInfo.vipChance > 0 && hasVipSlot)
  ];
  renderJobs();
}

function renderJobs() {
  const wrap = document.getElementById('job-list');
  const radarLvl = state.tools.radar.level;
  wrap.innerHTML = state.jobs.map((j) => {
    const w = j.weather || WEATHER_CONDITIONS[0];
    const hazardBadge = radarLvl >= 2 && j.isRusted
      ? `<span style="color:#f97316;font-weight:800;"> · 🔩 SEIZED LUGS</span>`
      : '';
    const lockBadge = j.hasWheelLock
      ? `<span style="color:#f59e0b;font-weight:800;"> · 🔑 LOCK KEY</span>`
      : '';
    return `
      <div class="job-card ${j.vip ? 'vip' : ''}">
        <div class="job-top">
          <div>
            <span class="badge">${j.vip ? '⚡ VIP COMMERCIAL SNIPE' : j.veh.label}</span>
            <span class="badge" style="margin-left:4px;">${w.label}</span>
            <h3 style="font-size:14px;margin-top:5px;">${j.title}</h3>
          </div>
          <div class="job-pay">$${j.pay}${state.surgeJobs > 0 ? ' (2x)' : ''}</div>
        </div>
        <div class="job-meta">
          <span>${j.veh.heavy ? '🛞 HD Tire' : '🛞 Std Tire'} · ${j.veh.targetPsi} PSI${hazardBadge}${lockBadge}</span>
          <span>⭐ +${j.baseRep || 30} REP · ⏱️ SLA: ${j.timeLimit}s</span>
        </div>
        <button class="primary-btn" onclick="acceptJob('${j.id}')">
          ${j.vip ? `SNIPE DISPATCH (${j.snipeCost} ⚡)` : 'ACCEPT & ROLL RIG'}
        </button>
      </div>
    `;
  }).join('');
}

// --- LIVE COUNTDOWN TIMER ---
function startBayTimer() {
  if (bayTimerInterval) clearInterval(bayTimerInterval);
  bayTimerInterval = setInterval(() => {
    const job = state.activeJob;
    if (!job || job.isTutorial) return;
    if (typeof job.timeLeft !== 'number' || isNaN(job.timeLeft)) {
      job.timeLeft = job.timeLimit || job.veh.timeSec || 85;
    }
    if (job.timeLeft > 0) {
      job.timeLeft -= 1;
      const timerEl = document.getElementById('bay-timer-badge');
      if (timerEl) {
        timerEl.textContent = `⏱️ ${job.timeLeft}s`;
        timerEl.style.color = job.timeLeft <= 20 ? '#ef4444' : '#f59e0b';
      }
      if (job.timeLeft === 0) {
        addBayPenalty(job, 25, 'SLA Response Timeout: Exceeded dispatch window', 12);
        showAlert('SLA TIMER EXPIRED (-$25 / -12 REP)', 'Dispatch response window expired! Finish the repair immediately to avoid further rating loss.');
        renderBay();
      }
    }
  }, 1000);
}

function acceptJob(jobId) {
  if (state.activeJob) {
    goPage('bay');
    return;
  }
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return;
  if (job.vip) {
    if (state.tokens < job.snipeCost) {
      showAlert('INSUFFICIENT TOKENS', `VIP Commercial Snipe requires ${job.snipeCost} ⚡ Dispatch Tokens.`);
      goPage('shop');
      return;
    }
    state.tokens -= job.snipeCost;
  }
  state.jobs = state.jobs.filter((j) => j.id !== jobId);
  const startSec = job.timeLimit || job.veh.timeSec || 85;
  const lugHealth = {};
  LUG_COORDS.forEach((l) => {
    lugHealth[l.id] = job.isRusted ? (job.rustLayers || 2) : 1;
  });

  state.activeJob = {
    ...job,
    weather: job.weather || WEATHER_CONDITIONS[0],
    timeLimit: startSec,
    timeLeft: startSec,
    step: 1,
    conesSet: false,
    chocked: false,
    floodlightsOn: false,
    lockKeyApplied: !job.hasWheelLock,
    liftPct: 0,
    lugHealth,
    lugsRemoved: [],
    lastSpunLug: null,
    scanned: false,
    fixed: false,
    psi: 12,
    torqueIdx: 0,
    jackLowered: false,
    penalties: 0,
    repPenalties: 0,
    penaltyLog: []
  };
  saveState();
  updateHUD();
  renderJobs();
  startBayTimer();
  goPage('bay');
}

function startTutorial() {
  state.activeJob = {
    id: 'tut_call',
    isTutorial: true,
    title: 'I-285 Mile 14 — Guided Training Call',
    veh: VEHICLES[0],
    dmg: DAMAGES[0],
    weather: WEATHER_CONDITIONS[0],
    isRusted: false,
    rustLayers: 0,
    hasWheelLock: false,
    lockLugId: null,
    lockKeyApplied: true,
    floodlightsOn: true,
    lugHealth: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    pay: 80,
    timeLimit: 120,
    timeLeft: 120,
    vip: false,
    snipeCost: 0,
    step: 1,
    conesSet: false,
    chocked: false,
    liftPct: 0,
    lugsRemoved: [],
    lastSpunLug: null,
    scanned: false,
    fixed: false,
    psi: 14,
    torqueIdx: 0,
    jackLowered: false,
    penalties: 0,
    repPenalties: 0,
    penaltyLog: []
  };
  dismissAlert();
  goPage('bay');
}

function skipTutorial() {
  state.tutorialDone = true;
  state.activeJob = null;
  saveState();
  updateHUD();
  goPage('dispatch');
}

function getTutorialCoaching(job) {
  if (job.step === 1 && !job.conesSet) {
    return { stepLabel: 'TRAINING 1/8', text: 'Tap 1. SET CONES first to secure your highway shoulder perimeter.' };
  }
  if (job.step === 1 && !job.chocked) {
    return { stepLabel: 'TRAINING 2/8', text: 'Tap 2. CHOCKS next to lock the opposite wheels before jacking.' };
  }
  if (job.step === 1 && job.chocked) {
    return { stepLabel: 'TRAINING 3/8', text: 'Tap 3. PUMP JACK to raise the hydraulic lift arm and vehicle body.' };
  }
  if (job.step === 2) {
    return { stepLabel: 'TRAINING 4/8', text: 'Tap each of the 5 glowing lug nuts directly on the wheel hub to spin them off.' };
  }
  if (job.step === 3 && !job.scanned) {
    return { stepLabel: 'TRAINING 5/8', text: 'Tap SCAN TIRE TREAD & SIDEWALL to inspect the damage.' };
  }
  if (job.step === 3 && job.scanned) {
    return { stepLabel: 'TRAINING 5/8', text: 'Center-tread nail detected! Tap PLUG PUNCTURE (never swap a center nail).' };
  }
  if (job.step === 4) {
    return { stepLabel: 'TRAINING 6/8', text: 'Press & HOLD INFLATE into the green 33–37 PSI target band, then tap LOCK PRESSURE.' };
  }
  if (job.step === 5 && job.torqueIdx < 5) {
    return { stepLabel: 'TRAINING 7/8', text: `Tap Lug #${STAR_ORDER[job.torqueIdx]} directly on the wheel hub (Star Order: 1→3→5→2→4).` };
  }
  return { stepLabel: 'TRAINING 8/8', text: 'Tap LOWER JACK & STOW CONES to drop the rig and close the call!' };
}

function addBayPenalty(job, cashAmt, reason, repAmt = null) {
  if (!job || job.isTutorial) return;
  const repLoss = repAmt !== null ? repAmt : Math.max(4, Math.round(cashAmt * 0.4));
  job.penalties += cashAmt;
  job.repPenalties = (job.repPenalties || 0) + repLoss;
  if (!job.penaltyLog) job.penaltyLog = [];
  job.penaltyLog.push({ reason, amount: cashAmt, repLoss });
}

function showAlert(title, msg) {
  SoundFX.error();
  document.getElementById('diag-alert-title').textContent = title;
  document.getElementById('diag-alert-msg').textContent = msg;
  document.getElementById('diag-alert').classList.remove('hidden');
}

function dismissAlert() {
  document.getElementById('diag-alert').classList.add('hidden');
}

function getTireSpritePath(job) {
  const prefix = job.veh.heavy ? 'assets/bay-hd-tire-' : 'assets/bay-tire-';
  const suffix = job.fixed ? 'good.png' : `${job.dmg.fileKey}.png`;
  return prefix + suffix;
}

function toggleBayFloodlights() {
  const job = state.activeJob;
  if (!job) return;
  job.floodlightsOn = !job.floodlightsOn;
  SoundFX.torqueClick();
  renderBay();
}

function applyWheelLockKey() {
  const job = state.activeJob;
  if (!job || !job.hasWheelLock || job.lockKeyApplied) return;
  job.lockKeyApplied = true;
  dismissAlert();
  SoundFX.torqueClick();
  renderBay();
}

// --- SAFE SPRITE SYNC (Prevents broken-image text flash on click) ---
function syncSpriteSrc(imgEl, fbEl, newSrc, svgHtml) {
  if (!imgEl && !fbEl) return;
  if (imgEl && !fbEl && imgEl.parentNode) {
    fbEl = document.createElement('div');
    fbEl.id = imgEl.id ? `${imgEl.id}-fallback` : '';
    fbEl.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
    imgEl.parentNode.insertBefore(fbEl, imgEl.nextSibling);
  }
  if (fbEl && (!fbEl.dataset.initialized || fbEl.dataset.svgKey !== svgHtml)) {
    fbEl.innerHTML = svgHtml;
    fbEl.dataset.initialized = '1';
    fbEl.dataset.svgKey = svgHtml;
  }
  if (imgEl && imgEl.dataset.currentSrc !== newSrc) {
    imgEl.dataset.currentSrc = newSrc;
    imgEl.alt = '';
    imgEl.style.display = 'none';
    if (fbEl) fbEl.style.display = 'block';
    imgEl.onload = () => {
      imgEl.style.display = 'block';
      if (fbEl) fbEl.style.display = 'none';
    };
    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      if (fbEl) fbEl.style.display = 'block';
    };
    imgEl.src = newSrc;
    if (imgEl.complete && imgEl.naturalWidth > 0) {
      imgEl.style.display = 'block';
      if (fbEl) fbEl.style.display = 'none';
    }
  }
}

// --- 5-STEP REPAIR BAY ---
function renderBay() {
  const job = state.activeJob;
  document.getElementById('bay-empty').classList.toggle('hidden', !!job);
  document.getElementById('bay-active').classList.toggle('hidden', !job);
  if (!job) {
    stopHoldPsi();
    return;
  }

  if (typeof job.timeLeft !== 'number' || isNaN(job.timeLeft)) {
    job.timeLimit = job.timeLimit || job.veh.timeSec || 85;
    job.timeLeft = job.timeLimit;
    if (!job.isTutorial) startBayTimer();
  }
  if (!job.lugHealth) {
    job.lugHealth = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
  }
  const w = job.weather || WEATHER_CONDITIONS[0];

  let tutEl = document.getElementById('tut-coach-box');
  if (!tutEl) {
    tutEl = document.createElement('div');
    tutEl.id = 'tut-coach-box';
    const bayActive = document.getElementById('bay-active');
    bayActive.insertBefore(tutEl, bayActive.firstChild);
  }
  if (job.isTutorial) {
    const coach = getTutorialCoaching(job);
    tutEl.className = 'tut-banner';
    tutEl.innerHTML = `
      <div class="tut-banner-top">
        <span class="badge">${coach.stepLabel} · REWARD: +12 ⚡</span>
        <button class="ghost-btn" style="padding:3px 8px;font-size:11px;" onclick="skipTutorial()">Skip</button>
      </div>
      <p>${coach.text}</p>`;
  } else {
    tutEl.className = 'hidden';
  }

  document.getElementById('bay-veh-tag').textContent = `${job.veh.label}${job.isRusted ? ' · 🔩 RUSTED LUGS' : ''}${job.hasWheelLock ? ' · 🔑 WHEEL LOCK' : ''}`;
  document.getElementById('bay-job-title').textContent = job.title;
  const finalPay = job.pay * (state.surgeJobs > 0 ? 2 : 1);
  const payoutBox = document.getElementById('bay-payout');
  payoutBox.innerHTML = `
    <div>$${finalPay}${job.penalties > 0 ? ` <span style="font-size:11px;color:var(--red);">(-$${job.penalties})</span>` : ''}</div>
    <div id="bay-timer-badge" style="font-size:12px;font-weight:800;color:${job.isTutorial ? '#38bdf8' : job.timeLeft <= 20 ? '#ef4444' : '#f59e0b'};">
      ${job.isTutorial ? 'TRAINING' : `⏱️ ${job.timeLeft}s`}
    </div>`;

  const stage = document.getElementById('bay-stage');
  stage.classList.toggle('night-shift', w.id === 'night');
  stage.classList.toggle('floodlights-on', !!job.floodlightsOn);

  const weatherLayer = document.getElementById('weather-layer');
  if (weatherLayer) weatherLayer.classList.toggle('raining', w.id === 'rain');

  const nightShade = document.getElementById('night-shade');
  if (nightShade) nightShade.classList.toggle('hidden', !(w.id === 'night' && !job.floodlightsOn));

  const condPill = document.getElementById('stage-cond-pill');
  if (condPill) {
    condPill.className = `cond-pill ${w.id}`;
    condPill.textContent = w.label;
  }
  const floodBtn = document.getElementById('stage-flood-btn');
  if (floodBtn) {
    floodBtn.textContent = `🔦 FLOODLIGHTS: ${job.floodlightsOn ? 'ON' : 'OFF'}`;
    floodBtn.classList.toggle('on', !!job.floodlightsOn);
  }

  if (!document.getElementById('mag-tray')) {
    const tray = document.createElement('div');
    tray.id = 'mag-tray';
    tray.className = 'mag-tray';
    tray.textContent = 'MAG TRAY';
    stage.appendChild(tray);
  }
  if (!document.getElementById('stage-cones')) {
    const cones = document.createElement('div');
    cones.id = 'stage-cones';
    cones.className = 'stage-cones';
    cones.innerHTML = '<div class="cone-item"></div><div class="cone-item"></div><div class="cone-item"></div>';
    stage.appendChild(cones);
  }
  document.getElementById('stage-cones').classList.toggle('set', !!job.conesSet);

  const jackBox = document.getElementById('stage-jack');
  if (!jackBox.querySelector('.jack-saddle')) {
    const saddle = document.createElement('div');
    saddle.className = 'jack-saddle';
    jackBox.insertBefore(saddle, jackBox.firstChild);
  }

  const vehImg = document.getElementById('stage-veh-img');
  const vehFb = document.getElementById('stage-veh-fallback');
  syncSpriteSrc(vehImg, vehFb, job.veh.img, renderVehicleSVG(job.veh));

  const tireImg = document.getElementById('stage-tire-img');
  const tireFb = document.getElementById('stage-tire-fallback');
  syncSpriteSrc(tireImg, tireFb, getTireSpritePath(job), renderTireSVG(job, 132));

  const effectiveLift = job.jackLowered ? 0 : job.liftPct;
  const liftPx = Math.round((effectiveLift / 100) * 26);
  const wheelLiftPx = Math.round((effectiveLift / 100) * 16);
  document.getElementById('stage-chock').classList.toggle('set', job.chocked && !job.jackLowered);
  document.getElementById('jack-arm').style.height = `${12 + Math.round((effectiveLift / 100) * 44)}px`;
  document.getElementById('stage-chassis').style.transform = `translateX(-50%) translateY(-${liftPx}px)`;
  document.getElementById('stage-wheel-wrap').style.transform = `translateX(-50%) translateY(-${wheelLiftPx}px)`;
  document.getElementById('scan-beam').classList.toggle('hidden', !(job.step === 3 && !job.scanned));

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`sp-${i}`);
    el.className = 'sp' + (job.step === i ? ' active' : job.step > i ? ' done' : '');
  }

  const canSpin = job.step === 2 || (job.step === 5 && job.torqueIdx < 5);
  const lugRing = document.getElementById('lug-ring');
  lugRing.innerHTML = LUG_COORDS.map((l) => {
    const isRemoved = job.lugsRemoved.includes(l.id) && job.step < 5;
    const isTorqued = job.step === 5 && STAR_ORDER.slice(0, job.torqueIdx).includes(l.id);
    const isSpinning = canSpin && job.lastSpunLug === l.id;
    const remHealth = job.lugHealth[l.id] || 1;
    const isSeized = job.step === 2 && !isRemoved && remHealth > 1;
    const isSecLock = job.hasWheelLock && job.lockLugId === l.id;
    const pulseLug = job.isTutorial && (
      (job.step === 2 && !isRemoved) ||
      (job.step === 5 && job.torqueIdx < 5 && STAR_ORDER[job.torqueIdx] === l.id)
    );
    const lockClass = isSecLock ? (job.lockKeyApplied ? 'lock-unlocked' : 'security-lock') : '';
    const iconTxt = isSecLock && !job.lockKeyApplied ? '🔑' : isSeized ? '🔩' : l.id;
    return `<button type="button" class="lug-btn ${isRemoved ? 'removed' : ''} ${isTorqued ? 'torqued' : ''} ${isSpinning ? 'spinning' : ''} ${isSeized ? 'rusted' : ''} ${lockClass} ${pulseLug ? 'tut-pulse' : ''}"
      style="left:${l.x}%;top:${l.y}%;"
      onclick="tapLug(${l.id})">${iconTxt}</button>`;
  }).join('');

  const svg = document.getElementById('star-lines-svg');
  if (job.step === 5 && job.torqueIdx > 1) {
    const pts = STAR_ORDER.slice(0, job.torqueIdx).map((id) => {
      const c = LUG_COORDS.find((x) => x.id === id);
      return `${(c.x / 100) * 120},${(c.y / 100) * 120}`;
    }).join(' ');
    svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" />`;
  } else {
    svg.innerHTML = '';
  }

  const ctrl = document.getElementById('bay-controls');
  if (job.step === 1) {
    const weightNote = job.veh.heavy ? ' · Heavy Commercial Axle' : '';
    const nightWarn = w.id === 'night' && !job.floodlightsOn
      ? `<p style="font-size:11px;color:#a5b4fc;font-weight:700;">🌙 Night Shift: Toggle LED Floodlights ON at top of stage before unbolting!</p>`
      : '';
    ctrl.innerHTML = `
      <strong>Step 1: Perimeter & Hydraulic Lift (${job.liftPct}%)${weightNote}</strong>
      ${nightWarn}
      <div class="ctrl-grid-3">
        <button type="button" class="secondary-btn ${job.isTutorial && !job.conesSet ? 'tut-pulse' : ''}" onclick="setCones()" style="font-size:11px;padding:9px 4px;">
          ${job.conesSet ? '✓ CONES SET' : '1. SET CONES'}
        </button>
        <button type="button" class="secondary-btn ${job.isTutorial && job.conesSet && !job.chocked ? 'tut-pulse' : ''}" onclick="setChocks()" style="font-size:11px;padding:9px 4px;">
          ${job.chocked ? '✓ CHOCKED' : '2. CHOCKS'}
        </button>
        <button type="button" class="primary-btn ${job.isTutorial && job.conesSet && job.chocked ? 'tut-pulse' : ''}" onclick="pumpJack()" style="font-size:11px;padding:9px 4px;">
          3. PUMP JACK
        </button>
      </div>`;
  } else if (job.step === 2) {
    const breakPower = 1 + Math.floor((state.tools.impact.level - 1) / 4);
    const lockUi = job.hasWheelLock && !job.lockKeyApplied
      ? `<button type="button" class="primary-btn tut-pulse" onclick="applyWheelLockKey()" style="margin-top:4px;">🔑 SEAT WHEEL LOCK KEY ON LUG #${job.lockLugId}</button>`
      : job.hasWheelLock
        ? `<div style="font-size:11px;color:var(--blue);font-weight:800;">✓ Security Lock Key Adapter Seated on Lug #${job.lockLugId}</div>`
        : '';
    ctrl.innerHTML = `
      <strong>Step 2: Unbolt All 5 Lugs (${job.lugsRemoved.length}/5) · Impact Power: ${breakPower}x</strong>
      <p style="font-size:12px;color:var(--muted);">
        ${job.isRusted ? '🔩 Seized rusted lugs detected! Hammer each rusted lug with your Impact Wrench to break corrosion.' : 'Tap each lug nut directly on the wheel hub to spin it off.'}
      </p>
      ${lockUi}`;
  } else if (job.step === 3) {
    if (!job.scanned) {
      ctrl.innerHTML = `
        <strong>Step 3: Diagnostic Tire Inspection</strong>
        <p style="font-size:12px;color:var(--muted);">Run diagnostic laser scan to verify puncture vs. structural casing failure.</p>
        <button type="button" class="primary-btn ${job.isTutorial ? 'tut-pulse' : ''}" onclick="runScan()">SCAN TIRE TREAD & SIDEWALL</button>`;
    } else {
      const tireSprite = getTireSpritePath(job);
      const swapLabel = job.veh.heavy
        ? `SWAP HD TIRE (${state.hdTires})`
        : `SWAP STD TIRE (${state.stdTires})`;
      ctrl.innerHTML = `
        <div class="diag-scan-card">
          <div class="diag-tire-preview">
            <img src="${tireSprite}" alt="" style="display:none;" onload="this.style.display='block';if(this.nextElementSibling)this.nextElementSibling.style.display='none';" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='block';" />
            <div>${renderTireSVG(job, 72)}</div>
          </div>
          <div>
            <span class="badge">${job.dmg.verdict}</span>
            <strong style="color:var(--text);font-size:13px;display:block;margin-top:4px;">${job.dmg.title}</strong>
            <p style="font-size:11px;color:var(--muted);margin-top:2px;">${job.dmg.desc}</p>
          </div>
        </div>
        <div class="ctrl-grid-2">
          <button type="button" class="secondary-btn ${job.isTutorial ? 'tut-pulse' : ''}" onclick="performRepair('plug')">PLUG PUNCTURE (${state.plugs})</button>
          <button type="button" class="primary-btn" onclick="performRepair('swap')">${swapLabel}</button>
        </div>
        <button type="button" class="ghost-btn" onclick="droneDrop()">🚁 Drone ${job.veh.heavy ? 'HD' : 'Std'} Tire Drop (${job.veh.heavy ? 5 : 3} ⚡)</button>`;
    }
  } else if (job.step === 4) {
    renderPsiStepControls(ctrl, job);
  } else if (job.step === 5) {
    if (job.torqueIdx < 5) {
      ctrl.innerHTML = `
        <strong>Step 5: Star-Pattern Torque (${job.torqueIdx}/5)</strong>
        <p style="font-size:12px;color:var(--muted);">Tap the lugs directly on the wheel in crisscross star order: <strong>1 → 3 → 5 → 2 → 4</strong>.</p>`;
    } else {
      ctrl.innerHTML = `
        <strong>Step 5 Complete: All 5 Lugs Torqued to Spec!</strong>
        <p style="font-size:12px;color:var(--green);">Lower the hydraulic floor jack and stow traffic cones to release the vehicle.</p>
        <button type="button" class="primary-btn tut-pulse" style="background:var(--green);" onclick="lowerJackAndFinish()">⬇️ LOWER JACK & STOW CONES</button>`;
    }
  }
}

// --- PRESS & HOLD AIR INFLATION / BLEEDING ---
function renderPsiStepControls(ctrl, job) {
  const t = job.veh.targetPsi;
  const tol = 2 + Math.floor((state.tools.comp.level - 1) / 8);
  const inSpec = Math.abs(job.psi - t) <= tol;
  const fillPct = Math.min(100, Math.round((job.psi / (t + 20)) * 100));
  const bandLeft = Math.round(((t - tol) / (t + 20)) * 100);
  const bandWidth = Math.max(8, Math.round(((tol * 2) / (t + 20)) * 100));
  const psiStep = 4 + Math.floor((state.tools.comp.level - 1) / 3);

  ctrl.innerHTML = `
    <strong>Step 4: Hold to Calibrate Pressure (Target: ${t - tol}–${t + tol} PSI)</strong>
    <div class="psi-meter">
      <div id="psi-live-val" class="psi-val ${inSpec ? 'in-spec' : ''}">${job.psi} PSI ${inSpec ? '· IN SPEC' : ''}</div>
      <div class="psi-bar-track">
        <div class="psi-target-band" style="left:${bandLeft}%;width:${bandWidth}%;"></div>
        <div id="psi-live-fill" class="psi-fill" style="width:${fillPct}%;background:${inSpec ? 'var(--green)' : 'var(--blue)'};"></div>
      </div>
    </div>
    <div class="ctrl-grid-2">
      <button type="button" class="secondary-btn hold-btn"
        onpointerdown="startHoldPsi(-2)"
        onpointerup="stopHoldPsi()"
        onpointerleave="stopHoldPsi()"
        onpointercancel="stopHoldPsi()">
        🔽 HOLD BLEED (-2)
      </button>
      <button type="button" class="primary-btn hold-btn ${job.isTutorial && !inSpec ? 'tut-pulse' : ''}"
        onpointerdown="startHoldPsi(${psiStep})"
        onpointerup="stopHoldPsi()"
        onpointerleave="stopHoldPsi()"
        onpointercancel="stopHoldPsi()">
        🔼 HOLD INFLATE (+${psiStep})
      </button>
    </div>
    <button type="button" class="primary-btn ${job.isTutorial && inSpec ? 'tut-pulse' : ''}" onclick="stopHoldPsi(); lockPsi();">
      LOCK PRESSURE & CONTINUE
    </button>`;
}

function updateLivePsiMeter(job) {
  const t = job.veh.targetPsi;
  const tol = 2 + Math.floor((state.tools.comp.level - 1) / 8);
  const inSpec = Math.abs(job.psi - t) <= tol;
  const fillPct = Math.min(100, Math.round((job.psi / (t + 20)) * 100));
  const valEl = document.getElementById('psi-live-val');
  const fillEl = document.getElementById('psi-live-fill');
  if (valEl) {
    valEl.textContent = `${job.psi} PSI ${inSpec ? '· IN SPEC' : ''}`;
    valEl.className = `psi-val ${inSpec ? 'in-spec' : ''}`;
  }
  if (fillEl) {
    fillEl.style.width = `${fillPct}%`;
    fillEl.style.background = inSpec ? 'var(--green)' : 'var(--blue)';
  }
}

function startHoldPsi(deltaPerTick) {
  stopHoldPsi();
  applyPsiTick(deltaPerTick);
  holdPsiInterval = setInterval(() => {
    applyPsiTick(deltaPerTick);
  }, 115);
}

function stopHoldPsi() {
  if (holdPsiInterval) {
    clearInterval(holdPsiInterval);
    holdPsiInterval = null;
  }
}

function applyPsiTick(delta) {
  const job = state.activeJob;
  if (!job || job.step !== 4) {
    stopHoldPsi();
    return;
  }
  const prevPsi = job.psi;
  const nextPsi = Math.max(0, Math.min(130, job.psi + delta));
  if (nextPsi === prevPsi) return;
  job.psi = nextPsi;
  SoundFX.air();
  updateLivePsiMeter(job);

  if (job.psi > job.veh.targetPsi + 10) {
    stopHoldPsi();
    addBayPenalty(job, 15, 'Over-Inflation Hazard: Exceeded safe PSI threshold', 8);
    showAlert('OVER-INFLATION HAZARD (-$15 / -8 REP)', `Pressure spiked above ${job.veh.targetPsi + 10} PSI! Hold BLEED to drop pressure safely.`);
    renderBay();
  }
}

function setCones() {
  const job = state.activeJob;
  if (!job || job.conesSet) return;
  job.conesSet = true;
  job.lastSpunLug = null;
  dismissAlert();
  SoundFX.chock();
  renderBay();
}

function setChocks() {
  const job = state.activeJob;
  if (!job) return;
  if (!job.conesSet) {
    addBayPenalty(job, 10, 'DOT Safety Violation: Worked shoulder without traffic cones', 5);
    showAlert('DOT CONE ALERT (-$10 / -5 REP)', 'Deploy reflective highway traffic cones before chocking or lifting on the shoulder!');
    renderBay();
    return;
  }
  if (job.chocked) return;
  job.chocked = true;
  job.lastSpunLug = null;
  dismissAlert();
  SoundFX.chock();
  renderBay();
}

function pumpJack() {
  const job = state.activeJob;
  if (!job) return;
  if (!job.conesSet) {
    addBayPenalty(job, 10, 'DOT Safety Violation: Lifted without traffic cones', 5);
    showAlert('DOT CONE ALERT (-$10 / -5 REP)', 'Deploy highway traffic cones first to protect your roadside bay!');
    renderBay();
    return;
  }
  if (!job.chocked) {
    addBayPenalty(job, 15, 'OSHA Safety Violation: Lifted without wheel chocks', 8);
    showAlert('OSHA SAFETY VIOLATION (-$15 / -8 REP)', 'Set rubber wheel chocks before raising the hydraulic floor jack!');
    renderBay();
    return;
  }
  dismissAlert();
  SoundFX.jack();
  const rawLift = 26 + state.tools.jack.level * 4;
  const weightDivisor = job.veh.axleWeight || 1.0;
  const effectiveBoost = Math.max(12, Math.round(rawLift / weightDivisor));
  job.liftPct = Math.min(100, job.liftPct + effectiveBoost);
  if (job.liftPct >= 100) job.step = 2;
  renderBay();
}

function triggerLugSpin(job, id) {
  job.lastSpunLug = id;
  if (spinClearTimeout) clearTimeout(spinClearTimeout);
  spinClearTimeout = setTimeout(() => {
    if (state.activeJob) state.activeJob.lastSpunLug = null;
  }, 460);
}

function tapLug(id) {
  const job = state.activeJob;
  if (!job) return;
  const w = job.weather || WEATHER_CONDITIONS[0];

  if (job.step === 1) {
    addBayPenalty(job, 10, 'Protocol Error: Impacted lugs before vehicle was lifted', 5);
    showAlert('LIFT VEHICLE FIRST (-$10 / -5 REP)', 'Deploy cones, set chocks, and pump the hydraulic jack to 100% before unbolting lugs.');
    renderBay();
    return;
  }

  if (w.id === 'night' && !job.floodlightsOn) {
    addBayPenalty(job, 8, 'Night Visibility Hazard: Worked wheel hub without LED floodlights', 4);
    showAlert('TURN ON LED FLOODLIGHTS (-$8 / -4 REP)', 'Tap 🔦 FLOODLIGHTS: OFF in the top-right of the highway stage before working in the dark!');
    renderBay();
    return;
  }

  if (job.step === 2) {
    if (job.hasWheelLock && job.lockLugId === id && !job.lockKeyApplied) {
      addBayPenalty(job, 10, 'Security Wheel Lock Error: Impacted lock lug without key adapter', 5);
      showAlert('SECURITY WHEEL LOCK (-$10 / -5 REP)', `Lug #${id} has a security spline lock! Tap 🔑 SEAT WHEEL LOCK KEY below first.`);
      renderBay();
      return;
    }

    if (w.id === 'rain' && Math.random() < 0.22) {
      SoundFX.error();
      showAlert('🌧️ WET SOCKET SLIP', 'Rain-slicked lug nut slipped! Tap the lug firmly again to seat the socket.');
      return;
    }

    if (!job.lugsRemoved.includes(id)) {
      const breakPower = 1 + Math.floor((state.tools.impact.level - 1) / 4);
      job.lugHealth[id] = Math.max(0, (job.lugHealth[id] || 1) - breakPower);
      triggerLugSpin(job, id);
      SoundFX.impact();
      if (job.lugHealth[id] <= 0) {
        job.lugsRemoved.push(id);
        if (job.lugsRemoved.length >= 5) {
          job.lastSpunLug = null;
          job.step = 3;
        }
      }
      renderBay();
    }
  } else if (job.step === 5 && job.torqueIdx < 5) {
    const expected = STAR_ORDER[job.torqueIdx];
    if (id !== expected) {
      addBayPenalty(job, 12, 'Torque Sequence Error: Out-of-order lug torquing', 6);
      showAlert('STAR-PATTERN SEQUENCE ERROR (-$12 / -6 REP)', 'Wrong lug! Follow crisscross star torque sequence (1 → 3 → 5 → 2 → 4).');
      renderBay();
      return;
    }
    dismissAlert();
    SoundFX.torqueClick();
    triggerLugSpin(job, id);
    job.torqueIdx++;
    renderBay();
  }
}

function lowerJackAndFinish() {
  const job = state.activeJob;
  if (!job || job.step !== 5 || job.torqueIdx < 5) return;
  job.jackLowered = true;
  SoundFX.jack();
  renderBay();
  setTimeout(() => {
    completeJob();
  }, 350);
}

function runScan() {
  const job = state.activeJob;
  if (!job) return;
  job.lastSpunLug = null;
  SoundFX.scan();
  job.scanned = true;
  renderBay();
}

function performRepair(choice) {
  const job = state.activeJob;
  if (!job) return;
  job.lastSpunLug = null;

  if (job.dmg.action === 'plug' && choice !== 'plug') {
    addBayPenalty(job, 20, 'Diagnostic Error: Swapped repairable center-nail tire', 10);
    showAlert(
      'UNNECESSARY TIRE SWAP (-$20 / -10 REP)',
      'Center-tread nail punctures are ALWAYS Plug Only. Do not waste a new tire!'
    );
    renderBay();
    return;
  }
  if (job.dmg.action === 'swap' && choice !== 'swap') {
    addBayPenalty(job, 30, 'Safety Violation: Attempted to plug unrepairable casing', 15);
    showAlert(
      'UNSAFE REPAIR REJECTED (-$30 / -15 REP)',
      `${job.dmg.title} cannot be plugged safely. You MUST perform a full Tire Swap!`
    );
    renderBay();
    return;
  }

  if (choice === 'plug') {
    if (!job.isTutorial && state.plugs <= 0) {
      showAlert('OUT OF PLUGS', 'Restock vulcanized tire plugs from Dispatch or watch a Supply Drop Ad in the Shop.');
      return;
    }
    if (!job.isTutorial) state.plugs--;
    SoundFX.impact();
  } else {
    if (job.veh.heavy) {
      if (!job.isTutorial && state.hdTires <= 0) {
        showAlert('OUT OF HEAVY-DUTY TIRES', 'Commercial trucks require Heavy-Duty Tires! Use Drone Drop below or restock HD Tires.');
        return;
      }
      if (!job.isTutorial) state.hdTires--;
    } else {
      if (!job.isTutorial && state.stdTires <= 0) {
        showAlert('OUT OF STANDARD TIRES', 'Use Drone Tire Drop below or restock Standard Tires on Dispatch.');
        return;
      }
      if (!job.isTutorial) state.stdTires--;
    }
    SoundFX.impact();
    const wrap = document.getElementById('stage-wheel-wrap');
    wrap.classList.add('swapping');
    setTimeout(() => wrap.classList.remove('swapping'), 320);
  }

  dismissAlert();
  job.fixed = true;
  job.step = 4;
  updateHUD();
  renderBay();
}

function droneDrop() {
  const job = state.activeJob;
  if (!job) return;
  const cost = job.veh.heavy ? 5 : 3;
  if (state.tokens < cost) {
    showAlert('INSUFFICIENT TOKENS', `Drone ${job.veh.heavy ? 'Heavy-Duty' : 'Standard'} Tire Drop costs ${cost} ⚡.`);
    goPage('shop');
    return;
  }
  state.tokens -= cost;
  if (job.veh.heavy) state.hdTires += 1;
  else state.stdTires += 1;
  SoundFX.success();
  updateHUD();
  renderBay();
}

function lockPsi() {
  const job = state.activeJob;
  if (!job) return;
  job.lastSpunLug = null;
  const t = job.veh.targetPsi;
  const tol = 2 + Math.floor((state.tools.comp.level - 1) / 8);
  if (Math.abs(job.psi - t) > tol) {
    addBayPenalty(job, 12, 'PSI Calibration Error: Locked pressure out of spec', 6);
    showAlert('PSI OUT OF SPEC (-$12 / -6 REP)', `Calibrate pressure between ${t - tol} and ${t + tol} PSI before torquing lugs.`);
    renderBay();
    return;
  }
  dismissAlert();
  SoundFX.torqueClick();
  job.step = 5;
  renderBay();
}

function completeJob() {
  stopHoldPsi();
  const job = state.activeJob;
  SoundFX.success();

  if (job.isTutorial) {
    const firstTime = !state.tutorialDone;
    state.tutorialDone = true;
    if (firstTime) state.tokens += 12;
    state.activeJob = null;
    saveState();
    updateHUD();
    openModal(`
      <span class="badge">TRAINING COMPLETE</span>
      <h3>Certified DelWin Technician!</h3>
      <p style="font-size:13px;color:var(--muted);">
        You mastered traffic cones, wheel chocks, lug removal, center-nail plug diagnostics, hold-to-inflate PSI calibration, star-pattern torquing, and jack stowage.
      </p>
      <div style="background:#090c12;padding:12px;border-radius:10px;text-align:center;color:var(--amber);font-weight:900;">
        ${firstTime ? '+12 DISPATCH TOKENS (⚡) CREDITED!' : 'TRAINING PRACTICE COMPLETE'}
      </div>
      <button type="button" class="primary-btn" onclick="closeModal(); goPage('dispatch');">ENTER LIVE DISPATCH</button>
    `);
    return;
  }

  const mult = state.surgeJobs > 0 ? 2 : 1;
  if (state.surgeJobs > 0) state.surgeJobs--;
  const gross = job.pay * mult;
  const isFast = job.timeLeft >= Math.round(job.timeLimit * 0.45);
  const speedBonus = isFast ? Math.round(job.pay * 0.08) : 0;
  const overheadFee = getFleetOverheadFee(job);
  const totalDeductions = job.penalties + overheadFee;
  const net = Math.max(15, gross + speedBonus - totalDeductions);

  const z = getZone();
  const fallbackBaseRep = Math.round(((job.dmg && job.dmg.action === 'swap' ? 32 : 24) + (job.veh && job.veh.heavy ? 12 : 0)) * z.mult);
  const rawJobRep = job.baseRep || fallbackBaseRep;
  const fastRepBonus = isFast ? Math.max(6, Math.round(rawJobRep * 0.25)) : 0;
  const baseRep = rawJobRep + fastRepBonus;
  const repDeductions = job.repPenalties || 0;
  const netRep = baseRep - repDeductions;
  state.rep = Math.max(0, state.rep + netRep);

  const isCleanJob = job.penalties === 0;
  state.cash += net;
  state.jobsCompleted = (state.jobsCompleted || 0) + 1;
  if (isCleanJob) state.streak = (state.streak || 0) + 1;
  else state.streak = 0;

  // Tightened 3-call clean-streak Gold Gear drops + 9/15 streak milestones
  const earnedStreakGear = isCleanJob ? getStreakGearReward(state.streak) : 0;
  if (earnedStreakGear > 0) {
    state.parts += earnedStreakGear;
    if (state.streak >= MAX_STREAK_ROLLOVER) {
      state.streak = 0;
    }
  }

  if (state.contract && state.contract.progress < state.contract.target) {
    const ct = state.contract.type;
    if (ct === 'clean_streak' && isCleanJob) state.contract.progress += 1;
    if (ct === 'plugs' && job.dmg.action === 'plug') state.contract.progress += 1;
    if (ct === 'swaps' && job.dmg.action === 'swap') state.contract.progress += 1;
    if (ct === 'fast' && isFast) state.contract.progress += 1;
    if (ct === 'heavy' && job.veh.heavy) state.contract.progress += 1;
  }

  const jobRating = isCleanJob ? 5.0 : Math.max(2.0, 4.7 - job.penalties * 0.04);
  state.ratings.push(jobRating);
  if (state.ratings.length > 15) state.ratings.shift();
  state.activeJob = null;

  if (state.jobs.length < 2) refreshJobs();
  saveState();
  updateHUD();

  const logHtml = (job.penaltyLog || []).map((p) =>
    `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--red);"><span>• ${p.reason}</span><span>-$${p.amount} / -${p.repLoss} REP</span></div>`
  ).join('');

  openModal(`
    <span class="badge">DIGITAL CUSTOMER INVOICE · ${jobRating.toFixed(1)} ★</span>
    <h3>${job.title}</h3>
    <div style="background:#090c12;padding:12px;border-radius:10px;font-size:13px;display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;justify-content:space-between;"><span>Base + Weather Payout:</span><strong style="color:var(--green);">+$${gross}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Fast-Response Bonus:</span><strong style="color:var(--blue);">+$${speedBonus}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Fleet Fuel & Dispatch Overhead:</span><strong style="color:var(--muted);">-$${overheadFee}</strong></div>
      ${job.penalties > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Bay & SLA Penalties:</span><strong style="color:var(--red);">-$${job.penalties}</strong></div>` : ''}
      ${logHtml}
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:6px;"><span>Net Collected:</span><strong style="color:var(--green);">$${net}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Corridor REP (${baseRep} - ${repDeductions} pen):</span><strong style="color:${netRep >= 0 ? 'var(--amber)' : 'var(--red)'};">${netRep >= 0 ? '+' : ''}${netRep} REP</strong></div>
      ${earnedStreakGear > 0 ? `<div style="color:var(--amber);font-weight:800;">+${earnedStreakGear} Gold Gear${earnedStreakGear > 1 ? 's' : ''} (⚙️) · Clean Streak Milestone!</div>` : ''}
    </div>
    <button type="button" class="primary-btn" onclick="closeModal(); goPage('dispatch');">RETURN TO DISPATCH</button>
  `);
}

function buyStock(type) {
  const rig = getActiveRigObj();
  const sp = getStockPricing();
  if (type === 'plug') {
    if (state.plugs >= rig.capPlugs) {
      showAlert('CARGO CAPACITY FULL', `${rig.name} holds max ${rig.capPlugs} Plug Kits. Upgrade your Rig Tier in the Garage for more cargo space!`);
      return;
    }
    if (state.cash >= sp.plugPackCost) {
      state.cash -= sp.plugPackCost;
      state.plugs = Math.min(rig.capPlugs, state.plugs + sp.plugPackQty);
      SoundFX.torqueClick();
    } else {
      showAlert('INSUFFICIENT CASH', `Need $${sp.plugPackCost} to restock +${sp.plugPackQty} Plug Kits.`);
      return;
    }
  } else if (type === 'std') {
    if (state.stdTires >= rig.capStd) {
      showAlert('CARGO CAPACITY FULL', `${rig.name} holds max ${rig.capStd} Standard Tires. Upgrade your Rig Tier in the Garage for more cargo space!`);
      return;
    }
    if (state.cash >= sp.stdCost) {
      state.cash -= sp.stdCost;
      state.stdTires += 1;
      SoundFX.torqueClick();
    } else {
      showAlert('INSUFFICIENT CASH', `Need $${sp.stdCost} to restock +1 Standard Tire.`);
      return;
    }
  } else if (type === 'hd') {
    if (state.hdTires >= rig.capHd) {
      showAlert('CARGO CAPACITY FULL', `${rig.name} holds max ${rig.capHd} Heavy-Duty Tires. Upgrade your Rig Tier in the Garage for more cargo space!`);
      return;
    }
    if (state.cash >= sp.hdCost) {
      state.cash -= sp.hdCost;
      state.hdTires += 1;
      SoundFX.torqueClick();
    } else {
      showAlert('INSUFFICIENT CASH', `Need $${sp.hdCost} to restock +1 Heavy-Duty Tire.`);
      return;
    }
  }
  saveState();
  updateHUD();
}

// --- GARAGE (Hub-Aligned Tool Tiers) ---
function stepRigPreview(delta) {
  const current = previewRigTier || getRigTier();
  previewRigTier = Math.max(1, Math.min(6, current + delta));
  SoundFX.torqueClick();
  renderGarage();
}

function stepToolPreview(key, delta) {
  const tool = state.tools[key];
  const ownedTier = Math.min(6, Math.floor((tool.level - 1) / 4) + 1);
  const current = previewToolTiers[key] || ownedTier;
  previewToolTiers[key] = Math.max(1, Math.min(6, current + delta));
  SoundFX.torqueClick();
  renderGarage();
}

function purchaseRigTier(tierNum) {
  const rig = RIG_TIERS[tierNum - 1];
  if (!rig) return;
  if (state.unlockedRigTier >= tierNum) return;
  if (state.unlockedRigTier !== tierNum - 1) {
    showAlert('SEQUENTIAL RIG UNLOCK', `Unlock Tier ${tierNum - 1} first before commissioning Tier ${tierNum}.`);
    return;
  }
  if (getMinToolLevel() < rig.reqLvl) {
    showAlert('TOOL MILESTONE REQUIRED', `Upgrade all 4 tools to Level ${rig.reqLvl}+ before unlocking ${rig.name}.`);
    return;
  }
  if (state.cash < rig.cashCost || state.parts < rig.partCost || state.tokens < rig.tokenCost) {
    showAlert(
      'INSUFFICIENT RIG COMMISSION RESOURCES',
      `${rig.name} requires $${rig.cashCost.toLocaleString()} Cash, ${rig.partCost} ⚙️ Gold Gears, and ${rig.tokenCost} ⚡ Dispatch Tokens.`
    );
    return;
  }
  state.cash -= rig.cashCost;
  state.parts -= rig.partCost;
  state.tokens -= rig.tokenCost;
  state.unlockedRigTier = tierNum;
  SoundFX.success();
  saveState();
  updateHUD();
  renderGarage();
  openModal(`
    <span class="badge">NEW SERVICE RIG COMMISSIONED</span>
    <h3>${rig.name}</h3>
    <p style="font-size:13px;color:var(--muted);">${rig.perk} Cargo Cap: ${rig.capStd} Std / ${rig.capHd} HD / ${rig.capPlugs} Plugs.</p>
    <button type="button" class="primary-btn" onclick="closeModal()">ROLL OUT NEW RIG</button>
  `);
}

function renderGarage() {
  const activeRigTier = getRigTier();
  if (!previewRigTier) previewRigTier = activeRigTier;
  const rig = RIG_TIERS[previewRigTier - 1];
  const isUnlocked = previewRigTier <= (state.unlockedRigTier || 1);
  const meetsTools = getMinToolLevel() >= rig.reqLvl;
  const currentHub = getCurrentHubTier();

  const garagePage = document.getElementById('page-garage');
  let heroCard = garagePage.querySelector('.rig-hero');
  if (!heroCard) {
    heroCard = document.createElement('div');
    heroCard.className = 'item-card rig-hero';
    heroCard.style.marginBottom = '10px';
    garagePage.prepend(heroCard);
  }

  heroCard.innerHTML = `
    <div class="rig-hero-top" style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <span class="badge">${isUnlocked ? 'COMMISSIONED FLEET RIG' : meetsTools ? 'READY TO COMMISSION' : `REQUIRES ${rig.req.toUpperCase()}`}</span>
        <h3 style="font-size:15px;margin-top:4px;">${rig.name}</h3>
      </div>
      <div class="carousel-nav">
        <button type="button" class="arrow-btn" ${previewRigTier <= 1 ? 'disabled' : ''} onclick="stepRigPreview(-1)">◀</button>
        <span class="tier-pill">T${previewRigTier}/6</span>
        <button type="button" class="arrow-btn" ${previewRigTier >= 6 ? 'disabled' : ''} onclick="stepRigPreview(1)">▶</button>
      </div>
    </div>
    <div class="rig-visual-box">
      ${renderRigSVG(rig)}
      <img src="${rig.img}" alt="" style="display:none;" onload="this.style.display='block';" onerror="this.style.display='none';" />
    </div>
    <p id="rig-perk" style="font-size:12px;color:var(--muted);">${rig.perk} (${rig.req})</p>
    <div style="font-size:11px;color:var(--amber);font-weight:800;">
      Hub ${currentHub.hubNum} (${currentHub.name}) → Tool Tier ${currentHub.toolTier} (${currentHub.levels}) · Cargo: ${rig.capStd} Std / ${rig.capHd} HD / ${rig.capPlugs} Plugs
    </div>
    <button type="button" id="rig-commission-btn" class="primary-btn" style="margin-top:6px;"
      ${isUnlocked || !meetsTools || previewRigTier !== (state.unlockedRigTier + 1) ? 'disabled' : ''}
      onclick="purchaseRigTier(${previewRigTier})">
      ${isUnlocked
        ? `✓ ACTIVE FLEET RIG (${rig.mult.toFixed(2)}x PAYOUTS)`
        : meetsTools
          ? `COMMISSION RIG: $${rig.cashCost.toLocaleString()} + ${rig.partCost} ⚙️ + ${rig.tokenCost} ⚡`
          : `LOCKED · ALL TOOLS LVL ${rig.reqLvl}+ ($${rig.cashCost.toLocaleString()} + ${rig.partCost}⚙️ + ${rig.tokenCost}⚡)`}
    </button>
  `;

  const list = document.getElementById('tool-list');
  list.innerHTML = Object.entries(state.tools).map(([key, tool]) => {
    const ownedTier = Math.min(6, Math.floor((tool.level - 1) / 4) + 1);
    const viewTier = previewToolTiers[key] || ownedTier;
    const viewTierLabel = TIER_NAMES[viewTier - 1];
    const hubForTier = HUB_TIERS[viewTier - 1] || HUB_TIERS[0];
    const isMax = tool.level >= 24;
    const spec = getToolUpgradeSpec(key);
    const needsPart = !isMax && spec.gears > 0;
    const cost = spec.cost;
    const imgPath = `assets/${tool.prefix}-t${viewTier}.png`;
    const isPreviewingFuture = viewTier > ownedTier;
    const effectDesc = getToolEffectSummary(key, tool.level);

    return `
      <div class="item-card">
        <div class="tool-row" style="display:flex;align-items:center;gap:10px;">
          <div class="tool-thumb-hybrid">
            ${renderToolSVG(key, viewTier)}
            <img src="${imgPath}" alt="" style="display:none;" onload="this.style.display='block';" onerror="this.style.display='none';" />
          </div>
          <div style="flex:1;min-width:0;">
            <span class="badge">
              ${isPreviewingFuture ? `PREVIEW T${viewTier}: ${viewTierLabel.toUpperCase()} · HUB ${hubForTier.hubNum}` : `LVL ${tool.level}/24 · T${ownedTier} (${TIER_NAMES[ownedTier - 1].toUpperCase()}) · HUB ${ownedTier}`}
            </span>
            <h3 style="font-size:14px;margin-top:4px;">${tool.name}</h3>
            <div style="font-size:11px;color:var(--amber);margin-top:2px;">${effectDesc}</div>
          </div>
          <div class="carousel-nav">
            <button type="button" class="arrow-btn" ${viewTier <= 1 ? 'disabled' : ''} onclick="stepToolPreview('${key}', -1)">◀</button>
            <button type="button" class="arrow-btn" ${viewTier >= 6 ? 'disabled' : ''} onclick="stepToolPreview('${key}', 1)">▶</button>
          </div>
        </div>
        <button type="button" class="primary-btn" ${isMax ? 'disabled' : ''} onclick="upgradeTool('${key}')" style="margin-top:8px;">
          ${isMax ? 'MAXED OUT (LVL 24)' : `UPGRADE TO LVL ${tool.level + 1} ($${cost.toLocaleString()}${needsPart ? ` + ${spec.gears} ⚙️` : ''})`}
        </button>
      </div>`;
  }).join('');
}

function upgradeTool(key) {
  const tool = state.tools[key];
  if (!tool || tool.level >= 24) return;
  const spec = getToolUpgradeSpec(key);
  const cost = spec.cost;
  const reqGears = spec.gears;
  if (state.cash < cost) {
    showAlert('INSUFFICIENT CASH', `Need $${cost.toLocaleString()} to upgrade ${tool.name}.`);
    return;
  }
  if (reqGears > 0 && state.parts < reqGears) {
    showAlert('GOLD GEARS REQUIRED', `Hub Tier breakthrough upgrades (Lvl ${tool.level}→${tool.level + 1}) require ${reqGears} ⚙️ Gold Gear${reqGears > 1 ? 's' : ''} from 3-call clean streaks, 9/15 streak milestones, Contracts, or the Shop.`);
    return;
  }
  state.cash -= cost;
  if (reqGears > 0) state.parts -= reqGears;
  tool.level += 1;
  const newOwnedTier = Math.min(6, Math.floor((tool.level - 1) / 4) + 1);
  previewToolTiers[key] = newOwnedTier;
  SoundFX.success();
  saveState();
  updateHUD();
  renderGarage();
}

// --- LEADERBOARD ---
function renderLeague() {
  document.getElementById('league-rep').textContent = state.rep.toLocaleString();

  const divisionIndex = Math.min(5, Math.floor(state.rep / 3000));
  const divisionNames = [
    'BRONZE ROADSIDE DIVISION',
    'SILVER METRO DIVISION',
    'GOLD FREIGHT DIVISION',
    'PLATINUM PORT DIVISION',
    'DIAMOND EXPRESS DIVISION',
    'APEX SYNDICATE DIVISION'
  ];

  const anchor = Math.max(0, divisionIndex * 3000);
  const rivals = [
    { name: 'Southside_Rescue', avatar: '🔧', rep: anchor + 180 },
    { name: 'PeachState_Duals', avatar: '🛞', rep: anchor + 540 },
    { name: 'I285_RoadKing', avatar: '🚛', rep: anchor + 1150 },
    { name: 'NightShift_Mike', avatar: '⚡', rep: anchor + 1950 },
    { name: 'ApexTow_ATL', avatar: '👑', rep: anchor + 2850 },
    {
      name: `${state.bizName} (YOU)`,
      avatar: state.avatarEmoji,
      avatarImg: state.avatarImg,
      rep: state.rep,
      isYou: true
    }
  ].sort((a, b) => b.rep - a.rep);

  const myRank = rivals.findIndex((r) => r.isYou) + 1;
  document.getElementById('league-rank').textContent = `#${myRank}`;

  const headerBanner = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
      <span class="badge">${divisionNames[divisionIndex]}</span>
      <button type="button" class="ghost-btn" style="padding:4px 8px;font-size:11px;" onclick="openProfileEditor()">Edit Name/Logo</button>
    </div>`;

  document.getElementById('leaderboard-list').innerHTML = headerBanner + rivals.map((r, idx) => {
    const iconHtml = r.avatarImg
      ? `<img src="${r.avatarImg}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;" />`
      : `<span style="margin-right:6px;">${r.avatar}</span>`;
    return `
      <div class="item-card" style="${r.isYou ? 'border-color:var(--amber);background:#172033;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>#${idx + 1} ${iconHtml}${r.name}</strong>
          <span style="color:var(--amber);font-weight:800;">${r.rep.toLocaleString()} REP</span>
        </div>
      </div>`;
  }).join('');
}

// --- 24 ZONES / 6 HUBS (Each Hub = Tool Tier) ---
function renderZones() {
  let currentHub = '';
  let html = '';
  ZONES.forEach((z, idx) => {
    const hubMeta = HUB_TIERS[Math.floor(idx / 4)] || HUB_TIERS[0];
    const hubHeader = `${z.hub} · TOOL TIER ${hubMeta.toolTier} (${hubMeta.levels})`;
    if (hubHeader !== currentHub) {
      currentHub = hubHeader;
      html += `<div class="hub-group-title">${currentHub}</div>`;
    }
    const unlocked = state.rep >= z.unlockRep;
    const active = state.zoneId === z.id;
    html += `
      <div class="item-card" style="${active ? 'border-color:var(--amber);' : !unlocked ? 'opacity:0.78;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span class="badge">ZONE ${idx + 1}/24 · ${z.mult.toFixed(2)}x PAYOUT · T${hubMeta.toolTier}</span>
            <h3 style="font-size:15px;margin-top:4px;">${z.name}</h3>
          </div>
          <strong style="color:${unlocked ? 'var(--green)' : 'var(--muted)'};">
            ${unlocked ? (active ? 'ACTIVE' : 'OPEN') : `🔒 ${z.unlockRep.toLocaleString()} REP`}
          </strong>
        </div>
        <p style="font-size:12px;color:var(--muted);">${z.desc}</p>
        <button type="button" class="primary-btn" ${!unlocked || active ? 'disabled' : ''} onclick="selectZone('${z.id}')">
          ${active ? 'DEPLOYED HERE' : unlocked ? 'DEPLOY TO ZONE' : `UNLOCKS AT ${z.unlockRep.toLocaleString()} REP (YOU: ${state.rep.toLocaleString()})`}
        </button>
      </div>`;
  });
  document.getElementById('zone-list').innerHTML = html;
}

function selectZone(id) {
  state.zoneId = id;
  SoundFX.torqueClick();
  saveState();
  updateHUD();
  refreshJobs();
  goPage('dispatch');
}

// --- SHOP, COOLDOWN AD DROPS & TOKEN-TO-GEAR EXCHANGE ---
function renderShop() {
  const root = document.getElementById('shop-dynamic-root');
  if (!root) return;

  const surgeRemMs = syncSurgeRecharge();
  const tokRemMs = syncTokenDropRecharge();
  const surgeCdTxt = state.surgeCharges < MAX_SURGE_CHARGES
    ? `Next charge: ${formatMs(surgeRemMs)}`
    : 'Max Charges';
  const tokCdTxt = state.tokenDropCharges < MAX_TOKEN_DROPS
    ? `Next charge: ${formatMs(tokRemMs)}`
    : 'Max Charges';

  root.innerHTML = `
    <div class="item-card">
      <span class="badge">SPONSORED AD DROPS (COOLDOWN GATED)</span>
      <h3>Free Supply & Surge Transmissions</h3>
      <div class="ctrl-grid-2" style="margin-top:6px;">
        <button type="button" class="secondary-btn" ${state.surgeCharges <= 0 ? 'disabled' : ''} onclick="watchRewardedAd('surge')" style="font-size:11px;padding:9px 6px;">
          📺 +1 Surge (${state.surgeCharges}/${MAX_SURGE_CHARGES})<br><span style="font-size:10px;color:var(--amber);">${surgeCdTxt}</span>
        </button>
        <button type="button" class="secondary-btn" ${state.tokenDropCharges <= 0 ? 'disabled' : ''} onclick="watchRewardedAd('tokens')" style="font-size:11px;padding:9px 6px;">
          📺 +3 ⚡ Tokens (${state.tokenDropCharges}/${MAX_TOKEN_DROPS})<br><span style="font-size:10px;color:var(--amber);">${tokCdTxt}</span>
        </button>
      </div>
      <button type="button" class="secondary-btn" onclick="watchRewardedAd('restock')" style="margin-top:4px;font-size:11px;">
        📺 Free Cargo Restock Drop (Plugs + Std/HD Tires)
      </button>
    </div>

    <div class="item-card" style="border-color:var(--amber);">
      <span class="badge">FOUNDRY EXCHANGE</span>
      <h3>Convert Dispatch Tokens → Gold Gear</h3>
      <p style="font-size:12px;color:var(--muted);">
        Earn Gold Gears every ${CLEAN_STREAK_GEAR_INTERVAL} clean calls (+2 at 9 streak, +3 at 15 streak), via Contracts, or forge 1 ⚙️ Gear for ${TOKEN_TO_GEAR_COST} ⚡ Tokens.
      </p>
      <button type="button" class="primary-btn" ${state.tokens < TOKEN_TO_GEAR_COST ? 'disabled' : ''} onclick="exchangeTokensForGear()">
        FORGE 1 ⚙️ GOLD GEAR (${TOKEN_TO_GEAR_COST} ⚡ · YOU HAVE ${state.tokens} ⚡)
      </button>
    </div>

    <div class="item-card">
      <span class="badge">FLEET CREDIT & GEAR PACKS</span>
      <h3>Instant Dispatch Packs</h3>
      <div class="stack-list" style="margin-top:8px;">
        <button type="button" class="primary-btn" onclick="buyPack('starter')">
          Starter Roadside Kit — 25 ⚡ + 1 ⚙️ + $500 ($1.99)
        </button>
        <button type="button" class="primary-btn" onclick="buyPack('pro')">
          Pro Fleet Bundle — 70 ⚡ + 3 ⚙️ + $1,800 ($4.99)
        </button>
        <button type="button" class="primary-btn" onclick="buyPack('yard')">
          Commercial Yard Crate — 160 ⚡ + 8 ⚙️ + $5,000 ($9.99)
        </button>
        <button type="button" class="primary-btn" onclick="buyPack('apex')">
          Apex Syndicate Vault — 380 ⚡ + 20 ⚙️ + $15,000 ($19.99)
        </button>
      </div>
    </div>
  `;
}

function exchangeTokensForGear() {
  if (state.tokens < TOKEN_TO_GEAR_COST) {
    showAlert('INSUFFICIENT TOKENS', `Forging 1 ⚙️ Gold Gear requires ${TOKEN_TO_GEAR_COST} ⚡ Dispatch Tokens.`);
    return;
  }
  state.tokens -= TOKEN_TO_GEAR_COST;
  state.parts += 1;
  SoundFX.success();
  saveState();
  updateHUD();
  renderShop();
}

function watchRewardedAd(type) {
  syncSurgeRecharge();
  syncTokenDropRecharge();

  if (type === 'surge' && state.surgeCharges <= 0) {
    showAlert('SURGE AD ON COOLDOWN', `Next 2X Surge ad charge available in ${formatMs(syncSurgeRecharge())}.`);
    return;
  }
  if (type === 'tokens' && state.tokenDropCharges <= 0) {
    showAlert('TOKEN AD ON COOLDOWN', `Next free ⚡ Token ad charge available in ${formatMs(syncTokenDropRecharge())}.`);
    return;
  }

  openModal(`
    <span class="badge">SPONSORED TRANSMISSION</span>
    <h3>30s Roadside Partner Ad</h3>
    <p style="font-size:13px;color:var(--muted);">Simulating rewarded sponsor video...</p>
    <div id="ad-timer" style="font-size:28px;font-weight:900;color:var(--amber);text-align:center;">3</div>
  `);
  let sec = 3;
  const iv = setInterval(() => {
    sec--;
    const el = document.getElementById('ad-timer');
    if (el) el.textContent = sec;
    if (sec <= 0) {
      clearInterval(iv);
      const rig = getActiveRigObj();
      if (type === 'surge') {
        if (state.surgeCharges === MAX_SURGE_CHARGES) state.lastSurgeRechargeAt = Date.now();
        state.surgeCharges = Math.max(0, state.surgeCharges - 1);
        state.surgeJobs += 1;
      }
      if (type === 'tokens') {
        if (state.tokenDropCharges === MAX_TOKEN_DROPS) state.lastTokenDropRechargeAt = Date.now();
        state.tokenDropCharges = Math.max(0, state.tokenDropCharges - 1);
        state.tokens += 3;
      }
      if (type === 'restock') {
        state.plugs = Math.min(rig.capPlugs, state.plugs + 4);
        state.stdTires = Math.min(rig.capStd, state.stdTires + 2);
        state.hdTires = Math.min(rig.capHd, state.hdTires + 1);
      }
      if (type === 'scan') {
        refreshJobs();
      }
      SoundFX.success();
      saveState();
      updateHUD();
      if (document.getElementById('page-shop').classList.contains('active')) renderShop();
      closeModal();
      if (type !== 'tokens' && type !== 'restock') goPage('dispatch');
    }
  }, 800);
}

function buyPack(packKey) {
  const packs = {
    starter: { label: 'Starter Roadside Kit ($1.99)', tokens: 25, gears: 1, cash: 500 },
    pro: { label: 'Pro Fleet Bundle ($4.99)', tokens: 70, gears: 3, cash: 1800 },
    yard: { label: 'Commercial Yard Crate ($9.99)', tokens: 160, gears: 8, cash: 5000 },
    apex: { label: 'Apex Syndicate Vault ($19.99)', tokens: 380, gears: 20, cash: 15000 }
  };
  const p = packs[packKey];
  if (!p) return;
  state.tokens += p.tokens;
  state.parts += p.gears;
  state.cash += p.cash;
  SoundFX.success();
  saveState();
  updateHUD();
  if (document.getElementById('page-shop').classList.contains('active')) renderShop();
  openModal(`
    <span class="badge">DISPATCH CREDIT APPLIED</span>
    <h3>${p.label}</h3>
    <div style="background:#090c12;padding:12px;border-radius:10px;font-size:13px;display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;justify-content:space-between;"><span>Dispatch Tokens:</span><strong style="color:#38bdf8;">+${p.tokens} ⚡</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Gold Gears:</span><strong style="color:var(--amber);">+${p.gears} ⚙️</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Fleet Cash:</span><strong style="color:var(--green);">+$${p.cash.toLocaleString()}</strong></div>
    </div>
    <button type="button" class="primary-btn" onclick="closeModal()">CONTINUE</button>
  `);
}

function openModal(html) {
  document.getElementById('modal-card').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function resetSave() {
  if (window.DelWinCloud && window.DelWinCloud.hasAccount && window.DelWinCloud.hasAccount()) {
    const confirmed = confirm('You are signed in. Reset this device only? This will sign you out first. Your cloud career will remain safely stored in your account and can be restored if you sign in again.');
    if (!confirmed) return;
    try {
      await window.DelWinCloud.signOut();
    } catch (e) {
      alert('Could not sign out, so the save was not reset. Please try again.');
      return;
    }
  }
  localStorage.removeItem('delwin_v4_save');
  location.reload();
}

function bootDelWinMobile() {
  try { injectCustomStyles(); } catch (e) {}
  try { loadState(); } catch (e) {}
  try { updateHUD(); } catch (e) {}
  try {
    if (!state.jobs || state.jobs.length === 0) refreshJobs();
    else renderJobs();
  } catch (e) {
    try { refreshJobs(); } catch (e2) {}
  }
  try { updateHUD(); } catch (e) {}
  try { startDispatchCooldownTicker(); } catch (e) {}
  try {
    if (state.activeJob && !state.activeJob.isTutorial) startBayTimer();
    if (!state.tutorialDone) startTutorial();
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootDelWinMobile);
} else {
  bootDelWinMobile();
}

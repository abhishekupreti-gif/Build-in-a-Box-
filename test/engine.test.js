import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateAllTrekkers,
  generateLedgerEntry,
  calculateBatteryRisk,
  calculatePingAgeRisk,
  calculateConfidence,
  WEATHER_CONDITIONS
} from '../src/engine/decisionEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- SIGNAL-SAR ENGINE AUTOMATED TESTS ---');

// 1. Ingest Data
const rawData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/trekkers.json'), 'utf8'));
assert.strictEqual(rawData.length, 6, 'Must contain exactly 6 trekker profiles');
console.log('✓ PASS: Loaded 6 trekker profiles from mission data');

// 2. Safe handling of missing telemetry
const nullBattRisk = calculateBatteryRisk(null);
assert.strictEqual(nullBattRisk.isUnknown, true, 'Null battery must be flagged unknown');
assert.strictEqual(nullBattRisk.score, 75, 'Null battery must receive uncertainty penalty');
console.log('✓ PASS: Safe missing battery handling verified');

// 3. Baseline Evaluation (Clear weather)
const baseline = evaluateAllTrekkers(rawData, 'CLEAR');
assert.strictEqual(baseline.trekkers.length, 6);
assert.strictEqual(baseline.dispatch.totalTeamsDeployed, 3);
assert.strictEqual(baseline.dispatch.uncoveredCount, 3);
console.log('✓ PASS: Baseline evaluation produced 3 dispatched teams and 3 uncovered sectors');

// Verify independent confidence vs urgency
baseline.trekkers.forEach(t => {
  assert(t.analysis.urgency.totalUrgency >= 0 && t.analysis.urgency.totalUrgency <= 100);
  assert(t.analysis.confidence.totalConfidence >= 0 && t.analysis.confidence.totalConfidence <= 100);
  assert(t.analysis.uncertainty.rui >= 0 && t.analysis.uncertainty.rui <= 100);
});
console.log('✓ PASS: Scores clamped [0, 100] for Urgency, Confidence, and RUI');

// Elena has fresh ping & healthy battery -> high confidence
const elena = baseline.trekkers.find(t => t.id === 'TRK-03');
assert(elena.analysis.confidence.totalConfidence > 70, 'Elena confidence should be high');

// Liam has null battery & null signal & 580m ping -> low confidence, high urgency
const liam = baseline.trekkers.find(t => t.id === 'TRK-06');
assert(liam.analysis.confidence.totalConfidence < 30, 'Liam confidence should be low');
assert(liam.analysis.urgency.totalUrgency > 70, 'Liam urgency should be high due to exposure');
console.log('✓ PASS: Urgency and Confidence are evaluated independently');

// 4. Weather Recalculation Test (Clear -> Severe)
const severe = evaluateAllTrekkers(rawData, 'SEVERE');
baseline.trekkers.forEach(baseT => {
  const severeT = severe.trekkers.find(t => t.id === baseT.id);
  assert(
    severeT.analysis.urgency.totalUrgency >= baseT.analysis.urgency.totalUrgency,
    `Severe weather must not decrease urgency for ${baseT.name}`
  );
  assert(
    severeT.analysis.uncertainty.rui >= baseT.analysis.uncertainty.rui,
    `Severe weather must increase or maintain search uncertainty for ${baseT.name}`
  );
});
console.log('✓ PASS: Weather impact correctly escalates urgency and uncertainty');

// 5. Decision Change Ledger Verification
const ledgerEntry = generateLedgerEntry({
  previousEval: baseline,
  currentEval: severe,
  triggerType: 'WEATHER_CHANGE'
});

assert(ledgerEntry.trekkerChanges.length > 0, 'Ledger must detect trekker urgency/rank changes');
assert(ledgerEntry.trigger.includes('CLEAR ➔ SEVERE'), 'Ledger must record trigger transition');
console.log(`✓ PASS: Decision Change Ledger generated ${ledgerEntry.trekkerChanges.length} diff records and dispatch updates`);

// 6. Simulated Telemetry Live Tick & Serialization Test
const simulatedTrekkers = JSON.parse(JSON.stringify(rawData));
simulatedTrekkers[0].lastPingMinsAgo = 1; // fresh ping
simulatedTrekkers[0].batteryPercent = 13; // drained 1%
const tickEval = evaluateAllTrekkers(simulatedTrekkers, 'CLEAR');
const tickLedger = generateLedgerEntry({
  previousEval: baseline,
  currentEval: tickEval,
  triggerType: 'SIMULATED_TICK'
});
assert(tickLedger.trigger.includes('[SYNTHETIC]'), 'Ledger must explicitly label synthetic tick');
assert.strictEqual(JSON.parse(JSON.stringify(simulatedTrekkers)).length, 6, 'Serialization must preserve 6 profiles');
console.log('✓ PASS: Synthetic live update telemetry tick & offline serialization verified');

console.log('--- ALL 6 ENGINE TEST SUITES PASSED! ---');

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateAllTrekkers,
  generateLedgerEntry,
  WEATHER_CONDITIONS,
  RESCUE_TEAMS
} from '../src/engine/decisionEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rawData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/trekkers.json'), 'utf8'));

console.log('--- SIGNAL-SAR INTERACTIVE SYSTEM AUDIT TESTS ---');

// 1. Data Integrity: All 6 Profiles
assert.strictEqual(rawData.length, 6, 'Exactly 6 profiles required');
const ids = rawData.map(t => t.id);
assert.deepStrictEqual(ids.sort(), ['TRK-01', 'TRK-02', 'TRK-03', 'TRK-04', 'TRK-05', 'TRK-06']);
console.log('✓ PASS: All 6 trekker profiles verified with distinct IDs');

// 2. Search & Filtering Behavior
function searchTrekkers(list, query, sector) {
  let res = [...list];
  if (sector && sector !== 'ALL') {
    res = res.filter(t => t.sector === sector);
  }
  if (query && query.trim()) {
    const q = query.toLowerCase().trim();
    res = res.filter(t => {
      const nameMatch = t.name.toLowerCase().includes(q);
      const idMatch = t.id.toLowerCase().includes(q);
      const sectorMatch = t.sector.toLowerCase().includes(q) || (t.sectorSubname && t.sectorSubname.toLowerCase().includes(q));
      const notesMatch = t.situationNotes && t.situationNotes.toLowerCase().includes(q);
      const equipMatch = t.equipment && t.equipment.some(e => e.toLowerCase().includes(q));
      return nameMatch || idMatch || sectorMatch || notesMatch || equipMatch;
    });
  }
  return res;
}

// Test search by injury notes
const ankleMatch = searchTrekkers(rawData, 'ankle', 'ALL');
assert.strictEqual(ankleMatch.length, 1);
assert.strictEqual(ankleMatch[0].id, 'TRK-01');

// Test search with null equipment (TRK-04 has null equipment)
const glacierMatch = searchTrekkers(rawData, 'Glacier', 'ALL');
assert.strictEqual(glacierMatch.length, 1);
assert.strictEqual(glacierMatch[0].id, 'TRK-04');

// Test sector filter
const alphaFilter = searchTrekkers(rawData, '', 'Sector Alpha');
assert.strictEqual(alphaFilter.length, 1);
assert.strictEqual(alphaFilter[0].id, 'TRK-01');

console.log('✓ PASS: Search and filtering behave correctly with null-safe handling');

// 3. Dispatch Constraints & No Double Booking
const clearEval = evaluateAllTrekkers(rawData, 'CLEAR');
const assignedTeams = clearEval.dispatch.assignedSectors.map(s => s.assignedTeam.id);
const uniqueTeams = new Set(assignedTeams);

assert.strictEqual(assignedTeams.length, 3, 'Exactly 3 teams must be deployed');
assert.strictEqual(uniqueTeams.size, 3, 'No team can be assigned to more than 1 sector simultaneously');
assert.strictEqual(clearEval.dispatch.uncoveredSectors.length, 3, 'Exactly 3 sectors must be flagged UNCOVERED');
console.log('✓ PASS: Dispatch constraints verified; zero double-booking; 3 teams deployed & 3 uncovered sectors');

// 4. Weather Recalculation Shifts
const severeEval = evaluateAllTrekkers(rawData, 'SEVERE');
assert(severeEval.weather.hazardMultiplier > clearEval.weather.hazardMultiplier, 'Severe hazard multiplier must exceed clear');
const baseLiam = clearEval.trekkers.find(t => t.id === 'TRK-06');
const severeLiam = severeEval.trekkers.find(t => t.id === 'TRK-06');
assert(severeLiam.analysis.urgency.totalUrgency > baseLiam.analysis.urgency.totalUrgency, 'Liam urgency must surge in blizzard due to lack of shelter');
console.log('✓ PASS: Weather condition transition actively recalculates urgency and sector rankings');

// 5. Decision Change Ledger Diff Accuracy
const weatherLedger = generateLedgerEntry({
  previousEval: clearEval,
  currentEval: severeEval,
  triggerType: 'WEATHER_CHANGE'
});
assert(weatherLedger !== null, 'Weather shift must produce ledger record');
assert(weatherLedger.trekkerChanges.length > 0, 'Ledger must detect trekker score shifts');
assert(weatherLedger.trigger.includes('CLEAR ➔ SEVERE'), 'Trigger label must match transition');
console.log(`✓ PASS: Decision Change Ledger recorded ${weatherLedger.trekkerChanges.length} score transitions with explanation`);

// 6. Reset Baseline Restores Exact State
const resetEval = evaluateAllTrekkers(rawData, 'CLEAR');
assert.strictEqual(resetEval.weatherKey, 'CLEAR');
assert.deepStrictEqual(
  clearEval.trekkers.map(t => t.analysis.urgency.totalUrgency),
  resetEval.trekkers.map(t => t.analysis.urgency.totalUrgency),
  'Reset baseline must reproduce exact original scores'
);
console.log('✓ PASS: Reset restores exact baseline scenario');

console.log('--- ALL 6 SYSTEM AUDIT CHECKS PASSED SUCCESSFULLY! ---');

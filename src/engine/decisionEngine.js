/**
 * SignalSAR Decision Engine — Operation: Lost Signal
 * 
 * Deterministic, explainable scoring and dispatch algorithms.
 * Evaluates urgency, confidence, search uncertainty, and sector team allocations.
 * 
 * NOTE: All calculations operate on simulated relative uncertainty indices.
 * Does NOT claim real GPS coordinates or calibrated statistical models.
 */

export const WEATHER_CONDITIONS = {
  CLEAR: {
    id: 'CLEAR',
    label: 'Clear Skies / Baseline',
    tempC: '+4°C',
    winds: '10-15 kt',
    visibility: '15 km (Clear)',
    airSupport: 'FULL (Helicopters & UAV active)',
    hazardMultiplier: 1.0,
    uncertaintyBonus: 5,
    summary: 'Standard alpine operational parameters. Good visibility, baseline terrain risk.'
  },
  DETERIORATING: {
    id: 'DETERIORATING',
    label: 'Deteriorating Weather',
    tempC: '-5°C',
    winds: '35-45 kt gusts',
    visibility: '1.5 km (Low ceiling)',
    airSupport: 'LIMITED (UAV grounded, winch restricted)',
    hazardMultiplier: 1.35,
    uncertaintyBonus: 16,
    summary: 'Freezing front advancing. High-altitude sectors face severe windchill and drifting snow.'
  },
  SEVERE: {
    id: 'SEVERE',
    label: 'Severe Blizzard / Whiteout',
    tempC: '-18°C windchill',
    winds: '55-70 kt gale',
    visibility: '< 100 m (Whiteout)',
    airSupport: 'GROUNDED (Zero aviation capability)',
    hazardMultiplier: 1.80,
    uncertaintyBonus: 28,
    summary: 'Extreme winter storm. Avalanche warning level 4. Survival window dramatically compressed.'
  }
};

export const RESCUE_TEAMS = [
  {
    id: 'TEAM-ALPHA',
    name: 'SAR Alpha — Alpine Recon',
    type: 'High-Altitude Ridge Specialists',
    capabilities: ['Rigid scree navigation', 'High wind traversing', 'Thermal beacons'],
    preferredSectors: ['Sector Alpha', 'Sector Foxtrot', 'Sector Charlie'],
    speedRating: 'Fast'
  },
  {
    id: 'TEAM-BRAVO',
    name: 'SAR Bravo — Technical Glacier Unit',
    type: 'Crevasse & Technical Rope Evac',
    capabilities: ['Ice crevasse descent', 'Ice climbing', 'Heavy stretcher rigging'],
    preferredSectors: ['Sector Delta', 'Sector Bravo'],
    speedRating: 'Moderate'
  },
  {
    id: 'TEAM-CHARLIE',
    name: 'SAR Charlie — Medevac Trauma Unit',
    type: 'Critical Care & Canyon Search',
    capabilities: ['Advanced life support', 'Hypothermia warmers', 'Rapid stabilization'],
    preferredSectors: ['Sector Alpha', 'Sector Bravo', 'Sector Echo'],
    speedRating: 'Fast'
  }
];

/**
 * Calculates battery risk score (0-100).
 * Missing battery handled safely with explicit uncertainty penalty.
 */
export function calculateBatteryRisk(batteryPercent) {
  if (batteryPercent === null || batteryPercent === undefined) {
    return {
      score: 75,
      label: 'Telemetry Missing (Corrupted/Offline)',
      isUnknown: true,
      rationale: 'Battery status unknown. Risk conservatively penalized to high (75/100).'
    };
  }

  const val = Number(batteryPercent);
  if (val <= 10) {
    return { score: 100, label: `${val}% Critical Depletion`, isUnknown: false, rationale: 'Battery imminent failure (<10%). Transponder dying.' };
  } else if (val <= 25) {
    return { score: 80, label: `${val}% Severe Low`, isUnknown: false, rationale: 'Low battery threshold crossed; beacon shutoff imminent.' };
  } else if (val <= 50) {
    return { score: 50, label: `${val}% Moderate`, isUnknown: false, rationale: 'Sufficient power for near-term tracking.' };
  } else if (val <= 75) {
    return { score: 25, label: `${val}% Good`, isUnknown: false, rationale: 'Adequate battery margin.' };
  } else {
    return { score: 10, label: `${val}% Optimal`, isUnknown: false, rationale: 'Transponder fully energized.' };
  }
}

/**
 * Calculates stale-ping age risk score (0-100).
 */
export function calculatePingAgeRisk(minsAgo) {
  if (minsAgo === null || minsAgo === undefined) {
    return {
      score: 100,
      label: 'No Ping Recorded',
      isUnknown: true,
      rationale: 'Zero telemetry pings received. Maximum staleness risk penalty.'
    };
  }

  const age = Number(minsAgo);
  if (age <= 30) {
    return { score: 15, label: `${age}m (Fresh)`, isUnknown: false, rationale: 'Recent telemetry (<30m). Current position estimate reliable.' };
  } else if (age <= 60) {
    return { score: 40, label: `${age}m (Aging)`, isUnknown: false, rationale: 'Ping within 1 hour; minor position dispersion.' };
  } else if (age <= 180) {
    return { score: 70, label: `${age}m (Stale)`, isUnknown: false, rationale: 'No signal for 1-3 hours. Trekker may have traversed significant distance.' };
  } else if (age <= 360) {
    return { score: 90, label: `${Math.round(age / 60)}h (Severely Stale)`, isUnknown: false, rationale: 'Silence over 3-6 hours. Search dispersion expands drastically.' };
  } else {
    return { score: 100, label: `${(age / 60).toFixed(1)}h (Critically Lost)`, isUnknown: false, rationale: 'No contact for >6 hours. High risk of hypothermia or immobilization.' };
  }
}

/**
 * Calculates environmental exposure risk taking into account terrain base hazard and weather.
 */
export function calculateEnvironmentalRisk(terrainHazardBase, weatherConditionKey) {
  const weather = WEATHER_CONDITIONS[weatherConditionKey] || WEATHER_CONDITIONS.CLEAR;
  const rawScore = (terrainHazardBase || 50) * weather.hazardMultiplier;
  const clampedScore = Math.min(100, Math.round(rawScore));

  let weatherNote = '';
  if (weatherConditionKey === 'CLEAR') {
    weatherNote = 'Clear weather introduces baseline terrain hazards only.';
  } else if (weatherConditionKey === 'DETERIORATING') {
    weatherNote = `Deteriorating squall (+35% risk multiplier) creates high windchill and slick terrain.`;
  } else {
    weatherNote = `Severe blizzard (+80% risk multiplier) induces lethal frostbite hazard and disorienting whiteouts.`;
  }

  return {
    score: clampedScore,
    weatherMultiplier: weather.hazardMultiplier,
    terrainBase: terrainHazardBase,
    rationale: weatherNote
  };
}

/**
 * Calculates reported danger score based on incident notes and physical status.
 */
export function calculateReportedDanger(baseDanger, weatherConditionKey, trekker) {
  let score = baseDanger || 50;
  let modifier = 0;

  // Severe weather disproportionately endangers injured or unsheltered personnel
  const isInjured = trekker.vitalSignsStatus && trekker.vitalSignsStatus.toLowerCase().includes('injur');
  const hasNoShelter = !trekker.equipment || trekker.equipment.some(e => e.toLowerCase().includes('no ') || e.toLowerCase().includes('minimal'));

  if (weatherConditionKey === 'DETERIORATING') {
    modifier += (isInjured ? 12 : 6);
    if (hasNoShelter) modifier += 10;
  } else if (weatherConditionKey === 'SEVERE') {
    modifier += (isInjured ? 24 : 15);
    if (hasNoShelter) modifier += 22;
  }

  const finalScore = Math.min(100, Math.round(score + modifier));

  let note = `Baseline reported threat index: ${baseDanger}.`;
  if (modifier > 0) {
    note += ` Weather exposure added +${modifier} pts (vulnerability: ${isInjured ? 'Injured' : ''}${hasNoShelter ? ' Lack of Shelter' : ''}).`;
  }

  return {
    score: finalScore,
    modifier,
    rationale: note
  };
}

/**
 * P1.1: Overall Urgency Score (0 - 100)
 * Weighted synthesis:
 * Battery Risk: 25%
 * Stale-Ping Risk: 25%
 * Environmental Exposure: 25%
 * Reported Danger: 25%
 */
export function calculateUrgency(trekker, weatherConditionKey = 'CLEAR') {
  const batteryRisk = calculateBatteryRisk(trekker.batteryPercent);
  const pingRisk = calculatePingAgeRisk(trekker.lastPingMinsAgo);
  const envRisk = calculateEnvironmentalRisk(trekker.terrainHazardBase, weatherConditionKey);
  const dangerRisk = calculateReportedDanger(trekker.reportedDangerScore, weatherConditionKey, trekker);

  const raw = (
    batteryRisk.score * 0.25 +
    pingRisk.score * 0.25 +
    envRisk.score * 0.25 +
    dangerRisk.score * 0.25
  );

  const finalScore = Math.min(100, Math.max(0, Math.round(raw)));

  let tier = 'LOW';
  let tierColor = '#10b981'; // Green
  if (finalScore >= 80) {
    tier = 'CRITICAL';
    tierColor = '#ef4444'; // Red
  } else if (finalScore >= 60) {
    tier = 'HIGH';
    tierColor = '#f97316'; // Amber
  } else if (finalScore >= 40) {
    tier = 'MODERATE';
    tierColor = '#eab308'; // Yellow
  }

  return {
    totalUrgency: finalScore,
    tier,
    tierColor,
    factors: {
      battery: { weight: 0.25, score: batteryRisk.score, contribution: (batteryRisk.score * 0.25).toFixed(1), details: batteryRisk },
      pingAge: { weight: 0.25, score: pingRisk.score, contribution: (pingRisk.score * 0.25).toFixed(1), details: pingRisk },
      environmental: { weight: 0.25, score: envRisk.score, contribution: (envRisk.score * 0.25).toFixed(1), details: envRisk },
      reportedDanger: { weight: 0.25, score: dangerRisk.score, contribution: (dangerRisk.score * 0.25).toFixed(1), details: dangerRisk }
    },
    formula: `Urgency = (Battery:${batteryRisk.score} × 0.25) + (PingAge:${pingRisk.score} × 0.25) + (Env:${envRisk.score} × 0.25) + (Danger:${dangerRisk.score} × 0.25) = ${finalScore}`
  };
}

/**
 * P1.2: Telemetry Confidence (0 - 100%)
 * Independently evaluates:
 * - Ping Freshness (40%)
 * - Signal Quality (35%)
 * - Data Completeness (25%)
 */
export function calculateConfidence(trekker) {
  // 1. Freshness Score (40%)
  let freshnessScore = 0;
  if (trekker.lastPingMinsAgo !== null && trekker.lastPingMinsAgo !== undefined) {
    const age = trekker.lastPingMinsAgo;
    if (age <= 20) freshnessScore = 100;
    else if (age <= 45) freshnessScore = 85;
    else if (age <= 90) freshnessScore = 65;
    else if (age <= 180) freshnessScore = 40;
    else if (age <= 360) freshnessScore = 20;
    else freshnessScore = 5;
  }

  // 2. Signal Quality Score (35%)
  let signalScore = 0;
  let signalStatus = 'UNKNOWN';
  if (trekker.signalDbm !== null && trekker.signalDbm !== undefined) {
    const dbm = trekker.signalDbm;
    if (dbm >= -85) {
      signalScore = 100;
      signalStatus = `${dbm} dBm (Strong)`;
    } else if (dbm >= -95) {
      signalScore = 75;
      signalStatus = `${dbm} dBm (Moderate)`;
    } else if (dbm >= -105) {
      signalScore = 45;
      signalStatus = `${dbm} dBm (Weak)`;
    } else if (dbm >= -115) {
      signalScore = 20;
      signalStatus = `${dbm} dBm (Degraded)`;
    } else {
      signalScore = 5;
      signalStatus = `${dbm} dBm (Near Loss)`;
    }
  } else {
    signalStatus = 'OFFLINE / NO CARRIER';
  }

  // 3. Data Completeness Score (25%)
  const fields = [
    trekker.batteryPercent !== null && trekker.batteryPercent !== undefined,
    trekker.signalDbm !== null && trekker.signalDbm !== undefined,
    trekker.lastPingMinsAgo !== null && trekker.lastPingMinsAgo !== undefined,
    trekker.equipment !== null && trekker.equipment !== undefined && trekker.equipment.length > 0,
    trekker.situationNotes !== null && trekker.situationNotes !== undefined && trekker.situationNotes.length > 0
  ];
  const presentCount = fields.filter(Boolean).length;
  const completenessScore = Math.round((presentCount / 5) * 100);

  const totalConfidence = Math.min(100, Math.max(0, Math.round(
    freshnessScore * 0.40 +
    signalScore * 0.35 +
    completenessScore * 0.25
  )));

  let rating = 'LOW';
  let badgeColor = '#ef4444';
  if (totalConfidence >= 75) {
    rating = 'HIGH';
    badgeColor = '#06b6d4';
  } else if (totalConfidence >= 45) {
    rating = 'MEDIUM';
    badgeColor = '#eab308';
  }

  return {
    totalConfidence,
    rating,
    badgeColor,
    signalStatus,
    freshnessScore,
    signalScore,
    completenessScore,
    presentFieldsRatio: `${presentCount}/5 fields present`,
    missingItems: [
      trekker.batteryPercent === null ? 'Battery' : null,
      trekker.signalDbm === null ? 'Signal dBm' : null,
      trekker.equipment === null ? 'Equipment Manifest' : null
    ].filter(Boolean)
  };
}

/**
 * P1.3: Search Uncertainty (Simulated Relative Uncertainty Index, RUI, 0 - 100)
 * Evaluates how spatial uncertainty expands with stale pings, degraded signals, and weather.
 * Explicitly simulated relative index — NEVER claims to be a true calibrated GPS error radius.
 */
export function calculateSearchUncertainty(trekker, weatherConditionKey = 'CLEAR') {
  const weather = WEATHER_CONDITIONS[weatherConditionKey] || WEATHER_CONDITIONS.CLEAR;

  // Staleness dispersion factor (up to 55 points)
  const age = trekker.lastPingMinsAgo || 600;
  const timeDispersion = Math.min(55, Math.round((age / 600) * 55));

  // Signal attenuation factor (up to 25 points)
  let signalUncertainty = 25;
  if (trekker.signalDbm !== null && trekker.signalDbm !== undefined) {
    const dbm = trekker.signalDbm;
    if (dbm >= -85) signalUncertainty = 5;
    else if (dbm >= -95) signalUncertainty = 10;
    else if (dbm >= -105) signalUncertainty = 16;
    else signalUncertainty = 22;
  }

  // Weather obscuration factor
  const weatherUncertainty = weather.uncertaintyBonus;

  const totalRUI = Math.min(100, Math.round(timeDispersion + signalUncertainty + weatherUncertainty));

  let zoneTier = 'FOCUSED';
  let zoneDescriptor = 'Narrow search corridor';
  if (totalRUI >= 75) {
    zoneTier = 'EXPANDED / CRITICAL DIVERGENCE';
    zoneDescriptor = 'Vast search perimeter (>8km relative radius dispersion). High drift probability.';
  } else if (totalRUI >= 45) {
    zoneTier = 'MODERATE SPREAD';
    zoneDescriptor = 'Mid-tier search cone (~3-5km relative dispersion). Line-of-sight obstructed.';
  } else {
    zoneTier = 'TIGHT CORRIDOR';
    zoneDescriptor = 'Local search zone (~1km relative dispersion). Ping recent and anchored.';
  }

  return {
    rui: totalRUI,
    zoneTier,
    zoneDescriptor,
    breakdown: {
      timeDispersion,
      signalUncertainty,
      weatherUncertainty
    },
    disclaimer: 'Simulated Relative Uncertainty Index (RUI). No real GPS fix available or fabricated.'
  };
}

/**
 * P1.5: Dispatch Recommendation Engine
 * Allocates available SAR teams to sectors based on Urgency, Uncertainty, Terrain match, and Resource limits.
 * Explains rationale and explicitly flags uncovered sectors.
 */
export function generateDispatchRecommendations(analyzedTrekkers, weatherConditionKey = 'CLEAR') {
  // Aggregate sector stats
  const sectorMap = {};

  analyzedTrekkers.forEach(trk => {
    if (!sectorMap[trk.sector]) {
      sectorMap[trk.sector] = {
        sector: trk.sector,
        sectorSubname: trk.sectorSubname,
        terrainType: trk.terrainType,
        trekkers: [],
        highestUrgency: 0,
        highestRui: 0,
        compositePriorityScore: 0
      };
    }
    sectorMap[trk.sector].trekkers.push(trk);
    if (trk.analysis.urgency.totalUrgency > sectorMap[trk.sector].highestUrgency) {
      sectorMap[trk.sector].highestUrgency = trk.analysis.urgency.totalUrgency;
    }
    if (trk.analysis.uncertainty.rui > sectorMap[trk.sector].highestRui) {
      sectorMap[trk.sector].highestRui = trk.analysis.uncertainty.rui;
    }
  });

  // Calculate Composite Sector Priority = (Highest Urgency * 0.70) + (Uncertainty * 0.30)
  const sectorsArray = Object.values(sectorMap).map(sec => {
    const compositePriority = Math.round((sec.highestUrgency * 0.70) + (sec.highestRui * 0.30));
    return {
      ...sec,
      compositePriorityScore: compositePriority
    };
  });

  // Sort sectors by descending composite priority
  sectorsArray.sort((a, b) => b.compositePriorityScore - a.compositePriorityScore);

  // Available rescue teams
  const availableTeams = [...RESCUE_TEAMS];
  const assignedSectors = [];
  const uncoveredSectors = [];

  // Match teams to the top prioritized sectors
  sectorsArray.forEach((sec, idx) => {
    if (availableTeams.length > 0) {
      // Find best team for this sector based on preferred sector affinity
      let bestTeamIndex = availableTeams.findIndex(t => t.preferredSectors.includes(sec.sector));
      if (bestTeamIndex === -1) {
        bestTeamIndex = 0; // Take next available team
      }
      const assignedTeam = availableTeams.splice(bestTeamIndex, 1)[0];

      assignedSectors.push({
        sector: sec.sector,
        sectorSubname: sec.sectorSubname,
        compositePriorityScore: sec.compositePriorityScore,
        highestUrgency: sec.highestUrgency,
        highestRui: sec.highestRui,
        status: 'DISPATCHED',
        assignedTeam,
        trekkers: sec.trekkers,
        rationale: `Dispatched ${assignedTeam.name} (${assignedTeam.type}) due to Priority Rank #${idx + 1} (Score: ${sec.compositePriorityScore}, Urgency: ${sec.highestUrgency}). Specialist equipment tailored for ${sec.terrainType}.`
      });
    } else {
      uncoveredSectors.push({
        sector: sec.sector,
        sectorSubname: sec.sectorSubname,
        compositePriorityScore: sec.compositePriorityScore,
        highestUrgency: sec.highestUrgency,
        highestRui: sec.highestRui,
        status: 'UNCOVERED / QUEUED',
        assignedTeam: null,
        trekkers: sec.trekkers,
        rationale: `Sector UNCOVERED due to 3-team resource constraint. Standby for Phase 2 reassignment or mutual aid escalation (Priority Score: ${sec.compositePriorityScore}).`
      });
    }
  });

  return {
    assignedSectors,
    uncoveredSectors,
    totalTeamsDeployed: assignedSectors.length,
    totalAvailableTeams: RESCUE_TEAMS.length,
    uncoveredCount: uncoveredSectors.length,
    sectorsArray
  };
}

/**
 * Runs full assessment on all trekkers under a given weather condition.
 */
export function evaluateAllTrekkers(trekkers, weatherConditionKey = 'CLEAR') {
  const analyzed = trekkers.map(trekker => {
    const urgency = calculateUrgency(trekker, weatherConditionKey);
    const confidence = calculateConfidence(trekker);
    const uncertainty = calculateSearchUncertainty(trekker, weatherConditionKey);

    return {
      ...trekker,
      analysis: {
        urgency,
        confidence,
        uncertainty
      }
    };
  });

  // Rank by urgency descending
  analyzed.sort((a, b) => b.analysis.urgency.totalUrgency - a.analysis.urgency.totalUrgency);

  const dispatch = generateDispatchRecommendations(analyzed, weatherConditionKey);

  return {
    weather: WEATHER_CONDITIONS[weatherConditionKey] || WEATHER_CONDITIONS.CLEAR,
    weatherKey: weatherConditionKey,
    trekkers: analyzed,
    dispatch
  };
}

/**
 * P2: Computes diff between previous and current evaluation to create Decision Change Ledger entry.
 */
export function generateLedgerEntry({
  previousEval,
  currentEval,
  triggerType = 'WEATHER_CHANGE',
  userNote = ''
}) {
  if (!previousEval) {
    return {
      id: `LEDGER-${Date.now()}-INIT`,
      timestamp: new Date().toLocaleTimeString(),
      trigger: 'Mission Telemetry Initialized',
      weatherFrom: null,
      weatherTo: currentEval.weatherKey,
      trekkerChanges: [],
      dispatchChanges: [],
      summary: 'Initial baseline telemetry ingested and ranked under ' + currentEval.weather.label
    };
  }

  const trekkerChanges = [];
  currentEval.trekkers.forEach((currTrk, newRankIndex) => {
    const prevRankIndex = previousEval.trekkers.findIndex(t => t.id === currTrk.id);
    const prevTrk = previousEval.trekkers[prevRankIndex];

    const prevUrgency = prevTrk.analysis.urgency.totalUrgency;
    const currUrgency = currTrk.analysis.urgency.totalUrgency;
    const urgencyDelta = currUrgency - prevUrgency;

    const prevRank = prevRankIndex + 1;
    const newRank = newRankIndex + 1;
    const rankDelta = prevRank - newRank; // positive means moved up in priority

    if (urgencyDelta !== 0 || rankDelta !== 0) {
      trekkerChanges.push({
        id: currTrk.id,
        name: currTrk.name,
        sector: currTrk.sector,
        prevRank,
        newRank,
        rankDelta,
        prevUrgency,
        currUrgency,
        urgencyDelta,
        reason: `${currTrk.name} urgency shifted by ${urgencyDelta >= 0 ? '+' : ''}${urgencyDelta} (from ${prevUrgency} to ${currUrgency}) under ${currentEval.weather.label}. Priority rank changed from #${prevRank} to #${newRank}.`
      });
    }
  });

  // Dispatch changes
  const dispatchChanges = [];
  const prevAssignedMap = {};
  previousEval.dispatch.assignedSectors.forEach(s => {
    prevAssignedMap[s.sector] = s.assignedTeam ? s.assignedTeam.name : 'UNCOVERED';
  });

  const currAssignedMap = {};
  currentEval.dispatch.assignedSectors.forEach(s => {
    currAssignedMap[s.sector] = s.assignedTeam ? s.assignedTeam.name : 'UNCOVERED';
  });
  currentEval.dispatch.uncoveredSectors.forEach(s => {
    currAssignedMap[s.sector] = 'UNCOVERED';
  });

  Object.keys(currAssignedMap).forEach(sector => {
    const prevTeam = prevAssignedMap[sector] || 'UNCOVERED';
    const currTeam = currAssignedMap[sector];
    if (prevTeam !== currTeam) {
      dispatchChanges.push({
        sector,
        previousAssignment: prevTeam,
        newAssignment: currTeam,
        reason: `Dispatch allocation changed for ${sector}: was ${prevTeam}, now ${currTeam}.`
      });
    }
  });

  let triggerLabel = 'Weather Shift';
  if (triggerType === 'RESET') triggerLabel = 'Scenario Baseline Reset';
  else if (triggerType === 'MANUAL_OVERRIDE') triggerLabel = 'Incident Commander Override';
  else if (triggerType === 'SIMULATED_TICK') triggerLabel = 'Simulated Telemetry Tick [SYNTHETIC]';

  // For periodic simulated ticks, do not spam ledger if no meaningful shifts occurred
  if (triggerType === 'SIMULATED_TICK' && trekkerChanges.length === 0 && dispatchChanges.length === 0) {
    return null;
  }

  const triggerString = (previousEval.weatherKey === currentEval.weatherKey)
    ? `${triggerLabel} (${currentEval.weatherKey})`
    : `${triggerLabel}: ${previousEval.weatherKey} ➔ ${currentEval.weatherKey}`;

  const entry = {
    id: `LEDGER-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toLocaleTimeString(),
    trigger: triggerString,
    weatherFrom: previousEval.weatherKey,
    weatherTo: currentEval.weatherKey,
    trekkerChanges,
    dispatchChanges,
    userNote,
    summary: trekkerChanges.length > 0 
      ? `${trekkerChanges.length} trekker priority ranks updated; ${dispatchChanges.length} sector dispatches modified.`
      : (dispatchChanges.length > 0 ? `${dispatchChanges.length} sector dispatches modified.` : 'Scenario baseline re-established.')
  };

  return entry;
}

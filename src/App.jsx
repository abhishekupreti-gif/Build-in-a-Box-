import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  Shield,
  Battery,
  Radio,
  Wind,
  RotateCcw,
  Search,
  Activity,
  Users,
  Compass,
  FileText,
  CloudSnow,
  Sun,
  CloudRain,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  Play,
  Pause,
  Clock,
  History,
  Info
} from 'lucide-react';
import initialTrekkersData from './data/trekkers.json';
import {
  evaluateAllTrekkers,
  generateLedgerEntry,
  WEATHER_CONDITIONS
} from './engine/decisionEngine.js';

export default function App() {
  // 1. Offline / Online network detection
  const [isOnline, setIsOnline] = useState(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Trekkers state with local persistence
  const [trekkersData, setTrekkersData] = useState(() => {
    try {
      const saved = localStorage.getItem('signalsar_trekkers_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 6) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('LocalStorage load error:', e);
    }
    return initialTrekkersData;
  });

  // 3. Atmospheric Profile state
  const [weatherCondition, setWeatherCondition] = useState(() => {
    try {
      const saved = localStorage.getItem('signalsar_weather_v1');
      if (saved && (saved === 'CLEAR' || saved === 'DETERIORATING' || saved === 'SEVERE')) {
        return saved;
      }
    } catch (e) {}
    return 'CLEAR';
  });

  // 4. Live Simulation state
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [simulationTick, setSimulationTick] = useState(0);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState(() => {
    try {
      return localStorage.getItem('signalsar_last_update_v1') || new Date().toLocaleTimeString();
    } catch (e) {
      return new Date().toLocaleTimeString();
    }
  });

  // 5. Search, Filter, Sort, Selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('URGENCY_DESC');
  const [selectedTrekkerId, setSelectedTrekkerId] = useState('TRK-01');

  // 6. Decision Change Ledger state
  const [ledgerHistory, setLedgerHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('signalsar_ledger_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}

    const initEval = evaluateAllTrekkers(initialTrekkersData, 'CLEAR');
    const initEntry = generateLedgerEntry({
      previousEval: null,
      currentEval: initEval,
      triggerType: 'INITIAL_LOAD',
      userNote: 'Initial mission telemetry ingested and evaluated under baseline conditions.'
    });
    return initEntry ? [initEntry] : [];
  });

  // Dynamic evaluation derived from current trekker telemetry and weather
  const currentEvaluation = useMemo(() => {
    return evaluateAllTrekkers(trekkersData, weatherCondition);
  }, [trekkersData, weatherCondition]);

  // Persist weather to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('signalsar_weather_v1', weatherCondition);
    } catch (e) {}
  }, [weatherCondition]);

  // Persist ledger history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('signalsar_ledger_v1', JSON.stringify(ledgerHistory.slice(0, 30)));
    } catch (e) {}
  }, [ledgerHistory]);

  // 7. Bounded 5-Second Synthetic Telemetry Stream
  useEffect(() => {
    if (!isLiveUpdating) return;

    const intervalId = setInterval(() => {
      // 1. Generate updated synthetic trekker data cleanly
      const updated = trekkersData.map((trk) => {
        let newPing = trk.lastPingMinsAgo !== null ? trk.lastPingMinsAgo + 1 : null;
        let newBattery = trk.batteryPercent;
        let newSignal = trk.signalDbm;

        // Occasional intermittent packet transmit resets ping freshness
        if (Math.random() < 0.25 && trk.lastPingMinsAgo !== null) {
          newPing = Math.floor(Math.random() * 3) + 1;
        }

        // Active battery drains slowly (bounded at >= 1%; null stays null)
        if (newBattery !== null && newBattery > 1) {
          if (Math.random() < 0.35) {
            newBattery = Math.max(1, newBattery - 1);
          }
        }

        // Connected signal RF fade fluctuation (bounded -125 to -75 dBm; null stays null)
        if (newSignal !== null) {
          const delta = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
          newSignal = Math.max(-125, Math.min(-75, newSignal + delta));
        }

        return {
          ...trk,
          lastPingMinsAgo: newPing,
          batteryPercent: newBattery,
          signalDbm: newSignal
        };
      });

      // 2. Evaluate diff for ledger
      const prevEval = evaluateAllTrekkers(trekkersData, weatherCondition);
      const nextEval = evaluateAllTrekkers(updated, weatherCondition);

      const nextTick = simulationTick + 1;
      const ledgerEntry = generateLedgerEntry({
        previousEval: prevEval,
        currentEval: nextEval,
        triggerType: 'SIMULATED_TICK',
        userNote: `[SIMULATED TELEMETRY TICK #${nextTick}] Bounded synthetic ping staleness & battery fluctuations recorded.`
      });

      if (ledgerEntry) {
        setLedgerHistory((hist) => [ledgerEntry, ...hist.slice(0, 40)]);
      }

      const newTime = new Date().toLocaleTimeString();
      setLastUpdateTimestamp(newTime);
      setSimulationTick(nextTick);
      setTrekkersData(updated);

      try {
        localStorage.setItem('signalsar_trekkers_v1', JSON.stringify(updated));
        localStorage.setItem('signalsar_last_update_v1', newTime);
      } catch (err) {}
    }, 5000);

    return () => clearInterval(intervalId);
  }, [isLiveUpdating, weatherCondition, simulationTick, trekkersData]);

  // 8. Handle Atmospheric Condition Shift
  const handleWeatherChange = (newWeatherKey) => {
    if (newWeatherKey === weatherCondition) return;

    const previousEval = currentEvaluation;
    const nextEval = evaluateAllTrekkers(trekkersData, newWeatherKey);

    const ledgerEntry = generateLedgerEntry({
      previousEval,
      currentEval: nextEval,
      triggerType: 'WEATHER_CHANGE',
      userNote: `Incident Commander shifted atmospheric scenario from ${weatherCondition} to ${newWeatherKey}.`
    });

    setWeatherCondition(newWeatherKey);
    if (ledgerEntry) {
      setLedgerHistory(prev => [ledgerEntry, ...prev]);
    }
  };

  // 9. Full Baseline Simulation Reset
  const handleResetBaseline = () => {
    setIsLiveUpdating(false);
    const previousEval = currentEvaluation;
    const resetTrekkers = JSON.parse(JSON.stringify(initialTrekkersData));
    const nextEval = evaluateAllTrekkers(resetTrekkers, 'CLEAR');

    const ledgerEntry = generateLedgerEntry({
      previousEval,
      currentEval: nextEval,
      triggerType: 'RESET',
      userNote: 'Incident Commander reset simulation and telemetry to initial mission baseline.'
    });

    setTrekkersData(resetTrekkers);
    setWeatherCondition('CLEAR');
    setSimulationTick(0);
    const resetTime = new Date().toLocaleTimeString();
    setLastUpdateTimestamp(resetTime);
    if (ledgerEntry) {
      setLedgerHistory(prev => [ledgerEntry, ...prev]);
    }
    setSearchQuery('');
    setSectorFilter('ALL');
    setSortBy('URGENCY_DESC');
    setSelectedTrekkerId('TRK-01');

    try {
      localStorage.removeItem('signalsar_trekkers_v1');
      localStorage.removeItem('signalsar_weather_v1');
      localStorage.removeItem('signalsar_ledger_v1');
      localStorage.removeItem('signalsar_last_update_v1');
    } catch (e) {}
  };

  // 10. Filter and sort trekkers
  const filteredTrekkers = useMemo(() => {
    let list = [...currentEvaluation.trekkers];

    // Sector Filter
    if (sectorFilter !== 'ALL') {
      list = list.filter(t => t.sector === sectorFilter);
    }

    // Search Query (name, id, equipment, situation, sector)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => {
        const nameMatch = t.name.toLowerCase().includes(q);
        const idMatch = t.id.toLowerCase().includes(q);
        const sectorMatch = t.sector.toLowerCase().includes(q) || (t.sectorSubname && t.sectorSubname.toLowerCase().includes(q));
        const notesMatch = t.situationNotes && t.situationNotes.toLowerCase().includes(q);
        const equipMatch = t.equipment && t.equipment.some(e => e.toLowerCase().includes(q));
        return nameMatch || idMatch || sectorMatch || notesMatch || equipMatch;
      });
    }

    // Sorting
    list.sort((a, b) => {
      switch (sortBy) {
        case 'URGENCY_DESC':
          return b.analysis.urgency.totalUrgency - a.analysis.urgency.totalUrgency;
        case 'URGENCY_ASC':
          return a.analysis.urgency.totalUrgency - b.analysis.urgency.totalUrgency;
        case 'CONFIDENCE_DESC':
          return b.analysis.confidence.totalConfidence - a.analysis.confidence.totalConfidence;
        case 'CONFIDENCE_ASC':
          return a.analysis.confidence.totalConfidence - b.analysis.confidence.totalConfidence;
        case 'UNCERTAINTY_DESC':
          return b.analysis.uncertainty.rui - a.analysis.uncertainty.rui;
        case 'STALENESS_DESC':
          return (b.lastPingMinsAgo || 999) - (a.lastPingMinsAgo || 999);
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        default:
          return b.analysis.urgency.totalUrgency - a.analysis.urgency.totalUrgency;
      }
    });

    return list;
  }, [currentEvaluation.trekkers, sectorFilter, searchQuery, sortBy]);

  // Selected trekker reference
  const selectedTrekker = useMemo(() => {
    return currentEvaluation.trekkers.find(t => t.id === selectedTrekkerId) || currentEvaluation.trekkers[0];
  }, [currentEvaluation.trekkers, selectedTrekkerId]);

  // High-level statistics
  const criticalCount = currentEvaluation.trekkers.filter(t => t.analysis.urgency.totalUrgency >= 80).length;
  const avgConfidence = Math.round(
    currentEvaluation.trekkers.reduce((acc, t) => acc + t.analysis.confidence.totalConfidence, 0) / currentEvaluation.trekkers.length
  );

  return (
    <div className="sar-console-container">
      {/* 1. TOP HEADER */}
      <header className="sar-header">
        <div className="sar-brand-block">
          <div className="sar-logo-icon">
            <Compass size={22} />
          </div>
          <div className="sar-title-group">
            <h1>
              SignalSAR Advanced
              <span className="sar-badge-version">EOC CONSOLE</span>
            </h1>
            <div className="sar-incident-subtitle">
              <span>Incident: Operation Lost Signal</span>
              <span>•</span>
              <span>Alpine Rescue Coordination</span>
            </div>
          </div>
        </div>

        <div className="sar-header-actions">
          {/* Online/Offline Status Indicator */}
          <span
            className={`sar-net-indicator ${isOnline ? 'online' : 'offline'}`}
            title={isOnline ? 'Online: Service Worker caching & persistence active' : 'Offline Mode: Operating 100% on cached shell & local storage'}
          >
            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            {isOnline ? 'ONLINE' : 'OFFLINE MODE'}
          </span>

          {/* Simulation Controls Group */}
          <div className="sar-btn-group">
            {!isLiveUpdating ? (
              <button
                onClick={() => setIsLiveUpdating(true)}
                className="sar-btn"
                title="Start 5-second simulated telemetry updates"
              >
                <Play size={13} /> START UPDATES
              </button>
            ) : (
              <button
                onClick={() => setIsLiveUpdating(false)}
                className="sar-btn active-sim"
                title="Pause simulated telemetry updates"
              >
                <Pause size={13} /> PAUSE UPDATES
              </button>
            )}
            <button
              onClick={handleResetBaseline}
              className="sar-btn sar-btn-danger"
              title="Reset all telemetry and weather to original baseline"
            >
              <RotateCcw size={13} /> RESET BASELINE
            </button>
          </div>
        </div>
      </header>

      {/* Simulated Live Alert Notice when active */}
      {isLiveUpdating && (
        <div className="sim-live-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} />
            <span>
              <strong>SIMULATED TELEMETRY ACTIVE (TICK #{simulationTick}):</strong> Streaming bounded synthetic telemetry every 5 seconds.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>Last Streamed: {lastUpdateTimestamp}</span>
            <span style={{ background: 'rgba(59, 130, 246, 0.25)', padding: '2px 6px', borderRadius: '3px', fontSize: '0.72rem', fontWeight: 700 }}>
              SYNTHETIC
            </span>
          </div>
        </div>
      )}

      {/* 2. INCIDENT OVERVIEW BAR */}
      <section className="sar-overview-strip">
        <div className="kpi-card">
          <div className="kpi-title">
            <span>Missing Persons</span>
            <Users size={14} color="var(--text-muted)" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{currentEvaluation.trekkers.length}</span>
            <span className="kpi-subtext">Active Profiles</span>
          </div>
          <div className="kpi-subtext" style={{ marginTop: '4px' }}>6 Alpine Sectors Surveyed</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <span>Critical Urgency (≥80)</span>
            <AlertTriangle size={14} color={criticalCount > 0 ? 'var(--status-critical-text)' : 'var(--text-muted)'} />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: criticalCount > 0 ? 'var(--status-critical-text)' : 'var(--status-stable-text)' }}>
              {criticalCount}
            </span>
            <span className="kpi-subtext">of 6</span>
          </div>
          <div className="kpi-subtext" style={{ marginTop: '4px' }}>Immediate Life-Safety Risk</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <span>SAR Teams Deployed</span>
            <Shield size={14} color="var(--status-stable-text)" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: 'var(--status-stable-text)' }}>
              {currentEvaluation.dispatch.totalTeamsDeployed} / {currentEvaluation.dispatch.totalAvailableTeams}
            </span>
            <span className="kpi-subtext">Alpha, Bravo, Charlie</span>
          </div>
          <div className="kpi-subtext" style={{ marginTop: '4px' }}>Max Ground Capacity Reached</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <span>Uncovered Sectors</span>
            <AlertCircle size={14} color="var(--status-critical-text)" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: 'var(--status-critical-text)' }}>
              {currentEvaluation.dispatch.uncoveredCount}
            </span>
            <span className="kpi-subtext">Sectors</span>
          </div>
          <div className="kpi-subtext" style={{ marginTop: '4px' }}>Queued for Mutual Aid</div>
        </div>

        {/* Weather Severity Controls */}
        <div className="weather-control-card">
          <div className="weather-header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wind size={15} color="var(--text-secondary)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                WEATHER CONDITION:
              </span>
            </div>
            <div className="weather-toggle-group">
              <button
                onClick={() => handleWeatherChange('CLEAR')}
                className={`weather-chip ${weatherCondition === 'CLEAR' ? 'active-clear' : ''}`}
                title="Clear weather baseline"
              >
                <Sun size={13} /> CLEAR
              </button>
              <button
                onClick={() => handleWeatherChange('DETERIORATING')}
                className={`weather-chip ${weatherCondition === 'DETERIORATING' ? 'active-deteriorating' : ''}`}
                title="Deteriorating squall (+35% hazard multiplier)"
              >
                <CloudRain size={13} /> DETERIORATING
              </button>
              <button
                onClick={() => handleWeatherChange('SEVERE')}
                className={`weather-chip ${weatherCondition === 'SEVERE' ? 'active-severe' : ''}`}
                title="Severe blizzard whiteout (+80% hazard multiplier, air support grounded)"
              >
                <CloudSnow size={13} /> SEVERE
              </button>
            </div>
          </div>

          <div className="weather-telemetry-meta">
            <span>Temp: <strong>{currentEvaluation.weather.tempC}</strong></span>
            <span>Winds: <strong>{currentEvaluation.weather.winds}</strong></span>
            <span>Visibility: <strong>{currentEvaluation.weather.visibility}</strong></span>
            <span>Aviation: <strong style={{ color: weatherCondition === 'SEVERE' ? 'var(--status-critical-text)' : 'inherit' }}>{currentEvaluation.weather.airSupport}</strong></span>
          </div>
        </div>
      </section>

      {/* 3. PRIMARY OPERATIONAL WORKSPACE (2-COLUMN GRID) */}
      <main className="sar-workspace-grid">
        {/* Left Column: Missing Persons Table & Sector Dispatch Matrix */}
        <div className="sar-primary-column">
          {/* Search, Sector Filter & Sort Bar */}
          <div className="filter-toolbar">
            <div className="search-input-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search by trekker name, ID, sector, equipment, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="select-filter"
            >
              <option value="ALL">All Sectors (6)</option>
              <option value="Sector Alpha">Sector Alpha (Ridge)</option>
              <option value="Sector Bravo">Sector Bravo (Canyon)</option>
              <option value="Sector Charlie">Sector Charlie (Pass)</option>
              <option value="Sector Delta">Sector Delta (Glacier)</option>
              <option value="Sector Echo">Sector Echo (Valley)</option>
              <option value="Sector Foxtrot">Sector Foxtrot (Plateau)</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="select-filter"
            >
              <option value="URGENCY_DESC">Sort: Urgency (Highest)</option>
              <option value="URGENCY_ASC">Sort: Urgency (Lowest)</option>
              <option value="CONFIDENCE_DESC">Sort: Confidence (Highest)</option>
              <option value="CONFIDENCE_ASC">Sort: Confidence (Lowest)</option>
              <option value="UNCERTAINTY_DESC">Sort: Uncertainty (Highest RUI)</option>
              <option value="STALENESS_DESC">Sort: Ping Staleness (Oldest)</option>
              <option value="NAME_ASC">Sort: Trekker Name</option>
            </select>
          </div>

          {/* Missing Person Intelligence Table */}
          <div className="table-panel">
            <div className="panel-header">
              <div className="panel-title">
                <Users size={16} />
                <span>Missing Persons Operations Manifest ({filteredTrekkers.length})</span>
              </div>
              <div className="panel-subtitle">
                Click any row to inspect deep diagnostic breakdown
              </div>
            </div>

            {filteredTrekkers.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <AlertCircle size={28} color="var(--status-high-text)" style={{ marginBottom: '8px' }} />
                <p>No trekker matches your current search or sector filter criteria.</p>
              </div>
            ) : (
              <table className="trekker-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>ID &amp; Name</th>
                    <th>Sector / Terrain</th>
                    <th>Last Ping</th>
                    <th>Battery</th>
                    <th>Signal</th>
                    <th>Urgency</th>
                    <th>Confidence</th>
                    <th>Uncertainty</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrekkers.map((trk) => {
                    const isSelected = trk.id === selectedTrekker?.id;
                    const rank = currentEvaluation.trekkers.findIndex(t => t.id === trk.id) + 1;
                    const urg = trk.analysis.urgency;
                    const conf = trk.analysis.confidence;
                    const unc = trk.analysis.uncertainty;

                    return (
                      <tr
                        key={trk.id}
                        onClick={() => setSelectedTrekkerId(trk.id)}
                        className={`trekker-row ${isSelected ? 'selected' : ''}`}
                      >
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          #{rank}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{trk.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{trk.id}</div>
                        </td>
                        <td>
                          <div>{trk.sector}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{trk.sectorSubname}</div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {trk.lastPingMinsAgo === null ? (
                            <span className="badge badge-unknown">NO PING</span>
                          ) : (
                            <span style={{ color: trk.lastPingMinsAgo > 180 ? 'var(--status-critical-text)' : trk.lastPingMinsAgo > 60 ? 'var(--status-high-text)' : 'inherit' }}>
                              {trk.lastPingMinsAgo}m ago
                            </span>
                          )}
                        </td>
                        <td>
                          {trk.batteryPercent === null ? (
                            <span className="badge badge-unknown">UNKNOWN</span>
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', color: trk.batteryPercent <= 15 ? 'var(--status-critical-text)' : trk.batteryPercent <= 50 ? 'var(--status-high-text)' : 'var(--status-stable-text)' }}>
                              <Battery size={13} style={{ display: 'inline', marginRight: '3px' }} />
                              {trk.batteryPercent}%
                            </span>
                          )}
                        </td>
                        <td>
                          {trk.signalDbm === null ? (
                            <span className="badge badge-unknown">OFFLINE</span>
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', color: trk.signalDbm < -105 ? 'var(--status-critical-text)' : 'inherit' }}>
                              <Radio size={13} style={{ display: 'inline', marginRight: '3px' }} />
                              {trk.signalDbm} dBm
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-${urg.tier.toLowerCase()}`}>
                            {urg.totalUrgency}/100
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {conf.totalConfidence}%
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', color: unc.rui >= 75 ? 'var(--status-critical-text)' : unc.rui >= 45 ? 'var(--status-high-text)' : 'var(--status-stable-text)' }}>
                            {unc.rui} RUI
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Sector-Level Dispatch Board & Mutual Aid Matrix */}
          <div className="dispatch-board-section">
            <div className="panel-title" style={{ marginBottom: '4px' }}>
              <Shield size={16} />
              <span>Rescue Team Sector Dispatch &amp; Capacity Matrix (3 Teams Available)</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Allocation Priority: <strong>(Urgency × 0.70) + (Search RUI × 0.30)</strong> with terrain specialty matching. Uncovered sectors trigger mutual-aid queue.
            </div>

            <div className="sectors-grid">
              {/* Deployed Sectors */}
              {currentEvaluation.dispatch.assignedSectors.map((sec, idx) => (
                <div key={sec.sector} className="sector-tile deployed">
                  <div className="sector-tile-header">
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--status-stable-text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        PRIORITY #{idx + 1} (Score: {sec.compositePriorityScore})
                      </span>
                      <div className="sector-title">{sec.sector}</div>
                      <div className="sector-subtitle">{sec.sectorSubname}</div>
                    </div>
                    <span className="badge badge-low">
                      <CheckCircle2 size={12} /> DEPLOYED
                    </span>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                    <strong>Assigned Unit:</strong> <span style={{ color: '#38bdf8' }}>{sec.assignedTeam.name}</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sec.assignedTeam.type}</div>
                  </div>

                  <div className="sector-rationale">
                    <strong>Dispatch Rationale:</strong> {sec.rationale}
                  </div>
                </div>
              ))}

              {/* Uncovered Sectors */}
              {currentEvaluation.dispatch.uncoveredSectors.map((sec, idx) => (
                <div key={sec.sector} className="sector-tile uncovered">
                  <div className="sector-tile-header">
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--status-critical-text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        PRIORITY #{currentEvaluation.dispatch.assignedSectors.length + idx + 1} (Score: {sec.compositePriorityScore})
                      </span>
                      <div className="sector-title">{sec.sector}</div>
                      <div className="sector-subtitle">{sec.sectorSubname}</div>
                    </div>
                    <span className="badge badge-critical">
                      <AlertTriangle size={12} /> UNCOVERED
                    </span>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--status-critical-text)', fontWeight: 600 }}>
                    Status: PENDING PHASE 2 / MUTUAL AID
                  </div>

                  <div className="sector-rationale" style={{ borderColor: 'rgba(239, 68, 68, 0.25)' }}>
                    <strong>Operational Alert:</strong> {sec.rationale}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Person Diagnostics Panel */}
        <aside className="sar-diagnostic-panel">
          {selectedTrekker ? (
            <>
              <div className="diagnostic-header">
                <div className="diagnostic-id-row">
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem' }}>
                    {selectedTrekker.id}
                  </span>
                  <span className={`badge badge-${selectedTrekker.analysis.urgency.tier.toLowerCase()}`}>
                    URGENCY {selectedTrekker.analysis.urgency.totalUrgency}/100 ({selectedTrekker.analysis.urgency.tier})
                  </span>
                </div>
                <div className="diagnostic-person-name">{selectedTrekker.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {selectedTrekker.sector} — {selectedTrekker.sectorSubname} ({selectedTrekker.terrainType})
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Vitals: <strong>{selectedTrekker.vitalSignsStatus}</strong>
                </div>
              </div>

              {/* Urgency Formula Breakdown */}
              <div>
                <div className="section-block-title">
                  <Activity size={14} />
                  <span>Explainable Urgency Breakdown</span>
                </div>
                <div className="metric-breakdown-card">
                  <div className="formula-display">
                    {selectedTrekker.analysis.urgency.formula}
                  </div>

                  {/* Battery Risk */}
                  <div className="formula-row">
                    <div className="formula-row-label">
                      <span>1. Battery Risk (25%): {selectedTrekker.analysis.urgency.factors.battery.details.label}</span>
                      <span style={{ fontWeight: 600, color: 'var(--status-critical-text)' }}>
                        +{selectedTrekker.analysis.urgency.factors.battery.contribution} pts
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-val"
                        style={{
                          width: `${selectedTrekker.analysis.urgency.factors.battery.score}%`,
                          background: selectedTrekker.analysis.urgency.factors.battery.score > 70 ? 'var(--status-critical-border)' : 'var(--status-high-border)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Ping Staleness */}
                  <div className="formula-row">
                    <div className="formula-row-label">
                      <span>2. Ping Age Staleness (25%): {selectedTrekker.analysis.urgency.factors.pingAge.details.label}</span>
                      <span style={{ fontWeight: 600, color: 'var(--status-high-text)' }}>
                        +{selectedTrekker.analysis.urgency.factors.pingAge.contribution} pts
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-val"
                        style={{
                          width: `${selectedTrekker.analysis.urgency.factors.pingAge.score}%`,
                          background: selectedTrekker.analysis.urgency.factors.pingAge.score > 70 ? 'var(--status-critical-border)' : 'var(--status-high-border)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Terrain Hazard */}
                  <div className="formula-row">
                    <div className="formula-row-label">
                      <span>3. Environmental Hazard ({weatherCondition}): Base {selectedTrekker.analysis.urgency.factors.environmental.details.terrainBase} × {selectedTrekker.analysis.urgency.factors.environmental.details.weatherMultiplier}</span>
                      <span style={{ fontWeight: 600, color: 'var(--status-stable-text)' }}>
                        +{selectedTrekker.analysis.urgency.factors.environmental.contribution} pts
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-val"
                        style={{ width: `${selectedTrekker.analysis.urgency.factors.environmental.score}%`, background: 'var(--status-stable-border)' }}
                      />
                    </div>
                  </div>

                  {/* Reported Danger */}
                  <div className="formula-row">
                    <div className="formula-row-label">
                      <span>4. Reported Threat / Injury Severity (25%)</span>
                      <span style={{ fontWeight: 600, color: 'var(--status-critical-text)' }}>
                        +{selectedTrekker.analysis.urgency.factors.reportedDanger.contribution} pts
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-val"
                        style={{ width: `${selectedTrekker.analysis.urgency.factors.reportedDanger.score}%`, background: 'var(--status-critical-border)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Independent Telemetry Confidence */}
              <div>
                <div className="section-block-title">
                  <Radio size={14} />
                  <span>Independent Telemetry Confidence</span>
                </div>
                <div className="metric-breakdown-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700 }}>
                      Confidence Index: {selectedTrekker.analysis.confidence.totalConfidence}% ({selectedTrekker.analysis.confidence.rating})
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {selectedTrekker.analysis.confidence.presentFieldsRatio}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '0.75rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Freshness (40%)</div>
                      <strong>{selectedTrekker.analysis.confidence.freshnessScore}/100</strong>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Signal (35%)</div>
                      <strong>{selectedTrekker.analysis.confidence.signalScore}/100</strong>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Fields (25%)</div>
                      <strong>{selectedTrekker.analysis.confidence.completenessScore}/100</strong>
                    </div>
                  </div>

                  {selectedTrekker.analysis.confidence.missingItems.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--status-high-text)' }}>
                      Missing: {selectedTrekker.analysis.confidence.missingItems.join(', ')} (safely penalized; not fabricated)
                    </div>
                  )}
                </div>
              </div>

              {/* Search Area Uncertainty (RUI) */}
              <div>
                <div className="section-block-title">
                  <Compass size={14} />
                  <span>Search Area Uncertainty (Simulated RUI)</span>
                </div>
                <div className="metric-breakdown-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                      {selectedTrekker.analysis.uncertainty.rui} RUI ({selectedTrekker.analysis.uncertainty.zoneTier})
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {selectedTrekker.analysis.uncertainty.zoneDescriptor}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '6px' }}>
                    ⚠️ {selectedTrekker.analysis.uncertainty.disclaimer}
                  </div>
                </div>
              </div>

              {/* Equipment & Situation Log */}
              <div>
                <div className="section-block-title">
                  <FileText size={14} />
                  <span>Equipment &amp; Situation Intelligence</span>
                </div>
                <div className="metric-breakdown-card">
                  <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    GEAR MANIFEST:
                  </div>
                  {selectedTrekker.equipment ? (
                    <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
                      {selectedTrekker.equipment.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="badge badge-unknown" style={{ marginBottom: '8px', display: 'inline-block' }}>
                      NO EQUIPMENT MANIFEST FILED OR RECOVERABLE
                    </div>
                  )}

                  <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    SITUATION NOTES:
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {selectedTrekker.situationNotes}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a trekker from the manifest to view diagnostics
            </div>
          )}
        </aside>
      </main>

      {/* 4. DECISION CHANGE LEDGER (AUDIT TRAIL) */}
      <section className="ledger-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="panel-title">
            <History size={16} />
            <span>Decision Change Ledger (Audit Trail)</span>
          </div>
          <span className="badge badge-unknown" style={{ fontSize: '0.72rem' }}>
            {ledgerHistory.length} Event{ledgerHistory.length === 1 ? '' : 's'} Recorded
          </span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Immutable record of priority rank shifts, score deltas, and sector dispatch modifications triggered by weather shifts, telemetry updates, or resets.
        </div>

        <div className="ledger-records-list">
          {ledgerHistory.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No decision changes recorded yet.
            </div>
          ) : (
            ledgerHistory.map((entry) => (
              <div key={entry.id} className="ledger-card">
                <div className="ledger-card-header">
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{entry.trigger}</span>
                  <span>{entry.timestamp}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {entry.summary}
                </div>

                {entry.trekkerChanges && entry.trekkerChanges.length > 0 && (
                  <div className="ledger-diff-chips">
                    {entry.trekkerChanges.map((tc, idx) => (
                      <div key={idx} className="ledger-diff-chip">
                        <strong style={{ color: 'var(--text-primary)' }}>{tc.name} ({tc.id}):</strong>{' '}
                        <span>Rank #{tc.prevRank} ➔ #{tc.newRank}</span>{' '}
                        <span style={{ color: tc.urgencyDelta > 0 ? 'var(--status-critical-text)' : 'var(--status-stable-text)', fontFamily: 'var(--font-mono)' }}>
                          ({tc.urgencyDelta > 0 ? `+${tc.urgencyDelta}` : tc.urgencyDelta} pts)
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {entry.dispatchChanges && entry.dispatchChanges.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {entry.dispatchChanges.map((dc, idx) => (
                      <div key={idx}>
                        • <strong>{dc.sector}:</strong> {dc.previousAssignment} ➔ <span style={{ color: dc.newAssignment === 'UNCOVERED' ? 'var(--status-critical-text)' : 'var(--status-stable-text)' }}>{dc.newAssignment}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* 5. FOOTER DISCLAIMER */}
      <footer className="sar-footer">
        <div>
          OPERATION: LOST SIGNAL // INCIDENT COMMAND SUPPORT SYSTEM • ADVANCED TRACK PROTOTYPE
        </div>
        <div style={{ marginTop: '2px', color: 'var(--text-muted)' }}>
          * SIMULATED RELATIVE UNCERTAINTY INDEX (RUI) • ZERO REAL GPS COORDINATES FABRICATED • OFFLINE SERVICE WORKER ACTIVE
        </div>
      </footer>
    </div>
  );
}

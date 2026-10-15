import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Shield,
  Battery,
  BatteryWarning,
  Radio,
  Wind,
  RotateCcw,
  Search,
  Activity,
  Users,
  Compass,
  FileText,
  ChevronRight,
  CloudSnow,
  Sun,
  CloudRain,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Wifi,
  WifiOff,
  Play,
  Pause
} from 'lucide-react';
import initialTrekkersData from './data/trekkers.json';
import {
  evaluateAllTrekkers,
  generateLedgerEntry,
  WEATHER_CONDITIONS
} from './engine/decisionEngine.js';

export default function App() {
  // Offline / Online network detection
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

  // Trekkers state with LocalStorage caching
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
      console.warn('LocalStorage load exception:', e);
    }
    return initialTrekkersData;
  });

  // Weather state with LocalStorage caching
  const [weatherCondition, setWeatherCondition] = useState(() => {
    try {
      const saved = localStorage.getItem('signalsar_weather_v1');
      if (saved && (saved === 'CLEAR' || saved === 'DETERIORATING' || saved === 'SEVERE')) {
        return saved;
      }
    } catch (e) {}
    return 'CLEAR';
  });

  // Live Simulation state
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [simulationTick, setSimulationTick] = useState(0);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState(() => {
    try {
      return localStorage.getItem('signalsar_last_update_v1') || new Date().toLocaleTimeString();
    } catch (e) {
      return new Date().toLocaleTimeString();
    }
  });

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('URGENCY_DESC');
  
  // Selected trekker ID for deep diagnostic inspection
  const [selectedTrekkerId, setSelectedTrekkerId] = useState('TRK-01');

  // Active view tab: 'TACTICAL' | 'DISPATCH' | 'LEDGER'
  const [activeTab, setActiveTab] = useState('TACTICAL');

  // Ledger history state with LocalStorage caching
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
      triggerType: 'INITIAL_LOAD'
    });
    return [initEntry];
  });

  // Current evaluation dynamically computed from trekkersData and weatherCondition
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

  // Handle simulated live updates (Every 5 seconds)
  useEffect(() => {
    if (!isLiveUpdating) return;

    const intervalId = setInterval(() => {
      setTrekkersData((prevTrekkers) => {
        // Generate bounded synthetic telemetry updates
        const updated = prevTrekkers.map((trk) => {
          let newPing = trk.lastPingMinsAgo !== null ? trk.lastPingMinsAgo + 1 : null;
          let newBattery = trk.batteryPercent;
          let newSignal = trk.signalDbm;

          // 1. Intermittent packet transmit (every few ticks, one trekker's ping is renewed)
          if (Math.random() < 0.25 && trk.lastPingMinsAgo !== null) {
            newPing = Math.floor(Math.random() * 3) + 1; // 1 to 3 mins
          }

          // 2. Battery drain for active devices (bounded, down to 1%)
          if (newBattery !== null && newBattery > 1) {
            if (Math.random() < 0.35) {
              newBattery = Math.max(1, newBattery - 1);
            }
          }

          // 3. Signal fluctuation (bounded between -125 and -75 dBm)
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

        // Compute evaluations for ledger diff
        const prevEval = evaluateAllTrekkers(prevTrekkers, weatherCondition);
        const nextEval = evaluateAllTrekkers(updated, weatherCondition);

        setSimulationTick((t) => {
          const nextTick = t + 1;
          const ledgerEntry = generateLedgerEntry({
            previousEval: prevEval,
            currentEval: nextEval,
            triggerType: 'SIMULATED_TICK',
            userNote: `[SIMULATED TELEMETRY TICK #${nextTick}] Bounded synthetic ping age & battery fluctuations recorded.`
          });

          setLedgerHistory((hist) => [ledgerEntry, ...hist.slice(0, 49)]);
          return nextTick;
        });

        const newTime = new Date().toLocaleTimeString();
        setLastUpdateTimestamp(newTime);

        try {
          localStorage.setItem('signalsar_trekkers_v1', JSON.stringify(updated));
          localStorage.setItem('signalsar_last_update_v1', newTime);
        } catch (err) {}

        return updated;
      });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [isLiveUpdating, weatherCondition]);

  // Handle weather changes with automatic Decision Change Ledger recording
  const handleWeatherChange = (newWeatherKey) => {
    if (newWeatherKey === weatherCondition) return;

    const previousEval = currentEvaluation;
    const nextEval = evaluateAllTrekkers(trekkersData, newWeatherKey);

    const ledgerEntry = generateLedgerEntry({
      previousEval,
      currentEval: nextEval,
      triggerType: 'WEATHER_CHANGE'
    });

    setWeatherCondition(newWeatherKey);
    setLedgerHistory(prev => [ledgerEntry, ...prev]);
  };

  // Reset to baseline (Full simulation reset)
  const handleResetBaseline = () => {
    setIsLiveUpdating(false);
    const previousEval = currentEvaluation;
    const resetTrekkers = JSON.parse(JSON.stringify(initialTrekkersData));
    const nextEval = evaluateAllTrekkers(resetTrekkers, 'CLEAR');

    const ledgerEntry = generateLedgerEntry({
      previousEval,
      currentEval: nextEval,
      triggerType: 'RESET',
      userNote: 'Incident Commander reset simulation to initial mission baseline.'
    });

    setTrekkersData(resetTrekkers);
    setWeatherCondition('CLEAR');
    setSimulationTick(0);
    const resetTime = new Date().toLocaleTimeString();
    setLastUpdateTimestamp(resetTime);
    setLedgerHistory(prev => [ledgerEntry, ...prev]);
    setSearchQuery('');
    setSectorFilter('ALL');
    setSortBy('URGENCY_DESC');

    try {
      localStorage.removeItem('signalsar_trekkers_v1');
      localStorage.removeItem('signalsar_weather_v1');
      localStorage.removeItem('signalsar_ledger_v1');
      localStorage.removeItem('signalsar_last_update_v1');
    } catch (e) {}
  };

  // Filter and sort trekkers
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
        case 'STALENESS_DESC':
          return (b.lastPingMinsAgo || 999) - (a.lastPingMinsAgo || 999);
        case 'UNCERTAINTY_DESC':
          return b.analysis.uncertainty.rui - a.analysis.uncertainty.rui;
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
    <div className="app-container">
      {/* Tactical Incident Header */}
      <header className="ops-header">
        <div className="ops-title-group">
          <div className="radar-pulse">
            <Compass size={24} />
          </div>
          <div className="ops-title-text">
            <h1>
              SIGNAL-SAR ADVANCED
              <span className="ops-badge-alpha">TRACK-ADVANCED</span>
            </h1>
            <div className="ops-subtitle">
              <span className="status-dot"></span>
              <span>OPERATION: LOST SIGNAL</span>
              <span>// MOUNTAINOUS SEARCH &amp; RESCUE INCIDENT COMMAND</span>
            </div>
          </div>
        </div>

        {/* Weather, Simulation Controls, Network Badge & Reset */}
        <div className="ops-controls">
          {/* Online / Offline Status Badge */}
          <span
            className={`network-badge ${isOnline ? 'online' : 'offline'}`}
            title={isOnline ? 'Online: Service Worker pre-caching and asset retention active' : 'Offline: Operating entirely on cached assets and local storage'}
          >
            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>

          {/* Simulated Live Updates Control Pill */}
          <div className="sim-controls-group">
            {!isLiveUpdating ? (
              <button
                onClick={() => setIsLiveUpdating(true)}
                className="sim-btn start"
                title="Start 5-second simulated synthetic telemetry updates"
              >
                <Play size={13} fill="currentColor" /> START UPDATES
              </button>
            ) : (
              <button
                onClick={() => setIsLiveUpdating(false)}
                className="sim-btn pause active-running"
                title="Pause synthetic telemetry updates"
              >
                <Pause size={13} fill="currentColor" /> PAUSE UPDATES
              </button>
            )}
            {isLiveUpdating && (
              <span className="sim-live-indicator">
                <span className="sim-live-dot"></span>
                TICK #{simulationTick}
              </span>
            )}
          </div>

          {/* Atmospheric Profile Controls */}
          <div className="weather-control-pill">
            <button
              onClick={() => handleWeatherChange('CLEAR')}
              className={`weather-btn ${weatherCondition === 'CLEAR' ? 'active-clear' : ''}`}
              title="Clear skies, normal ops"
            >
              <Sun size={15} /> CLEAR
            </button>
            <button
              onClick={() => handleWeatherChange('DETERIORATING')}
              className={`weather-btn ${weatherCondition === 'DETERIORATING' ? 'active-deteriorating' : ''}`}
              title="Gust front, dropping temps, air support constrained"
            >
              <CloudRain size={15} /> DETERIORATING
            </button>
            <button
              onClick={() => handleWeatherChange('SEVERE')}
              className={`weather-btn ${weatherCondition === 'SEVERE' ? 'active-severe' : ''}`}
              title="Blizzard whiteout, air support grounded, critical hypothermia"
            >
              <CloudSnow size={15} /> SEVERE
            </button>
          </div>

          {/* Reset Baseline Simulation */}
          <button
            onClick={handleResetBaseline}
            className="action-btn-reset"
            title="Reset simulation and telemetry back to initial baseline"
          >
            <RotateCcw size={14} /> RESET BASELINE
          </button>
        </div>
      </header>

      {/* Simulated Live Telemetry Stream Indicator Banner */}
      {isLiveUpdating && (
        <div className="sim-alert-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={15} />
            <span><strong>SIMULATED TELEMETRY ACTIVE (TICK #{simulationTick}):</strong> Synthetic ping staleness &amp; battery fluctuations streaming every 5 seconds.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>Last Streamed: {lastUpdateTimestamp}</span>
            <span style={{ background: 'rgba(0, 245, 212, 0.2)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
              SYNTHETIC / SIMULATED
            </span>
          </div>
        </div>
      )}

      {/* Live Weather Status Banner */}
      <div className={`weather-status-banner banner-${weatherCondition.toLowerCase()}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Wind size={18} color={weatherCondition === 'SEVERE' ? '#ef4444' : weatherCondition === 'DETERIORATING' ? '#f59e0b' : '#10b981'} />
          <strong>ATMOSPHERIC PROFILE: {currentEvaluation.weather.label.toUpperCase()}</strong>
          <span style={{ color: 'var(--text-muted)' }}>— {currentEvaluation.weather.summary}</span>
        </div>
        <div className="weather-metrics-list">
          <div className="weather-metric-item">
            <span className="weather-metric-label">Temp:</span>
            <span className="weather-metric-val">{currentEvaluation.weather.tempC}</span>
          </div>
          <div className="weather-metric-item">
            <span className="weather-metric-label">Winds:</span>
            <span className="weather-metric-val">{currentEvaluation.weather.winds}</span>
          </div>
          <div className="weather-metric-item">
            <span className="weather-metric-label">Visibility:</span>
            <span className="weather-metric-val">{currentEvaluation.weather.visibility}</span>
          </div>
          <div className="weather-metric-item">
            <span className="weather-metric-label">Aviation:</span>
            <span className="weather-metric-val" style={{ color: weatherCondition === 'SEVERE' ? '#ef4444' : 'var(--blue-accent)' }}>
              {currentEvaluation.weather.airSupport}
            </span>
          </div>
        </div>
      </div>

      {/* Mission HUD Overview Cards */}
      <section className="hud-grid">
        <div className="hud-card">
          <div className="hud-card-label">
            <span>Missing Trekkers</span>
            <Users size={16} color="var(--blue-accent)" />
          </div>
          <div className="hud-card-val">
            {currentEvaluation.trekkers.length} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Profiles</span>
          </div>
          <div className="hud-subtext">Active telemetry stream ingested</div>
        </div>

        <div className="hud-card">
          <div className="hud-card-label">
            <span>Critical Urgency (≥80)</span>
            <AlertTriangle size={16} color="#ef4444" />
          </div>
          <div className="hud-card-val" style={{ color: criticalCount > 0 ? '#ef4444' : '#10b981' }}>
            {criticalCount} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>of 6</span>
          </div>
          <div className="hud-subtext">Immediate life-safety dispatch required</div>
        </div>

        <div className="hud-card">
          <div className="hud-card-label">
            <span>Mean Telemetry Confidence</span>
            <Activity size={16} color="var(--cyan-accent)" />
          </div>
          <div className="hud-card-val" style={{ color: 'var(--cyan-accent)' }}>
            {avgConfidence}%
          </div>
          <div className="hud-subtext">Ping freshness &amp; packet completeness</div>
        </div>

        <div className="hud-card">
          <div className="hud-card-label">
            <span>Teams Deployed</span>
            <Shield size={16} color="#10b981" />
          </div>
          <div className="hud-card-val" style={{ color: '#10b981' }}>
            {currentEvaluation.dispatch.totalTeamsDeployed} / {currentEvaluation.dispatch.totalAvailableTeams}
          </div>
          <div className="hud-subtext">Alpha, Bravo, Charlie mobilized</div>
        </div>

        <div className="hud-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div className="hud-card-label">
            <span>Uncovered Sectors</span>
            <AlertCircle size={16} color="#ef4444" />
          </div>
          <div className="hud-card-val" style={{ color: '#ef4444' }}>
            {currentEvaluation.dispatch.uncoveredCount} <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Sectors</span>
          </div>
          <div className="hud-subtext">Resource-constrained standby queue</div>
        </div>
      </section>

      {/* View Tabs */}
      <nav className="ops-tabs">
        <button
          onClick={() => setActiveTab('TACTICAL')}
          className={`ops-tab-btn ${activeTab === 'TACTICAL' ? 'active' : ''}`}
        >
          <Activity size={16} /> TREKKER INTELLIGENCE &amp; DIAGNOSTICS
          <span className="tab-badge">{filteredTrekkers.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('DISPATCH')}
          className={`ops-tab-btn ${activeTab === 'DISPATCH' ? 'active' : ''}`}
        >
          <Shield size={16} /> SECTOR &amp; SAR TEAM DISPATCH
          <span className="tab-badge">{currentEvaluation.dispatch.assignedSectors.length} Deployed</span>
        </button>
        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`ops-tab-btn ${activeTab === 'LEDGER' ? 'active' : ''}`}
        >
          <History size={16} /> DECISION CHANGE LEDGER
          <span className="tab-badge">{ledgerHistory.length}</span>
        </button>
      </nav>

      {/* TAB 1: TACTICAL INTELLIGENCE VIEW */}
      {activeTab === 'TACTICAL' && (
        <div className="ops-main-layout">
          {/* Left Column: Search, Filter, and Trekker Cards */}
          <div>
            <div className="search-filter-bar">
              <div className="search-input-wrapper">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search by name, ID, sector, equipment, notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>

              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="filter-select"
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
                className="filter-select"
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

            {/* Trekker List */}
            <div className="trekker-list">
              {filteredTrekkers.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '8px' }}>
                  <AlertCircle size={32} color="var(--warning-amber)" style={{ marginBottom: '10px' }} />
                  <p>No trekker matches your current search or sector filter.</p>
                </div>
              ) : (
                filteredTrekkers.map((trk, idx) => {
                  const isSelected = trk.id === selectedTrekker?.id;
                  const rank = currentEvaluation.trekkers.findIndex(t => t.id === trk.id) + 1;
                  const urg = trk.analysis.urgency;
                  const conf = trk.analysis.confidence;
                  const unc = trk.analysis.uncertainty;

                  return (
                    <div
                      key={trk.id}
                      onClick={() => setSelectedTrekkerId(trk.id)}
                      className={`trekker-row-card ${isSelected ? 'selected' : ''}`}
                    >
                      <div className="trekker-row-header">
                        <div className="trekker-id-name">
                          <span className="trekker-id-pill">{trk.id}</span>
                          <div>
                            <span className="trekker-name">{trk.name}</span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                              Priority Rank: #{rank} of 6
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="trekker-sector-badge">
                            <MapPin size={12} style={{ display: 'inline', marginRight: '3px' }} />
                            {trk.sector}
                          </span>
                          <span className={`badge-${urg.tier.toLowerCase()}`}>
                            URG {urg.totalUrgency}/100
                          </span>
                        </div>
                      </div>

                      <div className="trekker-indicators-grid">
                        {/* Battery Indicator */}
                        <div className="indicator-cell">
                          <div className="indicator-label">Battery Level</div>
                          <div className="indicator-value">
                            {trk.batteryPercent === null ? (
                              <span className="badge-unknown">UNKNOWN</span>
                            ) : (
                              <span style={{ color: trk.batteryPercent <= 15 ? '#ef4444' : trk.batteryPercent <= 50 ? '#f59e0b' : '#10b981' }}>
                                <Battery size={14} style={{ display: 'inline', marginRight: '4px' }} />
                                {trk.batteryPercent}%
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Last Ping */}
                        <div className="indicator-cell">
                          <div className="indicator-label">Last Ping Age</div>
                          <div className="indicator-value">
                            {trk.lastPingMinsAgo === null ? (
                              <span className="badge-unknown">NO PING</span>
                            ) : (
                              <span style={{ color: trk.lastPingMinsAgo > 180 ? '#ef4444' : trk.lastPingMinsAgo > 60 ? '#f59e0b' : '#38bdf8' }}>
                                {trk.lastPingMinsAgo}m ago
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Signal dBm */}
                        <div className="indicator-cell">
                          <div className="indicator-label">Signal Telemetry</div>
                          <div className="indicator-value">
                            {trk.signalDbm === null ? (
                              <span className="badge-unknown">OFFLINE</span>
                            ) : (
                              <span style={{ color: trk.signalDbm < -105 ? '#ef4444' : '#38bdf8' }}>
                                <Radio size={14} style={{ display: 'inline', marginRight: '4px' }} />
                                {trk.signalDbm} dBm
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Confidence */}
                        <div className="indicator-cell">
                          <div className="indicator-label">Confidence</div>
                          <div className="indicator-value">
                            <span style={{ color: conf.badgeColor }}>
                              {conf.totalConfidence}% ({conf.rating})
                            </span>
                          </div>
                        </div>

                        {/* Relative Uncertainty Index */}
                        <div className="indicator-cell">
                          <div className="indicator-label">Search Area RUI</div>
                          <div className="indicator-value">
                            <span style={{ color: unc.rui >= 75 ? '#ef4444' : unc.rui >= 45 ? '#f59e0b' : '#00f5d4' }}>
                              {unc.rui} RUI
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Brief Situation snippet */}
                      <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: 'var(--text-main)' }}>Situation:</strong> {trk.situationNotes}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Deep Diagnostic Inspector for Selected Trekker */}
          <div>
            {selectedTrekker ? (
              <div className="detail-panel">
                <div className="detail-header">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="trekker-id-pill" style={{ fontSize: '0.9rem' }}>
                      {selectedTrekker.id}
                    </span>
                    <span className="trekker-sector-badge" style={{ fontSize: '0.85rem' }}>
                      {selectedTrekker.sector} — {selectedTrekker.sectorSubname}
                    </span>
                  </div>
                  <h3 style={{ marginTop: '10px' }}>
                    {selectedTrekker.name}
                    <span className={`badge-${selectedTrekker.analysis.urgency.tier.toLowerCase()}`} style={{ fontSize: '0.85rem' }}>
                      URGENCY {selectedTrekker.analysis.urgency.totalUrgency}/100
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                    Terrain: {selectedTrekker.terrainType} | Vitals: {selectedTrekker.vitalSignsStatus}
                  </div>
                </div>

                {/* Explainable Urgency Score Decomposition */}
                <div>
                  <div className="detail-section-title">
                    <Activity size={16} /> EXPLAINABLE URGENCY FORMULA BREAKDOWN
                  </div>
                  <div className="score-breakdown-box">
                    <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--blue-accent)', marginBottom: '10px' }}>
                      {selectedTrekker.analysis.urgency.formula}
                    </div>

                    {/* Factor 1: Battery Risk */}
                    <div className="factor-bar-row">
                      <div className="factor-bar-label">
                        <span>1. Battery Risk (Weight 25%): {selectedTrekker.analysis.urgency.factors.battery.details.label}</span>
                        <span style={{ color: '#ef4444' }}>+{selectedTrekker.analysis.urgency.factors.battery.contribution} pts</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${selectedTrekker.analysis.urgency.factors.battery.score}%`,
                            background: selectedTrekker.analysis.urgency.factors.battery.score > 70 ? '#ef4444' : '#f59e0b'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {selectedTrekker.analysis.urgency.factors.battery.details.rationale}
                      </div>
                    </div>

                    {/* Factor 2: Stale Ping Age Risk */}
                    <div className="factor-bar-row">
                      <div className="factor-bar-label">
                        <span>2. Stale Ping Age (Weight 25%): {selectedTrekker.analysis.urgency.factors.pingAge.details.label}</span>
                        <span style={{ color: '#f59e0b' }}>+{selectedTrekker.analysis.urgency.factors.pingAge.contribution} pts</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${selectedTrekker.analysis.urgency.factors.pingAge.score}%`,
                            background: selectedTrekker.analysis.urgency.factors.pingAge.score > 70 ? '#ef4444' : '#f59e0b'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {selectedTrekker.analysis.urgency.factors.pingAge.details.rationale}
                      </div>
                    </div>

                    {/* Factor 3: Environmental Exposure */}
                    <div className="factor-bar-row">
                      <div className="factor-bar-label">
                        <span>3. Environmental Hazard ({weatherCondition}): Base {selectedTrekker.analysis.urgency.factors.environmental.details.terrainBase} × {selectedTrekker.analysis.urgency.factors.environmental.details.weatherMultiplier}</span>
                        <span style={{ color: '#00f5d4' }}>+{selectedTrekker.analysis.urgency.factors.environmental.contribution} pts</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${selectedTrekker.analysis.urgency.factors.environmental.score}%`,
                            background: '#00f5d4'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {selectedTrekker.analysis.urgency.factors.environmental.details.rationale}
                      </div>
                    </div>

                    {/* Factor 4: Reported Danger */}
                    <div className="factor-bar-row">
                      <div className="factor-bar-label">
                        <span>4. Reported Danger &amp; Injury Severity (Weight 25%)</span>
                        <span style={{ color: '#ef4444' }}>+{selectedTrekker.analysis.urgency.factors.reportedDanger.contribution} pts</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${selectedTrekker.analysis.urgency.factors.reportedDanger.score}%`,
                            background: '#ef4444'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {selectedTrekker.analysis.urgency.factors.reportedDanger.details.rationale}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Independent Telemetry Confidence */}
                <div>
                  <div className="detail-section-title">
                    <Radio size={16} /> INDEPENDENT TELEMETRY CONFIDENCE
                  </div>
                  <div className="score-breakdown-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        Confidence Index: {selectedTrekker.analysis.confidence.totalConfidence}% ({selectedTrekker.analysis.confidence.rating})
                      </span>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                        {selectedTrekker.analysis.confidence.presentFieldsRatio}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '0.75rem' }}>
                      <div className="indicator-cell">
                        <div className="indicator-label">Freshness (40%)</div>
                        <div style={{ fontWeight: 600 }}>{selectedTrekker.analysis.confidence.freshnessScore}/100</div>
                      </div>
                      <div className="indicator-cell">
                        <div className="indicator-label">Signal (35%)</div>
                        <div style={{ fontWeight: 600 }}>{selectedTrekker.analysis.confidence.signalScore}/100</div>
                      </div>
                      <div className="indicator-cell">
                        <div className="indicator-label">Completeness (25%)</div>
                        <div style={{ fontWeight: 600 }}>{selectedTrekker.analysis.confidence.completenessScore}/100</div>
                      </div>
                    </div>

                    {selectedTrekker.analysis.confidence.missingItems.length > 0 && (
                      <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#f59e0b' }}>
                        <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        Explicit Missing Data: {selectedTrekker.analysis.confidence.missingItems.join(', ')} (safely isolated without fallback spoofing)
                      </div>
                    )}
                  </div>
                </div>

                {/* Search Area Relative Uncertainty Index (RUI) */}
                <div>
                  <div className="detail-section-title">
                    <Compass size={16} /> SEARCH AREA UNCERTAINTY (SIMULATED RUI)
                  </div>
                  <div className="score-breakdown-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--cyan-accent)', fontSize: '0.9rem' }}>
                        {selectedTrekker.analysis.uncertainty.rui} RUI ({selectedTrekker.analysis.uncertainty.zoneTier})
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                      {selectedTrekker.analysis.uncertainty.zoneDescriptor}
                    </p>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      <span>Staleness Dispersion: +{selectedTrekker.analysis.uncertainty.breakdown.timeDispersion}</span>
                      <span>Signal Attenuation: +{selectedTrekker.analysis.uncertainty.breakdown.signalUncertainty}</span>
                      <span>Atmospheric Obscuration: +{selectedTrekker.analysis.uncertainty.breakdown.weatherUncertainty}</span>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '0.68rem', color: 'var(--text-dim)', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                      ⚠️ {selectedTrekker.analysis.uncertainty.disclaimer}
                    </div>
                  </div>
                </div>

                {/* Equipment & Survival Manifest */}
                <div>
                  <div className="detail-section-title">
                    <FileText size={16} /> EQUIPMENT &amp; SURVIVAL MANIFEST
                  </div>
                  <div className="score-breakdown-box">
                    {selectedTrekker.equipment ? (
                      <ul style={{ paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {selectedTrekker.equipment.map((item, i) => (
                          <li key={i} style={{ marginBottom: '4px' }}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="badge-unknown" style={{ padding: '8px', display: 'block', textAlign: 'center' }}>
                        NO EQUIPMENT MANIFEST FILED OR RECOVERABLE
                      </div>
                    )}
                  </div>
                </div>

                {/* Situation Log */}
                <div>
                  <div className="detail-section-title">
                    <AlertTriangle size={16} /> SITUATION &amp; HAZARD INTELLIGENCE
                  </div>
                  <div className="score-breakdown-box" style={{ fontSize: '0.82rem', lineHeight: '1.5', color: '#e2e8f0' }}>
                    {selectedTrekker.situationNotes}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '8px' }}>
                Select a trekker to view full diagnostics
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SECTOR & SAR TEAM DISPATCH BOARD */}
      {activeTab === 'DISPATCH' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={20} color="var(--cyan-accent)" />
              INCIDENT COMMAND DISPATCH ALLOCATION MATRIX
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Total Sectors: 6 | Available Rapid SAR Teams: 3 (Alpha, Bravo, Charlie).
              Teams are automatically dispatched based on composite priority: <strong>(Urgency × 0.70) + (Search Uncertainty RUI × 0.30)</strong> and capability terrain affinity.
              Unassigned sectors are flagged with standby mutual-aid escalation protocols.
            </p>
          </div>

          <div className="dispatch-board-grid">
            {/* Dispatched Sectors */}
            {currentEvaluation.dispatch.assignedSectors.map((sec, idx) => (
              <div key={sec.sector} className="sector-card dispatched">
                <div className="sector-header">
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--cyan-accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      PRIORITY RANK #{idx + 1} (Score: {sec.compositePriorityScore})
                    </span>
                    <div className="sector-name">{sec.sector}</div>
                    <div className="sector-subname">{sec.sectorSubname}</div>
                  </div>
                  <span className="team-badge">
                    <CheckCircle2 size={14} /> ACTIVE DISPATCH
                  </span>
                </div>

                <div style={{ fontSize: '0.8rem', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--text-main)' }}>Assigned SAR Unit:</strong>
                  <div style={{ color: 'var(--cyan-accent)', fontWeight: 600, marginTop: '2px' }}>
                    {sec.assignedTeam.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    Specialty: {sec.assignedTeam.type}
                  </div>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  <strong>Sector Trekkers:</strong>{' '}
                  {sec.trekkers.map(t => `${t.name} (Urgency: ${t.analysis.urgency.totalUrgency})`).join(', ')}
                </div>

                <div className="dispatch-rationale-box">
                  <strong style={{ color: 'var(--text-main)' }}>Dispatch Rationale:</strong>
                  <p>{sec.rationale}</p>
                </div>
              </div>
            ))}

            {/* Uncovered Sectors */}
            {currentEvaluation.dispatch.uncoveredSectors.map((sec, idx) => (
              <div key={sec.sector} className="sector-card uncovered">
                <div className="sector-header">
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#ef4444', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      PRIORITY RANK #{currentEvaluation.dispatch.assignedSectors.length + idx + 1} (Score: {sec.compositePriorityScore})
                    </span>
                    <div className="sector-name">{sec.sector}</div>
                    <div className="sector-subname">{sec.sectorSubname}</div>
                  </div>
                  <span className="uncovered-badge">
                    <AlertTriangle size={14} /> UNCOVERED
                  </span>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600, marginBottom: '8px' }}>
                  Status: PENDING PHASE 2 / MUTUAL AID
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  <strong>Sector Trekkers:</strong>{' '}
                  {sec.trekkers.map(t => `${t.name} (Urgency: ${t.analysis.urgency.totalUrgency})`).join(', ')}
                </div>

                <div className="dispatch-rationale-box" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                  <strong style={{ color: '#ef4444' }}>Operational Alert:</strong>
                  <p>{sec.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: DECISION CHANGE LEDGER (P2 UNIQUE DIFFERENTIATOR) */}
      {activeTab === 'LEDGER' && (
        <div className="ledger-container">
          <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <History size={20} color="var(--cyan-accent)" />
                  DECISION CHANGE LEDGER (AUDIT TRAIL)
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Every scenario modification, atmospheric shift, and baseline reset generates an immutable entry recording previous vs new priority rankings, score deltas, and dispatch adjustments.
                </p>
              </div>
              <span className="ops-badge-alpha">
                {ledgerHistory.length} TRANSITION RECORDS
              </span>
            </div>
          </div>

          {ledgerHistory.map((entry, index) => (
            <div key={entry.id} className="ledger-item">
              <div className="ledger-header">
                <span className="ledger-trigger-tag">
                  {entry.trigger}
                </span>
                <span className="ledger-timestamp">
                  Recorded at: {entry.timestamp}
                </span>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '10px' }}>
                Summary: {entry.summary}
              </div>

              {/* Trekker Ranking / Urgency Changes */}
              {entry.trekkerChanges && entry.trekkerChanges.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--cyan-accent)', marginBottom: '6px' }}>
                    AFFECTED TREKKER PRIORITY DELTAS:
                  </div>
                  <div className="ledger-diff-grid">
                    {entry.trekkerChanges.map((tc, i) => (
                      <div
                        key={i}
                        className={`ledger-diff-card ${tc.urgencyDelta > 0 ? 'positive-shift' : tc.urgencyDelta < 0 ? 'negative-shift' : ''}`}
                      >
                        <div className="ledger-diff-header">
                          <span style={{ color: '#ffffff' }}>{tc.name} ({tc.id})</span>
                          <span style={{ color: tc.urgencyDelta > 0 ? '#ef4444' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                            {tc.urgencyDelta > 0 ? `+${tc.urgencyDelta}` : tc.urgencyDelta} pts
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                          Sector: {tc.sector} | Rank: #{tc.prevRank} ➔ #{tc.newRank}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {tc.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dispatch Changes */}
              {entry.dispatchChanges && entry.dispatchChanges.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--blue-accent)', marginBottom: '6px' }}>
                    SECTOR DISPATCH ADJUSTMENTS:
                  </div>
                  <div className="score-breakdown-box" style={{ background: 'var(--bg-secondary)' }}>
                    {entry.dispatchChanges.map((dc, i) => (
                      <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                        • <strong style={{ color: 'var(--blue-accent)' }}>{dc.sector}:</strong> {dc.previousAssignment} ➔ <strong style={{ color: dc.newAssignment === 'UNCOVERED' ? '#ef4444' : '#10b981' }}>{dc.newAssignment}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Operational Disclaimer Footer */}
      <footer className="disclaimer-footer">
        <div>
          OPERATION: LOST SIGNAL // INCIDENT COMMAND PROTOCOL • DETERMINISTIC EXPLAINABLE DECISION ENGINE
        </div>
        <div style={{ marginTop: '4px', color: 'var(--text-dim)' }}>
          * SIMULATED RELATIVE UNCERTAINTY INDEX (RUI) UTILIZED. ZERO REAL GPS COORDINATES FABRICATED. MISSING TELEMETRY SAFELY PENALIZED &amp; LABELED EXPLICITLY.
        </div>
      </footer>
    </div>
  );
}

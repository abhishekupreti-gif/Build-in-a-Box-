# SignalSAR Advanced — Operation: Lost Signal

An explainable, deterministic incident-command decision support system for search-and-rescue (SAR) operations in complex mountainous terrain.

Developed for the **Operation: Lost Signal** hackathon challenge (Advanced Track).

---

## 1. Problem Statement & Intended Users

### Problem Statement
Six trekkers are lost across rugged alpine terrain under rapid atmospheric deterioration. Their telemetry is incomplete, degraded, or intermittent (e.g., dead transponders, dropped RF line-of-sight, unfiled gear manifests). Ground and aerial SAR capabilities are constrained to **3 specialized rescue teams** covering **6 designated sectors**. 

Incident commanders face life-critical triage decisions: they must allocate scarce teams without falling victim to false precision, unverified GPS claims, or opaque "black-box" heuristics.

### Intended Users
- **Search-and-Rescue Incident Commanders (IC):** Allocating multi-agency ground, alpine, and medevac teams.
- **Emergency Operations Center (EOC) Triage Officers:** Continuously monitoring telemetry streams and environmental hazard thresholds.
- **Alpine Dispatch Coordinators:** Tracking resource allocation deficits and managing mutual-aid requests for uncovered sectors.

---

## 2. Core Capabilities & Architecture

### P0: Resilient Telemetry Ingestion
- Ingests 6 simulated trekker profiles (`TRK-01` to `TRK-06`).
- **Zero Hallucination / Safe Missing Telemetry**:
  - Missing battery percentages are flagged explicitly as `UNKNOWN / CORRUPTED` and assigned a conservative uncertainty penalty.
  - Dropped signal carriers are flagged explicitly as `OFFLINE / NO CARRIER`.
  - Unfiled gear manifests are labeled as `NO MANIFEST FILED`.
  - **No GPS coordinates or false error radii are invented.**

### P1: Explainable Decision Engine (`src/engine/decisionEngine.js`)
Independent, pure JavaScript functions calculating:
1. **Urgency Score (0–100):**
   - **Battery Risk (25%):** Penalizes low battery or unknown power state.
   - **Stale-Ping Age (25%):** Risk scales from fresh (<30m) to critically stale (>6h).
   - **Environmental Exposure (25%):** Sector baseline terrain hazard multiplied by atmospheric conditions ($1.0\times$ Clear, $1.35\times$ Deteriorating, $1.80\times$ Severe).
   - **Reported Threat (25%):** Direct physical danger, injuries, and shelter deficits.
2. **Independent Telemetry Confidence (0–100%):**
   - Ping Freshness ($40\%$) + Signal Quality ($35\%$) + Telemetry Completeness ($25\%$).
   - Completely decoupled from urgency: a trekker can have critical urgency but low confidence.
3. **Search Uncertainty (Relative Uncertainty Index, RUI, 0–100):**
   - An explicitly simulated relative dispersion index (not a false GPS radius).
   - Incorporates time drift, signal attenuation, and weather obscuration.
4. **Weather Simulation:**
   - **Clear**: Baseline conditions, full air support (helicopters and drones active).
   - **Deteriorating**: High gusts, freezing rain, constrained air operations.
   - **Severe**: Full blizzard whiteout, sub-zero windchill, aviation grounded, avalanche level 4.
5. **Sector & Team Dispatch Engine:**
   - Allocates 3 SAR Teams (`SAR Alpha` Alpine Recon, `SAR Bravo` Glacier Crevasse Unit, `SAR Charlie` Medevac Trauma Unit) to the top-priority sectors using composite priority:
     $$\text{Composite Sector Priority} = (\text{Highest Urgency} \times 0.70) + (\text{Search RUI} \times 0.30)$$
   - Automatically pairs team specialty with sector terrain.
   - **Explicitly flags uncovered sectors** as `PENDING PHASE 2 / MUTUAL AID` with clear rationale.

### P2: Decision Change Ledger (Audit Trail)
- Every atmospheric shift, synthetic live update tick, or baseline reset triggers an immutable transition entry.
- Compares previous vs. new rankings, score deltas ($\Delta$ urgency), and sector dispatch reallocations.
- Documents the exact trigger rationale explaining *why* priority shifted.

### P3: Incident Command Interface
- Modern Emergency Operations Center (EOC) layout: navy (`#070d19`), clean typography, cyan accents (`#00f5d4`), and amber/red alert status badges.
- Live Atmospheric Profile HUD.
- Multi-dimensional search (name, ID, equipment, notes, sector) and 7-way sorting.
- Interactive Deep Diagnostic Inspector breaking down formulas for selected trekkers.
- Sector & SAR Team Dispatch Matrix.

---

## 3. Data Sources & Schema

Mission telemetry is bundled locally in `src/data/trekkers.json`:

```json
{
  "id": "TRK-01",
  "name": "Sarah Chen",
  "sector": "Sector Alpha",
  "sectorSubname": "North Ridge (2,800m)",
  "terrainType": "Alpine Ridge / Exposed Scree",
  "lastPingMinsAgo": 42,
  "lastPingTimestamp": "2026-10-15T10:35:00Z",
  "batteryPercent": 14,
  "signalDbm": -108,
  "equipment": [
    "Thermal bivy",
    "First aid kit",
    "GPS beacon (intermittent)",
    "Trekking poles"
  ],
  "situationNotes": "Reported suspected right ankle fracture at 2,800m elevation before voice link dropped. Rapidly dropping ambient temperatures.",
  "reportedDangerScore": 80,
  "terrainHazardBase": 75,
  "vitalSignsStatus": "Distressed (Injured)"
}
```

### Safe Telemetry Handling Rules
| Field | Value When Missing | Engine Treatment | UI Presentation |
| :--- | :--- | :--- | :--- |
| `batteryPercent` | `null` | Conservative Risk Penalty = 75 pts; Completeness = 0 | Badge: `UNKNOWN` (Amber outline) |
| `signalDbm` | `null` | Max Signal Attenuation Penalty = 25 pts; Quality = 0 | Badge: `OFFLINE` (Dashed gray) |
| `equipment` | `null` | Flagged as unfiled manifest; lack of shelter modifier applied | Notice: `NO MANIFEST FILED` |
| `lastPingMinsAgo` | `null` | Max Staleness Penalty = 100 pts | Badge: `NO PING` |

---

## 4. Offline Capabilities & Local Storage Architecture

- **100% Local Execution**: All core logic, data structures, and mathematical formulas execute entirely inside the client. No external cloud endpoints, machine learning downloads, or API keys are required.
- **Service Worker (`public/sw.js`)**:
  - Implements shell pre-caching (`/`, `/index.html`, `/manifest.json`, `/icon.svg`).
  - Stale-While-Revalidate caching strategy with offline fallback.
  - Allows reloading the application and navigating all features even if internet connectivity drops completely.
- **Web App Manifest (`public/manifest.json`)**: Configured for standalone PWA home screen installation.
- **Local Storage Persistence**:
  - Active trekker telemetry state, weather mode, simulation ticks, and Decision Change Ledger history are automatically persisted in `localStorage`.
  - Reopening or refreshing the page retains the exact operational scenario state.
- **Live Network Indicator**:
  - Top header displays real-time `ONLINE` or `OFFLINE` status via browser `navigator.onLine` and event listeners.

---

## 5. Simulated Live Telemetry Updates

- **Controls**:
  - `START UPDATES`: Starts bounded synthetic telemetry updates every 5 seconds.
  - `PAUSE UPDATES`: Immediately halts updates and safely clears timers.
  - `RESET BASELINE`: Fully restores initial mission data, resets weather to Clear, and clears local cache.
- **Update Behavior (Every 5 seconds)**:
  - Synthetic ping age increases or updates on intermittent connection windows.
  - Active batteries gently decay (bounded $\ge 1\%$; missing batteries stay strictly `null`).
  - Connected radio signals fluctuate realistic RF fade ($\pm 1$ to $\pm 3$ dBm; offline remains `null`).
  - Automatically recalculates urgency, confidence, RUI, and sector dispatch matrix.
  - Logs diffs to Decision Change Ledger with explicit `[SYNTHETIC]` trigger tag.
- **Safe Single Timer**: React `useEffect` manages a single `setInterval`, ensuring zero duplicate timers when toggled repeatedly.
- **Explicit Labeling**: Every update is clearly labeled as `[SIMULATED - SYNTHETIC DATA]`.

---

## 6. Project Structure

```text
├── public/
│   ├── icon.svg                   # Tactical SAR radar icon
│   ├── manifest.json              # PWA Web App Manifest
│   └── sw.js                      # Service Worker with asset caching & offline fallback
├── src/
│   ├── data/
│   │   └── trekkers.json          # 6 Simulated trekker profiles with missing telemetry
│   ├── engine/
│   │   └── decisionEngine.js      # Pure, deterministic SAR scoring & dispatch logic
│   ├── App.jsx                    # Incident command interface & state orchestration
│   ├── index.css                  # EOC design tokens, responsive tactical layout
│   └── main.jsx                   # React application mount & SW registration
├── test/
│   ├── engine.test.js             # Automated unit tests for engine & edge cases
│   └── server.test.js             # Automated HTTP test for shell assets & offline manifest
├── index.html                     # HTML5 shell with tactical typography & manifest links
├── package.json                   # Project manifest & scripts
├── vite.config.js                 # Vite configuration
├── .gitignore                     # Standard Node/Vite ignore rules
└── README.md                      # Documentation & demo instructions
```

---

## 7. Setup & Run Instructions

### Prerequisites
- Node.js (v18 or higher recommended; verified on Node v22.19.0)
- npm (v9 or higher; verified on npm 11.13.0)

### 1. Installation
```bash
npm install
```

### 2. Run Automated Verification Tests
```bash
# Test 1: Algorithmic decision engine, missing data safety, and diffing
npm test

# Test 2: Local server startup, HTML shell, sw.js, manifest.json, icon.svg
npm run test:server
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production & Preview
```bash
npm run build
npm run preview
```

---

## 8. Scoring Assumptions & Mathematical Model

### Urgency Formula (0 to 100)
$$\text{Urgency} = \min\left(100, \text{round}\left(0.25 \cdot B + 0.25 \cdot P + 0.25 \cdot E + 0.25 \cdot D\right)\right)$$
- $B$ (Battery Risk): 100 if $\le 10\%$, 80 if $\le 25\%$, 50 if $\le 50\%$, 25 if $\le 75\%$, 10 if $> 75\%$, **75 if missing/corrupted**.
- $P$ (Stale Ping Risk): 15 if $\le 30\text{m}$, 40 if $\le 60\text{m}$, 70 if $\le 180\text{m}$, 90 if $\le 360\text{m}$, **100 if $> 360\text{m}$ or missing**.
- $E$ (Environmental Hazard): $\min(100, \text{Base Hazard} \times \text{Weather Multiplier})$.
- $D$ (Reported Threat): Base injury threat + weather vulnerability penalty (+12/+24 for injured, +10/+22 for unsheltered).

### Telemetry Confidence Formula (0 to 100%)
$$\text{Confidence} = \min\left(100, \text{round}\left(0.40 \cdot \text{Freshness} + 0.35 \cdot \text{Signal} + 0.25 \cdot \text{Completeness}\right)\right)$$

### Search Area Uncertainty (Relative Uncertainty Index, RUI)
$$\text{RUI} = \min\left(100, \text{round}\left(\text{TimeDispersion} + \text{SignalPenalty} + \text{WeatherObscuration}\right)\right)$$

---

## 9. 2-Minute Live Demo Script & Talking Points

| Timestamp | Screen / Action | Spoken Talking Point |
| :--- | :--- | :--- |
| **0:00 – 0:30** | **Operational Overview & Missing Data**<br>Load the dashboard on `Clear` baseline. Point to `TRK-02` and `TRK-06`. | *"Welcome to SignalSAR Advanced. In Operation Lost Signal, six trekkers are lost across mountainous terrain. Notice our telemetry ingestion: instead of inventing false coordinates or healthy defaults, missing batteries and offline transponders are safely flagged as UNKNOWN and penalized conservatively."* |
| **0:30 – 1:00** | **Explainable Diagnostics**<br>Click on `TRK-01` (Sarah Chen) or `TRK-04` (David Kim). Inspect the right panel. | *"Every recommendation is explainable. In the diagnostic inspector, we decompose urgency into four 25% weighted pillars: battery, ping age, terrain, and reported threat. Notice that Telemetry Confidence is calculated completely independently from Urgency—high urgency does not guarantee high confidence."* |
| **1:00 – 1:30** | **Weather Simulation & Dispatch Board**<br>Click **DETERIORATING** then **SEVERE**.<br>Switch to **Sector & Team Dispatch** tab. | *"As a severe blizzard strikes, our decision engine dynamically escalates environmental exposure and grounds aviation. With only 3 SAR teams available for 6 sectors, the engine allocates teams by composite priority and terrain specialty—and explicitly flags the 3 unassigned sectors as UNCOVERED for mutual aid."* |
| **1:30 – 2:00** | **Decision Change Ledger & Live Simulation**<br>Switch to **Decision Change Ledger** tab.<br>Click **START UPDATES** then **RESET BASELINE**. | *"Our core differentiator is the Decision Change Ledger: an immutable audit trail showing exact rank shifts, score deltas, and dispatch rationale. Finally, our 5-second simulated live update loop streams synthetic telemetry, and our Service Worker ensures the full application functions completely offline in the field."* |

---

## 10. Q&A Readiness & Defense of Assumptions

- **Why simulate a Relative Uncertainty Index (RUI) instead of drawing a GPS circle?**
  *Drawing an arbitrary circular radius around an outdated ping falsely implies geodesic precision. In alpine canyons, line-of-sight and terrain friction mean search dispersion is irregular. RUI conveys relative spatial expansion without fabricating coordinates.*
- **Why are only 3 teams dispatched when 6 sectors have trekkers?**
  *Real-world SAR operations are resource-constrained. Our algorithm enforces realistic capacity limits, prioritizes the top 3 critical sectors, and flags uncovered sectors to trigger mutual aid escalation.*
- **How does the system handle corrupt packets or null values?**
  *Missing values receive an uncertainty penalty in urgency calculations, score 0 in confidence completeness, and are prominently displayed with dashed alert badges rather than crashing the client.*

---

## 11. Limitations, Edge Cases & Future Work

1. **Limitations**:
   - The system is a decision-support heuristic, not an automated dispatch authority. Human Incident Commanders make final mission authorizations.
   - Terrain hazards are modeled as baseline sector indices rather than continuous 3D digital elevation models (DEM).
2. **Edge Cases Handled**:
   - Zero pings received (maximum staleness penalty).
   - Conflicting telemetry (e.g., healthy battery but critical reported threat).
   - Complete loss of internet connection (PWA Service Worker caches the shell and persists state in `localStorage`).
3. **Future Work**:
   - Integration with tactical mesh networks (e.g., ATAK / Meshtastic).
   - Ingestion of live topography GeoJSON contour elevation maps.

---

## 12. Verification Checklist & Test Results

| Verification Item | Result | Verification Method |
| :--- | :--- | :--- |
| 1. App starts with documented commands | **PASS** | Verified with `npm run build` & `npm run preview` |
| 2. Six profiles load from supplied fixture | **PASS** | Verified in `test/engine.test.js` & React UI |
| 3. Search and filtering work | **PASS** | Verified name/ID/notes/gear search and sector dropdown |
| 4. Urgency and confidence calculated separately | **PASS** | Verified in `test/engine.test.js` Suite #4 |
| 5. Weather changes affect scores and dispatches | **PASS** | Verified Clear/Deteriorating/Severe multipliers |
| 6. Decision Change Ledger records real diffs | **PASS** | Verified ledger state diffing & rankings |
| 7. Missing data handled safely (no crashes/spoofs) | **PASS** | Verified null battery & null signal explicitly labeled |
| 8. Cached assets and offline operation | **PASS** | Verified `sw.js` and `manifest.json` via `test/server.test.js` |
| 9. Simulated live updates (Start, Pause, Reset) | **PASS** | Verified 5s loop, timer isolation, and baseline restore |
| 10. No inert buttons or blocking errors | **PASS** | Verified zero console errors; build succeeds in 3.1s |

---

## 13. Publishing to a Public GitHub Repository

If you wish to publish this codebase to a public GitHub repository:

1. **Create an empty repository on GitHub**:
   - Go to [github.com/new](https://github.com/new).
   - Name your repository (e.g., `signalsar-advanced`).
   - Select **Public**.
   - Do **not** initialize with README or .gitignore (already present).

2. **Link the remote and push**:
   ```powershell
   git remote add origin https://github.com/<your-github-username>/signalsar-advanced.git
   git branch -M main
   git push -u origin main
   ```

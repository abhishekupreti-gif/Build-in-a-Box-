# SignalSAR Advanced — Operation: Lost Signal

An explainable, deterministic incident-command decision support system for search-and-rescue (SAR) operations in complex mountainous terrain.

Developed for the **Operation: Lost Signal** hackathon challenge.

---

## 1. Problem Overview

Six trekkers are missing in harsh mountainous sectors. Telemetry is intermittent, stale, or partially missing (e.g., dead batteries, unfiled equipment manifests, dropped packets). Meanwhile, weather is deteriorating, communications are obstructed by terrain features, and SAR dispatch resources are strictly constrained to **3 specialized rescue teams** across **6 active sectors**.

Incident commanders must make urgent, life-safety dispatch choices under high uncertainty without relying on opaque "black-box" models or fabricated GPS coordinates.

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
- Every atmospheric shift or baseline reset triggers an immutable transition entry.
- Compares previous vs. new rankings, score deltas ($\Delta$ urgency), and sector dispatch reallocations.
- Documents the exact trigger rationale explaining *why* priority shifted.

### P3: Incident Command Interface
- Modern Emergency Operations Center (EOC) layout: navy (`#070d19`), clean typography, cyan accents (`#00f5d4`), and amber/red alert status badges.
- Live Atmospheric Profile HUD.
- Multi-dimensional search (name, ID, equipment, notes, sector) and sorting.
- Interactive Deep Diagnostic Inspector breaking down formulas for selected trekkers.
- Sector & SAR Team Dispatch Matrix.

---

## 3. Project Structure

```text
├── src/
│   ├── data/
│   │   └── trekkers.json          # 6 Simulated trekker profiles with missing telemetry
│   ├── engine/
│   │   └── decisionEngine.js      # Pure, deterministic SAR scoring & dispatch logic
│   ├── App.jsx                    # Incident command interface & state orchestration
│   ├── index.css                  # EOC design tokens, responsive tactical layout
│   └── main.jsx                   # React application mount
├── test/
│   └── engine.test.js             # Automated unit tests for engine & edge cases
├── index.html                     # HTML5 shell with tactical typography
├── package.json                   # Project manifest & scripts
├── vite.config.js                 # Vite configuration
├── .gitignore                     # Standard Node/Vite ignore rules
└── README.md                      # Documentation & demo instructions
```

---

## 4. Setup & Run Instructions

### Prerequisites
- Node.js (v18 or higher recommended; verified on Node v22.19.0)
- npm (v9 or higher; verified on npm 11.13.0)

### 1. Installation
```bash
npm install
```

### 2. Run Automated Verification Tests
```bash
npm test
```
*Executes `test/engine.test.js` validating all 5 calculation suites: ingestion, missing telemetry safety, baseline dispatch, weather recalculation, and ledger generation.*

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
npm run build
npm run preview
```

---

## 5. Scoring Assumptions & Mathematical Model

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

## 6. Limitations & Boundaries

1. **Simulated Relative Uncertainty**: RUI is a relative dispersion metric for triage prioritization. It does not calculate geodesic bounding boxes or real GPS polygons.
2. **Deterministic Heuristics**: The engine uses explainable weighted rules rather than statistical regression or black-box neural networks.
3. **No External APIs**: Operates 100% locally with zero internet dependency, avoiding downtime in field operations.

---

## 7. Demo Walkthrough Instructions

1. **Initial Baseline**: Observe the 6 trekker cards loaded from `trekkers.json`. Notice how David Kim (`TRK-04`) and Sarah Chen (`TRK-01`) have high urgency, while Liam O'Connor (`TRK-06`) displays explicit `UNKNOWN` badges for battery and signal without crashing.
2. **Deep Diagnostic Inspection**: Click on any trekker card. The right panel decomposes every fraction of their urgency and confidence score, showing the exact formula and reason.
3. **Trigger Atmospheric Shift**: In the top bar, click **DETERIORATING** or **SEVERE**.
   - Notice immediate updates to weather metrics (windchill, grounded aviation).
   - Observe how Liam O'Connor's urgency surges due to high plateau exposure and lack of shelter.
4. **Inspect Sector Dispatch Matrix**: Switch to the **Sector & SAR Team Dispatch** tab.
   - Verify the 3 dispatched teams with matched terrain capabilities.
   - Note the 3 clearly flagged `UNCOVERED / PENDING PHASE 2` sectors.
5. **Inspect the Decision Change Ledger**: Switch to the **Decision Change Ledger** tab.
   - See the real-time audit record showing previous vs. new rankings, score deltas ($\Delta$), and dispatch reassignments.
6. **Reset Baseline**: Click **RESET BASELINE** in the header. The system restores baseline Clear weather and logs a `Scenario Reset` event in the ledger.

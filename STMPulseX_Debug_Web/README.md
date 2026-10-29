# 🛠️ STMPulseX_Debug_Web — Developer Biosignal Testbed & Web Telemetry Suite

[![Web Serial API](https://img.shields.io/badge/API-Web%20Serial-informational.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
[![UI Technology](https://img.shields.io/badge/Frontend-Vanilla%20HTML5%20%7C%20Canvas%202D-green.svg)]()
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Opera-blue.svg)]()
[![License](https://img.shields.io/badge/License-MIT-brightgreen.svg)](../LICENSE)

This directory hosts the **developer testing, diagnostic, and signal validation web suite** for the STMPulseX platform. It is engineered specifically for firmware engineers, researchers, and developers to inspect raw optical sensor outputs, validate digital signal processing (DSP) pipelines, perform stress/respiration trials, and export structured telemetry without installing heavy desktop client software.

---

## 🎯 Purpose & Scope

* **Developer Testbed**: Internal diagnostic harness for real-time sensor verification during hardware bringup and firmware tuning.
* **Zero Runtime Overhead**: 100% vanilla HTML5, CSS3, and JavaScript — no Node.js dependencies, no build steps, and zero CDN latency.
* **Dual Entrypoints**:
  * [`dashboard.html`](dashboard.html): Direct file-based dashboard.
  * [`index.html`](index.html): Standard root document for local web servers (e.g. `python -m http.server`, Live Server).

---

## 🚀 Browser Compatibility & Prerequisites

The Web Serial API enables direct bidirectional communication between modern web browsers and hardware serial ports (USB CDC ACM Virtual COM Ports).

| Browser | Supported Operating Systems | Status |
|:---|:---|:---|
| **Google Chrome** | Windows 10/11, macOS, Linux, ChromeOS | ✅ Supported (v89+) |
| **Microsoft Edge** | Windows 10/11, macOS, Linux | ✅ Supported (v89+) |
| **Opera / Brave** | Windows 10/11, macOS, Linux | ✅ Supported |
| **Mozilla Firefox** | All Platforms | ❌ Not Supported (Web Serial disabled) |
| **Apple Safari** | macOS, iOS | ❌ Not Supported |

> [!IMPORTANT]
> **Serial Port Exclusivity**: Modern operating systems only permit one process to hold an open handle on a serial port. Before clicking **Connect STM32**, ensure any terminal monitors (PuTTY, Tera Term, STM32CubeIDE Serial Monitor, or Python scripts) are disconnected.

---

## 💻 Architecture & Pipeline

```
  ┌─────────────────────────────────────────────────────────┐
  │              STM32WB55 USB CDC Stream                   │
  │            25 Hz ASCII Telemetry String                 │
  └────────────────────────────┬────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │               Web Serial TextDecoderStream              │
  │              (Chunks parsed into lines)                 │
  └────────────────────────────┬────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │               Regex & Substring Tokenizer               │
  │  • Red & IR ADC counts (MAX30102)                       │
  │  • On-die contact temperature (CTEMP)                   │
  │  • Ambient Temp, Humidity, Pressure (BME280)            │
  └────────────────────────────┬────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │                 Real-Time DSP Engine                    │
  │  1. Exponential Moving Average Baseline (IIR)           │
  │  2. AC Photoplethysmogram Surge Extraction              │
  │  3. Adaptive Peak & Dicrotic Notch Rejection (BPM)      │
  │  4. Ratio-of-Ratios SpO2 Computation                    │
  │  5. RMSSD Heart Rate Variability (Autonomic Mood)       │
  │  6. Respiratory Sinus Arrhythmia Filter (0.15–0.35 Hz)  │
  │  7. Perfusion Index (PI %) Sensor Accuracy              │
  │  8. Dynamic Thermal Gradient (ΔT = Skin - Air)          │
  └────────────────────────────┬────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │               60 FPS Canvas & Audio Engine              │
  │  • Graph 1: Filtered Heart Rate Pulse Waveform (PPG)    │
  │  • Graph 2: Respiration Waveform (RSA Breath Sine-Wave) │
  │  • Graph 3: Raw IR Channel (Dynamic Autoscaled)         │
  │  • Graph 4: Raw Red Channel (Dynamic Autoscaled)        │
  │  • Graph 5: 60-Sec Dual-Axis Trend Line (HR & SpO2)     │
  │  • Web Audio API Pulse Beeps (SpO2 Pitch Modulated)     │
  │  • CSV Session Telemetry Exporter                       │
  └─────────────────────────────────────────────────────────┘
```

---

## 📈 Visual Diagnostic Instruments

### 1. Heart Rate Pulse Waveform (PPG AC)
* **Color**: Red (`#f85149`)
* **Bandwidth**: 25 Hz real-time sweep.
* **Physics**: Extracts pulsatile blood surge volume changes by subtracting the low-frequency DC attenuation from raw IR photodiode counts. Reveals systolic peaks and diastolic dicrotic notches.

### 2. Respiration Waveform (RSA Breath Sine-Wave)
* **Color**: Emerald Green (`#2ea043`)
* **Physics**: Isolates thoracic breathing shifts ($0.15 - 0.35\text{ Hz}$) using a tuned 14-sample low-pass boxcar filter.
* **Testing Capabilities**:
  * **Inhaling**: Upward crest into `Inhale (+)` zone.
  * **Exhaling**: Downward dip into `Exhale (-)` zone.
  * **Rapid Breathing**: Tracks hyperventilation up to **54 BrPM** (~1.1s cycle).
  * **Slow Breathing**: Tracks deep meditative breathing down to **5 BrPM** (~12s cycle).
  * **Breath-Holding**: Visual flatline dead-center along the zero-baseline.

### 3. Raw IR Channel (880 nm)
* **Color**: Cyan (`#38bdf8`)
* **Dynamic Autoscale**: Automatically computes the dynamic span of active finger contact (e.g. `Min: 120,600`, `Max: 121,500`), expanding the photodiode waveform over 75% of the canvas height.

### 4. Raw Red Channel (660 nm)
* **Color**: Orange (`#fb923c`)
* **Dynamic Autoscale**: Real-time adaptive framing tracking Red LED absorption variations.

### 5. 60-Second Physiological Trend Line
* **Dual-Axis History (1 Hz)**:
  * **Heart Rate (BPM)**: Red plot ($40 - 160\text{ BPM}$) capturing heart rate recovery following physical strain or breathing exercises.
  * **SpO₂ (%)**: Green plot ($80 - 100\%$) tracking arterial saturation stability and hypoxic dips.

---

## 🧰 Developer Tools & Diagnostic Controls

| Tool | UI Trigger | Description |
|:---|:---|:---|
| **Speed Controller** | `[0.5x]` `[1.0x]` `[2.0x]` `[⚡ MAX]` | Controls waveform sweep speed and time scale. |
| **Window Controller** | `[Low (2.4s)]` `[Med (6s)]` `[High (12s)]` | Sets sliding memory depth and autoscaling bounds across all waveform charts. |
| **Pause / Freeze** | `[⏸ Pause]` / `[▶ Resume]` | Freezes all 5 canvases simultaneously with yellow `PAUSED` overlays for waveform inspection. |
| **Pulse Audio Tone** | `[🔊 Audio Beep]` | Web Audio API synthesizer generating a 60ms pulse tone per heartbeat, pitch-modulated by SpO₂. |
| **CSV Telemetry Export** | `[📥 Export CSV]` | Exports all recorded telemetry into a formatted `.csv` file with 11 sensor channels for Excel/Python. |
| **Log Tools** | `[📋 Copy All]` `[📋 Copy 100]` `[🗑 Clear]` | Instant clipboard export of raw serial telemetry logs. |
| **Session Statistics Banner** | Top Bar | Displays elapsed duration, live HR range (Min-Max-Avg), total pulses, average SpO₂, total breaths, and packet counters. |

---

## 🧪 How to Launch

### Option 1: Direct File Launch (Easiest)
Double-click `dashboard.html` or drag it into Google Chrome, Microsoft Edge, or Brave.

### Option 2: Local HTTP Server
Run a local lightweight web server from this directory:
```bash
# Python 3 built-in server
python -m http.server 8000

# Open in browser:
# http://localhost:8000/
```

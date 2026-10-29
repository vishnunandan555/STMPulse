# 📊 Biosignal Dashboard Guide (`dashboard.html`)

[![Web Serial API](https://img.shields.io/badge/API-Web%20Serial-informational.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
[![UI Technology](https://img.shields.io/badge/Frontend-Vanilla%20HTML5%20%7C%20Canvas%202D-green.svg)]()
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Opera-blue.svg)]()

This document provides in-depth technical details on the client-side architecture, Web Serial API communication, mathematical digital signal processing (DSP) algorithms, and canvas graphics rendering implemented in [dashboard.html](dashboard.html).

---

## 🎯 Overview

The **STMPulseX Biosignal Suite** frontend is a zero-dependency, single-file web application. It connects directly to the STM32WB55 Virtual COM Port over the browser's native **Web Serial API**, parsing high-speed 25 Hz telemetry strings, executing DSP algorithms to extract physiological metrics, and rendering high-performance 60 FPS charts on HTML5 Canvases.

---

## 🚀 Browser Compatibility & Prerequisites

The Web Serial API enables direct bidirectional communication between web applications and serial ports (USB CDC, RS-232, UART bridges).

| Browser | Supported Operating Systems | Status |
|:---|:---|:---|
| **Google Chrome** | Windows 10/11, macOS, Linux, ChromeOS | ✅ Supported (v89+) |
| **Microsoft Edge** | Windows 10/11, macOS, Linux | ✅ Supported (v89+) |
| **Opera / Brave** | Windows 10/11, macOS, Linux | ✅ Supported |
| **Mozilla Firefox** | All Platforms | ❌ Not Supported (Web Serial disabled) |
| **Apple Safari** | macOS, iOS | ❌ Not Supported |

> [!IMPORTANT]
> **Port Exclusivity**: Serial ports can only be opened by one process at a time. Before clicking **Connect STM32**, ensure that any serial monitoring software (PuTTY, Tera Term, STM32CubeIDE Serial Monitor, Arduino IDE, or Python scripts) is disconnected.

---

## 💻 Architecture & Pipeline

```
  ┌──────────────────────────────────────────────┐
  │         STM32WB55 USB CDC Stream             │
  │     25 Hz ASCII Telemetry String             │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │         Web Serial TextLineStream            │
  │        (Chunks parsed into lines)            │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │         Regex & Substring Tokenizer          │
  │  • Red & IR ADC counts                       │
  │  • Contact temperature (CTEMP)               │
  │  • Ambient Temp, Humidity, Pressure          │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │          Real-Time DSP Engine                │
  │  1. Exponential Moving Average Baseline      │
  │  2. AC Blood Surge Pulse Extraction          │
  │  3. Adaptive Peak Detection (BPM)            │
  │  4. Ratio-of-Ratios SpO2 Computation         │
  │  5. RMSSD Heart Rate Variability             │
  │  6. Respiratory Sinus Arrhythmia Filter      │
  │  7. Perfusion Index (PI %)                   │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │          60 FPS Canvas Rendering             │
  │  • AC Photoplethysmogram (Autoscaled)        │
  │  • Raw Infrared Optical Channel (Cyan)       │
  │  • Raw Red Optical Channel (Orange)          │
  │  • Numeric Metric Cards & Status Badge       │
  └──────────────────────────────────────────────┘
```

---

## 🧮 Digital Signal Processing Algorithms

### 1. DC Baseline Removal & AC Pulse Extraction
Raw photodiode readings contain an enormous DC offset (optical attenuation through static tissue, bone, and venous blood) and a minute AC component (arterial pulsation from cardiac contractions).

A first-order Infinite Impulse Response (IIR) exponential tracker estimates the baseline:
$$\text{Baseline}_n = \alpha \cdot \text{Baseline}_{n-1} + (1 - \alpha) \cdot IR_n \quad \text{where } \alpha = 0.96$$
The dynamic AC pulse waveform is then:
$$AC_n = IR_n - \text{Baseline}_n$$

### 2. Adaptive Peak Detection & Heart Rate (BPM)
To reject dicrotic notch reflections while capturing valid systoles:
- **Lockout Window**: A refractory period of 300 ms ($0.3\text{ s}$) rejects secondary peaks immediately following a beat.
- **Dynamic Thresholding**: A peak is registered when $AC_n > 0.35 \times \text{Peak Amplitude}$.
- **RR Interval Buffer**: Successive peak timestamps generate RR intervals in milliseconds. Heart rate is calculated over a rolling median filter:
  $$\text{BPM} = \frac{60\,000}{\text{Median}(RR)}$$

### 3. Oxygen Saturation ($SpO_2$) Extraction
Oxygenated hemoglobin ($HbO_2$) and deoxygenated hemoglobin ($Hb$) have distinct optical absorption coefficients at Red ($660\text{ nm}$) and Infrared ($880\text{ nm}$).

1. Measure peak-to-peak AC amplitudes:
   $$AC_{\text{Red}} = \max(Red) - \min(Red), \quad AC_{\text{IR}} = \max(IR) - \min(IR)$$
2. Compute the optical Modulation Ratio ($R$):
   $$R = \frac{AC_{\text{Red}} / DC_{\text{Red}}}{AC_{\text{IR}} / DC_{\text{IR}}}$$
3. Apply standard empirical linear calibration:
   $$SpO_2 = 110 - 25 \times R$$
   Values are clamped between $80\%$ and $100\%$ with rolling smoothing.

### 4. Heart Rate Variability (HRV - RMSSD)
HRV measures the beat-to-beat variations in heart rate, reflecting autonomic nervous system balance:
$$\text{RMSSD} = \sqrt{\frac{1}{N-1} \sum_{i=1}^{N-1} (RR_{i+1} - RR_i)^2}$$
- Higher values (> 40 ms) typically indicate relaxed parasympathetic dominance.
- Lower values (< 20 ms) indicate sympathetic arousal or physical stress.

### 5. Respiration Rate (BrPM)
Breathing modulates the PPG baseline via **Respiratory Sinus Arrhythmia (RSA)** and thoracic pressure variations.
- The low-frequency envelope of the DC baseline is tracked with a secondary heavy filter ($\alpha = 0.99$).
- Positive zero-crossings determine the breath interval, converted into Breaths Per Minute (normal range: 10–24 BrPM).

### 6. Perfusion Index (PI %)
The Perfusion Index indicates pulse signal strength at the sensor site:
$$PI = \left( \frac{AC_{\text{peak-to-peak}}}{DC} \right) \times 100\%$$
Values under $0.2\%$ indicate weak peripheral perfusion or poor sensor contact.

---

## 🎛 Dashboard Controls & Features

### Toolbar Controls
- **SPEED Toggle**:
  - `0.5x` (Slow motion, displays 200 points across the canvas)
  - `1.0x` (Standard real-time speed, displays 100 points)
  - `2.0x` (High-density inspection, displays 50 points)
- **Pause / Resume (`⏸ Pause`)**:
  - Freezes the live waveform rendering without closing the serial connection.
  - Displays a visual `PAUSED` banner across all graphs for manual wave morphology inspection.
- **Connect / Disconnect**:
  - Automatically requests the Web Serial device with filter criteria.
  - Gracefully releases the reader stream lock upon disconnection.

### Telemetry Terminal & Clipboard Tools
- **📋 Copy All Logs**: Copies the complete raw text buffer collected during the session.
- **📋 Copy Last 100 Lines**: Copies the most recent 100 entries for rapid debugging.
- **🗑 Clear**: Clears the console log viewer.

---

## 🛠 Collaborator Guide: Modifying the Dashboard

1. **Changing Visual Styling**:
   All CSS variables are defined in the `:root` block at lines 7–17. You can customize the dark theme accents (`--accent`, `--card-bg`, `--cyan`, `--green`).
2. **Adding New Telemetry Parameters**:
   1. Update the regex parser inside `processTelemetryLine(line)` to extract additional tokens.
   2. Add a new metric card inside the `.grid` container.
   3. Update the DOM element binding during each parse cycle.
3. **Optimizing Canvas Performance**:
   The canvas drawing functions (`drawPPGChart`, `drawSingleRawChart`) utilize path batching (`ctx.beginPath()`, single `ctx.stroke()`) to prevent GPU draw call saturation. Always retain path batching when adding new traces.

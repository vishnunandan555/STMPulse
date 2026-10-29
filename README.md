# 🫀 STMPulseX — Biosignal & Environmental Telemetry Suite

[![MCU](https://img.shields.io/badge/MCU-STM32WB55CGUx-03234b.svg?logo=stmicroelectronics)](https://www.st.com/en/microcontrollers-microprocessors/stm32wb55cg.html)
[![Core](https://img.shields.io/badge/Architecture-ARM%20Cortex--M4%20%2B%20Cortex--M0%2B-blue.svg)](https://developer.arm.com/)
[![Sensors](https://img.shields.io/badge/Sensors-MAX30102%20%7C%20BME280-green.svg)](https://www.analog.com/en/products/max30102.html)
[![Interface](https://img.shields.io/badge/Interface-USB%20CDC%20Virtual%20COM%20%40%2025Hz-orange.svg)]()
[![Dashboard](https://img.shields.io/badge/Web%20Dashboard-Web%20Serial%20API-informational.svg)]()
[![License](https://img.shields.io/badge/License-MIT-brightgreen.svg)](LICENSE)

An open-source, medical-grade telemetry platform powered by the **STM32WB55 Wireless SoC**. **STMPulseX** continuously samples dual-wavelength photoplethysmogram (PPG) optical signals and barometric environmental data, performing onboard conditioning and streaming real-time biosignals over Full-Speed USB CDC to a zero-install Web Serial graphical suite.

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Hardware Wiring & Pinout](#-hardware-wiring--pinout)
- [Project Documentation Map](#-project-documentation-map)
- [Quick Start Guide](#-quick-start-guide)
  - [1. Building and Flashing Firmware](#1-building-and-flashing-firmware)
  - [2. Launching the Biosignal Dashboard](#2-launching-the-biosignal-dashboard)
- [Digital Signal Processing (DSP) Pipeline](#-digital-signal-processing-dsp-pipeline)
- [USB Telemetry Data Format](#-usb-telemetry-data-format)
- [Contributing & Collaborator Guidelines](#-contributing--collaborator-guidelines)
- [License](#-license)

---

## 🏛 System Architecture

```
                  ┌────────────────────────────────────────────────────────┐
                  │                      TARGET MCU                        │
                  │             STM32WB55CGUx (Cortex-M4 @ 64MHz)         │
                  └──────────────────────────┬─────────────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │ I2C1 Bus (PB6: SCL | PB7: SDA @ 100 kHz) │
                       └─────────────┬─────────────────┬───────────┘
                                     │                 │
                           ┌─────────▼────────┐  ┌─────▼────────────┐
                           │     MAX30102     │  │      BME280      │
                           │  Optical Sensor  │  │   Env Chamber    │
                           │  • Red & IR LEDs │  │  • Temperature   │
                           │  • 18-bit FIFO   │  │  • Rel. Humidity │
                           │  • Die Temp      │  │  • Bar. Pressure │
                           └──────────────────┘  └──────────────────┘
                                             │
                        ┌────────────────────▼────────────────────┐
                        │    USB 2.0 Full-Speed CDC (PA11/PA12)   │
                        │    Continuous 25 Hz Telemetry Stream    │
                        └────────────────────┬────────────────────┘
                                             │ Virtual COM Port (115200 baud)
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │      Client Browser (Web Serial API)    │
                        │             dashboard.html              │
                        ├─────────────────────────────────────────┤
                        │ • Real-time AC PPG Pulse Waveform       │
                        │ • Dual-wavelength Raw IR & Red Visuals  │
                        │ • Dynamic Peak Detection (Heart Rate)   │
                        │ • Ratio-of-Ratios SpO2 Extraction       │
                        │ • Autonomic Tone HRV (RMSSD in ms)      │
                        │ • Respiratory Sinus Arrhythmia (BrPM)   │
                        │ • Perfusion Index (PI %)                │
                        │ • Environmental Monitoring Curves       │
                        └─────────────────────────────────────────┘
```

---

## 🌟 Key Features

* **Dual-Core ARM Cortex-M4 / Cortex-M0+ SoC**: Ultra-low-power processing with hardware floating point (FPU).
* **Cooperative 25 Hz Telemetry Scheduler**: Deterministic 40 ms sampling window without dynamic allocations, ensuring uninterrupted serial throughput.
* **MAX30102 High-Sensitivity Pulse Oximetry**:
  * Real-time Red (660 nm) and Infrared (880 nm) raw photodiode data capture.
  * Non-blocking interleaved die-temperature readings for contact thermometry.
* **BME280 Environmental Fusion**:
  * 64-bit precision Bosch compensation routines for temperature ($^\circ\text{C}$), relative humidity ($\%RH$), and barometric atmospheric pressure ($\text{hPa}$).
* **Native USB CDC (Virtual COM Port)**: No external USB-to-UART bridge required. Plugs directly into any modern operating system (`usbser.sys` on Windows, `cdc_acm` on Linux, native driver on macOS).
* **Zero-Install Web Dashboard**:
  * Built on the HTML5 Web Serial API — runs directly in Google Chrome, Microsoft Edge, or Opera.
  * 60 FPS HTML5 Canvas charts with zero external runtime dependencies.
  * Play/pause controls, speed scaling (0.5x, 1x, 2x), and one-click raw log export.

---

## 🔌 Hardware Wiring & Pinout

Both the **MAX30102** and **BME280** sensors share the common hardware I2C1 bus on the STM32WB55CGUx:

| STM32WB55 Pin | Signal Name | Connected Peripheral | Peripheral Pin | Notes |
|:---|:---|:---|:---|:---|
| **PB6** | `I2C1_SCL` | MAX30102 & BME280 | `SCL` | Open-Drain, 4.7 kΩ pull-up to 3.3V |
| **PB7** | `I2C1_SDA` | MAX30102 & BME280 | `SDA` | Open-Drain, 4.7 kΩ pull-up to 3.3V |
| **PA11** | `USB_DM` | Host USB Connector | `D-` (Data Minus) | 90 Ω differential impedance |
| **PA12** | `USB_DP` | Host USB Connector | `D+` (Data Plus) | 90 Ω differential impedance |
| **3V3** | `VDD` | Sensors VCC | `VIN` / `VCC` | Clean, decoupled 3.3V supply rail |
| **GND** | `VSS` | Sensors GND | `GND` | Common ground reference |

> [!NOTE]
> Ensure the BME280 `SDO` pin is tied to GND (sets I2C address to `0x76`). The MAX30102 defaults to I2C address `0x57`.

---

## 📚 Project Documentation Map

To keep the repository modular and accessible for specialized contributors, detailed domain-specific documentation is maintained across relevant modules:

| Document | Scope & Purpose | Target Audience |
|:---|:---|:---|
| [**`README_Dashboard.md`**](README_Dashboard.md) | Web Serial interface, digital signal processing algorithms, SpO2 & HRV calculations, canvas rendering, and troubleshooting. | Frontend Developers, Data Scientists, Biomedical Engineers |
| [**`STMPulseX/Readme_Firmware.md`**](STMPulseX/Readme_Firmware.md) | Firmware architecture, clock distribution, STM32CubeIDE build steps, linker configuration, and flashing instructions. | Embedded Firmware Engineers, Systems Programmers |
| [**`STMPulseX/Core/Readme_Core.md`**](STMPulseX/Core/Readme_Core.md) | In-depth breakdown of `main.c`, I2C drivers for MAX30102 & BME280, calibration register structures, and cooperative scheduler phases. | Driver Developers, Low-Level Programmers |
| [**`STMPulseX/USB_Device/Readme_USB.md`**](STMPulseX/USB_Device/Readme_USB.md) | USB Communication Device Class (CDC) implementation, endpoint descriptors, ring buffer synchronization, and host compatibility. | USB Stack Engineers, Communications Specialists |
| [**`STMPulseX/Drivers/Readme_Hardware.md`**](STMPulseX/Drivers/Readme_Hardware.md) | Electrical characteristics, sensor specifications, optical configurations, PCB layout recommendations, and CMSIS HAL integration. | Hardware Designers, Electrical Engineers |

---

## 🚀 Quick Start Guide

### 1. Building and Flashing Firmware

1. Install **[STM32CubeIDE](https://www.st.com/en/development-tools/stm32cubeide.html)** (v1.14.0 or newer).
2. Open STM32CubeIDE and select `File` > `Open Projects from File System...`.
3. Choose the `STMPulseX` directory inside this repository.
4. Connect your **ST-LINK V2 / V3** or STM32WB55 Nucleo board to your computer.
5. Click **Project > Build All** (`Ctrl + B`).
6. Click **Run > Run** (`Ctrl + F11`) to flash the firmware onto the target.

### 2. Launching the Biosignal Dashboard

1. Connect the STM32 board to your computer via USB (using the onboard USB User connector, PA11/PA12).
2. Open [dashboard.html](dashboard.html) in any Chromium-based browser (Google Chrome, Microsoft Edge, Brave, Opera).
3. Ensure no serial terminals (e.g., PuTTY, Tera Term, Arduino Serial Monitor) are holding the COM port.
4. Click **Connect STM32** at the top right of the dashboard and select the `STMicroelectronics Virtual COM Port`.
5. Real-time PPG and environmental graphs will immediately start streaming!

---

## 🧮 Digital Signal Processing (DSP) Pipeline

The biosignal engine in `dashboard.html` executes a lightweight, real-time DSP pipeline on each incoming 25 Hz sample:

1. **Finger Detection Threshold**: Optical infrared thresholding ($IR > 15,000$) isolates ambient air noise from finger placement.
2. **DC Baseline Removal (High-Pass Filter)**:
   $$\text{Baseline}_n = \alpha \cdot \text{Baseline}_{n-1} + (1 - \alpha) \cdot IR_n \quad (\alpha = 0.96)$$
   $$AC_n = IR_n - \text{Baseline}_n$$
3. **Heart Rate Detection**: Adaptive sliding-window peak detector with dynamic refractory lockout ($300\text{ ms}$) prevents false positives caused by dicrotic notches.
4. **Oxygen Saturation ($SpO_2$)**:
   Ratio-of-ratios empirical curve fitting:
   $$R = \frac{AC_{\text{Red}} / DC_{\text{Red}}}{AC_{\text{IR}} / DC_{\text{IR}}}$$
   $$SpO_2 (\%) = 110 - 25 \times R \quad (\text{bounded to } [80, 100]\%)$$
5. **Heart Rate Variability (HRV - RMSSD)**:
   Measures parasympathetic autonomic tone from successive RR intervals:
   $$\text{RMSSD} = \sqrt{\frac{1}{N-1} \sum_{i=1}^{N-1} (RR_{i+1} - RR_i)^2}$$
6. **Perfusion Index ($PI$)**:
   $$PI = \left( \frac{AC_{\text{peak-to-peak}}}{DC} \right) \times 100\%$$
7. **Respiration Rate (BrPM)**: Extracts low-frequency baseline modulation caused by Respiratory Sinus Arrhythmia (RSA).

---

## 📡 USB Telemetry Data Format

The microcontroller streams newline-delimited ASCII strings over USB CDC at exactly 25 Hz (40 ms intervals):

```text
[#3452] ENV: 26.35 C, 48.72 %, 1012.45 hPa | PULSE: Finger=YES (RED=65420, IR=98120, CTEMP=33.50 C)
```

| Field Token | Description | Units | Source |
|:---|:---|:---|:---|
| `[#%lu]` | Monotonic sample sequence counter | Index | MCU System Tick |
| `ENV: %ld.%02ld C` | Ambient air temperature | $^\circ\text{C}$ | BME280 |
| `%ld.%02ld %` | Relative humidity | $\%RH$ | BME280 |
| `%ld.%02ld hPa` | Barometric atmospheric pressure | $\text{hPa}$ | BME280 |
| `Finger=%s` | Finger placement indicator | `YES` / `NO ` | Optical IR check ($IR > 15,000$) |
| `RED=%lu` | Red LED reflected photodiode count | Raw 18-bit ADC | MAX30102 FIFO |
| `IR=%lu` | Infrared LED reflected photodiode count | Raw 18-bit ADC | MAX30102 FIFO |
| `CTEMP=%ld.%02ld C` | Sensor die / skin surface temperature | $^\circ\text{C}$ | MAX30102 On-Die Sensor |

---

## 🤝 Contributing & Collaborator Guidelines

We welcome contributions from firmware developers, DSP researchers, UI designers, and biomedical specialists!

1. **Fork the Repository** & create your feature branch:
   ```bash
   git checkout -b feature/biometric-filter-enhancement
   ```
2. **Follow Existing Style Guides**:
   - Firmware: STMicroelectronics HAL conventions, MISRA C readability guidelines, fixed-width types (`uint32_t`, `int16_t`).
   - Web Suite: Vanilla HTML5/CSS3/ES6+, zero third-party framework overhead, strictly semantic markup.
3. **Update Domain Readmes**: When modifying drivers, core scheduler logic, or dashboard features, ensure corresponding updates are documented in the respective `Readme_<Subject>.md` file.
4. **Submit a Pull Request**: Provide a descriptive summary of your changes, hardware verification results, and any behavioral traces.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE). Embedded HAL and CMSIS files retain their respective copyright from STMicroelectronics and ARM Ltd.

# 🔬 STMPulseX: Complete Scientific, Physiological & Engineering Theory Guide

This compendium explains the exact **physics, biology, semiconductor mechanics, and mathematical algorithms** behind every single measurement and chart in the STMPulseX platform.

---

## 📑 Table of Contents
1. [The Sensor Hardware: How They Work Internally](#1-the-sensor-hardware-how-they-work-internally)
   - [MAX30102 Optical Sensor (PPG & SpO2)](#max30102-optical-sensor)
   - [BME280 Environmental Sensor (Pressure, Temp, Humidity)](#bme280-environmental-sensor)
2. [Biomedical Signal Processing: Every Measured Feature](#2-biomedical-signal-processing-every-measured-feature)
   - [Photoplethysmography (PPG Waveform)](#1-photoplethysmography-ppg-waveform)
   - [Heart Rate (BPM) & Inter-Beat Intervals](#2-heart-rate-bpm--inter-beat-intervals)
   - [Blood Oxygen Saturation (SpO₂ %)](#3-blood-oxygen-saturation-spo2-)
   - [Perfusion Index (PI %) & Signal Accuracy](#4-perfusion-index-pi--signal-accuracy)
   - [Heart Rate Variability (HRV) & Autonomic Mood/Stress](#5-heart-rate-variability-hrv--autonomic-moodstress)
   - [Respiration Rate (BrPM) via Respiratory Sinus Arrhythmia](#6-respiration-rate-brpm-via-respiratory-sinus-arrhythmia)
   - [Cardiovascular Fitness (VO₂ Max) & 5-Zone Heart Rate Training](#7-cardiovascular-fitness-vo2-max--5-zone-heart-rate-training)
   - [Differential Optical Channel (Δ = IR − Red)](#8-differential-optical-channel-δ--ir--red)
   - [Skin Temperature, Ambient Temperature & Thermal Gradient](#9-skin-temperature-ambient-temperature--thermal-gradient)
   - [Barometric Air Pressure (hPa) & Hypsometric Altitude](#10-barometric-air-pressure-hpa--hypsometric-altitude)
   - [Cuffless Estimated Blood Pressure (PWA Theory & Limitations)](#11-cuffless-estimated-blood-pressure-pwa-theory--limitations)
3. [Summary Pipeline Architecture](#3-summary-pipeline-architecture)

---

## 1. The Sensor Hardware: How They Work Internally

### MAX30102 Optical Sensor
The **MAX30102** is an integrated pulse-oximetry and heart-rate monitor module manufactured by Analog Devices (Maxim Integrated).

```
                      ┌──────────────────────────────────────────────┐
                      │              MAX30102 Module                 │
                      │                                              │
                      │  ┌────────────┐            ┌──────────────┐  │
                      │  │ Red LED    │ (660 nm)   │ Silicon PIN  │  │
                      │  │ IR LED     │ (880 nm)   │ Photodiode   │  │
                      │  └─────┬──────┘            └──────▲───────┘  │
                      └────────┼──────────────────────────┼──────────┘
                               │ Photons Emitted          │ Reflected Photons
                               ▼                          │
                       ══════════════════════════════════════════════
                                    Fingertip Tissue Bed
                           (Skin, Capillaries, Arteries, Venous)
                       ══════════════════════════════════════════════
```

#### 1. Dual-Wavelength LED Emitters
* **Red LED ($\lambda = 660\text{ nm}$)**: Visible red light.
* **Infrared LED ($\lambda = 880\text{ nm}$)**: Invisible near-infrared light.
* Both LEDs pulse alternately thousands of times per second to prevent cross-talk.

#### 2. Silicon PIN Photodiode
* Converts incoming photon energy into an electric current through the photoelectric effect.
* Protected by an integrated optical filter that attenuates 50 Hz / 60 Hz flicker from household incandescent and fluorescent room lighting.

#### 3. Delta-Sigma ADC ($18\text{-bit}$)
* Converts tiny photodiode currents into counts between $0$ and $262,143$.
* At resting state against finger tissue, the ADC registers between $50,000$ and $150,000$ counts.

#### 4. On-Chip Silicon Bandgap Thermometer
* Uses two bipolar junction transistors operated at different current densities. The difference in their base-emitter voltages ($\Delta V_{be}$) is directly proportional to absolute temperature (PTAT: *Proportional To Absolute Temperature*).
* Resolution: $0.0625^\circ\text{C}$.

---

### BME280 Environmental Sensor
The **BME280** is a combined digital barometric pressure, relative humidity, and temperature sensor manufactured by Bosch Sensortec.

```
       ┌─────────────────────────────────────────────────────────────┐
       │                       BME280 Die                            │
       │                                                             │
       │  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ │
       │  │ Piezoresistive  │ │ Capacitive      │ │ Bandgap PTAT   │ │
       │  │ Pressure Sensor │ │ Humidity Sensor │ │ Temp Sensor    │ │
       │  └────────┬────────┘ └────────┬────────┘ └───────┬────────┘ │
       │           │                   │                  │          │
       │           ▼                   ▼                  ▼          │
       │  ┌───────────────────────────────────────────────────────┐  │
       │  │       Internal Factory Calibration Math Engine        │  │
       │  │             (Trim Coefficients T1-3, P1-9, H1-6)       │  │
       │  └───────────────────────────────────────────────────────┘  │
       └─────────────────────────────────────────────────────────────┘
```

#### 1. Piezoresistive Absolute Barometric Pressure Sensor
* Consists of an etched silicon diaphragm enclosing a hermetically sealed vacuum reference chamber.
* When ambient air pressure presses on the flexible diaphragm, mechanical stress changes the electrical resistance of piezoresistive elements diffused into the silicon (piezoresistive effect).

#### 2. Capacitive Relative Humidity Sensor
* Built with a hygroscopic dielectric polymer layer sandwiched between two permeable metal electrodes.
* As water vapor molecules diffuse into the polymer film, its dielectric permittivity ($\varepsilon$) changes linearly, altering the capacitance in picofarads.

#### 3. Factory Calibration Math
* Silicon fabrication leaves slight mechanical variances. Bosch laser-trims 24 unique calibration constants into non-volatile OTP memory ($T_1-T_3, P_1-P_9, H_1-H_6$).
* The MCU firmware reads these coefficients on boot and computes compensated, temperature-corrected 32-bit floating-point outputs.

---

## 2. Biomedical Signal Processing: Every Measured Feature

### 1. Photoplethysmography (PPG Waveform)
**Photoplethysmography (PPG)** is an optical technique that measures blood volume changes in the microvascular bed of tissue.

#### The Beer-Lambert Law of Light Absorption
When monochromatic light travels through biological tissue, transmitted intensity $I$ is governed by:
$$I = I_0 \cdot e^{-\varepsilon \cdot c \cdot d}$$
* $I_0$: Incident light intensity from LED
* $\varepsilon$: Molar extinction coefficient of blood
* $c$: Concentration of hemoglobin
* $d$: Optical path length through the vessel

```
Optical Absorbance (A)
   ▲
   │    ┌──────────────────────────────────────────────┐
   │    │ AC Component: Pulsatile arterial blood surge │ ~1-3% of signal
   │  ──┴──────────────────────────────────────────────┴──
   │    │ DC Component: Non-pulsatile baseline          │
   │    │ (Venous blood, bones, muscle, skin pigment)  │ ~97-99% of signal
   │    └──────────────────────────────────────────────┘
   └──────────────────────────────────────────────────────► Time
```

#### How the Firmware and Dashboard Extract the Waveform:
1. The raw IR channel contains a large DC baseline ($\approx 70,000$ counts) and a small alternating AC cardiac pulse ($\approx 500-2,000$ counts).
2. An Exponential Moving Average (EMA) low-pass filter tracks the slow DC drift:
   $$DC_{t} = \alpha \cdot DC_{t-1} + (1 - \alpha) \cdot IR_{t} \quad (\alpha = 0.96)$$
3. The raw baseline is subtracted and inverted:
   $$AC_{t} = -(IR_{t} - DC_{t})$$
   *Inverting* is required because when the heart pumps, more blood enters the capillary bed $\rightarrow$ more light is absorbed $\rightarrow$ fewer photons hit the photodiode. By inverting, each cardiac blood pulse surges **upward** as a familiar peak.

---

### 2. Heart Rate (BPM) & Inter-Beat Intervals
Heart Rate is calculated from the time elapsed between consecutive systolic arterial pressure peaks.

#### Detection Algorithm:
1. A **3-point local extremum detector** checks if:
   $$AC[t-1] > AC[t-2] \quad \text{AND} \quad AC[t-1] > AC[t] \quad \text{AND} \quad AC[t-1] > \text{Threshold}$$
2. The exact timestamp $t_{\text{peak}}$ is captured.
3. The **Inter-Beat Interval (IBI)** is the duration between two successive peaks:
   $$\Delta t = t_{\text{peak}}[k] - t_{\text{peak}}[k-1]$$
4. **Physiological Guard Filtering**: To prevent noise artifacts, intervals outside normal human physiological limits are discarded:
   $$333\text{ ms } (180\text{ BPM}) < \Delta t < 1500\text{ ms } (40\text{ BPM})$$
5. A rolling 8-beat FIFO buffer computes the smoothed Heart Rate:
   $$\text{BPM} = \text{round}\left(\frac{60,000}{\frac{1}{8}\sum_{i=1}^{8} \Delta t_i}\right)$$

---

### 3. Blood Oxygen Saturation (SpO₂ %)
**SpO₂** represents the percentage of oxygenated hemoglobin ($HbO_2$) relative to total hemoglobin ($HbO_2 + Hb$) in the arterial blood:
$$\text{SpO}_2 = \frac{[HbO_2]}{[HbO_2] + [Hb]} \times 100\%$$

#### The Optical Secret: Hemoglobin Absorption Curves
Oxygenated and deoxygenated hemoglobin absorb Red and Infrared light very differently:

```
Extinction Coeff (ε)
   ▲
   │        /  Deoxyhemoglobin (Hb) [Absorbs MORE Red light at 660 nm]
   │       /
   │      /       Isosbestic Point (805 nm)
   │     /               \
   │    /                 \   Oxyhemoglobin (HbO2) [Absorbs MORE IR at 880 nm]
   │   /                   \________
   │  /                             \_______
   └─┴───────────────────┴──────────────────► Wavelength (λ)
    660 nm (Red)        805 nm            880 nm (IR)
```

* **At 660 nm (Red)**: Deoxygenated blood ($Hb$) absorbs **much more** light than oxygenated blood.
* **At 880 nm (Infrared)**: Oxygenated blood ($HbO_2$) absorbs **more** light than deoxygenated blood.

#### The "Ratio of Ratios" ($R$) Formula:
To make the measurement independent of finger thickness or skin color, we normalize the AC pulse by the static DC baseline for both colors:
$$R = \frac{\left(\frac{AC_{\text{Red}}}{DC_{\text{Red}}}\right)}{\left(\frac{AC_{\text{IR}}}{DC_{\text{IR}}}\right)}$$

* High oxygen saturation ($>98\%$): Little absorption at 660 nm $\rightarrow$ small $AC_{\text{Red}}$ $\rightarrow R \approx 0.4 - 0.6$.
* Low oxygen saturation ($<85\%$): Higher absorption at 660 nm $\rightarrow$ larger $AC_{\text{Red}}$ $\rightarrow R \approx 1.0 - 1.2$.

Using the empirical calibration curve calibrated for clinical pulse oximetry:
$$\text{SpO}_2 = 110 - 25 \cdot R$$

---

### 4. Perfusion Index (PI %) & Signal Accuracy
**Perfusion Index (PI)** is the ratio of the pulsatile blood flow (AC) to the non-pulsatile static tissue (DC):
$$PI = \frac{AC_{\text{IR}}}{DC_{\text{IR}}} \times 100\%$$

#### Clinical Meaning:
* **High PI ($>2.0\%$)**: Strong peripheral blood circulation, warm fingers, high vasodilation. Waveform has excellent signal-to-noise ratio.
* **Low PI ($<0.5\%$)**: Cold extremities, peripheral vasoconstriction, weak pulse, or loose sensor placement. Signal may be noisy.
* In the STMPulseX dashboard, this drives the **Sensor Accuracy Badge**:
  - $PI \ge 1.0\%$: **Good Accuracy**
  - $0.3\% \le PI < 1.0\%$: **Low Accuracy**
  - $PI < 0.3\%$: **Very Low / Cold Finger**

---

### 5. Heart Rate Variability (HRV) & Autonomic Mood/Stress
While Heart Rate is an average, the human heart never beats like a metronome. A healthy heart constantly speeds up during inhalation and slows down during exhalation. This beat-to-beat variability is called **Heart Rate Variability (HRV)**.

#### The Autonomic Nervous System (ANS):
* **Sympathetic Nervous System (Fight or Flight)**: Releases adrenaline, increases heart rate, and makes beat intervals **rigid and uniform** (Low HRV).
* **Parasympathetic Nervous System (Rest and Digest / Vagus Nerve)**: Releases acetylcholine, slows heart rate, and introduces **healthy elasticity and variability** (High HRV).

#### The Mathematical Metric: RMSSD
The gold standard clinical time-domain measure of parasympathetic vagal tone is **RMSSD** (*Root Mean Square of Successive Differences*):
$$\text{RMSSD} = \sqrt{\frac{1}{N - 1} \sum_{i=1}^{N - 1} (\Delta t_{i+1} - \Delta t_{i})^2}$$

Where $\Delta t_i$ is the $i$-th Inter-Beat Interval in milliseconds.

#### STMPulseX Mood & Stress Mapping:
* **$\text{RMSSD} \ge 55\text{ ms}$**: **Very Relaxed** (Strong vagal tone, parasympathetic dominance).
* **$35\text{ ms} \le \text{RMSSD} < 55\text{ ms}$**: **Balanced** (Normal alert state).
* **$20\text{ ms} \le \text{RMSSD} < 35\text{ ms}$**: **Mild Stress** (Elevated sympathetic activity).
* **$\text{RMSSD} < 20\text{ ms}$**: **High Stress / Exhaustion** (Rigid heart cadence, high physiological stress).

---

### 6. Respiration Rate (BrPM) via Respiratory Sinus Arrhythmia
How can an oximeter on your finger know when you are breathing in or out without a chest strap?

Through **Respiratory Sinus Arrhythmia (RSA)** and **Thoracic Pressure Modulation**:
1. When you **inhale**:
   - Diaphragm contracts $\rightarrow$ thoracic cavity volume increases $\rightarrow$ intrathoracic pressure drops.
   - Venous blood returns more rapidly to the heart $\rightarrow$ heart rate temporarily accelerates $\rightarrow$ peripheral arterial baseline dips slightly.
2. When you **exhale**:
   - Diaphragm relaxes $\rightarrow$ intrathoracic pressure increases $\rightarrow$ heart rate decelerates $\rightarrow$ arterial baseline rises.

```
Raw PPG Signal (Cardiac Beats + Slow Breath Envelope)
    /\    /\    /\        /\    /\    /\
   /  \  /  \  /  \      /  \  /  \  /  \
──/────\/────\/────\────/────\/────\/────\──  ◄── Cardiac Pulses (1.2 Hz)
 ╲                  ╱  ╲                  ╱
  ╲                ╱    ╲                ╱    ◄── Slow Breath Wave (0.25 Hz)
   ════════════════      ════════════════
       INHALATION            EXHALATION
```

#### The DSP Filter Pipeline:
1. **Cardiac Suppression (Stage 1 Boxcar Filter)**: A 25-sample moving average filter ($1.0\text{ second at 25 Hz}$) smooths away the rapid 1.2 Hz heartbeats.
2. **Slow DC Baseline Extraction (Stage 2 Filter)**: A 120-sample moving average filter ($4.8\text{ seconds}$) captures the very slow postural drift.
3. **Respiration AC Envelope**:
   $$\text{RespAC} = \text{Stage1} - \text{Stage2}$$
4. **Adaptive Hysteresis Transition Detection**:
   When $\text{RespAC} > +18\text{ counts}$, the user is **Inhaling** ($\text{Phase} = +1$).
   When $\text{RespAC} < -18\text{ counts}$, the user is **Exhaling** ($\text{Phase} = -1$).
   A completed cycle from Exhale $\rightarrow$ Inhale calculates the duration in milliseconds, converting to **Breaths Per Minute (BrPM)**:
   $$\text{BrPM} = \frac{60,000}{\text{Duration}_{\text{cycle}}\text{ (ms)}}$$

---

### 7. Cardiovascular Fitness (VO₂ Max) & 5-Zone Heart Rate Training

#### VO₂ Max Estimation
$\text{VO}_2\text{ Max}$ (Maximum Oxygen Uptake) is the maximum rate of oxygen the body can consume during exhaustive exercise, measured in $\text{mL/kg/min}$.

Using the clinically validated **Uth–Sørensen–Overgaard–Pedersen formula**:
$$\text{VO}_2\text{ Max} \approx 15.3 \times \frac{\text{HR}_{\text{max}}}{\text{HR}_{\text{rest}}}$$
* $\text{HR}_{\text{max}} = 208 - (0.7 \times \text{Age})$ (Tanaka standard formula)
* $\text{HR}_{\text{rest}}$ is continuously averaged from the user's lowest resting heart rate samples.

#### The 5 Cardiovascular Training Zones:
* **Zone 1: Active Recovery ($<60\% \text{ HR}_{\text{max}}$)**: Stimulates lymphatic flow, metabolic recovery.
* **Zone 2: Aerobic Endurance ($60\% - 70\% \text{ HR}_{\text{max}}$)**: Maximum fat oxidation, builds mitochondrial density.
* **Zone 3: Tempo / Aerobic Power ($70\% - 80\% \text{ HR}_{\text{max}}$)**: Improves blood capillary volume and glycogen storage.
* **Zone 4: Anaerobic Lactate Threshold ($80\% - 90\% \text{ HR}_{\text{max}}$)**: Elevates the threshold before lactic acid accumulates.
* **Zone 5: Neuromuscular / VO₂ Max Peak ($>90\% \text{ HR}_{\text{max}}$)**: Maximum cardiovascular output and sprinting power.

---

### 8. Differential Optical Channel ($\Delta = \text{IR} - \text{Red}$)
The third graph in the **Raw Optics & PI Lab** displays:
$$\Delta(t) = \text{IR}_{\text{ADC}}(t) - \text{Red}_{\text{ADC}}(t)$$

#### Scientific Purpose:
* In healthy tissue with high oxygenation ($HbO_2$), infrared light passes through with much higher transmission than red light.
* Therefore, the baseline difference $\Delta$ is positive ($\approx +15,000$ to $+30,000$ counts).
* During each arterial pulse surge, the differential amplitude oscillates in direct proportion to the volume of oxygenated blood surging into the capillaries.
* Observing $\Delta(t)$ provides researchers and engineers with a direct view of differential absorption without software filtering.

---

### 9. Skin Temperature, Ambient Temperature & Thermal Gradient

#### 1. Core vs. Peripheral Thermal Gradient
* **Ambient Air Temperature ($T_{\text{air}}$)**: Measured by the BME280 sensor.
* **Skin/Sensor Contact Temperature ($T_{\text{skin}}$)**: Measured by the MAX30102 on-die thermal sensor.
* **Thermal Gradient**:
  $$\Delta T = T_{\text{skin}} - T_{\text{air}}$$

#### Physiology of Vasodilation & Thermal Regulation:
* When the human body is warm and relaxed, the sympathetic nervous system triggers **peripheral vasodilation** (opening capillary sphincters in the fingertips). Warm core blood flows into the extremities, raising skin temperature to $32^\circ\text{C} - 35^\circ\text{C}$ ($\Delta T \gg 0$).
* During stress, fear, or cold exposure, the body activates **peripheral vasoconstriction** to preserve core heat, causing fingertip temperature to drop closer to room temperature.

---

### 10. Barometric Air Pressure (hPa) & Hypsometric Altitude
The BME280 reads ambient atmospheric pressure in **hectopascals (hPa)** (where $1\text{ hPa} = 1\text{ millibar} = 100\text{ Pascals}$).

#### 1. The Physics of Air Pressure
Air has weight. The barometric pressure at any location is the cumulative weight of the air column extending from that altitude up to outer space.
* Standard Sea Level Pressure: $P_0 = 1013.25\text{ hPa}$.
* As you go higher up a mountain or higher in elevation, there is less air above you, so pressure decreases exponentially.

#### 2. The International Hypsometric Formula:
Altitude $h$ (in meters) is calculated directly from barometric pressure $P$:
$$h = 44330 \times \left(1 - \left(\frac{P}{P_0}\right)^{\frac{1}{5.255}}\right)$$

* A reading of **$960\text{ hPa}$** indicates an altitude of approximately **$450 - 470\text{ meters}$** above sea level.

---

### 11. Cuffless Estimated Blood Pressure (PWA Theory & Limitations)

#### Why It Is an "Inaccurate" Estimate:
Blood pressure is physically defined as the lateral fluid force exerted by circulating blood against the walls of major arteries:
* **Systolic Blood Pressure (SBP)**: Peak arterial pressure during left ventricular contraction.
* **Diastolic Blood Pressure (DBP)**: Lowest arterial pressure during ventricular relaxation.

**Standard medical cuffs** measure pressure by physically applying external pneumatic pressure until arterial blood flow stops (occlusion), then slowly deflating and listening to Korotkoff sounds.

#### How Optical Pulse Wave Analysis (PWA) Approximates It:
The STMPulseX dashboard uses an empirical model combining three optical proxies:
1. **Cardiac Chronotropy (Heart Rate)**: Higher heart rate reduces arterial runoff time, elevating baseline systolic pressure.
2. **Vascular Resistance (Perfusion Index)**: Lower peripheral perfusion correlates with elevated systemic vascular resistance (SVR), nudging diastolic pressure upward.
3. **Pulse Contour**:
   $$\text{SBP}_{\text{est}} = 116 + (\text{HR} - 72) \times 0.42 - (PI - 2.0) \times 1.5$$
   $$\text{DBP}_{\text{est}} = 75 + (\text{HR} - 72) \times 0.22 - (PI - 2.0) \times 1.0$$

#### Why It Is Labeled `INACCURATE`:
Without calibrating against an inflatable cuff for your personal arterial stiffness, this estimate reflects general statistical trends rather than diagnostic medical values.

---

## 3. Summary Pipeline Architecture

```
  ┌─────────────────────────────────────────────────────────────┐
  │                 STM32WB55CGU6 (Hardware)                    │
  │  MAX30102 (Red/IR/Temp)  +  BME280 (Temp/Press/Humidity)   │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ 25 Hz ASCII Telemetry Stream (COM3)
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │               WebSerial Engine (Browser app.js)             │
  │   TextDecoderStream ──► Regex Telemetry Parser (25 Packets/s)│
  └──────────────────────────────┬──────────────────────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│        dsp.js Processing      │       │     charts.js Rendering       │
│ • DC Baseline Tracking        │       │ • HiDPI 60 FPS Canvas Redraw  │
│ • Peak Detection (IBI, BPM)   │       │ • PPG Waveform & Pulse Surge  │
│ • SpO2 Ratio of Ratios (R)    │       │ • Thoracic Respiration Curve  │
│ • Perfusion Index (PI %)      │       │ • Raw IR, Red & Delta Graphs  │
│ • HRV RMSSD Stress Modeling   │       │ • 60-Second Trend Lines       │
│ • 2-Stage Breath Envelope     │       │ • SpO2 & VO2 Max Interactive  │
│ • PWA Blood Pressure Proxy    │       │ • Responsive Dynamic Grid     │
└───────────────────────────────┘       └───────────────────────────────┘
```

// Digital Signal Processing (DSP) & Biometric Metrics Engine
const MAX_BUFFER = 300;
const waveform = new Array(MAX_BUFFER).fill(0);
const rawIRHistory = new Array(MAX_BUFFER).fill(0);
const rawRedHistory = new Array(MAX_BUFFER).fill(0);
const rawDiffHistory = new Array(MAX_BUFFER).fill(0);
const respWaveform = new Array(MAX_BUFFER).fill(0);

// MPU6050 Accelerometer & Sleep Actigraphy History
const accelXHistory = new Array(MAX_BUFFER).fill(0);
const accelYHistory = new Array(MAX_BUFFER).fill(0);
const accelZHistory = new Array(MAX_BUFFER).fill(1000);
const motionHistory = new Array(MAX_BUFFER).fill(0);

let currentSleepState = 'Restful Sleep';
let currentSleepPosture = 'Supine (Back)';
let sleepMotionEvents = 0;
let lastMotionEventTime = 0;
let restfulSamples = 0;
let totalSleepSamples = 0;
let currentTMP117Temp = null;
let lastAx = 0, lastAy = 0, lastAz = 1000, lastMot = 0;

// DC baseline tracker for AC pulse extraction
let dcTracker = 0;
const filterAlpha = 0.96;

// Cardiac peak & HRV tracking
let lastPeakTime = 0;
const peakIntervals = []; // Inter-Beat Intervals (ms)
let rollingSpO2 = null;
let rollingSystolic = null;
let rollingDiastolic = null;

// Respiration DSP Engine (Smooth Cardiac Suppression Boxcar + Dynamic EMA Baseline Removal)
const RESP_FILTER_LEN = 15; // ~0.6s at 25 Hz to eliminate cardiac pulse ripples while preserving thoracic wave
const respFilterWindow = [];
let respBaseline = 0;
const respACWindow = [];
let lastBreathTime = 0;
const breathIntervals = [];
let breathPhase = 0; // -1: Exhale, 1: Inhale

function processTelemetry(ir, red, isFinger, ctemp) {
  // 1 Hz sample recorder for 60-second Trend chart and CSV export
  const nowMs = performance.now();
  if (nowMs - lastTrendTime >= 1000) {
    lastTrendTime = nowMs;
    const b = parseInt(document.getElementById('valBPM').textContent, 10);
    const s = parseInt(document.getElementById('valSpO2').textContent, 10);
    trendBPM.shift();
    trendBPM.push(isNaN(b) ? null : b);
    trendSpO2.shift();
    trendSpO2.push(isNaN(s) ? null : s);

    // Record CSV snapshot
    const valPI = document.getElementById('valPI');
    const valHRV = document.getElementById('valHRV');
    const valResp = document.getElementById('valResp');
    const valSkinTemp = document.getElementById('valSkinTemp');
    const valTemp = document.getElementById('valTemp');
    const subHum = document.getElementById('subHum');
    const valPress = document.getElementById('valPress');

    sessionRecords.push({
      iso: new Date().toISOString(),
      tMs: Math.round(performance.now() - sessionStartTime),
      bpm: isNaN(b) ? '' : b,
      spo2: isNaN(s) ? '' : s,
      bp: rollingSystolic ? (Math.round(rollingSystolic) + '/' + Math.round(rollingDiastolic)) : '',
      pi: valPI && valPI.textContent !== '--' ? valPI.textContent : '',
      hrv: valHRV && valHRV.textContent !== '--' ? valHRV.textContent : '',
      resp: valResp && valResp.textContent !== '--' ? valResp.textContent : '',
      skinTemp: valSkinTemp && valSkinTemp.textContent !== '--' ? valSkinTemp.textContent : '',
      envTemp: valTemp && valTemp.textContent !== '--' ? valTemp.textContent : '',
      tmp117Temp: currentTMP117Temp !== null ? currentTMP117Temp.toFixed(2) : '',
      hum: subHum ? subHum.textContent.replace(/[^\d.]/g, '') : '',
      press: valPress && valPress.textContent !== '--' ? valPress.textContent : '',
      ax: lastAx,
      ay: lastAy,
      az: lastAz,
      mot: lastMot,
      sleepState: currentSleepState,
      posture: currentSleepPosture
    });
    if (sessionRecords.length > 7200) sessionRecords.shift(); // ~2 hours max in memory
  }

  // Advance raw history buffers
  rawIRHistory.shift();
  rawIRHistory.push(ir);
  rawRedHistory.shift();
  rawRedHistory.push(red);
  rawDiffHistory.shift();
  rawDiffHistory.push(ir - red);

  const valBPM = document.getElementById('valBPM');
  const subBPM = document.getElementById('subBPM');
  const valSpO2 = document.getElementById('valSpO2');
  const subSpO2 = document.getElementById('subSpO2');
  const valPI = document.getElementById('valPI');
  const subPI = document.getElementById('subPI');
  const valHRV = document.getElementById('valHRV');
  const subHRV = document.getElementById('subHRV');
  const valResp = document.getElementById('valResp');
  const subResp = document.getElementById('subResp');
  const breathBar = document.getElementById('breathBar');
  const spo2Badge = document.getElementById('spo2Badge');
  const spo2Needle = document.getElementById('spo2Needle');
  const vo2Badge = document.getElementById('vo2Badge');
  const zoneBoxes = [
    document.getElementById('zoneBox1'),
    document.getElementById('zoneBox2'),
    document.getElementById('zoneBox3'),
    document.getElementById('zoneBox4'),
    document.getElementById('zoneBox5')
  ];

  if (!isFinger || ir < 15000) {
    if (valBPM) valBPM.textContent = '--';
    if (subBPM) subBPM.textContent = 'No finger';
    if (valSpO2) valSpO2.textContent = '--';
    if (subSpO2) subSpO2.textContent = 'Normal: 95-100%';
    if (valPI) valPI.textContent = '--';
    if (subPI) subPI.innerHTML = 'Accuracy: <span style="color: #8b949e;">--</span>';
    if (valHRV) valHRV.textContent = '--';
    if (subHRV) subHRV.innerHTML = 'Mood: <span style="color: #8b949e;">--</span>';
    if (valResp) valResp.textContent = '--';
    if (subResp) subResp.textContent = 'Ready to detect';
    if (breathBar) breathBar.style.width = '50%';
    rollingSpO2 = null;
    dcTracker = ir;

    // Reset respiration DSP memory
    respBaseline = 0;
    respFilterWindow.length = 0;
    respACWindow.length = 0;
    breathIntervals.length = 0;
    breathPhase = 0;
    lastBreathTime = 0;

    if (spo2Badge) {
      spo2Badge.textContent = 'Awaiting Finger';
      spo2Badge.style.color = 'var(--accent)';
      spo2Badge.style.borderColor = 'rgba(88, 166, 255, 0.3)';
    }
    if (spo2Needle) spo2Needle.style.left = '50%';
    const spo2Desc = document.getElementById('spo2Desc');
    if (spo2Desc) spo2Desc.textContent = 'Measures arterial blood oxygen saturation (HbO₂). Normal healthy resting range is 95% to 100%.';
    const zoneDesc = document.getElementById('zoneDesc');
    if (zoneDesc) zoneDesc.textContent = 'Cardiovascular exertion tracking. Zones dynamically highlight according to real-time BPM.';
    if (vo2Badge) vo2Badge.textContent = 'VO₂ Max: -- mL/kg/min';
    rollingSystolic = null;
    rollingDiastolic = null;
    const valBP = document.getElementById('valBP');
    if (valBP) valBP.textContent = '-- / --';
    const subBP = document.getElementById('subBP');
    if (subBP) subBP.innerHTML = '<span style="color: #f85149; font-weight: 700;">*Inaccurate</span> (Optical Est.)';
    const labSystolic = document.getElementById('labSystolic');
    if (labSystolic) labSystolic.textContent = '--';
    const labDiastolic = document.getElementById('labDiastolic');
    if (labDiastolic) labDiastolic.textContent = '--';
    const labBPClass = document.getElementById('labBPClass');
    if (labBPClass) labBPClass.textContent = '--';
    const labBPStatus = document.getElementById('labBPStatus');
    if (labBPStatus) labBPStatus.textContent = 'Awaiting finger';
    zoneBoxes.forEach(b => { if (b) b.classList.remove('active'); });

    waveform.shift();
    waveform.push(0);
    respWaveform.shift();
    respWaveform.push(0);
    return;
  }

  // Initialize DC baseline tracker
  if (dcTracker === 0 || Math.abs(ir - dcTracker) > 40000) {
    dcTracker = ir;
  } else {
    dcTracker = (filterAlpha * dcTracker) + ((1 - filterAlpha) * ir);
  }

  // AC pulse extraction: Invert so blood pulse surge bumps upward
  const ac = -(ir - dcTracker);
  waveform.shift();
  waveform.push(ac);

  // 1. Peak Detection & BPM
  const now = performance.now();
  const n = waveform.length;
  if (n > 5 && waveform[n-3] > 80) {
    if (waveform[n-3] > waveform[n-4] && waveform[n-3] > waveform[n-2]) {
      if (lastPeakTime > 0) {
        const deltaMs = now - lastPeakTime;
        // Valid human HR between 40 BPM (1500ms) and 180 BPM (333ms)
        if (deltaMs > 330 && deltaMs < 1500) {
          const bpm = Math.round(60000 / deltaMs);
          peakIntervals.push(deltaMs);
          if (peakIntervals.length > 8) peakIntervals.shift();

          const avgInterval = peakIntervals.reduce((a, b) => a + b) / peakIntervals.length;
          const currentBPM = Math.round(60000 / avgInterval);
          if (valBPM) valBPM.textContent = currentBPM;
          if (subBPM) subBPM.textContent = `IBI: ${Math.round(deltaMs)} ms`;

          totalBeats++;
          sessionHR.push(currentBPM);
          if (sessionHR.length > 500) sessionHR.shift();
          playPulseBeep(rollingSpO2);
          if (typeof triggerHeartbeatVisual === "function") triggerHeartbeatVisual();

          // Update VO2 Max & 5-Zone Model
          updateVO2AndZones(currentBPM);
          updateEstimatedBP(currentBPM, typeof pi !== 'undefined' ? pi : 2.0);

          // 2. HRV (RMSSD in ms) Calculation -> Mood & Stress
          if (peakIntervals.length >= 4) {
            let sumSqDiff = 0;
            for (let i = 0; i < peakIntervals.length - 1; i++) {
              const diff = peakIntervals[i+1] - peakIntervals[i];
              sumSqDiff += diff * diff;
            }
            const rmssd = Math.round(Math.sqrt(sumSqDiff / (peakIntervals.length - 1)));
            if (valHRV) valHRV.textContent = rmssd;
            if (subHRV) {
              if (rmssd >= 55) {
                subHRV.innerHTML = 'Mood: <span style="color: #3fb950; font-weight: 700;">Very Relaxed</span>';
                if (valHRV) valHRV.style.color = '#3fb950';
              } else if (rmssd >= 35) {
                subHRV.innerHTML = 'Mood: <span style="color: var(--purple); font-weight: 700;">Balanced</span>';
                if (valHRV) valHRV.style.color = 'var(--purple)';
              } else if (rmssd >= 20) {
                subHRV.innerHTML = 'Mood: <span style="color: #d29922; font-weight: 700;">Mild Stress</span>';
                if (valHRV) valHRV.style.color = '#d29922';
              } else {
                subHRV.innerHTML = 'Mood: <span style="color: #f85149; font-weight: 700;">High Stress</span>';
                if (valHRV) valHRV.style.color = '#f85149';
              }
            }
          }
        }
      }
      lastPeakTime = now;
    }
  }

  // 3. SpO2 & Perfusion Index (PI %) Calculation over last 50 samples (~2 seconds)
  const windowLen = 50;
  let minIR = Infinity, maxIR = -Infinity, sumIR = 0;
  let minRed = Infinity, maxRed = -Infinity, sumRed = 0;

  for (let i = MAX_BUFFER - windowLen; i < MAX_BUFFER; i++) {
    const vIR = rawIRHistory[i];
    const vRed = rawRedHistory[i];
    if (vIR < minIR) minIR = vIR;
    if (vIR > maxIR) maxIR = vIR;
    sumIR += vIR;

    if (vRed < minRed) minRed = vRed;
    if (vRed > maxRed) maxRed = vRed;
    sumRed += vRed;
  }

  const acIR = maxIR - minIR;
  const dcIR = sumIR / windowLen;
  const acRed = maxRed - minRed;
  const dcRed = sumRed / windowLen;

  if (acIR > 200 && dcIR > 15000 && acRed > 100 && dcRed > 10000) {
    // Perfusion Index & Live Sensor Accuracy
    const pi = (acIR / dcIR) * 100;
    if (valPI) valPI.textContent = pi.toFixed(2);
    
    let accLevel = 'Good';
    let accColor = '#3fb950';

    if (pi < 0.3) {
      accLevel = 'Very Low';
      accColor = '#f85149';
    } else if (pi < 0.7) {
      accLevel = 'Low';
      accColor = '#f0883e';
    } else if (pi < 1.5) {
      accLevel = 'Good';
      accColor = '#d29922';
    } else if (pi < 3.0) {
      accLevel = 'Very Good';
      accColor = '#3fb950';
    } else {
      accLevel = 'Excellent';
      accColor = 'var(--cyan)';
    }

    if (subPI) subPI.innerHTML = `Accuracy: <span style="color: ${accColor}; font-weight: 700;">${accLevel}</span>`;

    // Ratio of Ratios for SpO2
    const R = (acRed / dcRed) / (acIR / dcIR);
    let spo2 = 110 - (25 * R);
    if (spo2 > 100) spo2 = 99.5;
    if (spo2 < 75) spo2 = 75;

    if (rollingSpO2 === null) rollingSpO2 = spo2;
    else rollingSpO2 = (0.85 * rollingSpO2) + (0.15 * spo2);

    const roundedSpO2 = Math.round(rollingSpO2);
    if (valSpO2) valSpO2.textContent = roundedSpO2;
    sessionSpO2.push(roundedSpO2);
    if (sessionSpO2.length > 500) sessionSpO2.shift();

    updateSpO2Gauge(roundedSpO2);
  }

  // 4. Clinical Respiration Waveform & Rate Detection Engine
  if (respFilterWindow.length === 0) {
    // Immediate pre-fill on finger contact to avoid any startup dead-time
    for (let i = 0; i < RESP_FILTER_LEN; i++) respFilterWindow.push(ir);
    respBaseline = ir;
  } else {
    respFilterWindow.push(ir);
    if (respFilterWindow.length > RESP_FILTER_LEN) respFilterWindow.shift();
  }

  // Fast moving average to strip away cardiac pulse ripples
  const respSmooth = respFilterWindow.reduce((a, b) => a + b, 0) / respFilterWindow.length;

  // Track slow physiological DC baseline via non-lagging EMA (tau ~ 3.3s)
  if (respBaseline === 0) {
    respBaseline = respSmooth;
  } else {
    respBaseline = (0.988 * respBaseline) + (0.012 * respSmooth);
  }

  // Pure Thoracic AC Respiration Waveform (centered exactly at 0)
  const respAC = respSmooth - respBaseline;
  respWaveform.shift();
  respWaveform.push(respAC);

  // Track rolling amplitude of respiration for adaptive normalization
  respACWindow.push(respAC);
  if (respACWindow.length > 75) respACWindow.shift(); // ~3.0 seconds

  let minAC = Infinity, maxAC = -Infinity;
  for (let i = 0; i < respACWindow.length; i++) {
    if (respACWindow[i] < minAC) minAC = respACWindow[i];
    if (respACWindow[i] > maxAC) maxAC = respACWindow[i];
  }
  const acSpan = Math.max(16, maxAC - minAC);
  const halfSpan = acSpan / 2;

  // Live Breathing Expansion Bar (smoothly adapts to any shallow or deep breathing depth)
  if (breathBar) {
    const breathPct = Math.max(5, Math.min(95, Math.round(50 + (respAC / halfSpan) * 45)));
    breathBar.style.width = breathPct + '%';
  }

  // Adaptive hysteresis threshold (25% of current breathing amplitude, floor 8 counts)
  const HYST = Math.max(8, acSpan * 0.25);
  let newPhase = breathPhase;

  if (respAC > HYST) {
    newPhase = 1; // Inhaling
    if (subResp) subResp.textContent = String.fromCodePoint(0x1F32C) + ' Inhaling...';
  } else if (respAC < -HYST) {
    newPhase = -1; // Exhaling
    if (subResp) subResp.textContent = String.fromCodePoint(0x1F4A8) + ' Exhaling...';
  } else {
    if (lastBreathTime > 0 && (now - lastBreathTime > 4500)) {
      if (subResp) subResp.textContent = 'Holding breath / Steady';
    }
  }

  // Detect full breath cycle transition from Exhale (-1) to Inhale (1)
  if (breathPhase === -1 && newPhase === 1) {
    if (lastBreathTime > 0) {
      const breathDurationMs = now - lastBreathTime;
      // Covers rapid panting (1.3s / 46 BrPM) to slow meditative breathing (16.0s / 3.75 BrPM)
      if (breathDurationMs >= 1300 && breathDurationMs <= 16000) {
        breathIntervals.push(breathDurationMs);
        if (breathIntervals.length > 4) breathIntervals.shift();

        const avgBreathMs = breathIntervals.reduce((a, b) => a + b, 0) / breathIntervals.length;
        const brpm = Math.round(60000 / avgBreathMs);
        if (valResp) valResp.textContent = brpm;
        totalBreaths++;
      }
    }
    lastBreathTime = now;
  }

  breathPhase = newPhase;

  // Display apnea warning if breath held > 16.5s
  if (lastBreathTime > 0 && (now - lastBreathTime > 16500)) {
    if (valResp) valResp.textContent = '--';
    if (subResp) subResp.textContent = 'Breath Held / Apnea (>16s)';
  }
}

function updateSpO2Gauge(spo2) {
  if (!spo2 || spo2 <= 0) return;
  const spo2Needle = document.getElementById('spo2Needle');
  const valSpO2 = document.getElementById('valSpO2');
  const subSpO2 = document.getElementById('subSpO2');
  const spo2Badge = document.getElementById('spo2Badge');
  const spo2Desc = document.getElementById('spo2Desc');

  if (spo2Needle) {
    const pct = Math.max(0, Math.min(100, ((spo2 - 70) / 30) * 100));
    spo2Needle.style.left = pct + '%';
  }

  if (spo2 >= 95) {
    if (valSpO2) valSpO2.style.color = '#3fb950';
    if (subSpO2) subSpO2.textContent = 'Optimal Oxygen';
    if (spo2Badge) {
      spo2Badge.textContent = 'Optimal (' + spo2 + '%)';
      spo2Badge.style.color = '#3fb950';
      spo2Badge.style.borderColor = '#2ea043';
    }
    if (spo2Desc) spo2Desc.textContent = 'Optimal healthy arterial saturation. Normal tissue cellular oxygenation.';
  } else if (spo2 >= 91) {
    if (valSpO2) valSpO2.style.color = '#d29922';
    if (subSpO2) subSpO2.textContent = 'Borderline Low';
    if (spo2Badge) {
      spo2Badge.textContent = 'Mild Hypoxia (' + spo2 + '%)';
      spo2Badge.style.color = '#d29922';
      spo2Badge.style.borderColor = '#d29922';
    }
    if (spo2Desc) spo2Desc.textContent = 'Acceptable for high altitude or exertion, but slightly below normal baseline.';
  } else if (spo2 >= 86) {
    if (valSpO2) valSpO2.style.color = '#f0883e';
    if (subSpO2) subSpO2.textContent = 'Moderate Hypoxia';
    if (spo2Badge) {
      spo2Badge.textContent = 'Moderate Hypoxia (' + spo2 + '%)';
      spo2Badge.style.color = '#f0883e';
      spo2Badge.style.borderColor = '#f0883e';
    }
    if (spo2Desc) spo2Desc.textContent = 'Supplemental oxygen recommended. Signs of respiratory strain or shallow breathing.';
  } else {
    if (valSpO2) valSpO2.style.color = '#f85149';
    if (subSpO2) subSpO2.textContent = 'Severe Hypoxia!';
    if (spo2Badge) {
      spo2Badge.textContent = 'Severe Hypoxia (<86%)';
      spo2Badge.style.color = '#f85149';
      spo2Badge.style.borderColor = '#da3633';
    }
    if (spo2Desc) spo2Desc.textContent = 'Critical clinical desaturation event! Immediate medical evaluation required.';
  }
}

function updateVO2AndZones(bpm) {
  const vo2Badge = document.getElementById('vo2Badge');
  const zoneDesc = document.getElementById('zoneDesc');
  const zoneBoxes = [
    document.getElementById('zoneBox1'),
    document.getElementById('zoneBox2'),
    document.getElementById('zoneBox3'),
    document.getElementById('zoneBox4'),
    document.getElementById('zoneBox5')
  ];

  // Resting HR estimation: minimum HR in session
  const minHR = sessionHR.length > 5 ? Math.min(...sessionHR) : bpm;
  const maxHR = 190; // Standard 220 - Age (approx 30 yr developer)
  const hrReserveRatio = Math.max(1.2, maxHR / Math.max(45, minHR));
  const estimatedVO2Max = Math.round(15.3 * hrReserveRatio);

  if (vo2Badge) {
    vo2Badge.textContent = `VO₂ Max: ~${estimatedVO2Max} mL/kg/min`;
  }

  zoneBoxes.forEach(b => { if (b) b.classList.remove('active'); });

  if (bpm < 114) {
    if (zoneBoxes[0]) zoneBoxes[0].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 1 (Active Recovery): Enhances lipid metabolism and active parasympathetic tone.';
  } else if (bpm <= 133) {
    if (zoneBoxes[1]) zoneBoxes[1].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 2 (Aerobic Base): Fat oxidation, mitochondrial density development, all-day stamina.';
  } else if (bpm <= 152) {
    if (zoneBoxes[2]) zoneBoxes[2].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 3 (Tempo / Aerobic Power): Enhances stroke volume and cardiac muscle efficiency.';
  } else if (bpm <= 171) {
    if (zoneBoxes[3]) zoneBoxes[3].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 4 (Lactate Threshold): High intensity, anaerobic threshold training, rapid lactate accumulation.';
  } else {
    if (zoneBoxes[4]) zoneBoxes[4].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 5 (Neuromuscular Peak): Maximum cardiovascular output and respiratory exchange ratio (RER > 1.0).';
  }
}

/**
 * MPU6050 Accelerometer & Sleep Actigraphy Telemetry Processor
 */
function processIMUTelemetry(ax, ay, az, mot) {
  lastAx = ax;
  lastAy = ay;
  lastAz = az;
  lastMot = mot;

  accelXHistory.shift();
  accelXHistory.push(ax);
  accelYHistory.shift();
  accelYHistory.push(ay);
  accelZHistory.shift();
  accelZHistory.push(az);
  motionHistory.shift();
  motionHistory.push(mot);

  totalSleepSamples++;

  // Sleep State Estimation based on clinical actigraphy thresholds
  let state = 'Restful Sleep';
  let badgeClass = 'sleep-restful';
  if (mot >= 150) {
    state = 'Restless / Movement';
    badgeClass = 'sleep-restless';
    const now = performance.now();
    if (now - lastMotionEventTime > 2500) {
      sleepMotionEvents++;
      lastMotionEventTime = now;
    }
  } else if (mot >= 40) {
    state = 'Light / Active Sleep';
    badgeClass = 'sleep-light';
  } else {
    restfulSamples++;
  }
  currentSleepState = state;

  // Sleep Posture Detection from gravity vector
  let posture = 'Supine (Back)';
  if (az < -450) {
    posture = 'Prone (Stomach)';
  } else if (ax > 450) {
    posture = 'Left Lateral (Side)';
  } else if (ax < -450) {
    posture = 'Right Lateral (Side)';
  } else if (ay < -550) {
    posture = 'Upright / Elevated';
  } else if (az > 450) {
    posture = 'Supine (Back)';
  }
  currentSleepPosture = posture;

  // Update UI Elements
  const valSleepState = document.getElementById('valSleepState');
  if (valSleepState) {
    valSleepState.textContent = state;
    valSleepState.className = `value ${badgeClass}`;
  }

    const valSleepPosture = document.getElementById('valSleepPosture');
  if (valSleepPosture) valSleepPosture.textContent = posture;

  const valMotionIdx = document.getElementById('valMotionIdx');
  if (valMotionIdx) valMotionIdx.textContent = `${mot} mg`;

  // Dynamic Orientation Angles (Roll, Pitch, Total Magnitude)
  const rollDeg = Math.round(Math.atan2(ay, az) * 180 / Math.PI);
  const pitchDeg = Math.round(Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * 180 / Math.PI);
  const gMag = (Math.sqrt(ax * ax + ay * ay + az * az) / 1000).toFixed(2);

  const postureRollVal = document.getElementById('postureRollVal');
  if (postureRollVal) postureRollVal.textContent = `${rollDeg}°`;
  const posturePitchVal = document.getElementById('posturePitchVal');
  if (posturePitchVal) posturePitchVal.textContent = `${pitchDeg}°`;
  const postureGMag = document.getElementById('postureGMag');
  if (postureGMag) postureGMag.textContent = `${gMag} G`;
  const postureAngleBadge = document.getElementById('postureAngleBadge');
  if (postureAngleBadge) postureAngleBadge.textContent = `Roll: ${rollDeg}° | Pitch: ${pitchDeg}°`;

  const postureIconWrap = document.getElementById('postureIconWrap');
  if (postureIconWrap) postureIconWrap.style.transform = `rotate(${rollDeg}deg)`;

  const postureIcon = document.getElementById('postureIcon');
  const postureDisplayTitle = document.getElementById('postureDisplayTitle');
  const postureDisplayDesc = document.getElementById('postureDisplayDesc');

  if (postureDisplayTitle) postureDisplayTitle.textContent = posture;
  if (postureIcon) {
    if (posture.includes('Prone')) {
      postureIcon.textContent = '🛌';
      if (postureDisplayDesc) postureDisplayDesc.textContent = 'Ventral face-down position. Airway patency preserved, spinal rotation monitored.';
    } else if (posture.includes('Left')) {
      postureIcon.textContent = '↩️';
      if (postureDisplayDesc) postureDisplayDesc.textContent = 'Left lateral decubitus. Optimal for venous return & gastric reflux mitigation.';
    } else if (posture.includes('Right')) {
      postureIcon.textContent = '↪️';
      if (postureDisplayDesc) postureDisplayDesc.textContent = 'Right lateral position. Reduces nocturnal cardiac autonomic strain.';
    } else if (posture.includes('Upright')) {
      postureIcon.textContent = '🧍';
      if (postureDisplayDesc) postureDisplayDesc.textContent = 'Trunk elevated > 45°. Patient sitting up or head of bed elevated.';
    } else {
      postureIcon.textContent = '🛏️';
      if (postureDisplayDesc) postureDisplayDesc.textContent = 'Standard anatomical supine position with downward gravity vector alignment.';
    }
  }

  // Actigraphy Hypnogram Session Breakdown
  if (totalSleepSamples > 0) {
    const restfulPct = Math.round((restfulSamples / totalSleepSamples) * 100);
    const restlessPct = Math.min(100 - restfulPct, Math.round((sleepMotionEvents * 40 / totalSleepSamples) * 100));
    const lightPct = Math.max(0, 100 - restfulPct - restlessPct);

    const hypnoRestfulSeg = document.getElementById('hypnoRestfulSeg');
    const hypnoLightSeg = document.getElementById('hypnoLightSeg');
    const hypnoRestlessSeg = document.getElementById('hypnoRestlessSeg');

    if (hypnoRestfulSeg) hypnoRestfulSeg.style.width = `${restfulPct}%`;
    if (hypnoLightSeg) hypnoLightSeg.style.width = `${lightPct}%`;
    if (hypnoRestlessSeg) hypnoRestlessSeg.style.width = `${restlessPct}%`;

    const hypnoRestfulPct = document.getElementById('hypnoRestfulPct');
    const hypnoLightPct = document.getElementById('hypnoLightPct');
    const hypnoRestlessPct = document.getElementById('hypnoRestlessPct');
    const hypnoRatioBadge = document.getElementById('hypnoRatioBadge');

    if (hypnoRestfulPct) hypnoRestfulPct.textContent = `${restfulPct}%`;
    if (hypnoLightPct) hypnoLightPct.textContent = `${lightPct}%`;
    if (hypnoRestlessPct) hypnoRestlessPct.textContent = `${restlessPct}%`;
    if (hypnoRatioBadge) hypnoRatioBadge.textContent = `${restfulPct}% Restful Sleep`;
  }

  const valTossTurns = document.getElementById('valTossTurns');
  if (valTossTurns) valTossTurns.textContent = sleepMotionEvents;

  const valSleepScore = document.getElementById('valSleepScore');
  if (valSleepScore && totalSleepSamples > 0) {
    const score = Math.min(100, Math.round((restfulSamples / totalSleepSamples) * 100));
    valSleepScore.textContent = `${score}%`;
  }

  // Update Overview card if present
  const valOverviewSleep = document.getElementById('valOverviewSleep');
  if (valOverviewSleep) {
    valOverviewSleep.textContent = state;
    valOverviewSleep.className = `value ${badgeClass}`;
  }
  const subOverviewSleep = document.getElementById('subOverviewSleep');
  if (subOverviewSleep) {
    subOverviewSleep.textContent = `${posture} | ${mot} mg`;
  }
}


// Estimated Blood Pressure (Cuffless PWA Surrogate - Experimental & Inaccurate)
function updateEstimatedBP(bpm, pi) {
  const valBP = document.getElementById('valBP');
  const subBP = document.getElementById('subBP');
  const labSystolic = document.getElementById('labSystolic');
  const labDiastolic = document.getElementById('labDiastolic');
  const labBPClass = document.getElementById('labBPClass');
  const labBPStatus = document.getElementById('labBPStatus');

  if (!bpm || isNaN(bpm)) {
    if (valBP) valBP.textContent = '-- / --';
    if (subBP) subBP.innerHTML = '<span style="color: #f85149; font-weight: 700;">*Inaccurate</span> (Optical Est.)';
    if (labSystolic) labSystolic.textContent = '--';
    if (labDiastolic) labDiastolic.textContent = '--';
    if (labBPClass) labBPClass.textContent = '--';
    if (labBPStatus) labBPStatus.textContent = 'Awaiting pulse';
    return;
  }

  // PWA Empirical Model (approximated vascular resistance & cardiac output)
  const piFactor = Math.max(0.5, Math.min(5.0, pi || 2.0));
  const targetSys = Math.round(116 + (bpm - 72) * 0.42 - (piFactor - 2.0) * 1.5);
  const targetDia = Math.round(75 + (bpm - 72) * 0.22 - (piFactor - 2.0) * 1.0);

  const boundedSys = Math.max(90, Math.min(170, targetSys));
  const boundedDia = Math.max(55, Math.min(105, targetDia));

  if (rollingSystolic === null) {
    rollingSystolic = boundedSys;
    rollingDiastolic = boundedDia;
  } else {
    rollingSystolic = (0.85 * rollingSystolic) + (0.15 * boundedSys);
    rollingDiastolic = (0.85 * rollingDiastolic) + (0.15 * boundedDia);
  }

  const sys = Math.round(rollingSystolic);
  const dia = Math.round(rollingDiastolic);

  if (valBP) valBP.textContent = `${sys} / ${dia}`;
  if (subBP) subBP.innerHTML = '<span style="color: #f85149; font-weight: 700;">*Inaccurate</span> (Optical Est.)';
  if (labSystolic) labSystolic.textContent = sys;
  if (labDiastolic) labDiastolic.textContent = dia;

  let bpClass = 'Normal';
  let bpColor = '#3fb950';
  if (sys >= 140 || dia >= 90) {
    bpClass = 'Stage 2 HTN';
    bpColor = '#f85149';
  } else if (sys >= 130 || dia >= 80) {
    bpClass = 'Stage 1 HTN';
    bpColor = '#f0883e';
  } else if (sys >= 120 && dia < 80) {
    bpClass = 'Elevated';
    bpColor = '#d29922';
  }

  if (labBPClass) {
    labBPClass.textContent = bpClass;
    labBPClass.style.color = bpColor;
  }
  if (labBPStatus) {
    labBPStatus.textContent = 'Approx. Pulse Estimate';
  }
}

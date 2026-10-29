// Digital Signal Processing (DSP) & Biometric Metrics Engine
const MAX_BUFFER = 300;
const waveform = new Array(MAX_BUFFER).fill(0);
const rawIRHistory = new Array(MAX_BUFFER).fill(0);
const rawRedHistory = new Array(MAX_BUFFER).fill(0);
const respWaveform = new Array(MAX_BUFFER).fill(0);

// DC baseline tracker for AC pulse extraction
let dcTracker = 0;
const filterAlpha = 0.96;

// Cardiac peak & HRV tracking
let lastPeakTime = 0;
const peakIntervals = []; // Inter-Beat Intervals (ms)
let rollingSpO2 = null;

// Respiration state (Fast Boxcar Filter + Hysteresis)
const respFilterWindow = [];
const RESP_FILTER_LEN = 14; // ~0.56s at 25 Hz
let respBaseline = 0;
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
      pi: valPI && valPI.textContent !== '--' ? valPI.textContent : '',
      hrv: valHRV && valHRV.textContent !== '--' ? valHRV.textContent : '',
      resp: valResp && valResp.textContent !== '--' ? valResp.textContent : '',
      skinTemp: valSkinTemp && valSkinTemp.textContent !== '--' ? valSkinTemp.textContent : '',
      envTemp: valTemp && valTemp.textContent !== '--' ? valTemp.textContent : '',
      hum: subHum ? subHum.textContent.replace(/[^\d.]/g, '') : '',
      press: valPress && valPress.textContent !== '--' ? valPress.textContent : ''
    });
    if (sessionRecords.length > 7200) sessionRecords.shift(); // ~2 hours max in memory
  }

  // Advance raw history buffers
  rawIRHistory.shift();
  rawIRHistory.push(ir);
  rawRedHistory.shift();
  rawRedHistory.push(red);

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

    if (spo2Badge) {
      spo2Badge.textContent = 'Awaiting Finger';
      spo2Badge.style.color = 'var(--accent)';
    }
    if (spo2Needle) spo2Needle.style.left = '50%';
    if (vo2Badge) vo2Badge.textContent = 'VO₂ Max: -- mL/kg/min';
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

          // Update VO2 Max & 5-Zone Model
          updateVO2AndZones(currentBPM);

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

  // 4. Robust Respiration Rate Detection (Fast Boxcar Filter + Hysteresis)
  respFilterWindow.push(ir);
  if (respFilterWindow.length > RESP_FILTER_LEN) respFilterWindow.shift();

  if (respFilterWindow.length >= RESP_FILTER_LEN) {
    const respFiltered = respFilterWindow.reduce((a, b) => a + b, 0) / respFilterWindow.length;
    if (respBaseline === 0) {
      respBaseline = respFiltered;
    } else {
      respBaseline = (0.985 * respBaseline) + (0.015 * respFiltered);
    }

    const respAC = respFiltered - respBaseline;
    respWaveform.shift();
    respWaveform.push(respAC);

    // Animate live breathing expansion bar
    if (breathBar) {
      const breathPct = Math.max(5, Math.min(95, 50 + (respAC / 60) * 50));
      breathBar.style.width = breathPct + '%';
    }

    // Hysteresis threshold
    const HYST = 12;
    let newPhase = breathPhase;
    if (respAC > HYST) {
      newPhase = 1; // Inhaling
      if (subResp) subResp.textContent = String.fromCodePoint(0x1F32C) + ' Inhaling...';
    } else if (respAC < -HYST) {
      newPhase = -1; // Exhaling
      if (subResp) subResp.textContent = String.fromCodePoint(0x1F4A8) + ' Exhaling...';
    } else {
      if (lastBreathTime > 0 && (now - lastBreathTime > 5500)) {
        if (subResp) subResp.textContent = 'Holding breath / Steady';
      }
    }

    // Detect full breath cycle transition from Exhale to Inhale
    if (breathPhase === -1 && newPhase === 1) {
      if (lastBreathTime > 0) {
        const breathDurationMs = now - lastBreathTime;
        // Covers rapid breathing (1100ms / 54 BrPM) to slow meditative breathing (12000ms / 5 BrPM)
        if (breathDurationMs >= 1100 && breathDurationMs <= 12000) {
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

    // Clear display if breath held >16s
    if (lastBreathTime > 0 && (now - lastBreathTime > 16000)) {
      if (valResp) valResp.textContent = '--';
      if (subResp) subResp.textContent = 'Paused / Breath Held';
    }
  }
}

function updateSpO2Gauge(spo2) {
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
    if (subSpO2) subSpO2.textContent = 'Moderate Low';
    if (spo2Badge) {
      spo2Badge.textContent = 'Moderate Hypoxia (' + spo2 + '%)';
      spo2Badge.style.color = '#f0883e';
      spo2Badge.style.borderColor = '#f0883e';
    }
    if (spo2Desc) spo2Desc.textContent = 'Diminished arterial oxygen delivery. Deep breathing or rest recommended.';
  } else {
    if (valSpO2) valSpO2.style.color = '#f85149';
    if (subSpO2) subSpO2.textContent = 'Critical Low!';
    if (spo2Badge) {
      spo2Badge.textContent = 'Severe Hypoxia (<86%)';
      spo2Badge.style.color = '#f85149';
      spo2Badge.style.borderColor = '#f85149';
    }
    if (spo2Desc) spo2Desc.textContent = 'Critical hypoxemia level! Significant deficiency in arterial oxygenation.';
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

  // Uth-Sørensen Formula: VO2max ≈ 15.3 * (HRmax / HRrest) (standard HRmax = 190)
  const vo2 = (15.3 * (190 / Math.max(48, bpm))).toFixed(1);
  let vo2Rating = 'Good';
  if (vo2 >= 52) vo2Rating = 'Superior';
  else if (vo2 >= 45) vo2Rating = 'Excellent';
  else if (vo2 >= 38) vo2Rating = 'Good';
  else if (vo2 >= 32) vo2Rating = 'Fair';
  else vo2Rating = 'Poor';

  if (vo2Badge) vo2Badge.textContent = `VO₂ Max: ${vo2} (${vo2Rating})`;

  zoneBoxes.forEach(b => { if (b) b.classList.remove('active'); });

  if (bpm < 114) {
    if (zoneBoxes[0]) zoneBoxes[0].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 1 (Active Recovery / Warm-up): Very light intensity promoting metabolic recovery.';
  } else if (bpm <= 133) {
    if (zoneBoxes[1]) zoneBoxes[1].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 2 (Aerobic / Fat Burn): Sustainable endurance pace building mitochondrial density.';
  } else if (bpm <= 152) {
    if (zoneBoxes[2]) zoneBoxes[2].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 3 (Tempo / Aerobic Endurance): Moderate aerobic conditioning improving cardiovascular stroke volume.';
  } else if (bpm <= 171) {
    if (zoneBoxes[3]) zoneBoxes[3].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 4 (Anaerobic Threshold / Hard): High intensity interval pace near lactate threshold.';
  } else {
    if (zoneBoxes[4]) zoneBoxes[4].classList.add('active');
    if (zoneDesc) zoneDesc.textContent = 'Zone 5 (Peak / VO₂ Max Effort): Maximum aerobic capacity sprint, unsustainable for prolonged periods.';
  }
}


// Application State, WebSerial Communication & UI Navigation Controller
let port = null;
let reader = null;
let keepReading = false;
let isPaused = false;
let visiblePoints = 100;

// Autoscaling Time / Memory Window Depth Controller
let currentWindowMode = 'high';
let windowSamples = 300; // High = 300 samples (~12.0s), Med = 150 (~6.0s), Low = 60 (~2.4s)

// Session counters
let sessionStartTime = performance.now();
let totalPackets = 0;
let totalBeats = 0;
let totalBreaths = 0;
const sessionHR = [];
const sessionSpO2 = [];
let currentEnvTemp = null;

// Tab Navigation
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });
}

// Speed Settings
function setSpeed(factor) {
  document.getElementById('speedSlowBtn').classList.toggle('active', factor === 0.5);
  document.getElementById('speedNormalBtn').classList.toggle('active', factor === 1.0);
  document.getElementById('speedFastBtn').classList.toggle('active', factor === 2.0);
  document.getElementById('speedMaxBtn').classList.toggle('active', factor === 'max' || factor === 4.0);

  if (factor === 0.5) visiblePoints = 200;
  else if (factor === 2.0) visiblePoints = 50;
  else if (factor === 'max' || factor === 4.0) visiblePoints = 25;
  else visiblePoints = 100;
}

// Time / Memory Window Depth Settings
function setWindow(mode) {
  currentWindowMode = mode;
  const winLowBtn = document.getElementById('winLowBtn');
  const winMedBtn = document.getElementById('winMedBtn');
  const winHighBtn = document.getElementById('winHighBtn');

  if (winLowBtn) winLowBtn.classList.toggle('active', mode === 'low');
  if (winMedBtn) winMedBtn.classList.toggle('active', mode === 'med');
  if (winHighBtn) winHighBtn.classList.toggle('active', mode === 'high');

  if (mode === 'low') {
    windowSamples = 60; // 2.4s: high localized amplitude sensitivity
  } else if (mode === 'med') {
    windowSamples = 150; // 6.0s: balanced clinical monitor view
  } else {
    windowSamples = 300; // 12.0s: wide baseline & full breath cycles
  }
}

// Pause / Resume
function togglePause() {
  isPaused = !isPaused;
  const pauseBtn = document.getElementById('pauseBtn');
  const overlays = document.querySelectorAll('.pause-overlay');
  if (isPaused) {
    if (pauseBtn) {
      pauseBtn.textContent = '▶ Resume';
      pauseBtn.classList.add('paused');
    }
    overlays.forEach(o => o.style.display = 'block');
  } else {
    if (pauseBtn) {
      pauseBtn.textContent = '⏸ Pause';
      pauseBtn.classList.remove('paused');
    }
    overlays.forEach(o => o.style.display = 'none');
  }
}

// Session Statistics Banner
function resetSessionStats() {
  sessionStartTime = performance.now();
  totalPackets = 0;
  totalBeats = 0;
  totalBreaths = 0;
  sessionHR.length = 0;
  sessionSpO2.length = 0;
  sessionRecords.length = 0;

  const statElapsed = document.getElementById('statElapsed');
  const statHRRange = document.getElementById('statHRRange');
  const statBeats = document.getElementById('statBeats');
  const statAvgSpO2 = document.getElementById('statAvgSpO2');
  const statBreaths = document.getElementById('statBreaths');
  const statPackets = document.getElementById('statPackets');

  if (statElapsed) statElapsed.textContent = '00:00';
  if (statHRRange) statHRRange.textContent = '-- (Avg --)';
  if (statBeats) statBeats.textContent = '0';
  if (statAvgSpO2) statAvgSpO2.textContent = '--%';
  if (statBreaths) statBreaths.textContent = '0';
  if (statPackets) statPackets.textContent = '0 pkts';
  showToast('🔄 Session statistics reset');
}

function updateSessionStatsUI() {
  const elapsedSec = Math.floor((performance.now() - sessionStartTime) / 1000);
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  const statElapsed = document.getElementById('statElapsed');
  const statBeats = document.getElementById('statBeats');
  const statBreaths = document.getElementById('statBreaths');
  const statPackets = document.getElementById('statPackets');
  const statHRRange = document.getElementById('statHRRange');
  const statAvgSpO2 = document.getElementById('statAvgSpO2');

  if (statElapsed) statElapsed.textContent = `${mm}:${ss}`;
  if (statBeats) statBeats.textContent = totalBeats.toLocaleString();
  if (statBreaths) statBreaths.textContent = totalBreaths.toLocaleString();
  if (statPackets) statPackets.textContent = `${totalPackets.toLocaleString()} pkts`;

  if (sessionHR.length > 0 && statHRRange) {
    let minH = Infinity, maxH = -Infinity, sumH = 0;
    for (let i = 0; i < sessionHR.length; i++) {
      const v = sessionHR[i];
      if (v < minH) minH = v;
      if (v > maxH) maxH = v;
      sumH += v;
    }
    const avgH = Math.round(sumH / sessionHR.length);
    statHRRange.textContent = `${minH} - ${maxH} (Avg ${avgH})`;
  }

  if (sessionSpO2.length > 0 && statAvgSpO2) {
    let sumS = 0;
    for (let i = 0; i < sessionSpO2.length; i++) sumS += sessionSpO2[i];
    statAvgSpO2.textContent = (sumS / sessionSpO2.length).toFixed(1) + '%';
  }
}
setInterval(updateSessionStatsUI, 1000);

// Telemetry Line Parser
function parseDataLine(line) {
  if (!line.includes('ENV:') && !line.includes('PULSE:')) return;
  totalPackets++;
  appendLog(line);

  // Match ENV: Temp, Hum, Press
  const envMatch = line.match(/ENV:\s*([0-9.-]+)\s*C,\s*([0-9.-]+)\s*%,\s*([0-9.-]+)\s*hPa/i);
  if (envMatch) {
    const valTemp = document.getElementById('valTemp');
    const subHum = document.getElementById('subHum');
    const valPress = document.getElementById('valPress');
    if (valTemp) valTemp.textContent = envMatch[1];
    if (subHum) subHum.textContent = `Hum: ${envMatch[2]} %`;
    if (valPress) valPress.textContent = envMatch[3];
    currentEnvTemp = parseFloat(envMatch[1]);

    const envAirVal = document.getElementById('envAirVal');
    const envHumVal = document.getElementById('envHumVal');
    const envPressVal = document.getElementById('envPressVal');
    if (envAirVal) envAirVal.textContent = `${envMatch[1]} °C`;
    if (envHumVal) envHumVal.textContent = `${envMatch[2]} %`;
    if (envPressVal) envPressVal.textContent = `${envMatch[3]} hPa`;
  }

  // Match PULSE: Finger, RED, IR, optional CTEMP
  const pulseMatch = line.match(/PULSE:\s*Finger=([A-Z]+)\s*\(RED=([0-9]+),\s*IR=([0-9]+)(?:,\s*CTEMP=([0-9.-]+)\s*C)?\)/i);
  if (pulseMatch) {
    const isFinger = pulseMatch[1].trim() === 'YES';
    const red = parseInt(pulseMatch[2], 10);
    const ir = parseInt(pulseMatch[3], 10);
    const ctemp = pulseMatch[4] ? parseFloat(pulseMatch[4]) : null;

    const valFinger = document.getElementById('valFinger');
    if (valFinger) {
      valFinger.innerHTML = isFinger 
        ? '<span class="finger-indicator finger-yes">FINGER DETECTED</span>' 
        : '<span class="finger-indicator finger-no">NO FINGER</span>';
    }

    const valSkinTemp = document.getElementById('valSkinTemp');
    const subSkinTemp = document.getElementById('subSkinTemp');
    if (ctemp !== null && valSkinTemp) {
      valSkinTemp.textContent = ctemp.toFixed(2);
      const envSkinVal = document.getElementById('envSkinVal');
      if (envSkinVal) envSkinVal.textContent = `${ctemp.toFixed(2)} °C`;

      if (currentEnvTemp !== null) {
        const diff = ctemp - currentEnvTemp;
        const sign = diff >= 0 ? '+' : '';
        if (subSkinTemp) {
          subSkinTemp.innerHTML = `Gradient: <span style="color: ${diff >= 0 ? '#3fb950' : '#f0883e'}; font-weight: 700;">${sign}${diff.toFixed(1)} °C</span>`;
        }
        const envGradientVal = document.getElementById('envGradientVal');
        if (envGradientVal) {
          envGradientVal.textContent = `${sign}${diff.toFixed(1)} °C`;
          envGradientVal.style.color = diff >= 0 ? '#3fb950' : '#f0883e';
        }
      }
    }

    processTelemetry(ir, red, isFinger, ctemp);
  }
}

// 60 FPS Render Loop (draws active canvases with HiDPI crispness)
function render() {
  if (!isPaused) {
    // Overview canvases
    const ppgCanvas = document.getElementById('ppgCanvas');
    if (ppgCanvas && ppgCanvas.offsetParent !== null) {
      drawPPGChart(ppgCanvas);
    }

    const respCanvas = document.getElementById('respCanvas');
    if (respCanvas && respCanvas.offsetParent !== null) {
      drawRespChart(respCanvas);
    }

    // Cardio Lab canvases
    const cardioPPG = document.getElementById('cardioPPGCanvas');
    if (cardioPPG && cardioPPG.offsetParent !== null) {
      drawPPGChart(cardioPPG);
    }
    const trendCanvas = document.getElementById('trendCanvas');
    if (trendCanvas && trendCanvas.offsetParent !== null) {
      drawTrendChart(trendCanvas);
    }

    // Respiration Lab canvas
    const respLabCanvas = document.getElementById('respLabCanvas');
    if (respLabCanvas && respLabCanvas.offsetParent !== null) {
      drawRespChart(respLabCanvas);
    }

    // Optics Lab canvases
    const rawIRCanvas = document.getElementById('rawIRCanvas');
    if (rawIRCanvas && rawIRCanvas.offsetParent !== null) {
      drawSingleRawChart(rawIRCanvas, rawIRHistory, '#38bdf8', true);
    }
    const rawRedCanvas = document.getElementById('rawRedCanvas');
    if (rawRedCanvas && rawRedCanvas.offsetParent !== null) {
      drawSingleRawChart(rawRedCanvas, rawRedHistory, '#fb923c', false);
    }
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Serial Connection Management
document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.getElementById('connectBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Tab button click events
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  if (!connectBtn) return;

  connectBtn.addEventListener('click', async () => {
    if (port) {
      keepReading = false;
      if (reader) {
        try { await reader.cancel(); } catch (e) {}
      }
      try { await port.close(); } catch (e) {}
      port = null;
      reader = null;
      statusDot.classList.remove('connected');
      statusText.textContent = 'Disconnected';
      connectBtn.textContent = 'Connect STM32';
      connectBtn.classList.remove('disconnect');
      appendLog('>>> Disconnected from STM32.');
      return;
    }

    if (!('serial' in navigator)) {
      alert('WebSerial is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });

      statusDot.classList.add('connected');
      statusText.textContent = 'Connected (25 Hz)';
      connectBtn.textContent = 'Disconnect';
      connectBtn.classList.add('disconnect');
      appendLog('>>> Connected to STM32 Virtual COM Port @ 115200 baud! <<<');

      keepReading = true;
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      reader = textDecoder.readable.getReader();

      let partial = '';
      while (keepReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          partial += value;
          const lines = partial.split('\n');
          partial = lines.pop();
          for (const line of lines) {
            const clean = line.trim();
            if (clean.length > 0) parseDataLine(clean);
          }
        }
      }
    } catch (err) {
      console.error(err);
      appendLog('>>> Serial Error: ' + err.message);
      statusDot.classList.remove('connected');
      statusText.textContent = 'Error';
      connectBtn.textContent = 'Connect STM32';
      connectBtn.classList.remove('disconnect');
      port = null;
    }
  });
});

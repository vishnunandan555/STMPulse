// High-Performance HTML5 Canvas Rendering Engine with HiDPI Resolution & Aspect-Ratio Normalization
let irScaleMin = 0, irScaleMax = 10000;
let redScaleMin = 0, redScaleMax = 10000;
let diffScaleMin = -5000, diffScaleMax = 5000;

const TREND_POINTS = 60;
const trendBPM = new Array(TREND_POINTS).fill(null);
const trendSpO2 = new Array(TREND_POINTS).fill(null);
let lastTrendTime = 0;

/**
 * HiDPI & Responsive Canvas Resolution Synchronizer
 * Eliminates raster stretching and keeps text and waveforms razor-sharp
 * regardless of monitor DPI, browser zoom, or window resizing.
 */
function prepareCanvas(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const displayW = Math.round(rect.width);
  const displayH = Math.round(rect.height || 180);

  // If container is hidden (e.g., inactive tab), skip render
  if (displayW <= 0 || displayH <= 0) return null;

  const targetW = Math.round(displayW * dpr);
  const targetH = Math.round(displayH * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  // Map drawing coordinates to CSS logical pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: displayW, height: displayH };
}

/**
 * 1. Photoplethysmogram (PPG) Pulse Waveform
 */
function drawPPGChart(canvas) {
  const prep = prepareCanvas(canvas);
  if (!prep) return;
  const { ctx, width, height } = prep;

  ctx.fillStyle = '#090d13';
  ctx.fillRect(0, 0, width, height);

  // Background grid
  ctx.strokeStyle = '#161e27';
  ctx.lineWidth = 1;
  for (let y = 30; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const pointsCount = Math.min(MAX_BUFFER, (typeof windowSamples !== 'undefined' ? windowSamples : visiblePoints) || 100);
  const startIdx = MAX_BUFFER - pointsCount;

  let min = Infinity, max = -Infinity;
  for (let i = startIdx; i < MAX_BUFFER; i++) {
    if (waveform[i] < min) min = waveform[i];
    if (waveform[i] > max) max = waveform[i];
  }

  if (max - min < 200) {
    const mid = (max + min) / 2;
    min = mid - 100;
    max = mid + 100;
  }

  const range = (max - min) || 1;
  const padding = 20;

  // Header / Scale text (rendered crisp with zero distortion)
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  ctx.fillText('Peak AC: +' + Math.round(max), 8, 16);
  ctx.fillText('Trough AC: ' + Math.round(min), 8, height - 8);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#f85149';
  ctx.fillText(`PPG Pulse Trace (${(pointsCount / 25).toFixed(1)}s window)`, width - 10, 16);
  ctx.textAlign = 'left';

  // Pulsatile line
  ctx.beginPath();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#f85149';
  ctx.lineJoin = 'round';

  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const x = ((i - startIdx) / (pointsCount - 1)) * width;
    const norm = (waveform[i] - min) / range;
    const y = (height - padding) - (norm * (height - 2 * padding));

    if (i === startIdx) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Gradient area fill
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fillStyle = 'rgba(248, 81, 73, 0.08)';
  ctx.fill();

  ctx.restore();
}

/**
 * 2. Respiration Sine Waveform (0.15–0.35 Hz)
 */
function drawRespChart(canvas) {
  const prep = prepareCanvas(canvas);
  if (!prep) return;
  const { ctx, width, height } = prep;

  ctx.fillStyle = '#090d13';
  ctx.fillRect(0, 0, width, height);

  // Horizontal grid lines
  ctx.strokeStyle = '#161e27';
  ctx.lineWidth = 1;
  for (let y = 30; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Zero-crossing dashed baseline
  ctx.strokeStyle = 'rgba(139, 148, 158, 0.28)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const pointsCount = Math.min(MAX_BUFFER, (typeof windowSamples !== 'undefined' ? windowSamples : visiblePoints) || 100);
  const startIdx = MAX_BUFFER - pointsCount;

  let min = Infinity, max = -Infinity;
  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const v = respWaveform[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (max - min < 40) {
    min = -25;
    max = 25;
  } else {
    const margin = (max - min) * 0.15;
    min -= margin;
    max += margin;
  }

  const range = (max - min) || 1;
  const padding = 16;

  // Crisp Axis labels
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  ctx.fillText('Inhale (+): ' + Math.round(max), 8, 16);
  ctx.fillText('Baseline (0)', 8, height / 2 - 4);
  ctx.fillText('Exhale (-): ' + Math.round(min), 8, height - 8);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#3fb950';
  ctx.fillText(`🌬 Breath Wave (${(pointsCount / 25).toFixed(1)}s window)`, width - 10, 16);
  ctx.textAlign = 'left';

  // Smooth Respiration curve
  ctx.beginPath();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#2ea043';
  ctx.lineJoin = 'round';

  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const x = ((i - startIdx) / (pointsCount - 1)) * width;
    const norm = (respWaveform[i] - min) / range;
    const y = (height - padding) - (norm * (height - 2 * padding));
    if (i === startIdx) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Shaded area
  ctx.lineTo(width, height / 2);
  ctx.lineTo(0, height / 2);
  ctx.fillStyle = 'rgba(46, 160, 67, 0.08)';
  ctx.fill();

  ctx.restore();
}

/**
 * 3. Raw Photodiode Channels (Raw IR / Raw Red)
 */
function drawSingleRawChart(canvas, history, strokeColor, isIR) {
  const prep = prepareCanvas(canvas);
  if (!prep) return;
  const { ctx, width, height } = prep;

  ctx.fillStyle = '#090d13';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#161e27';
  ctx.lineWidth = 1;
  for (let y = 30; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const pointsCount = Math.min(MAX_BUFFER, (typeof windowSamples !== 'undefined' ? windowSamples : visiblePoints) || 100);
  const startIdx = MAX_BUFFER - pointsCount;

  let minVal = Infinity, maxVal = -Infinity;
  let count = 0;
  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const v = history[i];
    if (v > 10000) {
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
      count++;
    }
  }

  let targetMin, targetMax;
  if (count >= 5) {
    const actualSpan = maxVal - minVal;
    const span = Math.max(350, actualSpan);
    const margin = span * 0.15;
    const mid = (maxVal + minVal) / 2;
    targetMin = Math.floor(mid - (span / 2) - margin);
    targetMax = Math.ceil(mid + (span / 2) + margin);
  } else {
    targetMin = 0;
    targetMax = 10000;
  }

  let currentMin = isIR ? irScaleMin : redScaleMin;
  let currentMax = isIR ? irScaleMax : redScaleMax;

  if (Math.abs(targetMin - currentMin) > 40000 || (currentMax - currentMin) > 50000) {
    currentMin = targetMin;
    currentMax = targetMax;
  } else {
    currentMin += 0.22 * (targetMin - currentMin);
    currentMax += 0.22 * (targetMax - currentMax);
  }

  if (isIR) {
    irScaleMin = currentMin;
    irScaleMax = currentMax;
  } else {
    redScaleMin = currentMin;
    redScaleMax = currentMax;
  }

  const range = (currentMax - currentMin) || 1;
  const padding = 20;

  // Center dashed midline
  ctx.strokeStyle = 'rgba(139, 148, 158, 0.22)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Axis text labels
  const avg = (currentMax + currentMin) / 2;
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  ctx.fillText('Max: ' + Math.round(currentMax).toLocaleString(), 8, 16);
  ctx.fillText('Mid: ' + Math.round(avg).toLocaleString(), 8, height / 2 - 4);
  ctx.fillText('Min: ' + Math.round(currentMin).toLocaleString(), 8, height - 8);

  const deltaSpan = Math.round(currentMax - currentMin);
  ctx.textAlign = 'right';
  ctx.fillText(`Window: ±${Math.round(deltaSpan / 2).toLocaleString()} counts (${(pointsCount / 25).toFixed(1)}s)`, width - 10, 16);
  ctx.textAlign = 'left';

  // Curve
  ctx.beginPath();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = strokeColor;
  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const x = ((i - startIdx) / (pointsCount - 1)) * width;
    const norm = (history[i] - currentMin) / range;
    const y = (height - padding) - (norm * (height - 2 * padding));
    if (i === startIdx) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Shaded area
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fillStyle = isIR ? 'rgba(56, 189, 248, 0.05)' : 'rgba(251, 146, 60, 0.05)';
  ctx.fill();

  ctx.restore();
}

/**
 * 3b. Differential Optical Channel (Raw IR - Raw Red)
 */
function drawDiffChart(canvas, history, strokeColor) {
  const prep = prepareCanvas(canvas);
  if (!prep) return;
  const { ctx, width, height } = prep;

  ctx.fillStyle = '#090d13';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#161e27';
  ctx.lineWidth = 1;
  for (let y = 30; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const pointsCount = Math.min(MAX_BUFFER, (typeof windowSamples !== 'undefined' ? windowSamples : visiblePoints) || 100);
  const startIdx = MAX_BUFFER - pointsCount;

  let minVal = Infinity, maxVal = -Infinity;
  let count = 0;
  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const v = history[i];
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
    count++;
  }

  let targetMin, targetMax;
  if (count >= 5 && isFinite(minVal) && isFinite(maxVal)) {
    const actualSpan = maxVal - minVal;
    const span = Math.max(300, actualSpan);
    const margin = span * 0.15;
    const mid = (maxVal + minVal) / 2;
    targetMin = Math.floor(mid - (span / 2) - margin);
    targetMax = Math.ceil(mid + (span / 2) + margin);
  } else {
    targetMin = -5000;
    targetMax = 5000;
  }

  if (Math.abs(targetMin - diffScaleMin) > 40000 || (diffScaleMax - diffScaleMin) > 50000) {
    diffScaleMin = targetMin;
    diffScaleMax = targetMax;
  } else {
    diffScaleMin += 0.22 * (targetMin - diffScaleMin);
    diffScaleMax += 0.22 * (targetMax - diffScaleMax);
  }

  const range = (diffScaleMax - diffScaleMin) || 1;
  const padding = 20;

  // Center dashed midline
  ctx.strokeStyle = 'rgba(139, 148, 158, 0.22)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  // Draw 0-reference line if within range
  if (0 >= diffScaleMin && 0 <= diffScaleMax) {
    const zeroNorm = (0 - diffScaleMin) / range;
    const zeroY = (height - padding) - (zeroNorm * (height - 2 * padding));
    ctx.strokeStyle = 'rgba(188, 140, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Axis text labels
  const avg = (diffScaleMax + diffScaleMin) / 2;
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  ctx.fillText('Max: ' + (Math.round(diffScaleMax) >= 0 ? '+' : '') + Math.round(diffScaleMax).toLocaleString(), 8, 16);
  ctx.fillText('Mid: ' + (Math.round(avg) >= 0 ? '+' : '') + Math.round(avg).toLocaleString(), 8, height / 2 - 4);
  ctx.fillText('Min: ' + (Math.round(diffScaleMin) >= 0 ? '+' : '') + Math.round(diffScaleMin).toLocaleString(), 8, height - 8);

  const deltaSpan = Math.round(diffScaleMax - diffScaleMin);
  ctx.textAlign = 'right';
  ctx.fillText(`Window: ±${Math.round(deltaSpan / 2).toLocaleString()} counts (${(pointsCount / 25).toFixed(1)}s)`, width - 10, 16);
  ctx.textAlign = 'left';

  // Curve
  ctx.beginPath();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = strokeColor;
  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const x = ((i - startIdx) / (pointsCount - 1)) * width;
    const norm = (history[i] - diffScaleMin) / range;
    const y = (height - padding) - (norm * (height - 2 * padding));
    if (i === startIdx) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Shaded area
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fillStyle = 'rgba(188, 140, 255, 0.05)';
  ctx.fill();

  ctx.restore();
}

/**
 * 4. 60-Second Physiological Trend Line
 */
function drawTrendChart(canvas) {
  const prep = prepareCanvas(canvas);
  if (!prep) return;
  const { ctx, width, height } = prep;

  ctx.fillStyle = '#090d13';
  ctx.fillRect(0, 0, width, height);

  // Time grid (10 sec intervals)
  ctx.strokeStyle = '#161e27';
  ctx.lineWidth = 1;
  for (let s = 0; s <= 60; s += 10) {
    const x = (s / 60) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 25; y < height; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Left axis (Heart Rate 40-160 BPM)
  ctx.fillStyle = '#f85149';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  ctx.fillText('160 BPM', 8, 14);
  ctx.fillText('100 BPM', 8, height / 2);
  ctx.fillText('40 BPM', 8, height - 6);

  // Right axis (SpO2 80-100%)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#3fb950';
  ctx.fillText('100% SpO2', width - 8, 14);
  ctx.fillText('90% SpO2', width - 8, height / 2);
  ctx.fillText('80% SpO2', width - 8, height - 6);
  ctx.textAlign = 'left';

  // Plot HR (Red)
  ctx.beginPath();
  ctx.lineWidth = 2.0;
  ctx.strokeStyle = '#f85149';
  let firstHR = true;
  for (let i = 0; i < TREND_POINTS; i++) {
    const val = trendBPM[i];
    if (val !== null) {
      const x = (i / (TREND_POINTS - 1)) * width;
      const norm = Math.max(0, Math.min(1, (val - 40) / 120));
      const y = (height - 15) - (norm * (height - 30));
      if (firstHR) { ctx.moveTo(x, y); firstHR = false; }
      else { ctx.lineTo(x, y); }
    }
  }
  ctx.stroke();

  // Plot SpO2 (Green)
  ctx.beginPath();
  ctx.lineWidth = 2.0;
  ctx.strokeStyle = '#3fb950';
  let firstSpO2 = true;
  for (let i = 0; i < TREND_POINTS; i++) {
    const val = trendSpO2[i];
    if (val !== null) {
      const x = (i / (TREND_POINTS - 1)) * width;
      const norm = Math.max(0, Math.min(1, (val - 80) / 20));
      const y = (height - 15) - (norm * (height - 30));
      if (firstSpO2) { ctx.moveTo(x, y); firstSpO2 = false; }
      else { ctx.lineTo(x, y); }
    }
  }
  ctx.stroke();

  ctx.restore();
}

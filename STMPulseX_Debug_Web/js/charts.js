// High-Performance HTML5 Canvas Rendering Engine
let irScaleMin = 0, irScaleMax = 10000;
let redScaleMin = 0, redScaleMax = 10000;

const TREND_POINTS = 60;
const trendBPM = new Array(TREND_POINTS).fill(null);
const trendSpO2 = new Array(TREND_POINTS).fill(null);
let lastTrendTime = 0;

function drawPPGChart(canvas, ctx) {
  if (!canvas || !ctx) return;
  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = '#090d13';
  ctx.fillRect(0, 0, width, height);

  // Grid lines
  ctx.strokeStyle = '#161e27';
  ctx.lineWidth = 1;
  for (let y = 30; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const startIdx = MAX_BUFFER - visiblePoints;
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

  // Pulsatile line
  ctx.beginPath();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#f85149';
  ctx.lineJoin = 'round';

  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const x = ((i - startIdx) / (visiblePoints - 1)) * width;
    const norm = (waveform[i] - min) / range;
    const y = (height - padding) - (norm * (height - 2 * padding));

    if (i === startIdx) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fillStyle = 'rgba(248, 81, 73, 0.08)';
  ctx.fill();
}

function drawRespChart(canvas, ctx) {
  if (!canvas || !ctx) return;
  const width = canvas.width;
  const height = canvas.height;

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

  const startIdx = MAX_BUFFER - visiblePoints;
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

  // Axis labels
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px monospace';
  ctx.fillText('Inhale (+): ' + Math.round(max), 8, 16);
  ctx.fillText('Baseline (0)', 8, height / 2 - 4);
  ctx.fillText('Exhale (-): ' + Math.round(min), 8, height - 8);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#3fb950';
  ctx.fillText('🌬 Breath Sine-Wave (0.15–0.35 Hz)', width - 10, 16);
  ctx.textAlign = 'left';

  // Curve
  ctx.beginPath();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#2ea043';
  ctx.lineJoin = 'round';

  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const x = ((i - startIdx) / (visiblePoints - 1)) * width;
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
}

function drawSingleRawChart(canvas, ctx, history, strokeColor, isIR) {
  if (!canvas || !ctx) return;
  const width = canvas.width;
  const height = canvas.height;

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

  const startIdx = MAX_BUFFER - visiblePoints;
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

  ctx.strokeStyle = 'rgba(139, 148, 158, 0.22)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const avg = (currentMax + currentMin) / 2;
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px monospace';
  ctx.fillText('Max: ' + Math.round(currentMax).toLocaleString(), 8, 16);
  ctx.fillText('Mid: ' + Math.round(avg).toLocaleString(), 8, height / 2 - 4);
  ctx.fillText('Min: ' + Math.round(currentMin).toLocaleString(), 8, height - 8);

  const deltaSpan = Math.round(currentMax - currentMin);
  ctx.textAlign = 'right';
  ctx.fillText('Window: ±' + Math.round(deltaSpan / 2).toLocaleString() + ' counts', width - 10, 16);
  ctx.textAlign = 'left';

  ctx.beginPath();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = strokeColor;
  for (let i = startIdx; i < MAX_BUFFER; i++) {
    const x = ((i - startIdx) / (visiblePoints - 1)) * width;
    const norm = (history[i] - currentMin) / range;
    const y = (height - padding) - (norm * (height - 2 * padding));
    if (i === startIdx) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fillStyle = isIR ? 'rgba(56, 189, 248, 0.05)' : 'rgba(251, 146, 60, 0.05)';
  ctx.fill();
}

function drawTrendChart(canvas, ctx) {
  if (!canvas || !ctx) return;
  const width = canvas.width;
  const height = canvas.height;

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
  ctx.font = '10px monospace';
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
}

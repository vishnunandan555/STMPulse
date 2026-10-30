// Telemetry Export & Clipboard Tools Module
const logLines = [];
const sessionRecords = [];
let logRenderPending = false;

function showToast(msg) {
  const copyToast = document.getElementById('copyToast');
  if (!copyToast) return;
  copyToast.textContent = msg;
  copyToast.classList.add('show');
  setTimeout(() => copyToast.classList.remove('show'), 2000);
}

function flushLogBox() {
  logRenderPending = false;
  const logBox = document.getElementById('logBox');
  if (logBox) {
    const slice = logLines.slice(-150);
    logBox.textContent = slice.join('\n');
    logBox.scrollTop = logBox.scrollHeight;
  }
  const miniLog = document.getElementById('miniLogText');
  if (miniLog && logLines.length > 0) {
    miniLog.textContent = logLines[logLines.length - 1];
  }
}

function appendLog(line) {
  logLines.push(line);
  if (logLines.length > 2500) logLines.shift();

  if (!logRenderPending) {
    logRenderPending = true;
    requestAnimationFrame(flushLogBox);
  }
}

function copyAllLogs() {
  if (logLines.length === 0) {
    showToast('⚠ No logs to copy');
    return;
  }
  navigator.clipboard.writeText(logLines.join('\n')).then(() => {
    showToast(`✔ Copied ${logLines.length} lines!`);
  }).catch(() => {
    showToast('❌ Copy failed');
  });
}

function copyLast100Logs() {
  if (logLines.length === 0) {
    showToast('⚠ No logs to copy');
    return;
  }
  const slice = logLines.slice(-100);
  navigator.clipboard.writeText(slice.join('\n')).then(() => {
    showToast(`✔ Copied last ${slice.length} lines!`);
  }).catch(() => {
    showToast('❌ Copy failed');
  });
}

function clearLogs() {
  logLines.length = 0;
  const logBox = document.getElementById('logBox');
  if (logBox) logBox.textContent = '';
  const miniLog = document.getElementById('miniLogText');
  if (miniLog) miniLog.textContent = 'Logs cleared.';
  showToast('🗑 Cleared logs');
}

function exportCSV() {
  if (sessionRecords.length === 0) {
    showToast('⚠ No session records to export');
    return;
  }
  const headers = [
    'Timestamp_ISO',
    'Elapsed_ms',
    'HeartRate_BPM',
    'SpO2_Pct',
    'Estimated_BP_mmHg',
    'PerfusionIndex_Pct',
    'HRV_RMSSD_ms',
    'Respiration_BrPM',
    'SkinTemp_C',
    'AmbientTemp_C',
    'TMP117_Ambient_C',
    'Humidity_Pct',
    'Pressure_hPa',
    'Accel_X_mg',
    'Accel_Y_mg',
    'Accel_Z_mg',
    'Motion_mg',
    'Sleep_State',
    'Sleep_Posture'
  ];
  const rows = sessionRecords.map(r => [
    r.iso,
    r.tMs,
    r.bpm,
    r.spo2,
    r.bp || '',
    r.pi,
    r.hrv,
    r.resp,
    r.skinTemp,
    r.envTemp,
    r.tmp117Temp || '',
    r.hum,
    r.press,
    r.ax !== undefined ? r.ax : '',
    r.ay !== undefined ? r.ay : '',
    r.az !== undefined ? r.az : '',
    r.mot !== undefined ? r.mot : '',
    r.sleepState || '',
    r.posture || ''
  ].join(','));

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `STMPulseX_Telemetry_${nowStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`✔ Exported ${sessionRecords.length} records!`);
}

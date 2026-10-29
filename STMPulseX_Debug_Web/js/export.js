// Telemetry Export & Clipboard Tools Module
const logLines = [];
const sessionRecords = [];

function showToast(msg) {
  const copyToast = document.getElementById('copyToast');
  if (!copyToast) return;
  copyToast.textContent = msg;
  copyToast.classList.add('show');
  setTimeout(() => copyToast.classList.remove('show'), 2000);
}

function appendLog(line) {
  logLines.push(line);
  if (logLines.length > 1200) logLines.shift();

  const logBox = document.getElementById('logBox');
  if (logBox) {
    logBox.textContent += line + '\n';
    logBox.scrollTop = logBox.scrollHeight;
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
    'PerfusionIndex_Pct',
    'HRV_RMSSD_ms',
    'Respiration_BrPM',
    'SkinTemp_C',
    'AmbientTemp_C',
    'Humidity_Pct',
    'Pressure_hPa'
  ];
  const rows = sessionRecords.map(r => [
    r.iso,
    r.tMs,
    r.bpm,
    r.spo2,
    r.pi,
    r.hrv,
    r.resp,
    r.skinTemp,
    r.envTemp,
    r.hum,
    r.press
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


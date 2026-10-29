// Audio Feedback Module (Hospital Pulse Oximeter Tone Synthesizer)
let audioCtx = null;
let isAudioEnabled = false;

function toggleAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  isAudioEnabled = !isAudioEnabled;
  const audioBtn = document.getElementById('audioBtn');
  if (audioBtn) {
    if (isAudioEnabled) {
      audioBtn.textContent = '🔊 Beep: On';
      audioBtn.classList.add('active');
      showToast('🔊 Pulse audio beep enabled');
    } else {
      audioBtn.textContent = '🔇 Beep: Off';
      audioBtn.classList.remove('active');
      showToast('🔇 Pulse audio beep muted');
    }
  }
}

function playPulseBeep(spo2Val) {
  if (!isAudioEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const s = (typeof spo2Val === 'number' && spo2Val >= 70 && spo2Val <= 100) ? spo2Val : 98;
    
    // Musical pitch modulation based on saturation (98% -> ~880 Hz, lower tone for hypoxia)
    const freq = 440 * Math.pow(2, (s - 90) / 12);
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.type = 'sine';

    // Soft clinical pulse envelope (60ms)
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  } catch (e) {}
}


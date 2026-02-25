const NOTE_FREQ_BASE = {
  'C':261.63,'C#':277.18,'D':293.66,'D#':311.13,'E':329.63,
  'F':349.23,'F#':369.99,'G':392.00,'G#':415.30,'A':440.00,
  'A#':466.16,'B':493.88,
};

export function _noteToHz(note, octave) {
  return (NOTE_FREQ_BASE[note] ?? 440) * Math.pow(2, octave - 4);
}

export function _parseNotes(str) {
  return str.trim().split(/\s+/).map(tok => {
    const [n, b] = tok.split(':');
    const beats  = parseFloat(b);
    if (n === 'R') return { rest: true, beats };
    const sharp = n[1] === '#';
    const note  = sharp ? n.slice(0, 2) : n[0];
    const oct   = parseInt(sharp ? n[2] : n[1]);
    return { note, oct, beats };
  });
}

export const sound = (() => {
  let actx = null, masterGain = null;
  let bgmNodes = [], bgmTimer = null, bgmCurrent = null;
  let _tracks = {}, _sfx = {};

  function init() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = actx.createGain();
    masterGain.gain.value = 0.12;
    masterGain.connect(actx.destination);
  }

  function _scheduleTrack(track, t0) {
    const beat = 60 / track.bpm;
    const nodes = [];
    let maxEnd = t0;
    for (const ch of track.channels) {
      const parsed = _parseNotes(ch.notes);
      let t = t0;
      for (const n of parsed) {
        const dur = n.beats * beat;
        if (!n.rest && actx) {
          const osc  = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = ch.instrument;
          osc.frequency.value = _noteToHz(n.note, n.oct);
          const att = 0.01, rel = Math.min(0.05, dur * 0.25);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.7, t + att);
          gain.gain.setValueAtTime(0.7, t + dur - rel);
          gain.gain.linearRampToValueAtTime(0, t + dur);
          osc.connect(gain); gain.connect(masterGain);
          osc.start(t); osc.stop(t + dur + 0.01);
          nodes.push(osc);
        }
        t += dur;
      }
      maxEnd = Math.max(maxEnd, t);
    }
    return { nodes, duration: maxEnd - t0 };
  }

  function stopBGM() {
    clearTimeout(bgmTimer);
    for (const n of bgmNodes) try { n.stop(0); } catch(e) {}
    bgmNodes = []; bgmCurrent = null;
  }

  function playBGM(name) {
    if (!actx || bgmCurrent === name) return;
    stopBGM();
    const track = _tracks[name];
    if (!track) return;
    bgmCurrent = name;
    function loop() {
      if (bgmCurrent !== name) return;
      const { nodes, duration } = _scheduleTrack(track, actx.currentTime + 0.05);
      bgmNodes.push(...nodes);
      if (track.loop) bgmTimer = setTimeout(loop, Math.max(0, (duration - 0.2) * 1000));
    }
    loop();
  }

  function playSFX(name) {
    if (!actx) return;
    const sfx = _sfx[name];
    if (sfx) _scheduleTrack(sfx, actx.currentTime + 0.01);
  }

  function setVolume(v) { if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v)); }

  return {
    init, playBGM, stopBGM, playSFX, setVolume,
    registerTracks(t) { _tracks = t; },
    registerSFX(s)    { _sfx = s; },
  };
})();

window.addEventListener('keydown', () => sound.init(), { capture: true });
document.addEventListener('pointerdown', () => sound.init(), { once: true });

// All sound is synthesized with the Web Audio API: short oscillator notes with
// quick envelopes, no audio files and no network. The context is created lazily
// on the first user gesture (browsers forbid sound before one), and every effect
// is a tiny helper over one tone so the whole set stays in one place.

function tone(context, master, frequency, seconds, type, volume, when, slideTo) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, when + seconds);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(volume, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(when);
  oscillator.stop(when + seconds + 0.05);
}

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let lastShoot = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) return false;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function ready() {
    return !muted && context && context.state === 'running';
  }

  function play(effect) {
    if (!ready()) return;
    effect(context.currentTime);
  }

  return {
    /** Call from any user gesture so the browser allows sound from then on. */
    unlock() {
      ensure();
    },
    muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    click() {
      play((now) => tone(context, master, 660, 0.07, 'triangle', 0.2, now));
    },
    plant() {
      play((now) => {
        tone(context, master, 220, 0.12, 'sine', 0.4, now, 440);
        tone(context, master, 330, 0.1, 'triangle', 0.2, now + 0.05);
      });
    },
    shoot() {
      // Shots happen several times a second: thin them out so they stay a patter.
      if (!ready()) return;
      const now = performance.now();
      if (now - lastShoot < 90) return;
      lastShoot = now;
      tone(context, master, 880 + Math.random() * 220, 0.05, 'triangle', 0.08, context.currentTime);
    },
    kill() {
      play((now) => tone(context, master, 520, 0.12, 'sine', 0.25, now, 780));
    },
    leak() {
      play((now) => {
        tone(context, master, 140, 0.25, 'sawtooth', 0.35, now, 70);
        tone(context, master, 90, 0.3, 'sine', 0.4, now);
      });
    },
    harvest() {
      play((now) => tone(context, master, 990, 0.1, 'sine', 0.15, now, 1320));
    },
    grow() {
      play((now) => tone(context, master, 392, 0.14, 'triangle', 0.15, now, 523));
    },
    nourish() {
      play((now) => {
        tone(context, master, 523, 0.12, 'triangle', 0.25, now);
        tone(context, master, 784, 0.16, 'triangle', 0.25, now + 0.09);
      });
    },
    sell() {
      play((now) => tone(context, master, 784, 0.1, 'triangle', 0.2, now, 523));
    },
    denied() {
      play((now) => tone(context, master, 180, 0.12, 'square', 0.12, now, 140));
    },
    waveStart() {
      play((now) => {
        tone(context, master, 262, 0.14, 'triangle', 0.3, now);
        tone(context, master, 392, 0.14, 'triangle', 0.3, now + 0.11);
        tone(context, master, 523, 0.2, 'triangle', 0.3, now + 0.22);
      });
    },
    waveClear() {
      play((now) => {
        tone(context, master, 523, 0.12, 'sine', 0.25, now);
        tone(context, master, 659, 0.12, 'sine', 0.25, now + 0.1);
        tone(context, master, 784, 0.2, 'sine', 0.25, now + 0.2);
      });
    },
    draft() {
      // A turning chime: three notes that rise, then settle, like a page turning.
      play((now) => {
        tone(context, master, 440, 0.16, 'triangle', 0.28, now);
        tone(context, master, 587, 0.16, 'triangle', 0.28, now + 0.12);
        tone(context, master, 523, 0.24, 'triangle', 0.28, now + 0.24);
      });
    },
    blessing() {
      // A warm shimmer: a fifth, then its octave, held briefly.
      play((now) => {
        tone(context, master, 659, 0.22, 'sine', 0.3, now);
        tone(context, master, 988, 0.22, 'sine', 0.25, now + 0.08);
        tone(context, master, 1319, 0.3, 'sine', 0.2, now + 0.16);
      });
    },
    combo() {
      // A short tick that climbs: the combo is building.
      play((now) => tone(context, master, 740, 0.08, 'triangle', 0.18, now, 1180));
    },
    sunburst() {
      // Noon light, all at once: a bright chord that rises and rings.
      play((now) => {
        const notes = [784, 988, 1175, 1568];
        notes.forEach((note) => tone(context, master, note, 0.4, 'triangle', 0.22, now));
        tone(context, master, 2093, 0.5, 'sine', 0.18, now + 0.08);
      });
    },
    bossPhase() {
      // The Blight turns: a low snarl that climbs into a snarl.
      play((now) => {
        tone(context, master, 110, 0.35, 'sawtooth', 0.35, now, 165);
        tone(context, master, 220, 0.3, 'sawtooth', 0.2, now + 0.12, 330);
      });
    },
    champion() {
      // A champion falls: a short fanfare, two notes and a fifth.
      play((now) => {
        tone(context, master, 523, 0.14, 'triangle', 0.3, now);
        tone(context, master, 784, 0.2, 'triangle', 0.3, now + 0.12);
        tone(context, master, 1047, 0.3, 'triangle', 0.28, now + 0.26);
      });
    },
    reroll() {
      // The cards turn over: a quick shuffle of three short notes.
      play((now) => {
        tone(context, master, 880, 0.06, 'triangle', 0.18, now);
        tone(context, master, 740, 0.06, 'triangle', 0.18, now + 0.07);
        tone(context, master, 990, 0.1, 'triangle', 0.18, now + 0.14);
      });
    },
    win() {
      play((now) => {
        const notes = [523, 659, 784, 1047];
        notes.forEach((note, index) => tone(context, master, note, 0.3, 'triangle', 0.3, now + index * 0.14));
      });
    },
    lose() {
      play((now) => {
        const notes = [392, 330, 262, 196];
        notes.forEach((note, index) => tone(context, master, note, 0.32, 'triangle', 0.28, now + index * 0.18));
      });
    },
  };
}

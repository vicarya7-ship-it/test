function createNoiseBuffer(context, duration = 2) {
  const frameCount = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    channelData[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function createImpulseResponse(context, duration = 2.6, decay = 2.4) {
  const frameCount = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, frameCount, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);

    for (let index = 0; index < frameCount; index += 1) {
      const envelope = Math.pow(1 - index / frameCount, decay);
      channelData[index] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return impulse;
}

function scheduleEnvelope(gainNode, startTime, peak, duration) {
  gainNode.gain.cancelScheduledValues(startTime);
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.linearRampToValueAtTime(peak, startTime + duration * 0.18);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
}

export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.convolver = null;
    this.reverbGain = null;
    this.noiseBuffer = null;

    this.droneOscillator = null;
    this.droneGain = null;
    this.noiseSource = null;
    this.noiseFilter = null;
    this.noiseGain = null;

    this.heartbeatTimer = null;
    this.currentTension = 0;
  }

  async unlock() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    if (!this.context) {
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.context.destination);

      this.convolver = this.context.createConvolver();
      this.convolver.buffer = createImpulseResponse(this.context);

      this.reverbGain = this.context.createGain();
      this.reverbGain.gain.value = 0.22;
      this.convolver.connect(this.reverbGain);
      this.reverbGain.connect(this.masterGain);

      this.noiseBuffer = createNoiseBuffer(this.context, 2.4);
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    return this.context;
  }

  async startAmbience() {
    const context = await this.unlock();

    if (!context || this.droneOscillator) {
      return;
    }

    this.droneOscillator = context.createOscillator();
    this.droneOscillator.type = "sine";
    this.droneOscillator.frequency.value = 40;

    this.droneGain = context.createGain();
    this.droneGain.gain.value = 0.0001;

    this.droneOscillator.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);
    this.droneGain.connect(this.convolver);

    this.noiseSource = context.createBufferSource();
    this.noiseSource.buffer = this.noiseBuffer;
    this.noiseSource.loop = true;

    this.noiseFilter = context.createBiquadFilter();
    this.noiseFilter.type = "lowpass";
    this.noiseFilter.frequency.value = 220;
    this.noiseFilter.Q.value = 0.9;

    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0.0001;

    this.noiseSource.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.convolver);
    this.noiseGain.connect(this.masterGain);

    this.droneOscillator.start();
    this.noiseSource.start();

    this.startHeartbeat();
    this.updateTension(0);
  }

  stopAmbience(fadeSeconds = 0.8) {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;
    const droneOscillator = this.droneOscillator;
    const droneGain = this.droneGain;
    const noiseSource = this.noiseSource;
    const noiseFilter = this.noiseFilter;
    const noiseGain = this.noiseGain;

    if (droneGain) {
      droneGain.gain.cancelScheduledValues(now);
      droneGain.gain.setValueAtTime(Math.max(droneGain.gain.value, 0.0001), now);
      droneGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
    }

    if (noiseGain) {
      noiseGain.gain.cancelScheduledValues(now);
      noiseGain.gain.setValueAtTime(Math.max(noiseGain.gain.value, 0.0001), now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
    }

    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.droneOscillator = null;
    this.droneGain = null;
    this.noiseSource = null;
    this.noiseFilter = null;
    this.noiseGain = null;

    const cleanupDelay = Math.max(200, fadeSeconds * 1000 + 120);
    window.setTimeout(() => {
      try {
        droneOscillator?.stop();
      } catch (error) {
        console.debug(error);
      }

      try {
        noiseSource?.stop();
      } catch (error) {
        console.debug(error);
      }

      droneOscillator?.disconnect();
      droneGain?.disconnect();
      noiseSource?.disconnect();
      noiseFilter?.disconnect();
      noiseGain?.disconnect();
    }, cleanupDelay);
  }

  startHeartbeat() {
    if (!this.context || this.heartbeatTimer) {
      return;
    }

    const beat = () => {
      if (!this.context) {
        return;
      }

      const now = this.context.currentTime + 0.02;
      const intensity = 0.08 + this.currentTension * 0.18;
      this.playHeartbeatPulse(now, intensity);
      this.playHeartbeatPulse(now + 0.18, intensity * 0.72);
    };

    beat();
    this.heartbeatTimer = window.setInterval(beat, 1200);
  }

  playHeartbeatPulse(startTime, peak) {
    if (!this.context) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();
    const filterNode = this.context.createBiquadFilter();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(54, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(42, startTime + 0.16);

    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(120, startTime);

    scheduleEnvelope(gainNode, startTime, peak, 0.24);

    oscillator.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(this.masterGain);
    gainNode.connect(this.convolver);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.26);
  }

  updateTension(tension) {
    if (!this.context) {
      return;
    }

    this.currentTension = Math.min(Math.max(tension, 0), 1);
    const now = this.context.currentTime;

    if (this.droneGain) {
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setTargetAtTime(0.012 + this.currentTension * 0.05, now, 0.2);
    }

    if (this.noiseGain) {
      const noiseAmount = this.currentTension < 0.4 ? 0.0001 : 0.006 + this.currentTension * 0.055;
      this.noiseGain.gain.cancelScheduledValues(now);
      this.noiseGain.gain.setTargetAtTime(noiseAmount, now, 0.2);
    }

    if (this.noiseFilter) {
      this.noiseFilter.frequency.cancelScheduledValues(now);
      this.noiseFilter.frequency.setTargetAtTime(240 - this.currentTension * 120, now, 0.15);
    }
  }

  async playPieceMove() {
    const context = await this.unlock();

    if (!context) {
      return;
    }

    const startTime = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(640, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(280, startTime + 0.08);

    scheduleEnvelope(gainNode, startTime, 0.04, 0.09);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.1);
  }

  async playClear() {
    const context = await this.unlock();

    if (!context) {
      return;
    }

    const notes = [329.63, 415.3, 493.88];
    const baseTime = context.currentTime + 0.04;

    notes.forEach((frequency, index) => {
      const startTime = baseTime + index * 0.18;
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.04, startTime + 0.22);

      scheduleEnvelope(gainNode, startTime, 0.055, 0.34);

      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain);
      gainNode.connect(this.convolver);

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.36);
    });
  }

  async playGameOverScream() {
    const context = await this.unlock();

    if (!context) {
      return;
    }

    const startTime = context.currentTime + 0.02;

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(context, 0.6);

    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(900, startTime);
    noiseFilter.Q.value = 0.7;

    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, startTime);
    noiseGain.gain.linearRampToValueAtTime(0.28, startTime + 0.08);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.5);

    const highOscillator = context.createOscillator();
    highOscillator.type = "sawtooth";
    highOscillator.frequency.setValueAtTime(1250, startTime);
    highOscillator.frequency.exponentialRampToValueAtTime(420, startTime + 0.46);

    const highGain = context.createGain();
    highGain.gain.setValueAtTime(0.0001, startTime);
    highGain.gain.linearRampToValueAtTime(0.12, startTime + 0.08);
    highGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.5);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseGain.connect(this.convolver);

    highOscillator.connect(highGain);
    highGain.connect(this.masterGain);

    noiseSource.start(startTime);
    noiseSource.stop(startTime + 0.52);
    highOscillator.start(startTime);
    highOscillator.stop(startTime + 0.52);
  }
}

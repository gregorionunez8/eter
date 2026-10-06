/** Original Web Audio foley and restrained region ambience; no copyrighted recordings/music. */
export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private ambience?: AudioBufferSourceNode;
  private ambientGain?: GainNode;
  private region = '';
  private muted = true;
  private stepAt = 0;
  private birdAt = 0;
  private tracks: Partial<Record<string, string>> = {};
  private music?: HTMLAudioElement;
  private liveSounds = 0;
  setMuted(muted: boolean): void { this.muted = muted; if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.context.currentTime, 0.08); if (this.music) this.music.muted = muted; }
  start(): void {
    if (this.muted) return;
    try {
      if (!this.context) {
        this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = 0.5; this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
        const data = this.noise.getChannelData(0); let seed = 23;
        for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
      }
      void this.context.resume();
    } catch { /* Audio remains optional when a browser disallows audio initialization. */ }
  }
  private tone(frequency: number, end: number, duration: number, volume: number, type: OscillatorType = 'sine'): void {
    if (!this.context || !this.master || this.liveSounds > 18) return;
    const c = this.context, gain = c.createGain(), oscillator = c.createOscillator(); this.liveSounds++;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, c.currentTime); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), c.currentTime + duration);
    gain.gain.setValueAtTime(volume, c.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    oscillator.connect(gain); gain.connect(this.master); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.liveSounds--; }; oscillator.start(); oscillator.stop(c.currentTime + duration + 0.02);
  }
  private foley(duration: number, frequency: number, volume: number): void {
    if (!this.context || !this.master || !this.noise || this.liveSounds > 18) return;
    const c = this.context, source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(); this.liveSounds++;
    source.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume, c.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.liveSounds--; }; source.start(); source.stop(c.currentTime + duration + 0.02);
  }
  play(kind: string, lootKind?: string): void {
    if (this.muted) return; this.start();
    if (kind === 'pickup') {
      if (lootKind === 'ether') { this.tone(720, 1080, 0.38, 0.07); this.tone(1080, 1440, 0.5, 0.035); }
      else if (lootKind === 'crowns') { this.tone(1800, 1200, 0.11, 0.045); this.foley(0.1, 4200, 0.035); }
      else { this.foley(0.12, 1100, 0.07); this.tone(520, 650, 0.13, 0.025); }
    } else if (kind === 'magic' || kind === 'single' || kind === 'blink' || kind === 'area') { this.foley(0.2, 1800, 0.055); this.tone(420, 190, 0.3, 0.045, 'triangle'); }
    else if (kind === 'hit' || kind === 'received') { this.foley(0.16, 650, 0.15); this.tone(140, 65, 0.12, 0.1, 'triangle'); }
    else if (kind === 'death') { this.foley(0.35, 280, 0.09); this.tone(130, 45, 0.32, 0.025); }
    else if (kind === 'bow') { this.foley(0.1, 2400, 0.085); this.tone(210, 110, 0.1, 0.045, 'triangle'); }
    else if (kind === 'npc' || kind === 'inventory') { this.foley(0.07, 1300, 0.045); this.tone(280, 330, 0.07, 0.025); }
    else { this.tone(260, 420, 0.2, 0.04, 'triangle'); }
  }
  /** Tracks are opt-in licensed URLs; no low-quality generated music loop is supplied. */
  setRegionTracks(tracks: Partial<Record<string, string>>): void { this.tracks = { ...tracks }; }
  update(region: string, walking: boolean, now: number): void {
    if (this.muted || !this.context || !this.master) return;
    if (region !== this.region) {
      this.region = region;
      this.ambience?.stop(); this.ambience?.disconnect(); this.ambientGain?.disconnect();
      const source = this.context.createBufferSource(), gain = this.context.createGain(), filter = this.context.createBiquadFilter();
      source.buffer = this.noise!; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = region === 'Whisperwood' ? 850 : region === 'Stonepass' ? 380 : 550;
      gain.gain.value = region === 'Aurelia' ? 0.007 : 0.012; source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(); this.ambience = source; this.ambientGain = gain;
      this.music?.pause(); this.music = undefined;
      if (this.tracks[region]) { this.music = new Audio(this.tracks[region]); this.music.loop = true; this.music.volume = 0.18; void this.music.play().catch(() => {}); }
    }
    if (walking && now > this.stepAt) { this.foley(0.07, region === 'Aurelia' ? 850 : 500, 0.045); this.stepAt = now + 340; }
    if ((region === 'Greenfields' || region === 'Whisperwood') && now > this.birdAt) { this.tone(1650, 2100, 0.11, 0.01); this.birdAt = now + 9000; }
  }
  suspendAmbience(): void { this.ambience?.stop(); this.ambience?.disconnect(); this.ambience = undefined; this.ambientGain?.disconnect(); this.music?.pause(); this.region = ''; }
}

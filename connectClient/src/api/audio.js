/* voice-controls.js
 * Vanilla-JS-Komponente: Mikro-Lautstärke, Empfindlichkeit (Noise Gate),
 * Kopfhörer-Lautstärke und optional KI-Rauschfilter (RNNoise).
 *
 * Nutzung:
 *   import { VoiceControls } from "./voice-controls.js";
 *   const vc = new VoiceControls(document.querySelector("#voice"), {
 *     onStream: (stream) => { ...stream an PeerConnection hängen... },
 *   });
 *   vc.setRemoteStream(remoteStream);   // Audio der anderen abspielen
 *   vc.destroy();                       // beim Verlassen der Page
 *
 * Mit RNNoise (npm i @sapphi-red/web-noise-suppressor, Beispiel für Vite):
 *   import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
 *   import workletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
 *   import wasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
 *   import simdUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
 *
 *   new VoiceControls(el, {
 *     rnnoise: { loadRnnoise, RnnoiseWorkletNode, workletUrl, wasmUrl, simdUrl },
 *   });
 *
 * Signalweg: Mikro -> [RNNoise] -> Gain -> Noise Gate -> Stream
 */

const GATE_WORKLET = `
class GateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "threshold", defaultValue: -50, minValue: -100, maxValue: 0 }];
  }
  constructor() {
    super();
    this.g = 0;
    this.open = false;
    this.hold = 0;
    this.sinceReport = 0;
    this.attack = 1 - Math.exp(-1 / (0.005 * sampleRate));
    this.release = 1 - Math.exp(-1 / (0.08 * sampleRate));
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length) return true;

    const ch0 = input[0];
    let sum = 0;
    for (let i = 0; i < ch0.length; i++) sum += ch0[i] * ch0[i];
    const db = 20 * Math.log10(Math.sqrt(sum / ch0.length) + 1e-9);
    const thr = params.threshold[0];
    const blockSec = ch0.length / sampleRate;

    if (db > thr) {
      this.open = true;
      this.hold = 0.15;
    } else if (this.open) {
      this.hold -= blockSec;
      if (this.hold <= 0) this.open = false;
    }

    const target = this.open ? 1 : 0;
    for (let i = 0; i < ch0.length; i++) {
      this.g += (target - this.g) * (target > this.g ? this.attack : this.release);
      for (let c = 0; c < output.length; c++) {
        output[c][i] = (input[c] || input[0])[i] * this.g;
      }
    }

    this.sinceReport += blockSec;
    if (this.sinceReport >= 0.05) {
      this.sinceReport = 0;
      this.port.postMessage(db);
    }
    return true;
  }
}
registerProcessor("gate", GateProcessor);
`;

const STYLE = `
.vc { display: grid; gap: 16px; max-width: 360px; font: inherit; }
.vc-row { display: grid; gap: 6px; }
.vc-head { display: flex; justify-content: space-between; }
.vc input[type=range] { width: 100%; }
.vc-check { display: flex; gap: 8px; align-items: center; cursor: pointer; }
.vc-meter { position: relative; height: 8px; border-radius: 4px;
  background: rgba(128,128,128,.25); overflow: hidden; }
.vc-level { height: 100%; width: 0; background: #888; transition: width 50ms linear; }
.vc-level.open { background: #3ba55d; }
.vc-mark { position: absolute; top: 0; bottom: 0; width: 2px; background: currentColor; }
.vc-error { color: #d33; margin: 0; }
.vc-error:empty { display: none; }
`;

const DB_MIN = -80;
const toPct = (db) => Math.min(100, Math.max(0, ((db - DB_MIN) / -DB_MIN) * 100));

export class VoiceControls {
  /**
   * @param {HTMLElement} container
   * @param {object} [opts]
   * @param {(stream: MediaStream) => void} [opts.onStream]  bearbeiteter Mikro-Stream
   * @param {HTMLAudioElement} [opts.audioElement]           eigenes <audio> für Remote-Audio
   * @param {string} [opts.deviceId]                         bestimmtes Mikro
   * @param {HTMLElement} [opts.headphoneContainer]           separater Kopfhörer-Regler
   * @param {(volume: number) => void} [opts.onHeadphoneVolumeChange]
   * @param {object} [opts.rnnoise]                          aktiviert den KI-Rauschfilter-Toggle
   * @param {Function} opts.rnnoise.loadRnnoise
   * @param {Function} opts.rnnoise.RnnoiseWorkletNode
   * @param {string} opts.rnnoise.workletUrl
   * @param {string} opts.rnnoise.wasmUrl
   * @param {string} [opts.rnnoise.simdUrl]
   * @param {string} [opts.storageKey="voice"]               localStorage-Prefix
   */
  constructor(container, {
    onStream,
    audioElement,
    deviceId,
    headphoneContainer,
    onHeadphoneVolumeChange,
    onNoiseSuppressionChange,
    rnnoise,
    storageKey = "voice",
  } = {}) {
    this.container = container;
    this.headphoneContainer = headphoneContainer;
    this.onStream = onStream;
    this.onHeadphoneVolumeChange = onHeadphoneVolumeChange;
    this.onNoiseSuppressionChange = onNoiseSuppressionChange;
    this.rnnoise = rnnoise;
    this.deviceId = deviceId;
    this.storageKey = storageKey;
    this.stream = null;
    this._nodes = null;
    this._raw = null;
    this._rnnoiseWasm = null;
    this._wiring = Promise.resolve();
    this._destroyed = false;

    this.settings = {
      micGain: 1,
      thresholdDb: -50,
      headVol: 1,
      noiseSuppression: true,
      rnnoise: false,
      ...this._load(),
    };

    this.audio = audioElement ?? document.createElement("audio");
    this.audio.autoplay = true;
    this.audio.volume = this.settings.headVol;
    this.monitorAudio = document.createElement("audio");
    this.monitorAudio.autoplay = true;
    this.monitorAudio.hidden = true;

    this._injectStyle();
    this._render();
    this.start();
  }

  /* ---------- Öffentliche API ---------- */

  setRemoteStream(stream) {
    this.audio.srcObject = stream ?? null;
  }

  async setMonitoring(enabled) {
    if (!enabled) {
      this.monitorAudio.pause();
      this.monitorAudio.srcObject = null;
      return;
    }
    if (!this.stream) throw new Error("The microphone is not ready yet.");

    this.monitorAudio.srcObject = this.stream;
    try {
      await this.monitorAudio.play();
    } catch (error) {
      this.monitorAudio.srcObject = null;
      throw error;
    }
  }

  setMicGain(v) {
    this.settings.micGain = v;
    if (this._nodes) {
      const { ctx, gainNode } = this._nodes;
      gainNode.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
    }
    this._save();
  }

  setThreshold(db) {
    this.settings.thresholdDb = db;
    this._nodes?.gate.parameters.get("threshold").setValueAtTime(db, 0);
    this.mark.style.left = `${toPct(db)}%`;
    this._save();
  }

  setHeadphoneVolume(v) {
    this.settings.headVol = v;
    this.audio.volume = Math.min(1, Math.max(0, v));
    this.onHeadphoneVolumeChange?.(this.audio.volume);
    this._save();
  }

  setNoiseSuppression(on) {
    this.settings.noiseSuppression = !!on;
    if (this.noiseSuppressionToggle) this.noiseSuppressionToggle.checked = !!on;
    this._save();
    const enabled = this.settings.noiseSuppression && !(this.rnnoise && this.settings.rnnoise);
    const trackUpdate = this._raw?.getAudioTracks()[0]?.applyConstraints({ noiseSuppression: enabled });
    return Promise.all([
      trackUpdate,
      this.onNoiseSuppressionChange?.(this.settings.noiseSuppression),
    ]);
  }

  /** KI-Rauschfilter live ein-/ausschalten (nur wenn opts.rnnoise übergeben wurde) */
  setRnnoise(on) {
    if (!this.rnnoise) return Promise.resolve();
    this.settings.rnnoise = !!on;
    if (this.rnnoiseToggle) this.rnnoiseToggle.checked = !!on;
    this._save();
    return this._queueWire();
  }

  async start() {
    if (this._nodes) return;
    try {
      const raw = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
          echoCancellation: true,
          // Browser-Filter aus, wenn RNNoise übernimmt (sonst doppelt gefiltert)
          noiseSuppression: this.settings.noiseSuppression && !(this.rnnoise && this.settings.rnnoise),
          autoGainControl: false,
          channelCount: { ideal: 1 },
        },
      });
      if (this._destroyed) return raw.getTracks().forEach((t) => t.stop());

      // RNNoise arbeitet intern mit 48 kHz
      const ctx = new AudioContext(this.rnnoise ? { sampleRate: 48000 } : undefined);
      const url = URL.createObjectURL(new Blob([GATE_WORKLET], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      if (this._destroyed) {
        raw.getTracks().forEach((t) => t.stop());
        return ctx.close();
      }

      const src = ctx.createMediaStreamSource(raw);
      const gainNode = ctx.createGain();
      gainNode.gain.value = this.settings.micGain;
      const gate = new AudioWorkletNode(ctx, "gate", {
        parameterData: { threshold: this.settings.thresholdDb },
      });
      gate.port.onmessage = (e) => this._updateMeter(e.data);
      const dest = ctx.createMediaStreamDestination();

      gainNode.connect(gate).connect(dest);
      await ctx.resume();

      this._raw = raw;
      this._nodes = { ctx, src, gainNode, gate, rnnoise: null };
      await this._queueWire(); // src -> [RNNoise] -> gain

      this.stream = dest.stream;
      this.errorEl.textContent = "";
      this.onStream?.(this.stream);
    } catch (e) {
      this.errorEl.textContent = `Mikrofon nicht verfügbar: ${e.message}`;
    }
  }

  stop() {
    void this.setMonitoring(false);
    this._raw?.getTracks().forEach((t) => t.stop());
    this._nodes?.ctx.close().catch(() => {});
    this._raw = null;
    this._nodes = null;
    this.stream = null;
  }

  destroy() {
    this._destroyed = true;
    this.stop();
    this.audio.srcObject = null;
    this.container.innerHTML = "";
    if (this.headphoneContainer && this.headphoneContainer !== this.container) {
      this.headphoneContainer.innerHTML = "";
    }
  }

  /* ---------- Intern ---------- */

  // Verdrahtung nacheinander abarbeiten, damit schnelles Umschalten nichts doppelt verbindet
  _queueWire() {
    this._wiring = this._wiring.then(() => this._wireInput()).catch(() => {});
    return this._wiring;
  }

  async _wireInput() {
    const n = this._nodes;
    if (!n) return;
    const want = !!this.rnnoise && this.settings.rnnoise;

    n.src.disconnect();
    n.rnnoise?.disconnect();

    if (want) {
      try {
        if (!n.rnnoise) n.rnnoise = await this._createRnnoise(n.ctx);
        if (this._nodes !== n) return; // inzwischen gestoppt
        n.src.connect(n.rnnoise);
        n.rnnoise.connect(n.gainNode);
      } catch (e) {
        this.settings.rnnoise = false;
        this._save();
        if (this.rnnoiseToggle) this.rnnoiseToggle.checked = false;
        this.errorEl.textContent = `KI-Rauschfilter nicht verfügbar: ${e.message}`;
        if (this._nodes === n) n.src.connect(n.gainNode);
        return;
      }
    } else {
      n.src.connect(n.gainNode);
    }

    // Browser-eigene Rauschunterdrückung nur nutzen, wenn RNNoise aus ist
    if (this.rnnoise) {
      this._raw
        ?.getAudioTracks()[0]
        ?.applyConstraints({ noiseSuppression: this.settings.noiseSuppression && !want })
        .catch(() => {});
    }
  }

  async _createRnnoise(ctx) {
    const { loadRnnoise, RnnoiseWorkletNode, workletUrl, wasmUrl, simdUrl } = this.rnnoise;
    if (!this._rnnoiseWasm) {
      this._rnnoiseWasm = await loadRnnoise({ url: wasmUrl, simdUrl });
    }
    await ctx.audioWorklet.addModule(workletUrl);
    return new RnnoiseWorkletNode(ctx, { wasmBinary: this._rnnoiseWasm, maxChannels: 2 });
  }

  _render() {
    const s = this.settings;
    const noiseSuppressionRow = `
      <div class="vc-row">
        <label class="vc-check">
          <input id="vc-noise-suppression" type="checkbox" ${s.noiseSuppression ? "checked" : ""}>
          Noise suppression
        </label>
      </div>`;
    const rnnoiseRow = this.rnnoise
      ? `<div class="vc-row">
          <label class="vc-check">
            <input id="vc-rnnoise" type="checkbox" ${s.rnnoise ? "checked" : ""}>
            KI-Rauschfilter (RNNoise)
          </label>
        </div>`
      : "";

    const micControls = `
      <div class="vc">
        <p class="vc-error" role="alert"></p>

        <div class="vc-row">
          <div class="vc-head">
            <label for="vc-mic">Mikrofon-Lautstärke</label>
            <span data-out="mic">${Math.round(s.micGain * 100)} %</span>
          </div>
          <input id="vc-mic" type="range" min="0" max="2" step="0.01" value="${s.micGain}">
        </div>

        ${noiseSuppressionRow}
        ${rnnoiseRow}

        <div class="vc-row">
          <div class="vc-head">
            <label for="vc-sens">Empfindlichkeit</label>
            <span data-out="sens">${s.thresholdDb} dB</span>
          </div>
          <div class="vc-meter" aria-hidden="true">
            <div class="vc-level"></div>
            <div class="vc-mark" style="left:${toPct(s.thresholdDb)}%"></div>
          </div>
          <input id="vc-sens" type="range" min="${DB_MIN}" max="0" step="1" value="${s.thresholdDb}">
        </div>
      </div>`;
    const headphoneControl = `
      <div class="vc">
        <div class="vc-row">
          <div class="vc-head">
            <label for="vc-head">Kopfhörer-Lautstärke</label>
            <span data-out="head">${Math.round(s.headVol * 100)} %</span>
          </div>
          <input id="vc-head" type="range" min="0" max="1" step="0.01" value="${s.headVol}">
        </div>
      </div>`;

    const headphoneTarget = this.headphoneContainer || this.container;
    // Ohne eigenen Container kommt der Kopfhörer-Regler mit in den Hauptcontainer
    this.container.innerHTML = micControls + (this.headphoneContainer ? "" : headphoneControl);
    if (this.headphoneContainer) this.headphoneContainer.innerHTML = headphoneControl;

    const q = (sel) => this.container.querySelector(sel);
    const qHeadphone = (sel) => headphoneTarget.querySelector(sel);
    this.errorEl = q(".vc-error");
    this.level = q(".vc-level");
    this.mark = q(".vc-mark");
    this.noiseSuppressionToggle = q("#vc-noise-suppression");
    this.rnnoiseToggle = q("#vc-rnnoise");

    q("#vc-mic").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      q('[data-out="mic"]').textContent = `${Math.round(v * 100)} %`;
      this.setMicGain(v);
    });
    q("#vc-sens").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      q('[data-out="sens"]').textContent = `${v} dB`;
      this.setThreshold(v);
    });
    this.noiseSuppressionToggle.addEventListener("change", (e) => {
      this.errorEl.textContent = "";
      this.setNoiseSuppression(e.target.checked).catch((error) => {
        this.errorEl.textContent = `Could not change noise suppression: ${error.message}`;
      });
    });
    this.rnnoiseToggle?.addEventListener("change", (e) => {
      this.errorEl.textContent = "";
      this.setRnnoise(e.target.checked);
    });
    qHeadphone("#vc-head").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      qHeadphone('[data-out="head"]').textContent = `${Math.round(v * 100)} %`;
      this.setHeadphoneVolume(v);
    });

    if (!this.audio.isConnected) headphoneTarget.appendChild(this.audio);
    this.container.appendChild(this.monitorAudio);
  }

  _updateMeter(db) {
    this.level.style.width = `${toPct(db)}%`;
    this.level.classList.toggle("open", db > this.settings.thresholdDb);
  }

  _injectStyle() {
    if (document.getElementById("vc-style")) return;
    const el = document.createElement("style");
    el.id = "vc-style";
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || "{}");
    } catch {
      return {};
    }
  }

  _save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch {}
  }
}
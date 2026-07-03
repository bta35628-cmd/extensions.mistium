// Name: Microphone Stream
// Author: Mistium
// Description: Stream microphone analysis and keep a configurable rolling recording buffer.

// License: MPL-2.0
// This Source Code is subject to the terms of the Mozilla Public License, v2.0,
// If a copy of the MPL was not distributed with this file,
// Then you can obtain one at https://mozilla.org/MPL/2.0/

(function (Scratch) {
  "use strict";

  if (!Scratch.extensions.unsandboxed) {
    throw new Error("Microphone Stream must run unsandboxed.");
  }

  const Cast = Scratch.Cast;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const clampInt = (value, min, max) => Math.round(clamp(Number(value) || min, min, max));

  class MicrophoneStream {
    constructor(runtime) {
      this.runtime = runtime;
      this.stream = null;
      this.audioContext = null;
      this.source = null;
      this.analyser = null;
      this.timeData = null;
      this.frequencyData = null;
      this.updateTimer = null;

      this.mediaRecorder = null;
      this.chunks = [];
      this.rollingSeconds = 10;
      this.recordingMimeType = "";
      this.recordingStartedAt = 0;
      this.lastObjectUrl = "";
      this.lastError = "";

      this.frame = {
        loudness: 0,
        peak: 0,
        decibels: -100,
        pitch: 0,
        frequency: 0,
        sampleRate: 0,
        fftSize: 0,
        bufferSeconds: 10,
        recordingBytes: 0,
        recordingSeconds: 0
      };
    }

    getInfo() {
      return {
        id: "MistiumMicrophoneStream",
        name: "Microphone Stream",
        color1: "#d95f43",
        blocks: [
          {
            opcode: "startStream",
            blockType: Scratch.BlockType.COMMAND,
            text: "start microphone stream rolling buffer [SECONDS] seconds fft size [FFT]",
            arguments: {
              SECONDS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
              FFT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2048 }
            }
          },
          {
            opcode: "stopStream",
            blockType: Scratch.BlockType.COMMAND,
            text: "stop microphone stream"
          },
          {
            opcode: "isStreaming",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "microphone streaming?"
          },
          {
            opcode: "whenFrame",
            blockType: Scratch.BlockType.EVENT,
            text: "when microphone data updates",
            isEdgeActivated: false
          },
          "---",
          {
            opcode: "getInfoValue",
            blockType: Scratch.BlockType.REPORTER,
            text: "current [INFO]",
            arguments: {
              INFO: { menu: "INFO" }
            }
          },
          {
            opcode: "getAllInfo",
            blockType: Scratch.BlockType.REPORTER,
            text: "all microphone info"
          },
          {
            opcode: "getWaveform",
            blockType: Scratch.BlockType.REPORTER,
            text: "waveform [COUNT] samples as JSON",
            arguments: {
              COUNT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 128 }
            }
          },
          {
            opcode: "getFrequencyData",
            blockType: Scratch.BlockType.REPORTER,
            text: "frequency data [COUNT] bins as JSON",
            arguments: {
              COUNT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 128 }
            }
          },
          "---",
          {
            opcode: "startRecording",
            blockType: Scratch.BlockType.COMMAND,
            text: "start recording as [TYPE] every [TIMESLICE] ms",
            arguments: {
              TYPE: { menu: "MIME_TYPES" },
              TIMESLICE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 250 }
            }
          },
          {
            opcode: "stopRecording",
            blockType: Scratch.BlockType.COMMAND,
            text: "stop recording"
          },
          {
            opcode: "pauseRecording",
            blockType: Scratch.BlockType.COMMAND,
            text: "pause recording"
          },
          {
            opcode: "resumeRecording",
            blockType: Scratch.BlockType.COMMAND,
            text: "resume recording"
          },
          {
            opcode: "clearRecording",
            blockType: Scratch.BlockType.COMMAND,
            text: "clear recording buffer"
          },
          {
            opcode: "isRecording",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "recording?"
          },
          {
            opcode: "isRecordingPaused",
            blockType: Scratch.BlockType.BOOLEAN,
            text: "recording paused?"
          },
          "---",
          {
            opcode: "setRollingSeconds",
            blockType: Scratch.BlockType.COMMAND,
            text: "set rolling buffer to [SECONDS] seconds",
            arguments: {
              SECONDS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 }
            }
          },
          {
            opcode: "getRollingSeconds",
            blockType: Scratch.BlockType.REPORTER,
            text: "rolling buffer seconds"
          },
          {
            opcode: "getRecordingSize",
            blockType: Scratch.BlockType.REPORTER,
            text: "current recording size in [UNIT]",
            arguments: {
              UNIT: { menu: "SIZE_UNITS" }
            }
          },
          {
            opcode: "getRecordingDuration",
            blockType: Scratch.BlockType.REPORTER,
            text: "current recording seconds"
          },
          {
            opcode: "getRecordingDataUri",
            blockType: Scratch.BlockType.REPORTER,
            text: "current recording as data URI"
          },
          {
            opcode: "getRecordingObjectUrl",
            blockType: Scratch.BlockType.REPORTER,
            text: "current recording as object URL"
          },
          {
            opcode: "getChunkCount",
            blockType: Scratch.BlockType.REPORTER,
            text: "recording chunk count"
          },
          {
            opcode: "getLastError",
            blockType: Scratch.BlockType.REPORTER,
            text: "last microphone error"
          }
        ],
        menus: {
          INFO: {
            acceptReporters: true,
            items: [
              "loudness",
              "peak",
              "decibels",
              "pitch",
              "frequency",
              "sampleRate",
              "fftSize",
              "bufferSeconds",
              "recordingBytes",
              "recordingSeconds",
              "mimeType"
            ]
          },
          MIME_TYPES: {
            acceptReporters: true,
            items: [
              "auto",
              "audio/webm",
              "audio/webm;codecs=opus",
              "audio/ogg;codecs=opus",
              "audio/mp4"
            ]
          },
          SIZE_UNITS: {
            acceptReporters: true,
            items: ["bytes", "KB", "MB"]
          }
        }
      };
    }

    async startStream(args) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.lastError = "Microphone capture is not supported in this browser.";
        return;
      }

      this.setRollingSeconds({ SECONDS: args.SECONDS });

      if (this.stream) {
        this.configureAnalyser(args.FFT);
        return;
      }

      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        });

        await this.audioContext.resume();
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.configureAnalyser(args.FFT);
        this.source.connect(this.analyser);
        this.startUpdates();
        this.lastError = "";
      } catch (error) {
        this.lastError = error && error.message ? error.message : String(error);
        await this.stopStream();
      }
    }

    async stopStream() {
      this.stopUpdates();
      await this.stopRecording();

      if (this.source) {
        this.source.disconnect();
        this.source = null;
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      if (this.audioContext) {
        await this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }

      this.analyser = null;
      this.timeData = null;
      this.frequencyData = null;
      this.resetFrame();
    }

    isStreaming() {
      return !!this.stream;
    }

    whenFrame() {
      return true;
    }

    configureAnalyser(fftSize) {
      const validSize = this.validFftSize(fftSize);
      if (!this.audioContext) return;

      const oldAnalyser = this.analyser;
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = validSize;
      this.analyser.smoothingTimeConstant = 0.25;
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

      if (this.source && oldAnalyser) {
        this.source.disconnect(oldAnalyser);
        this.source.connect(this.analyser);
      }
    }

    validFftSize(value) {
      const requested = clampInt(value, 32, 32768);
      let size = 32;
      while (size < requested && size < 32768) size *= 2;
      return size;
    }

    startUpdates() {
      this.stopUpdates();
      this.updateFrame();
      this.updateTimer = setInterval(() => this.updateFrame(), 50);
    }

    stopUpdates() {
      if (this.updateTimer) {
        clearInterval(this.updateTimer);
        this.updateTimer = null;
      }
    }

    updateFrame() {
      if (!this.analyser || !this.timeData || !this.frequencyData) return;

      this.analyser.getFloatTimeDomainData(this.timeData);
      this.analyser.getByteFrequencyData(this.frequencyData);

      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const sample = this.timeData[i];
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }

      const rms = Math.sqrt(sumSquares / this.timeData.length);
      const decibels = rms > 0 ? 20 * Math.log10(rms) : -100;
      const frequency = this.findDominantFrequency();
      const pitch = this.findPitch();

      this.frame = {
        loudness: this.round(clamp(rms * 140, 0, 100)),
        peak: this.round(clamp(peak * 100, 0, 100)),
        decibels: this.round(clamp(decibels, -100, 0)),
        pitch: this.round(pitch),
        frequency: this.round(frequency),
        sampleRate: this.audioContext ? this.audioContext.sampleRate : 0,
        fftSize: this.analyser.fftSize,
        bufferSeconds: this.rollingSeconds,
        recordingBytes: this.getRecordingBytes(),
        recordingSeconds: this.getRecordingDuration(),
        mimeType: this.recordingMimeType
      };

      if (this.runtime && typeof this.runtime.startHats === "function") {
        this.runtime.startHats("MistiumMicrophoneStream_whenFrame");
      }
    }

    findDominantFrequency() {
      if (!this.frequencyData || !this.audioContext || !this.analyser) return 0;

      let maxValue = 0;
      let maxIndex = 0;
      for (let i = 1; i < this.frequencyData.length; i++) {
        if (this.frequencyData[i] > maxValue) {
          maxValue = this.frequencyData[i];
          maxIndex = i;
        }
      }

      if (maxValue < 8) return 0;
      return maxIndex * this.audioContext.sampleRate / this.analyser.fftSize;
    }

    findPitch() {
      if (!this.timeData || !this.audioContext) return 0;

      let rms = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        rms += this.timeData[i] * this.timeData[i];
      }
      rms = Math.sqrt(rms / this.timeData.length);
      if (rms < 0.01) return 0;

      const sampleRate = this.audioContext.sampleRate;
      const minLag = Math.floor(sampleRate / 1200);
      const maxLag = Math.min(Math.floor(sampleRate / 50), this.timeData.length - 1);
      let bestLag = -1;
      let bestCorrelation = 0;

      for (let lag = minLag; lag <= maxLag; lag++) {
        let correlation = 0;
        for (let i = 0; i < this.timeData.length - lag; i++) {
          correlation += this.timeData[i] * this.timeData[i + lag];
        }
        correlation /= this.timeData.length - lag;

        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestLag = lag;
        }
      }

      if (bestLag <= 0 || bestCorrelation < 0.002) return 0;
      return sampleRate / bestLag;
    }

    getLoudness() {
      return this.frame.loudness;
    }

    getPeak() {
      return this.frame.peak;
    }

    getDecibels() {
      return this.frame.decibels;
    }

    getPitch() {
      return this.frame.pitch;
    }

    getFrequency() {
      return this.frame.frequency;
    }

    getInfoValue(args) {
      const key = Cast.toString(args.INFO);
      return Object.prototype.hasOwnProperty.call(this.frame, key) ? this.frame[key] : "";
    }

    getAllInfo() {
      return JSON.stringify(this.frame);
    }

    getWaveform(args) {
      if (!this.timeData) return "[]";
      const count = clampInt(args.COUNT, 1, 2048);
      return JSON.stringify(this.downsample(this.timeData, count, value => this.round(value)));
    }

    getFrequencyData(args) {
      if (!this.frequencyData) return "[]";
      const count = clampInt(args.COUNT, 1, 2048);
      return JSON.stringify(this.downsample(this.frequencyData, count, value => value));
    }

    downsample(data, count, mapper) {
      if (count >= data.length) {
        return Array.from(data, mapper);
      }

      const result = [];
      const step = data.length / count;
      for (let i = 0; i < count; i++) {
        result.push(mapper(data[Math.floor(i * step)]));
      }
      return result;
    }

    async startRecording(args) {
      if (!this.stream) {
        await this.startStream({ SECONDS: this.rollingSeconds, FFT: 2048 });
      }

      if (!this.stream || typeof MediaRecorder === "undefined") {
        this.lastError = "Recording is not supported in this browser.";
        return;
      }

      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") return;

      try {
        const mimeType = this.pickMimeType(Cast.toString(args.TYPE));
        const options = mimeType ? { mimeType } : {};
        this.mediaRecorder = new MediaRecorder(this.stream, options);
        this.recordingMimeType = this.mediaRecorder.mimeType || mimeType || "audio/webm";
        this.recordingStartedAt = Date.now();

        this.mediaRecorder.ondataavailable = event => {
          if (!event.data || event.data.size <= 0) return;
          this.chunks.push({
            blob: event.data,
            time: Date.now(),
            size: event.data.size
          });
          this.pruneChunks();
        };

        this.mediaRecorder.onerror = event => {
          this.lastError = event && event.error && event.error.message ? event.error.message : "Recording failed.";
        };

        this.mediaRecorder.start(clampInt(args.TIMESLICE, 50, 10000));
        this.lastError = "";
      } catch (error) {
        this.lastError = error && error.message ? error.message : String(error);
      }
    }

    stopRecording() {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        return Promise.resolve();
      }

      return new Promise(resolve => {
        const recorder = this.mediaRecorder;
        const cleanup = () => {
          recorder.onstop = null;
          this.pruneChunks();
          resolve();
        };
        recorder.onstop = cleanup;
        try {
          recorder.requestData();
          recorder.stop();
        } catch (error) {
          this.lastError = error && error.message ? error.message : String(error);
          cleanup();
        }
      });
    }

    pauseRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
        this.mediaRecorder.pause();
      }
    }

    resumeRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
        this.mediaRecorder.resume();
      }
    }

    clearRecording() {
      this.chunks = [];
      this.recordingStartedAt = this.isRecording() ? Date.now() : 0;
      this.revokeObjectUrl();
    }

    isRecording() {
      return !!this.mediaRecorder && this.mediaRecorder.state === "recording";
    }

    isRecordingPaused() {
      return !!this.mediaRecorder && this.mediaRecorder.state === "paused";
    }

    setRollingSeconds(args) {
      this.rollingSeconds = Math.max(0, Number(args.SECONDS) || 0);
      this.pruneChunks();
      this.frame.bufferSeconds = this.rollingSeconds;
    }

    getRollingSeconds() {
      return this.rollingSeconds;
    }

    getRecordingSize(args) {
      const bytes = this.getRecordingBytes();
      const unit = Cast.toString(args.UNIT);
      if (unit === "KB") return this.round(bytes / 1024);
      if (unit === "MB") return this.round(bytes / 1024 / 1024);
      return bytes;
    }

    getRecordingBytes() {
      this.pruneChunks();
      return this.chunks.reduce((total, chunk) => total + chunk.size, 0);
    }

    getRecordingDuration() {
      this.pruneChunks();
      if (this.chunks.length < 1) return 0;

      const first = this.chunks[0].time;
      const last = this.chunks[this.chunks.length - 1].time;
      const end = this.isRecording() || this.isRecordingPaused() ? Date.now() : last;
      return this.round(Math.max(0, (end - first) / 1000));
    }

    getRecordingDataUri() {
      const blob = this.createRecordingBlob();
      if (blob.size === 0) return "";

      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(Cast.toString(reader.result));
        reader.onerror = () => {
          this.lastError = reader.error ? reader.error.message : "Failed to read recording.";
          resolve("");
        };
        reader.readAsDataURL(blob);
      });
    }

    getRecordingObjectUrl() {
      const blob = this.createRecordingBlob();
      if (blob.size === 0) return "";

      this.revokeObjectUrl();
      this.lastObjectUrl = URL.createObjectURL(blob);
      return this.lastObjectUrl;
    }

    getChunkCount() {
      this.pruneChunks();
      return this.chunks.length;
    }

    getLastError() {
      return this.lastError;
    }

    createRecordingBlob() {
      this.pruneChunks();
      return new Blob(this.chunks.map(chunk => chunk.blob), {
        type: this.recordingMimeType || "audio/webm"
      });
    }

    pickMimeType(type) {
      const requested = type === "auto" ? "" : type;
      if (requested && MediaRecorder.isTypeSupported(requested)) return requested;

      const options = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4"
      ];

      for (const option of options) {
        if (MediaRecorder.isTypeSupported(option)) return option;
      }
      return "";
    }

    pruneChunks() {
      if (this.rollingSeconds <= 0 || this.chunks.length === 0) return;

      const cutoff = Date.now() - this.rollingSeconds * 1000;
      while (this.chunks.length > 1 && this.chunks[0].time < cutoff) {
        this.chunks.shift();
      }
    }

    revokeObjectUrl() {
      if (this.lastObjectUrl) {
        URL.revokeObjectURL(this.lastObjectUrl);
        this.lastObjectUrl = "";
      }
    }

    resetFrame() {
      this.frame = {
        loudness: 0,
        peak: 0,
        decibels: -100,
        pitch: 0,
        frequency: 0,
        sampleRate: 0,
        fftSize: 0,
        bufferSeconds: this.rollingSeconds,
        recordingBytes: 0,
        recordingSeconds: 0,
        mimeType: this.recordingMimeType
      };
    }

    round(value) {
      return Math.round(value * 1000) / 1000;
    }
  }

  Scratch.extensions.register(new MicrophoneStream(Scratch.vm && Scratch.vm.runtime));
})(Scratch);

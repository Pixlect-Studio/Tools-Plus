document.addEventListener('DOMContentLoaded', () => {
    const audioInput = document.getElementById('audioInput');
    const audioPlayer = document.getElementById('audioPlayer');
    const waveformCanvas = document.getElementById('waveformCanvas');

    if (!audioInput || !audioPlayer || !waveformCanvas) {
        return;
    }

    const waveformCtx = waveformCanvas.getContext('2d');
    const uploadArea = document.querySelector('.upload-area');
    const audioInfo = document.getElementById('audioInfo');
    const audioStatus = document.getElementById('audioStatus');
    const volumeSlider = document.getElementById('volumeSlider');
    const speedSlider = document.getElementById('speedSlider');
    const volumeValue = document.getElementById('volumeValue');
    const speedValue = document.getElementById('speedValue');
    const trimStart = document.getElementById('trimStart');
    const trimEnd = document.getElementById('trimEnd');

    let audioContext = null;
    let originalBuffer = null;
    let workingBuffer = null;
    let currentUrl = null;

    function getAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        return audioContext;
    }

    function setStatus(message) {
        if (audioStatus) {
            audioStatus.textContent = message;
        }
    }

    function formatSeconds(seconds) {
        if (!Number.isFinite(seconds)) return '0:00';

        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${minutes}:${remaining}`;
    }

    function updateLabels() {
        const volume = Number(volumeSlider.value);
        const speed = Number(speedSlider.value) / 100;

        volumeValue.textContent = `${volume}%`;
        speedValue.textContent = `${speed.toFixed(2)}x`;
        audioPlayer.volume = Math.min(1, volume / 100);
        audioPlayer.playbackRate = speed;
    }

    function updateInfo(file, buffer) {
        if (!audioInfo) return;

        document.getElementById('audioFileName').textContent = `File: ${file.name}`;
        document.getElementById('audioFileSize').textContent = `Size: ${(file.size / 1024).toFixed(2)} KB`;
        document.getElementById('audioDuration').textContent = `Duration: ${formatSeconds(buffer.duration)}`;
        audioInfo.style.display = 'block';
        trimStart.value = 0;
        trimEnd.value = buffer.duration.toFixed(1);
    }

    function cloneBuffer(buffer) {
        const context = getAudioContext();
        const clone = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            clone.copyToChannel(buffer.getChannelData(channel), channel);
        }

        return clone;
    }

    function bufferToWav(buffer) {
        const channels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const frameCount = buffer.length;
        const bytesPerSample = 2;
        const blockAlign = channels * bytesPerSample;
        const dataSize = frameCount * blockAlign;
        const wavBuffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(wavBuffer);
        let offset = 0;

        function writeString(value) {
            for (let i = 0; i < value.length; i += 1) {
                view.setUint8(offset, value.charCodeAt(i));
                offset += 1;
            }
        }

        writeString('RIFF');
        view.setUint32(offset, 36 + dataSize, true);
        offset += 4;
        writeString('WAVE');
        writeString('fmt ');
        view.setUint32(offset, 16, true);
        offset += 4;
        view.setUint16(offset, 1, true);
        offset += 2;
        view.setUint16(offset, channels, true);
        offset += 2;
        view.setUint32(offset, sampleRate, true);
        offset += 4;
        view.setUint32(offset, sampleRate * blockAlign, true);
        offset += 4;
        view.setUint16(offset, blockAlign, true);
        offset += 2;
        view.setUint16(offset, bytesPerSample * 8, true);
        offset += 2;
        writeString('data');
        view.setUint32(offset, dataSize, true);
        offset += 4;

        for (let sample = 0; sample < frameCount; sample += 1) {
            for (let channel = 0; channel < channels; channel += 1) {
                const channelData = buffer.getChannelData(channel);
                const value = Math.max(-1, Math.min(1, channelData[sample]));
                view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
                offset += 2;
            }
        }

        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    function updatePlayerFromBuffer() {
        if (!workingBuffer) return;

        if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
        }

        const wavBlob = bufferToWav(workingBuffer);
        currentUrl = URL.createObjectURL(wavBlob);
        audioPlayer.src = currentUrl;
        updateLabels();
        drawWaveform();
        setStatus(`Ready: ${formatSeconds(workingBuffer.duration)} audio loaded.`);
    }

    function drawWaveform() {
        const width = waveformCanvas.clientWidth || 720;
        const height = waveformCanvas.clientHeight || 220;
        waveformCanvas.width = width;
        waveformCanvas.height = height;
        waveformCtx.clearRect(0, 0, width, height);

        waveformCtx.fillStyle = 'rgba(5, 10, 21, 0.75)';
        waveformCtx.fillRect(0, 0, width, height);

        if (!workingBuffer) {
            waveformCtx.fillStyle = '#00D9FF';
            waveformCtx.textAlign = 'center';
            waveformCtx.fillText('Upload audio to view waveform', width / 2, height / 2);
            return;
        }

        const data = workingBuffer.getChannelData(0);
        const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
        const center = height / 2;

        waveformCtx.strokeStyle = '#00FFFF';
        waveformCtx.lineWidth = 1;
        waveformCtx.beginPath();

        for (let x = 0; x < width; x += 1) {
            const start = x * samplesPerPixel;
            let min = 1;
            let max = -1;

            for (let i = 0; i < samplesPerPixel && start + i < data.length; i += 1) {
                const sample = data[start + i];
                min = Math.min(min, sample);
                max = Math.max(max, sample);
            }

            waveformCtx.moveTo(x, center + min * center * 0.9);
            waveformCtx.lineTo(x, center + max * center * 0.9);
        }

        waveformCtx.stroke();
    }

    async function loadAudio(file) {
        if (!file || !file.type.startsWith('audio/')) return;

        const context = getAudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await context.decodeAudioData(arrayBuffer.slice(0));

        originalBuffer = decoded;
        workingBuffer = cloneBuffer(decoded);
        updateInfo(file, decoded);
        updatePlayerFromBuffer();
    }

    function applyToSamples(callback) {
        if (!workingBuffer) return;

        const next = cloneBuffer(workingBuffer);

        for (let channel = 0; channel < next.numberOfChannels; channel += 1) {
            const data = next.getChannelData(channel);
            callback(data, channel, next);
        }

        workingBuffer = next;
        updatePlayerFromBuffer();
    }

    audioInput.addEventListener('change', (event) => {
        loadAudio(event.target.files[0]).catch(() => {
            setStatus('This audio file could not be decoded by the browser.');
        });
    });

    if (uploadArea) {
        uploadArea.addEventListener('dragover', (event) => {
            event.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (event) => {
            event.preventDefault();
            uploadArea.classList.remove('dragover');
            loadAudio(event.dataTransfer.files[0]).catch(() => {
                setStatus('This audio file could not be decoded by the browser.');
            });
        });
    }

    volumeSlider.addEventListener('input', updateLabels);
    speedSlider.addEventListener('input', updateLabels);
    window.addEventListener('resize', drawWaveform);

    window.applyTrim = () => {
        if (!workingBuffer) return;

        const context = getAudioContext();
        const start = Math.max(0, Number(trimStart.value));
        const end = Math.min(workingBuffer.duration, Number(trimEnd.value));

        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            setStatus('Choose a trim end time after the start time.');
            return;
        }

        const startFrame = Math.floor(start * workingBuffer.sampleRate);
        const endFrame = Math.floor(end * workingBuffer.sampleRate);
        const frameCount = endFrame - startFrame;
        const next = context.createBuffer(workingBuffer.numberOfChannels, frameCount, workingBuffer.sampleRate);

        for (let channel = 0; channel < workingBuffer.numberOfChannels; channel += 1) {
            const slice = workingBuffer.getChannelData(channel).slice(startFrame, endFrame);
            next.copyToChannel(slice, channel);
        }

        workingBuffer = next;
        trimStart.value = 0;
        trimEnd.value = workingBuffer.duration.toFixed(1);
        updatePlayerFromBuffer();
    };

    window.reverseAudio = () => {
        applyToSamples((data) => data.reverse());
    };

    window.fadeInAudio = () => {
        applyToSamples((data, channel, buffer) => {
            const fadeLength = Math.min(data.length, Math.floor(buffer.sampleRate * 2));
            for (let i = 0; i < fadeLength; i += 1) {
                data[i] *= i / fadeLength;
            }
        });
    };

    window.fadeOutAudio = () => {
        applyToSamples((data, channel, buffer) => {
            const fadeLength = Math.min(data.length, Math.floor(buffer.sampleRate * 2));
            for (let i = 0; i < fadeLength; i += 1) {
                const index = data.length - 1 - i;
                data[index] *= i / fadeLength;
            }
        });
    };

    window.normalizeAudio = () => {
        if (!workingBuffer) return;

        let peak = 0;
        for (let channel = 0; channel < workingBuffer.numberOfChannels; channel += 1) {
            const data = workingBuffer.getChannelData(channel);
            for (let i = 0; i < data.length; i += 1) {
                peak = Math.max(peak, Math.abs(data[i]));
            }
        }

        if (peak === 0) return;

        const gain = 0.95 / peak;
        applyToSamples((data) => {
            for (let i = 0; i < data.length; i += 1) {
                data[i] *= gain;
            }
        });
    };

    window.resetAudio = () => {
        if (!originalBuffer) return;

        workingBuffer = cloneBuffer(originalBuffer);
        volumeSlider.value = 100;
        speedSlider.value = 100;
        trimStart.value = 0;
        trimEnd.value = workingBuffer.duration.toFixed(1);
        updatePlayerFromBuffer();
    };

    window.downloadAudio = () => {
        if (!workingBuffer) return;

        const link = document.createElement('a');
        link.href = URL.createObjectURL(bufferToWav(workingBuffer));
        link.download = 'edited-audio.wav';
        link.click();
    };

    updateLabels();
    drawWaveform();
});

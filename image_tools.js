document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('imageInput');
    const imageCanvas = document.getElementById('imageCanvas');
    const cropCanvas = document.getElementById('cropCanvas');

    if (!imageInput || !imageCanvas) {
        return;
    }

    const ctx = imageCanvas.getContext('2d');
    const cropCtx = cropCanvas ? cropCanvas.getContext('2d') : null;

    const state = {
        image: null,
        sourceWidth: 0,
        sourceHeight: 0,
        displayWidth: 0,
        displayHeight: 0,
        grayscale: false,
        sepia: false,
        lastMime: 'image/png'
    };

    const controls = {
        brightness: document.getElementById('brightnessSlider'),
        contrast: document.getElementById('contrastSlider'),
        saturation: document.getElementById('saturationSlider'),
        blur: document.getElementById('blurSlider'),
        rotation: document.getElementById('rotationSlider')
    };

    const valueLabels = {
        brightness: document.getElementById('brightnessValue'),
        contrast: document.getElementById('contrastValue'),
        saturation: document.getElementById('saturationValue'),
        blur: document.getElementById('blurValue'),
        rotation: document.getElementById('rotationValue')
    };

    const grayscaleBtn = document.getElementById('grayscaleBtn');
    const sepiaBtn = document.getElementById('sepiaBtn');
    const placeholder = document.querySelector('.no-image-placeholder');
    const uploadArea = document.querySelector('.upload-area');
    const maintainAspect = document.getElementById('maintainAspect');
    const resizeWidth = document.getElementById('resizeWidth');
    const resizeHeight = document.getElementById('resizeHeight');
    const aiScaleFactor = document.getElementById('aiScaleFactor');
    const aiScaleValue = document.getElementById('aiScaleValue');
    const aiScaleStatus = document.getElementById('aiScaleStatus');

    let cropStartX = 0;
    let cropStartY = 0;
    let isCropping = false;
    let aspectRatio = 1;

    const clamp = (value) => Math.max(0, Math.min(255, value));

    function setCanvasVisible(isVisible) {
        imageCanvas.classList.toggle('has-image', isVisible);
        if (placeholder) {
            placeholder.style.display = isVisible ? 'none' : 'flex';
        }
    }

    function syncControlLabels() {
        if (valueLabels.brightness) valueLabels.brightness.textContent = `${controls.brightness.value}%`;
        if (valueLabels.contrast) valueLabels.contrast.textContent = `${controls.contrast.value}%`;
        if (valueLabels.saturation) valueLabels.saturation.textContent = `${controls.saturation.value}%`;
        if (valueLabels.blur) valueLabels.blur.textContent = `${controls.blur.value}px`;
        if (valueLabels.rotation) valueLabels.rotation.textContent = `${controls.rotation.value}deg`;
    }

    function updateFilterButtons() {
        if (grayscaleBtn) grayscaleBtn.classList.toggle('active', state.grayscale);
        if (sepiaBtn) sepiaBtn.classList.toggle('active', state.sepia);
    }

    function resetControls() {
        controls.brightness.value = 100;
        controls.contrast.value = 100;
        controls.saturation.value = 100;
        controls.blur.value = 0;
        controls.rotation.value = 0;
        state.grayscale = false;
        state.sepia = false;
        syncControlLabels();
        updateFilterButtons();
    }

    function setResizeDefaults() {
        if (!resizeWidth || !resizeHeight || !state.image) return;
        resizeWidth.value = state.sourceWidth;
        resizeHeight.value = state.sourceHeight;
        aspectRatio = state.sourceWidth / state.sourceHeight;
    }

    function updateScaleLabel() {
        if (!aiScaleFactor || !aiScaleValue) return;
        aiScaleValue.textContent = `${aiScaleFactor.value}x`;
    }

    function setCropDefaults() {
        const cropX = document.getElementById('cropX');
        const cropY = document.getElementById('cropY');
        const cropWidth = document.getElementById('cropWidth');
        const cropHeight = document.getElementById('cropHeight');

        if (cropX) cropX.value = 0;
        if (cropY) cropY.value = 0;
        if (cropWidth) cropWidth.value = Math.round(state.displayWidth);
        if (cropHeight) cropHeight.value = Math.round(state.displayHeight);
    }

    function fitImageToWorkspace() {
        const maxWidth = 700;
        const scale = Math.min(1, maxWidth / state.sourceWidth);
        state.displayWidth = Math.round(state.sourceWidth * scale);
        state.displayHeight = Math.round(state.sourceHeight * scale);
    }

    function drawCropCanvas() {
        if (!cropCanvas || !cropCtx || !state.image) return;

        cropCanvas.width = state.displayWidth;
        cropCanvas.height = state.displayHeight;
        cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
        cropCtx.drawImage(state.image, 0, 0, state.displayWidth, state.displayHeight);
    }

    function drawImage() {
        if (!state.image) {
            setCanvasVisible(false);
            return;
        }

        const rotation = Number(controls.rotation.value);
        const radians = rotation * Math.PI / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        const rotatedWidth = Math.ceil(state.displayWidth * cos + state.displayHeight * sin);
        const rotatedHeight = Math.ceil(state.displayWidth * sin + state.displayHeight * cos);

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = rotatedWidth;
        tempCanvas.height = rotatedHeight;

        tempCtx.save();
        tempCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
        tempCtx.rotate(radians);
        tempCtx.drawImage(
            state.image,
            -state.displayWidth / 2,
            -state.displayHeight / 2,
            state.displayWidth,
            state.displayHeight
        );
        tempCtx.restore();

        const imageData = tempCtx.getImageData(0, 0, rotatedWidth, rotatedHeight);
        const data = imageData.data;
        const brightness = Number(controls.brightness.value) / 100;
        const contrast = Number(controls.contrast.value) / 100;
        const saturation = Number(controls.saturation.value) / 100;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;

            let red = data[i] * brightness;
            let green = data[i + 1] * brightness;
            let blue = data[i + 2] * brightness;

            red = (red - 128) * contrast + 128;
            green = (green - 128) * contrast + 128;
            blue = (blue - 128) * contrast + 128;

            const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;

            red = luminance + (red - luminance) * saturation;
            green = luminance + (green - luminance) * saturation;
            blue = luminance + (blue - luminance) * saturation;

            if (state.grayscale) {
                red = luminance;
                green = luminance;
                blue = luminance;
            }

            if (state.sepia) {
                const sepiaRed = red * 0.393 + green * 0.769 + blue * 0.189;
                const sepiaGreen = red * 0.349 + green * 0.686 + blue * 0.168;
                const sepiaBlue = red * 0.272 + green * 0.534 + blue * 0.131;
                red = sepiaRed;
                green = sepiaGreen;
                blue = sepiaBlue;
            }

            data[i] = clamp(red);
            data[i + 1] = clamp(green);
            data[i + 2] = clamp(blue);
        }

        tempCtx.putImageData(imageData, 0, 0);

        imageCanvas.width = rotatedWidth;
        imageCanvas.height = rotatedHeight;
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.filter = Number(controls.blur.value) > 0 ? `blur(${controls.blur.value}px)` : 'none';
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.filter = 'none';
        setCanvasVisible(true);
    }

    function updateImageInfo(file) {
        const info = document.getElementById('imageInfo');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');

        if (!info || !fileName || !fileSize) return;

        fileName.textContent = `File: ${file.name}`;
        fileSize.textContent = `Size: ${(file.size / 1024).toFixed(2)} KB`;
        info.style.display = 'block';
    }

    function loadImage(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const image = new Image();
            image.onload = () => {
                state.image = image;
                state.sourceWidth = image.naturalWidth;
                state.sourceHeight = image.naturalHeight;
                state.lastMime = file.type || 'image/png';
                fitImageToWorkspace();
                resetControls();
                setResizeDefaults();
                setCropDefaults();
                drawImage();
                drawCropCanvas();
            };
            image.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    function getCanvasDataUrl(type = 'image/png') {
        if (!state.image) return null;
        return imageCanvas.toDataURL(type);
    }

    function downloadCanvas(fileName, type = 'image/png') {
        const dataUrl = getCanvasDataUrl(type);
        if (!dataUrl) return;

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        link.click();
    }

    function sharpenCanvas(canvas, amount = 0.22) {
        const sharpenCtx = canvas.getContext('2d');
        const imageData = sharpenCtx.getImageData(0, 0, canvas.width, canvas.height);
        const source = imageData.data;
        const output = new Uint8ClampedArray(source);
        const width = canvas.width;
        const height = canvas.height;

        for (let y = 1; y < height - 1; y += 1) {
            for (let x = 1; x < width - 1; x += 1) {
                const index = (y * width + x) * 4;

                for (let channel = 0; channel < 3; channel += 1) {
                    const center = source[index + channel] * (1 + 4 * amount);
                    const top = source[index - width * 4 + channel] * amount;
                    const bottom = source[index + width * 4 + channel] * amount;
                    const left = source[index - 4 + channel] * amount;
                    const right = source[index + 4 + channel] * amount;
                    output[index + channel] = clamp(center - top - bottom - left - right);
                }
            }
        }

        imageData.data.set(output);
        sharpenCtx.putImageData(imageData, 0, 0);
    }

    function applySmartScale(direction) {
        if (!state.image) return;

        drawImage();

        const scale = aiScaleFactor ? Number(aiScaleFactor.value) : 2;
        const factor = direction === 'down' ? 1 / scale : scale;
        const targetWidth = Math.max(1, Math.round(imageCanvas.width * factor));
        const targetHeight = Math.max(1, Math.round(imageCanvas.height * factor));
        const scaledCanvas = document.createElement('canvas');
        const scaledCtx = scaledCanvas.getContext('2d');

        scaledCanvas.width = targetWidth;
        scaledCanvas.height = targetHeight;
        scaledCtx.imageSmoothingEnabled = true;
        scaledCtx.imageSmoothingQuality = 'high';
        scaledCtx.drawImage(imageCanvas, 0, 0, targetWidth, targetHeight);

        if (direction === 'up') {
            sharpenCanvas(scaledCanvas);
        }

        const scaledImage = new Image();
        scaledImage.onload = () => {
            state.image = scaledImage;
            state.sourceWidth = scaledImage.naturalWidth;
            state.sourceHeight = scaledImage.naturalHeight;
            state.lastMime = 'image/png';
            resetControls();
            fitImageToWorkspace();
            setResizeDefaults();
            setCropDefaults();
            drawImage();
            drawCropCanvas();

            if (aiScaleStatus) {
                aiScaleStatus.textContent = `Current image: ${state.sourceWidth} x ${state.sourceHeight}px`;
            }
        };
        scaledImage.src = scaledCanvas.toDataURL('image/png');
    }

    Object.values(controls).forEach((control) => {
        if (!control) return;

        control.addEventListener('input', () => {
            syncControlLabels();
            drawImage();
        });
    });

    imageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        loadImage(file);
        updateImageInfo(file);
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

            const file = event.dataTransfer.files[0];
            if (!file || !file.type.startsWith('image/')) return;

            imageInput.files = event.dataTransfer.files;
            loadImage(file);
            updateImageInfo(file);
        });
    }

    if (maintainAspect && resizeWidth && resizeHeight) {
        resizeWidth.addEventListener('input', () => {
            if (!maintainAspect.checked || !resizeWidth.value || !aspectRatio) return;
            resizeHeight.value = Math.max(1, Math.round(Number(resizeWidth.value) / aspectRatio));
        });

        resizeHeight.addEventListener('input', () => {
            if (!maintainAspect.checked || !resizeHeight.value || !aspectRatio) return;
            resizeWidth.value = Math.max(1, Math.round(Number(resizeHeight.value) * aspectRatio));
        });
    }

    if (aiScaleFactor) {
        aiScaleFactor.addEventListener('input', updateScaleLabel);
    }

    if (cropCanvas && cropCtx) {
        cropCanvas.addEventListener('mousedown', (event) => {
            if (!state.image) return;

            const rect = cropCanvas.getBoundingClientRect();
            const scaleX = cropCanvas.width / rect.width;
            const scaleY = cropCanvas.height / rect.height;

            isCropping = true;
            cropStartX = (event.clientX - rect.left) * scaleX;
            cropStartY = (event.clientY - rect.top) * scaleY;
        });

        cropCanvas.addEventListener('mousemove', (event) => {
            if (!isCropping || !state.image) return;

            const rect = cropCanvas.getBoundingClientRect();
            const scaleX = cropCanvas.width / rect.width;
            const scaleY = cropCanvas.height / rect.height;
            const currentX = (event.clientX - rect.left) * scaleX;
            const currentY = (event.clientY - rect.top) * scaleY;
            const x = Math.max(0, Math.min(cropStartX, currentX));
            const y = Math.max(0, Math.min(cropStartY, currentY));
            const width = Math.min(cropCanvas.width - x, Math.abs(currentX - cropStartX));
            const height = Math.min(cropCanvas.height - y, Math.abs(currentY - cropStartY));

            document.getElementById('cropX').value = Math.round(x);
            document.getElementById('cropY').value = Math.round(y);
            document.getElementById('cropWidth').value = Math.round(width);
            document.getElementById('cropHeight').value = Math.round(height);

            drawCropCanvas();
            cropCtx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
            cropCtx.lineWidth = 2;
            cropCtx.strokeRect(x, y, width, height);
        });

        window.addEventListener('mouseup', () => {
            isCropping = false;
        });
    }

    window.applyFilter = (filterType) => {
        if (!state.image) return;

        if (filterType === 'grayscale') {
            state.grayscale = !state.grayscale;
            state.sepia = false;
        }

        if (filterType === 'sepia') {
            state.sepia = !state.sepia;
            state.grayscale = false;
        }

        updateFilterButtons();
        drawImage();
    };

    window.resetImage = () => {
        if (!state.image) return;

        resetControls();
        fitImageToWorkspace();
        setResizeDefaults();
        setCropDefaults();
        drawImage();
        drawCropCanvas();
    };

    window.downloadImage = () => {
        downloadCanvas('edited-image.png');
    };

    window.convertImage = (format) => {
        const supportedFormats = {
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            gif: 'image/gif'
        };

        const mimeType = supportedFormats[format] || 'image/png';
        const extension = format === 'jpeg' ? 'jpg' : format;
        downloadCanvas(`converted-image.${extension}`, mimeType);
    };

    window.resizeImage = () => {
        if (!state.image || !resizeWidth || !resizeHeight) return;

        const width = Math.max(1, Number(resizeWidth.value));
        const height = Math.max(1, Number(resizeHeight.value));

        if (!Number.isFinite(width) || !Number.isFinite(height)) return;

        state.sourceWidth = width;
        state.sourceHeight = height;
        state.displayWidth = width;
        state.displayHeight = height;
        aspectRatio = width / height;
        drawImage();
        drawCropCanvas();
        setCropDefaults();
    };

    window.downloadResized = () => {
        downloadCanvas('resized-image.png');
    };

    window.applyCrop = () => {
        if (!state.image) return;

        const x = Math.max(0, Number(document.getElementById('cropX').value));
        const y = Math.max(0, Number(document.getElementById('cropY').value));
        const width = Math.max(1, Number(document.getElementById('cropWidth').value));
        const height = Math.max(1, Number(document.getElementById('cropHeight').value));
        const cropScaleX = state.sourceWidth / state.displayWidth;
        const cropScaleY = state.sourceHeight / state.displayHeight;
        const croppedCanvas = document.createElement('canvas');
        const croppedCtx = croppedCanvas.getContext('2d');

        croppedCanvas.width = Math.min(state.sourceWidth, Math.round(width * cropScaleX));
        croppedCanvas.height = Math.min(state.sourceHeight, Math.round(height * cropScaleY));
        croppedCtx.drawImage(
            state.image,
            Math.round(x * cropScaleX),
            Math.round(y * cropScaleY),
            croppedCanvas.width,
            croppedCanvas.height,
            0,
            0,
            croppedCanvas.width,
            croppedCanvas.height
        );

        const croppedImage = new Image();
        croppedImage.onload = () => {
            state.image = croppedImage;
            state.sourceWidth = croppedImage.naturalWidth;
            state.sourceHeight = croppedImage.naturalHeight;
            fitImageToWorkspace();
            setResizeDefaults();
            setCropDefaults();
            drawImage();
            drawCropCanvas();
        };
        croppedImage.src = croppedCanvas.toDataURL(state.lastMime);
    };

    window.downloadCropped = () => {
        downloadCanvas('cropped-image.png');
    };

    window.aiUpscaleImage = () => {
        applySmartScale('up');
    };

    window.aiDownscaleImage = () => {
        applySmartScale('down');
    };

    syncControlLabels();
    updateScaleLabel();
    updateFilterButtons();
    setCanvasVisible(false);
});

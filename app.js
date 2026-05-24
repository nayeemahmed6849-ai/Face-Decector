/* ==========================================================================
   CYBER-MESH NEURAL ENGINE - CORE APPLICATION LOGIC
   Uses: MediaPipe Face Landmarker via ESM CDN
   ========================================================================== */

import { 
    FaceLandmarker, 
    FilesetResolver, 
    DrawingUtils 
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// 1. Diagnostics & UI State
let faceLandmarker;
let webcamStream = null;
let animationFrameId = null;
let lastVideoTime = -1;
let isScanning = false;
let isMeshToggled = true;
let isDotsToggled = true;

// Telemetry statistics
let fpsCount = 0;
let fpsTimer = 0;
let lastFpsUpdate = 0;
let currentFps = 0;
let latencyHistory = [];

// DOM Elements cache
const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("canvas-overlay");
const canvasCtx = canvasElement.getContext("2d");
const laserLine = document.getElementById("laser-line");

// Buttons
const btnCamera = document.getElementById("btn-camera");
const btnStop = document.getElementById("btn-stop");
const btnUploadTrigger = document.getElementById("btn-upload-trigger");
const fileUpload = document.getElementById("file-upload");
const btnToggleMesh = document.getElementById("btn-toggle-mesh");
const btnToggleDots = document.getElementById("btn-toggle-dots");
const btnSnapshot = document.getElementById("btn-snapshot");
const btnClearLogs = document.getElementById("btn-clear-logs");

// UI Indicators & Readouts
const statusDot = document.getElementById("status-dot");
const statusLabel = document.getElementById("status-label");
const hudClock = document.getElementById("hud-clock");
const scanModePulse = document.querySelector(".mode-pulse");
const scanModeText = document.getElementById("mode-text");
const dropZone = document.getElementById("drop-zone");
const dropOverlay = document.getElementById("drop-overlay");

// Diag/Mood Readouts
const statFps = document.getElementById("stat-fps");
const statLatency = document.getElementById("stat-latency");
const statFaces = document.getElementById("stat-faces");
const moodDisplay = document.getElementById("mood-display");
const moodConfidence = document.getElementById("mood-confidence");

// Gauges
const gaugeValSmile = document.getElementById("gauge-val-smile");
const gaugeFillSmile = document.getElementById("gauge-fill-smile");
const gaugeValBlink = document.getElementById("gauge-val-blink");
const gaugeFillBlink = document.getElementById("gauge-fill-blink");
const gaugeValSurprise = document.getElementById("gauge-val-surprise");
const gaugeFillSurprise = document.getElementById("gauge-fill-surprise");
const gaugeValConcentration = document.getElementById("gauge-val-concentration");
const gaugeFillConcentration = document.getElementById("gauge-fill-concentration");

const consoleLogs = document.getElementById("console-logs");

// 2. High-Tech HUD Clock
function updateHUDClock() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    const ms = String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0');
    hudClock.textContent = `${hrs}:${mins}:${secs}:${ms}`;
    requestAnimationFrame(updateHUDClock);
}
requestAnimationFrame(updateHUDClock);

// 3. Cyber Console Logging
function addLog(message, type = 'info') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const logElement = document.createElement("div");
    logElement.className = `log-line ${type}-line`;
    logElement.textContent = `[${timeStr}] ${message}`;
    consoleLogs.appendChild(logElement);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

btnClearLogs.addEventListener("click", () => {
    consoleLogs.innerHTML = "";
    addLog("Console cleared.", "info");
});

// 4. Initialize Neural Engine
async function initNeuralEngine() {
    try {
        addLog("Initializing neural subsystem...", "system");
        statusLabel.textContent = "ENGINE_BOOTING";
        statusDot.className = "status-dot pulsing";
        statusDot.style.backgroundColor = "var(--neon-purple)";
        statusDot.style.boxShadow = "var(--shadow-purple)";

        // Load WASM fileset resolver
        addLog("Downloading WASM binaries from MediaPipe CDN...", "info");
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        // Create face landmarker
        addLog("Loading Face Landmarker neural weights...", "info");
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            outputFaceBlendshapes: true,
            numFaces: 1
        });

        addLog("Neural Engine loaded successfully. System ONLINE.", "success");
        statusLabel.textContent = "SYS_ONLINE";
        statusDot.className = "status-dot";
        statusDot.style.backgroundColor = "var(--neon-cyan)";
        statusDot.style.boxShadow = "var(--shadow-cyan)";
        
        btnCamera.classList.remove("disabled");
    } catch (error) {
        addLog(`Engine failed to boot: ${error.message}`, "error");
        statusLabel.textContent = "ERR_OFFLINE";
        statusDot.className = "status-dot";
        statusDot.style.backgroundColor = "var(--neon-pink)";
        statusDot.style.boxShadow = "var(--shadow-pink)";
        alert("Could not load Face Landmarker API. Make sure you have an active internet connection.");
    }
}
initNeuralEngine();

// 5. Drawing Utilities & Landmark Pipeline
const drawingUtils = new DrawingUtils(canvasCtx);

function drawTelemetry(results, width, height) {
    canvasCtx.clearRect(0, 0, width, height);
    
    if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
        statFaces.textContent = "0";
        resetExpressionGauges();
        return;
    }

    const landmarks = results.faceLandmarks[0];
    statFaces.textContent = results.faceLandmarks.length.toString();

    // 5.1. Render glowing face mesh tessellation
    if (isMeshToggled) {
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
            { color: "rgba(0, 240, 255, 0.08)", lineWidth: 0.8 }
        );
        
        // Key outline elements
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
            { color: "rgba(191, 90, 242, 0.4)", lineWidth: 1.2 }
        );
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
            { color: "rgba(191, 90, 242, 0.4)", lineWidth: 1.2 }
        );
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
            { color: "rgba(0, 240, 255, 0.5)", lineWidth: 1.2 }
        );
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
            { color: "rgba(0, 240, 255, 0.5)", lineWidth: 1.2 }
        );
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LIPS,
            { color: "rgba(255, 45, 85, 0.4)", lineWidth: 1.2 }
        );
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
            { color: "rgba(0, 240, 255, 0.25)", lineWidth: 1 }
        );
    }

    // 5.2. Render tracking star grid (Feature Dots)
    if (isDotsToggled) {
        // Draw standard landmarks with small cyan points
        drawingUtils.drawLandmarks(landmarks, {
            color: "rgba(0, 240, 255, 0.8)",
            radius: 0.8
        });

        // Draw green iris crosshairs
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
            { color: "var(--neon-emerald)", lineWidth: 2 }
        );
        drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
            { color: "var(--neon-emerald)", lineWidth: 2 }
        );
    }

    // 5.3. Blendshape Telemetry Analysis (Expression/Mood tracker)
    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
        analyzeBlendshapes(results.faceBlendshapes[0].categories);
    }
}

// 6. Blendshape & Cognitive Classifier
function analyzeBlendshapes(categories) {
    const getScore = (name) => categories.find(c => c.categoryName === name)?.score || 0;

    const smileLeft = getScore("mouthSmileLeft");
    const smileRight = getScore("mouthSmileRight");
    const blinkLeft = getScore("eyeBlinkLeft");
    const blinkRight = getScore("eyeBlinkRight");
    const jawOpen = getScore("jawOpen");
    const browDownLeft = getScore("browDownLeft");
    const browDownRight = getScore("browDownRight");
    const browOuterUpLeft = getScore("browOuterUpLeft");
    const browOuterUpRight = getScore("browOuterUpRight");

    // Aggregate coefficients
    const smileIntensity = Math.max(smileLeft, smileRight);
    const blinkIntensity = (blinkLeft + blinkRight) / 2;
    const surpriseIntensity = jawOpen;
    const frownIntensity = Math.max(browDownLeft, browDownRight);

    // Update gauge bars
    updateGauge("smile", smileIntensity);
    updateGauge("blink", blinkIntensity);
    updateGauge("surprise", surpriseIntensity);
    updateGauge("concentration", frownIntensity);

    // Cognitive Mood Classifier logic
    let mood = "NEUTRAL";
    let confidence = 0.5 + (1 - Math.max(smileIntensity, blinkIntensity, surpriseIntensity, frownIntensity)) * 0.3; // Base confidence

    if (smileIntensity > 0.35) {
        mood = "HAPPY / AMUSED";
        confidence = smileIntensity * 0.95;
    } else if (surpriseIntensity > 0.4) {
        mood = "SURPRISED / SHOCKED";
        confidence = surpriseIntensity * 0.92;
    } else if (blinkIntensity > 0.65) {
        mood = "SLEEPY / CLOSED_EYES";
        confidence = blinkIntensity * 0.98;
    } else if (frownIntensity > 0.3) {
        mood = "FOCUSED / SERIOUS";
        confidence = frownIntensity * 0.9;
    } else {
        mood = "NEUTRAL / CALM";
        confidence = 0.85;
    }

    moodDisplay.textContent = mood;
    moodConfidence.textContent = `${Math.round(confidence * 100)}% CONFIDENCE`;
}

function updateGauge(id, value) {
    const pct = Math.round(value * 100);
    document.getElementById(`gauge-val-${id}`).textContent = `${pct}%`;
    document.getElementById(`gauge-fill-${id}`).style.width = `${pct}%`;
}

function resetExpressionGauges() {
    ["smile", "blink", "surprise", "concentration"].forEach(id => {
        updateGauge(id, 0);
    });
    moodDisplay.textContent = "AWAITING INPUT";
    moodConfidence.textContent = "0% CONFIDENCE";
}

// 7. Real-Time Detection Web Camera Loop
async function predictWebcamFrame() {
    if (!isScanning) return;

    const startTime = performance.now();

    if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;

        try {
            // Run MediaPipe inference
            const results = faceLandmarker.detectForVideo(videoElement, startTime);

            // Compute inference processing latency
            const endTime = performance.now();
            const latency = Math.round(endTime - startTime);
            latencyHistory.push(latency);
            if (latencyHistory.length > 30) latencyHistory.shift();
            const avgLatency = Math.round(latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length);
            statLatency.innerHTML = `${avgLatency} <span class="unit">ms</span>`;

            // Canvas coordinate mapping
            if (canvasElement.width !== videoElement.videoWidth) {
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
            }

            // Draw overlays
            drawTelemetry(results, canvasElement.width, canvasElement.height);
        } catch (error) {
            addLog(`Inference error: ${error.message}`, "error");
        }
    }

    // FPS Telemetry Calculator
    const now = startTime;
    fpsCount++;
    if (now > lastFpsUpdate + 1000) {
        currentFps = Math.round((fpsCount * 1000) / (now - lastFpsUpdate));
        statFps.textContent = currentFps.toString();
        fpsCount = 0;
        lastFpsUpdate = now;
    }

    animationFrameId = requestAnimationFrame(predictWebcamFrame);
}

// 8. Stream Controls
async function startWebcam() {
    if (!faceLandmarker) {
        alert("The neural engine is still loading. Please wait.");
        return;
    }

    // Security Check: Insecure origin (file:// protocol)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = "Secure Context Error: Webcam access is disabled on local files (file://).";
        addLog(errorMsg, "error");
        addLog("Please ensure you are opening the site using the active server link: http://localhost:8080/", "warn");
        alert("Webcam access blocked by the browser! You must open the app via the server link: http://localhost:8080/\n\nIf the browser closed it, double click the 'run_server.ps1' script to re-launch the server.");
        return;
    }

    try {
        addLog("Requesting video capture permissions...", "system");
        
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: false
        };

        try {
            webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (constraintError) {
            addLog("Primary constraints rejected. Retrying with basic camera stream fallback...", "warn");
            // Standard fallback without resolution ideal constraints
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        
        videoElement.srcObject = webcamStream;
        
        addLog("Video stream mounted. Establishing link...", "info");
        
        videoElement.addEventListener("loadeddata", () => {
            videoElement.play();
            
            // Adjust overlays mapping & apply mirroring
            videoElement.classList.add("mirrored");
            canvasElement.classList.add("mirrored");
            dropOverlay.style.display = "none";
            laserLine.classList.add("active");
            
            isScanning = true;
            scanModePulse.className = "mode-pulse active";
            scanModeText.textContent = "LIVE SCANNING";
            
            addLog("Scanner tracking engine active. Target locked.", "success");
            
            // Reset telemetry states
            fpsCount = 0;
            lastFpsUpdate = performance.now();
            latencyHistory = [];
            
            // Enable/Disable HUD buttons
            btnCamera.classList.add("disabled");
            btnCamera.disabled = true;
            btnStop.classList.remove("disabled");
            btnStop.disabled = false;
            btnUploadTrigger.classList.add("disabled");
            
            // Core scanning cycle trigger
            predictWebcamFrame();
        });

    } catch (error) {
        addLog(`Camera access denied: ${error.message}`, "error");
        alert("Camera access is blocked or unavailable. Make sure your camera is plugged in, not used by another application (like Zoom or Teams), and that you granted permission in the browser address bar.");
    }
}

function stopWebcam() {
    isScanning = false;
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    if (webcamStream) {
        addLog("Terminating webcam feed streams...", "warn");
        webcamStream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    
    laserLine.classList.remove("active");
    scanModePulse.className = "mode-pulse";
    scanModeText.textContent = "STANDBY";
    addLog("Webcam tracker paused.", "info");

    btnCamera.classList.remove("disabled");
    btnCamera.disabled = false;
    btnStop.classList.add("disabled");
    btnStop.disabled = true;
    btnUploadTrigger.classList.remove("disabled");
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    resetExpressionGauges();
    statFps.textContent = "--";
    statLatency.innerHTML = "-- <span class=\"unit\">ms</span>";
    statFaces.textContent = "0";
}

btnCamera.addEventListener("click", startWebcam);
btnStop.addEventListener("click", stopWebcam);

// 9. Static Image Loader & Processor
async function processStaticImage(file) {
    if (!faceLandmarker) {
        alert("Please wait for the Neural Engine to finish booting.");
        return;
    }

    addLog(`Loading image file: ${file.name} (${Math.round(file.size / 1024)} KB)...`, "info");
    
    // Deactivate webcam if active
    if (isScanning) {
        stopWebcam();
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = async function() {
            addLog(`Image parsed. Dimensions: ${img.width}x${img.height}. Processing...`, "info");
            
            // Prepare drawing canvas (Static images are NOT mirrored)
            videoElement.classList.remove("mirrored");
            canvasElement.classList.remove("mirrored");
            dropOverlay.style.display = "none";
            laserLine.classList.add("active");
            
            canvasElement.width = img.width;
            canvasElement.height = img.height;
            
            // Draw image on canvas
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            canvasCtx.drawImage(img, 0, 0, img.width, img.height);
            
            // Temporarily update indicator
            scanModePulse.className = "mode-pulse active";
            scanModeText.textContent = "STATIC ANALYSIS";
            statusLabel.textContent = "INFERENCE_RUN";
            
            const startTime = performance.now();
            
            // Re-initialize Face Landmarker options for static IMAGE running mode
            await faceLandmarker.setOptions({ runningMode: "IMAGE" });
            
            try {
                // Run inference
                const results = faceLandmarker.detect(img);
                
                const endTime = performance.now();
                const latency = Math.round(endTime - startTime);
                
                addLog(`Inference completed. Execution time: ${latency}ms`, "success");
                statusLabel.textContent = "SYS_ONLINE";
                
                statLatency.innerHTML = `${latency} <span class="unit">ms</span>`;
                statFps.textContent = "N/A";
                
                // Draw face mesh
                drawTelemetry(results, canvasElement.width, canvasElement.height);
                
                // Draw base uploaded image back since drawTelemetry clears and overlays coordinates
                // We draw it behind coordinates by using drawImage first then overlays
                canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
                canvasCtx.drawImage(img, 0, 0, img.width, img.height);
                drawTelemetry(results, canvasElement.width, canvasElement.height);
                
            } catch (err) {
                addLog(`Image inference error: ${err.message}`, "error");
            }
            
            // Revert Landmarker back to video runningMode for webcam streaming flexibility
            await faceLandmarker.setOptions({ runningMode: "VIDEO" });
            laserLine.classList.remove("active");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// 10. File upload listeners
btnUploadTrigger.addEventListener("click", () => {
    fileUpload.click();
});

fileUpload.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        processStaticImage(e.target.files[0]);
    }
});

// Drag and drop handlers
dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropOverlay.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropOverlay.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropOverlay.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
        processStaticImage(e.dataTransfer.files[0]);
    }
});

dropOverlay.addEventListener("click", () => {
    fileUpload.click();
});

// 11. Custom Toggles & Dashboard Controls
btnToggleMesh.addEventListener("click", () => {
    isMeshToggled = !isMeshToggled;
    btnToggleMesh.classList.toggle("active", isMeshToggled);
    addLog(`3D Tessellation mesh layer ${isMeshToggled ? 'enabled' : 'disabled'}.`, "info");
});

btnToggleDots.addEventListener("click", () => {
    isDotsToggled = !isDotsToggled;
    btnToggleDots.classList.toggle("active", isDotsToggled);
    addLog(`Constellation tracking points ${isDotsToggled ? 'enabled' : 'disabled'}.`, "info");
});

// 12. Composite Snapshot System
btnSnapshot.addEventListener("click", () => {
    addLog("Generating telemetry composite snapshot...", "system");
    
    try {
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        
        let targetWidth = canvasElement.width;
        let targetHeight = canvasElement.height;
        
        // If canvas is uninitialized, fall back
        if (targetWidth === 0 || targetHeight === 0) {
            alert("No visual telemetry available to capture. Connect your webcam or upload a static image first!");
            addLog("Capture failed: Viewport empty.", "error");
            return;
        }
        
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        
        // 1. Draw raw source layer (mirrored video if webcam, or static background image)
        if (isScanning) {
            // Apply scaleX(-1) mirror manually to offscreen canvas to match webcam feed
            tempCtx.translate(targetWidth, 0);
            tempCtx.scale(-1, 1);
            tempCtx.drawImage(videoElement, 0, 0, targetWidth, targetHeight);
            
            // Restore context coordinate system
            tempCtx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
            // Uploaded image is drawn directly inside the overlay canvas, so we can capture it
            // Draw whatever is on our active display canvas (it has image + overlays drawn)
            tempCtx.drawImage(canvasElement, 0, 0, targetWidth, targetHeight);
        }
        
        // 2. Overlay glowing HUD telemetry if webcam (static upload already has overlays on canvas)
        if (isScanning) {
            // Canvas overlay is mirrored visually via CSS, so we mirror draw it back
            tempCtx.translate(targetWidth, 0);
            tempCtx.scale(-1, 1);
            tempCtx.drawImage(canvasElement, 0, 0, targetWidth, targetHeight);
            tempCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
        
        // 3. Render watermark
        tempCtx.font = "bold 14px 'Orbitron', monospace";
        tempCtx.fillStyle = "rgba(0, 240, 255, 0.75)";
        tempCtx.fillText("CYBER-MESH // HUD_CAPTURE", 20, targetHeight - 40);
        
        const dateStr = new Date().toISOString().slice(0,19).replace('T','_').replace(/:/g,'-');
        tempCtx.font = "10px monospace";
        tempCtx.fillStyle = "rgba(255, 255, 255, 0.4)";
        tempCtx.fillText(`UTC_TIMESTAMP: ${dateStr}`, 20, targetHeight - 20);
        
        // 4. Download Trigger
        const url = tempCanvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `cybermesh_capture_${dateStr}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        addLog("Snapshot successfully rendered and downloaded.", "success");
    } catch (error) {
        addLog(`Capture rendering failed: ${error.message}`, "error");
    }
});

/* ═════════════════════════════════════════════════════════════════
   Sri Vipassi Dhamma School — face-api.js helpers
   ─────────────────────────────────────────────────────────────────
   Loads face-api.js from CDN, provides:
     • SVFace.loadModels()                    — call once
     • SVFace.computeDescriptor(videoOrImg)   — returns Float32Array or null
     • SVFace.startCamera(videoEl)            — get webcam stream
     • SVFace.stopCamera(videoEl)             — stop stream
     • SVFace.matchFace(descriptor, faces)    — returns best match
   ═════════════════════════════════════════════════════════════════ */

window.SVFace = (function () {

  // face-api.js model files (TinyFaceDetector + Landmark68 + Recognition)
  // Primary: jsDelivr (typically 3-5× faster than GitHub Pages)
  // Fallback: original GitHub Pages location, used if primary fails
  const MODELS_URLS = [
  './models',
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights'
];
  const FACE_API_CDN = './face-api.min.js';

  // Match threshold — euclidean distance between 128-D descriptors.
  // Lower = stricter. 0.55 is a good balance for school-lighting photos.
  // Raise to 0.60 if recognition is still unreliable.
  const MATCH_THRESHOLD = 0.55;

  let modelsLoaded = false;
  let loadingPromise = null;

  function injectScript() {
    return new Promise((resolve, reject) => {
      if (window.faceapi) return resolve();
      const s = document.createElement('script');
      s.src = FACE_API_CDN;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load face-api.js'));
      document.head.appendChild(s);
    });
  }

  // Try loading all three nets from a URL. If any fails, throw.
  async function loadAllFrom(modelsUrl) {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelsUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelsUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelsUrl)
    ]);
  }

 // REPLACE the existing loadModels async block with this:
async function loadModels() {
  if (modelsLoaded) return true;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    await injectScript();

    // 30-second timeout — if CDN is unreachable, fail fast
    function withTimeout(promise, ms) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Model load timed out after ' + (ms/1000) + 's — check your internet connection')), ms)
        )
      ]);
    }

    let lastErr = null;
    for (let i = 0; i < MODELS_URLS.length; i++) {
      try {
        await withTimeout(loadAllFrom(MODELS_URLS[i]), 30000);
        modelsLoaded = true;
        return true;
      } catch (e) {
        lastErr = e;
        console.warn('Model load from', MODELS_URLS[i], 'failed:', e.message);
      }
    }
    throw lastErr || new Error('All model CDNs failed');
  })();
  return loadingPromise;
}

  async function startCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });
    videoEl.srcObject = stream;
    await new Promise(res => videoEl.onloadedmetadata = res);
    await videoEl.play();
    return stream;
  }

  function stopCamera(videoEl) {
    if (!videoEl || !videoEl.srcObject) return;
    videoEl.srcObject.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  }

  /** Single-shot descriptor (used internally + by attendance scanner). */
  async function computeDescriptor(input) {
    await loadModels();
    // inputSize 416 is more accurate than 320 (default), still fast enough
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
    const result = await faceapi
      .detectSingleFace(input, opts)
      .withFaceLandmarks()
      .withFaceDescriptor();
    return result ? result.descriptor : null;
  }

  /**
   * Take multiple samples in quick succession and AVERAGE the descriptors.
   * This is far more robust than a single snapshot — small movements,
   * lighting flickers, and detection noise get smoothed out.
   * Used for sign-up registration AND face sign-in.
   * Returns null if NO sample contained a face.
   */
  
  async function computeRobustDescriptor(input, samples) {
    await loadModels();
    samples = samples || 3;
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });

    const collected = [];
    for (let i = 0; i < samples; i++) {
      try {
        const result = await faceapi
          .detectSingleFace(input, opts)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (result && result.descriptor) collected.push(result.descriptor);
      } catch (e) { /* skip */ }
      // brief pause between samples so we get slightly different frames
      if (i < samples - 1) await new Promise(r => setTimeout(r, 120));
    }

    if (collected.length === 0) return null;

    // Average across all valid samples
    const avg = new Float32Array(128);
    for (const d of collected) {
      for (let i = 0; i < 128; i++) avg[i] += d[i];
    }
    for (let i = 0; i < 128; i++) avg[i] /= collected.length;
    return avg;
  }

  /** Returns ALL faces in the frame (used by attendance scanner). */
  async function computeAllDescriptors(input) {
    await loadModels();
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
    const results = await faceapi
      .detectAllFaces(input, opts)
      .withFaceLandmarks()
      .withFaceDescriptors();
    return results; // array of { detection, landmarks, descriptor }
  }

  /** Convert Float32Array → regular array (so it's JSON-serializable). */
  function descriptorToArray(d) {
    if (!d) return null;
    return Array.from(d);
  }

  /** Convert stored array → Float32Array for matching. */
  function arrayToDescriptor(arr) {
    if (!arr) return null;
    return new Float32Array(arr);
  }

  /** Euclidean distance between two descriptors. */
  function distance(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  /**
   * Match an unknown descriptor against a list of known faces.
   * faces: [{ uid, name, descriptor: [...], role, grade }, ...]
   * Returns: { match: <best> | null, closest: <best>, distance: number }
   *   match   = best face if distance ≤ MATCH_THRESHOLD, otherwise null
   *   closest = ALWAYS the nearest face (for diagnostic "you got close!")
   */
  function matchFace(unknown, faces) {
    let best = null;
    let bestDist = Infinity;
    for (const f of faces) {
      const d = distance(unknown, arrayToDescriptor(f.descriptor));
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return {
      match:    bestDist <= MATCH_THRESHOLD ? best : null,
      closest:  best,
      distance: bestDist
    };
  }

  /**
   * Capture a still JPEG (base64 data URL) from a video element.
   * Used during signup to save photo to Drive.
   */
  function captureJpeg(videoEl, quality) {
    const c = document.createElement('canvas');
    c.width  = videoEl.videoWidth  || 640;
    c.height = videoEl.videoHeight || 480;
    c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality || 0.85);
  }

  return {
    loadModels,
    startCamera,
    stopCamera,
    computeDescriptor,
    computeRobustDescriptor,
    computeAllDescriptors,
    descriptorToArray,
    arrayToDescriptor,
    matchFace,
    captureJpeg,
    MATCH_THRESHOLD
  };

})();
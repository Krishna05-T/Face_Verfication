/**
 * Face Vault - Frontend Application Controller
 * Handles Webcam streaming, Biometric scanning, 1:N & 1:1 Face Verification,
 * Enrollment, Database Vault management, and Audio feedback.
 */

// Global App State
const state = {
    currentTab: 'tab-verify',
    verifyMode: '1:N', // '1:N' or '1:1'
    webcamStream: null,
    regWebcamStream: null,
    isScanning: false,
    autoScanInterval: null,
    soundEnabled: true,
    usersList: [],
    threshold: 0.38,
    activeUserIdFor1to1: null
};

// DOM Elements
const DOM = {
    // Tabs & Nav
    navItems: document.querySelectorAll('.nav-item'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    pageTitle: document.getElementById('pageTitle'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    navUserCount: document.getElementById('navUserCount'),
    miniTotalUsers: document.getElementById('miniTotalUsers'),
    miniMatchRate: document.getElementById('miniMatchRate'),
    headerThresholdVal: document.getElementById('headerThresholdVal'),
    quickStatsToday: document.getElementById('quickStatsToday'),
    btnToggleSound: document.getElementById('btnToggleSound'),
    soundIcon: document.getElementById('soundIcon'),
    badgeVerifyMode: document.getElementById('badgeVerifyMode'),

    // Live Verification Tab
    webcamVideo: document.getElementById('webcamVideo'),
    captureCanvas: document.getElementById('captureCanvas'),
    cameraOffPlaceholder: document.getElementById('cameraOffPlaceholder'),
    btnStartCamera: document.getElementById('btnStartCamera'),
    btnToggleCam: document.getElementById('btnToggleCam'),
    toggleCamLabel: document.getElementById('toggleCamLabel'),
    btnScanNow: document.getElementById('btnScanNow'),
    autoScanSwitch: document.getElementById('autoScanSwitch'),
    scanLaser: document.getElementById('scanLaser'),
    reticleLabel: document.getElementById('reticleLabel'),
    verifyModeSelector: document.getElementById('verifyModeSelector'),
    userSelectBar: document.getElementById('userSelectBar'),
    targetUserSelect: document.getElementById('targetUserSelect'),
    resultStatusBadge: document.getElementById('resultStatusBadge'),
    resultEmptyState: document.getElementById('resultEmptyState'),
    resultActiveState: document.getElementById('resultActiveState'),

    // Result Card Details
    matchBanner: document.getElementById('matchBanner'),
    matchBannerIcon: document.getElementById('matchBannerIcon'),
    matchBannerTitle: document.getElementById('matchBannerTitle'),
    matchBannerSubtitle: document.getElementById('matchBannerSubtitle'),
    matchPercentageDisplay: document.getElementById('matchPercentageDisplay'),
    liveResultImg: document.getElementById('liveResultImg'),
    storedResultImg: document.getElementById('storedResultImg'),
    storedResultTag: document.getElementById('storedResultTag'),
    metricSimilarityVal: document.getElementById('metricSimilarityVal'),
    similarityProgressBar: document.getElementById('similarityProgressBar'),
    metricCosineVal: document.getElementById('metricCosineVal'),
    metricThresholdVal: document.getElementById('metricThresholdVal'),
    metricLatencyVal: document.getElementById('metricLatencyVal'),
    matchedProfileDetails: document.getElementById('matchedProfileDetails'),
    profName: document.getElementById('profName'),
    profId: document.getElementById('profId'),
    profDept: document.getElementById('profDept'),
    profEmail: document.getElementById('profEmail'),
    topCandidatesSection: document.getElementById('topCandidatesSection'),
    candidatesList: document.getElementById('candidatesList'),

    // Register Tab
    registerUserForm: document.getElementById('registerUserForm'),
    regUserId: document.getElementById('regUserId'),
    regName: document.getElementById('regName'),
    regDept: document.getElementById('regDept'),
    regEmail: document.getElementById('regEmail'),
    regPhotoPreview: document.getElementById('regPhotoPreview'),
    regWebcamVideo: document.getElementById('regWebcamVideo'),
    btnRegStartCam: document.getElementById('btnRegStartCam'),
    btnRegSnap: document.getElementById('btnRegSnap'),
    regFileInput: document.getElementById('regFileInput'),
    btnSubmitRegister: document.getElementById('btnSubmitRegister'),

    // Database Vault Tab
    usersGrid: document.getElementById('usersGrid'),
    dbEmptyState: document.getElementById('dbEmptyState'),
    dbSearchInput: document.getElementById('dbSearchInput'),
    btnRefreshUsers: document.getElementById('btnRefreshUsers'),

    // Logs Tab
    logsTableBody: document.getElementById('logsTableBody'),
    logsEmptyState: document.getElementById('logsEmptyState'),
    btnRefreshLogs: document.getElementById('btnRefreshLogs'),
    btnClearLogs: document.getElementById('btnClearLogs'),

    // Settings Tab
    settingThresholdSlider: document.getElementById('settingThresholdSlider'),
    sliderThresholdDisplay: document.getElementById('sliderThresholdDisplay'),
    settingModelSelect: document.getElementById('settingModelSelect'),
    settingDetectorSelect: document.getElementById('settingDetectorSelect'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),

    // Modal & Toast
    embeddingModal: document.getElementById('embeddingModal'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalUserName: document.getElementById('modalUserName'),
    modalUserFullName: document.getElementById('modalUserFullName'),
    modalUserIdBadge: document.getElementById('modalUserIdBadge'),
    modalUserDept: document.getElementById('modalUserDept'),
    modalUserPhoto: document.getElementById('modalUserPhoto'),
    modalVectorText: document.getElementById('modalVectorText'),
    btnCopyVector: document.getElementById('btnCopyVector'),
    toastContainer: document.getElementById('toastContainer')
};

// Web Audio API Sound Synthesizer
class SoundEffects {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
    }

    playSuccess() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
        osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.3); // C6

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
    }

    playFail() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(180, now + 0.12);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    playScan() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
    }
}

const sfx = new SoundEffects();

// ==========================================
// Toast Notification System
// ==========================================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle text-cyan';
    if (type === 'success') icon = 'fa-circle-check text-emerald';
    if (type === 'error') icon = 'fa-circle-exclamation text-rose';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==========================================
// Camera Management
// ==========================================
async function startWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: false
        });

        state.webcamStream = stream;
        DOM.webcamVideo.srcObject = stream;
        DOM.cameraOffPlaceholder.style.display = 'none';
        DOM.toggleCamLabel.textContent = 'Stop Camera';
        showToast('Webcam feed initialized.', 'info');
    } catch (err) {
        console.error('Camera access error:', err);
        showToast('Unable to access camera: ' + err.message, 'error');
        DOM.cameraOffPlaceholder.style.display = 'flex';
        DOM.toggleCamLabel.textContent = 'Start Camera';
    }
}

function stopWebcam() {
    if (state.webcamStream) {
        state.webcamStream.getTracks().forEach(track => track.stop());
        state.webcamStream = null;
        DOM.webcamVideo.srcObject = null;
    }
    DOM.cameraOffPlaceholder.style.display = 'flex';
    DOM.toggleCamLabel.textContent = 'Start Camera';

    if (state.autoScanInterval) {
        clearInterval(state.autoScanInterval);
        state.autoScanInterval = null;
        DOM.autoScanSwitch.checked = false;
    }
}

function toggleWebcam() {
    if (state.webcamStream) {
        stopWebcam();
    } else {
        startWebcam();
    }
}

function captureFrameBase64(videoElement) {
    const canvas = DOM.captureCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;

    // Draw the image unmirrored
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
}

// ==========================================
// Live Verification & Identification
// ==========================================
async function performVerification() {
    if (!state.webcamStream) {
        showToast('Please start the camera first.', 'error');
        return;
    }

    if (state.isScanning) return;
    state.isScanning = true;

    // UI Feedback: Scanning HUD
    DOM.scanLaser.classList.add('scanning');
    DOM.reticleLabel.textContent = 'EXTRACTING 512-D EMBEDDING...';
    DOM.btnScanNow.disabled = true;
    sfx.playScan();

    const imageData = captureFrameBase64(DOM.webcamVideo);
    const targetUserId = (state.verifyMode === '1:1') ? DOM.targetUserSelect.value : null;

    if (state.verifyMode === '1:1' && !targetUserId) {
        showToast('Please select a target user for 1:1 verification.', 'error');
        resetScanUI();
        return;
    }

    try {
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imageData,
                user_id: targetUserId,
                threshold: state.threshold
            })
        });

        const data = await response.json();

        if (!data.success) {
            showToast(data.error || 'Verification failed.', 'error');
            sfx.playFail();
            displayFailedScanResult(data, imageData);
        } else {
            displayScanResult(data, imageData);
            if (data.matched) {
                sfx.playSuccess();
                showToast(`Verified: ${data.user.name} (${data.similarity_score}%)`, 'success');
            } else {
                sfx.playFail();
                showToast(`No match found (Best distance: ${data.cosine_distance})`, 'error');
            }
        }

        // Refresh stats & logs in background
        loadStats();
    } catch (err) {
        console.error('Verify error:', err);
        showToast('Server communication error: ' + err.message, 'error');
        sfx.playFail();
    } finally {
        resetScanUI();
    }
}

function resetScanUI() {
    state.isScanning = false;
    DOM.scanLaser.classList.remove('scanning');
    DOM.reticleLabel.textContent = 'ALIGN FACE';
    DOM.btnScanNow.disabled = false;
}

function displayScanResult(data, liveImageData) {
    DOM.resultEmptyState.style.display = 'none';
    DOM.resultActiveState.style.display = 'block';

    const matched = data.matched;
    const score = data.similarity_score;
    const distance = data.cosine_distance;
    const user = data.user;

    // Status Banner
    if (matched && user) {
        DOM.matchBanner.className = 'match-banner';
        DOM.matchBannerIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        DOM.matchBannerTitle.textContent = `Identity Confirmed: ${user.name}`;
        DOM.matchBannerSubtitle.textContent = `Face embedding matched User ID [${user.user_id}]`;
        DOM.matchPercentageDisplay.textContent = `${score}%`;
        DOM.resultStatusBadge.className = 'badge status-tag pass';
        DOM.resultStatusBadge.textContent = 'MATCH VERIFIED';

        // Profile Details
        DOM.matchedProfileDetails.style.display = 'block';
        DOM.profName.textContent = user.name;
        DOM.profId.textContent = user.user_id;
        DOM.profDept.textContent = user.department || 'General';
        DOM.profEmail.textContent = user.email || 'N/A';

        // Stored Photo
        DOM.storedResultImg.src = user.photo_base64 || '/static/placeholder.png';
        DOM.storedResultTag.textContent = 'Enrolled Identity';
    } else {
        DOM.matchBanner.className = 'match-banner failed';
        DOM.matchBannerIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        DOM.matchBannerTitle.textContent = 'Unknown / Unrecognized Face';
        DOM.matchBannerSubtitle.textContent = `No stored face embedding matched below threshold (${data.threshold})`;
        DOM.matchPercentageDisplay.textContent = `${score}%`;
        DOM.resultStatusBadge.className = 'badge status-tag fail';
        DOM.resultStatusBadge.textContent = 'NO MATCH';

        DOM.matchedProfileDetails.style.display = 'none';
        if (data.best_candidate) {
            DOM.storedResultImg.src = data.best_candidate.photo_base64 || '/static/placeholder.png';
            DOM.storedResultTag.textContent = `Closest (${data.best_candidate.score}%)`;
        } else {
            DOM.storedResultImg.src = '/static/placeholder.png';
            DOM.storedResultTag.textContent = 'No Profile Match';
        }
    }

    // Live Snapshot preview
    DOM.liveResultImg.src = data.live_crop || liveImageData;

    // Metrics
    DOM.metricSimilarityVal.textContent = `${score}%`;
    DOM.similarityProgressBar.style.width = `${Math.min(100, score)}%`;
    DOM.similarityProgressBar.className = matched ? 'progress-bar-fill' : 'progress-bar-fill failed';

    DOM.metricCosineVal.textContent = distance !== undefined ? distance.toFixed(4) : '--';
    DOM.metricThresholdVal.textContent = data.threshold ? data.threshold.toFixed(2) : '0.38';
    DOM.metricLatencyVal.textContent = `${data.execution_time_ms || 0} ms`;

    // 1:N Ranked Candidates List
    if (data.candidates && data.candidates.length > 0) {
        DOM.topCandidatesSection.style.display = 'block';
        DOM.candidatesList.innerHTML = data.candidates.map((cand, idx) => `
            <div class="cand-item">
                <span class="cand-name">#${idx + 1} ${cand.name} <small class="text-secondary">(${cand.user_id})</small></span>
                <span class="cand-score">${cand.score}% <small class="text-muted">(dist: ${cand.distance})</small></span>
            </div>
        `).join('');
    } else {
        DOM.topCandidatesSection.style.display = 'none';
    }
}

function displayFailedScanResult(data, liveImageData) {
    DOM.resultEmptyState.style.display = 'none';
    DOM.resultActiveState.style.display = 'block';

    DOM.matchBanner.className = 'match-banner failed';
    DOM.matchBannerIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    DOM.matchBannerTitle.textContent = 'Face Detection / Verification Error';
    DOM.matchBannerSubtitle.textContent = data.error || 'Please position your face properly.';
    DOM.matchPercentageDisplay.textContent = '0%';
    DOM.resultStatusBadge.className = 'badge status-tag fail';
    DOM.resultStatusBadge.textContent = 'SCAN ERROR';

    DOM.liveResultImg.src = liveImageData;
    DOM.storedResultImg.src = '/static/placeholder.png';
    DOM.matchedProfileDetails.style.display = 'none';
    DOM.topCandidatesSection.style.display = 'none';
}

// ==========================================
// Face Registration & Enrollment
// ==========================================
let currentRegImageData = null;

async function startRegWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' },
            audio: false
        });
        state.regWebcamStream = stream;
        DOM.regWebcamVideo.srcObject = stream;
        DOM.regWebcamVideo.style.display = 'block';
        DOM.regPhotoPreview.style.display = 'none';
        DOM.btnRegSnap.style.display = 'inline-flex';
        DOM.btnRegStartCam.textContent = 'Cancel Webcam';
    } catch (err) {
        showToast('Camera error: ' + err.message, 'error');
    }
}

function stopRegWebcam() {
    if (state.regWebcamStream) {
        state.regWebcamStream.getTracks().forEach(t => t.stop());
        state.regWebcamStream = null;
        DOM.regWebcamVideo.srcObject = null;
    }
    DOM.regWebcamVideo.style.display = 'none';
    DOM.regPhotoPreview.style.display = 'block';
    DOM.btnRegSnap.style.display = 'none';
    DOM.btnRegStartCam.innerHTML = '<i class="fa-solid fa-camera"></i> Live WebCam Snap';
}

function snapRegPhoto() {
    if (!state.regWebcamStream) return;
    const canvas = document.createElement('canvas');
    canvas.width = DOM.regWebcamVideo.videoWidth || 640;
    canvas.height = DOM.regWebcamVideo.videoHeight || 640;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(DOM.regWebcamVideo, 0, 0);

    currentRegImageData = canvas.toDataURL('image/jpeg', 0.9);
    DOM.regPhotoPreview.src = currentRegImageData;
    stopRegWebcam();
    showToast('Photo captured! Ready for enrollment.', 'success');
}

DOM.regFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        currentRegImageData = event.target.result;
        DOM.regPhotoPreview.src = currentRegImageData;
        stopRegWebcam();
        showToast('Image loaded successfully.', 'info');
    };
    reader.readAsDataURL(file);
});

DOM.registerUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentRegImageData) {
        showToast('Please snap or upload a face photo first!', 'error');
        return;
    }

    const userId = DOM.regUserId.value.trim();
    const name = DOM.regName.value.trim();
    const dept = DOM.regDept.value.trim();
    const email = DOM.regEmail.value.trim();

    DOM.btnSubmitRegister.disabled = true;
    DOM.btnSubmitRegister.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Computing 512-D Embeddings...';

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                name: name,
                department: dept,
                email: email,
                image: currentRegImageData
            })
        });

        const data = await response.json();

        if (data.success) {
            sfx.playSuccess();
            showToast(`User '${name}' enrolled with 512-D vector!`, 'success');
            DOM.registerUserForm.reset();
            currentRegImageData = null;
            DOM.regPhotoPreview.src = '/static/placeholder.png';
            loadUsers();
            loadStats();
        } else {
            sfx.playFail();
            showToast(data.error || 'Enrollment failed.', 'error');
        }
    } catch (err) {
        sfx.playFail();
        showToast('Error: ' + err.message, 'error');
    } finally {
        DOM.btnSubmitRegister.disabled = false;
        DOM.btnSubmitRegister.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Extract & Save Face Embedding';
    }
});

// ==========================================
// Database Vault Management
// ==========================================
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        const data = await response.json();
        if (data.success) {
            state.usersList = data.users;
            renderUsersGrid(data.users);
            updateTargetUserSelect(data.users);
            DOM.navUserCount.textContent = data.total;
            DOM.miniTotalUsers.textContent = data.total;
        }
    } catch (err) {
        console.error('Failed to load users:', err);
    }
}

function renderUsersGrid(users) {
    const filterText = DOM.dbSearchInput.value.toLowerCase().trim();
    const filtered = users.filter(u => 
        u.name.toLowerCase().includes(filterText) || 
        u.user_id.toLowerCase().includes(filterText) ||
        (u.department && u.department.toLowerCase().includes(filterText))
    );

    if (filtered.length === 0) {
        DOM.usersGrid.innerHTML = '';
        DOM.dbEmptyState.style.display = 'flex';
        return;
    }

    DOM.dbEmptyState.style.display = 'none';
    DOM.usersGrid.innerHTML = filtered.map(u => `
        <div class="user-vault-card">
            <div class="user-card-top">
                <div class="user-card-avatar">
                    <img src="${u.photo_base64 || '/static/placeholder.png'}" alt="${u.name}">
                </div>
                <div class="user-card-meta">
                    <h4>${u.name}</h4>
                    <p class="id-badge">ID: ${u.user_id}</p>
                    <p class="dept-badge"><i class="fa-solid fa-building"></i> ${u.department || 'General'}</p>
                </div>
            </div>
            <div class="user-card-vector-badge">
                <span>Vector: <strong>${u.embedding_dimensions || 512}-D</strong></span>
                <span title="${u.created_at}"><i class="fa-regular fa-clock"></i> ${u.created_at ? u.created_at.split(' ')[0] : 'Today'}</span>
            </div>
            <div class="user-card-actions">
                <button class="btn btn-xs btn-secondary" onclick="inspectUserVector('${u.user_id}')">
                    <i class="fa-solid fa-dna"></i> Vector
                </button>
                <button class="btn btn-xs btn-danger-outline" onclick="confirmDeleteUser('${u.user_id}', '${u.name}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function updateTargetUserSelect(users) {
    DOM.targetUserSelect.innerHTML = '<option value="">-- Select Registered Profile --</option>' +
        users.map(u => `<option value="${u.user_id}">${u.name} (${u.user_id})</option>`).join('');
}

window.inspectUserVector = async function(userId) {
    try {
        const res = await fetch(`/api/users/${userId}`);
        const data = await res.json();
        if (data.success) {
            const u = data.user;
            DOM.modalUserName.textContent = `Vector Embeddings: ${u.name}`;
            DOM.modalUserFullName.textContent = u.name;
            DOM.modalUserIdBadge.textContent = `ID: ${u.user_id} (${u.embedding_dimensions}-Dimensional)`;
            DOM.modalUserDept.textContent = `Department: ${u.department || 'General'}`;
            DOM.modalUserPhoto.src = u.photo_base64 || '/static/placeholder.png';
            DOM.modalVectorText.textContent = JSON.stringify(u.embedding_preview, null, 2) + `\n// ... ${u.embedding_dimensions - 12} additional vector coordinates stored in database`;
            
            DOM.embeddingModal.classList.add('show');
        }
    } catch (err) {
        showToast('Failed to inspect vector: ' + err.message, 'error');
    }
};

window.confirmDeleteUser = async function(userId, name) {
    if (!confirm(`Are you sure you want to delete profile for '${name}' (ID: ${userId})?`)) return;

    try {
        const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast(`User '${name}' removed.`, 'info');
            loadUsers();
            loadStats();
        } else {
            showToast(data.error || 'Failed to delete user.', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
};

// ==========================================
// Verification Logs
// ==========================================
async function loadLogs() {
    try {
        const response = await fetch('/api/logs?limit=50');
        const data = await response.json();
        if (data.success) {
            renderLogsTable(data.logs);
        }
    } catch (err) {
        console.error('Failed to load logs:', err);
    }
}

function renderLogsTable(logs) {
    if (!logs || logs.length === 0) {
        DOM.logsTableBody.innerHTML = '';
        DOM.logsEmptyState.style.display = 'flex';
        return;
    }

    DOM.logsEmptyState.style.display = 'none';
    DOM.logsTableBody.innerHTML = logs.map(log => `
        <tr>
            <td>
                <img class="log-snapshot-thumb" src="${log.snapshot_base64 || '/static/placeholder.png'}" alt="Snapshot">
            </td>
            <td class="font-mono text-secondary">${log.timestamp}</td>
            <td>
                <strong>${log.user_name}</strong>
                <div class="font-mono text-cyan" style="font-size: 11px;">${log.user_id}</div>
            </td>
            <td><span class="badge font-mono">${log.mode}</span></td>
            <td>
                <span class="status-tag ${log.matched ? 'pass' : 'fail'}">
                    <i class="fa-solid ${log.matched ? 'fa-check' : 'fa-xmark'}"></i>
                    ${log.matched ? 'PASSED' : 'FAILED'}
                </span>
            </td>
            <td class="font-mono font-bold ${log.matched ? 'text-cyan' : 'text-secondary'}">${log.similarity_score}%</td>
            <td class="font-mono">${log.cosine_distance.toFixed(4)}</td>
            <td class="font-mono text-secondary">${log.threshold.toFixed(2)}</td>
        </tr>
    `).join('');
}

async function clearLogs() {
    if (!confirm('Are you sure you want to clear all verification logs?')) return;
    try {
        const res = await fetch('/api/clear_logs', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Logs cleared.', 'info');
            loadLogs();
            loadStats();
        }
    } catch (err) {
        showToast('Error clearing logs: ' + err.message, 'error');
    }
}

// ==========================================
// Stats & Settings
// ==========================================
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        if (data.success) {
            const s = data.stats;
            DOM.miniTotalUsers.textContent = s.total_users;
            DOM.miniMatchRate.textContent = `${s.match_rate}%`;
            DOM.quickStatsToday.innerHTML = `Today: <strong>${s.today_verifications} scans</strong>`;
            DOM.navUserCount.textContent = s.total_users;
        }
    } catch (err) {
        console.error('Stats load error:', err);
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (data.success) {
            const s = data.settings;
            state.threshold = s.similarity_threshold;
            DOM.settingThresholdSlider.value = s.similarity_threshold;
            DOM.sliderThresholdDisplay.textContent = s.similarity_threshold.toFixed(2);
            DOM.headerThresholdVal.textContent = s.similarity_threshold.toFixed(2);
            DOM.metricThresholdVal.textContent = s.similarity_threshold.toFixed(2);
            DOM.settingModelSelect.value = s.model_name;
            DOM.settingDetectorSelect.value = s.detector_backend;
        }
    } catch (err) {
        console.error('Settings load error:', err);
    }
}

DOM.settingThresholdSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    DOM.sliderThresholdDisplay.textContent = val.toFixed(2);
});

DOM.btnSaveSettings.addEventListener('click', async () => {
    const threshold = parseFloat(DOM.settingThresholdSlider.value);
    const model = DOM.settingModelSelect.value;
    const detector = DOM.settingDetectorSelect.value;

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                similarity_threshold: threshold,
                model_name: model,
                detector_backend: detector
            })
        });
        const data = await res.json();
        if (data.success) {
            state.threshold = threshold;
            DOM.headerThresholdVal.textContent = threshold.toFixed(2);
            DOM.metricThresholdVal.textContent = threshold.toFixed(2);
            showToast('Biometric parameters updated successfully!', 'success');
        }
    } catch (err) {
        showToast('Error saving settings: ' + err.message, 'error');
    }
});

// ==========================================
// Event Listeners & Tab Navigation
// ==========================================
function setupNavigation() {
    DOM.navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabId) {
    state.currentTab = tabId;

    DOM.navItems.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    DOM.tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
    });

    // Update Titles
    if (tabId === 'tab-verify') {
        DOM.pageTitle.textContent = 'Live Face Verification & Identification';
        DOM.pageSubtitle.textContent = 'Compare live camera feed against stored 512-D face embeddings';
        if (!state.webcamStream) startWebcam();
    } else if (tabId === 'tab-register') {
        DOM.pageTitle.textContent = 'Face Registration & Vector Enrollment';
        DOM.pageSubtitle.textContent = 'Capture face photos and generate 512-D DeepFace embeddings for SQLite persistence';
        stopWebcam();
    } else if (tabId === 'tab-database') {
        DOM.pageTitle.textContent = 'Enrolled Identities Database Vault';
        DOM.pageSubtitle.textContent = 'Browse, search, inspect embeddings, and manage enrolled users';
        loadUsers();
    } else if (tabId === 'tab-logs') {
        DOM.pageTitle.textContent = 'Verification Audit Trail & Security Logs';
        DOM.pageSubtitle.textContent = 'History of all 1:1 and 1:N biometric verification attempts with match scores';
        loadLogs();
    } else if (tabId === 'tab-settings') {
        DOM.pageTitle.textContent = 'System & Algorithm Configuration';
        DOM.pageSubtitle.textContent = 'Adjust cosine similarity threshold, neural architecture, and computer vision backends';
        loadSettings();
    }
}

// Mode Selection (1:N vs 1:1)
DOM.verifyModeSelector.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        const mode = e.target.getAttribute('data-mode');
        state.verifyMode = mode;

        DOM.verifyModeSelector.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        if (mode === '1:1') {
            DOM.userSelectBar.style.display = 'flex';
            DOM.badgeVerifyMode.textContent = '1:1 Targeted';
        } else {
            DOM.userSelectBar.style.display = 'none';
            DOM.badgeVerifyMode.textContent = '1:N Auto';
        }
    }
});

// Auto Scan Switch
DOM.autoScanSwitch.addEventListener('change', (e) => {
    if (e.target.checked) {
        if (!state.webcamStream) {
            showToast('Start camera first to enable auto-scan.', 'error');
            e.target.checked = false;
            return;
        }
        showToast('Continuous auto-scan activated (every 2.5s)', 'info');
        performVerification();
        state.autoScanInterval = setInterval(() => {
            if (!state.isScanning && state.webcamStream) {
                performVerification();
            }
        }, 2500);
    } else {
        if (state.autoScanInterval) {
            clearInterval(state.autoScanInterval);
            state.autoScanInterval = null;
        }
        showToast('Auto-scan deactivated', 'info');
    }
});

// Sound Toggle
DOM.btnToggleSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    DOM.soundIcon.className = state.soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark text-rose';
    showToast(state.soundEnabled ? 'Audio feedback enabled' : 'Audio feedback muted', 'info');
});

// Button Bindings
DOM.btnStartCamera.addEventListener('click', startWebcam);
DOM.btnToggleCam.addEventListener('click', toggleWebcam);
DOM.btnScanNow.addEventListener('click', performVerification);

DOM.btnRegStartCam.addEventListener('click', () => {
    if (state.regWebcamStream) {
        stopRegWebcam();
    } else {
        startRegWebcam();
    }
});
DOM.btnRegSnap.addEventListener('click', snapRegPhoto);

DOM.btnRefreshUsers.addEventListener('click', () => {
    loadUsers();
    showToast('Database vault refreshed.', 'info');
});
DOM.dbSearchInput.addEventListener('input', () => renderUsersGrid(state.usersList));

DOM.btnRefreshLogs.addEventListener('click', () => {
    loadLogs();
    showToast('Audit logs refreshed.', 'info');
});
DOM.btnClearLogs.addEventListener('click', clearLogs);

// Modal Controls
DOM.modalCloseBtn.addEventListener('click', () => DOM.embeddingModal.classList.remove('show'));
DOM.embeddingModal.querySelector('.modal-backdrop').addEventListener('click', () => DOM.embeddingModal.classList.remove('show'));
DOM.btnCopyVector.addEventListener('click', () => {
    navigator.clipboard.writeText(DOM.modalVectorText.textContent);
    showToast('Embedding JSON copied to clipboard!', 'success');
});

// ==========================================
// Initialization
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    loadSettings();
    loadUsers();
    loadLogs();
    loadStats();
    startWebcam();
});

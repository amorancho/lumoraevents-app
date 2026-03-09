var title = 'Voting';

const allowedRoles = ["admin", "judge"];

let criteriaList = [];

let criteriaColumnsVisible = false;
const CRITERIA_COL_VIS_STORAGE_PREFIX = 'lumora.voting.criteriaColumnsVisible';

let modal, criteriaContainer;
let commentsModal, commentsTextarea, saveCommentsBtn, clearCommentsBtn;
let commentsContext = { competitionId: null, dancerId: null };
let audioFeedbackModal;
const audioFeedbackElements = {};
const audioFeedbackState = {
  context: null,
  feedbackInfo: null,
  remoteObjectUrl: '',
  previewObjectUrl: '',
  previewBlob: null,
  previewDuration: null,
  mediaRecorder: null,
  mediaStream: null,
  recordingChunks: [],
  recordingStartedAt: 0,
  recordingTimerId: null,
  isLoading: false,
  isSaving: false,
  isDeleting: false,
  loadRequestId: 0
};
let competitionSelect, competitionInfo, dancersTableContainer, refreshBtn, previousCompetitionBtn, nextCompetitionBtn;
let competitionTomSelect = null;
let availableCompetitions = [];
let headJudgeTooltip = null;
const penaltyAssignmentState = {
  context: null,
  penalties: [],
  competitionPenalties: []
};

const DEFAULT_MIN_SCORE = 1;
const DEFAULT_MAX_SCORE = 10;
const MOBILE_MAX_WIDTH = 768;

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

function generateScoreOptions(scoreType, min = DEFAULT_MIN_SCORE, max = DEFAULT_MAX_SCORE) {
  const normalizedType = (scoreType || 'INT').toUpperCase();
  const step = normalizedType === 'DEC' ? 0.1 : normalizedType === 'MED' ? 0.5 : 1;
  const options = [];
  let current = min;

  while (current <= max + 1e-9) {
    const rounded = normalizedType === 'INT' ? Math.round(current) : Number(current.toFixed(1));
    options.push(rounded);
    current += step;
  }

  return options;
}

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;
  await WaitEventLoaded();

  criteriaColumnsVisible = loadCriteriaColumnsVisibility();

  competitionSelect = document.getElementById('competitionSelect');
  competitionInfo = document.getElementById('competitionInfo');
  dancersTableContainer = document.getElementById('dancersTableContainer');
  refreshBtn = document.getElementById('refreshBtn');
  previousCompetitionBtn = document.getElementById('previousCompetitionBtn');
  nextCompetitionBtn = document.getElementById('nextCompetitionBtn');
  const toggleCriteriaBtn = document.getElementById('toggleCriteriaBtn');

  refreshBtn.disabled = true;
  if (previousCompetitionBtn) previousCompetitionBtn.disabled = true;
  if (nextCompetitionBtn) nextCompetitionBtn.disabled = true;

  if (toggleCriteriaBtn) {
    toggleCriteriaBtn.addEventListener('click', () => {
      setCriteriaColumnsVisibility(!criteriaColumnsVisible, { persist: true });
    });
  }

  await ensureTranslationsReady();

  competitionSelect.addEventListener('change', () => {
    updateCompetitionNavigationButtons();
    loadCompetitionAndDancers();
    refreshBtn.disabled = !getSelectedCompetitionId();
  });

  refreshBtn.addEventListener('click', () => {
    loadCompetitionAndDancers();
  });

  if (previousCompetitionBtn) {
    previousCompetitionBtn.addEventListener('click', () => {
      navigateCompetition(-1);
    });
  }

  if (nextCompetitionBtn) {
    nextCompetitionBtn.addEventListener('click', () => {
      navigateCompetition(1);
    });
  }

  await reloadCompetitionsAndSelectFirstOpen();

  syncCriteriaToggleButtonState();

  const modalEl = document.getElementById('detailsModal');
  modal = new bootstrap.Modal(modalEl);
  criteriaContainer = document.getElementById('criteriaContainer');

  initCommentsModal();
  initAudioFeedbackModal();
  initPenaltyAssignmentModal();

});

function getCriteriaColumnsVisibilityStorageKey() {
  const eventId = typeof getEvent === 'function' ? (getEvent()?.id ?? 'no_event') : 'no_event';
  const userId = typeof getUserId === 'function' ? (getUserId() ?? 'no_user') : 'no_user';
  return `${CRITERIA_COL_VIS_STORAGE_PREFIX}:${eventId}:${userId}`;
}

function loadCriteriaColumnsVisibility() {
  try {
    const raw = localStorage.getItem(getCriteriaColumnsVisibilityStorageKey());
    if (raw === null) return false;
    return raw === 'true';
  } catch {
    return false;
  }
}

function saveCriteriaColumnsVisibility(visible) {
  try {
    localStorage.setItem(getCriteriaColumnsVisibilityStorageKey(), String(Boolean(visible)));
  } catch {
    // ignore
  }
}

function syncCriteriaToggleButtonState() {
  const toggleCriteriaBtn = document.getElementById('toggleCriteriaBtn');
  if (toggleCriteriaBtn) {
    toggleCriteriaBtn.disabled = !(Array.isArray(criteriaList) && criteriaList.length > 0);
  }
  setCriteriaColumnsVisibility(criteriaColumnsVisible, { persist: false });
  syncCommentsColumnPresentation();
}

function setCriteriaColumnsVisibility(visible, { persist = false } = {}) {
  criteriaColumnsVisible = Boolean(visible);

  const dancersTableContainer = document.getElementById('dancersTableContainer');
  if (dancersTableContainer) {
    dancersTableContainer.classList.toggle('dancers-table-expanded', criteriaColumnsVisible);
    dancersTableContainer.classList.toggle('dancers-table-collapsed', !criteriaColumnsVisible);
  }

  document.querySelectorAll('#dancersTableContainer .criteria-col').forEach(el => {
    el.classList.toggle('d-none', !criteriaColumnsVisible);
  });

  syncCommentsColumnPresentation();

  const toggleCriteriaBtnText = document.getElementById('toggleCriteriaBtnText');
  const toggleCriteriaBtn = document.getElementById('toggleCriteriaBtn');
  const labelKey = criteriaColumnsVisible ? 'hide_scores_table' : 'show_scores_table';
  const fallback = criteriaColumnsVisible ? 'Hide scores' : 'Show scores';
  if (toggleCriteriaBtnText) toggleCriteriaBtnText.textContent = t(labelKey, fallback);
  if (toggleCriteriaBtn) toggleCriteriaBtn.setAttribute('aria-pressed', criteriaColumnsVisible ? 'true' : 'false');

  if (persist) saveCriteriaColumnsVisibility(criteriaColumnsVisible);
}

function syncCommentsColumnPresentation() {
  const feedbackLabel = t('feedback', 'Feedback');
  const commentsLabel = t('comments', 'Comments');
  const audioFeedbackLabel = t('audio_feedback', 'Send feedback via audio');

  const commentsHeader = document.querySelector('#dancersTableHeadRow th[data-col="comments"]');
  if (commentsHeader) {
    commentsHeader.textContent = feedbackLabel;
  }

  document.querySelectorAll('#dancersTableContainer [data-role="comments-btn"]').forEach(btn => {
    const hasComments = btn.dataset.hasComments === 'true';
    btn.innerHTML = `<i class="bi ${hasComments ? 'bi-chat-dots-fill' : 'bi-chat-dots'}" aria-hidden="true"></i>`;
    btn.setAttribute('aria-label', commentsLabel);
    btn.setAttribute('title', commentsLabel);
  });

  document.querySelectorAll('#dancersTableContainer [data-role="audio-feedback-btn"]').forEach(btn => {
    const hasFeedback = btn.dataset.hasFeedback === 'true';
    btn.innerHTML = `<i class="bi ${hasFeedback ? 'bi-mic-fill' : 'bi-mic'}" aria-hidden="true"></i>`;
    btn.setAttribute('aria-label', audioFeedbackLabel);
    btn.setAttribute('title', audioFeedbackLabel);
  });
}

function initCommentsModal() {
  const modalEl = document.getElementById('commentsModal');
  commentsTextarea = document.getElementById('commentsTextarea');
  saveCommentsBtn = document.getElementById('saveCommentsBtn');
  clearCommentsBtn = document.getElementById('clearCommentsBtn');

  if (!modalEl || !commentsTextarea || !saveCommentsBtn || !clearCommentsBtn) return;

  commentsModal = new bootstrap.Modal(modalEl);

  modalEl.addEventListener('hidden.bs.modal', () => {
    commentsTextarea.value = '';
    commentsContext = { competitionId: null, dancerId: null };
    setCommentsButtonsDisabled(false);
  });

  saveCommentsBtn.addEventListener('click', async () => {
    if (!commentsContext.competitionId || !commentsContext.dancerId) return;
    await upsertComments(commentsContext.competitionId, commentsContext.dancerId, commentsTextarea.value);
  });

  clearCommentsBtn.addEventListener('click', async () => {
    if (!commentsContext.competitionId || !commentsContext.dancerId) return;
    await upsertComments(commentsContext.competitionId, commentsContext.dancerId, '');
  });
}

function setCommentsButtonsDisabled(disabled) {
  if (saveCommentsBtn) saveCommentsBtn.disabled = disabled;
  if (clearCommentsBtn) clearCommentsBtn.disabled = disabled;
}

async function upsertComments(competitionId, dancerId, comments) {
  try {
    setCommentsButtonsDisabled(true);

    const res = await fetch(`${API_BASE_URL}/api/competitions/${competitionId}/comments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: getEvent().id,
        judge_id: getUserId(),
        dancer_id: dancerId,
        comments: comments ?? ''
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      showMessageModal(errData.error || 'Error saving comments', 'Error');
      setCommentsButtonsDisabled(false);
      return;
    }

    commentsModal?.hide();
    await loadCompetitionAndDancers();
  } catch (err) {
    console.error('Error saving comments', err);
    showMessageModal('Error saving comments', 'Error');
    setCommentsButtonsDisabled(false);
  }
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function formatDuration(value) {
  const totalSeconds = Math.round(Number(value));
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '-';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function buildAudioFeedbackParams(dancerId) {
  const params = new URLSearchParams();
  params.set('event_id', String(getEvent()?.id ?? ''));
  params.set('judge_id', String(getUserId() ?? ''));
  params.set('dancer_id', String(dancerId ?? ''));
  return params;
}

function getAudioFeedbackUrl(competitionId, dancerId) {
  const params = buildAudioFeedbackParams(dancerId);
  return `${API_BASE_URL}/api/competitions/${competitionId}/feedback?${params.toString()}`;
}

function getAudioFeedbackDownloadUrl(competitionId, dancerId) {
  const params = buildAudioFeedbackParams(dancerId);
  return `${API_BASE_URL}/api/competitions/${competitionId}/feedback/download?${params.toString()}`;
}

function supportsAudioFeedbackRecording() {
  return Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

function getPreferredAudioFeedbackMimeType() {
  if (typeof MediaRecorder !== 'function' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];

  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function getAudioFeedbackFileExtension(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mp4') || normalized.includes('aac')) return 'm4a';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('wav')) return 'wav';
  return 'webm';
}

function buildAudioFeedbackFilename(mimeType) {
  const dancerId = audioFeedbackState.context?.dancerId || 'participant';
  const extension = getAudioFeedbackFileExtension(mimeType);
  return `feedback-${dancerId}-${Date.now()}.${extension}`;
}

function getFilenameFromHeader(headerValue) {
  if (!headerValue) return '';
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(headerValue);
  if (!match || !match[1]) return '';
  try {
    return decodeURIComponent(match[1].replace(/"/g, '').trim());
  } catch {
    return match[1].replace(/"/g, '').trim();
  }
}

function clearAudioElementSource(audioEl) {
  if (!audioEl) return;
  audioEl.pause();
  audioEl.removeAttribute('src');
  audioEl.load();
}

function revokeObjectUrl(url) {
  if (!url) return;
  URL.revokeObjectURL(url);
}

function clearAudioFeedbackRemoteAudio() {
  revokeObjectUrl(audioFeedbackState.remoteObjectUrl);
  audioFeedbackState.remoteObjectUrl = '';
  clearAudioElementSource(audioFeedbackElements.existingPlayer);
}

function clearAudioFeedbackPreview() {
  revokeObjectUrl(audioFeedbackState.previewObjectUrl);
  audioFeedbackState.previewObjectUrl = '';
  audioFeedbackState.previewBlob = null;
  audioFeedbackState.previewDuration = null;
  clearAudioElementSource(audioFeedbackElements.previewPlayer);
}

function stopAudioFeedbackTimer() {
  if (audioFeedbackState.recordingTimerId) {
    window.clearInterval(audioFeedbackState.recordingTimerId);
    audioFeedbackState.recordingTimerId = null;
  }
}

function updateAudioFeedbackRecordingTimer(totalSeconds) {
  if (audioFeedbackElements.recordingTimer) {
    audioFeedbackElements.recordingTimer.textContent = formatDuration(totalSeconds);
  }
}

function stopAudioFeedbackStream() {
  if (!audioFeedbackState.mediaStream) return;
  audioFeedbackState.mediaStream.getTracks().forEach(track => track.stop());
  audioFeedbackState.mediaStream = null;
}

function isAudioFeedbackRecording() {
  return Boolean(audioFeedbackState.mediaRecorder && audioFeedbackState.mediaRecorder.state === 'recording');
}

function setAudioFeedbackError(message = '') {
  const errorEl = audioFeedbackElements.errorAlert;
  if (!errorEl) return;
  errorEl.textContent = message || '';
  errorEl.classList.toggle('d-none', !message);
}

function resolveAudioFeedbackRecordingError(error) {
  if (!window.isSecureContext) {
    return t(
      'audio_feedback_secure_context_error',
      'El microfono solo se puede usar desde HTTPS o desde localhost.'
    );
  }

  const errorName = String(error?.name || '').trim();

  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || errorName === 'SecurityError') {
    return t(
      'audio_feedback_permission_error',
      'El navegador no tiene permiso para usar el microfono. Revisa el candado de la URL y permite acceso al microfono.'
    );
  }

  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return t(
      'audio_feedback_device_not_found_error',
      'No se encontro ningun microfono disponible en este equipo.'
    );
  }

  if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    return t(
      'audio_feedback_device_busy_error',
      'El microfono esta siendo usado por otra aplicacion o no se puede leer en este momento.'
    );
  }

  if (errorName === 'OverconstrainedError' || errorName === 'ConstraintNotSatisfiedError') {
    return t(
      'audio_feedback_constraints_error',
      'El navegador no ha podido inicializar la grabacion de audio con este dispositivo.'
    );
  }

  return t(
    'audio_feedback_microphone_error',
    'No se pudo acceder al microfono.'
  );
}

function updateAudioFeedbackUi() {
  const hasRemoteFeedback = Boolean(audioFeedbackState.feedbackInfo);
  const hasPreview = Boolean(audioFeedbackState.previewBlob);
  const isRecording = isAudioFeedbackRecording();
  const isBusy = audioFeedbackState.isLoading || audioFeedbackState.isSaving || audioFeedbackState.isDeleting;
  const canRecord = supportsAudioFeedbackRecording();

  if (audioFeedbackElements.loadingState) {
    audioFeedbackElements.loadingState.classList.toggle('d-none', !audioFeedbackState.isLoading);
  }

  if (audioFeedbackElements.existingSection) {
    audioFeedbackElements.existingSection.classList.toggle('d-none', audioFeedbackState.isLoading || !hasRemoteFeedback);
  }

  if (audioFeedbackElements.emptySection) {
    audioFeedbackElements.emptySection.classList.toggle('d-none', audioFeedbackState.isLoading || hasRemoteFeedback);
  }
  if (audioFeedbackElements.emptyAlert) {
    audioFeedbackElements.emptyAlert.classList.toggle('d-none', hasRemoteFeedback || hasPreview || isRecording);
  }

  if (hasRemoteFeedback) {
    if (audioFeedbackElements.fileName) {
      audioFeedbackElements.fileName.textContent =
        audioFeedbackState.feedbackInfo?.original_name || t('audio_feedback_modal_title', 'Audio feedback');
    }
    if (audioFeedbackElements.existingDuration) {
      const durationValue = audioFeedbackState.feedbackInfo?.duration;
      audioFeedbackElements.existingDuration.textContent =
        durationValue != null ? formatDuration(durationValue) : '-';
    }
    if (audioFeedbackElements.deleteBtn) {
      audioFeedbackElements.deleteBtn.disabled = isBusy;
    }
    if (audioFeedbackElements.existingPlayer) {
      audioFeedbackElements.existingPlayer.classList.toggle('d-none', !audioFeedbackState.remoteObjectUrl);
    }
  }

  if (audioFeedbackElements.unsupportedAlert) {
    audioFeedbackElements.unsupportedAlert.classList.toggle('d-none', hasRemoteFeedback || canRecord);
  }
  if (audioFeedbackElements.recordIdleSection) {
    audioFeedbackElements.recordIdleSection.classList.toggle(
      'd-none',
      hasRemoteFeedback || !canRecord || hasPreview || isRecording
    );
  }
  if (audioFeedbackElements.recordingSection) {
    audioFeedbackElements.recordingSection.classList.toggle('d-none', hasRemoteFeedback || !isRecording);
  }
  if (audioFeedbackElements.previewSection) {
    audioFeedbackElements.previewSection.classList.toggle('d-none', hasRemoteFeedback || !hasPreview);
  }

  if (audioFeedbackElements.startBtn) {
    audioFeedbackElements.startBtn.disabled = isBusy || !canRecord;
  }
  if (audioFeedbackElements.stopBtn) {
    audioFeedbackElements.stopBtn.disabled = isBusy || !isRecording;
  }
  if (audioFeedbackElements.discardBtn) {
    audioFeedbackElements.discardBtn.disabled = isBusy || !hasPreview;
  }
  if (audioFeedbackElements.saveBtn) {
    audioFeedbackElements.saveBtn.disabled = isBusy || !hasPreview;
  }
  if (audioFeedbackElements.previewDuration) {
    audioFeedbackElements.previewDuration.textContent =
      hasPreview && audioFeedbackState.previewDuration != null
        ? formatDuration(audioFeedbackState.previewDuration)
        : '-';
  }
  if (audioFeedbackElements.recorderStatus) {
    let statusText = t(
      'audio_feedback_record_hint',
      'Use your microphone to record feedback for this participant.'
    );

    if (!canRecord) {
      statusText = t(
        'audio_feedback_recording_not_supported',
        'This browser cannot record audio.'
      );
    } else if (hasPreview) {
      statusText = t(
        'audio_feedback_preview_hint',
        'Review the recording before sending it.'
      );
    } else if (isRecording) {
      statusText = t(
        'audio_feedback_recording_in_progress',
        'Recording in progress.'
      );
    }

    audioFeedbackElements.recorderStatus.textContent = statusText;
  }
}

async function readAudioDuration(blob) {
  if (!(blob instanceof Blob)) return null;

  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const objectUrl = URL.createObjectURL(blob);
    audio.preload = 'metadata';
    audio.src = objectUrl;
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(duration) ? duration : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
  });
}

function abortAudioFeedbackRecording() {
  stopAudioFeedbackTimer();

  if (audioFeedbackState.mediaRecorder) {
    audioFeedbackState.mediaRecorder.ondataavailable = null;
    audioFeedbackState.mediaRecorder.onstop = null;
    audioFeedbackState.mediaRecorder.onerror = null;
    if (audioFeedbackState.mediaRecorder.state !== 'inactive') {
      try {
        audioFeedbackState.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
  }

  audioFeedbackState.mediaRecorder = null;
  audioFeedbackState.recordingChunks = [];
  audioFeedbackState.recordingStartedAt = 0;
  stopAudioFeedbackStream();
  updateAudioFeedbackRecordingTimer(0);
}

async function finalizeAudioFeedbackRecording() {
  const mimeType = audioFeedbackState.mediaRecorder?.mimeType || audioFeedbackState.recordingChunks[0]?.type || 'audio/webm';
  const elapsedSeconds = audioFeedbackState.recordingStartedAt
    ? Math.max(1, Math.round((Date.now() - audioFeedbackState.recordingStartedAt) / 1000))
    : null;
  const chunks = audioFeedbackState.recordingChunks.slice();

  stopAudioFeedbackTimer();
  stopAudioFeedbackStream();
  audioFeedbackState.mediaRecorder = null;
  audioFeedbackState.recordingChunks = [];
  audioFeedbackState.recordingStartedAt = 0;
  updateAudioFeedbackRecordingTimer(0);

  if (!chunks.length) {
    updateAudioFeedbackUi();
    return;
  }

  const blob = new Blob(chunks, { type: mimeType });
  const detectedDuration = await readAudioDuration(blob);

  clearAudioFeedbackPreview();
  audioFeedbackState.previewBlob = blob;
  audioFeedbackState.previewDuration = detectedDuration ?? elapsedSeconds;
  audioFeedbackState.previewObjectUrl = URL.createObjectURL(blob);

  if (audioFeedbackElements.previewPlayer) {
    audioFeedbackElements.previewPlayer.src = audioFeedbackState.previewObjectUrl;
    audioFeedbackElements.previewPlayer.load();
  }

  updateAudioFeedbackUi();
}

async function startAudioFeedbackRecording() {
  if (!supportsAudioFeedbackRecording()) {
    setAudioFeedbackError(
      t('audio_feedback_recording_not_supported', 'This browser cannot record audio.')
    );
    updateAudioFeedbackUi();
    return;
  }

  setAudioFeedbackError('');
  clearAudioFeedbackPreview();

  if (!window.isSecureContext) {
    setAudioFeedbackError(
      t(
        'audio_feedback_secure_context_error',
        'El microfono solo se puede usar desde HTTPS o desde localhost.'
      )
    );
    updateAudioFeedbackUi();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredMimeType = getPreferredAudioFeedbackMimeType();
    const recorder = preferredMimeType
      ? new MediaRecorder(stream, { mimeType: preferredMimeType })
      : new MediaRecorder(stream);

    audioFeedbackState.mediaStream = stream;
    audioFeedbackState.mediaRecorder = recorder;
    audioFeedbackState.recordingChunks = [];
    audioFeedbackState.recordingStartedAt = Date.now();
    updateAudioFeedbackRecordingTimer(0);

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioFeedbackState.recordingChunks.push(event.data);
      }
    };
    recorder.onerror = () => {
      setAudioFeedbackError(
        t(
          'audio_feedback_device_busy_error',
          'El microfono esta siendo usado por otra aplicacion o no se puede leer en este momento.'
        )
      );
      abortAudioFeedbackRecording();
      updateAudioFeedbackUi();
    };
    recorder.onstop = async () => {
      await finalizeAudioFeedbackRecording();
    };

    stopAudioFeedbackTimer();
    audioFeedbackState.recordingTimerId = window.setInterval(() => {
      if (!audioFeedbackState.recordingStartedAt) return;
      const elapsedSeconds = Math.max(0, Math.round((Date.now() - audioFeedbackState.recordingStartedAt) / 1000));
      updateAudioFeedbackRecordingTimer(elapsedSeconds);
    }, 250);

    recorder.start();
    updateAudioFeedbackUi();
  } catch (error) {
    console.error('Error starting audio feedback recording', error);
    abortAudioFeedbackRecording();
    setAudioFeedbackError(resolveAudioFeedbackRecordingError(error));
    updateAudioFeedbackUi();
  }
}

function stopAudioFeedbackRecording() {
  if (!isAudioFeedbackRecording()) return;
  if (audioFeedbackElements.stopBtn) {
    audioFeedbackElements.stopBtn.disabled = true;
  }
  audioFeedbackState.mediaRecorder.stop();
}

function resetAudioFeedbackModalState() {
  audioFeedbackState.loadRequestId += 1;
  audioFeedbackState.context = null;
  audioFeedbackState.feedbackInfo = null;
  audioFeedbackState.isLoading = false;
  audioFeedbackState.isSaving = false;
  audioFeedbackState.isDeleting = false;

  abortAudioFeedbackRecording();
  clearAudioFeedbackRemoteAudio();
  clearAudioFeedbackPreview();
  setAudioFeedbackError('');

  if (audioFeedbackElements.participantName) {
    audioFeedbackElements.participantName.textContent = '-';
  }
  if (audioFeedbackElements.competitionName) {
    audioFeedbackElements.competitionName.textContent = '';
  }
  if (audioFeedbackElements.fileName) {
    audioFeedbackElements.fileName.textContent = '-';
  }
  if (audioFeedbackElements.existingDuration) {
    audioFeedbackElements.existingDuration.textContent = '-';
  }
  if (audioFeedbackElements.previewDuration) {
    audioFeedbackElements.previewDuration.textContent = '-';
  }

  updateAudioFeedbackUi();
}

async function loadAudioFeedbackRemoteAudio(requestId) {
  const context = audioFeedbackState.context;
  if (!context?.competitionId || !context?.dancerId) return;

  const response = await fetch(getAudioFeedbackDownloadUrl(context.competitionId, context.dancerId));
  if (!response.ok) {
    const errData = await safeJson(response);
    throw new Error(errData?.error || t('audio_feedback_download_error', 'Error loading audio playback.'));
  }

  const blob = await response.blob();
  if (requestId !== audioFeedbackState.loadRequestId) return;

  clearAudioFeedbackRemoteAudio();
  audioFeedbackState.remoteObjectUrl = URL.createObjectURL(blob);

  if (audioFeedbackElements.existingPlayer) {
    audioFeedbackElements.existingPlayer.src = audioFeedbackState.remoteObjectUrl;
    audioFeedbackElements.existingPlayer.load();
  }

  const headerFilename = getFilenameFromHeader(response.headers.get('content-disposition'));
  if (!audioFeedbackState.feedbackInfo?.original_name && headerFilename) {
    audioFeedbackState.feedbackInfo.original_name = headerFilename;
  }

  if (audioFeedbackState.feedbackInfo?.duration == null) {
    const detectedDuration = await readAudioDuration(blob);
    if (requestId === audioFeedbackState.loadRequestId && audioFeedbackState.feedbackInfo) {
      audioFeedbackState.feedbackInfo.duration = detectedDuration;
    }
  }
}

async function loadAudioFeedback() {
  const context = audioFeedbackState.context;
  if (!context?.competitionId || !context?.dancerId) return;

  const requestId = audioFeedbackState.loadRequestId + 1;
  audioFeedbackState.loadRequestId = requestId;
  audioFeedbackState.isLoading = true;
  audioFeedbackState.feedbackInfo = null;
  clearAudioFeedbackRemoteAudio();
  clearAudioFeedbackPreview();
  setAudioFeedbackError('');
  updateAudioFeedbackUi();

  try {
    const response = await fetch(getAudioFeedbackUrl(context.competitionId, context.dancerId));
    if (!response.ok) {
      if (response.status === 404) {
        return;
      }
      const errData = await safeJson(response);
      throw new Error(errData?.error || t('audio_feedback_load_error', 'Error loading audio feedback.'));
    }

    const payload = await safeJson(response);
    if (requestId !== audioFeedbackState.loadRequestId) return;

    if (!payload || (!payload.original_name && !payload.audio_url && !payload.id)) {
      return;
    }

    audioFeedbackState.feedbackInfo = payload;
    await loadAudioFeedbackRemoteAudio(requestId);
  } catch (error) {
    console.error('Error loading audio feedback', error);
    if (requestId !== audioFeedbackState.loadRequestId) return;
    audioFeedbackState.feedbackInfo = null;
    setAudioFeedbackError(
      error?.message || t('audio_feedback_load_error', 'Error loading audio feedback.')
    );
  } finally {
    if (requestId === audioFeedbackState.loadRequestId) {
      audioFeedbackState.isLoading = false;
      updateAudioFeedbackUi();
    }
  }
}

async function uploadAudioFeedback() {
  const context = audioFeedbackState.context;
  if (!context?.competitionId || !context?.dancerId || !audioFeedbackState.previewBlob) return;

  audioFeedbackState.isSaving = true;
  setAudioFeedbackError('');
  setButtonLoading(
    audioFeedbackElements.saveBtn,
    true,
    t('sending', 'Sending')
  );
  updateAudioFeedbackUi();

  try {
    const formData = new FormData();
    formData.append(
      'audio',
      audioFeedbackState.previewBlob,
      buildAudioFeedbackFilename(audioFeedbackState.previewBlob.type)
    );
    if (audioFeedbackState.previewDuration != null) {
      formData.append('duration', `${Math.max(1, Math.round(audioFeedbackState.previewDuration))}`);
    }

    const response = await fetch(getAudioFeedbackUrl(context.competitionId, context.dancerId), {
      method: 'POST',
      body: formData
    });
    const payload = await safeJson(response);

    if (!response.ok) {
      throw new Error(payload?.error || t('audio_feedback_save_error', 'Error sending audio feedback.'));
    }

    clearAudioFeedbackPreview();
    await loadCompetitionAndDancers();
    await loadAudioFeedback();
  } catch (error) {
    console.error('Error uploading audio feedback', error);
    setAudioFeedbackError(
      error?.message || t('audio_feedback_save_error', 'Error sending audio feedback.')
    );
  } finally {
    audioFeedbackState.isSaving = false;
    setButtonLoading(audioFeedbackElements.saveBtn, false);
    updateAudioFeedbackUi();
  }
}

async function deleteAudioFeedback() {
  const context = audioFeedbackState.context;
  if (!context?.competitionId || !context?.dancerId || !audioFeedbackState.feedbackInfo) return;

  const confirmed = window.confirm(
    t('audio_feedback_delete_confirm', 'Are you sure you want to delete this audio feedback?')
  );
  if (!confirmed) return;

  audioFeedbackState.isDeleting = true;
  setAudioFeedbackError('');
  setButtonLoading(
    audioFeedbackElements.deleteBtn,
    true,
    t('loading', 'Loading...')
  );
  updateAudioFeedbackUi();

  try {
    const response = await fetch(getAudioFeedbackUrl(context.competitionId, context.dancerId), {
      method: 'DELETE'
    });
    const payload = await safeJson(response);

    if (!response.ok) {
      throw new Error(payload?.error || t('audio_feedback_delete_error', 'Error deleting audio feedback.'));
    }

    audioFeedbackState.feedbackInfo = null;
    clearAudioFeedbackRemoteAudio();
    await loadCompetitionAndDancers();
  } catch (error) {
    console.error('Error deleting audio feedback', error);
    setAudioFeedbackError(
      error?.message || t('audio_feedback_delete_error', 'Error deleting audio feedback.')
    );
  } finally {
    audioFeedbackState.isDeleting = false;
    setButtonLoading(audioFeedbackElements.deleteBtn, false);
    updateAudioFeedbackUi();
  }
}

function initAudioFeedbackModal() {
  const modalEl = document.getElementById('audioFeedbackModal');
  if (!modalEl) return;

  audioFeedbackElements.modal = modalEl;
  audioFeedbackElements.participantName = document.getElementById('audioFeedbackParticipantName');
  audioFeedbackElements.competitionName = document.getElementById('audioFeedbackCompetitionName');
  audioFeedbackElements.loadingState = document.getElementById('audioFeedbackLoadingState');
  audioFeedbackElements.errorAlert = document.getElementById('audioFeedbackErrorAlert');
  audioFeedbackElements.existingSection = document.getElementById('audioFeedbackExistingSection');
  audioFeedbackElements.fileName = document.getElementById('audioFeedbackFileName');
  audioFeedbackElements.existingDuration = document.getElementById('audioFeedbackExistingDuration');
  audioFeedbackElements.existingPlayer = document.getElementById('audioFeedbackExistingPlayer');
  audioFeedbackElements.deleteBtn = document.getElementById('deleteAudioFeedbackBtn');
  audioFeedbackElements.emptySection = document.getElementById('audioFeedbackEmptySection');
  audioFeedbackElements.emptyAlert = document.getElementById('audioFeedbackEmptyAlert');
  audioFeedbackElements.unsupportedAlert = document.getElementById('audioFeedbackUnsupportedAlert');
  audioFeedbackElements.recordIdleSection = document.getElementById('audioFeedbackRecordIdleSection');
  audioFeedbackElements.startBtn = document.getElementById('startAudioFeedbackBtn');
  audioFeedbackElements.recordingSection = document.getElementById('audioFeedbackRecordingSection');
  audioFeedbackElements.recordingTimer = document.getElementById('audioFeedbackRecordingTimer');
  audioFeedbackElements.stopBtn = document.getElementById('stopAudioFeedbackBtn');
  audioFeedbackElements.previewSection = document.getElementById('audioFeedbackPreviewSection');
  audioFeedbackElements.previewPlayer = document.getElementById('audioFeedbackPreviewPlayer');
  audioFeedbackElements.previewDuration = document.getElementById('audioFeedbackPreviewDuration');
  audioFeedbackElements.discardBtn = document.getElementById('discardAudioFeedbackBtn');
  audioFeedbackElements.saveBtn = document.getElementById('saveAudioFeedbackBtn');
  audioFeedbackElements.recorderStatus = document.getElementById('audioFeedbackRecorderStatus');

  audioFeedbackModal = new bootstrap.Modal(modalEl);

  modalEl.addEventListener('hidden.bs.modal', () => {
    resetAudioFeedbackModalState();
  });

  audioFeedbackElements.startBtn?.addEventListener('click', async () => {
    await startAudioFeedbackRecording();
  });
  audioFeedbackElements.stopBtn?.addEventListener('click', () => {
    stopAudioFeedbackRecording();
  });
  audioFeedbackElements.discardBtn?.addEventListener('click', () => {
    clearAudioFeedbackPreview();
    updateAudioFeedbackUi();
  });
  audioFeedbackElements.saveBtn?.addEventListener('click', async () => {
    await uploadAudioFeedback();
  });
  audioFeedbackElements.deleteBtn?.addEventListener('click', async () => {
    await deleteAudioFeedback();
  });

  updateAudioFeedbackUi();
}

async function openAudioFeedbackModal(context) {
  if (!audioFeedbackModal) return;

  resetAudioFeedbackModalState();
  audioFeedbackState.context = {
    competitionId: context?.competitionId ?? null,
    dancerId: context?.dancerId ?? null,
    dancerName: context?.dancerName || t('col_dancer', 'Dancer'),
    competitionLabel: context?.competitionLabel || ''
  };

  if (audioFeedbackElements.participantName) {
    audioFeedbackElements.participantName.textContent = audioFeedbackState.context.dancerName;
  }
  if (audioFeedbackElements.competitionName) {
    audioFeedbackElements.competitionName.textContent = audioFeedbackState.context.competitionLabel;
  }

  audioFeedbackState.isLoading = true;
  updateAudioFeedbackUi();
  audioFeedbackModal.show();
  await loadAudioFeedback();
}

async function loadCompetitionAndDancers() {
  const selectedCompetitionId = getSelectedCompetitionId();
  updateCompetitionNavigationButtons(selectedCompetitionId);
  if (!selectedCompetitionId) return;

  const selectedCompetition = availableCompetitions
    .find(comp => String(comp?.id) === String(selectedCompetitionId));
  const category = selectedCompetition?.category_id;
  const style = selectedCompetition?.style_id;
  if (!category || !style) return;

  const data = await fetchVoting(category, style);
  syncCompetitionStatusInDropdown(selectedCompetitionId, data?.competition?.status);
  const loadedCriteria = Array.isArray(data.criteria) ? data.criteria : [];
  criteriaList = loadedCriteria
    .slice()
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  syncCriteriaToggleButtonState();
  renderCompetitionInfo(data.competition);

  // Si data.competition.judge_reserve es true, mostrar texto indicando que es juez reserva
  const judgeReserveInfo = document.getElementById('judgeReserveInfo');
  if (data.competition.judge_reserve) {
    judgeReserveInfo.style.display = 'block';
  } else {
    judgeReserveInfo.style.display = 'none';
  }


  renderDancersTable(data.dancers, data.competition.status, parseJudgeFlag(data?.competition?.judge_head));

  competitionInfo.style.display = 'block';
  dancersTableContainer.style.display = 'block';
}

function showVotesModal(dancer, mode = "details") {
  const scoreType = getScoreType();
  const normalizedScoreType = (scoreType || 'INT').toUpperCase();
  const scoreStep = scoreType === 'DEC' ? '0.1' : scoreType === 'MED' ? '0.5' : '1';
  const inputMode = scoreType === 'INT' ? 'numeric' : 'decimal';
  const useMobileLayout = mode !== "vote" || isMobileViewport() || normalizedScoreType === 'DEC';
  const minScore = DEFAULT_MIN_SCORE;
  const maxScore = DEFAULT_MAX_SCORE;
  document.getElementById('detailsModalLabel').textContent =
    mode === "details" ? `${t('votes_for')} ${dancer.name}` : `${t('vote_for')} ${dancer.name}`;

  const dialog = modal._element.querySelector('.modal-dialog');
  dialog.classList.remove('modal-lg', 'modal-xl', 'modal-dialog-scrollable');
  if (!useMobileLayout && mode === "vote") {
    dialog.classList.add('modal-xl', 'modal-dialog-scrollable');
  }

  criteriaContainer.className = useMobileLayout ? 'row g-3 text-center' : 'd-flex flex-column gap-3';
  criteriaContainer.innerHTML = '';

  const getCriteriaInput = (criteriaId) =>
    criteriaContainer.querySelector(`.score-input[data-criteria="${criteriaId}"]`);

  const parseCriteriaPercentage = (criteria) => {
    const rawPercentage = criteria?.percentage;
    if (rawPercentage === undefined || rawPercentage === null || rawPercentage === '') {
      return null;
    }
    const percentageNumber = Number(rawPercentage);
    if (Number.isNaN(percentageNumber)) return null;
    return percentageNumber;
  };

  const hasCriteriaPercentages = () =>
    criteriaList.some(c => parseCriteriaPercentage(c) !== null);

  const formatCriteriaLabel = (criteria) => {
    const percentageNumber = parseCriteriaPercentage(criteria);
    if (percentageNumber === null) return criteria.name;
    return `${criteria.name} (${percentageNumber}%)`;
  };

  const formatTotalScore = (value) => {
    if (value === null || value === undefined) return '';
    if (hasCriteriaPercentages()) {
      return Number.isFinite(value) ? value.toFixed(1) : '';
    }
    return formatScoreForDisplay(value, scoreType);
  };

  const calculateTotalScore = (getScore) => {
    const hasWeights = hasCriteriaPercentages();
    let total = 0;
    let weightSum = 0;

    criteriaList.forEach(c => {
      const score = getScore(c);
      if (score === null || score === undefined) return;

      const percentage = parseCriteriaPercentage(c);
      if (hasWeights && percentage !== null) {
        total += score * percentage;
        weightSum += percentage;
      } else if (!hasWeights) {
        total += score;
      }
    });

    if (hasWeights) {
      if (weightSum <= 0) return 0;
      // redondeamos de 8.1 a 8.4, hacia abajo, y de 8.5 a 8.9 hacia arriba
      total = Math.round((total / weightSum) * 10) / 10;
      return total;
    }

    return total;
  };

  function refreshTotalScore() {
    const total = calculateTotalScore((criteria) => {
      const input = getCriteriaInput(criteria.id);
      if (!input) return null;
      const normalized = normalizeScoreValue(
        input.value,
        scoreType,
        minScore,
        maxScore,
        { clamp: false }
      );
      return normalized;
    });
    const totalEl = document.getElementById('totalScore');
    if (totalEl) {
      totalEl.textContent = formatTotalScore(total) || '0';
    }
  }

  function renderTotal(initialTotal = 0) {
    const totalCol = document.createElement('div');
    if (useMobileLayout) {
      totalCol.className = 'col-12 mt-3 text-center';
      totalCol.innerHTML = `
        <div class="fw-bold mb-1">Total</div>
        <span id="totalScore" class="badge bg-success fs-4 px-4">${formatTotalScore(initialTotal) || '0'}</span>
      `;
    } else {
      totalCol.className = 'border-top pt-3 text-center';
      totalCol.innerHTML = `
        <div class="fw-bold mb-1">Total</div>
        <span id="totalScore" class="badge bg-success fs-4 px-4">${formatTotalScore(initialTotal) || '0'}</span>
      `;
    }
    criteriaContainer.appendChild(totalCol);
  }

  if (useMobileLayout) {
    criteriaList.forEach(c => {
      const value = dancer.scores?.[c.name] ?? '-';
      const criteriaLabel = formatCriteriaLabel(c);
      const col = document.createElement('div');
      col.className = 'col-6 text-center';

      if (mode === "details") {
        // Solo lectura
        const formattedValue = typeof value === 'number' ? formatScoreForDisplay(value, scoreType) : value;
        col.innerHTML = `
        <div class="mb-1 fw-semibold">${criteriaLabel}</div>
        <span class="badge bg-info fs-5">${formattedValue}</span>
      `;
      } else {
        // Modo edicion
        const currentVal = typeof value === 'number' ? formatScoreForDisplay(value, scoreType) : '';
        col.innerHTML = `
        <div class="mb-1 fw-semibold">${criteriaLabel}</div>
        <input type="number" inputmode="${inputMode}" class="form-control form-control-lg score-input"
               data-criteria="${c.id}" data-score-type="${scoreType}" step="${scoreStep}" value="${currentVal}">
      `;
      }

      criteriaContainer.appendChild(col);

    });

    const total = calculateTotalScore((criteria) => {
      const rawValue = dancer.scores?.[criteria.name];
      return typeof rawValue === 'number' ? rawValue : rawValue == null ? null : Number(rawValue);
    });
    //renderTotal(total);
    renderTotal(dancer.totalScore);
  } else {
    const options = generateScoreOptions(scoreType, minScore, maxScore);

    criteriaList.forEach(c => {
      const value = dancer.scores?.[c.name];
      const row = document.createElement('div');
      row.className = 'row align-items-center';

      const labelCol = document.createElement('div');
      labelCol.className = 'col-12 col-md-3 mb-2 mb-md-0 fw-semibold text-md-end';
      labelCol.textContent = formatCriteriaLabel(c);
      row.appendChild(labelCol);

      const controlCol = document.createElement('div');
      controlCol.className = 'col-12 col-md-9';
      const currentVal = typeof value === 'number' ? formatScoreForDisplay(value, scoreType) : '';

      const useButtons = options.length <= 12 || normalizedScoreType === 'MED';
      if (useButtons) {
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.className = 'score-input';
        hiddenInput.dataset.criteria = c.id;
        hiddenInput.dataset.scoreType = scoreType;
        hiddenInput.dataset.min = minScore;
        hiddenInput.dataset.max = maxScore;
        if (currentVal) hiddenInput.value = currentVal;

        const btnGroup = document.createElement('div');
        btnGroup.className = 'd-flex flex-wrap w-100 gap-2';

        options.forEach(opt => {
          const btnId = `criteria-${c.id}-${String(opt).replace('.', '-')}`;
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.className = 'btn-check';
          radio.name = `criteria-${c.id}`;
          radio.id = btnId;
          radio.value = formatScoreForDisplay(opt, scoreType);

          const label = document.createElement('label');
          const isHalfStep = normalizedScoreType === 'MED' && !Number.isInteger(opt);
          const sizeClass = normalizedScoreType === 'INT' ? 'btn-lg' : 'btn-sm';
          const colorClass = isHalfStep ? 'btn-outline-warning' : 'btn-outline-primary';
          label.className = `btn ${colorClass} ${sizeClass} flex-fill`;
          label.setAttribute('for', btnId);
          label.textContent = formatScoreForDisplay(opt, scoreType);

          if (currentVal && radio.value === currentVal) {
            radio.checked = true;
            hiddenInput.value = currentVal;
          }

          radio.addEventListener('change', () => {
            hiddenInput.value = radio.value;
            refreshTotalScore();
          });

          btnGroup.appendChild(radio);
          btnGroup.appendChild(label);
        });

        controlCol.appendChild(hiddenInput);
        controlCol.appendChild(btnGroup);
      } else {
        const select = document.createElement('select');
        select.className = 'form-select score-input';
        select.dataset.criteria = c.id;
        select.dataset.scoreType = scoreType;
        select.dataset.min = minScore;
        select.dataset.max = maxScore;

        const placeholder = t('select_score', t('select', '--'));
        select.innerHTML = `<option value="">${placeholder}</option>`;
        options.forEach(opt => {
          const optEl = document.createElement('option');
          const formatted = formatScoreForDisplay(opt, scoreType);
          optEl.value = formatted;
          optEl.textContent = formatted;
          select.appendChild(optEl);
        });

        if (currentVal) select.value = currentVal;
        select.addEventListener('change', refreshTotalScore);
        controlCol.appendChild(select);
      }

      row.appendChild(controlCol);
      criteriaContainer.appendChild(row);
    });

    renderTotal(0);
  }

  // Footer - limpiar primero
  const footer = modal._element.querySelector('.modal-footer');
  footer.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">${t('close')}</button>`;

  if (mode === "vote") {

    const collectScores = () => {
      const scores = [];
      let allFilled = true;
      const outOfRange = [];

      criteriaList.forEach(c => {
        const input = getCriteriaInput(c.id);
        if (!input) return;
        const normalizedScore = normalizeScoreValue(
          input.value,
          scoreType,
          minScore,
          maxScore,
          { clamp: false }
        );

        if (normalizedScore === null) {
          allFilled = false;
        } else if (!isScoreInRange(normalizedScore, minScore, maxScore)) {
          outOfRange.push(c.name);
        } else {
          if (input.tagName === 'INPUT' && input.type === 'number') {
            input.value = formatScoreForDisplay(normalizedScore, scoreType);
          } else if (input.tagName === 'SELECT') {
            input.value = formatScoreForDisplay(normalizedScore, scoreType);
          } else {
            input.value = normalizedScore.toString();
          }
          scores.push({
            criteria_id: Number(c.id),
            score: normalizedScore
          });
        }
      });

      return { scores, allFilled, outOfRange };
    };

    const setVoteAlert = (message) => {
      let alertDiv = document.getElementById("voteErrorAlert");
      if (!alertDiv) {
        alertDiv = document.createElement("div");
        alertDiv.id = "voteErrorAlert";
        alertDiv.className = "alert alert-danger alert-dismissible fade show mt-3";
        alertDiv.role = "alert";
        criteriaContainer.appendChild(alertDiv);
      }
      alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      `;
    };

    const sendBtn = document.createElement('button');
    sendBtn.className = "btn btn-primary btn-sm";
    sendBtn.textContent = t('send_votes');
  
    const noShowBtn = document.createElement('button');
    noShowBtn.className = "btn btn-warning btn-sm me-auto d-none"; // Por ahora lo ocultamos
    noShowBtn.textContent = t('no_show');
  
    // --- funcion auxiliar para enviar votos ---
    async function sendVotes(scores) {
      try {
        setVoteButtonsDisabled(true);
        const originalContent = sendBtn.innerHTML;
        sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${t('sending')}`;    
        sendBtn.disabled = true;
        noShowBtn.disabled = true;
  
        const response = await fetch(`${API_BASE_URL}/api/voting`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: getEvent().id,
            competition_id: dancer.competition_id,
            judge_id: getUserId(),
            dancer_id: dancer.id,
            scores: scores
          })
        });
  
        if (!response.ok) {
          const errData = await response.json();
          showMessageModal(errData.error || 'Error sending votes', 'Error');
          setVoteButtonsDisabled(false);
          sendBtn.disabled = false;
          noShowBtn.disabled = false;
          sendBtn.innerHTML = originalContent;
          return;
        }
  
        await loadCompetitionAndDancers();
        modal.hide();
  
      } catch (err) {
        console.error("Error sending votes", err);
        alert("Error sending votes");
        sendBtn.innerHTML = originalContent;
      }
    }
  
    // --- modal de confirmacion (solo se crea si no existe aun) ---
    if (!document.getElementById("outlierConfirmModal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="outlierConfirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${t('confirm', 'Confirm')}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <p id="outlierConfirmMessage">${t('confirm_outlier_scores')}</p>
                <p id="outlierConfirmList" class="mb-0 fw-semibold"></p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${t('cancel')}</button>
                <button type="button" class="btn btn-primary" id="confirmOutlierBtn">${t('confirm')}</button>
              </div>
            </div>
          </div>
        </div>
      `);
    }

    const outlierModal = new bootstrap.Modal(document.getElementById("outlierConfirmModal"));
    const confirmOutlierBtn = document.getElementById("confirmOutlierBtn");
    const outlierMessageEl = document.getElementById("outlierConfirmMessage");
    const outlierListEl = document.getElementById("outlierConfirmList");

    // --- boton normal: enviar votos manuales ---
    sendBtn.addEventListener('click', async () => {
      const { scores, allFilled, outOfRange } = collectScores();
  
      if (!allFilled) {
        setVoteAlert(t('alert_criteria'));
        return;
      }

      if (outOfRange.length > 0) {
        const message = t(
          'alert_criteria_range',
          `Las puntuaciones deben estar entre ${minScore} y ${maxScore}.`
        );
        setVoteAlert(message);
        return;
      }
  
      const existingAlert = document.getElementById("voteErrorAlert");
      if (existingAlert) existingAlert.remove();

      // Analizamos si algun valor esta lejos de la media (por ejemplo, si la media es 8 y se pone un 2)
      const scoreValues = scores.map(s => s.score);
      const avg = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
      const threshold = 3; // umbral de desviacion
      const outliers = scores.filter(s => Math.abs(s.score - avg) >= threshold);

      if (outliers.length > 0) {
        let outlierNames = outliers.map(o => {
          const crit = criteriaList.find(c => c.id === o.criteria_id);
          return crit ? crit.name : 'Unknown';
        }).join(', ');

        if (outlierMessageEl) {
          outlierMessageEl.textContent = t('confirm_outlier_scores');
        }
        if (outlierListEl) {
          outlierListEl.textContent = outlierNames;
        }
        confirmOutlierBtn.onclick = async () => {
          outlierModal.hide();
          await sendVotes(scores);
        };
        outlierModal.show();
        return;
      }
  
      await sendVotes(scores);
    });
  
    // --- modal de confirmacion (solo se crea si no existe aun) ---
    if (!document.getElementById("noShowConfirmModal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="noShowConfirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${t('confirm_no_show_title')}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <p>${t('confirm_no_show_text')}</p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${t('cancel')}</button>
                <button type="button" class="btn btn-danger" id="confirmNoShowBtn">${t('confirm')}</button>
              </div>
            </div>
          </div>
        </div>
      `);
    }
  
    const noShowModal = new bootstrap.Modal(document.getElementById("noShowConfirmModal"));
    const confirmNoShowBtn = document.getElementById("confirmNoShowBtn");
  
    // --- boton no show ---
    noShowBtn.addEventListener('click', () => {
      // abrir modal de confirmacion
      noShowModal.show();
  
      // asignar listener temporal para este bailarin
      confirmNoShowBtn.onclick = async () => {
        noShowModal.hide();
  
        const scores = criteriaList.map(c => ({
          criteria_id: c.id,
          score: 0
        }));
  
        await sendVotes(scores);
      };
    });
  
    // Anadir botones al footer
    footer.prepend(noShowBtn);  // a la izquierda
    footer.appendChild(sendBtn); // los actuales permanecen a la derecha
  
    // --- recalcular total al cambiar inputs ---
    criteriaContainer.querySelectorAll('input[type="number"].score-input').forEach(input => {
      input.addEventListener('input', refreshTotalScore);

      input.addEventListener('blur', () => {
        const normalized = normalizeScoreValue(
          input.value,
          scoreType,
          minScore,
          maxScore,
          { clamp: false }
        );
        if (normalized !== null) {
          input.value = formatScoreForDisplay(normalized, scoreType);
        }
        refreshTotalScore();
      });
    });

    refreshTotalScore();
  }  


  modal.show();
}
function setVoteButtonsDisabled(disabled) {
  document.querySelectorAll('button.btn-primary').forEach(btn => {
    if (btn.textContent.trim() === t('vote')) {
      btn.disabled = disabled;
    }
  });
}


async function fetchVoting(category, style) {
  try {
    const userId = getUserId();
    const res = await fetch(`${API_BASE_URL}/api/voting?event_id=${getEvent().id}&judge=${userId}&category=${category}&style=${style}`);
    return await res.json();
  } catch (err) {
    console.error('Error loading dancers', err);
    return { dancers: [] };
  }
}

function renderDancersTable(dancers, compStatus, isJudgeHead = false) {
  renderDancersTableHeader();
  dancersTableBody.innerHTML = ''; // limpiar
  syncCriteriaToggleButtonState();

  const canShowPenaltiesButton = getEvent()?.status !== 'finished' && Boolean(isJudgeHead);
  const selectedCompetitionId = getSelectedCompetitionId();
  const selectedCompetition = availableCompetitions
    .find(comp => String(comp?.id) === String(selectedCompetitionId));
  const competitionLabel = `${selectedCompetition?.category_name || '-'} - ${selectedCompetition?.style_name || '-'}`;

  dancers.forEach(d => {
    const tr = document.createElement('tr');

    // Columna Dancer (bandera + nombre + orden)
    const tdDancer = document.createElement('td');
    tdDancer.innerHTML = `
      <div class="d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center">
          ${getDancerFlagImgHtml(d.nationality, { className: 'me-2', style: 'vertical-align: middle;' })}
          <span>${d.name}</span>
        </div>
        <span class="badge bg-info">#${d.position}</span>
      </div>
    `;
    tr.appendChild(tdDancer);

    // Columna Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'text-center';
    tdStatus.innerHTML = `
      <span class="badge 
        ${d.status === 'Pending'
          ? 'bg-warning'
          : d.status === 'Incompatible'
            ? 'bg-danger'
            : d.status === 'Max Judges Voted'
              ? 'bg-danger'
              : d.status === 'Disqualified'
                ? 'bg-danger'
                  : d.status === 'No Show'
                    ? 'bg-noshown'
                    : d.status === 'Not Applicable'
                      ? 'bg-secondary'
                      : 'bg-success'}">
        ${d.status}
      </span>
    `;
    tr.appendChild(tdStatus);

    // Columna Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'text-center';
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'd-flex justify-content-center gap-2 flex-wrap';
    let hasPrimaryAction = false;

    if (d.status === 'Completed') {
      const btnDetails = document.createElement('button');
      btnDetails.className = 'btn btn-sm btn-secondary';
      btnDetails.textContent = t('details');
      btnDetails.addEventListener('click', () => showVotesModal(d, "details"));
      actionsWrap.appendChild(btnDetails);
      hasPrimaryAction = true;
    } else if (d.status === 'Pending' && (compStatus === 'OPE' || compStatus === 'PRO') && d.can_vote) {
      const btnVote = document.createElement('button');
      btnVote.className = 'btn btn-sm btn-primary';
      btnVote.textContent = t('vote');
      btnVote.addEventListener('click', () => showVotesModal(d, "vote"));
      actionsWrap.appendChild(btnVote);
      hasPrimaryAction = true;
    }

    if (hasPrimaryAction && canShowPenaltiesButton) {
      const penaltiesCount = Number(d?.num_penalties) || 0;
      const btnPenalties = document.createElement('button');
      btnPenalties.className = 'btn btn-sm btn-outline-warning';
      btnPenalties.textContent = `${t('penalties', 'Penalties')} (${penaltiesCount})`;
      btnPenalties.addEventListener('click', async () => {
        await openPenaltyAssignmentModal({
          competitionId: d?.competition_id ?? selectedCompetition?.id ?? selectedCompetitionId,
          dancerId: d?.id,
          dancerName: d?.name || t('dancer', 'Dancer'),
          competitionLabel,
          assignedBy: 'J'
        });
      });
      actionsWrap.appendChild(btnPenalties);
    }

    if (hasPrimaryAction) {
      tdActions.appendChild(actionsWrap);
    }

    tr.appendChild(tdActions);

    // Columna Feedback (ultima)
    const tdComments = document.createElement('td');
    tdComments.className = 'text-center';

    const hasComments = typeof d.comments === 'string' && d.comments.trim().length > 0;
    const hasAudioFeedback = parseJudgeFlag(d?.has_feedback);
    if (d.status === 'Completed') {
      const feedbackActions = document.createElement('div');
      feedbackActions.className = 'feedback-actions';

      const btnComments = document.createElement('button');
      btnComments.type = 'button';
      btnComments.className = `btn btn-sm btn-feedback-icon ${hasComments ? 'btn-comments' : 'btn-outline-comments'}`;
      btnComments.dataset.role = 'comments-btn';
      btnComments.dataset.hasComments = hasComments ? 'true' : 'false';
      btnComments.addEventListener('click', () => {
        if (!commentsModal) return;
        commentsContext = { competitionId: d.competition_id, dancerId: d.id };
        commentsTextarea.value = d.comments || '';
        commentsModal.show();
      });
      feedbackActions.appendChild(btnComments);

      if (getEvent()?.hasJudgeFeedback) {
        const btnAudioFeedback = document.createElement('button');
        btnAudioFeedback.type = 'button';
        btnAudioFeedback.className = `btn btn-sm btn-feedback-icon ${hasAudioFeedback ? 'btn-audio-feedback' : 'btn-outline-audio-feedback'}`;
        btnAudioFeedback.dataset.role = 'audio-feedback-btn';
        btnAudioFeedback.dataset.hasFeedback = hasAudioFeedback ? 'true' : 'false';
        btnAudioFeedback.addEventListener('click', async () => {
          await openAudioFeedbackModal({
            competitionId: d?.competition_id ?? selectedCompetition?.id ?? selectedCompetitionId,
            dancerId: d?.id,
            dancerName: d?.name || t('col_dancer', 'Dancer'),
            competitionLabel
          });
        });
        feedbackActions.appendChild(btnAudioFeedback);
      }

      tdComments.appendChild(feedbackActions);
    } else {
      tdComments.textContent = '-';
    }

    tr.appendChild(tdComments);

    const scoreType = getScoreType();

    criteriaList.forEach(c => {
      const tdCriteria = document.createElement('td');
      tdCriteria.className = 'text-center small criteria-col';
      tdCriteria.dataset.criteriaId = c.id;

      const rawScore = d?.scores?.[c.name];
      const scoreNumber = typeof rawScore === 'number' ? rawScore : rawScore == null ? null : Number(rawScore);
      tdCriteria.textContent =
        scoreNumber === null || Number.isNaN(scoreNumber)
          ? '-'
          : (formatScoreForDisplay(scoreNumber, scoreType) || '-');

      tr.appendChild(tdCriteria);
    });

    const tdTotal = document.createElement('td');
    tdTotal.className = 'text-center fw-semibold criteria-col';
    const totalNumber = typeof d.totalScore === 'number' ? d.totalScore : d.totalScore == null ? null : Number(d.totalScore);
    tdTotal.textContent =
      totalNumber === null || Number.isNaN(totalNumber)
        ? '-'
        : (formatScoreForDisplay(totalNumber, scoreType) || '-');
    tr.appendChild(tdTotal);

    dancersTableBody.appendChild(tr);
  });

  setCriteriaColumnsVisibility(criteriaColumnsVisible, { persist: false });
}

function renderDancersTableHeader() {
  const headRow = document.getElementById('dancersTableHeadRow');
  if (!headRow) return;

  const th = (text, className = '') => {
    const el = document.createElement('th');
    el.scope = 'col';
    if (className) el.className = className;
    el.textContent = text;
    return el;
  };

  headRow.innerHTML = '';
  headRow.appendChild(th(t('col_dancer', 'Dancer')));

  headRow.appendChild(th(t('col_status', 'Status'), 'text-center'));
  headRow.appendChild(th(t('col_action', 'Action'), 'text-center'));
  {
    const el = th(t('feedback', 'Feedback'), 'text-center');
    el.dataset.col = 'comments';
    headRow.appendChild(el);
  }

  criteriaList.forEach(c => {
    const el = document.createElement('th');
    el.scope = 'col';
    el.className = 'text-center small criteria-col';
    el.dataset.criteriaId = c.id;

    const label = document.createElement('span');
    label.className = 'criteria-header-text';
    label.title = c.name;
    label.textContent = c.name;
    el.appendChild(label);
    headRow.appendChild(el);
  });

  {
    const el = document.createElement('th');
    el.scope = 'col';
    el.className = 'text-center criteria-col';
    const label = document.createElement('span');
    label.className = 'criteria-header-text';
    label.title = t('total', 'Total');
    label.textContent = t('total', 'Total');
    el.appendChild(label);
    headRow.appendChild(el);
  }
}


function getUserId() {
  const token = getToken();
  const payload = parseJwt(token);
  const userId = payload?.id || null;

  return userId;
}

function formatCompetitionEstimatedStart(competition) {
  if (!competition) return t('not_defined', 'NOT DEFINED');

  const rawValue = competition.estimated_start_form ?? competition.estimated_start;
  if (!rawValue) {
    return t('not_defined', 'NOT DEFINED');
  }

  const value = String(rawValue).trim();

  // Preserve backend hour/minute exactly, without timezone conversion.
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (isoMatch) {
    const [, year, month, day, hour, minute] = isoMatch;
    return `${day}/${month}/${year} ${hour}:${minute}`;
  }

  return value;
}

function getCompetitionStatusText(status) {
  if (status === 'OPE') return 'OPEN';
  if (status === 'PRO') return 'IN PROGRESS';
  if (status === 'CLO') return 'CLOSED';
  if (status === 'FIN') return 'FINISHED';
  return status || '-';
}

function getCompetitionStatusBadgeClass(status) {
  if (status === 'OPE') return 'bg-warning text-dark';
  if (status === 'PRO') return 'bg-primary';
  if (status === 'CLO') return 'bg-danger';
  if (status === 'FIN') return 'bg-success';
  return 'bg-secondary';
}

function splitCompetitionDateAndTime(competition) {
  const estimatedStartText = formatCompetitionEstimatedStart(competition);
  const match = estimatedStartText.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})$/);
  if (match) {
    return {
      day: match[1],
      hour: match[2]
    };
  }
  return {
    day: estimatedStartText,
    hour: ''
  };
}

function buildCompetitionSelectOptionData(competition) {
  const { day, hour } = splitCompetitionDateAndTime(competition);
  const statusText = getCompetitionStatusText(competition?.status);
  return {
    value: String(competition?.id ?? ''),
    id: String(competition?.id ?? ''),
    category: competition?.category_name || '-',
    style: competition?.style_name || '-',
    statusText,
    statusClass: getCompetitionStatusBadgeClass(competition?.status),
    day,
    hour,
    text: `${competition?.category_name || '-'} / ${competition?.style_name || '-'} (${day}${hour ? ` ${hour}` : ''} - ${statusText})`
  };
}

function getCompetitionOptionRenderData(item) {
  const hasRenderableData = Boolean(item?.category || item?.style || item?.statusText || item?.day || item?.hour);
  if (hasRenderableData) return item || {};

  const candidateId = item?.value ?? item?.id;
  if (!candidateId) return item || {};

  const competition = availableCompetitions.find(comp => String(comp?.id) === String(candidateId));
  if (!competition) return item || {};

  const fallback = buildCompetitionSelectOptionData(competition);
  return {
    ...item,
    ...fallback
  };
}

function initCompetitionTomSelect() {
  if (!competitionSelect || typeof TomSelect !== 'function') return;

  if (competitionTomSelect) {
    competitionTomSelect.destroy();
    competitionTomSelect = null;
  }

  competitionTomSelect = new TomSelect(competitionSelect, {
    dataAttr: 'data-data',
    valueField: 'value',
    labelField: 'text',
    searchField: ['category', 'style', 'statusText', 'day', 'hour'],
    maxOptions: 200,
    allowEmptyOption: false,
    create: false,
    placeholder: t('select_competition', 'Select a competition'),
    render: {
      option: function (item, escape) {
        const optionData = getCompetitionOptionRenderData(item);
        return `
          <div class="competition-option-wrap">
            <div class="competition-option-badges">
              <span class="badge bg-secondary">${escape(optionData.category || '-')}</span>
              <span class="badge bg-secondary">${escape(optionData.style || '-')}</span>
              <span class="badge ${escape(optionData.statusClass || 'bg-secondary')}">${escape(optionData.statusText || '-')}</span>
            </div>
            <div class="competition-option-meta">
              <i class="bi bi-calendar-event"></i>${escape(optionData.day || '-')}
              ${optionData.hour ? ` <span class="ms-2"><i class="bi bi-clock"></i>${escape(optionData.hour)}</span>` : ''}
            </div>
          </div>
        `;
      },
      item: function (item, escape) {
        const optionData = getCompetitionOptionRenderData(item);
        return `
          <div class="competition-option-badges">
            <span class="badge bg-secondary">${escape(optionData.category || '-')}</span>
            <span class="badge bg-secondary">${escape(optionData.style || '-')}</span>
            <span class="badge ${escape(optionData.statusClass || 'bg-secondary')}">${escape(optionData.statusText || '-')}</span>
          </div>
        `;
      }
    }
  });

  if (competitionSelect.disabled) {
    competitionTomSelect.disable();
  } else {
    competitionTomSelect.enable();
  }
}

function setCompetitionSelectValue(value, { silent = true } = {}) {
  if (!competitionSelect) return;

  const normalized = value === undefined || value === null ? '' : String(value);

  if (competitionTomSelect) {
    if (!normalized) {
      competitionTomSelect.clear(silent);
      return;
    }
    competitionTomSelect.setValue(normalized, silent);
    return;
  }

  competitionSelect.value = normalized;
}

function getSelectedCompetitionIndex(selectedCompetitionId = getSelectedCompetitionId()) {
  if (!selectedCompetitionId) return -1;
  return availableCompetitions.findIndex(comp => String(comp?.id) === String(selectedCompetitionId));
}

function formatCompetitionNavigationMeta(competition) {
  if (!competition) return '';
  return `${competition?.category_name || '-'} - ${competition?.style_name || '-'}`;
}

function updateCompetitionNavigationButton(button, labelKey, fallbackLabel, targetCompetition) {
  if (!button) return;

  const labelEl = button.querySelector('.competition-nav-label');
  const metaEl = button.querySelector('.competition-nav-meta');
  const label = t(labelKey, fallbackLabel);
  const hasTargetCompetition = Boolean(targetCompetition);

  button.disabled = !hasTargetCompetition;
  button.dataset.competitionId = hasTargetCompetition ? String(targetCompetition.id) : '';

  if (labelEl) {
    labelEl.textContent = label;
  } else {
    button.textContent = label;
  }

  if (metaEl) {
    metaEl.textContent = hasTargetCompetition ? formatCompetitionNavigationMeta(targetCompetition) : '';
    metaEl.classList.toggle('d-none', !hasTargetCompetition);
  }
}

function updateCompetitionNavigationButtons(selectedCompetitionId = getSelectedCompetitionId()) {
  const currentIndex = getSelectedCompetitionIndex(selectedCompetitionId);
  const previousCompetition = currentIndex > 0 ? availableCompetitions[currentIndex - 1] : null;
  const nextCompetition = currentIndex >= 0 && currentIndex < availableCompetitions.length - 1
    ? availableCompetitions[currentIndex + 1]
    : null;

  updateCompetitionNavigationButton(previousCompetitionBtn, 'previous_competition', 'Previous Competition', previousCompetition);
  updateCompetitionNavigationButton(nextCompetitionBtn, 'next_competition', 'Next Competition', nextCompetition);
}

function navigateCompetition(offset) {
  const currentIndex = getSelectedCompetitionIndex();
  if (currentIndex < 0) return;

  const targetCompetition = availableCompetitions[currentIndex + offset];
  if (!targetCompetition) return;

  setCompetitionSelectValue(String(targetCompetition.id), { silent: true });
  competitionSelect.dispatchEvent(new Event('change'));
}

function getSelectedCompetitionId() {
  if (competitionTomSelect) {
    const value = competitionTomSelect.getValue();
    return value ? String(value) : '';
  }

  return competitionSelect?.value ? String(competitionSelect.value) : '';
}

async function loadCompetitionsForJudge() {
  try {
    const judgeId = getUserId();
    const res = await fetch(`${API_BASE_URL}/api/voting/competitions?event_id=${getEvent().id}&judge_id=${judgeId}`);
    if (!res.ok) {
      throw new Error('Error loading competitions');
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error loading competitions', err);
    return [];
  }
}

async function reloadCompetitionsAndSelectFirstOpen() {
  availableCompetitions = await loadCompetitionsForJudge();
  populateCompetitionSelect(availableCompetitions, competitionSelect);

  const firstOpenCompetition = availableCompetitions.find(
    comp => comp?.status === 'OPE' || comp?.status === 'PRO'
  );
  if (firstOpenCompetition) {
    setCompetitionSelectValue(String(firstOpenCompetition.id), { silent: true });
    refreshBtn.disabled = false;
    competitionSelect.dispatchEvent(new Event('change'));
  } else {
    setCompetitionSelectValue('', { silent: true });
    refreshBtn.disabled = true;
  }

  updateCompetitionNavigationButtons();
}

function populateCompetitionSelect(competitions, selectElement) {
  if (!selectElement) return;

  const previousValue = String(selectElement.value || '');
  selectElement.innerHTML = '<option selected disabled value="" data-i18n="select_competition">Select a competition</option>';
  competitions.forEach(item => {
    const option = document.createElement('option');
    const optionData = buildCompetitionSelectOptionData(item);
    option.value = optionData.value;
    option.textContent = optionData.text;
    option.setAttribute('data-data', JSON.stringify(optionData));
    selectElement.appendChild(option);
  });

  selectElement.disabled = competitions.length === 0;
  const canRestorePrevious = previousValue && competitions.some(item => String(item?.id) === previousValue);
  selectElement.value = canRestorePrevious ? previousValue : '';

  initCompetitionTomSelect();
  applyTranslations();
}

function syncCompetitionStatusInDropdown(competitionId, fetchedStatus) {
  const normalizedId = competitionId === undefined || competitionId === null ? '' : String(competitionId);
  const normalizedStatus = String(fetchedStatus || '').trim();
  if (!normalizedId || !normalizedStatus) return;

  const competitionIndex = availableCompetitions.findIndex(comp => String(comp?.id) === normalizedId);
  if (competitionIndex < 0) return;

  const currentStatus = String(availableCompetitions[competitionIndex]?.status || '').trim();
  if (currentStatus === normalizedStatus) return;

  availableCompetitions[competitionIndex] = {
    ...availableCompetitions[competitionIndex],
    status: normalizedStatus
  };

  const updatedOptionData = buildCompetitionSelectOptionData(availableCompetitions[competitionIndex]);

  if (competitionTomSelect) {
    competitionTomSelect.updateOption(normalizedId, updatedOptionData);
    competitionTomSelect.refreshItems();
    return;
  }

  if (!competitionSelect) return;
  const option = Array.from(competitionSelect.options)
    .find(item => String(item?.value || '') === normalizedId);
  if (!option) return;

  option.textContent = updatedOptionData.text;
  option.setAttribute('data-data', JSON.stringify(updatedOptionData));
}

function getScoreType() {
  const eventData = typeof getEvent === 'function' ? getEvent() : null;
  const type = eventData?.score_type;
  return type ? type.toUpperCase() : 'INT';
}

function normalizeScoreValue(rawValue, scoreType, min = 1, max = 10, { clamp = true } = {}) {
  if (rawValue === undefined || rawValue === null) return null;
  const normalizedType = (scoreType || 'INT').toUpperCase();
  const stringValue = String(rawValue).replace(',', '.').trim();
  if (stringValue === '') return null;
  const numericValue = Number(stringValue);
  if (Number.isNaN(numericValue)) return null;

  let value = numericValue;
  if (clamp) {
    if (typeof min === 'number') value = Math.max(value, min);
    if (typeof max === 'number') value = Math.min(value, max);
  }

  switch (normalizedType) {
    case 'DEC':
      return Number((Math.round(value * 10) / 10).toFixed(1));
    case 'MED':
      return Number((Math.round(value * 2) / 2).toFixed(1));
    default:
      return Math.round(value);
  }
}

function isScoreInRange(value, min = 1, max = 10) {
  if (typeof value !== 'number' || Number.isNaN(value)) return false;
  if (typeof min === 'number' && value < min) return false;
  if (typeof max === 'number' && value > max) return false;
  return true;
}

function formatScoreForDisplay(value, scoreType) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  
  const eventData = typeof getEvent === 'function' ? getEvent() : null;
  const criteriaConfig = eventData?.criteriaConfig;
  const isWeighted = criteriaConfig === 'WITH_POR';
  const normalizedType = (isWeighted ? 'DEC' : (scoreType || 'INT')).toUpperCase();

  switch (normalizedType) {
    case 'DEC':
      return (Math.round(value * 10) / 10).toFixed(1);
    case 'MED': {
      const normalized = Math.round(value * 2) / 2;
      return Number.isInteger(normalized) ? normalized.toString() : normalized.toFixed(1);
    }
    default:
      return Math.round(value).toString();
  }
}

function renderCompetitionInfo(competition) {
  if (!competition) return;

  const categoryEl = document.getElementById('compCategory');
  const styleEl = document.getElementById('compStyle');
  const statusEl = document.getElementById('compStatus');
  const timeEl = document.getElementById('compTime');
  const progressWrapEl = document.querySelector('#competitionInfo .progress');
  const progressBarEl = document.getElementById('compProgressBar');
  const progressTextEl = document.getElementById('compProgressText');

  if (categoryEl) {
    categoryEl.textContent = competition.category_name || '-';
  }

  if (styleEl) {
    styleEl.textContent = competition.style_name || '-';
  }

  const statusText = getCompetitionStatusText(competition.status);
  const statusClass = getCompetitionStatusBadgeClass(competition.status);
  if (statusEl) {
    statusEl.classList.remove('bg-warning', 'bg-danger', 'bg-success', 'bg-secondary', 'text-dark');
    statusClass.split(' ').forEach(cls => statusEl.classList.add(cls));
    statusEl.textContent = statusText;
  }

  if (timeEl) {
    const { day, hour } = splitCompetitionDateAndTime(competition);
    timeEl.innerHTML = `
      <i class="bi bi-calendar-event me-1"></i>${day || t('not_defined', 'NOT DEFINED')}
      ${hour ? `<span class="ms-3"><i class="bi bi-clock me-1"></i>${hour}</span>` : ''}
    `;
  }

  const totalDancers = Number(competition?.num_dancers) || 0;
  const pendingDancersRaw = Number(competition?.dancersPending);
  const pendingDancers = Number.isFinite(pendingDancersRaw)
    ? Math.max(0, Math.min(totalDancers, pendingDancersRaw))
    : 0;
  const completedDancers = Math.max(0, totalDancers - pendingDancers);
  const progressPercentage = totalDancers > 0
    ? Math.round((completedDancers / totalDancers) * 100)
    : 0;
  const progressText = `${completedDancers}/${totalDancers} (${progressPercentage}%)`;
  const isCompleted = progressPercentage >= 100;

  if (progressWrapEl) {
    progressWrapEl.setAttribute('aria-valuenow', String(progressPercentage));
  }

  if (progressBarEl) {
    progressBarEl.style.width = `${progressPercentage}%`;
    progressBarEl.classList.remove('bg-success', 'bg-warning');
    progressBarEl.classList.add(isCompleted ? 'bg-success' : 'bg-warning');
  }

  if (progressTextEl) {
    progressTextEl.textContent = progressText;
    progressTextEl.classList.remove('text-white', 'text-dark');
    progressTextEl.classList.add(isCompleted ? 'text-white' : 'text-dark');
  }

  updateHeadJudgeIndicator(parseJudgeFlag(competition?.judge_head));
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseJudgeFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function updateHeadJudgeIndicator(isHeadJudge) {
  const indicatorEl = document.getElementById('headJudgeIndicator');
  if (!indicatorEl) return;

  const tooltipText = t(
    'judge_head_penalties_tooltip',
    'You are the head judge: you can apply penalties in this competition.'
  );
  indicatorEl.setAttribute('title', tooltipText);
  indicatorEl.setAttribute('aria-label', tooltipText);

  if (!isHeadJudge) {
    indicatorEl.classList.add('d-none');
    if (headJudgeTooltip) {
      headJudgeTooltip.dispose();
      headJudgeTooltip = null;
    }
    return;
  }

  indicatorEl.classList.remove('d-none');
  if (headJudgeTooltip) {
    headJudgeTooltip.dispose();
    headJudgeTooltip = null;
  }
  if (window.bootstrap?.Tooltip) {
    headJudgeTooltip = new bootstrap.Tooltip(indicatorEl);
  }
}

function setButtonLoading(button, isLoading, loadingText = t('loading', 'Loading...')) {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${escapeHtml(loadingText)}</span>
    `;
    button.disabled = true;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
  button.disabled = false;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function extractArrayPayload(payload, candidateKeys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of candidateKeys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function normalizePenaltyDefinition(rawPenalty) {
  const id = parseOptionalNumber(rawPenalty?.id ?? rawPenalty?.penalty_id);
  if (id === null) return null;

  let minPenalty = parseOptionalNumber(rawPenalty?.min_penalty);
  let maxPenalty = parseOptionalNumber(rawPenalty?.max_penalty);

  if (minPenalty === null && maxPenalty !== null) minPenalty = maxPenalty;
  if (maxPenalty === null && minPenalty !== null) maxPenalty = minPenalty;
  if (minPenalty === null && maxPenalty === null) {
    minPenalty = 0;
    maxPenalty = 0;
  }

  const safeMin = Math.min(minPenalty, maxPenalty);
  const safeMax = Math.max(minPenalty, maxPenalty);
  const name = String(rawPenalty?.name || '').trim() || `${t('penalty', 'Penalty')} #${id}`;

  return {
    id,
    name,
    forJudges: parseJudgeFlag(rawPenalty?.for_judges),
    minPenalty: safeMin,
    maxPenalty: safeMax,
    isFixedScore: safeMin === safeMax
  };
}

function normalizeCompetitionPenalty(rawPenalty) {
  const penaltyId = parseOptionalNumber(rawPenalty?.penalty_id ?? rawPenalty?.id);
  if (penaltyId === null) return null;
  const rawAssignedBy = String(rawPenalty?.assigned_by || '').trim().toUpperCase();
  const assignedBy = (rawAssignedBy === 'O' || rawAssignedBy === 'J') ? rawAssignedBy : null;

  return {
    penaltyId,
    score: parseOptionalNumber(rawPenalty?.penalty_score),
    assignedBy
  };
}

async function fetchPenaltyDefinitionsForEvent(eventId) {
  const response = await fetch(`${API_BASE_URL}/api/penalties?event_id=${eventId}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || t('penalty_modal_load_error', 'Error loading penalties.'));
  }

  const penaltyItems = extractArrayPayload(payload, ['penalties']);
  const uniqueById = new Map();

  penaltyItems.forEach((item) => {
    const normalized = normalizePenaltyDefinition(item);
    if (!normalized) return;
    uniqueById.set(String(normalized.id), normalized);
  });

  return Array.from(uniqueById.values())
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
}

async function fetchCompetitionPenaltiesForDancer(eventId, competitionId, dancerId) {
  const url = `${API_BASE_URL}/api/competitions/penalties?event_id=${eventId}&competition_id=${competitionId}&dancer_id=${dancerId}`;
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(payload?.error || t('penalty_modal_load_error', 'Error loading penalties.'));
  }

  const competitionPenaltyItems = extractArrayPayload(payload, ['competition_penalties', 'penalties']);
  const uniqueByPenaltyId = new Map();

  competitionPenaltyItems.forEach((item) => {
    const normalized = normalizeCompetitionPenalty(item);
    if (!normalized) return;
    uniqueByPenaltyId.set(String(normalized.penaltyId), normalized);
  });

  return Array.from(uniqueByPenaltyId.values());
}

function renderPenaltyAssignmentLoadingState() {
  return `
    <div class="d-flex align-items-center justify-content-center py-4">
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${escapeHtml(t('loading', 'Loading...'))}</span>
    </div>
  `;
}

function setPenaltyAssignmentSaveDisabled(disabled) {
  const saveBtn = document.getElementById('penaltyAssignmentSaveBtn');
  if (!saveBtn) return;
  saveBtn.disabled = Boolean(disabled);
}

function clearPenaltyAssignmentValidationMessage() {
  const validationEl = document.getElementById('penaltyAssignmentValidation');
  if (!validationEl) return;
  validationEl.textContent = '';
  validationEl.classList.add('d-none');
}

function setPenaltyAssignmentValidationMessage(message) {
  const validationEl = document.getElementById('penaltyAssignmentValidation');
  if (!validationEl) return;
  validationEl.textContent = message || '';
  validationEl.classList.toggle('d-none', !message);
}

function syncPenaltyAssignmentSelectionSummary() {
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  const summaryEl = document.getElementById('penaltyAssignmentSummary');
  if (!bodyEl || !summaryEl) return;

  const rows = Array.from(bodyEl.querySelectorAll('.js-penalty-row'));
  const selectedCount = rows.filter((rowEl) => {
    if (rowEl.dataset.editable !== '1') return false;
    const toggleEl = rowEl.querySelector('.js-penalty-toggle');
    return Boolean(toggleEl?.checked);
  }).length;

  summaryEl.textContent = `${selectedCount} ${t('penalty_modal_selected_count', 'penalties applied')}`;
}

function syncPenaltyAssignmentRow(rowEl) {
  if (!rowEl) return;

  const toggleEl = rowEl.querySelector('.js-penalty-toggle');
  const scoreInput = rowEl.querySelector('.js-penalty-score');
  const feedbackEl = rowEl.querySelector('.js-penalty-score-feedback');
  if (!toggleEl || !scoreInput) return;

  const isChecked = toggleEl.checked;
  const isEditable = rowEl.dataset.editable === '1';
  const isFixedScore = rowEl.dataset.fixedScore === '1';
  const minPenalty = parseOptionalNumber(rowEl.dataset.minPenalty);

  scoreInput.classList.remove('is-invalid');
  if (feedbackEl) {
    feedbackEl.textContent = '';
  }

  if (!isEditable) {
    toggleEl.disabled = true;
    scoreInput.disabled = true;
    scoreInput.readOnly = true;
    return;
  }

  toggleEl.disabled = false;
  scoreInput.readOnly = false;

  if (!isChecked) {
    scoreInput.disabled = true;
    scoreInput.value = '';
    return;
  }

  if (isFixedScore) {
    scoreInput.disabled = true;
    scoreInput.value = minPenalty !== null ? String(minPenalty) : '';
    return;
  }

  scoreInput.disabled = false;
  if (scoreInput.value === '' && minPenalty !== null) {
    scoreInput.value = String(minPenalty);
  }
}

function collectPenaltyAssignmentsFromModal() {
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  if (!bodyEl) {
    return { isValid: false, assignments: [] };
  }

  const rows = Array.from(bodyEl.querySelectorAll('.js-penalty-row'));
  const assignments = [];
  let isValid = true;

  rows.forEach((rowEl) => {
    if (rowEl.dataset.editable !== '1') return;

    const toggleEl = rowEl.querySelector('.js-penalty-toggle');
    const scoreInput = rowEl.querySelector('.js-penalty-score');
    const feedbackEl = rowEl.querySelector('.js-penalty-score-feedback');
    if (!toggleEl || !scoreInput) return;

    scoreInput.classList.remove('is-invalid');
    if (feedbackEl) feedbackEl.textContent = '';

    if (!toggleEl.checked) return;

    const penaltyId = parseOptionalNumber(rowEl.dataset.penaltyId);
    const isFixedScore = rowEl.dataset.fixedScore === '1';
    const minPenalty = parseOptionalNumber(rowEl.dataset.minPenalty);
    const maxPenalty = parseOptionalNumber(rowEl.dataset.maxPenalty);

    if (penaltyId === null) {
      isValid = false;
      return;
    }

    let score = minPenalty;
    if (!isFixedScore) {
      score = parseOptionalNumber(scoreInput.value);
      if (score === null) {
        isValid = false;
        scoreInput.classList.add('is-invalid');
        if (feedbackEl) {
          feedbackEl.textContent = t('penalty_modal_score_required', 'Score is required.');
        }
        return;
      }
      if (
        (minPenalty !== null && score < minPenalty) ||
        (maxPenalty !== null && score > maxPenalty)
      ) {
        isValid = false;
        scoreInput.classList.add('is-invalid');
        if (feedbackEl) {
          feedbackEl.textContent = t('penalty_modal_score_out_of_range', 'Score must be within range.');
        }
        return;
      }
    }

    assignments.push({
      penalty_id: penaltyId,
      penalty_score: score
    });
  });

  return { isValid, assignments };
}

async function saveCompetitionPenalties({ eventId, competitionId, dancerId, assignedBy = 'J', penalties = [] } = {}) {
  const normalizedAssignedBy = String(assignedBy).trim().toUpperCase() === 'O' ? 'O' : 'J';
  const response = await fetch(`${API_BASE_URL}/api/competitions/penalties`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: Number(eventId),
      competition_id: Number(competitionId),
      dancer_id: Number(dancerId),
      assigned_by: normalizedAssignedBy,
      penalties
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error
      || payload?.message
      || t('penalty_modal_save_error', 'Error saving penalties.')
    );
  }

  return payload;
}

function renderPenaltyAssignmentModalContent() {
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  if (!bodyEl) return;

  const context = penaltyAssignmentState.context || {};
  const penalties = Array.isArray(penaltyAssignmentState.penalties) ? penaltyAssignmentState.penalties : [];
  const competitionPenalties = Array.isArray(penaltyAssignmentState.competitionPenalties)
    ? penaltyAssignmentState.competitionPenalties
    : [];

  if (!penalties.length) {
    bodyEl.innerHTML = `
      <div class="alert alert-info mb-0">
        ${escapeHtml(t('penalty_modal_no_penalties', 'No penalties available.'))}
      </div>
    `;
    setPenaltyAssignmentSaveDisabled(true);
    return;
  }

  const selectedByPenaltyId = new Map();
  competitionPenalties.forEach((item) => {
    if (item?.penaltyId === null || item?.penaltyId === undefined) return;
    selectedByPenaltyId.set(String(item.penaltyId), item);
  });

  const rowsHtml = penalties.map((penalty, index) => {
    const selectedPenalty = selectedByPenaltyId.get(String(penalty.id)) || null;
    const isSelected = Boolean(selectedPenalty);
    const assignedBy = selectedPenalty?.assignedBy || null;
    const isEditable = Boolean(
      penalty.forJudges
      && (!isSelected || assignedBy === 'J')
    );
    const scoreValue = isSelected
      ? (penalty.isFixedScore ? penalty.minPenalty : (selectedPenalty?.score ?? ''))
      : '';
    const rangeText = penalty.isFixedScore
      ? String(penalty.minPenalty)
      : `${penalty.minPenalty} - ${penalty.maxPenalty}`;
    const fixedBadge = penalty.isFixedScore
      ? `<span class="badge text-bg-warning text-dark penalty-fixed-badge">${escapeHtml(t('penalty_modal_fixed_score', 'Fixed'))}</span>`
      : '';
    const assignedByBadge = assignedBy === 'O'
      ? `<span class="badge bg-primary">${escapeHtml(t('penalty_modal_assigned_by_org', 'ORGANIZATION'))}</span>`
      : assignedBy === 'J'
        ? `<span class="badge bg-dark">${escapeHtml(t('penalty_modal_assigned_by_jury', 'JURY'))}</span>`
        : '<span class="text-muted">-</span>';
    const forJudgesIcon = penalty.forJudges
      ? '<i class="bi bi-check-circle-fill text-success"></i>'
      : '<i class="bi bi-dash-circle text-muted"></i>';
    const inputId = `penaltyScore_${penalty.id}_${index}`;

    return `
      <tr
        class="js-penalty-row ${isEditable ? '' : 'table-light'}"
        data-penalty-id="${penalty.id}"
        data-min-penalty="${penalty.minPenalty}"
        data-max-penalty="${penalty.maxPenalty}"
        data-fixed-score="${penalty.isFixedScore ? '1' : '0'}"
        data-editable="${isEditable ? '1' : '0'}"
      >
        <td class="text-center align-middle">
          <input
            class="form-check-input js-penalty-toggle"
            type="checkbox"
            ${isSelected ? 'checked' : ''}
            ${isEditable ? '' : 'disabled'}
          >
        </td>
        <td class="align-middle penalty-col-name">
          <div class="fw-semibold">${escapeHtml(penalty.name)}</div>
        </td>
        <td class="text-center align-middle penalty-col-assigned-by">
          ${assignedByBadge}
        </td>
        <td class="text-center align-middle penalty-col-for-judges" title="${escapeHtml(t('penalty_modal_for_judges', 'For judges'))}">
          ${forJudgesIcon}
        </td>
        <td class="text-center align-middle penalty-col-range">
          <div class="d-inline-flex align-items-center justify-content-center gap-1 flex-wrap">
            <span class="badge text-bg-light border">${escapeHtml(rangeText)}</span>
            ${fixedBadge}
          </div>
        </td>
        <td class="align-middle penalty-col-score">
          <input
            id="${inputId}"
            type="number"
            class="form-control form-control-sm js-penalty-score"
            min="${penalty.minPenalty}"
            max="${penalty.maxPenalty}"
            step="1"
            value="${escapeHtml(scoreValue)}"
            ${(isSelected && !penalty.isFixedScore && isEditable) ? '' : 'disabled'}
          >
          <div class="invalid-feedback js-penalty-score-feedback"></div>
        </td>
      </tr>
    `;
  }).join('');

  const dancerName = context?.dancerName || t('dancer', 'Dancer');
  const competitionLabel = String(context?.competitionLabel || '').trim();

  bodyEl.innerHTML = `
    <div class="mb-3 penalty-assignment-header">
      <div class="penalty-assignment-participant fw-semibold">${escapeHtml(dancerName)}</div>
      ${competitionLabel
    ? `<span class="badge text-bg-light border penalty-assignment-competition-badge">${escapeHtml(competitionLabel)}</span>`
    : ''}
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-bordered align-middle mb-2 penalty-assignment-table">
        <thead class="table-light">
          <tr>
            <th class="text-center penalty-col-apply">${escapeHtml(t('penalty_modal_apply', 'Apply'))}</th>
            <th class="penalty-col-name">${escapeHtml(t('penalty_modal_name', 'Penalty'))}</th>
            <th class="text-center penalty-col-assigned-by">${escapeHtml(t('penalty_modal_assigned_by', 'Assigned by'))}</th>
            <th class="text-center penalty-col-for-judges">${escapeHtml(t('penalty_modal_for_judges', 'For judges'))}</th>
            <th class="text-center penalty-col-range">${escapeHtml(t('penalty_modal_range', 'Range'))}</th>
            <th class="penalty-col-score">${escapeHtml(t('penalty_modal_score', 'Score'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
    <div id="penaltyAssignmentValidation" class="alert alert-warning py-2 mb-2 d-none"></div>
    <small class="text-muted" id="penaltyAssignmentSummary"></small>
  `;

  Array.from(bodyEl.querySelectorAll('.js-penalty-row')).forEach(syncPenaltyAssignmentRow);
  syncPenaltyAssignmentSelectionSummary();
  clearPenaltyAssignmentValidationMessage();
  setPenaltyAssignmentSaveDisabled(false);
}

function initPenaltyAssignmentModal() {
  const modalEl = document.getElementById('penaltyAssignmentModal');
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  const saveBtn = document.getElementById('penaltyAssignmentSaveBtn');
  if (!modalEl || !bodyEl || !saveBtn) return;
  if (modalEl.dataset.initialized === '1') return;

  bodyEl.addEventListener('change', (event) => {
    const toggleEl = event.target.closest('.js-penalty-toggle');
    if (!toggleEl) return;
    const rowEl = toggleEl.closest('.js-penalty-row');
    if (rowEl?.dataset.editable !== '1') return;
    syncPenaltyAssignmentRow(rowEl);
    syncPenaltyAssignmentSelectionSummary();
    clearPenaltyAssignmentValidationMessage();
  });

  bodyEl.addEventListener('input', (event) => {
    const scoreInput = event.target.closest('.js-penalty-score');
    if (!scoreInput) return;
    const rowEl = scoreInput.closest('.js-penalty-row');
    if (rowEl?.dataset.editable !== '1') return;
    scoreInput.classList.remove('is-invalid');
    const feedbackEl = rowEl?.querySelector('.js-penalty-score-feedback');
    if (feedbackEl) {
      feedbackEl.textContent = '';
    }
    clearPenaltyAssignmentValidationMessage();
  });

  saveBtn.addEventListener('click', async () => {
    const { isValid, assignments } = collectPenaltyAssignmentsFromModal();
    if (!isValid) {
      setPenaltyAssignmentValidationMessage(
        t('penalty_modal_validation_error', 'Review penalty scores before continuing.')
      );
      return;
    }

    const context = penaltyAssignmentState.context || {};
    const eventId = parseOptionalNumber(context?.eventId);
    const competitionId = parseOptionalNumber(context?.competitionId);
    const dancerId = parseOptionalNumber(context?.dancerId);
    const assignedBy = 'J';

    if (eventId === null || competitionId === null || dancerId === null) {
      showMessageModal(t('error_title', 'Error'), t('error_title', 'Error'));
      return;
    }

    clearPenaltyAssignmentValidationMessage();
    setButtonLoading(saveBtn, true, t('loading', 'Loading...'));

    try {
      const result = await saveCompetitionPenalties({
        eventId,
        competitionId,
        dancerId,
        assignedBy,
        penalties: assignments
      });

      penaltyAssignmentState.competitionPenalties = assignments.map(item => ({
        penaltyId: item.penalty_id,
        score: item.penalty_score,
        assignedBy
      }));

      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.hide();
      await loadCompetitionAndDancers();

      const fallbackMessage = result?.changed
        ? t('penalty_modal_saved', 'Penalties saved successfully.')
        : t('penalty_modal_no_changes', 'No penalty changes detected.');
      showMessageModal(result?.message || fallbackMessage, t('penalty', 'Penalty'), 'success');
    } catch (error) {
      console.error('Error saving competition penalties:', error);
      showMessageModal(
        error?.message || t('penalty_modal_save_error', 'Error saving penalties.'),
        t('error_title', 'Error')
      );
    } finally {
      setButtonLoading(saveBtn, false);
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    penaltyAssignmentState.context = null;
    penaltyAssignmentState.penalties = [];
    penaltyAssignmentState.competitionPenalties = [];
    bodyEl.innerHTML = renderPenaltyAssignmentLoadingState();
    setPenaltyAssignmentSaveDisabled(false);
    clearPenaltyAssignmentValidationMessage();
  });

  modalEl.dataset.initialized = '1';
}

async function openPenaltyAssignmentModal({ competitionId, dancerId, dancerName, competitionLabel = '', assignedBy = 'J' } = {}) {
  const modalEl = document.getElementById('penaltyAssignmentModal');
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  const modalTitleEl = document.getElementById('penaltyAssignmentModalLabel');
  if (!modalEl || !bodyEl || !modalTitleEl) return;

  const eventId = parseOptionalNumber(getEvent()?.id);
  const parsedCompetitionId = parseOptionalNumber(competitionId);
  const parsedDancerId = parseOptionalNumber(dancerId);

  if (eventId === null || parsedCompetitionId === null || parsedDancerId === null) {
    showMessageModal(t('error_title', 'Error'), t('error_title', 'Error'));
    return;
  }

  penaltyAssignmentState.context = {
    eventId,
    competitionId: parsedCompetitionId,
    dancerId: parsedDancerId,
    dancerName: dancerName || t('dancer', 'Dancer'),
    competitionLabel,
    assignedBy: String(assignedBy).trim().toUpperCase() === 'O' ? 'O' : 'J'
  };

  modalTitleEl.textContent = t('penalty_modal_title', 'Penalties');
  bodyEl.innerHTML = renderPenaltyAssignmentLoadingState();
  clearPenaltyAssignmentValidationMessage();
  setPenaltyAssignmentSaveDisabled(true);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  try {
    const [penalties, competitionPenalties] = await Promise.all([
      fetchPenaltyDefinitionsForEvent(eventId),
      fetchCompetitionPenaltiesForDancer(eventId, parsedCompetitionId, parsedDancerId)
    ]);

    penaltyAssignmentState.penalties = penalties;
    penaltyAssignmentState.competitionPenalties = competitionPenalties;
    renderPenaltyAssignmentModalContent();
  } catch (error) {
    console.error('Error loading competition penalties:', error);
    bodyEl.innerHTML = `
      <div class="alert alert-danger mb-0">
        ${escapeHtml(error?.message || t('penalty_modal_load_error', 'Error loading penalties.'))}
      </div>
    `;
    setPenaltyAssignmentSaveDisabled(true);
  }
}

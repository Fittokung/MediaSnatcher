document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlInput = document.getElementById('url-input');
  const btnPaste = document.getElementById('btn-paste');
  const btnAnalyze = document.getElementById('btn-analyze');
  const btnUpdateEngine = document.getElementById('btn-update-engine');
  
  const toastContainer = document.getElementById('toast-container');
  
  // Preview Elements
  const previewCard = document.getElementById('preview-card');
  const previewThumb = document.getElementById('preview-thumb');
  const previewDuration = document.getElementById('preview-duration');
  const previewPlatform = document.getElementById('preview-platform');
  const previewUploader = document.getElementById('preview-uploader');
  const previewTitle = document.getElementById('preview-title');
  const outputDirInput = document.getElementById('output-dir-input');
  const btnStartDownload = document.getElementById('btn-start-download');
  
  // Progress Elements
  const progressCard = document.getElementById('progress-card');
  const statusBadge = document.getElementById('status-badge');
  const statusMessage = document.getElementById('status-message');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const statSpeed = document.getElementById('stat-speed');
  const statSize = document.getElementById('stat-size');
  const statEta = document.getElementById('stat-eta');
  
  // History Elements
  const historyList = document.getElementById('history-list');
  const btnClearHistory = document.getElementById('btnClearHistory');

  let currentMediaData = null;
  let activeEventSource = null;

  // Fetch Default Settings
  fetch('/api/settings')
    .then(res => res.json())
    .then(data => {
      if (data.defaultOutputDir) {
        outputDirInput.value = data.defaultOutputDir;
      }
    })
    .catch(() => {});

  // Toast Helpers
  function showToast(message, type = 'error') {
    toastContainer.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${type === 'error' ? '⚠️' : '✅'}</span>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  // Paste Button
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        showToast('Pasted URL from clipboard!', 'success');
      }
    } catch (err) {
      showToast('Clipboard access permission denied or unavailable.', 'error');
    }
  });

  // Analyze Link / Fetch Metadata
  btnAnalyze.addEventListener('click', analyzeUrl);
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeUrl();
  });

  async function analyzeUrl() {
    const url = urlInput.value.trim();
    if (!url) {
      showToast('Please enter a valid video or audio URL.', 'error');
      return;
    }

    // Set Loading State
    btnAnalyze.disabled = true;
    btnAnalyze.querySelector('.btn-text').textContent = 'Analyzing...';
    btnAnalyze.querySelector('.spinner').classList.remove('hidden');
    previewCard.classList.add('hidden');

    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || 'Could not fetch metadata for this URL.');
      }

      currentMediaData = json.data;
      renderPreview(currentMediaData);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnAnalyze.disabled = false;
      btnAnalyze.querySelector('.btn-text').textContent = 'Analyze Link';
      btnAnalyze.querySelector('.spinner').classList.add('hidden');
    }
  }

  function formatDuration(seconds) {
    if (!seconds) return 'Live / Unknown';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function renderPreview(data) {
    previewThumb.src = data.thumbnail || 'https://via.placeholder.com/640x360?text=No+Thumbnail';
    previewDuration.textContent = formatDuration(data.duration);
    previewPlatform.textContent = data.platform || 'Social Media';
    previewUploader.textContent = data.uploader || 'Unknown Channel';
    previewTitle.textContent = data.title || 'Untitled Video';

    previewCard.classList.remove('hidden');
    previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Start Download via SSE
  btnStartDownload.addEventListener('click', () => {
    if (!currentMediaData) return;

    const url = currentMediaData.originalUrl;
    const selectedQuality = document.querySelector('input[name="quality"]:checked').value;
    const outputDir = outputDirInput.value;

    if (activeEventSource) {
      activeEventSource.close();
    }

    // Show Progress Card
    progressCard.classList.remove('hidden');
    progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Reset Progress Indicators
    updateProgressUI({
      status: 'starting',
      percent: 0,
      speed: '0 MiB/s',
      totalSize: '--',
      eta: '--:--',
      message: 'Connecting to download engine...'
    });

    const sseUrl = `/api/download-stream?url=${encodeURIComponent(url)}&quality=${selectedQuality}&outputDir=${encodeURIComponent(outputDir)}`;
    activeEventSource = new EventSource(sseUrl);

    activeEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        updateProgressUI(data);

        if (data.status === 'completed') {
          activeEventSource.close();
          showToast('Download finished successfully!', 'success');
          saveToHistory(currentMediaData.title, selectedQuality, currentMediaData.platform);
        }

        if (data.status === 'error') {
          activeEventSource.close();
          showToast(data.error || 'Download failed', 'error');
        }
      } catch (e) {
        console.error('Failed to parse SSE data:', e);
      }
    };

    activeEventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      activeEventSource.close();
      showToast('Connection to server interrupted.', 'error');
    };
  });

  function updateProgressUI(data) {
    const percent = Math.min(100, Math.max(0, data.percent || 0));
    progressPercent.textContent = `${percent.toFixed(1)}%`;
    progressBarFill.style.width = `${percent}%`;

    statusMessage.textContent = data.message || 'Processing...';
    statSpeed.textContent = data.speed || '-- MiB/s';
    statSize.textContent = data.totalSize || '--';
    statEta.textContent = data.eta || '--:--';

    if (data.status === 'completed') {
      statusBadge.textContent = 'Completed';
      statusBadge.className = 'status-pill status-success';
    } else if (data.status === 'error') {
      statusBadge.textContent = 'Error';
      statusBadge.className = 'status-pill';
      statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      statusBadge.style.color = '#f87171';
    } else {
      statusBadge.textContent = data.status.toUpperCase();
      statusBadge.className = 'status-pill status-active';
    }
  }

  // Engine Auto-Update
  btnUpdateEngine.addEventListener('click', async () => {
    btnUpdateEngine.disabled = true;
    btnUpdateEngine.textContent = 'Updating...';

    try {
      const res = await fetch('/api/update-engine', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Engine updated successfully!', 'success');
      } else {
        showToast(json.error || 'Engine update failed', 'error');
      }
    } catch (err) {
      showToast('Failed to contact update server', 'error');
    } finally {
      btnUpdateEngine.disabled = false;
      btnUpdateEngine.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        Update Engine
      `;
    }
  });

  // History LocalStorage Management
  function saveToHistory(title, format, platform) {
    let history = JSON.parse(localStorage.getItem('ms_history') || '[]');
    history.unshift({
      title,
      format,
      platform,
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    history = history.slice(0, 10); // Keep last 10
    localStorage.setItem('ms_history', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    let history = JSON.parse(localStorage.getItem('ms_history') || '[]');
    if (history.length === 0) {
      historyList.innerHTML = '<div class="empty-history">No download history yet. Paste a link above to get started!</div>';
      return;
    }

    historyList.innerHTML = history.map(item => `
      <div class="history-item">
        <div class="history-item-info">
          <span class="history-item-badge">${item.format.toUpperCase()}</span>
          <span class="history-item-title">${item.title}</span>
        </div>
        <span style="font-size: 11px; color: var(--text-dim);">${item.date}</span>
      </div>
    `).join('');
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      localStorage.removeItem('ms_history');
      renderHistory();
    });
  }

  renderHistory();
});

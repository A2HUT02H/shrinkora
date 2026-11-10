/**
 * COMPRESS // Minimalist Client-Side Image & PDF Compressor
 * 100% In-Browser Execution. Zero tracking. Zero server uploads.
 */

(() => {
  'use strict';

  // Configure PDF.js Worker if available
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // Application State
  const state = {
    theme: localStorage.getItem('compress_theme') || 'light',
    outputFormat: 'auto', // 'auto' | 'image/jpeg' | 'image/webp' | 'original'
    files: new Map(), // fileId -> FileRecord
    runtimeNotice: null,
    previewZoom: 100, // percent
    panOffset: { x: 0, y: 0 }, // shared across original & compressed so both show the same area
    isDragging: false, // single drag state shared by both preview images
  };

  /**
   * FileRecord Structure:
   * {
   *   id: string,
   *   file: File,
   *   name: string,
   *   origSize: number,
   *   type: 'image' | 'pdf',
   *   mimeType: string,
   *   thumbUrl: string,
   *   status: 'pending' | 'processing' | 'done' | 'error',
   *   progress: number,
   *   targetVal: number,
   *   targetUnit: 'KB' | 'MB',
   *   compressedBlob: Blob | null,
   *   compressedSize: number | null,
   *   compressedUrl: string | null,
   *   errorMsg: string | null
   * }
   */

  // DOM Elements
  const elements = {
    html: document.documentElement,
    runtimeNotice: document.getElementById('runtimeNotice'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),

    dropzoneSection: document.getElementById('dropzoneSection'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    addMoreFilesBtn: document.getElementById('addMoreFilesBtn'),
    addFilesBottomBtn: document.getElementById('addFilesBottomBtn'),

    batchToolbar: document.getElementById('batchToolbar'),
    totalFilesCount: document.getElementById('totalFilesCount'),
    totalOriginalSize: document.getElementById('totalOriginalSize'),
    batchSavingsTag: document.getElementById('batchSavingsTag'),
    applySettingsToAllBtn: document.getElementById('applySettingsToAllBtn'),
    compressAllBtn: document.getElementById('compressAllBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),

    fileListSection: document.getElementById('fileListSection'),
    fileCardsContainer: document.getElementById('fileCardsContainer'),

    previewModal: document.getElementById('previewModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMeta: document.getElementById('modalMeta'),
    modalOrigSize: document.getElementById('modalOrigSize'),
    modalCompSize: document.getElementById('modalCompSize'),
    modalOriginalMedia: document.getElementById('modalOriginalMedia'),
    modalCompressedMedia: document.getElementById('modalCompressedMedia'),
    modalStats: document.getElementById('modalStats'),
    modalDownloadBtn: document.getElementById('modalDownloadBtn'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    zoomSlider: document.getElementById('zoomSlider'),
    zoomValue: document.getElementById('zoomValue'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
  };

  // ==========================================================================
  // Initialization & Theme
  // ==========================================================================

  function init() {
    state.runtimeNotice = elements.runtimeNotice;
    applyTheme(state.theme);
    bindEvents();
    updateRuntimeNotice();
  }

  function updateRuntimeNotice() {
    if (!state.runtimeNotice) return;

    const missing = [];
    if (!window.pdfjsLib) missing.push('PDF preview support');
    if (!window.PDFLib) missing.push('PDF compression support');
    if (!window.JSZip) missing.push('ZIP export support');

    if (!missing.length) {
      state.runtimeNotice.classList.add('hidden');
      state.runtimeNotice.textContent = '';
      return;
    }

    const offlineLabel = !navigator.onLine ? 'Browser appears offline.' : 'Some CDN-backed features are unavailable.';
    state.runtimeNotice.textContent = `${offlineLabel} Image compression still works; ${missing.join(', ')} may be unavailable.`;
    state.runtimeNotice.classList.remove('hidden');
  }

  function applyTheme(theme) {
    state.theme = theme;
    elements.html.setAttribute('data-theme', theme);
    localStorage.setItem('compress_theme', theme);
  }

  function toggleTheme() {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
  }

  // ==========================================================================
  // Event Bindings
  // ==========================================================================

  function bindEvents() {
    // Theme toggle
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    // Dropzone & File Input
    elements.dropzone.addEventListener('click', () => elements.fileInput.click());
    elements.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        elements.fileInput.click();
      }
    });

    elements.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(Array.from(e.target.files));
        elements.fileInput.value = ''; // Reset input
      }
    });

    // Drag and drop listeners on dropzone
    ['dragenter', 'dragover'].forEach(eventName => {
      elements.dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      elements.dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropzone.classList.remove('drag-over');
      });
    });

    elements.dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Window drag & drop (works whether dropzone is visible or hidden)
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Small buttons to add/upload more files
    if (elements.addMoreFilesBtn) {
      elements.addMoreFilesBtn.addEventListener('click', () => elements.fileInput.click());
    }
    if (elements.addFilesBottomBtn) {
      elements.addFilesBottomBtn.addEventListener('click', () => elements.fileInput.click());
    }

    // Batch Actions
    elements.applySettingsToAllBtn.addEventListener('click', applyGlobalSettingsToAllFiles);
    elements.compressAllBtn.addEventListener('click', compressAll);
    elements.downloadAllBtn.addEventListener('click', downloadAllAsZip);
    elements.clearAllBtn.addEventListener('click', clearAllFiles);

    // Modal close
    elements.closeModalBtn.addEventListener('click', closeModal);
    elements.previewModal.addEventListener('click', (e) => {
      if (e.target === elements.previewModal) closeModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Zoom controls
    elements.zoomSlider.addEventListener('input', () => {
      state.previewZoom = Number(elements.zoomSlider.value);
      elements.zoomValue.textContent = `${state.previewZoom}%`;
      applyPreviewZoom();
    });
    elements.zoomInBtn.addEventListener('click', () => {
      state.previewZoom = Math.min(500, state.previewZoom + 25);
      elements.zoomSlider.value = String(state.previewZoom);
      elements.zoomValue.textContent = `${state.previewZoom}%`;
      applyPreviewZoom();
    });
    elements.zoomOutBtn.addEventListener('click', () => {
      state.previewZoom = Math.max(25, state.previewZoom - 25);
      elements.zoomSlider.value = String(state.previewZoom);
      elements.zoomValue.textContent = `${state.previewZoom}%`;
      applyPreviewZoom();
    });

    // Shared drag-to-pan window listeners (moves both preview images together)
    window.addEventListener('mousemove', (e) => doDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    // Touch
    window.addEventListener('touchmove', (e) => {
      if (!state.isDragging) return;
      e.preventDefault(); // prevent scroll while panning
      const t = e.touches[0];
      doDrag(t.clientX, t.clientY);
    }, { passive: false });
    window.addEventListener('touchend', endDrag);
    window.addEventListener('touchcancel', endDrag);
  }

  // ==========================================================================
  // File Intake & Queue Management
  // ==========================================================================

  function validateUploadedFile(file) {
    if (!file) return { valid: false, message: 'No file selected.' };
    if (file.size === 0) return { valid: false, message: `${file.name || 'This file'} is empty.` };
    if (file.size > 500 * 1024 * 1024) return { valid: false, message: `${file.name || 'This file'} is larger than 500 MB and cannot be processed.` };

    const mimeType = typeof file.type === 'string' ? file.type : '';
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isValidFormat = isImage || isPdf;

    if (!isValidFormat) {
      return { valid: false, message: `Unsupported file type for ${file.name || 'this file'}. Please upload an image or PDF.` };
    }

    return { valid: true, message: '' };
  }

  async function handleFiles(fileList) {
    const validFiles = [];
    const rejectedFiles = [];

    fileList.forEach(file => {
      const validation = validateUploadedFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        rejectedFiles.push(validation.message);
      }
    });

    if (rejectedFiles.length > 0) {
      alert(rejectedFiles.join('\n'));
    }

    if (validFiles.length === 0) {
      return;
    }

    for (const file of validFiles) {
      const id = 'f_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      // Determine initial target for this file
      let targetVal = 200;
      let targetUnit = 'KB';
      if (file.size >= 2 * 1024 * 1024) {
        targetVal = Math.max(1, Math.round(file.size / (2 * 1024 * 1024)));
        targetUnit = 'MB';
      } else if (file.size > 200 * 1024) {
        targetVal = Math.min(200, Math.round((file.size * 0.5) / 1024));
        targetUnit = 'KB';
      } else {
        targetVal = Math.max(10, Math.round((file.size * 0.5) / 1024));
        targetUnit = 'KB';
      }

      const fileRecord = {
        id,
        file,
        name: file.name,
        origSize: file.size,
        type: isPdf ? 'pdf' : 'image',
        mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
        thumbUrl: '',
        status: 'pending',
        progress: 0,
        targetVal: targetVal,
        targetUnit: targetUnit,
        compressedBlob: null,
        compressedSize: null,
        compressedUrl: null,
        errorMsg: null,
      };

      normalizeTargetValue(fileRecord);
      state.files.set(id, fileRecord);
      renderFileRow(fileRecord);
      generateThumbnail(fileRecord);
    }

    updateQueueUI();
  }

  async function generateThumbnail(record) {
    const thumbEl = document.getElementById(`thumb_${record.id}`);
    if (!thumbEl) return;

    if (record.type === 'image') {
      const url = URL.createObjectURL(record.file);
      record.thumbUrl = url;
      thumbEl.innerHTML = `<img src="${url}" alt="${record.name}">`;
    } else if (record.type === 'pdf') {
      try {
        if (!window.pdfjsLib) {
          thumbEl.textContent = 'PDF';
          return;
        }
        const arrayBuffer = await record.file.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        const url = canvas.toDataURL('image/jpeg', 0.6);
        record.thumbUrl = url;
        thumbEl.innerHTML = `<img src="${url}" alt="PDF Page 1">`;
      } catch (err) {
        console.warn('Could not generate PDF thumbnail:', err);
        thumbEl.textContent = 'PDF';
      }
    }
  }

  function updateQueueUI() {
    const count = state.files.size;
    const hasFiles = count > 0;

    if (elements.dropzoneSection) {
      elements.dropzoneSection.classList.toggle('hidden', hasFiles);
    }
    elements.fileListSection.classList.toggle('hidden', !hasFiles);
    elements.batchToolbar.classList.toggle('hidden', !hasFiles);

    if (hasFiles) {
      elements.totalFilesCount.textContent = count;
      let totalBytes = 0;
      let totalCompBytes = 0;
      let allCompressed = true;

      state.files.forEach(f => {
        totalBytes += f.origSize;
        if (f.compressedSize) {
          totalCompBytes += f.compressedSize;
        } else {
          allCompressed = false;
        }
      });

      elements.totalOriginalSize.textContent = formatBytes(totalBytes);

      if (totalCompBytes > 0) {
        const savedBytes = totalBytes - totalCompBytes;
        const savedPercent = ((savedBytes / totalBytes) * 100).toFixed(1);
        elements.batchSavingsTag.classList.remove('hidden');
        elements.batchSavingsTag.textContent = `SAVED: ${formatBytes(savedBytes)} (-${savedPercent}%)`;
      } else {
        elements.batchSavingsTag.classList.add('hidden');
      }

      // Show download all button if at least one file is compressed
      const anyCompressed = Array.from(state.files.values()).some(f => f.status === 'done');
      elements.downloadAllBtn.classList.toggle('hidden', !anyCompressed);
    }
  }

  function renderFileRow(record) {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.id = `row_${record.id}`;

    const isPdf = record.type === 'pdf';
    const ext = record.name.split('.').pop().toUpperCase();
    const isMb = record.targetUnit === 'MB';
    const maxTarget = getMaxTargetForRecord(record);
    // Keep the slider's minimum within [min, max] so small files don't invert the range.
    const sliderMin = isMb ? '0.1' : String(Math.min(10, maxTarget));
    const sliderMax = getSliderMaxForRecord(record);
    const sliderStep = isMb ? '0.1' : '10';

    row.innerHTML = `
      <div class="file-col-info">
        <div class="file-thumbnail" id="thumb_${record.id}">
          <span>...</span>
        </div>
        <div class="file-meta-group">
          <div class="file-name" title="${escapeHtml(record.name)}">${escapeHtml(record.name)}</div>
          <div class="file-submeta">
            <span class="badge-format">${ext}</span>
            <span>${isPdf ? 'Document' : 'Image'}</span>
          </div>
        </div>
      </div>

      <div class="file-col-orig mono-val">
        ${formatBytes(record.origSize)}
      </div>

      <div class="file-col-target">
        <div class="target-row-input">
          <div class="target-stepper" aria-label="Change target value">
            <button type="button" class="target-step-btn" data-step="-1" aria-label="Decrease target size">&#8592;</button>
            <input type="number" class="target-input-sm mono-val" id="target_val_${record.id}" value="${record.targetVal}" min="0.1" max="50000" step="${isMb ? '0.1' : '5'}" aria-label="Target size value">
            <button type="button" class="target-step-btn" data-step="1" aria-label="Increase target size">&#8594;</button>
          </div>
          <select class="target-unit-select mono-val" id="target_unit_${record.id}" aria-label="Target size unit">
            <option value="KB" ${record.targetUnit === 'KB' ? 'selected' : ''}>KB</option>
            <option value="MB" ${record.targetUnit === 'MB' ? 'selected' : ''}>MB</option>
          </select>
        </div>
        <div class="target-estimate mono-val" id="estimate_${record.id}">EST. ${formatBytes(getTargetBytesForRecord(record))}</div>
        <input type="range" class="slider-input slider-input-sm" id="target_slider_${record.id}" min="${sliderMin}" max="${sliderMax}" step="${sliderStep}" value="${record.targetVal}" title="Target size slider">
      </div>

      <div class="file-col-result" id="result_col_${record.id}">
        <div class="status-badge" id="status_${record.id}">PENDING</div>
        <div class="progress-bar-wrap hidden" id="prog_wrap_${record.id}">
          <div class="progress-bar-fill" id="prog_fill_${record.id}"></div>
        </div>
        <div class="diamond-spinner hidden" id="diamond_spin_${record.id}" title="Compressing">
          <svg viewBox="0 0 20 20" fill="currentColor" role="status" aria-label="Loading">
            <rect class="pixel-1" x="8" y="0" width="4" height="4" />
            <rect class="pixel-2" x="12" y="4" width="4" height="4" />
            <rect class="pixel-3" x="16" y="8" width="4" height="4" />
            <rect class="pixel-4" x="12" y="12" width="4" height="4" />
            <rect class="pixel-5" x="8" y="16" width="4" height="4" />
            <rect class="pixel-6" x="4" y="12" width="4" height="4" />
            <rect class="pixel-7" x="0" y="8" width="4" height="4" />
            <rect class="pixel-8" x="4" y="4" width="4" height="4" />
          </svg>
        </div>
      </div>

      <div class="file-col-actions" id="actions_${record.id}">
        <button type="button" class="btn btn-primary btn-sm" id="btn_comp_${record.id}" title="Compress this file">COMPRESS</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btn_remove_${record.id}" title="Remove file">&times;</button>
      </div>
    `;

    elements.fileCardsContainer.appendChild(row);

    // Bind row inputs
    const targetValInput = row.querySelector(`#target_val_${record.id}`);
    const targetUnitSelect = row.querySelector(`#target_unit_${record.id}`);
    const targetSlider = row.querySelector(`#target_slider_${record.id}`);
    const targetEstimate = row.querySelector(`#estimate_${record.id}`);
    const stepButtons = row.querySelectorAll('.target-step-btn');
    const compBtn = row.querySelector(`#btn_comp_${record.id}`);
    const removeBtn = row.querySelector(`#btn_remove_${record.id}`);
    targetSlider.max = String(getSliderMaxForRecord(record));

    const updateTargetEstimate = () => {
      if (targetEstimate) {
        targetEstimate.textContent = `EST. ${formatBytes(getTargetBytesForRecord(record))}`;
      }
    };

    const adjustTargetValue = (delta) => {
      const stepAmount = record.targetUnit === 'MB' ? 0.1 : 10;
      let nextValue = Number((record.targetVal + delta * stepAmount).toFixed(record.targetUnit === 'MB' ? 1 : 0));
      if (record.targetUnit === 'KB') {
        nextValue = Math.max(1, nextValue);
      } else {
        nextValue = Math.max(0.1, nextValue);
      }

      normalizeTargetValue(record, nextValue);
      targetValInput.value = record.targetVal;
      if (record.targetVal > parseFloat(targetSlider.max)) {
        targetSlider.max = String(Math.ceil(record.targetVal * 1.25));
      }
      targetSlider.value = record.targetVal;
      updateTargetEstimate();
      if (record.status === 'done') markRowForRecompress(record);
    };

    stepButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.dataset.step || '1');
        adjustTargetValue(delta);
      });
    });

    targetSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      normalizeTargetValue(record, val);
      targetValInput.value = record.targetVal;
      updateTargetEstimate();
      if (record.status === 'done') markRowForRecompress(record);
    });

    targetValInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 1;
      const safeValue = Math.max(0.1, val);
      normalizeTargetValue(record, safeValue);
      targetValInput.value = record.targetVal;
      if (record.targetVal > parseFloat(targetSlider.max)) {
        targetSlider.max = String(Math.ceil(record.targetVal * 1.25));
      }
      targetSlider.value = record.targetVal;
      updateTargetEstimate();
      if (record.status === 'done') markRowForRecompress(record);
    });

    targetUnitSelect.addEventListener('change', (e) => {
      const oldUnit = record.targetUnit;
      const newUnit = e.target.value;
      if (oldUnit === newUnit) return;

      record.targetUnit = newUnit;
      if (newUnit === 'MB' && oldUnit === 'KB') {
        record.targetVal = Math.max(0.1, +(record.targetVal / 1000).toFixed(1));
      } else if (newUnit === 'KB' && oldUnit === 'MB') {
        record.targetVal = Math.max(1, Math.round(record.targetVal * 1000));
      }

      normalizeTargetValue(record);
      targetValInput.value = record.targetVal;
      const rowIsMb = newUnit === 'MB';
      targetValInput.step = rowIsMb ? '0.1' : '5';
      targetSlider.min = rowIsMb ? '0.1' : '10';
      targetSlider.step = rowIsMb ? '0.1' : '10';
      targetSlider.max = String(getSliderMaxForRecord(record));
      targetSlider.value = record.targetVal;
      updateTargetEstimate();
      if (record.status === 'done') markRowForRecompress(record);
    });

    compBtn.addEventListener('click', () => compressSingleFile(record.id));
    removeBtn.addEventListener('click', () => removeFile(record.id));
  }

  function updateRowUI(record) {
    const statusEl = document.getElementById(`status_${record.id}`);
    const progWrap = document.getElementById(`prog_wrap_${record.id}`);
    const progFill = document.getElementById(`prog_fill_${record.id}`);
    const resultCol = document.getElementById(`result_col_${record.id}`);
    const actionsCol = document.getElementById(`actions_${record.id}`);

    if (!statusEl || !resultCol || !actionsCol) return;

    const spinEl = document.getElementById(`diamond_spin_${record.id}`);

    if (record.status === 'processing') {
      statusEl.className = 'status-badge status-compressing';
      statusEl.textContent = `COMPRESSING ${record.progress > 0 ? `${record.progress}%` : '...'}`;
      progWrap.classList.add('hidden');
      spinEl.classList.remove('hidden');
    } else if (record.status === 'done') {
      progWrap.classList.add('hidden');
      spinEl.classList.add('hidden');
      const savedBytes = record.origSize - record.compressedSize;
      const savedPct = ((savedBytes / record.origSize) * 100).toFixed(1);
      const isSmaller = savedBytes > 0;

      resultCol.innerHTML = `
        <div class="result-size-line">
          <span>${formatBytes(record.compressedSize)}</span>
          <span class="reduction-pill mono-val">${isSmaller ? `-${savedPct}%` : 'FIT'}</span>
        </div>
        <div class="status-badge status-done">&check; COMPRESSED</div>
      `;

      const isImage = record.type === 'image';
      actionsCol.innerHTML = `
        ${isImage ? `<button type="button" class="btn btn-secondary btn-sm" id="btn_preview_${record.id}" title="Inspect before/after">VIEW</button>` : ''}
        <button type="button" class="btn btn-primary btn-sm" id="btn_dl_${record.id}" title="Download compressed file">SAVE</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btn_remove_${record.id}" title="Remove">&times;</button>
      `;

      if (isImage) {
        document.getElementById(`btn_preview_${record.id}`).addEventListener('click', () => openPreviewModal(record.id));
      }
      document.getElementById(`btn_dl_${record.id}`).addEventListener('click', () => downloadFile(record.id));
      document.getElementById(`btn_remove_${record.id}`).addEventListener('click', () => removeFile(record.id));
    } else if (record.status === 'error') {
      progWrap.classList.add('hidden');
      spinEl.classList.add('hidden');
      statusEl.className = 'status-badge status-error';
      statusEl.textContent = record.errorMsg || 'FAILED';
    }
  }

  function removeFile(fileId) {
    const record = state.files.get(fileId);
    if (record) {
      if (record.thumbUrl && record.thumbUrl.startsWith('blob:')) {
        URL.revokeObjectURL(record.thumbUrl);
      }
      if (record.compressedUrl && record.compressedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(record.compressedUrl);
      }
      state.files.delete(fileId);
    }

    const row = document.getElementById(`row_${fileId}`);
    if (row) row.remove();

    updateQueueUI();
  }

  function markRowForRecompress(record) {
    record.status = 'pending';
    record.compressedBlob = null;
    record.compressedSize = null;
    record.compressedUrl = null;

    // Restore result column to pending state
    const resultCol = document.getElementById(`result_col_${record.id}`);
    if (resultCol) {
      resultCol.innerHTML = `
        <div class="status-badge" id="status_${record.id}">PENDING</div>
        <div class="progress-bar-wrap hidden" id="prog_wrap_${record.id}">
          <div class="progress-bar-fill" id="prog_fill_${record.id}"></div>
        </div>
        <div class="diamond-spinner hidden" id="diamond_spin_${record.id}" title="Compressing">
          <svg viewBox="0 0 20 20" fill="currentColor" role="status" aria-label="Loading">
            <rect class="pixel-1" x="8" y="0" width="4" height="4" />
            <rect class="pixel-2" x="12" y="4" width="4" height="4" />
            <rect class="pixel-3" x="16" y="8" width="4" height="4" />
            <rect class="pixel-4" x="12" y="12" width="4" height="4" />
            <rect class="pixel-5" x="8" y="16" width="4" height="4" />
            <rect class="pixel-6" x="4" y="12" width="4" height="4" />
            <rect class="pixel-7" x="0" y="8" width="4" height="4" />
            <rect class="pixel-8" x="4" y="4" width="4" height="4" />
          </svg>
        </div>
      `;
    }

    // Restore actions column with COMPRESS button
    const actionsCol = document.getElementById(`actions_${record.id}`);
    if (actionsCol) {
      actionsCol.innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" id="btn_comp_${record.id}" title="Compress this file">COMPRESS</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btn_remove_${record.id}" title="Remove file">&times;</button>
      `;

      document.getElementById(`btn_comp_${record.id}`).addEventListener('click', () => compressSingleFile(record.id));
      document.getElementById(`btn_remove_${record.id}`).addEventListener('click', () => removeFile(record.id));
    }

    updateQueueUI();
  }

  function clearAllFiles() {
    state.files.forEach(record => {
      if (record.thumbUrl && record.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(record.thumbUrl);
      if (record.compressedUrl && record.compressedUrl.startsWith('blob:')) URL.revokeObjectURL(record.compressedUrl);
    });
    state.files.clear();
    elements.fileCardsContainer.innerHTML = '';
    updateQueueUI();
  }

  function applyGlobalSettingsToAllFiles() {
    if (state.files.size === 0) return;
    const firstRecord = state.files.values().next().value;
    if (!firstRecord) return;

    const targetVal = firstRecord.targetVal;
    const targetUnit = firstRecord.targetUnit;

    state.files.forEach(record => {
      record.targetUnit = targetUnit;
      record.targetVal = Math.min(targetVal, getMaxTargetForRecord(record));

      const inputVal = document.getElementById(`target_val_${record.id}`);
      const selectUnit = document.getElementById(`target_unit_${record.id}`);
      const rowSlider = document.getElementById(`target_slider_${record.id}`);

      if (inputVal) {
        inputVal.value = record.targetVal;
        inputVal.step = targetUnit === 'MB' ? '0.1' : '5';
      }
      if (selectUnit) selectUnit.value = targetUnit;
      if (rowSlider) {
        const isMb = targetUnit === 'MB';
        const maxTarget = getMaxTargetForRecord(record);
        rowSlider.min = isMb ? '0.1' : String(Math.min(10, maxTarget));
        rowSlider.step = isMb ? '0.1' : '10';
        rowSlider.max = String(getSliderMaxForRecord(record));
        rowSlider.value = record.targetVal;
      }
      if (record.status === 'done') markRowForRecompress(record);
    });
  }

  // ==========================================================================
  // Compression Algorithms
  // ==========================================================================

  function getMaxTargetForRecord(record) {
    if (!record || !record.origSize) return 0.1;

    const bytes = record.origSize;
    if (record.targetUnit === 'MB') {
      return Math.max(0.1, Number((bytes / (1024 * 1024)).toFixed(2)));
    }

    return Math.max(1, Math.ceil(bytes / 1024));
  }

  function getSliderMaxForRecord(record) {
    // Slider max must match the highest settable target (the original file size),
    // so the thumb can travel the full track instead of capping partway.
    return getMaxTargetForRecord(record);
  }

  function normalizeTargetValue(record, overrideValue = null) {
    const unit = record.targetUnit;
    const candidate = overrideValue ?? record.targetVal;
    const maxAllowed = getMaxTargetForRecord(record);
    const safeValue = Math.min(candidate, maxAllowed);

    record.targetVal = Number(safeValue.toFixed(unit === 'MB' ? 1 : 0));

    if (record.targetUnit === 'KB' && record.targetVal < 1) {
      record.targetVal = 1;
    }
    if (record.targetUnit === 'MB' && record.targetVal < 0.1) {
      record.targetVal = 0.1;
    }

    const targetInput = document.getElementById(`target_val_${record.id}`);
    const targetSlider = document.getElementById(`target_slider_${record.id}`);
    if (targetInput) targetInput.value = record.targetVal;
    if (targetSlider) {
      targetSlider.max = String(getSliderMaxForRecord(record));
      targetSlider.value = record.targetVal;
    }

    return record.targetVal;
  }

  function getTargetBytesForRecord(record) {
    const unitMultiplier = record.targetUnit === 'MB' ? 1024 * 1024 : 1024;
    return record.targetVal * unitMultiplier;
  }

  async function compressSingleFile(fileId) {
    const record = state.files.get(fileId);
    if (!record) return;

    if (!record.file || record.file.size === 0) {
      record.status = 'error';
      record.errorMsg = 'File is empty or invalid.';
      updateRowUI(record);
      return;
    }

    record.status = 'processing';
    record.progress = 10;
    updateRowUI(record);

    try {
      let resultBlob;
      const targetBytes = getTargetBytesForRecord(record);

      if (record.type === 'image') {
        resultBlob = await compressImage(record, targetBytes, (p) => {
          record.progress = p;
          updateRowUI(record);
        });
      } else {
        resultBlob = await compressPdf(record, targetBytes, (p) => {
          record.progress = p;
          updateRowUI(record);
        });
      }

      if (!resultBlob || !(resultBlob instanceof Blob)) {
        throw new Error('Compression returned an invalid file. Try a lower target size or a different image format.');
      }

      record.compressedBlob = resultBlob;
      record.compressedSize = resultBlob.size;
      record.compressedUrl = URL.createObjectURL(resultBlob);
      record.status = 'done';
      record.progress = 100;
      updateRowUI(record);
      updateQueueUI();
    } catch (err) {
      console.error('Compression error:', err);
      record.status = 'error';
      record.errorMsg = err && err.message ? err.message : 'Error compressing';
      updateRowUI(record);
    }
  }

  async function compressAll() {
    elements.compressAllBtn.disabled = true;
    for (const record of state.files.values()) {
      await compressSingleFile(record.id);
    }
    elements.compressAllBtn.disabled = false;
  }

  /**
   * High-Precision Client-Side Image Compression Algorithm
   * Intelligently combines quality binary search with resolution downscaling.
   */
  async function compressImage(record, targetBytes, onProgress) {
    const img = await loadImageFromFile(record.file);
    onProgress(30);

    // Determine target MIME type
    let outMime = 'image/jpeg';
    if (state.outputFormat === 'original') {
      outMime = record.mimeType;
      // If original is PNG and target is strict, note that PNG canvas toBlob ignores quality
      if (outMime === 'image/png' && targetBytes) {
        // Will scale resolution to hit target
      }
    } else if (state.outputFormat === 'image/webp') {
      outMime = 'image/webp';
    } else if (state.outputFormat === 'image/jpeg') {
      outMime = 'image/jpeg';
    } else {
      // Auto: prefer WebP if supported, fallback to JPEG
      outMime = isWebPSupported() ? 'image/webp' : 'image/jpeg';
    }

    // Target size compression:
    // Precision binary search on quality & iterative resolution downscaling
    let currentWidth = img.naturalWidth;
    let currentHeight = img.naturalHeight;
    let bestBlob = null;

    let attempts = 0;
    const maxAttempts = 4;
    let canvas;

    while (attempts < maxAttempts) {
      attempts++;
      canvas = document.createElement('canvas');
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      const ctx = canvas.getContext('2d');

      if (outMime === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

      // If format is PNG, quality is ignored; must downscale dimensions
      if (outMime === 'image/png') {
        const blob = await canvasToBlobAsync(canvas, 'image/png');
        if (blob.size <= targetBytes || attempts === maxAttempts) {
          bestBlob = blob;
          break;
        } else {
          // Scale down based on area ratio
          const scale = Math.max(0.2, Math.sqrt(targetBytes / blob.size) * 0.9);
          currentWidth = Math.round(currentWidth * scale);
          currentHeight = Math.round(currentHeight * scale);
          continue;
        }
      }

      // Binary search on quality between minQ and maxQ
      let minQ = 0.05;
      let maxQ = 0.95;
      let passBlob = null;

      for (let iter = 0; iter < 6; iter++) {
        const midQ = (minQ + maxQ) / 2;
        const testBlob = await canvasToBlobAsync(canvas, outMime, midQ);

        if (testBlob.size <= targetBytes) {
          passBlob = testBlob;
          // We can afford higher quality
          minQ = midQ;
        } else {
          // Exceeds target, lower quality
          maxQ = midQ;
        }

        onProgress(30 + Math.round((attempts / maxAttempts) * 50 + (iter / 6) * 15));
      }

      if (passBlob) {
        bestBlob = passBlob;
        break; // Successfully hit within target size!
      } else {
        // Even at lowest quality (0.05), it exceeded target size.
        // Downscale image dimensions and re-attempt!
        const testBlob = await canvasToBlobAsync(canvas, outMime, 0.05);
        bestBlob = testBlob;
        const scale = Math.max(0.25, Math.sqrt(targetBytes / testBlob.size) * 0.9);
        currentWidth = Math.round(currentWidth * scale);
        currentHeight = Math.round(currentHeight * scale);
      }
    }

    onProgress(100);
    const finalBlob = bestBlob || (await canvasToBlobAsync(canvas, outMime, 0.5));
    if (finalBlob && finalBlob.size > record.origSize && record.origSize <= targetBytes) {
      // Prevent bloating if the original was already smaller than desired target
      return record.file;
    }
    return finalBlob;
  }

  /**
   * PDF Compression Engine:
   * Multi-page rendering and re-assembly with page-budgeted JPEG optimization.
   */
  async function compressPdf(record, targetBytes, onProgress) {
    if (!window.pdfjsLib || !window.PDFLib) {
      throw new Error('PDF processing library (pdfjs / pdf-lib) is not available.');
    }

    onProgress(15);
    const arrayBuffer = await record.file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    if (numPages === 0) throw new Error('PDF has no pages.');

    // Calculate per-page target byte budget (with 10% safety margin for PDF wrapper/xref)
    let pageBudgetBytes = null;
    if (targetBytes) {
      pageBudgetBytes = Math.floor((targetBytes * 0.90) / numPages);
    }

    const { PDFDocument } = window.PDFLib;
    const outPdf = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      
      // Determine baseline scale based on budget
      let scale = 1.5; // crisp baseline
      if (pageBudgetBytes && pageBudgetBytes < 20 * 1024) {
        scale = 0.8;
      } else if (pageBudgetBytes && pageBudgetBytes < 35 * 1024) {
        scale = 1.0;
      }

      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      let jpgBlob;
      if (pageBudgetBytes) {
        // Binary search quality for this page
        let minQ = 0.08;
        let maxQ = 0.88;
        let bestPageBlob = null;

        for (let qIter = 0; qIter < 5; qIter++) {
          const midQ = (minQ + maxQ) / 2;
          const candidate = await canvasToBlobAsync(canvas, 'image/jpeg', midQ);
          if (candidate.size <= pageBudgetBytes) {
            bestPageBlob = candidate;
            minQ = midQ;
          } else {
            maxQ = midQ;
          }
        }

        jpgBlob = bestPageBlob || (await canvasToBlobAsync(canvas, 'image/jpeg', 0.1));
      } else {
        // Fallback standard quality
        jpgBlob = await canvasToBlobAsync(canvas, 'image/jpeg', 0.75);
      }

      const jpgBytes = await jpgBlob.arrayBuffer();
      const embeddedJpg = await outPdf.embedJpg(jpgBytes);

      // Match original page aspect ratio & PDF standard point dimensions (72 DPI)
      const origViewport = page.getViewport({ scale: 1.0 });
      const newPage = outPdf.addPage([origViewport.width, origViewport.height]);
      newPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });

      const pct = Math.round(20 + (pageNum / numPages) * 75);
      onProgress(pct);
    }

    const compressedPdfBytes = await outPdf.save();
    onProgress(100);
    return new Blob([compressedPdfBytes], { type: 'application/pdf' });
  }

  // ==========================================================================
  // Download & Modal Helpers
  // ==========================================================================

  function downloadFile(fileId) {
    const record = state.files.get(fileId);
    if (!record || !record.compressedBlob) return;

    const baseName = record.name.substring(0, record.name.lastIndexOf('.')) || record.name;
    let ext = record.type === 'pdf' ? '.pdf' : '.jpg';
    if (record.compressedBlob.type === 'image/webp') ext = '.webp';
    if (record.compressedBlob.type === 'image/png') ext = '.png';

    const filename = `${baseName}_min${ext}`;
    saveBlobAs(record.compressedBlob, filename);
  }

  async function downloadAllAsZip() {
    if (!window.JSZip) {
      alert('Zip compression library not loaded.');
      return;
    }

    const completed = Array.from(state.files.values()).filter(f => f.status === 'done');
    if (completed.length === 0) {
      alert('No compressed files ready for download.');
      return;
    }

    const zip = new window.JSZip();
    completed.forEach(record => {
      const baseName = record.name.substring(0, record.name.lastIndexOf('.')) || record.name;
      let ext = record.type === 'pdf' ? '.pdf' : '.jpg';
      if (record.compressedBlob.type === 'image/webp') ext = '.webp';
      if (record.compressedBlob.type === 'image/png') ext = '.png';
      zip.file(`${baseName}_compressed${ext}`, record.compressedBlob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveBlobAs(zipBlob, `compressed_bundle_${Date.now()}.zip`);
  }

  function saveBlobAs(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }

  async function openPreviewModal(fileId) {
    const record = state.files.get(fileId);
    if (!record || !record.compressedBlob) return;

    elements.modalTitle.textContent = record.name.toUpperCase();
    elements.modalMeta.textContent = `${record.type.toUpperCase()} • Target: ${record.targetVal} ${record.targetUnit}`;
    elements.modalOrigSize.textContent = formatBytes(record.origSize);
    elements.modalCompSize.textContent = formatBytes(record.compressedSize);

    const savedBytes = record.origSize - record.compressedSize;
    const savedPct = ((savedBytes / record.origSize) * 100).toFixed(1);
    elements.modalStats.textContent = `SAVED: ${formatBytes(savedBytes)} (-${savedPct}%)`;

    elements.modalOriginalMedia.innerHTML = '';
    elements.modalCompressedMedia.innerHTML = '';

    // Reset zoom when opening a new preview
    state.previewZoom = 100;
    elements.zoomSlider.value = '100';
    elements.zoomValue.textContent = '100%';
    state.panOffset.x = 0;
    state.panOffset.y = 0;

    if (record.type === 'image') {
      const origWrapper = document.createElement('div');
      origWrapper.className = 'image-zoom-wrapper';
      const origImg = document.createElement('img');
      origImg.src = record.thumbUrl || URL.createObjectURL(record.file);
      origImg.alt = 'Original';
      origWrapper.appendChild(origImg);
      elements.modalOriginalMedia.appendChild(origWrapper);
      initPreviewPan(origWrapper);

      const compWrapper = document.createElement('div');
      compWrapper.className = 'image-zoom-wrapper';
      const compImg = document.createElement('img');
      compImg.src = record.compressedUrl;
      compImg.alt = 'Compressed';
      compWrapper.appendChild(compImg);
      elements.modalCompressedMedia.appendChild(compWrapper);
      initPreviewPan(compWrapper);

      applyPreviewZoom();
    }

    elements.modalDownloadBtn.onclick = () => downloadFile(record.id);
    elements.previewModal.classList.remove('hidden');
  }

  function applyPreviewZoom() {
    const scale = state.previewZoom / 100;
    const { x, y } = state.panOffset;
    const imgs = document.querySelectorAll('.image-zoom-wrapper img');
    imgs.forEach(img => {
      img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      img.style.transformOrigin = 'center center';
      img.style.cursor = state.previewZoom > 100 ? 'grab' : 'default';
    });
  }

  function startDrag(clientX, clientY) {
    if (state.previewZoom <= 100) return;
    state.isDragging = true;
    panStartX = clientX - state.panOffset.x;
    panStartY = clientY - state.panOffset.y;
    document.querySelectorAll('.image-zoom-wrapper').forEach(w => {
      w.style.cursor = 'grabbing';
    });
  }

  function doDrag(clientX, clientY) {
    if (!state.isDragging) return;
    state.panOffset.x = clientX - panStartX;
    state.panOffset.y = clientY - panStartY;
    applyPreviewZoom();
  }

  function endDrag() {
    if (!state.isDragging) return;
    state.isDragging = false;
    document.querySelectorAll('.image-zoom-wrapper').forEach(w => {
      w.style.cursor = state.previewZoom > 100 ? 'grab' : 'default';
    });
  }

  let panStartX = 0;
  let panStartY = 0;

  function initPreviewPan(wrapper) {
    wrapper.addEventListener('mousedown', (e) => {
      e.preventDefault(); // stop browser from dragging the image as a file
      startDrag(e.clientX, e.clientY);
      wrapper.style.cursor = 'grabbing';
    });

    wrapper.addEventListener('mouseup', endDrag);

    wrapper.addEventListener('mouseleave', endDrag);

    wrapper.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
      wrapper.style.cursor = 'grabbing';
    }, { passive: false });

    wrapper.addEventListener('touchend', endDrag);

    // Scroll to zoom (PC only)
    wrapper.addEventListener('wheel', (e) => {
      e.preventDefault(); // stop page scroll

      const rect = wrapper.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const s = state.previewZoom / 100;
      const step = e.deltaY > 0 ? 0.9 : 1.1; // zoom out / zoom in
      let newZoom = state.previewZoom * step;
      newZoom = Math.min(500, Math.max(25, newZoom));
      const newS = newZoom / 100;

      // image point currently under the cursor
      const imageX = (cx - state.panOffset.x) / s;
      const imageY = (cy - state.panOffset.y) / s;

      // keep that same image point under the cursor after zoom
      state.panOffset.x = cx - imageX * newS;
      state.panOffset.y = cy - imageY * newS;
      state.previewZoom = newZoom;

      elements.zoomSlider.value = String(Math.round(newZoom));
      elements.zoomValue.textContent = `${Math.round(newZoom)}%`;
      applyPreviewZoom();
    }, { passive: false });
  }

  function closeModal() {
    state.isDragging = false;
    elements.previewModal.classList.add('hidden');
  }

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function canvasToBlobAsync(canvas, mimeType, quality) {
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), mimeType, quality);
    });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  function isWebPSupported() {
    try {
      const elem = document.createElement('canvas');
      if (elem.getContext && elem.getContext('2d')) {
        return elem.toDataURL('image/webp').indexOf('data:image/webp') === 0;
      }
      return false;
    } catch {
      return false;
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Run app
  document.addEventListener('DOMContentLoaded', init);
})();

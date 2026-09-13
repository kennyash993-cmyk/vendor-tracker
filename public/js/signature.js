// ---------- Shared signature pad modal ----------
// Usage: openSignatureModal({ title, actionLabel, items, onConfirm })
// onConfirm receives { signerName, signatureImage } (signatureImage is a
// base64 PNG data URL, or null if nothing was drawn).

let _sigCanvas, _sigCtx, _sigDrawing = false, _sigHasDrawn = false, _sigOnConfirm = null;

function _sigEnsureModal() {
  if (document.getElementById('sigOverlay')) return;

  const wrap = document.createElement('div');
  wrap.id = 'sigOverlay';
  wrap.className = 'sig-overlay';
  wrap.innerHTML = `
    <div class="sig-modal">
      <h2 id="sigTitle" style="margin-top:0;">Sign</h2>
      <div id="sigItemsList" class="sig-items"></div>

      <label>Signer's Name</label>
      <input id="sigName" placeholder="Vendor representative name" />

      <label>Signature</label>
      <canvas id="sigCanvas" width="500" height="180"></canvas>
      <div style="margin-top:6px;">
        <button type="button" class="secondary small" id="sigClearBtn">Clear Signature</button>
      </div>

      <div class="sig-actions">
        <button type="button" class="secondary" id="sigCancelBtn">Cancel</button>
        <button type="button" class="primary" id="sigConfirmBtn">Confirm Signature</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  _sigCanvas = document.getElementById('sigCanvas');
  _sigCtx = _sigCanvas.getContext('2d');
  _sigCtx.lineWidth = 2.2;
  _sigCtx.lineCap = 'round';
  _sigCtx.strokeStyle = '#111827';

  function posFromEvent(e) {
    const rect = _sigCanvas.getBoundingClientRect();
    const scaleX = _sigCanvas.width / rect.width;
    const scaleY = _sigCanvas.height / rect.height;
    const point = e.touches ? e.touches[0] : e;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
  }

  function start(e) {
    e.preventDefault();
    _sigDrawing = true;
    const p = posFromEvent(e);
    _sigCtx.beginPath();
    _sigCtx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!_sigDrawing) return;
    e.preventDefault();
    const p = posFromEvent(e);
    _sigCtx.lineTo(p.x, p.y);
    _sigCtx.stroke();
    _sigHasDrawn = true;
  }
  function end() { _sigDrawing = false; }

  _sigCanvas.addEventListener('mousedown', start);
  _sigCanvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  _sigCanvas.addEventListener('touchstart', start, { passive: false });
  _sigCanvas.addEventListener('touchmove', move, { passive: false });
  _sigCanvas.addEventListener('touchend', end);

  document.getElementById('sigClearBtn').addEventListener('click', _sigClearCanvas);
  document.getElementById('sigCancelBtn').addEventListener('click', _sigClose);
  document.getElementById('sigConfirmBtn').addEventListener('click', _sigConfirm);
}

function _sigClearCanvas() {
  _sigCtx.clearRect(0, 0, _sigCanvas.width, _sigCanvas.height);
  _sigHasDrawn = false;
}

function _sigClose() {
  document.getElementById('sigOverlay').classList.remove('show');
}

function _sigConfirm() {
  const signerName = document.getElementById('sigName').value.trim();
  if (!signerName) {
    toast("Enter the signer's name");
    return;
  }
  const signatureImage = _sigHasDrawn ? _sigCanvas.toDataURL('image/png') : null;
  _sigClose();
  if (_sigOnConfirm) _sigOnConfirm({ signerName, signatureImage });
}

function openSignatureModal({ title, actionLabel, items, onConfirm }) {
  _sigEnsureModal();
  document.getElementById('sigTitle').textContent = title || 'Sign';
  document.getElementById('sigConfirmBtn').textContent = actionLabel || 'Confirm Signature';
  document.getElementById('sigItemsList').innerHTML =
    '<strong>Items:</strong><br>' + (items || []).map((i) => `&bull; ${escapeHtml(i)}`).join('<br>');
  document.getElementById('sigName').value = '';
  _sigClearCanvas();
  _sigOnConfirm = onConfirm;
  document.getElementById('sigOverlay').classList.add('show');
}

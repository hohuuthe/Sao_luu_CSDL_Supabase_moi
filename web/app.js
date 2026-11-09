'use strict';

const OWNER = 'hohuuthe';
const WORK_REPO = 'TOOL_TAO_CSDL_MOI';
const BRANCH = 'main';
const API_VERSION = '2026-03-10';
const API = `https://api.github.com/repos/${OWNER}/${WORK_REPO}`;
const TOKEN_KEY = 'supabase_db_control_token';

const WORKFLOWS = {
  v4: {
    label: 'V4 · Sao lưu cấu trúc',
    file: 'Sao_luu_cau_truc_CSDL_V4.yml',
    path: '.github/workflows/Sao_luu_cau_truc_CSDL_V4.yml',
    destructive: false,
    markers: ['workflow_dispatch:', 'SOURCE_DB_URL', '20261109000000_khoi_tao_cau_truc_v4_final.sql'],
  },
  v5: {
    label: 'V5 · Sao lưu & phục hồi cấu trúc',
    file: 'Sao_luu_va_phuc_hoi_cau_truc_CSDL_V5.yml',
    path: '.github/workflows/Sao_luu_va_phuc_hoi_cau_truc_CSDL_V5.yml',
    destructive: true,
    markers: ['PHUC_HOI_V5', 'TARGET_DB_URL', 'V5_khoi_tao_cau_truc_va_phuc_hoi.sql'],
  },
  v6: {
    label: 'V6 · Sao lưu & phục hồi dữ liệu',
    file: 'Sao_luu_va_phuc_hoi_du_lieu_CSDL_V6.yml',
    path: '.github/workflows/Sao_luu_va_phuc_hoi_du_lieu_CSDL_V6.yml',
    destructive: false,
    markers: ['KIEM_TRA_LOCAL', 'BACKUP_ONLY', 'BACKUP_AND_RESTORE', 'PHUC_HOI_DATA_V6', 'V6-FULL-DATA-ENCRYPTED'],
  },
  v7: {
    label: 'V7 · Phục hồi artifact V6',
    file: 'Phuc_hoi_file_sao_luu_du_lieu_V7.yml',
    path: '.github/workflows/Phuc_hoi_file_sao_luu_du_lieu_V7.yml',
    destructive: false,
    markers: ['backup_run_id', 'KIEM_TRA_BACKUP_V7', 'PHUC_HOI_BACKUP_V7', 'V6-FULL-DATA-ENCRYPTED'],
  },
};

const GENERATED_FILES = {
  v4: 'supabase/migrations/20261109000000_khoi_tao_cau_truc_v4_final.sql',
  v5: 'supabase/backups/v5/V5_khoi_tao_cau_truc_va_phuc_hoi.sql',
};

const $ = (s) => document.querySelector(s);
let currentRun = null;
let pollTimer = null;
let pendingRun = null;
let historyCache = [];

function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
function apiHeaders(extra = {}) {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    ...extra,
  };
  if (token()) h.Authorization = `Bearer ${token()}`;
  return h;
}

async function gh(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, { ...options, headers: apiHeaders(options.headers || {}) });
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
  if (!res.ok) {
    const msg = typeof body === 'object' ? (body.message || JSON.stringify(body)) : body;
    throw new Error(`GitHub API ${res.status}: ${msg || res.statusText}`);
  }
  return body;
}

function base64ToText(base64) {
  const bin = atob(String(base64 || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function fmtDate(v) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(v));
}
function fmtDuration(start, end) {
  if (!start) return '—';
  const sec = Math.max(0, Math.floor(((end ? new Date(end) : new Date()) - new Date(start)) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}g ${m}p`;
  if (m) return `${m}p ${s}s`;
  return `${s}s`;
}
function statusText(v) {
  return ({ queued: 'Đang chờ', in_progress: 'Đang chạy', completed: 'Hoàn tất', requested: 'Đã yêu cầu', waiting: 'Đang chờ', pending: 'Đang chờ' })[v] || (v || '—');
}
function conclusionText(v) {
  return ({ success: 'Thành công', failure: 'Thất bại', cancelled: 'Đã hủy', skipped: 'Bỏ qua', timed_out: 'Quá thời gian', action_required: 'Cần thao tác', neutral: 'Trung lập', stale: 'Hết hiệu lực' })[v] || (v || '—');
}
function versionFromRun(run) {
  const path = run.path || '';
  const found = Object.entries(WORKFLOWS).find(([, w]) => path.endsWith(w.file));
  return found ? found[0] : null;
}
function toast(message, type = '') {
  const n = document.createElement('div');
  n.className = `toast ${type}`;
  n.textContent = message;
  $('#toastHost').appendChild(n);
  setTimeout(() => n.remove(), 5200);
}
function setMessage(message, type = 'ok') {
  const e = $('#connectionMessage');
  if (!message) { e.className = 'message hidden'; return; }
  e.textContent = message;
  e.className = `message ${type}`;
}
function setConnected(ok) {
  const badge = $('#connectionBadge');
  badge.textContent = ok ? 'Đã kết nối' : 'Chưa kết nối';
  badge.className = `badge ${ok ? 'ok' : 'muted'}`;
  document.querySelectorAll('.run-mode,.download-generated,#checkWorkflowsBtn,#loadBackupsBtn').forEach((b) => { b.disabled = !ok; });
  $('#refreshBtn').disabled = !ok;
  if (!ok) {
    ['V4', 'V5', 'V6', 'V7'].forEach((v) => { const e = $(`#health${v}`); e.textContent = '—'; e.className = 'health-dot pending'; });
    $('#workflowHealthText').textContent = 'Chưa kiểm tra.';
  }
}

async function connect() {
  const entered = $('#tokenInput').value.trim();
  if (entered) sessionStorage.setItem(TOKEN_KEY, entered);
  if (!token()) { setConnected(false); setMessage('Chưa có token GitHub.', 'err'); return; }
  try {
    const repo = await gh('');
    if (repo.full_name !== `${OWNER}/${WORK_REPO}`) throw new Error('Repository trả về không đúng cấu hình.');
    $('#tokenInput').value = '';
    setConnected(true);
    setMessage(`Kết nối thành công tới ${repo.full_name}. Token chỉ tồn tại trong tab hiện tại.`, 'ok');
    await checkWorkflows();
    await Promise.all([refreshHistory(), loadV6Backups()]);
  } catch (e) {
    sessionStorage.removeItem(TOKEN_KEY);
    setConnected(false);
    setMessage(e.message, 'err');
    toast(e.message, 'err');
  }
}

function disconnect() {
  sessionStorage.removeItem(TOKEN_KEY);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  currentRun = null;
  historyCache = [];
  setConnected(false);
  setMessage('Đã xóa token khỏi phiên tab hiện tại.', 'ok');
  resetRunView();
  $('#historyBody').innerHTML = '<tr><td colspan="7" class="empty">Kết nối GitHub để xem lịch sử.</td></tr>';
  $('#v7Backup').innerHTML = '<option value="">Kết nối để nạp danh sách…</option>';
}

async function checkWorkflows() {
  if (!token()) return;
  let ok = 0;
  for (const [key, w] of Object.entries(WORKFLOWS)) {
    const e = $(`#health${key.toUpperCase()}`);
    try {
      const data = await gh(`/actions/workflows/${encodeURIComponent(w.file)}`);
      const active = data.state === 'active';
      const encodedPath = w.path.split('/').map(encodeURIComponent).join('/');
      const fileData = await gh(`/contents/${encodedPath}?ref=${encodeURIComponent(BRANCH)}`);
      const workflowText = fileData.content ? base64ToText(fileData.content) : '';
      const compatible = active && w.markers.every((m) => workflowText.includes(m));
      e.textContent = compatible ? 'Sẵn sàng' : (active ? 'Cần cập nhật web' : (data.state || 'Không hoạt động'));
      e.className = `health-dot ${compatible ? 'ok' : 'bad'}`;
      if (compatible) ok++;
    } catch {
      e.textContent = 'Không tìm thấy';
      e.className = 'health-dot bad';
    }
  }
  $('#workflowHealthText').textContent = ok === 4 ? '4/4 workflow đang sẵn sàng trên nhánh main.' : `${ok}/4 workflow sẵn sàng. Không nên chạy khi chưa đủ 4/4.`;
}

function updateV6UI() {
  const mode = $('#v6Mode').value;
  const restore = mode === 'BACKUP_AND_RESTORE';
  $('#v6ConfirmWrap').classList.toggle('hidden', !restore);
  $('#v6Risk').textContent = restore ? 'Ghi TARGET' : 'Không ghi TARGET';
  $('#v6Risk').className = `risk ${restore ? 'danger-risk' : 'safe-risk'}`;
  const hints = {
    KIEM_TRA_LOCAL: 'Không cần mã xác nhận, không tạo artifact và không cần mật khẩu mã hóa.',
    BACKUP_ONLY: 'Tạo artifact V6-FULL-DATA-ENCRYPTED. Cần BACKUP_ENCRYPTION_PASSWORD tối thiểu 20 ký tự trong Actions Secrets.',
    BACKUP_AND_RESTORE: 'Tạo artifact mã hóa rồi ghi dữ liệu vào TARGET. TARGET phải có cấu trúc phù hợp và các bảng phục hồi phải đang trống.',
  };
  $('#v6ModeHint').textContent = hints[mode];
}
function updateV7UI() {
  const restore = $('#v7Mode').value === 'PHUC_HOI_TARGET';
  $('#v7ConfirmWrap').classList.toggle('hidden', !restore);
  $('#v7Risk').textContent = restore ? 'Ghi TARGET' : 'Không ghi TARGET';
  $('#v7Risk').className = `risk ${restore ? 'danger-risk' : 'safe-risk'}`;
  $('#v7ModeHint').innerHTML = restore
    ? 'Luôn kiểm tra file và phục hồi thử local trước. TARGET phải mới/trống hoặc có application schema đầy đủ và các bảng dữ liệu phải trống.'
    : 'Chế độ kiểm tra local sẽ tự dùng mã an toàn <code>KIEM_TRA_BACKUP_V7</code>.';
}

function buildRunRequest(key) {
  if (key === 'v4') return { key, inputs: {}, destructive: false, description: 'Tạo lại file SQL schema-only V4 từ SOURCE và commit file kết quả vào repository.' };
  if (key === 'v5') {
    const code = $('#v5Confirm').value.trim();
    if (code !== 'PHUC_HOI_V5') throw new Error('V5 yêu cầu nhập chính xác PHUC_HOI_V5.');
    return { key, inputs: { xac_nhan: code }, destructive: true, description: 'V5 sẽ sao lưu + kiểm thử local rồi phục hồi CẤU TRÚC sang TARGET_DB_URL.' };
  }
  if (key === 'v6') {
    const mode = $('#v6Mode').value;
    const restore = mode === 'BACKUP_AND_RESTORE';
    const code = restore ? $('#v6Confirm').value.trim() : '';
    if (restore && code !== 'PHUC_HOI_DATA_V6') throw new Error('BACKUP_AND_RESTORE yêu cầu nhập chính xác PHUC_HOI_DATA_V6.');
    return {
      key,
      inputs: { che_do: mode, xac_nhan: code, save_encrypted_artifact: String(mode !== 'KIEM_TRA_LOCAL') },
      destructive: restore,
      description: mode === 'KIEM_TRA_LOCAL' ? 'V6 chỉ sao lưu/kiểm thử dữ liệu trên local, không tạo artifact và không ghi TARGET.' : mode === 'BACKUP_ONLY' ? 'V6 tạo gói dữ liệu mã hóa V6-FULL-DATA-ENCRYPTED, không ghi TARGET.' : 'V6 tạo gói dữ liệu mã hóa rồi phục hồi dữ liệu sang TARGET_DB_URL.',
    };
  }
  if (key === 'v7') {
    const runId = $('#v7Backup').value;
    if (!/^\d+$/.test(runId)) throw new Error('Hãy chọn một bản sao V6 hợp lệ.');
    const mode = $('#v7Mode').value;
    const restore = mode === 'PHUC_HOI_TARGET';
    const code = restore ? $('#v7Confirm').value.trim() : 'KIEM_TRA_BACKUP_V7';
    if (restore && code !== 'PHUC_HOI_BACKUP_V7') throw new Error('PHUC_HOI_TARGET yêu cầu nhập chính xác PHUC_HOI_BACKUP_V7.');
    return {
      key,
      inputs: { backup_run_id: runId, che_do: mode, xac_nhan: code },
      destructive: restore,
      description: restore ? `V7 sẽ kiểm tra artifact V6 Run ID ${runId}, phục hồi thử local rồi ghi dữ liệu vào TARGET.` : `V7 chỉ kiểm tra/giải mã artifact V6 Run ID ${runId} và phục hồi thử local; không ghi TARGET.`,
    };
  }
  throw new Error('Chế độ không hợp lệ.');
}

function askRun(key) {
  if (!token()) { toast('Hãy kết nối GitHub trước.', 'err'); return; }
  try {
    const req = buildRunRequest(key);
    pendingRun = req;
    $('#dialogTitle').textContent = `Xác nhận chạy ${key.toUpperCase()}`;
    $('#dialogText').textContent = req.description;
    const warn = $('#dialogWarning');
    const ackWrap = $('#dangerAckWrap');
    const ack = $('#dangerAck');
    ack.checked = false;
    if (req.destructive) {
      warn.textContent = 'Đây là thao tác có thể ghi vào TARGET_DB_URL. Nếu SOURCE/TARGET bị đảo hoặc TARGET không đúng trạng thái yêu cầu, hãy hủy ngay.';
      warn.classList.remove('hidden');
      ackWrap.classList.remove('hidden');
      $('#dialogConfirmBtn').className = 'btn danger';
      $('#dialogConfirmBtn').disabled = true;
      $('#dialogIcon').textContent = '!';
    } else {
      warn.classList.add('hidden');
      ackWrap.classList.add('hidden');
      $('#dialogConfirmBtn').className = 'btn primary';
      $('#dialogConfirmBtn').disabled = false;
      $('#dialogIcon').textContent = '✓';
    }
    $('#confirmDialog').showModal();
  } catch (e) { toast(e.message, 'err'); }
}

async function dispatch(req) {
  const w = WORKFLOWS[req.key];
  const stamp = Date.now();
  $('#runHint').textContent = `Đang gửi lệnh ${w.label}…`;
  await gh(`/actions/workflows/${encodeURIComponent(w.file)}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: BRANCH, inputs: req.inputs }),
  });
  toast(`Đã gửi lệnh ${w.label}.`, 'ok');
  $('#runHint').textContent = 'GitHub đã nhận lệnh. Đang tìm workflow run mới…';

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, i < 4 ? 1600 : 2800));
    const data = await gh(`/actions/workflows/${encodeURIComponent(w.file)}/runs?event=workflow_dispatch&per_page=6`);
    const run = (data.workflow_runs || []).find((r) => new Date(r.created_at).getTime() >= stamp - 6000);
    if (run) {
      currentRun = run;
      renderRun(run);
      startPolling();
      await refreshHistory();
      return;
    }
  }
  throw new Error('Lệnh đã được dispatch nhưng chưa tìm thấy run mới. Bấm Làm mới để kiểm tra lại.');
}

function resetRunView() {
  $('#runHint').textContent = 'Chưa có workflow nào được chạy trong phiên này.';
  ['#runWorkflow', '#runStatus', '#runConclusion', '#runStarted', '#runDuration', '#runId'].forEach((s) => { $(s).textContent = '—'; });
  $('#progressBar').className = 'progress-bar'; $('#progressBar').style.width = '0';
  ['#cancelRunBtn', '#logsBtn', '#artifactsBtn'].forEach((s) => { $(s).disabled = true; });
  $('#artifactList').classList.add('hidden');
}
function renderRun(run) {
  const version = versionFromRun(run);
  $('#runWorkflow').textContent = version ? WORKFLOWS[version].label : (run.name || run.path || '—');
  $('#runStatus').textContent = statusText(run.status);
  $('#runConclusion').textContent = conclusionText(run.conclusion);
  $('#runStarted').textContent = fmtDate(run.run_started_at || run.created_at);
  $('#runDuration').textContent = fmtDuration(run.run_started_at || run.created_at, run.status === 'completed' ? run.updated_at : null);
  $('#runId').textContent = String(run.id || '—');
  $('#runHint').textContent = `Run #${run.run_number || '—'} · ${run.event || 'workflow_dispatch'}`;
  const pb = $('#progressBar');
  if (run.status === 'completed') { pb.className = 'progress-bar'; pb.style.width = '100%'; }
  else { pb.className = 'progress-bar running'; pb.style.width = '68%'; }
  $('#cancelRunBtn').disabled = run.status === 'completed';
  $('#logsBtn').disabled = false;
  $('#artifactsBtn').disabled = false;
}
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!currentRun || !token()) return;
    try {
      currentRun = await gh(`/actions/runs/${currentRun.id}`);
      renderRun(currentRun);
      if (currentRun.status === 'completed') {
        clearInterval(pollTimer); pollTimer = null;
        await refreshHistory();
        if (versionFromRun(currentRun) === 'v6' && currentRun.conclusion === 'success') await loadV6Backups();
      }
    } catch (e) { console.warn(e); }
  }, 6000);
}

async function refreshHistory() {
  if (!token()) return;
  const data = await gh('/actions/runs?per_page=100');
  historyCache = (data.workflow_runs || []).filter((r) => versionFromRun(r)).slice(0, 40);
  renderHistory();
  const recent20 = historyCache.slice(0, 20);
  $('#statRunning').textContent = String(recent20.filter((r) => r.status !== 'completed').length);
  const success = recent20.find((r) => r.conclusion === 'success');
  const failure = recent20.find((r) => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(r.conclusion));
  $('#statSuccess').textContent = success ? fmtDate(success.updated_at) : '—';
  $('#statFailure').textContent = failure ? fmtDate(failure.updated_at) : '—';
  $('#statUpdated').textContent = fmtDate(new Date().toISOString());
}
function renderHistory() {
  const filter = $('#historyFilter').value;
  const runs = historyCache.filter((r) => filter === 'all' || versionFromRun(r) === filter).slice(0, 20);
  if (!runs.length) {
    $('#historyBody').innerHTML = '<tr><td colspan="7" class="empty">Chưa có lượt chạy phù hợp.</td></tr>';
    return;
  }
  $('#historyBody').innerHTML = runs.map((r) => {
    const v = versionFromRun(r);
    return `<tr><td><strong>${v.toUpperCase()}</strong></td><td>${escapeHtml(statusText(r.status))}</td><td>${escapeHtml(conclusionText(r.conclusion))}</td><td>${escapeHtml(fmtDate(r.run_started_at || r.created_at))}</td><td>${escapeHtml(fmtDuration(r.run_started_at || r.created_at, r.updated_at))}</td><td>${escapeHtml(String(r.id))}</td><td><button class="btn ghost small watch-run" data-id="${r.id}">Theo dõi</button></td></tr>`;
  }).join('');
  document.querySelectorAll('.watch-run').forEach((b) => b.addEventListener('click', () => watchRun(b.dataset.id)));
}
async function watchRun(id) {
  try {
    currentRun = await gh(`/actions/runs/${id}`);
    renderRun(currentRun);
    if (currentRun.status !== 'completed') startPolling();
    window.scrollTo({ top: document.querySelector('.run-layout').offsetTop - 20, behavior: 'smooth' });
  } catch (e) { toast(e.message, 'err'); }
}

async function loadV6Backups() {
  if (!token()) return;
  const select = $('#v7Backup');
  const old = select.value;
  select.innerHTML = '<option value="">Đang tìm artifact V6 hợp lệ…</option>';
  try {
    const data = await gh(`/actions/workflows/${encodeURIComponent(WORKFLOWS.v6.file)}/runs?event=workflow_dispatch&status=success&per_page=15`);
    const candidates = [];
    for (const run of (data.workflow_runs || [])) {
      try {
        const arts = await gh(`/actions/runs/${run.id}/artifacts?per_page=100`);
        const art = (arts.artifacts || []).find((a) => a.name === 'V6-FULL-DATA-ENCRYPTED' && !a.expired);
        if (art) candidates.push({ run, art });
      } catch (e) { console.warn('Không đọc được artifact run', run.id, e); }
      if (candidates.length >= 8) break;
    }
    if (!candidates.length) {
      select.innerHTML = '<option value="">Chưa có artifact V6 hợp lệ</option>';
      return;
    }
    select.innerHTML = '<option value="">— Chọn bản sao V6 —</option>' + candidates.map(({ run, art }) => `<option value="${run.id}">Run ${run.id} · ${escapeHtml(fmtDate(run.created_at))} · ${Math.round((art.size_in_bytes || 0) / 1024 / 1024 * 100) / 100} MB</option>`).join('');
    if (candidates.some(({ run }) => String(run.id) === old)) select.value = old;
  } catch (e) {
    select.innerHTML = '<option value="">Không nạp được danh sách</option>';
    toast(`Không nạp được backup V6: ${e.message}`, 'err');
  }
}

async function cancelCurrentRun() {
  if (!currentRun || currentRun.status === 'completed') return;
  if (!confirm(`Hủy Run ID ${currentRun.id}?`)) return;
  try {
    await gh(`/actions/runs/${currentRun.id}/cancel`, { method: 'POST' });
    toast('Đã gửi yêu cầu hủy run.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function downloadLogs() {
  if (!currentRun) return;
  try {
    const res = await fetch(`${API}/actions/runs/${currentRun.id}/logs`, { headers: apiHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveBlob(await res.blob(), `run-${currentRun.id}-logs.zip`);
  } catch (e) { toast(`Không tải được log: ${e.message}`, 'err'); }
}
async function listArtifacts() {
  if (!currentRun) return;
  try {
    const data = await gh(`/actions/runs/${currentRun.id}/artifacts?per_page=100`);
    const box = $('#artifactList');
    const arts = data.artifacts || [];
    if (!arts.length) {
      box.innerHTML = '<div class="empty">Run này không có artifact.</div>';
      box.classList.remove('hidden'); return;
    }
    box.innerHTML = arts.map((a) => `<div class="artifact-row"><div><strong>${escapeHtml(a.name)}</strong><br><small>${Math.round((a.size_in_bytes || 0) / 1024 / 1024 * 100) / 100} MB · ${a.expired ? 'đã hết hạn' : `hết hạn ${escapeHtml(fmtDate(a.expires_at))}`}</small></div><button class="btn ghost small artifact-download" data-id="${a.id}" data-name="${escapeHtml(a.name)}" ${a.expired ? 'disabled' : ''}>Tải ZIP</button></div>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.artifact-download').forEach((b) => b.addEventListener('click', () => downloadArtifact(b.dataset.id, b.dataset.name)));
  } catch (e) { toast(e.message, 'err'); }
}
async function downloadArtifact(id, name) {
  try {
    const res = await fetch(`${API}/actions/artifacts/${id}/zip`, { headers: apiHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveBlob(await res.blob(), `${name || 'artifact'}.zip`);
  } catch (e) { toast(`Không tải được artifact: ${e.message}`, 'err'); }
}
function saveBlob(blob, name) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function base64ToBlob(base64, type = 'text/plain;charset=utf-8') {
  const clean = base64.replace(/\s/g, '');
  const bin = atob(clean); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
async function downloadGenerated(kind) {
  const path = GENERATED_FILES[kind];
  try {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    let data = await gh(`/contents/${encoded}?ref=${encodeURIComponent(BRANCH)}`);
    let content = data.content;
    if (!content && data.sha) {
      const blob = await gh(`/git/blobs/${data.sha}`);
      content = blob.content;
    }
    if (!content) throw new Error('GitHub không trả nội dung file.');
    saveBlob(base64ToBlob(content, 'application/sql;charset=utf-8'), path.split('/').pop());
  } catch (e) { toast(`Không tải được file ${kind.toUpperCase()}: ${e.message}`, 'err'); }
}

async function refreshAll() {
  if (!token()) return;
  try {
    await Promise.all([refreshHistory(), checkWorkflows()]);
    if (currentRun) { currentRun = await gh(`/actions/runs/${currentRun.id}`); renderRun(currentRun); }
  } catch (e) { toast(e.message, 'err'); }
}

$('#connectBtn').addEventListener('click', connect);
$('#disconnectBtn').addEventListener('click', disconnect);
$('#refreshBtn').addEventListener('click', refreshAll);
$('#checkWorkflowsBtn').addEventListener('click', checkWorkflows);
$('#loadBackupsBtn').addEventListener('click', loadV6Backups);
$('#v6Mode').addEventListener('change', updateV6UI);
$('#v7Mode').addEventListener('change', updateV7UI);
$('#historyFilter').addEventListener('change', renderHistory);
$('#cancelRunBtn').addEventListener('click', cancelCurrentRun);
$('#logsBtn').addEventListener('click', downloadLogs);
$('#artifactsBtn').addEventListener('click', listArtifacts);
document.querySelectorAll('.run-mode').forEach((b) => b.addEventListener('click', () => askRun(b.dataset.run)));
document.querySelectorAll('.download-generated').forEach((b) => b.addEventListener('click', () => downloadGenerated(b.dataset.file)));
$('#dangerAck').addEventListener('change', () => { if (pendingRun?.destructive) $('#dialogConfirmBtn').disabled = !$('#dangerAck').checked; });
$('#confirmDialog').addEventListener('close', async () => {
  const shouldRun = $('#confirmDialog').returnValue === 'run';
  const req = pendingRun; pendingRun = null;
  if (!shouldRun || !req) return;
  try { await dispatch(req); } catch (e) { toast(e.message, 'err'); $('#runHint').textContent = e.message; }
});

updateV6UI(); updateV7UI(); resetRunView(); setConnected(Boolean(token()));
if (token()) connect();
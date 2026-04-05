/* ============================================================
 * admin.js – BNI 히어로챕터 Admin Dashboard
 * ============================================================ */

const ADMIN_EMAIL = 'admin@bnihero.kr';

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
});

/* ── Auth ───────────────────────────────────────────────────── */

async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showDashboard();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('dashboard-screen').style.display = 'none';

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const pw  = document.getElementById('login-pw').value;
    btn.disabled = true;
    btn.textContent = '로그인 중...';

    const { error } = await supabaseClient.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: pw,
    });

    if (error) {
      document.getElementById('login-error').textContent = '비밀번호가 올바르지 않습니다.';
      btn.disabled = false;
      btn.textContent = '로그인';
    } else {
      showDashboard();
    }
  });
}

function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard-screen').style.display = 'block';

  initTabs();
  loadMembersTab();
  loadScheduleTab();
  loadApplicationsTab();
  loadWpTab();
  loadSettingsTab();

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
  });
}

/* ── Tabs ───────────────────────────────────────────────────── */

function initTabs() {
  const tabs    = document.querySelectorAll('.admin-tab-btn');
  const panels  = document.querySelectorAll('.admin-tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

/* ══════════════════════════════════════════════════════════════
 * Tab 1: 멤버 관리
 * ══════════════════════════════════════════════════════════════ */

let membersCache = [];

async function loadMembersTab() {
  membersCache = await getMembers();
  renderMembersTable();

  document.getElementById('member-add-btn')?.addEventListener('click', () => openMemberModal(null));

  document.getElementById('members-tbody')?.addEventListener('click', (e) => {
    const upBtn   = e.target.closest('.btn-move-up');
    const downBtn = e.target.closest('.btn-move-down');
    const editBtn = e.target.closest('.btn-edit');
    const delBtn  = e.target.closest('.btn-delete');

    if (upBtn)   moveMember(parseInt(upBtn.dataset.idx, 10), -1);
    if (downBtn) moveMember(parseInt(downBtn.dataset.idx, 10), 1);
    if (editBtn) openMemberModal(editBtn.dataset.id);
    if (delBtn)  confirmDeleteMember(delBtn.dataset.id);
  });
}

function renderMembersTable() {
  const tbody = document.getElementById('members-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  membersCache.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(m.company_name)}</td>
      <td>${escHtml(m.specialty || '')}</td>
      <td>${m.card_image_url ? `<a href="${escHtml(m.card_image_url)}" target="_blank">보기</a>` : '-'}</td>
      <td>${m.website_url ? `<a href="${escHtml(m.website_url)}" target="_blank">링크</a>` : '-'}</td>
      <td class="order-td">
        <button class="icon-btn btn-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="위로">▲</button>
        <span>${m.sort_order}</span>
        <button class="icon-btn btn-move-down" data-idx="${idx}" ${idx === membersCache.length-1 ? 'disabled' : ''} title="아래로">▼</button>
      </td>
      <td>
        <button class="btn-sm btn-edit" data-id="${escHtml(m.id)}">수정</button>
        <button class="btn-sm btn-delete" data-id="${escHtml(m.id)}">삭제</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

async function moveMember(idx, dir) {
  const m = membersCache;
  if (idx + dir < 0 || idx + dir >= m.length) return;

  const swapIdx = idx + dir;
  const tmpOrder = m[idx].sort_order;
  m[idx].sort_order = m[swapIdx].sort_order;
  m[swapIdx].sort_order = tmpOrder;

  try {
    await updateMember(m[idx].id, { sort_order: m[idx].sort_order });
    await updateMember(m[swapIdx].id, { sort_order: m[swapIdx].sort_order });
    membersCache = await getMembers();
    renderMembersTable();
  } catch (e) {
    showToast('순서 변경 실패: ' + e.message);
  }
}

// Member Modal
let editingMemberId = null;

function openMemberModal(id) {
  editingMemberId = id;
  const modal = document.getElementById('member-modal');
  const form  = document.getElementById('member-form');
  form.reset();
  document.getElementById('member-modal-title').textContent = id ? '멤버 수정' : '멤버 추가';
  document.getElementById('member-card-preview').src = '';
  document.getElementById('member-card-preview').style.display = 'none';

  if (id) {
    const m = membersCache.find(x => x.id === id);
    if (m) {
      document.getElementById('m-company').value  = m.company_name || '';
      document.getElementById('m-specialty').value = m.specialty || '';
      document.getElementById('m-website').value  = m.website_url || '';
      document.getElementById('m-order').value    = m.sort_order || 0;
      if (m.card_image_url) {
        const prev = document.getElementById('member-card-preview');
        prev.src = m.card_image_url;
        prev.style.display = 'block';
      }
    }
  } else {
    const maxOrder = membersCache.reduce((acc, x) => Math.max(acc, x.sort_order), 0);
    document.getElementById('m-order').value = maxOrder + 1;
  }

  modal.classList.add('active');
}

function closeMemberModal() {
  document.getElementById('member-modal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('member-modal-close')?.addEventListener('click', closeMemberModal);
  document.getElementById('member-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('member-modal')) closeMemberModal();
  });

  document.getElementById('member-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const record = {
      company_name: document.getElementById('m-company').value.trim(),
      specialty:    document.getElementById('m-specialty').value.trim(),
      website_url:  document.getElementById('m-website').value.trim() || null,
      sort_order:   parseInt(document.getElementById('m-order').value, 10) || 0,
    };

    try {
      const fileInput = document.getElementById('m-card-file');
      const file = fileInput.files[0];

      if (editingMemberId) {
        if (file) {
          record.card_image_url = await uploadBusinessCard(file, editingMemberId);
        }
        await updateMember(editingMemberId, record);
      } else {
        const inserted = await insertMember(record);
        const newId = inserted[0].id;
        if (file) {
          const url = await uploadBusinessCard(file, newId);
          await updateMember(newId, { card_image_url: url });
        }
      }

      closeMemberModal();
      membersCache = await getMembers();
      renderMembersTable();
      showToast(editingMemberId ? '수정되었습니다.' : '추가되었습니다.', 'success');
    } catch (err) {
      showToast('저장 실패: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('m-card-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const prev = document.getElementById('member-card-preview');
      prev.src = ev.target.result;
      prev.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
});

async function confirmDeleteMember(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await deleteMember(id);
    membersCache = await getMembers();
    renderMembersTable();
    showToast('삭제되었습니다.', 'success');
  } catch (e) {
    showToast('삭제 실패: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════
 * Tab 2: 일정 관리
 * ══════════════════════════════════════════════════════════════ */

let adminCalYear, adminCalMonth;
let adminScheduleMap = {};

async function loadScheduleTab() {
  const now = new Date();
  adminCalYear  = now.getFullYear();
  adminCalMonth = now.getMonth() + 1;
  await renderAdminCalendar();

  document.getElementById('admin-cal-prev')?.addEventListener('click', async () => {
    adminCalMonth--;
    if (adminCalMonth < 1) { adminCalMonth = 12; adminCalYear--; }
    await renderAdminCalendar();
  });
  document.getElementById('admin-cal-next')?.addEventListener('click', async () => {
    adminCalMonth++;
    if (adminCalMonth > 12) { adminCalMonth = 1; adminCalYear++; }
    await renderAdminCalendar();
  });
}

async function renderAdminCalendar() {
  const grid  = document.getElementById('admin-cal-grid');
  const title = document.getElementById('admin-cal-title');
  if (!grid || !title) return;

  title.textContent = `${adminCalYear}년 ${adminCalMonth}월`;
  grid.innerHTML = '';

  const scheduleData = await getScheduleForMonth(adminCalYear, adminCalMonth);
  adminScheduleMap = {};
  scheduleData.forEach(s => { adminScheduleMap[s.meeting_date] = s; });

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  dayNames.forEach(d => {
    const h = document.createElement('div');
    h.className = 'admin-cal-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(adminCalYear, adminCalMonth - 1, 1).getDay();
  const daysInMonth = new Date(adminCalYear, adminCalMonth, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'admin-cal-cell blank';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    const dateObj = new Date(adminCalYear, adminCalMonth - 1, d);
    const isFriday = dateObj.getDay() === 5;
    const dateStr = `${adminCalYear}-${String(adminCalMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const entry = adminScheduleMap[dateStr];

    cell.className = 'admin-cal-cell' + (isFriday ? ' admin-friday' : '');
    cell.innerHTML = `<span class="admin-day-num">${d}</span>`;

    if (isFriday) {
      const type = entry ? entry.meeting_type : 'offline';
      const badge = document.createElement('span');
      badge.className = `cal-badge cal-badge-${type}`;
      badge.textContent = type === 'offline' ? '조찬회의' : type === 'online' ? '화상회의' : '회의없음';
      cell.appendChild(badge);
      cell.title = '클릭하여 수정';
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => openScheduleEdit(dateStr, entry));
    }

    grid.appendChild(cell);
  }
}

function openScheduleEdit(dateStr, entry) {
  const modal = document.getElementById('schedule-modal');
  document.getElementById('sched-date-display').textContent = dateStr;
  document.getElementById('sched-date-val').value = dateStr;
  document.getElementById('sched-type').value = entry ? entry.meeting_type : 'offline';
  document.getElementById('sched-note').value  = entry ? (entry.note || '') : '';
  document.getElementById('sched-id').value    = entry ? entry.id : '';
  modal.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('schedule-modal-close')?.addEventListener('click', () => {
    document.getElementById('schedule-modal').classList.remove('active');
  });

  document.getElementById('schedule-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('schedule-modal'))
      document.getElementById('schedule-modal').classList.remove('active');
  });

  document.getElementById('schedule-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const dateStr = document.getElementById('sched-date-val').value;
    const type    = document.getElementById('sched-type').value;
    const note    = document.getElementById('sched-note').value.trim();
    const existId = document.getElementById('sched-id').value;

    try {
      const record = { meeting_date: dateStr, meeting_type: type, note: note || null };
      if (existId) record.id = existId;
      await upsertSchedule(record);
      document.getElementById('schedule-modal').classList.remove('active');
      await renderAdminCalendar();
    } catch (err) {
      showToast('저장 실패: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });
});

/* ══════════════════════════════════════════════════════════════
 * Tab 3: 신청 목록
 * ══════════════════════════════════════════════════════════════ */

const APPS_PER_PAGE = 15;
let appsCurrentPage = 0;
let appsTotalCount  = 0;

async function loadApplicationsTab() {
  appsCurrentPage = 0;
  await fetchAndRenderApps();

  const tbody = document.getElementById('applications-tbody');

  // 상태 토글 — 배지 클릭
  tbody?.addEventListener('click', async (e) => {
    const badge = e.target.closest('.app-badge-toggle');
    if (!badge) return;
    const id = badge.dataset.id;
    const current = badge.dataset.confirmed === 'true';
    await setAppStatus(id, !current);
  });

  // ... 버튼 드롭다운 토글
  tbody?.addEventListener('click', (e) => {
    const moreBtn = e.target.closest('.app-more-btn');
    if (moreBtn) {
      e.stopPropagation();
      const menu = moreBtn.nextElementSibling;
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.app-more-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) {
        const rect = moreBtn.getBoundingClientRect();
        menu.style.top  = (rect.bottom + 4) + 'px';
        menu.style.left = (rect.right - 100) + 'px';
        menu.classList.add('open');
      }
      return;
    }
    // 삭제 클릭
    const delBtn = e.target.closest('.app-more-delete');
    if (delBtn) {
      const id = delBtn.dataset.id;
      if (confirm('이 신청을 삭제하시겠습니까? 복구할 수 없습니다.')) {
        deleteApplication(id).then(() => { fetchAndRenderApps(); showToast('삭제되었습니다.', 'success'); }).catch(err => showToast('삭제 실패: ' + err.message));
      }
      document.querySelectorAll('.app-more-menu.open').forEach(m => m.classList.remove('open'));
    }
  });

  // 외부 클릭 시 드롭다운 닫기
  document.addEventListener('click', () => {
    document.querySelectorAll('.app-more-menu.open').forEach(m => m.classList.remove('open'));
  });

  // 비고 자동저장 — blur 시
  tbody?.addEventListener('blur', async (e) => {
    const input = e.target.closest('.app-note-input');
    if (!input) return;
    try {
      await updateApplication(input.dataset.id, { memo: input.value.trim() });
    } catch (err) {
      showToast('메모 저장 실패: ' + err.message);
    }
  }, true);

  document.getElementById('apps-prev')?.addEventListener('click', async () => {
    if (appsCurrentPage <= 0) return;
    appsCurrentPage--;
    await fetchAndRenderApps();
  });
  document.getElementById('apps-next')?.addEventListener('click', async () => {
    if ((appsCurrentPage + 1) * APPS_PER_PAGE >= appsTotalCount) return;
    appsCurrentPage++;
    await fetchAndRenderApps();
  });
}

async function fetchAndRenderApps() {
  const { data, count } = await getApplications(appsCurrentPage, APPS_PER_PAGE);
  appsTotalCount = count;
  renderApplicationsTable(data);
  renderAppsPagination();
}

function renderApplicationsTable(apps) {
  const tbody = document.getElementById('applications-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (apps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#888;">신청 내역이 없습니다.</td></tr>';
    return;
  }

  apps.forEach(a => {
    const tr = document.createElement('tr');
    const createdDate = a.created_at ? a.created_at.slice(0, 10) : '-';
    const visitDate   = a.visit_date || '-';
    const confirmed   = !!a.confirmed;

    tr.innerHTML = `
      <td>${createdDate}</td>
      <td>${escHtml(a.company_name || '')}</td>
      <td>${escHtml(a.name || '')}</td>
      <td>${escHtml(a.position || '')}</td>
      <td>${escHtml(a.phone || '')}</td>
      <td>${visitDate}</td>
      <td>
        <span class="app-badge ${confirmed ? 'app-badge-confirmed' : 'app-badge-pending'} app-badge-toggle"
              data-id="${a.id}" data-confirmed="${confirmed}" title="클릭하여 상태 변경">
          ${confirmed ? '확인됨' : '대기중'}
        </span>
      </td>
      <td>
        <input type="text" class="app-note-input" data-id="${a.id}"
               value="${escHtml(a.memo || '')}" placeholder="내부 메모" />
      </td>
      <td class="app-more-cell">
        <div class="app-more-wrap">
          <button class="app-more-btn" data-id="${a.id}" title="더보기" aria-label="더보기">⋯</button>
          <div class="app-more-menu">
            <button class="app-more-menu-item app-more-delete" data-id="${a.id}">🗑 삭제</button>
          </div>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function renderAppsPagination() {
  const totalPages = Math.max(1, Math.ceil(appsTotalCount / APPS_PER_PAGE));
  const info = document.getElementById('apps-page-info');
  const prev = document.getElementById('apps-prev');
  const next = document.getElementById('apps-next');
  if (info) info.textContent = `${appsCurrentPage + 1} / ${totalPages} 페이지 (총 ${appsTotalCount}건)`;
  if (prev) prev.disabled = appsCurrentPage <= 0;
  if (next) next.disabled = (appsCurrentPage + 1) * APPS_PER_PAGE >= appsTotalCount;
}

async function setAppStatus(id, confirmed) {
  try {
    await updateApplication(id, { confirmed });
    await fetchAndRenderApps();
    showToast(confirmed ? '확인 처리되었습니다.' : '대기 상태로 변경되었습니다.', 'success');
  } catch (e) {
    showToast('업데이트 실패: ' + e.message);
  }
}


/* ══════════════════════════════════════════════════════════════
 * Tab: WP 취합
 * ══════════════════════════════════════════════════════════════ */

let wpCurrentWeek = null;
let wpAutoPurgeDone = false;

async function loadWpTab() {
  const select = document.getElementById('wp-week-select');
  const refreshBtn = document.getElementById('wp-refresh-btn');
  const zipBtn = document.getElementById('wp-download-zip');
  const purgeBtn = document.getElementById('wp-purge-week');
  if (!select) return;

  // 2주 이상 지난 주차 자동 삭제 (세션당 1회)
  if (!wpAutoPurgeDone) {
    wpAutoPurgeDone = true;
    try {
      const res = await autoPurgeOldWp();
      if (res.totalDeleted > 0) {
        showToast(`오래된 주차 ${res.purgedWeeks.length}개 자동 정리됨 (${res.totalDeleted}개 파일)`, 'info');
      }
    } catch (e) { console.warn('autoPurge:', e); }
  }

  // 주차 드롭다운 구성
  await populateWpWeekSelect();

  select.addEventListener('change', async () => {
    wpCurrentWeek = select.value;
    await renderWpTable();
  });

  refreshBtn?.addEventListener('click', async () => {
    await populateWpWeekSelect();
    await renderWpTable();
    await renderWpUsage();
  });

  zipBtn?.addEventListener('click', async () => {
    await downloadWpZip();
  });

  purgeBtn?.addEventListener('click', async () => {
    if (!wpCurrentWeek) { showToast('주차를 선택해주세요.'); return; }
    if (!confirm(`${wpCurrentWeek} 주차의 모든 제출 자료를 삭제합니다.\n계속하시겠습니까?\n(되돌릴 수 없음)`)) return;
    purgeBtn.disabled = true;
    try {
      const res = await deleteWpWeek(wpCurrentWeek);
      showToast(`${res.deleted}개 파일 삭제 완료`, 'success');
      await populateWpWeekSelect();
      await renderWpTable();
      await renderWpUsage();
    } catch (err) {
      showToast('삭제 실패: ' + err.message);
    } finally {
      purgeBtn.disabled = false;
    }
  });

  document.getElementById('wp-tbody')?.addEventListener('click', async (e) => {
    const dlBtn = e.target.closest('.wp-download-btn');
    const delBtn = e.target.closest('.wp-delete-btn');
    if (dlBtn) {
      await downloadSingleWp(dlBtn.dataset.path, dlBtn.dataset.filename);
    }
    if (delBtn) {
      if (!confirm(`${delBtn.dataset.company} 제출을 삭제하시겠습니까?`)) return;
      try {
        await deleteWpSubmission(delBtn.dataset.id, delBtn.dataset.path);
        showToast('삭제되었습니다.', 'success');
        await renderWpTable();
        await renderWpUsage();
      } catch (err) {
        showToast('삭제 실패: ' + err.message);
      }
    }
  });

  // 탭 재진입 시 자동 새로고침
  document.querySelector('[data-tab="tab-wp"]')?.addEventListener('click', async () => {
    await populateWpWeekSelect();
    await renderWpTable();
    await renderWpUsage();
  });

  // 초기 렌더
  if (wpCurrentWeek) await renderWpTable();
  await renderWpUsage();
}

async function renderWpUsage() {
  const textEl = document.getElementById('wp-usage-text');
  const pctEl = document.getElementById('wp-usage-pct');
  const barEl = document.getElementById('wp-usage-bar');
  if (!textEl) return;
  try {
    const { totalBytes } = await getWpStorageUsage();
    const LIMIT = 1024 * 1024 * 1024; // 1GB
    const pct = Math.min(100, (totalBytes / LIMIT) * 100);
    textEl.textContent = `(${formatFileSize(totalBytes)} / 1 GB)`;
    pctEl.textContent = pct.toFixed(1) + '%';
    barEl.style.width = pct + '%';
    // 색상: <70 녹색, 70~90 주황, >90 빨강
    let color = '#2a7a4b';
    if (pct >= 90) color = '#b91c1c';
    else if (pct >= 70) color = '#d97706';
    barEl.style.background = color;
    pctEl.style.color = color;
  } catch (e) {
    textEl.textContent = '(조회 실패)';
    console.error(e);
  }
}

async function populateWpWeekSelect() {
  const select = document.getElementById('wp-week-select');
  const prevValue = select.value;
  select.innerHTML = '';

  // 다음 오프라인 회의일 (실패 시 다음 금요일 폴백)
  let nextMeeting = null;
  try { nextMeeting = await getNextOfflineMeeting(); } catch(e) {}
  if (!nextMeeting) nextMeeting = getNextFriday();

  const pastWeeks = await getWpWeekDates();
  const all = Array.from(new Set([nextMeeting, ...pastWeeks])).sort((a, b) => b.localeCompare(a));
  const DOW = ['일','월','화','수','목','금','토'];

  all.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w;
    const d = new Date(w + 'T00:00:00');
    const label = `${w} (${d.getMonth()+1}/${d.getDate()} ${DOW[d.getDay()]})`;
    opt.textContent = w === nextMeeting ? label + ' · 다가오는 회의' : label;
    select.appendChild(opt);
  });

  // 이전 선택 유지, 없으면 기본값 = 다가오는 회의
  if (prevValue && all.includes(prevValue)) {
    select.value = prevValue;
  } else {
    select.value = nextMeeting;
  }
  // wpCurrentWeek 동기화 (select.value 변경은 change 이벤트 trigger 안 함)
  wpCurrentWeek = select.value;
}

async function renderWpTable() {
  const tbody = document.getElementById('wp-tbody');
  if (!tbody || !wpCurrentWeek) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#aaa;">불러오는 중…</td></tr>';

  try {
    const subs = await getWpSubmissions(wpCurrentWeek);
    if (subs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#888;">제출된 자료가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    subs.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><strong>${escHtml(s.company_name)}</strong></td>
        <td>${escHtml(s.file_name || '-')}</td>
        <td>${formatFileSize(s.file_size)}</td>
        <td>${formatWpTime(s.created_at)}</td>
        <td>
          <button class="btn-sm wp-download-btn"
                  data-path="${escHtml(s.file_path)}"
                  data-filename="${escHtml(s.file_name || s.company_name + '.pptx')}">다운로드</button>
          <button class="btn-sm wp-delete-btn"
                  data-id="${escHtml(s.id)}"
                  data-path="${escHtml(s.file_path)}"
                  data-company="${escHtml(s.company_name)}">삭제</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#b91c1c;">오류: ${escHtml(err.message)}</td></tr>`;
  }
}

async function downloadSingleWp(path, filename) {
  try {
    const blob = await downloadWpBlob(path);
    triggerDownload(blob, filename);
  } catch (err) {
    showToast('다운로드 실패: ' + err.message);
  }
}

async function downloadWpZip() {
  if (!wpCurrentWeek) { showToast('주차를 선택해주세요.'); return; }
  const btn = document.getElementById('wp-download-zip');
  const origText = btn.textContent;
  btn.disabled = true;

  try {
    const subs = await getWpSubmissions(wpCurrentWeek);
    if (subs.length === 0) { showToast('제출된 자료가 없습니다.', 'info'); btn.disabled = false; btn.textContent = origText; return; }

    const zip = new JSZip();
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      btn.textContent = `다운로드 중... ${i+1}/${subs.length}`;
      const blob = await downloadWpBlob(s.file_path);
      const ext = (s.file_name && s.file_name.split('.').pop()) || 'pptx';
      // zip 내부 파일명: 순번_회사명.pptx (발표 순서 확인 편의)
      const safeCompany = s.company_name.replace(/[\/\\?%*:|"<>]/g, '_');
      const zipName = `${String(i+1).padStart(2,'0')}_${safeCompany}.${ext}`;
      zip.file(zipName, blob);
    }

    btn.textContent = 'ZIP 생성 중...';
    const content = await zip.generateAsync({ type: 'blob' }, (meta) => {
      btn.textContent = `ZIP 생성 중... ${Math.round(meta.percent)}%`;
    });
    triggerDownload(content, `WP_${wpCurrentWeek}.zip`);
    showToast(`${subs.length}개 파일 ZIP 다운로드 완료. 취합 끝나면 [이 주차 전체 삭제] 눌러주세요.`, 'success');
  } catch (err) {
    showToast('ZIP 다운로드 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';
  return (bytes/1024/1024).toFixed(1) + 'MB';
}

function formatWpTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}


/* ══════════════════════════════════════════════════════════════
 * Tab 4: 사이트 설정
 * ══════════════════════════════════════════════════════════════ */

async function loadSettingsTab() {
  const settings = await getSettings();

  const fields = ['referral_count', 'visitor_count', 'business_amount',
                  'contact_phone', 'contact_email', 'contact_kakao', 'contact_instagram'];

  fields.forEach(key => {
    const el = document.getElementById(`setting-${key.replace(/_/g,'-')}`);
    if (el && settings[key] !== undefined) el.value = settings[key];
  });

  document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      for (const key of fields) {
        const el = document.getElementById(`setting-${key.replace(/_/g,'-')}`);
        if (el) await upsertSetting(key, el.value.trim());
      }
      showAdminMsg('settings-msg', 'success', '설정이 저장되었습니다.');
    } catch (err) {
      showAdminMsg('settings-msg', 'error', '저장 실패: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '저장하기';
    }
  });
}

function showAdminMsg(elId, type, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `admin-msg admin-msg-${type}`;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

/* ── Utility ────────────────────────────────────────────────── */

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Toast ──────────────────────────────────────────────────── */

function showToast(msg, type = 'error') {
  let wrap = document.getElementById('admin-toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'admin-toast-wrap';
    wrap.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(wrap);
  }

  const toast = document.createElement('div');
  const bg = type === 'success' ? '#2a7a4b' : type === 'info' ? '#2D2B6F' : '#b91c1c';
  toast.style.cssText = `background:${bg};color:#fff;padding:12px 18px;border-radius:8px;font-size:0.92rem;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:320px;line-height:1.5;opacity:0;transition:opacity 0.2s;`;
  toast.textContent = msg;
  wrap.appendChild(toast);

  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

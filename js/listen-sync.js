/* ============================================================
 * listen-sync.js – 경청표 엑셀로 멤버 명단 맞추기 (Admin 멤버 관리 탭)
 *
 * 흐름: 파일 고르기 → 뒷면 회원 명단 읽기 → 지금 명단과 비교 표시
 *       → [반영] 누르면 직전 명단 보관(settings.members_backup + JSON 다운로드) 후 반영
 *
 * 규칙 (바꾸지 말 것)
 * - 회사명(company_name)은 기존 값 유지. wp_submissions 가 회사명 문자열로 물려 있어
 *   이름을 바꾸면 지난 위클리 제출 기록과 끊긴다. 신입만 경청표 표기 그대로 넣는다.
 * - 경청표에 없는 멤버는 자동 삭제 금지. "빼기" 체크한 것만 삭제, 나머지는 맨 뒤로.
 * - 전문분야는 경청표가 기준(11/21 사장님 확정): 다르면 기본 체크, 체크 해제한 것만 유지. 띄어쓰기 차이는 무시.
 * - 순서(sort_order) = 경청표 No.  (메인 카드·weekly 드롭다운·WP 취합/ZIP 순서 공용)
 * - 칸 위치는 제목 줄(No. / 회사명 / 전문분야)을 찾아서 정한다. 못 찾으면 반영하지 않고 멈춘다.
 *
 * admin.js 의 전역(membersCache, renderMembersTable, getMembers, showToast,
 * escHtml, triggerDownload)과 supabase-client.js 함수를 그대로 쓴다.
 * ============================================================ */

(function () {
  const BACKUP_KEY = 'members_backup';
  const BACKUP_COLS = 'id,company_name,specialty,card_image_url,website_url,sort_order,created_at';
  let plan = null;           // 비교 결과
  let sheetFileName = '';

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', () => {
    $('ls-file')?.addEventListener('change', onFilePicked);
    $('ls-cancel-btn')?.addEventListener('click', resetView);
    $('ls-apply-btn')?.addEventListener('click', applyPlan);
    $('ls-restore-btn')?.addEventListener('click', restoreBackup);
    refreshBackupInfo();
  });

  /* ── 이름 정규화 ───────────────────────────────────────── */
  function normCompany(s) {
    return String(s || '')
      .replace(/\s+/g, '')
      .replace(/^(주식회사|유한회사|\(주\)|㈜|\(유\))+/, '')
      .replace(/(주식회사|유한회사|\(주\)|㈜|\(유\))+$/, '')
      .toLowerCase();
  }
  function normSpec(s) {
    return String(s || '').replace(/\s+/g, '');
  }
  function clean(v) {
    return v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  }

  // getMembers()는 오류 때 빈 배열을 돌려준다. 여기서는 오류면 멈춘다.
  async function fetchMembersStrict() {
    const { data, error } = await supabaseClient.from('members').select('*').order('sort_order', { ascending: true });
    if (error) throw new Error('지금 명단을 불러오지 못했습니다. 새로고침 후 다시 올려 주세요. (' + error.message + ')');
    if (!data || !data.length) throw new Error('지금 명단이 비어 있게 읽혔습니다. 새로고침 후 다시 올려 주세요.');
    return data;
  }

  async function readBackup() {
    const { data, error } = await supabaseClient.from('settings').select('value').eq('key', BACKUP_KEY).maybeSingle();
    if (error) throw new Error('보관된 명단을 확인하지 못했습니다. (' + error.message + ')');
    return data && data.value ? JSON.parse(data.value) : null;
  }

  // 작업 뒤 목록 새로 그리기. 조회가 실패하면 0명으로 지우지 않고 새로고침을 안내한다.
  async function reloadMembersTable() {
    try {
      membersCache = await fetchMembersStrict();
      renderMembersTable();
    } catch (_) {
      showToast('작업은 끝났지만 목록을 다시 불러오지 못했습니다. 새로고침해 주세요.');
    }
  }

  /* ── 화면 상태 ─────────────────────────────────────────── */
  function showError(msg) {
    const el = $('ls-error');
    el.textContent = msg;
    el.hidden = false;
    $('ls-result').hidden = true;
  }
  function resetView() {
    plan = null;
    $('ls-file').value = '';
    $('ls-file-name').textContent = '선택한 파일 없음';
    $('ls-error').hidden = true;
    $('ls-result').hidden = true;
  }

  async function refreshBackupInfo() {
    try {
      const b = await readBackup();
      if (!b) { $('ls-restore-btn').hidden = true; $('ls-backup-info').hidden = true; return; }
      $('ls-backup-info').hidden = false;
      $('ls-restore-btn').hidden = b.status === 'restored';
      const st = b.status === 'applying' ? ' · ⚠ 반영이 끝까지 되지 않았습니다. 되돌리기를 먼저 눌러 주세요.'
               : b.status === 'restored' ? ` · ${fmtTime(b.restoredAt)}에 되돌림` : '';
      $('ls-backup-info').textContent =
        `마지막 반영: ${fmtTime(b.at)} · ${b.sheet || '경청표'} · 반영 직전 ${b.rows.length}명 보관${st}`;
    } catch (_) { /* 보관본이 없거나 읽기 실패: 버튼만 숨김 */ }
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ── 1) 파일 읽기 ──────────────────────────────────────── */
  async function onFilePicked(e) {
    const file = e.target.files[0];
    if (!file) return;
    sheetFileName = file.name;
    $('ls-file-name').textContent = file.name;
    $('ls-error').hidden = true;

    if (typeof XLSX === 'undefined') {
      showError('엑셀을 읽는 도구를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const roster = readRoster(wb);
      const members = await fetchMembersStrict();
      membersCache = members;
      plan = buildPlan(roster, members);
      renderPlan();
    } catch (err) {
      showError(err.message || String(err));
    }
  }

  // 뒷면에서 제목 줄(No. / 회사명 / 전문분야)을 찾아 그 아래 번호 있는 줄만 읽는다.
  function readRoster(wb) {
    const ordered = wb.SheetNames.filter(n => n.replace(/\s+/g, '') === '뒷면');
    if (!ordered.length) throw new Error("양식이 달라 읽지 못했습니다. 엑셀에 '뒷면' 시트가 없습니다.");

    for (const name of ordered) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
      let h = -1, noCol = -1, compCol = -1, specCol = -1, nameCol = -1;
      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const r = rows[i].map(c => clean(c));
        const c = r.findIndex(x => x === '회사명');
        const s = r.findIndex(x => x.includes('전문분야'));
        const n = r.findIndex(x => /^no\.?$/i.test(x));
        if (c >= 0 && s >= 0 && n >= 0) {
          h = i; compCol = c; specCol = s; noCol = n;
          nameCol = r.findIndex(x => x === '성명');
          break;
        }
      }
      if (h < 0) continue;

      const list = [], bad = [];
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i];
        const noTxt = clean(r[noCol]);
        const no = typeof r[noCol] === 'number' ? r[noCol] : (/^\d+\.?$/.test(noTxt) ? parseInt(noTxt, 10) : NaN);
        const company = clean(r[compCol]);
        if (!company && !Number.isInteger(no)) continue;            // 빈 줄·그룹 제목 줄(1그룹 …)
        if (!company) continue;                                    // 번호만 있고 회사가 빈 칸(빈 자리)
        if (!Number.isInteger(no) || no < 1) { bad.push(`${i + 1}번째 줄 '${company}' (번호: ${noTxt || '없음'})`); continue; }
        list.push({ no, company, specialty: clean(r[specCol]), person: nameCol >= 0 ? clean(r[nameCol]) : '' });
      }
      if (bad.length) {
        throw new Error('번호를 읽지 못한 회원이 있어 멈췄습니다. 경청표 No. 칸을 숫자로 고친 뒤 다시 올려 주세요: ' + bad.join(', '));
      }

      if (list.length < 10) {
        throw new Error(`양식이 달라 읽지 못했습니다. '${name}' 시트에서 회원이 ${list.length}명만 읽혔습니다. 뒷면 칸 위치(No. · 성명 · 회사명 · 전문분야)를 확인해 주세요.`);
      }
      const seenNo = new Set(), seenCo = new Map();
      for (const x of list) {
        if (seenNo.has(x.no)) throw new Error(`경청표에 ${x.no}번이 두 번 있습니다. 번호를 고친 뒤 다시 올려 주세요.`);
        seenNo.add(x.no);
        const k = normCompany(x.company);
        if (seenCo.has(k)) throw new Error(`경청표에 같은 회사가 두 번 있습니다: ${seenCo.get(k)} / ${x.company}`);
        seenCo.set(k, x.company);
      }
      list.sort((a, b) => a.no - b.no);
      const gaps = [];
      for (let n = 1; n <= list[list.length - 1].no; n++) if (!seenNo.has(n)) gaps.push(n);
      return { sheet: name, list, gaps };
    }
    throw new Error("양식이 달라 읽지 못했습니다. '뒷면' 시트에서 'No. / 회사명 / 전문분야' 제목 줄을 찾지 못했습니다.");
  }

  /* ── 2) 비교 ───────────────────────────────────────────── */
  function buildPlan(roster, members) {
    const byKey = new Map();
    members.forEach(m => {
      const k = normCompany(m.company_name);
      if (byKey.has(k)) throw new Error(`지금 명단에 비슷한 이름이 두 개 있어 구분할 수 없습니다: ${byKey.get(k).company_name} / ${m.company_name}. 브이디렉터스에 알려 주세요.`);
      byKey.set(k, m);
    });
    const used = new Set();
    const rows = [];

    for (const x of roster.list) {
      const m = byKey.get(normCompany(x.company));
      if (m && !used.has(m.id)) {
        used.add(m.id);
        const specChanged = !!x.specialty && normSpec(x.specialty) !== normSpec(m.specialty);
        const orderChanged = m.sort_order !== x.no;
        rows.push({
          kind: specChanged ? 'spec' : (orderChanged ? 'order' : 'same'),
          member: m, sheet: x, newOrder: x.no,
          specChanged, orderChanged, checked: specChanged,
        });
      } else {
        rows.push({ kind: 'new', member: null, sheet: x, newOrder: x.no, checked: true });
      }
    }

    const maxNo = roster.list[roster.list.length - 1].no;
    let tail = maxNo;
    members.filter(m => !used.has(m.id)).forEach(m => {
      tail += 1;
      rows.push({ kind: 'out', member: m, sheet: null, newOrder: tail, checked: false });
    });

    return { sheet: roster.sheet, count: roster.list.length, gaps: roster.gaps, rows };
  }

  function renderPlan() {
    const rows = plan.rows;
    const cnt = (k) => rows.filter(r => r.kind === k).length;
    const orderMoves = rows.filter(r => r.member && r.orderChanged).length;
    const rank = { new: 0, out: 1, spec: 2, order: 3 };
    const changed = rows.filter(r => r.kind !== 'same').sort((a, b) => rank[a.kind] - rank[b.kind] || a.newOrder - b.newOrder);

    $('ls-summary').textContent =
      `경청표 ${plan.count}명 · 지금 명단 ${membersCache.length}명 → ` +
      `신입 ${cnt('new')} · 경청표에 없음 ${cnt('out')} · 분야 다름 ${rows.filter(r => r.specChanged).length} · 순서 바뀜 ${orderMoves}` +
      (plan.gaps.length ? ` · 경청표에 비어 있는 번호: ${plan.gaps.join(', ')}` : '');

    const tbody = $('ls-tbody');
    tbody.innerHTML = '';
    if (!changed.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#888;">지금 명단과 똑같습니다. 바뀔 내용이 없습니다.</td></tr>';
    }

    changed.forEach((r) => {
      const idx = rows.indexOf(r);
      const tr = document.createElement('tr');
      const name = r.member ? r.member.company_name : r.sheet.company;
      let pill = '', spec = '', act = '', order = '';

      if (r.kind === 'new') {
        pill = '<span class="ls-pill ls-new">신입</span>';
        spec = escHtml(r.sheet.specialty);
        order = r.sheet.no;
        act = checkbox(idx, r.checked, '넣기');
      } else if (r.kind === 'out') {
        pill = '<span class="ls-pill ls-out">경청표에 없음</span>';
        spec = escHtml(r.member.specialty);
        order = `${r.member.sort_order} → 맨 뒤`;
        act = checkbox(idx, r.checked, '빼기');
      } else {
        pill = r.specChanged ? '<span class="ls-pill ls-chg">분야 다름</span>' : '<span class="ls-pill ls-chg">순서 바뀜</span>';
        spec = r.specChanged
          ? `<span class="ls-old">${escHtml(r.member.specialty || '(없음)')}</span> → ${escHtml(r.sheet.specialty)}`
          : escHtml(r.member.specialty);
        order = r.orderChanged ? `${r.member.sort_order} → ${r.newOrder}` : r.newOrder;
        act = r.specChanged ? checkbox(idx, r.checked, '분야 바꾸기') : '순서만 맞춤';
      }

      const sheetName = r.member && r.sheet && r.sheet.company !== r.member.company_name
        ? `<br><span class="ls-muted">경청표 표기: ${escHtml(r.sheet.company)}</span>` : '';
      const person = r.sheet && r.sheet.person ? ` <span class="ls-muted">(${escHtml(r.sheet.person)})</span>` : '';

      tr.innerHTML = `<td>${pill}</td><td style="white-space:nowrap">${order}</td>` +
        `<td><strong>${escHtml(name)}</strong>${person}${sheetName}</td><td>${spec}</td><td>${act}</td>`;
      tbody.appendChild(tr);
    });

    const same = cnt('same');
    if (same && changed.length) {
      const tr = document.createElement('tr');
      tr.className = 'ls-same-row';
      tr.innerHTML = `<td colspan="5"><span class="ls-pill ls-same">그대로</span> 나머지 ${same}명은 바뀌는 것이 없습니다.</td>`;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input[data-ls-idx]').forEach(cb => {
      cb.addEventListener('change', () => { plan.rows[+cb.dataset.lsIdx].checked = cb.checked; });
    });

    $('ls-apply-btn').disabled = !changed.length;
    $('ls-result').hidden = false;
  }

  function checkbox(idx, checked, label) {
    return `<label class="ls-check"><input type="checkbox" data-ls-idx="${idx}" ${checked ? 'checked' : ''}/> ${label}</label>`;
  }

  /* ── 3) 반영 ───────────────────────────────────────────── */
  async function applyPlan() {
    if (!plan) return;
    const rows = plan.rows;
    const adds = rows.filter(r => r.kind === 'new' && r.checked);
    const dels = rows.filter(r => r.kind === 'out' && r.checked);
    const keepsOut = rows.filter(r => r.kind === 'out' && !r.checked);

    const msg = `이대로 반영할까요?\n\n신입 넣기 ${adds.length}명\n빼기 ${dels.length}명` +
      (keepsOut.length ? `\n경청표에 없지만 남겨 두기 ${keepsOut.length}명 (맨 뒤로)` : '') +
      `\n\n반영 직전 명단은 자동으로 보관됩니다.`;
    if (!confirm(msg)) return;

    const btn = $('ls-apply-btn');
    btn.disabled = true;
    btn.textContent = '반영 중…';

    let backup = null;
    try {
      // 0) 앞선 반영이 중간에 멈췄으면 그 보관본을 덮어쓰지 않는다
      const prev = await readBackup();
      if (prev && prev.status === 'applying') {
        throw new Error('지난번 반영이 끝까지 되지 않았습니다. 먼저 "직전 명단으로 되돌리기"를 눌러 주세요.');
      }

      // 1) 보관 (실패하면 아무것도 바꾸지 않음)
      const { data: full, error } = await supabaseClient.from('members').select(BACKUP_COLS).order('sort_order', { ascending: true });
      if (error) throw error;
      if (!full || !full.length) throw new Error('지금 명단을 불러오지 못했습니다. 새로고침 후 다시 해 주세요.');
      backup = { at: new Date().toISOString(), sheet: sheetFileName, status: 'applying', rows: full };
      await upsertSetting(BACKUP_KEY, JSON.stringify(backup));
      try {
        const stamp = backup.at.slice(0, 10).replace(/-/g, '');
        triggerDownload(new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' }), `members_backup_${stamp}.json`);
      } catch (_) { /* 파일 저장은 덤. 보관본은 이미 저장됨 */ }

      // 2) 빼기
      for (const r of dels) await deleteMember(r.member.id);

      // 3) 기존 멤버 순서·분야
      for (const r of rows) {
        if (!r.member || (r.kind === 'out' && r.checked)) continue;
        const patch = {};
        if (r.member.sort_order !== r.newOrder) patch.sort_order = r.newOrder;
        if (r.specChanged && r.checked) patch.specialty = r.sheet.specialty;
        if (Object.keys(patch).length) await updateMember(r.member.id, patch);
      }

      // 4) 신입
      for (const r of adds) {
        await insertMember({ company_name: r.sheet.company, specialty: r.sheet.specialty, sort_order: r.sheet.no });
      }

      backup.status = 'done';
      await upsertSetting(BACKUP_KEY, JSON.stringify(backup));

      await reloadMembersTable();
      resetView();
      refreshBackupInfo();
      showToast(`반영했습니다. 지금 명단 ${membersCache.length}명`, 'success');
    } catch (err) {
      const half = backup && backup.status === 'applying';
      showToast((half ? '반영 중 문제가 생겼습니다: ' : '반영하지 못했습니다: ') + (err.message || err) +
        (half ? ' · "직전 명단으로 되돌리기"를 눌러 주세요.' : ''));
      resetView();   // 같은 비교 결과로 다시 누르지 못하게. 다시 하려면 파일을 다시 올린다.
      membersCache = await getMembers();
      renderMembersTable();
      refreshBackupInfo();
    } finally {
      btn.disabled = false;
      btn.textContent = '반영';
    }
  }

  /* ── 4) 되돌리기 ───────────────────────────────────────── */
  async function restoreBackup() {
    let b;
    try {
      b = await readBackup();
    } catch (err) {
      showToast(err.message);
      return;
    }
    if (!b || !b.rows || !b.rows.length) { showToast('보관된 명단이 없습니다.'); return; }
    if (b.status === 'restored') { showToast('이미 되돌린 보관본입니다.'); refreshBackupInfo(); return; }
    if (!confirm(`${fmtTime(b.at)} 반영 직전 명단(${b.rows.length}명)으로 되돌릴까요?\n그 뒤에 넣은 멤버는 빠지고, 뺀 멤버는 다시 들어옵니다.`)) return;

    const btn = $('ls-restore-btn');
    btn.disabled = true;
    try {
      // 먼저 보관본을 되살리고(upsert), 성공한 뒤에만 보관본에 없는 멤버를 뺀다
      const { error } = await supabaseClient.from('members').upsert(b.rows, { onConflict: 'id' });
      if (error) throw error;
      const keep = new Set(b.rows.map(r => r.id));
      const now = await fetchMembersStrict();
      for (const m of now) if (!keep.has(m.id)) await deleteMember(m.id);
      b.status = 'restored';
      b.restoredAt = new Date().toISOString();
      await upsertSetting(BACKUP_KEY, JSON.stringify(b));
      await reloadMembersTable();
      refreshBackupInfo();
      showToast(`되돌렸습니다. 지금 명단 ${membersCache.length}명`, 'success');
    } catch (err) {
      showToast('되돌리기 실패: ' + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  }
})();

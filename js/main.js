/* ============================================================
 * main.js – BNI 히어로챕터 Front-end Logic
 * ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFloatingButtons();
  initStats();
  initCalendar();
  initMembers();
  initApplyForm();
  initContactInfo();
  initModal();
  initPrivacyModal();
  initSmoothScroll();
  initCountdown();
});

/* ── Navigation ─────────────────────────────────────────────── */

function initNav() {
  const hamburger = document.getElementById('hamburger');
  const navMenu   = document.getElementById('nav-menu');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      const open = navMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open);
    });

    // Close menu when a link is clicked
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', false);
      });
    });
  }

  // Change nav background on scroll
  const nav = document.getElementById('main-nav');
  window.addEventListener('scroll', () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
  });
}

/* ── Floating buttons ───────────────────────────────────────── */

function initFloatingButtons() {
  // 플로팅 버튼은 순수 링크(tel:, href)로 동작 — JS 불필요
}

/* ── Stats count-up ─────────────────────────────────────────── */

async function initStats() {
  // Load from Supabase
  let settings = {};
  try { settings = await getSettings(); } catch (e) { console.warn('Settings load failed, using defaults'); }

  const referralCount  = parseInt(settings.referral_count  || '6500', 10);
  const visitorCount   = parseInt(settings.visitor_count   || '500',  10);
  const businessAmount = parseInt(settings.business_amount || '70',   10);

  const statItems = [
    { el: document.getElementById('stat-referral'),  target: referralCount,  suffix: '+',   label: '리퍼럴' },
    { el: document.getElementById('stat-visitor'),   target: visitorCount,   suffix: '+',   label: '비지터' },
    { el: document.getElementById('stat-business'),  target: businessAmount, suffix: '억원+', label: '비즈니스 총액' },
  ];

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const item = statItems.find(i => i.el === entry.target);
        if (item && !item.animated) {
          item.animated = true;
          animateCount(item.el, item.target, item.suffix);
        }
      }
    });
  }, { threshold: 0.5 });

  statItems.forEach(item => { if (item.el) observer.observe(item.el); });
}

function animateCount(el, target, suffix) {
  const duration = 1800;
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(eased * target);
    el.textContent = value.toLocaleString('ko-KR') + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Calendar ───────────────────────────────────────────────── */

let calYear, calMonth;

async function initCalendar() {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth() + 1; // 1-based

  const originYear  = calYear;
  const originMonth = calMonth;

  // 현재달 기준 ±1개월만 허용
  function getOffset() {
    return (calYear - originYear) * 12 + (calMonth - originMonth);
  }

  await renderCalendar();
  updateNavButtons();

  function updateNavButtons() {
    const offset = getOffset();
    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');
    if (prevBtn) prevBtn.disabled = offset <= -1;
    if (nextBtn) nextBtn.disabled = offset >= 1;
  }

  document.getElementById('cal-prev')?.addEventListener('click', async () => {
    if (getOffset() <= -1) return;
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    await renderCalendar();
    updateNavButtons();
  });
  document.getElementById('cal-next')?.addEventListener('click', async () => {
    if (getOffset() >= 1) return;
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    await renderCalendar();
    updateNavButtons();
  });
}

async function renderCalendar() {
  const grid   = document.getElementById('cal-grid');
  const title  = document.getElementById('cal-title');
  if (!grid || !title) return;

  title.textContent = `${calYear}년 ${calMonth}월`;
  grid.innerHTML = '';

  // Load schedule data
  let scheduleData = [];
  try { scheduleData = await getScheduleForMonth(calYear, calMonth); } catch (e) {}

  const scheduleMap = {};
  scheduleData.forEach(s => { scheduleMap[s.meeting_date] = s; });

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  dayNames.forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-header-cell';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();

  // Blank cells before first day
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-cell cal-blank';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    const dateObj = new Date(calYear, calMonth - 1, d);
    const isFriday = dateObj.getDay() === 5;
    const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const schedEntry = scheduleMap[dateStr];

    cell.className = 'cal-cell' + (isFriday ? ' cal-friday' : '');
    cell.innerHTML = `<span class="cal-day-num">${d}</span>`;

    if (isFriday) {
      if (schedEntry) {
        const badge = document.createElement('span');
        badge.className = `cal-badge cal-badge-${schedEntry.meeting_type}`;
        badge.textContent = schedEntry.meeting_type === 'offline' ? '조찬회의' : schedEntry.meeting_type === 'online' ? '화상회의' : '회의없음';
        cell.appendChild(badge);
        if (schedEntry.note) {
          const note = document.createElement('span');
          note.className = 'cal-note';
          note.textContent = schedEntry.note;
          cell.appendChild(note);
        }
      } else {
        const badge = document.createElement('span');
        badge.className = 'cal-badge cal-badge-offline';
        badge.textContent = '조찬회의';
        cell.appendChild(badge);
      }
    }

    grid.appendChild(cell);
  }
}

/* ── Members ────────────────────────────────────────────────── */

async function initMembers() {
  const grid = document.getElementById('members-grid');
  if (!grid) return;

  let members = [];
  try { members = await getMembers(); } catch (e) { console.warn('Members load failed'); }

  if (members.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:#888;grid-column:1/-1;">멤버 정보를 불러오는 중입니다.</p>';
    return;
  }

  grid.innerHTML = '';
  members.forEach(m => {
    const card = document.createElement('div');
    card.className = 'member-card';

    const websiteBtn = m.website_url
      ? `<a href="${escHtml(m.website_url)}" target="_blank" rel="noopener" class="btn-member btn-website">홈페이지 →</a>`
      : '';
    const cardBtn = m.card_image_url
      ? `<button class="btn-member btn-card" data-img="${escHtml(m.card_image_url)}" data-name="${escHtml(m.company_name)}">명함보기</button>`
      : '';

    card.innerHTML = `
      <div class="member-card-body">
        <p class="member-company">${escHtml(m.company_name)}</p>
        <p class="member-specialty">${escHtml(m.specialty || '')}</p>
      </div>
      <div class="member-card-actions">
        ${cardBtn}
        ${websiteBtn}
      </div>`;
    grid.appendChild(card);
  });

  // Business card modal triggers
  grid.querySelectorAll('.btn-card').forEach(btn => {
    btn.addEventListener('click', () => {
      openCardModal(btn.dataset.img, btn.dataset.name);
    });
  });

  // Mobile expand/collapse toggle
  const section = document.getElementById('members');
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'members-toggle-btn';
  let expanded = false;

  function applyToggleState() {
    if (window.innerWidth <= 768) {
      grid.classList.toggle('members-collapsed', !expanded);
      toggleBtn.textContent = expanded ? '접기 ▲' : '열기 ▼';
      toggleBtn.style.display = 'block';
    } else {
      grid.classList.remove('members-collapsed');
      toggleBtn.style.display = 'none';
    }
  }

  toggleBtn.addEventListener('click', () => {
    expanded = !expanded;
    applyToggleState();
    if (!expanded) {
      const top = section.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });

  const container = section.querySelector('.container');
  container.insertBefore(toggleBtn, grid);
  applyToggleState();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyToggleState, 150);
  });
}

/* ── Business Card Modal ────────────────────────────────────── */

function initModal() {
  const modal    = document.getElementById('card-modal');
  const closeBtn = document.getElementById('modal-close');
  if (!modal) return;

  closeBtn?.addEventListener('click', closeCardModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeCardModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCardModal(); });
}

function openCardModal(imgUrl, name) {
  const modal  = document.getElementById('card-modal');
  const img    = document.getElementById('modal-card-img');
  const title  = document.getElementById('modal-card-title');
  const box    = modal?.querySelector('.modal-box');
  if (!modal) return;
  if (img) {
    img.src = imgUrl;
    img.alt = name + ' 명함';
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (box) box.style.maxWidth = ratio > 2 ? '900px' : '640px';
    };
  }
  if (box) box.style.maxWidth = '640px';
  if (title) title.textContent = name;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCardModal() {
  const modal = document.getElementById('card-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

/* ── Apply Success Modal ────────────────────────────────────── */

function openApplySuccessModal() {
  const modal = document.getElementById('apply-success-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  function close() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  modal.querySelector('.apply-success-ok')?.addEventListener('click', close, { once: true });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
}

/* ── Privacy Modal ──────────────────────────────────────────── */

function initPrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  if (!modal) return;
  modal.addEventListener('click', (e) => { if (e.target === modal) closePrivacyModal(); });
  modal.querySelector('.privacy-modal-btn')?.addEventListener('click', closePrivacyModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePrivacyModal(); });
}

function openPrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
  // 체크박스로 포커스 이동
  const cb = document.getElementById('privacy-agree');
  if (cb) { cb.focus(); cb.closest('.form-check')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

/* ── Apply Form ─────────────────────────────────────────────── */

function initApplyForm() {
  initVisitDate();

  const form = document.getElementById('apply-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 개인정보 동의 체크
    const privacyCheck = document.getElementById('privacy-agree');
    if (!privacyCheck?.checked) {
      openPrivacyModal();
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = '신청 중...';

    const fd = new FormData(form);
    const payload = {
      company_name:   fd.get('company_name'),
      name:           fd.get('name'),
      position:       fd.get('position'),
      phone:          fd.get('phone'),
      business_field: fd.get('business_field'),
      referrer:       fd.get('referrer') || null,
      visit_date:     fd.get('visit_date') || null,
    };

    try {
      await submitApplication(payload);
      form.reset();
      openApplySuccessModal();
    } catch (err) {
      console.error(err);
      showFormMessage('error', '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      btn.disabled = false;
      btn.textContent = '신청하기';
    }
  });
}

function showFormMessage(type, msg) {
  let el = document.getElementById('form-message');
  if (!el) {
    el = document.createElement('div');
    el.id = 'form-message';
    document.getElementById('apply-form')?.after(el);
  }
  el.className = `form-message form-message-${type}`;
  el.textContent = msg;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 6000);
}

async function initVisitDate() {
  const input = document.getElementById('visit-date');
  if (!input) return;

  // 최소 날짜: 다음 금요일
  const today = new Date();
  const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
  const nextFriday = new Date(today);
  nextFriday.setDate(today.getDate() + daysUntilFriday);
  input.min = formatDate(nextFriday);

  // 어드민 일정 기준 가장 가까운 오프라인 모임일 세팅 (없으면 빈값 유지)
  try {
    const nearestMeeting = await getNextOfflineMeeting(input.min);
    if (nearestMeeting) input.value = nearestMeeting;
  } catch (e) {}

  // 금요일 여부 + 온라인/취소 여부 검증
  input.addEventListener('change', async () => {
    if (!input.value) return;
    const picked = new Date(input.value + 'T00:00:00');
    if (picked.getDay() !== 5) {
      input.value = '';
      showFormMessage('error', '참관일은 매주 금요일만 선택 가능합니다.');
      return;
    }
    // 어드민 일정 조회 — 온라인/취소 여부 확인
    try {
      const { data } = await supabaseClient
        .from('schedule')
        .select('meeting_type')
        .eq('meeting_date', input.value)
        .limit(1);
      if (data && data.length > 0) {
        const type = data[0].meeting_type;
        if (type === 'online') {
          input.value = '';
          showFormMessage('error', '해당 날짜는 온라인 화상회의로 진행됩니다. 다른 금요일을 선택해주세요.');
        } else if (type === 'cancelled') {
          input.value = '';
          showFormMessage('error', '해당 날짜는 회의가 없습니다. 다른 날짜를 선택해주세요.');
        }
      }
    } catch(e) {}
  });
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ── Contact Info ───────────────────────────────────────────── */

async function initContactInfo() {
  // Supabase settings에서 연락처 불러와 apply-contact 링크에 반영
  let settings = {};
  try { settings = await getSettings(); } catch (e) {}

  const phone = settings.contact_phone || '010-4848-5527';
  const email = settings.contact_email || 'jud150@naver.com';

  // 전화 링크 업데이트 (SVG 아이콘 보존)
  document.querySelectorAll('a[href^="tel:"]').forEach(el => {
    el.href = `tel:${phone.replace(/-/g, '')}`;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().match(/^[\d-]+$/)) {
        node.textContent = phone;
        break;
      }
    }
  });

  // 이메일 링크 업데이트 (SVG 아이콘 보존)
  document.querySelectorAll('a[href^="mailto:"]').forEach(el => {
    el.href = `mailto:${email}`;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().includes('@')) {
        node.textContent = email;
        break;
      }
    }
  });
}

/* ── Smooth Scroll ──────────────────────────────────────────── */

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

/* ── Meeting Countdown ──────────────────────────────────────── */


async function initCountdown() {
  const wrap   = document.getElementById('meeting-countdown');
  if (!wrap) return;

  const dEl    = document.getElementById('cd-days');
  const hEl    = document.getElementById('cd-hours');
  const mEl    = document.getElementById('cd-mins');
  const sEl    = document.getElementById('cd-secs');
  const dateEl = document.getElementById('cd-date');
  let timer    = null;

  async function run(fromDate) {
    if (timer) { clearInterval(timer); timer = null; }

    // 어드민 오프라인 일정만 조회 — 없으면 카운트다운 숨김
    let meetingDateStr = null;
    try { meetingDateStr = await getNextOfflineMeeting(fromDate); } catch(e) {}
    if (!meetingDateStr) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';

    const target = new Date(meetingDateStr + 'T06:30:00+09:00');

    if (dateEl) {
      const [, mo, day] = meetingDateStr.split('-');
      dateEl.textContent = `${parseInt(mo)}월 ${parseInt(day)}일 금요일 오전 6시 30분`;
    }

    function tick() {
      const diff = target - new Date();
      if (diff <= 0) {
        // 6:30 도달 → 다음 날부터 재조회하여 자동 전환
        clearInterval(timer); timer = null;
        const nextDay = new Date(target);
        nextDay.setDate(nextDay.getDate() + 1);
        run(formatDate(nextDay));
        return;
      }
      const days  = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins  = Math.floor((diff % 3600000)  / 60000);
      const secs  = Math.floor((diff % 60000)    / 1000);
      if (dEl) dEl.textContent = String(days).padStart(2, '0');
      if (hEl) hEl.textContent = String(hours).padStart(2, '0');
      if (mEl) mEl.textContent = String(mins).padStart(2, '0');
      if (sEl) sEl.textContent = String(secs).padStart(2, '0');
    }

    tick();
    timer = setInterval(tick, 1000);
  }

  run(formatDate(new Date()));
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

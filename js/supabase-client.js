/*
 * Supabase Client Configuration
 * BNI 히어로챕터
 *
 * === Supabase Table Setup SQL ===
 *
 * -- members table
 * CREATE TABLE members (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   company_name text NOT NULL,
 *   specialty text,
 *   card_image_url text,
 *   website_url text,
 *   sort_order integer DEFAULT 0,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * -- schedule table
 * CREATE TABLE schedule (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   meeting_date date NOT NULL,
 *   meeting_type text NOT NULL CHECK (meeting_type IN ('offline', 'online', 'cancelled')),
 *   note text,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * -- applications table
 * CREATE TABLE applications (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   company_name text,
 *   name text,
 *   position text,
 *   phone text,
 *   business_field text,
 *   referrer text,
 *   visit_date date,
 *   confirmed boolean DEFAULT false,
 *   memo text,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * -- settings table
 * CREATE TABLE settings (
 *   key text PRIMARY KEY,
 *   value text
 * );
 *
 * -- Default settings
 * INSERT INTO settings (key, value) VALUES
 *   ('referral_count', '6500'),
 *   ('visitor_count', '500'),
 *   ('business_amount', '70'),
 *   ('contact_phone', '010-4848-5527'),
 *   ('contact_email', 'jud150@naver.com'),
 *   ('contact_kakao', ''),
 *   ('contact_instagram', 'https://www.instagram.com/bni_hero.ct/');
 *
 * === Supabase Storage Setup ===
 * Create a storage bucket named "business-cards" with public access enabled.
 *
 * === RLS Policies ===
 * -- Allow public read on members, schedule, settings
 * -- Allow public insert on applications
 * -- Allow authenticated users full access to all tables
 *
 * === WP (Weekly Presentation) Upload Setup ===
 *
 * -- wp_submissions table
 * CREATE TABLE wp_submissions (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   week_date date NOT NULL,                 -- 해당 주차 금요일
 *   company_name text NOT NULL,              -- members.company_name 과 매칭
 *   file_path text NOT NULL,                 -- wp-uploads 버킷 내 경로
 *   file_name text,                          -- 원본 파일명
 *   file_size bigint,
 *   created_at timestamptz DEFAULT now(),
 *   UNIQUE(week_date, company_name)
 * );
 *
 * -- Storage bucket: wp-uploads (public = false)
 * -- Path convention: {week_date}/{company_name}.pptx
 *
 * -- RLS for wp_submissions
 * ALTER TABLE wp_submissions ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "public select wp" ON wp_submissions FOR SELECT USING (true);
 * CREATE POLICY "public insert wp" ON wp_submissions FOR INSERT WITH CHECK (true);
 * CREATE POLICY "public update wp"  ON wp_submissions FOR UPDATE USING (true) WITH CHECK (true);
 * CREATE POLICY "auth delete wp"    ON wp_submissions FOR DELETE USING (auth.role() = 'authenticated');
 *
 * -- Storage policies for wp-uploads bucket
 * -- (Create via Dashboard → Storage → wp-uploads → Policies)
 *   1) anon INSERT  (bucket_id = 'wp-uploads')
 *   2) anon UPDATE  (bucket_id = 'wp-uploads')         ← 재업로드 덮어쓰기용
 *   3) anon SELECT  (bucket_id = 'wp-uploads')         ← signed URL 발급용
 *   4) authenticated ALL (bucket_id = 'wp-uploads')    ← 관리자 다운로드/삭제
 */

const SUPABASE_URL = 'https://dzzjlycqxfqdyqgnqixh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6empseWNxeGZxZHlxZ25xaXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjU3NTEsImV4cCI6MjA4OTU0MTc1MX0.PBXuSGfe2h-4JNl7dXGKN6WYQ-Jqk21Vt2KD-Fx39Jc';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Members ──────────────────────────────────────────────────────────────────

async function getMembers() {
  const { data, error } = await supabaseClient
    .from('members')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) { console.error('getMembers error:', error); return []; }
  return data || [];
}

// ── Schedule ─────────────────────────────────────────────────────────────────

async function getScheduleForMonth(year, month) {
  // month is 1-based
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  const { data, error } = await supabaseClient
    .from('schedule')
    .select('*')
    .gte('meeting_date', start)
    .lte('meeting_date', end);
  if (error) { console.error('getScheduleForMonth error:', error); return []; }
  return data || [];
}

async function upsertSchedule(record) {
  const { data, error } = await supabaseClient
    .from('schedule')
    .upsert(record, { onConflict: 'meeting_date' })
    .select();
  if (error) throw error;
  return data;
}

async function deleteSchedule(id) {
  const { error } = await supabaseClient.from('schedule').delete().eq('id', id);
  if (error) throw error;
}

// ── Applications ──────────────────────────────────────────────────────────────

async function submitApplication(payload) {
  const { data, error } = await supabaseClient
    .from('applications')
    .insert([payload])
    .select();
  if (error) throw error;
  return data;
}

async function getApplications(page = 0, perPage = 15) {
  const from = page * perPage;
  const to   = from + perPage - 1;
  const { data, error, count } = await supabaseClient
    .from('applications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) { console.error('getApplications error:', error); return { data: [], count: 0 }; }
  return { data: data || [], count: count || 0 };
}

async function deleteApplication(id) {
  const { error } = await supabaseClient.from('applications').delete().eq('id', id);
  if (error) throw error;
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function getSettings() {
  const { data, error } = await supabaseClient.from('settings').select('*');
  if (error) { console.error('getSettings error:', error); return {}; }
  const map = {};
  (data || []).forEach(row => { map[row.key] = row.value; });
  return map;
}

async function upsertSetting(key, value) {
  const { error } = await supabaseClient
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

// ── Members CRUD (admin) ──────────────────────────────────────────────────────

async function insertMember(record) {
  const { data, error } = await supabaseClient.from('members').insert([record]).select();
  if (error) throw error;
  return data;
}

async function updateMember(id, record) {
  const { data, error } = await supabaseClient.from('members').update(record).eq('id', id).select();
  if (error) throw error;
  return data;
}

async function deleteMember(id) {
  const { error } = await supabaseClient.from('members').delete().eq('id', id);
  if (error) throw error;
}

async function uploadBusinessCard(file, memberId) {
  const ext = file.name.split('.').pop();
  const path = `${memberId}.${ext}`;
  const { error: upErr } = await supabaseClient.storage
    .from('business-cards')
    .upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data } = supabaseClient.storage.from('business-cards').getPublicUrl(path);
  return data.publicUrl;
}

async function getNextOfflineMeeting(fromDate) {
  // fromDate 미지정 시 내일부터
  if (!fromDate) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    fromDate = _fmt(d);
  }

  // 앞으로 12주치 일정 한 번에 조회
  const endD = new Date(fromDate + 'T00:00:00');
  endD.setDate(endD.getDate() + 84);
  const { data, error } = await supabaseClient
    .from('schedule')
    .select('meeting_date, meeting_type')
    .gte('meeting_date', fromDate)
    .lte('meeting_date', _fmt(endD))
    .order('meeting_date', { ascending: true });
  if (error) throw error;

  // online/cancelled 로 명시된 날짜 집합
  const blocked = new Set();
  (data || []).forEach(s => {
    if (s.meeting_type !== 'offline') blocked.add(s.meeting_date);
  });

  // fromDate 이후 첫 금요일로 이동
  const d = new Date(fromDate + 'T00:00:00');
  const daysToFri = (5 - d.getDay() + 7) % 7;
  if (daysToFri > 0) d.setDate(d.getDate() + daysToFri);

  // 최대 12주 금요일 순회 — blocked 아니면 오프라인으로 간주
  for (let i = 0; i < 12; i++) {
    const dateStr = _fmt(d);
    if (!blocked.has(dateStr)) return dateStr;
    d.setDate(d.getDate() + 7);
  }
  return null;
}

function _fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── WP (Weekly Presentation) ─────────────────────────────────────────────────

const WP_BUCKET = 'wp-uploads';

/**
 * 다음 금요일 날짜 (YYYY-MM-DD). 오늘이 금요일이면 오늘.
 */
function getNextFriday(baseDate) {
  const d = baseDate ? new Date(baseDate) : new Date();
  const day = d.getDay();                   // 0=Sun .. 5=Fri .. 6=Sat
  const delta = (5 - day + 7) % 7;          // 다음 금요일까지 일수
  d.setDate(d.getDate() + delta);
  return _fmt(d);
}

/**
 * 업로드 마감 여부. 금요일 주의 수요일 12:00(KST) 이후면 true.
 * weekDate: 해당 주 금요일 YYYY-MM-DD
 */
function isWpUploadClosed(weekDate, now) {
  const fri = new Date(weekDate + 'T00:00:00+09:00');
  const wedNoon = new Date(fri);
  wedNoon.setDate(fri.getDate() - 2);       // 금 - 2 = 수
  wedNoon.setHours(12, 0, 0, 0);            // 로컬 타임존 기준. KST 가정.
  const cur = now || new Date();
  return cur >= wedNoon;
}

// 한글/괄호 등을 ASCII-safe 키로 변환 (base64url, 결정적 = 같은 입력 → 같은 출력)
function toSafeStorageKey(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function uploadWpFile(file, weekDate, companyName) {
  // 확장자 추출 (pptx 외에도 케이스 대응)
  const ext = (file.name.split('.').pop() || 'pptx').toLowerCase();
  // Supabase storage는 키에 한글/괄호/% 전부 거부 → base64url 슬러그 사용
  const safeCompany = toSafeStorageKey(companyName);
  const path = `${weekDate}/${safeCompany}.${ext}`;

  const { error: upErr } = await supabaseClient.storage
    .from(WP_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (upErr) throw upErr;

  const record = {
    week_date: weekDate,
    company_name: companyName,
    file_path: path,
    file_name: file.name,
    file_size: file.size,
  };
  const { error: dbErr } = await supabaseClient
    .from('wp_submissions')
    .upsert(record, { onConflict: 'week_date,company_name' });
  if (dbErr) throw dbErr;

  return record;
}

async function getWpSubmissions(weekDate) {
  const { data, error } = await supabaseClient
    .from('wp_submissions')
    .select('*')
    .eq('week_date', weekDate)
    .order('created_at', { ascending: true });
  if (error) { console.error('getWpSubmissions error:', error); return []; }
  return data || [];
}

async function getWpWeekDates() {
  const { data, error } = await supabaseClient
    .from('wp_submissions')
    .select('week_date')
    .order('week_date', { ascending: false });
  if (error) { console.error('getWpWeekDates error:', error); return []; }
  const set = new Set((data || []).map(r => r.week_date));
  return Array.from(set);
}

async function getWpDownloadUrl(filePath) {
  // 1시간짜리 signed URL
  const { data, error } = await supabaseClient.storage
    .from(WP_BUCKET)
    .createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

async function downloadWpBlob(filePath) {
  const { data, error } = await supabaseClient.storage
    .from(WP_BUCKET)
    .download(filePath);
  if (error) throw error;
  return data;  // Blob
}

async function deleteWpSubmission(id, filePath) {
  // 스토리지 파일 먼저 삭제
  const { error: stErr } = await supabaseClient.storage
    .from(WP_BUCKET)
    .remove([filePath]);
  if (stErr) console.warn('storage remove warn:', stErr);
  const { error } = await supabaseClient.from('wp_submissions').delete().eq('id', id);
  if (error) throw error;
}

// ── Applications update ───────────────────────────────────────────────────────

async function updateApplication(id, record) {
  const { data, error } = await supabaseClient
    .from('applications')
    .update(record)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

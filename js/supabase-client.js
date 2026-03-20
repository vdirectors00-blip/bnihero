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

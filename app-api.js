(function () {
  const STORE_KEY = 'studioflow_v3';
  const STUDENT_SESSION_KEY = 'studioflow_student_session';
  const TEACHER_SESSION_KEY = 'studioflow_teacher_session';
  const SUGGESTIONS_KEY = 'studioflow_suggestions_v1';
  const PASSKEY_STORE_KEY = 'studioflow_passkeys_v1';
  const RESET_STORE_KEY = 'studioflow_resetcodes_v1';
  const CLOUD_AUTH_ENABLED = typeof window !== 'undefined' && window.STUDIOFLOW_ENABLE_CLOUD_AUTH === true;
  const STATUS_VALUES = ['pending', 'confirmed', 'completed', 'cancelled', 'cancelled_late'];
  const BUILTIN_TEACHER = {
    name: 'Jovi',
    username: 'jovi',
    email: 'moise.sahouo@gmail.com',
    passwordHash: 'a2f405f50b587df7e6930928d9bd93e89fe1e9d4035f81c01d442010ff1d1f01'
  };

  // --- UTILITIES ---
  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
  function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }
  function parseMinutes(time) {
    const [h, m] = String(time || '').split(':').map(Number);
    return Number.isNaN(h) || Number.isNaN(m) ? NaN : h * 60 + m;
  }
  function toTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function safeText(text) {
    return String(text || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }
  function loadSuggestions() {
    try { return JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || '{}'); } catch (_) { return {}; }
  }
  function saveSuggestions(map) {
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(map));
  }
  function loadPasskeys() {
    try { return JSON.parse(localStorage.getItem(PASSKEY_STORE_KEY) || '{}'); } catch (_) { return {}; }
  }
  function savePasskeys(map) {
    localStorage.setItem(PASSKEY_STORE_KEY, JSON.stringify(map));
  }
  function loadResetCodes() {
    try { return JSON.parse(localStorage.getItem(RESET_STORE_KEY) || '{}'); } catch (_) { return {}; }
  }
  function saveResetCodes(map) {
    localStorage.setItem(RESET_STORE_KEY, JSON.stringify(map));
  }

  function getErrorMessage(error, fallback) {
    if (!error) return fallback || 'Unexpected error.';
    return String(error.message || error.msg || error.error_description || fallback || 'Unexpected error.');
  }

  function getNetlifyIdentity() {
    if (!CLOUD_AUTH_ENABLED) return null;
    if (typeof window === 'undefined' || !window.netlifyIdentity) return null;
    try { window.netlifyIdentity.init(); } catch (_) {}
    return window.netlifyIdentity;
  }

  function getIdentityApiBase() {
    if (typeof window === 'undefined' || !window.location) return '/.netlify/identity';
    return `${window.location.origin}/.netlify/identity`;
  }

  async function fetchIdentity(path, options) {
    if (typeof fetch !== 'function') throw new Error('Identity service unavailable.');
    const response = await fetch(`${getIdentityApiBase()}${path}`, options || {});
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
    if (!response.ok) {
      const msg = body.msg || body.error_description || body.error || `Identity request failed (${response.status}).`;
      throw new Error(msg);
    }
    return body;
  }

  function hasEmailConfirmationPending(user) {
    if (!user) return false;
    return !user.confirmed_at && !user.email_confirmed_at;
  }

  function netlifySignup(ni, payload) {
    return new Promise((resolve, reject) => {
      if (ni && typeof ni.signup === 'function') {
        ni.signup(payload, (error, user) => {
          if (error) reject(error);
          else resolve(user);
        });
        return;
      }
      fetchIdentity('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: payload.email,
          password: payload.password,
          data: payload.user_metadata || {}
        })
      }).then(resolve).catch(reject);
    });
  }

  function netlifyLogin(ni, email, password) {
    return new Promise((resolve, reject) => {
      if (ni && typeof ni.login === 'function') {
        ni.login(email, password, true, (error, user) => {
          if (error) reject(error);
          else resolve(user);
        });
        return;
      }
      fetchIdentity('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=password&username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
      }).then((tokenRes) => resolve(tokenRes.user || tokenRes)).catch(reject);
    });
  }

  function netlifyLogout(ni) {
    return new Promise((resolve) => {
      if (ni && typeof ni.logout === 'function') {
        ni.logout(() => resolve(true));
        return;
      }
      resolve(true);
    });
  }

  function getNetlifyCurrentUser() {
    const ni = getNetlifyIdentity();
    if (!ni || typeof ni.currentUser !== 'function') return null;
    try { return ni.currentUser(); } catch (_) { return null; }
  }

  function deleteNetlifyCurrentUser() {
    return new Promise((resolve) => {
      const current = getNetlifyCurrentUser();
      if (!current) return resolve(false);
      if (typeof current.delete === 'function') {
        current.delete(() => resolve(true));
        return;
      }
      if (typeof current.destroy === 'function') {
        current.destroy(() => resolve(true));
        return;
      }
      resolve(false);
    });
  }

  async function ensureCloudRegistration(role, data) {
    const ni = getNetlifyIdentity();
    if (!ni) return { enabled: false, pendingConfirmation: false };

    const payload = {
      email: String(data.email || '').trim().toLowerCase(),
      password: String(data.password || ''),
      user_metadata: {
        role: String(role || 'student').toLowerCase(),
        name: String(data.name || '').trim(),
        phone: String(data.phone || '').trim()
      }
    };

    try {
      const user = await netlifySignup(ni, payload);
      return { enabled: true, pendingConfirmation: hasEmailConfirmationPending(user), user };
    } catch (error) {
      const message = getErrorMessage(error, 'Cloud sign up failed.');
      if (/already|exists|taken/i.test(message)) {
        return { enabled: true, pendingConfirmation: false, user: null };
      }
      if (/disabled|unavailable|not enabled|network|failed to fetch|connection/i.test(message)) {
        return { enabled: false, pendingConfirmation: false, user: null };
      }
      throw new Error(message);
    }
  }

  async function loginCloudAndValidateRole(role, email, password) {
    const ni = getNetlifyIdentity();
    if (!ni) throw new Error('Account not found.');

    let user;
    try {
      user = await netlifyLogin(ni, email, password);
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Invalid email or password.'));
    }

    const cloudRole = String((user && user.user_metadata && user.user_metadata.role) || 'student').toLowerCase();
    const expectedRole = String(role || 'student').toLowerCase();
    if (cloudRole !== expectedRole) {
      await netlifyLogout(ni);
      throw new Error(`This account is registered as ${cloudRole}.`);
    }

    return user;
  }

  async function hashPassword(raw) {
    const input = String(raw || '');
    if (!input) return '';
    if (globalThis.crypto && crypto.subtle && globalThis.TextEncoder) {
      const bytes = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return 'plain:' + input;
  }

  // --- NORMALIZATION ---
  function normalizeService(service) {
    return {
      id: service.id || uid('svc'),
      name: String(service.name || '').trim(),
      duration: Number(service.duration || 30),
      price: Number(service.price || 0),
      capacity: Math.max(1, Number(service.capacity || 1)),
      weeklySlots: Array.isArray(service.weeklySlots) ? service.weeklySlots : []
    };
  }

  function normalizeStudent(student) {
    return {
      id: student.id || uid('stu'),
      name: String(student.name || '').trim(),
      username: String(student.username || '').trim().toLowerCase(),
      email: String(student.email || '').trim().toLowerCase(),
      phone: String(student.phone || '').replace(/[^0-9+]/g, ''),
      passwordHash: String(student.passwordHash || ''),
      credits: Number(student.credits || 0),
      paymentStatus: String(student.paymentStatus || 'Pending'),
      isSubscription: student.isSubscription === true,
      lastSubscriptionRefill: String(student.lastSubscriptionRefill || ''),
      isActive: student.isActive !== false
    };
  }

  function normalizeTeacher(teacher) {
    return {
      id: teacher.id || uid('tch'),
      name: String(teacher.name || '').trim(),
      username: String(teacher.username || '').trim().toLowerCase(),
      email: String(teacher.email || '').trim().toLowerCase(),
      passwordHash: String(teacher.passwordHash || ''),
      isBuiltIn: teacher.isBuiltIn === true
    };
  }

  function normalizeBooking(booking) {
    return {
      id: booking.id || uid('book'),
      clientName: String(booking.clientName || '').trim(),
      clientEmail: String(booking.clientEmail || '').trim().toLowerCase(),
      serviceId: booking.serviceId || '',
      serviceName: String(booking.serviceName || ''),
      date: String(booking.date || ''),
      time: String(booking.time || ''),
      notes: String(booking.notes || ''), // Original booking notes
      teacherNotes: String(booking.teacherNotes || ''), // Notes from teacher after lesson
      homework: String(booking.homework || ''), // Homework assigned
      price: Number(booking.price || 0),
      status: STATUS_VALUES.includes(booking.status) ? booking.status : 'pending',
      createdAt: booking.createdAt || new Date().toISOString()
    };
  }

  function normalizeRecap(recap) {
    return {
      id: recap.id || uid('recap'),
      bookingId: String(recap.bookingId || ''),
      studentEmail: String(recap.studentEmail || '').trim().toLowerCase(),
      studentName: String(recap.studentName || '').trim(),
      serviceName: String(recap.serviceName || '').trim(),
      date: String(recap.date || ''),
      time: String(recap.time || ''),
      summary: String(recap.summary || '').trim(),
      resources: Array.isArray(recap.resources)
        ? recap.resources.map((x) => String(x || '').trim()).filter(Boolean)
        : [],
      createdAt: recap.createdAt || new Date().toISOString(),
      teacherEmail: String(recap.teacherEmail || '').trim().toLowerCase()
    };
  }

  function normalizeMessage(message) {
    return {
      id: message.id || uid('msg'),
      fromEmail: String(message.fromEmail || '').trim().toLowerCase(),
      toEmail: String(message.toEmail || '').trim().toLowerCase(),
      body: String(message.body || '').trim(),
      createdAt: message.createdAt || new Date().toISOString(),
      readBy: Array.isArray(message.readBy)
        ? message.readBy.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : []
    };
  }

  function monthKey(dateValue) {
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function refillSubscriptionCreditsIfNeeded(now) {
    const key = monthKey(now);
    let changed = false;
    let refilled = 0;
    state.students.forEach((student) => {
      if (student.isSubscription !== true) return;
      if (student.lastSubscriptionRefill === key) return;
      student.credits = 4;
      student.lastSubscriptionRefill = key;
      changed = true;
      refilled += 1;
    });
    if (changed) saveState();
    return refilled;
  }

  function parseResourceLinks(raw) {
    if (Array.isArray(raw)) {
      return raw.map((x) => String(x || '').trim()).filter((x) => /^https?:\/\//i.test(x));
    }
    return String(raw || '')
      .split(/[\n,]+/g)
      .map((x) => x.trim())
      .filter((x) => /^https?:\/\//i.test(x));
  }

  // --- STATE PERSISTENCE ---
  function emptyState() {
    return {
      services: [], bookings: [], students: [], teachers: [],
      packages: [
        {id: 1, name: "Single Session", count: 1, price: 60},
        {id: 2, name: "5-Lesson Pack", count: 5, price: 275},
        {id: 3, name: "10-Lesson Pack", count: 10, price: 500}
      ],
      lessonRecaps: [],
      privateMessages: [],
      ledger: [],
      expenses: [],
      settings: { cancelWindow: 24, lateFee: 50, allowPortalCancel: true, taxRate: 0.20 },
    };
  }

  function loadState() {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      return {
        ...emptyState(),
        ...parsed,
        services: (parsed.services || []).map(normalizeService),
        bookings: (parsed.bookings || []).map(normalizeBooking),
        students: (parsed.students || []).map(normalizeStudent),
        teachers: (parsed.teachers || []).map(normalizeTeacher),
        privateMessages: (parsed.privateMessages || []).map(normalizeMessage),
        lessonRecaps: (parsed.lessonRecaps || []).map(normalizeRecap)
      };
    } catch (e) { return emptyState(); }
  }

  let state = loadState();
  refillSubscriptionCreditsIfNeeded();
  ensureUsernamesAndBuiltInTeacher();
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  function usernameBase(raw, fallback) {
    const cleaned = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9._]/g, '').replace(/[._]{2,}/g, '_');
    if (cleaned.length >= 3) return cleaned.slice(0, 24);
    return String(fallback || 'user').slice(0, 24);
  }

  function isEmailLike(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function findStudentByUsername(username) {
    const normalized = String(username || '').trim().toLowerCase();
    if (!normalized) return null;
    return state.students.find((s) => String(s.username || '').toLowerCase() === normalized) || null;
  }

  function findTeacherByUsername(username) {
    const normalized = String(username || '').trim().toLowerCase();
    if (!normalized) return null;
    return state.teachers.find((t) => String(t.username || '').toLowerCase() === normalized) || null;
  }

  function makeUniqueUsername(role, preferred, fallback, currentEmail) {
    const base = usernameBase(preferred, fallback);
    let candidate = base;
    let i = 0;
    while (true) {
      const clash = role === 'teacher'
        ? findTeacherByUsername(candidate)
        : findStudentByUsername(candidate);
      if (!clash || String(clash.email) === String(currentEmail || '').toLowerCase()) return candidate;
      i += 1;
      candidate = `${base.slice(0, 20)}${i}`;
    }
  }

  function resolveStudentByIdentifier(identifier) {
    const raw = String(identifier || '').trim().toLowerCase();
    if (!raw) return null;
    if (isEmailLike(raw)) return getStudentByEmail(raw) || null;
    return findStudentByUsername(raw);
  }

  function resolveTeacherByIdentifier(identifier) {
    const raw = String(identifier || '').trim().toLowerCase();
    if (!raw) return null;
    if (isEmailLike(raw)) return getTeacherByEmail(raw) || null;
    return findTeacherByUsername(raw);
  }

  function ensureUsernamesAndBuiltInTeacher() {
    let changed = false;

    state.students = state.students.map((student) => {
      const normalized = normalizeStudent(student);
      if (!normalized.username) {
        normalized.username = makeUniqueUsername('student', normalized.email.split('@')[0], 'student', normalized.email);
        changed = true;
      }
      return normalized;
    });

    state.teachers = state.teachers.map((teacher) => {
      const normalized = normalizeTeacher(teacher);
      if (!normalized.username) {
        normalized.username = makeUniqueUsername('teacher', normalized.email.split('@')[0], 'teacher', normalized.email);
        changed = true;
      }
      return normalized;
    });

    state.teachers.forEach((teacher) => {
      if (teacher.email === BUILTIN_TEACHER.email.toLowerCase()) return;
      if (teacher.username === BUILTIN_TEACHER.username) {
        teacher.username = makeUniqueUsername('teacher', teacher.email.split('@')[0], 'teacher', teacher.email);
        changed = true;
      }
    });

    const builtinEmail = BUILTIN_TEACHER.email.toLowerCase();
    let builtin = state.teachers.find((t) => String(t.email || '').toLowerCase() === builtinEmail) || null;
    if (!builtin) {
      state.teachers.push(normalizeTeacher({
        id: uid('tch'),
        name: BUILTIN_TEACHER.name,
        username: BUILTIN_TEACHER.username,
        email: builtinEmail,
        passwordHash: BUILTIN_TEACHER.passwordHash,
        isBuiltIn: true
      }));
      changed = true;
    } else {
      const nextUsername = makeUniqueUsername('teacher', BUILTIN_TEACHER.username, 'jovi', builtin.email);
      if (builtin.name !== BUILTIN_TEACHER.name) { builtin.name = BUILTIN_TEACHER.name; changed = true; }
      if (builtin.username !== nextUsername) { builtin.username = nextUsername; changed = true; }
      if (builtin.passwordHash !== BUILTIN_TEACHER.passwordHash) { builtin.passwordHash = BUILTIN_TEACHER.passwordHash; changed = true; }
      if (builtin.isBuiltIn !== true) { builtin.isBuiltIn = true; changed = true; }
    }

    if (changed) saveState();
  }

  function addSuggestion(key, value) {
    const v = String(value || '').trim();
    if (!v || v.length < 2) return;
    const map = loadSuggestions();
    const arr = Array.isArray(map[key]) ? map[key] : [];
    map[key] = [v, ...arr.filter(x => x !== v)].slice(0, 15);
    saveSuggestions(map);
  }

  // --- INTERNAL SELECTORS ---
  const getStudentByEmail = (email) => state.students.find(s => s.email === String(email).toLowerCase());
  const getTeacherByEmail = (email) => state.teachers.find(t => t.email === String(email).toLowerCase());
  const getServiceById = (id) => state.services.find(s => s.id === id);

  // --- API DEFINITION ---
  const api = {
    utils: {
      safeText,
      formatMoney: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v || 0))
    },

    // --- AUTH ---
    async loginStudent(identifier, password) {
      const user = resolveStudentByIdentifier(identifier);
      if (!user) throw new Error('Student account not found on this device.');
      const hash = await hashPassword(password);
      if (hash !== user.passwordHash) throw new Error('Invalid password.');
      localStorage.setItem(STUDENT_SESSION_KEY, user.email);
      return deepClone(user);
    },

    async getCurrentStudent() {
      refillSubscriptionCreditsIfNeeded();
      const email = localStorage.getItem(STUDENT_SESSION_KEY);
      const student = email ? getStudentByEmail(email) : null;
      return student ? deepClone(student) : null;
    },

    async registerStudent(data) {
      const normalizedEmail = String(data.email || '').trim().toLowerCase();
      if (getStudentByEmail(normalizedEmail)) throw new Error('Email already exists.');
      const preferredUsername = usernameBase(data.username || normalizedEmail.split('@')[0], 'student');
      if (findStudentByUsername(preferredUsername)) throw new Error('Username already exists.');
      const normalizedUsername = preferredUsername;
      const cloud = { enabled: false, pendingConfirmation: false };
      const isSubscription = data.isSubscription === true;
      const student = normalizeStudent({
        ...data,
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash: await hashPassword(data.password),
        isSubscription,
        credits: isSubscription ? Math.max(4, Number(data.credits || 0)) : Number(data.credits || 0),
        lastSubscriptionRefill: isSubscription ? monthKey() : ''
      });
      state.students.push(student);
      addSuggestion('emails', student.email);
      addSuggestion('names', student.name);
      saveState();
      return { ...deepClone(student), cloud };
    },

    async getCurrentTeacher() {
      const email = localStorage.getItem(TEACHER_SESSION_KEY);
      const teacher = email ? getTeacherByEmail(email) : null;
      return teacher ? deepClone(teacher) : null;
    },

    async loginTeacher(identifier, password) {
      const user = resolveTeacherByIdentifier(identifier);
      if (!user) throw new Error('Teacher account not found on this device.');
      const hash = await hashPassword(password);
      if (hash !== user.passwordHash) throw new Error('Invalid password.');
      localStorage.setItem(TEACHER_SESSION_KEY, user.email);
      return deepClone(user);
    },

    async registerTeacher(data) {
      const normalizedEmail = String(data.email || '').trim().toLowerCase();
      if (getTeacherByEmail(normalizedEmail)) throw new Error('Teacher email already exists.');
      const fallbackUsername = data.username ? data.username : makeUniqueUsername('teacher', normalizedEmail.split('@')[0], 'teacher', normalizedEmail);
      const normalizedUsername = usernameBase(fallbackUsername, 'teacher');
      const taken = findTeacherByUsername(normalizedUsername);
      if (taken && taken.email !== normalizedEmail) throw new Error('Teacher username already exists.');
      const cloud = { enabled: false, pendingConfirmation: false };
      const teacher = normalizeTeacher({
        name: String(data.name || '').trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash: await hashPassword(data.password),
        isBuiltIn: false
      });
      state.teachers.push(teacher);
      addSuggestion('emails', teacher.email);
      addSuggestion('names', teacher.name);
      saveState();
      return { ...deepClone(teacher), cloud };
    },

    async registerPasskey(role, identifier, password) {
      const normalizedRole = String(role || 'student').toLowerCase();
      const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
      if (!normalizedIdentifier) throw new Error('Username or email required.');
      if (!password) throw new Error('Password required.');
      if (normalizedRole === 'teacher') await this.loginTeacher(normalizedIdentifier, password);
      else await this.loginStudent(normalizedIdentifier, password);
      const account = normalizedRole === 'teacher'
        ? resolveTeacherByIdentifier(normalizedIdentifier)
        : resolveStudentByIdentifier(normalizedIdentifier);
      if (!account) throw new Error('Account not found.');
      const map = loadPasskeys();
      map[`${normalizedRole}:${account.email}`] = { enrolledAt: new Date().toISOString() };
      savePasskeys(map);
      return true;
    },

    async loginWithPasskey(role, identifier) {
      const normalizedRole = String(role || 'student').toLowerCase();
      const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
      const account = normalizedRole === 'teacher'
        ? resolveTeacherByIdentifier(normalizedIdentifier)
        : resolveStudentByIdentifier(normalizedIdentifier);
      if (!account) throw new Error('Account not found.');
      const map = loadPasskeys();
      if (!map[`${normalizedRole}:${account.email}`]) {
        throw new Error('No biometrics linked for this account.');
      }
      if (normalizedRole === 'teacher') {
        localStorage.setItem(TEACHER_SESSION_KEY, account.email);
      } else {
        localStorage.setItem(STUDENT_SESSION_KEY, account.email);
      }
      return true;
    },

    async requestPasswordReset(role, identifier) {
      const normalizedRole = String(role || 'student').toLowerCase();
      const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
      const exists = normalizedRole === 'teacher'
        ? resolveTeacherByIdentifier(normalizedIdentifier)
        : resolveStudentByIdentifier(normalizedIdentifier);
      if (!exists) throw new Error('Account not found.');
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const map = loadResetCodes();
      map[`${normalizedRole}:${exists.email}`] = {
        code,
        expiresAt: Date.now() + (15 * 60 * 1000)
      };
      saveResetCodes(map);
      return { ok: true, demoCode: code };
    },

    async resetPasswordWithCode(role, identifier, code, newPassword) {
      const normalizedRole = String(role || 'student').toLowerCase();
      const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
      const account = normalizedRole === 'teacher'
        ? resolveTeacherByIdentifier(normalizedIdentifier)
        : resolveStudentByIdentifier(normalizedIdentifier);
      if (!account) throw new Error('Account not found.');
      const key = `${normalizedRole}:${account.email}`;
      const map = loadResetCodes();
      const row = map[key];
      if (!row) throw new Error('No reset request found.');
      if (Date.now() > Number(row.expiresAt || 0)) throw new Error('Reset code expired.');
      if (String(code || '').trim() !== String(row.code || '')) throw new Error('Invalid verification code.');
      if (String(newPassword || '').length < 6) throw new Error('Password must be at least 6 characters.');
      const hash = await hashPassword(newPassword);
      if (normalizedRole === 'teacher') {
        const teacher = getTeacherByEmail(account.email);
        if (!teacher) throw new Error('Teacher account not found.');
        teacher.passwordHash = hash;
      } else {
        const student = getStudentByEmail(account.email);
        if (!student) throw new Error('Student account not found.');
        student.passwordHash = hash;
      }
      delete map[key];
      saveResetCodes(map);
      saveState();
      return true;
    },

    // --- SERVICES & PACKAGES ---
    async listServices() { return deepClone(state.services); },
    async createService(data) {
      const svc = normalizeService(data);
      svc.weeklySlots = (svc.weeklySlots || []).map(slot => ({ ...slot, day: Number(slot.day) }));
      state.services.push(svc);
      addSuggestion('serviceNames', svc.name);
      saveState();
      return svc;
    },
    async deleteService(id) {
      state.services = state.services.filter(s => s.id !== id);
      saveState();
    },
    async getPackages() { return deepClone(state.packages); },
    async savePackages(newPacks) { state.packages = newPacks; saveState(); },

    // --- SLOTS & CALENDAR ---
    async listBookableSlots(serviceId, date) {
      const service = getServiceById(serviceId);
      if (!service) return [];
      
      const [yy, mm, dd] = String(date).split('-').map(Number);
      if (!yy || !mm || !dd) return [];
      const dayIndex = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
      const daySchedules = (service.weeklySlots || []).filter(s => Number(s.day) === dayIndex && s.active !== false);
      if (!daySchedules.length) return [];

      const slots = [];
      daySchedules.forEach(daySchedule => {
        let current = parseMinutes(daySchedule.start);
        const end = parseMinutes(daySchedule.end);
        while (current + service.duration <= end) {
          const timeLabel = toTime(current);
          const bookings = state.bookings.filter(b =>
            b.serviceId === serviceId &&
            b.date === date &&
            b.time === timeLabel &&
            b.status !== 'cancelled'
          );
          slots.push({
            time: timeLabel,
            available: bookings.length < service.capacity,
            openSpots: Math.max(0, service.capacity - bookings.length)
          });
          current += service.duration;
        }
      });
      const dedup = {};
      slots.forEach(s => { dedup[s.time] = s; });
      return Object.values(dedup).sort((a,b) => a.time.localeCompare(b.time));
    },

    async getLowCreditStudents(limit = 1) {
      refillSubscriptionCreditsIfNeeded();
      return deepClone(state.students.filter(s => Number(s.credits || 0) <= Number(limit)).sort((a,b) => a.credits - b.credits));
    },

    async listExpenses() {
      return deepClone(state.expenses || []);
    },

    async rememberSuggestion(key, value) {
      addSuggestion(key, value);
    },

    async getSuggestions(key) {
      const map = loadSuggestions();
      return deepClone(map[key] || []);
    },

    // --- LEDGER & TRANSACTIONS ---
    async logTransaction(clientEmail, type, amount, description, revenue = 0, packageName = '') {
      state.ledger.push({
        id: uid('tx'),
        date: new Date().toISOString(),
        clientEmail: clientEmail.toLowerCase(),
        clientName: getStudentByEmail(clientEmail)?.name || "Unknown",
        type, 
        amount,
        revenue, 
        packageName,
        description
      });
      saveState();
    },

    async getTransactions() { return deepClone(state.ledger); },

    async getStudentLedger(email) {
      return state.ledger
        .filter(tx => tx.clientEmail === email.toLowerCase())
        .sort((a,b) => new Date(b.date) - new Date(a.date));
    },

    async purchasePackage(email, packageId) {
      const pkg = state.packages.find(p => p.id == packageId);
      if (!pkg) throw new Error("Package not found");
      
      await this.adjustCredits(email, pkg.count);
      await this.logTransaction(email, 'credit_in', pkg.count, `Purchased: ${pkg.name}`, pkg.price, pkg.name);
      return { newTotal: getStudentByEmail(email).credits };
    },

    // --- EXPENSES ---
    async addExpense(data) {
      state.expenses.push({
        id: uid('exp'),
        date: new Date().toISOString(),
        note: data.note,
        amount: Number(data.amount)
      });
      saveState();
    },

    async deleteExpense(expenseId) {
      state.expenses = (state.expenses || []).filter((e) => e.id !== expenseId);
      saveState();
      return true;
    },

    async getTaxConfig() {
      return { rate: Number((state.settings && state.settings.taxRate) || 0) };
    },

    async updateTaxConfig(rate) {
      const next = Number(rate);
      if (!Number.isFinite(next) || next < 0 || next > 1) throw new Error('Tax rate must be between 0 and 1.');
      state.settings = { ...(state.settings || {}), taxRate: next };
      saveState();
      return { rate: next };
    },

    async getSettings() {
      return deepClone(state.settings || {});
    },

    async updateSettings(patch = {}) {
      state.settings = { ...(state.settings || {}), ...patch };
      saveState();
      return deepClone(state.settings);
    },

    // --- BOOKINGS & LESSON NOTES ---
    async createBooking(data) {
      refillSubscriptionCreditsIfNeeded();
      const student = getStudentByEmail(data.clientEmail);
      if (!student) throw new Error("Student account not found.");
      const isForced = data.force === true;
      if (!isForced && student.credits < 1) throw new Error("Insufficient credits. Please purchase a package.");
      
      const service = getServiceById(data.serviceId);
      const booking = normalizeBooking({ ...data, serviceName: service.name, price: service.price });
      
      state.bookings.push(booking);
      if (student.credits > 0) {
        await this.adjustCredits(student.email, -1);
        await this.logTransaction(student.email, 'credit_out', 1, `Booking: ${service.name}`);
      }
      addSuggestion('emails', student.email);
      addSuggestion('notes', booking.notes);
      saveState();
      return booking;
    },

    async listBookings(filter = {}) {
      let b = [...state.bookings];
      if (filter.clientEmail) b = b.filter(x => x.clientEmail === filter.clientEmail.toLowerCase());
      if (filter.date) b = b.filter(x => x.date === filter.date);
      return deepClone(b);
    },

    async sendReminder(bookingId) {
      const links = await this.generateReminderLinks(bookingId);
      if (!links) throw new Error('Booking not found.');
      if (typeof window !== 'undefined' && window.open) {
        window.open(links.email, '_blank');
      }
      return links;
    },

    async getBookingDetails(bookingId) {
      return deepClone(state.bookings.find(x => x.id === bookingId));
    },

    async updateBookingNotes(bookingId, teacherNotes, homework) {
      const b = state.bookings.find(x => x.id === bookingId);
      if (!b) throw new Error("Booking not found");
      
      b.teacherNotes = teacherNotes;
      b.homework = homework;
      b.status = 'completed';
      saveState();
      return b;
    },

    async updateBookingStatus(bookingId, newStatus) {
      const b = state.bookings.find(x => x.id === bookingId);
      if (!b) throw new Error("Booking not found");
      b.status = newStatus;
      saveState();
    },

    // --- CANCELLATION LOGIC ---
    async calculateCancellationTerms(bookingId) {
      const b = state.bookings.find(x => x.id === bookingId);
      if (!b) throw new Error("Booking not found");
      
      const now = new Date();
      const lessonTime = new Date(`${b.date}T${b.time}`);
      const hoursDiff = (lessonTime - now) / (1000 * 60 * 60);
      
      if (hoursDiff < state.settings.cancelWindow) {
        return { fee: 1, message: `Less than ${state.settings.cancelWindow}h notice. No credit refund.` };
      }
      return { fee: 0, message: "Early cancellation. Credit will be refunded." };
    },

    // --- CREDITS & NOTIFICATIONS ---
    async listClients() {
      refillSubscriptionCreditsIfNeeded();
      return deepClone(state.students);
    },

    async listStudentDirectory(query = '') {
      const currentEmail = String(localStorage.getItem(STUDENT_SESSION_KEY) || '').toLowerCase();
      const q = String(query || '').trim().toLowerCase();
      const rows = state.students
        .filter((s) => s.email !== currentEmail)
        .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.includes(q) || String(s.username || '').includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 50)
        .map((s) => ({ name: s.name, username: s.username, email: s.email }));
      return deepClone(rows);
    },

    async updateClient(email, patch = {}) {
      const student = getStudentByEmail(email);
      if (!student) throw new Error('Student not found.');
      if (typeof patch.name === 'string') student.name = patch.name.trim() || student.name;
      if (typeof patch.phone === 'string') student.phone = patch.phone.replace(/[^0-9+]/g, '');
      if (typeof patch.paymentStatus === 'string') student.paymentStatus = patch.paymentStatus;
      if (typeof patch.isActive === 'boolean') student.isActive = patch.isActive;
      saveState();
      return deepClone(student);
    },
    
    async setStudentSubscription(email, isSubscription) {
      const student = getStudentByEmail(email);
      if (!student) throw new Error('Student not found.');
      student.isSubscription = isSubscription === true;
      if (student.isSubscription && !student.lastSubscriptionRefill) {
        student.lastSubscriptionRefill = monthKey();
        if (student.credits < 4) student.credits = 4;
      }
      if (!student.isSubscription) student.lastSubscriptionRefill = '';
      saveState();
      return deepClone(student);
    },

    async runMonthStartCheck() {
      const refilled = refillSubscriptionCreditsIfNeeded();
      return { refilled, month: monthKey() };
    },
    
    async adjustCredits(email, amount) {
      refillSubscriptionCreditsIfNeeded();
      const student = getStudentByEmail(email);
      if (student) {
        student.credits = Math.max(0, student.credits + amount);
        saveState();
      }
    },

    async getPendingReminders() {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      return state.bookings.filter(b => b.date === tomorrow && b.status === 'confirmed');
    },

    async getUpcomingLessonNudges(hours = 24) {
      const now = new Date();
      const maxMs = Number(hours || 24) * 60 * 60 * 1000;
      return deepClone(
        state.bookings
          .filter((b) => b.status === 'confirmed' || b.status === 'pending')
          .map((b) => {
            const when = new Date(`${b.date}T${b.time}`);
            if (Number.isNaN(when.getTime())) return null;
            return {
              ...b,
              startsAt: when.toISOString(),
              hoursLeft: Number(((when.getTime() - now.getTime()) / (60 * 60 * 1000)).toFixed(1))
            };
          })
          .filter(Boolean)
          .filter((b) => {
            const diff = new Date(b.startsAt).getTime() - now.getTime();
            return diff >= 0 && diff <= maxMs;
          })
          .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
      );
    },

    async generateReminderLinks(bookingId) {
      const b = state.bookings.find(x => x.id === bookingId);
      if (!b) return null;
      const msg = `Hi ${b.clientName}, reminder for your ${b.serviceName} tomorrow at ${b.time}. See you then!`;
      return {
        whatsapp: `https://wa.me/${b.clientPhone || ''}?text=${encodeURIComponent(msg)}`,
        email: `mailto:${b.clientEmail}?subject=Reminder&body=${encodeURIComponent(msg)}`
      };
    },

    async getEmailTemplate(type, data) {
      if (type === 'PURCHASE_RECEIPT') {
        const body = `Hi ${data.clientName},\n\nThank you for your purchase!\nPackage: ${data.packageName}\nCredits Added: ${data.credits}\nAmount: $${data.amount}\n\nBook your sessions in the portal.\n\nBest,\nStudioFlow Team`;
        return {
          mailto: `mailto:${data.clientEmail}?subject=Receipt&body=${encodeURIComponent(body)}`
        };
      }
    },

    // --- FINANCIAL REPORTING ---
    async getFinancialSummary() {
      const gross = state.ledger.reduce((acc, tx) => acc + (tx.revenue || 0), 0);
      const expenses = state.expenses.reduce((acc, exp) => acc + exp.amount, 0);
      const tax = (gross - expenses) > 0 ? (gross - expenses) * (state.settings.taxRate || 0.2) : 0;
      return { gross, expenses, tax, profit: gross - expenses - tax };
    },

    async createLessonRecap(payload) {
      const booking = state.bookings.find((x) => x.id === payload.bookingId);
      if (!booking) throw new Error('Booking not found.');
      const summary = String(payload.summary || '').trim();
      if (!summary) throw new Error('Recap summary is required.');

      const recap = normalizeRecap({
        bookingId: booking.id,
        studentEmail: booking.clientEmail,
        studentName: booking.clientName,
        serviceName: booking.serviceName,
        date: booking.date,
        time: booking.time,
        summary,
        resources: parseResourceLinks(payload.resources),
        teacherEmail: localStorage.getItem(TEACHER_SESSION_KEY) || ''
      });

      const existingIndex = state.lessonRecaps.findIndex((r) => r.bookingId === booking.id);
      if (existingIndex >= 0) state.lessonRecaps.splice(existingIndex, 1, recap);
      else state.lessonRecaps.push(recap);

      saveState();
      return deepClone(recap);
    },

    async listLessonRecaps(filter = {}) {
      let rows = [...state.lessonRecaps];
      if (filter.studentEmail) {
        const email = String(filter.studentEmail).toLowerCase();
        rows = rows.filter((x) => x.studentEmail === email);
      }
      if (filter.bookingId) rows = rows.filter((x) => x.bookingId === filter.bookingId);
      rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return deepClone(rows);
    },

    async sendPrivateStudentMessage(toIdentifier, body) {
      const fromEmail = String(localStorage.getItem(STUDENT_SESSION_KEY) || '').toLowerCase();
      if (!fromEmail) throw new Error('No active student session.');
      const fromStudent = getStudentByEmail(fromEmail);
      if (!fromStudent) throw new Error('Student account not found.');
      const toStudent = resolveStudentByIdentifier(toIdentifier);
      if (!toStudent) throw new Error('Recipient not found.');
      if (toStudent.email === fromEmail) throw new Error('You cannot message yourself.');
      const text = String(body || '').trim();
      if (!text) throw new Error('Message cannot be empty.');
      const msg = normalizeMessage({
        fromEmail,
        toEmail: toStudent.email,
        body: text,
        createdAt: new Date().toISOString(),
        readBy: [fromEmail]
      });
      state.privateMessages.push(msg);
      saveState();
      return deepClone(msg);
    },

    async listPrivateStudentMessages(peerIdentifier) {
      const currentEmail = String(localStorage.getItem(STUDENT_SESSION_KEY) || '').toLowerCase();
      if (!currentEmail) throw new Error('No active student session.');
      const peer = resolveStudentByIdentifier(peerIdentifier);
      if (!peer) throw new Error('Recipient not found.');
      const rows = state.privateMessages
        .filter((m) => {
          const mineToPeer = m.fromEmail === currentEmail && m.toEmail === peer.email;
          const peerToMine = m.fromEmail === peer.email && m.toEmail === currentEmail;
          return mineToPeer || peerToMine;
        })
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return deepClone(rows);
    },

    async listStudentMessageThreads() {
      const currentEmail = String(localStorage.getItem(STUDENT_SESSION_KEY) || '').toLowerCase();
      if (!currentEmail) throw new Error('No active student session.');
      const mine = state.privateMessages.filter((m) => m.fromEmail === currentEmail || m.toEmail === currentEmail);
      const grouped = {};
      mine.forEach((msg) => {
        const peerEmail = msg.fromEmail === currentEmail ? msg.toEmail : msg.fromEmail;
        if (!grouped[peerEmail]) grouped[peerEmail] = [];
        grouped[peerEmail].push(msg);
      });
      const rows = Object.keys(grouped).map((peerEmail) => {
        const peer = getStudentByEmail(peerEmail);
        const messages = grouped[peerEmail].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const last = messages[messages.length - 1];
        const unread = messages.filter((m) => m.toEmail === currentEmail && !m.readBy.includes(currentEmail)).length;
        return {
          peerEmail,
          peerName: peer ? peer.name : peerEmail,
          peerUsername: peer ? peer.username : '',
          lastMessage: last ? last.body : '',
          lastAt: last ? last.createdAt : '',
          unreadCount: unread
        };
      }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
      return deepClone(rows);
    },

    async markStudentThreadRead(peerIdentifier) {
      const currentEmail = String(localStorage.getItem(STUDENT_SESSION_KEY) || '').toLowerCase();
      if (!currentEmail) throw new Error('No active student session.');
      const peer = resolveStudentByIdentifier(peerIdentifier);
      if (!peer) throw new Error('Recipient not found.');
      let changed = false;
      state.privateMessages.forEach((m) => {
        const isUnreadIncoming = m.fromEmail === peer.email && m.toEmail === currentEmail && !m.readBy.includes(currentEmail);
        if (isUnreadIncoming) {
          m.readBy.push(currentEmail);
          changed = true;
        }
      });
      if (changed) saveState();
      return true;
    },

    async deleteStudentByEmail(email) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const exists = getStudentByEmail(normalizedEmail);
      if (!exists) throw new Error('Student not found.');
      state.students = state.students.filter((s) => s.email !== normalizedEmail);
      state.bookings = state.bookings.filter((b) => b.clientEmail !== normalizedEmail);
      state.lessonRecaps = state.lessonRecaps.filter((r) => r.studentEmail !== normalizedEmail);
      state.ledger = state.ledger.filter((tx) => tx.clientEmail !== normalizedEmail);
      state.privateMessages = state.privateMessages.filter((m) => m.fromEmail !== normalizedEmail && m.toEmail !== normalizedEmail);
      saveState();
      if (localStorage.getItem(STUDENT_SESSION_KEY) === normalizedEmail) {
        localStorage.removeItem(STUDENT_SESSION_KEY);
      }
      return true;
    },

    async deleteCurrentStudent() {
      const email = localStorage.getItem(STUDENT_SESSION_KEY);
      if (!email) throw new Error("No active session");
      await this.deleteStudentByEmail(email);
      await deleteNetlifyCurrentUser();
      localStorage.removeItem(STUDENT_SESSION_KEY);
      return true;
    },

    async deleteCurrentTeacher() {
      const email = localStorage.getItem(TEACHER_SESSION_KEY);
      if (!email) throw new Error('No active teacher session.');
      const normalizedEmail = String(email).toLowerCase();
      const teacher = getTeacherByEmail(normalizedEmail);
      if (teacher && teacher.isBuiltIn === true) throw new Error('Built-in teacher account cannot be deleted.');
      state.teachers = state.teachers.filter((t) => t.email !== normalizedEmail);
      localStorage.removeItem(TEACHER_SESSION_KEY);
      saveState();
      await deleteNetlifyCurrentUser();
      return true;
    }
  };

  window.StudioFlowAPI = api;

  // Global UX: Enter key submit + native suggestions via datalist
  if (typeof document !== 'undefined') {
    const initGlobalUx = () => {
      const map = {
        email: 'emails',
        regEmail: 'emails',
        loginEmail: 'emails',
        clientEmail: 'emails',
        name: 'names',
        regName: 'names',
        srvName: 'serviceNames',
        expNote: 'notes',
        clientNotes: 'notes'
      };

      const getListId = (key) => `sf-suggest-${key}`;
      const ensureList = (key) => {
        const id = getListId(key);
        let dl = document.getElementById(id);
        if (!dl) {
          dl = document.createElement('datalist');
          dl.id = id;
          document.body.appendChild(dl);
        }
        const mapData = loadSuggestions();
        dl.innerHTML = (mapData[key] || []).map(v => `<option value="${safeText(v)}"></option>`).join('');
        return id;
      };

      Object.entries(map).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.setAttribute('list', ensureList(key));
          if (id.toLowerCase().includes('email')) el.setAttribute('autocomplete', 'email');
          if (id.toLowerCase().includes('name')) el.setAttribute('autocomplete', 'name');
          el.addEventListener('blur', () => {
            addSuggestion(key, el.value);
            ensureList(key);
          });
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target;
        if (!target || target.tagName === 'TEXTAREA') return;
        if (!['INPUT', 'SELECT'].includes(target.tagName)) return;

        const form = target.closest('form');
        if (form) {
          e.preventDefault();
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], #submitBtn, #btnMainAction, #btnLogin, #btnBook');
          if (submitBtn) submitBtn.click();
          else if (typeof form.requestSubmit === 'function') form.requestSubmit();
          return;
        }

        const scope = target.closest('.card, main, section, body') || document.body;
        const actionBtn = scope.querySelector('#btnMainAction, #loginBtn, #submitBtn, #btnBook, .btn-primary, .btn-action, .cta-book');
        if (actionBtn && !actionBtn.disabled) {
          e.preventDefault();
          actionBtn.click();
        }
      });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGlobalUx);
    else initGlobalUx();
  }
})();

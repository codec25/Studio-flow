(function () {
  const STORE_KEY = 'studioflow_v3';
  const STUDENT_SESSION_KEY = 'studioflow_student_session';
  const TEACHER_SESSION_KEY = 'studioflow_teacher_session';
  const STATUS_VALUES = ['pending', 'confirmed', 'completed', 'cancelled', 'cancelled_late'];

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
      email: String(student.email || '').trim().toLowerCase(),
      phone: String(student.phone || '').replace(/[^0-9+]/g, ''),
      passwordHash: String(student.passwordHash || ''),
      credits: Number(student.credits || 0),
      isActive: student.isActive !== false
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

  // --- STATE PERSISTENCE ---
  function emptyState() {
    return {
      services: [], bookings: [], students: [], teachers: [],
      packages: [
        {id: 1, name: "Single Session", count: 1, price: 60},
        {id: 2, name: "5-Lesson Pack", count: 5, price: 275},
        {id: 3, name: "10-Lesson Pack", count: 10, price: 500}
      ],
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
        students: (parsed.students || []).map(normalizeStudent)
      };
    } catch (e) { return emptyState(); }
  }

  let state = loadState();
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

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
    async loginStudent(email, password) {
      const user = getStudentByEmail(email);
      if (!user) throw new Error('Account not found.');
      const hash = await hashPassword(password);
      if (hash !== user.passwordHash) throw new Error('Invalid password.');
      localStorage.setItem(STUDENT_SESSION_KEY, user.email);
      return deepClone(user);
    },

    async getCurrentStudent() {
      const email = localStorage.getItem(STUDENT_SESSION_KEY);
      const student = email ? getStudentByEmail(email) : null;
      return student ? deepClone(student) : null;
    },

    async registerStudent(data) {
      if (getStudentByEmail(data.email)) throw new Error('Email already exists.');
      const student = normalizeStudent({ ...data, passwordHash: await hashPassword(data.password) });
      state.students.push(student);
      saveState();
      return deepClone(student);
    },

    async getCurrentTeacher() {
      const email = localStorage.getItem(TEACHER_SESSION_KEY);
      const teacher = email ? getTeacherByEmail(email) : null;
      return teacher ? deepClone(teacher) : null;
    },

    async loginTeacher(email, password) {
      const user = getTeacherByEmail(email);
      if (!user) throw new Error('Teacher account not found.');
      const hash = await hashPassword(password);
      if (hash !== user.passwordHash) throw new Error('Invalid password.');
      localStorage.setItem(TEACHER_SESSION_KEY, user.email);
      return deepClone(user);
    },

    async registerTeacher(data) {
      if (getTeacherByEmail(data.email)) throw new Error('Teacher email already exists.');
      const teacher = {
        id: uid('tch'),
        name: String(data.name || '').trim(),
        email: String(data.email || '').trim().toLowerCase(),
        passwordHash: await hashPassword(data.password)
      };
      state.teachers.push(teacher);
      saveState();
      return deepClone(teacher);
    },

    // --- SERVICES & PACKAGES ---
    async listServices() { return deepClone(state.services); },
    async createService(data) {
      const svc = normalizeService(data);
      state.services.push(svc);
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
      
      const dayIndex = new Date(date).getUTCDay();
      const daySchedule = service.weeklySlots.find(s => s.day === dayIndex && s.active !== false);
      if (!daySchedule) return [];

      const slots = [];
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
          openSpots: service.capacity - bookings.length
        });
        current += service.duration; 
      }
      return slots;
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

    // --- BOOKINGS & LESSON NOTES ---
    async createBooking(data) {
      const student = getStudentByEmail(data.clientEmail);
      if (!student || student.credits < 1) throw new Error("Insufficient credits. Please purchase a package.");
      
      const service = getServiceById(data.serviceId);
      const booking = normalizeBooking({ ...data, serviceName: service.name, price: service.price });
      
      state.bookings.push(booking);
      await this.adjustCredits(student.email, -1);
      await this.logTransaction(student.email, 'credit_out', 1, `Booking: ${service.name}`);
      saveState();
      return booking;
    },

    async listBookings(filter = {}) {
      let b = [...state.bookings];
      if (filter.clientEmail) b = b.filter(x => x.clientEmail === filter.clientEmail.toLowerCase());
      if (filter.date) b = b.filter(x => x.date === filter.date);
      return deepClone(b);
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
    async listClients() { return deepClone(state.students); },
    
    async adjustCredits(email, amount) {
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

    async deleteCurrentStudent() {
      const email = localStorage.getItem(STUDENT_SESSION_KEY);
      if (!email) throw new Error("No active session");
      state.students = state.students.filter(s => s.email !== email);
      state.bookings = state.bookings.filter(b => b.clientEmail !== email);
      localStorage.removeItem(STUDENT_SESSION_KEY);
      saveState();
    }
  };

  window.StudioFlowAPI = api;
})();
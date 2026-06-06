// ============================================================
// YashTech Labs – Local Database Engine
// No external services required. All data stored in browser localStorage.
// ============================================================

"use strict";

// ============================================================
// LOCAL DATABASE ENGINE (localStorage-based)
// ============================================================
class LocalDocRef {
  constructor(collectionPath, docId) {
    this.collectionPath = collectionPath;
    this.id = docId;
  }

  _getStoreKey() {
    // For well-known singleton docs, use dedicated keys
    if (this.collectionPath === 'settings' && this.id === 'main') return 'yt_db_settings';
    if (this.collectionPath === 'admin_config' && this.id === 'credentials') return 'yt_db_credentials';
    return null;
  }

  async get() {
    const storeKey = this._getStoreKey();
    let data = null;

    if (storeKey) {
      const stored = localStorage.getItem(storeKey);
      data = stored ? JSON.parse(stored) : null;
    } else {
      const list = JSON.parse(localStorage.getItem('yt_db_' + this.collectionPath) || '[]');
      const found = list.find(item => item.id === this.id);
      data = found ? { ...found } : null;
    }

    return { exists: data !== null, id: this.id, data: () => data };
  }

  async set(data, options) {
    const storeKey = this._getStoreKey();

    if (storeKey) {
      if (options && options.merge) {
        const existing = JSON.parse(localStorage.getItem(storeKey) || '{}');
        localStorage.setItem(storeKey, JSON.stringify({ ...existing, ...data }));
      } else {
        localStorage.setItem(storeKey, JSON.stringify(data));
      }
    } else {
      const key = 'yt_db_' + this.collectionPath;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const idx = list.findIndex(item => item.id === this.id);
      const docData = { ...data, id: this.id };

      if (idx !== -1) {
        list[idx] = (options && options.merge) ? { ...list[idx], ...docData } : docData;
      } else {
        list.push(docData);
      }
      localStorage.setItem(key, JSON.stringify(list));
    }
    return true;
  }

  async update(data) {
    return this.set(data, { merge: true });
  }

  async delete() {
    const storeKey = this._getStoreKey();
    if (storeKey) {
      localStorage.removeItem(storeKey);
    } else {
      const key = 'yt_db_' + this.collectionPath;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify(list.filter(item => item.id !== this.id)));
    }
    return true;
  }

  collection(subPath) {
    return new LocalCollectionRef(this.collectionPath + '/' + this.id + '/' + subPath);
  }
}

class LocalCollectionRef {
  constructor(path) {
    this.path = path;
    this._limit = null;
    this._where = null;
    this._orderBy = null;
  }

  doc(id) {
    return new LocalDocRef(this.path, id || _generateId());
  }

  limit(n) { const c = this._clone(); c._limit = n; return c; }
  where(field, op, val) { const c = this._clone(); c._where = { field, op, val }; return c; }
  orderBy(field, dir) { const c = this._clone(); c._orderBy = { field, dir: dir || 'asc' }; return c; }

  _clone() {
    const c = new LocalCollectionRef(this.path);
    c._limit = this._limit;
    c._where = this._where;
    c._orderBy = this._orderBy;
    return c;
  }

  async add(data) {
    const id = _generateId();
    const key = 'yt_db_' + this.path;
    const list = JSON.parse(localStorage.getItem(key) || '[]');

    // Convert timestamps
    const itemData = { ...data, id: id };
    if (!itemData.submittedAt) itemData.submittedAt = new Date().toISOString();
    if (!itemData.createdAt) itemData.createdAt = new Date().toISOString();

    list.push(itemData);
    localStorage.setItem(key, JSON.stringify(list));
    return { id: id };
  }

  async get() {
    const key = 'yt_db_' + this.path;
    let list = JSON.parse(localStorage.getItem(key) || '[]');

    // Filter
    if (this._where) {
      const { field, op, val } = this._where;
      list = list.filter(item => {
        const itemVal = item[field];
        if (op === '==') return itemVal === val;
        if (op === '!=') return itemVal !== val;
        if (op === '>=') {
          const cmp = _toComparable(val);
          const itemCmp = _toComparable(itemVal);
          return itemCmp >= cmp;
        }
        if (op === '<=') {
          const cmp = _toComparable(val);
          const itemCmp = _toComparable(itemVal);
          return itemCmp <= cmp;
        }
        return true;
      });
    }

    // Sort
    if (this._orderBy) {
      const { field, dir } = this._orderBy;
      list.sort((a, b) => {
        let va = _toComparable(a[field] || '');
        let vb = _toComparable(b[field] || '');
        if (typeof va === 'string' && typeof vb === 'string') {
          return dir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
        }
        return dir === 'desc' ? vb - va : va - vb;
      });
    }

    // Limit
    if (this._limit) {
      list = list.slice(0, this._limit);
    }

    // Wrap each item as a doc snapshot
    const docs = list.map(item => _wrapDoc(item));

    return {
      empty: docs.length === 0,
      size: docs.length,
      docs: docs,
      forEach: (cb) => docs.forEach(cb)
    };
  }
}

class LocalDB {
  collection(path) {
    return new LocalCollectionRef(path);
  }
  batch() {
    const ops = [];
    return {
      set: (docRef, data) => { ops.push(() => docRef.set(data)); },
      update: (docRef, data) => { ops.push(() => docRef.update(data)); },
      delete: (docRef) => { ops.push(() => docRef.delete()); },
      commit: async () => { for (const op of ops) await op(); }
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────
function _generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function _toComparable(val) {
  if (val === null || val === undefined) return '';
  if (val && typeof val === 'object' && typeof val.toDate === 'function') {
    return val.toDate().getTime();
  }
  if (val instanceof Date) return val.getTime();
  // ISO date strings
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    return new Date(val).getTime();
  }
  return val;
}

function _wrapDoc(item) {
  // Convert string timestamps to objects with .toDate()
  const wrapped = { ...item };
  ['submittedAt', 'createdAt', 'updatedAt'].forEach(key => {
    if (wrapped[key] && typeof wrapped[key] === 'string') {
      const d = new Date(wrapped[key]);
      if (!isNaN(d.getTime())) {
        wrapped[key] = { toDate: () => d, seconds: Math.floor(d.getTime() / 1000) };
      }
    }
  });

  return {
    id: item.id,
    exists: true,
    data: () => wrapped
  };
}

// ── Initialize Global Database ──────────────────────────────
const db = new LocalDB();

// ============================================================
// Default Data Seeding
// ============================================================
async function initializeDefaultSettings() {
  try {
    const settingsRef = db.collection("settings").doc("main");
    const snap = await settingsRef.get();
    if (!snap.exists) {
      await settingsRef.set({
        companyName: "YashTech Labs Pvt. Ltd.",
        companyPhone: "+91 98765 43210",
        companyEmail: "hello@yashtechlabs.com",
        companyAddress: "Jaipur, Rajasthan, India",
        whatsappNumber: "919876543210",
        instagramUrl: "https://instagram.com/yashtechlabs",
        facebookUrl: "https://facebook.com/yashtechlabs",
        linkedinUrl: "https://linkedin.com/company/yashtechlabs",
        twitterUrl: "https://twitter.com/yashtechlabs",
        tagline: "Crafted for Growth",
        adminPasswordHash: ""
      });
      console.log("[YashTech] Default settings created.");
    }
  } catch (err) {
    console.warn("[YashTech] Settings init warning:", err.message);
  }
}

async function seedPortfolio() {
  try {
    const portfolioRef = db.collection("portfolio");
    const snap = await portfolioRef.get();
    
    let needsReSeed = snap.empty;
    if (!snap.empty) {
      const firstDoc = snap.docs[0].data();
      if (!firstDoc.features) {
        needsReSeed = true;
        for (const doc of snap.docs) {
          await portfolioRef.doc(doc.id).delete();
        }
        console.log("[YashTech] Cleared old portfolio items for re-seeding.");
      }
    }

    if (needsReSeed) {
      const items = [
        {
          title: "Cafe QR Ordering App",
          description: "A modern QR-based ordering system for cafes and restaurants. Customers scan, browse, and order from their phones.",
          technologies: ["Flutter", "Firebase", "Node.js"],
          category: "Mobile App",
          imageUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
          projectUrl: "#",
          features: [
            "Instant QR scanning & digital menu loading",
            "Real-time order tracking for customers & kitchen staff",
            "Integrated UPI and credit card payments",
            "Admin dashboard for menu customization and pricing"
          ],
          createdAt: new Date().toISOString()
        },
        {
          title: "Library Management System",
          description: "Complete library management with book tracking, member management, and automated fine calculation.",
          technologies: ["React", "Node.js", "PostgreSQL"],
          category: "Web App",
          imageUrl: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=800&q=80",
          projectUrl: "#",
          features: [
            "Barcode generation & scanning integration",
            "Automated due date alerts and fine calculator",
            "Member portal to request, hold, or renew books",
            "Advanced search by author, title, or genre classification"
          ],
          createdAt: new Date().toISOString()
        },
        {
          title: "School Management System",
          description: "End-to-end school ERP with attendance, grades, fees, and parent communication portal.",
          technologies: ["Next.js", "MongoDB", "Firebase"],
          category: "Web App",
          imageUrl: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=800&q=80",
          projectUrl: "#",
          features: [
            "Secure parent-teacher communication board",
            "Student grading history and attendance tracking",
            "Online fee payment gateway with auto-receipts",
            "Exam timetable scheduler and automated reports"
          ],
          createdAt: new Date().toISOString()
        },
        {
          title: "E-Commerce Website",
          description: "High-converting e-commerce platform with inventory management, payment gateway, and analytics.",
          technologies: ["Next.js", "Stripe", "PostgreSQL"],
          category: "E-Commerce",
          imageUrl: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=800&q=80",
          projectUrl: "#",
          features: [
            "Advanced product search, filters, and categories",
            "Secure checkout with Stripe and card integrations",
            "Live inventory level notifications and low-stock alerts",
            "Sales analytics dashboard with PDF/CSV report exports"
          ],
          createdAt: new Date().toISOString()
        },
        {
          title: "Custom Business Website",
          description: "Premium corporate website with CMS, SEO optimization, and conversion-focused landing pages.",
          technologies: ["React", "Node.js", "MongoDB"],
          category: "Website",
          imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
          projectUrl: "#",
          features: [
            "Custom integrated Content Management System (CMS)",
            "Optimized metadata, sitemaps, and robots configuration",
            "Ultra-fast page speed rating (95+ on mobile/desktop)",
            "Lead generation forms, dynamic quotes, and analytics"
          ],
          createdAt: new Date().toISOString()
        }
      ];
      const batch = db.batch();
      items.forEach(item => batch.set(portfolioRef.doc(), item));
      await batch.commit();
      console.log("[YashTech] Portfolio seeded.");
    }
  } catch (err) {
    console.warn("[YashTech] Portfolio seed warning:", err.message);
  }
}

async function seedTestimonials() {
  try {
    const testimonialsRef = db.collection("testimonials");
    const snap = await testimonialsRef.limit(1).get();
    if (snap.empty) {
      const testimonials = [
        { name: "Rajesh Sharma", company: "Sharma Foods", rating: 5, text: "YashTech Labs delivered our restaurant app in just 3 weeks. The quality exceeded our expectations and our customers love the experience.", photoUrl: "", createdAt: new Date().toISOString() },
        { name: "Priya Mehta", company: "EduCare Institute", rating: 5, text: "Our school management system has transformed how we operate. Attendance, fees, and communication are now seamless.", photoUrl: "", createdAt: new Date().toISOString() },
        { name: "Amit Verma", company: "Verma Enterprises", rating: 5, text: "The e-commerce website they built for us tripled our online sales within the first month. Truly professional team.", photoUrl: "", createdAt: new Date().toISOString() },
        { name: "Sneha Kapoor", company: "SK Consultancy", rating: 5, text: "From design to delivery, the entire process was smooth and transparent. Our website gets compliments from every visitor.", photoUrl: "", createdAt: new Date().toISOString() }
      ];
      const batch = db.batch();
      testimonials.forEach(t => batch.set(testimonialsRef.doc(), t));
      await batch.commit();
      console.log("[YashTech] Testimonials seeded.");
    }
  } catch (err) {
    console.warn("[YashTech] Testimonials seed warning:", err.message);
  }
}

// Run all seeders
(async function runInit() {
  await initializeDefaultSettings();
  await seedPortfolio();
  await seedTestimonials();
})();

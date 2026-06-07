/* ============================================================
   YashTech Labs – Main JavaScript
   Crafted for Growth
   ============================================================ */

"use strict";

// ── Global state ─────────────────────────────────────────────
let siteSettings = {};
let testimonialData = [];
let carouselIndex = 0;
let carouselTimer = null;
let carouselSlideSize = 2; // testimonials per slide

// ── 1. Loading Screen ─────────────────────────────────────────
function initLoadingScreen() {
  const screen = document.getElementById("loading-screen");
  if (!screen) return;
  setTimeout(() => {
    screen.classList.add("hidden");
    document.body.style.overflow = "";
  }, 1600);
}

// ── 2. Navbar: scroll shrink + mobile toggle ──────────────────
function initNavbar() {
  const navbar = document.getElementById("navbar");
  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobile-nav");

  if (!navbar) return;

  // Scroll shrink
  function onNavScroll() {
    if (window.scrollY > 40) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
    updateActiveLinks();
  }

  window.addEventListener("scroll", onNavScroll, { passive: true });
  onNavScroll();

  // Hamburger toggle
  if (hamburger && mobileNav) {
    hamburger.addEventListener("click", () => {
      const isOpen = hamburger.classList.toggle("open");
      mobileNav.classList.toggle("open", isOpen);
      document.body.style.overflow = isOpen ? "hidden" : "";
    });
  }
}

function closeMobileNav() {
  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobile-nav");
  if (hamburger) hamburger.classList.remove("open");
  if (mobileNav) mobileNav.classList.remove("open");
  document.body.style.overflow = "";
}

// Close mobile nav when any link is clicked
function initMobileNavLinks() {
  const mobileNav = document.getElementById("mobile-nav");
  if (!mobileNav) return;
  mobileNav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMobileNav);
  });
}

// Active nav link based on scroll position
function updateActiveLinks() {
  const sections = document.querySelectorAll("section[id]");
  const navLinks = document.querySelectorAll(".nav-links a, .mobile-nav a");
  let current = "";

  sections.forEach(section => {
    const sectionTop = section.offsetTop - 120;
    if (window.scrollY >= sectionTop) {
      current = section.getAttribute("id");
    }
  });

  navLinks.forEach(link => {
    link.classList.remove("active");
    if (link.getAttribute("href") === `#${current}`) {
      link.classList.add("active");
    }
  });
}

// ── 3. Dark / Light Mode Toggle ───────────────────────────────
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  const root = document.documentElement;

  // Restore saved preference
  const saved = localStorage.getItem("yt-theme") || "dark";
  root.setAttribute("data-theme", saved);
  updateThemeIcon(saved);

  if (!btn) return;

  btn.addEventListener("click", () => {
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("yt-theme", next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const sunIcon = document.getElementById("icon-sun");
  const moonIcon = document.getElementById("icon-moon");
  if (sunIcon && moonIcon) {
    if (theme === "dark") {
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    } else {
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    }
  }
}

// ── 4. Scroll Animations (IntersectionObserver) ───────────────
function initScrollAnimations() {
  const animatedEls = document.querySelectorAll(".fade-in-up, .scale-in");

  if (!("IntersectionObserver" in window)) {
    animatedEls.forEach(el => {
      el.classList.add("visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -48px 0px" }
  );

  animatedEls.forEach(el => observer.observe(el));
}

// ── 5. Counter Animation ──────────────────────────────────────
function animateCounter(el, target, suffix, duration) {
  const start = 0;
  const startTime = performance.now();

  function update(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + eased * target);
    el.textContent = current + suffix;
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function initCounters() {
  const counters = document.querySelectorAll("[data-counter]");
  if (!counters.length) return;

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.counter, 10);
          const suffix = el.dataset.suffix || "";
          const duration = parseInt(el.dataset.duration, 10) || 1800;
          animateCounter(el, target, suffix, duration);
          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach(el => observer.observe(el));
}

// ── 6. Load Settings from Firestore ──────────────────────────
async function loadSettings() {
  try {
    const snap = await db.collection("settings").doc("main").get();
    if (snap.exists) {
      siteSettings = snap.data();
      applySettings(siteSettings);
    }
  } catch (err) {
    console.warn("[YashTech] Could not load settings:", err.message);
  }
}

function applySettings(s) {
  // Update brand logos dynamically
  if (s.logo) {
    const favicon = document.getElementById("favicon");
    if (favicon) favicon.href = s.logo;

    const navLogoImg = document.getElementById("nav-logo-img");
    if (navLogoImg) navLogoImg.src = s.logo;

    const loadingLogoImg = document.getElementById("loading-logo-img");
    if (loadingLogoImg) loadingLogoImg.src = s.logo;

    const footerLogoImg = document.getElementById("footer-logo-img");
    if (footerLogoImg) footerLogoImg.src = s.logo;
  }

  // WhatsApp links (float + contact + footer)
  const waLinks = document.querySelectorAll("[data-social='whatsapp'], #whatsapp-float");
  waLinks.forEach(el => {
    if (s.whatsappNumber) {
      el.href = `https://wa.me/${s.whatsappNumber}`;
    }
  });

  // Instagram link in header and footer
  const instLinks = document.querySelectorAll("[data-social='instagram']");
  instLinks.forEach(el => {
    el.href = s.instagramUrl || "#";
  });

  // Facebook
  const fbLinks = document.querySelectorAll("[data-social='facebook']");
  fbLinks.forEach(el => {
    el.href = s.facebookUrl || "#";
  });

  // LinkedIn
  const liLinks = document.querySelectorAll("[data-social='linkedin']");
  liLinks.forEach(el => {
    el.href = s.linkedinUrl || "#";
  });

  // Twitter
  const twLinks = document.querySelectorAll("[data-social='twitter']");
  twLinks.forEach(el => {
    el.href = s.twitterUrl || "#";
  });

  // Footer and contact phone
  const phoneEls = document.querySelectorAll("[data-info='phone']");
  phoneEls.forEach(el => {
    el.textContent = s.companyPhone || "";
    if (el.tagName === "A") el.href = `tel:${s.companyPhone || ""}`;
  });

  // Footer and contact email
  const emailEls = document.querySelectorAll("[data-info='email']");
  emailEls.forEach(el => {
    el.textContent = s.companyEmail || "";
    if (el.tagName === "A") el.href = `mailto:${s.companyEmail || ""}`;
  });

  // Footer address
  const addressEls = document.querySelectorAll("[data-info='address']");
  addressEls.forEach(el => {
    el.textContent = s.companyAddress || "";
  });
}

// ── 7. Load Portfolio from Firestore ──────────────────────────
async function loadPortfolio() {
  const grid = document.getElementById("portfolio-grid");
  if (!grid) return;

  // Show skeletons
  grid.innerHTML = Array(3).fill(`
    <div class="portfolio-skeleton">
      <div class="skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line full"></div>
        <div class="skeleton-line full"></div>
      </div>
    </div>
  `).join("");

  try {
    const snap = await db.collection("portfolio").orderBy("createdAt", "asc").get();
    if (snap.empty) {
      grid.innerHTML = `<div class="text-center" style="grid-column:1/-1;color:var(--text-secondary);padding:48px 0;">No portfolio items found.</div>`;
      return;
    }

    const cards = snap.docs.map(doc => {
      const d = doc.data();
      const techTags = (d.technologies || []).map(t => `<span class="portfolio-tag">${t}</span>`).join("");
      const imgContent = d.imageUrl
        ? `<img src="${d.imageUrl}" alt="${d.title}" loading="lazy" />`
        : `<div class="portfolio-placeholder">💻</div>`;

      return `
        <div class="portfolio-card fade-in-up" onclick="openPortfolioDetail('${doc.id}')" style="cursor:pointer;">
          <div class="portfolio-img-wrap">
            ${imgContent}
            <div class="portfolio-overlay">
              <button class="portfolio-overlay-btn" onclick="event.stopPropagation(); openPortfolioDetail('${doc.id}')">View Details →</button>
            </div>
          </div>
          <div class="portfolio-body">
            <span class="portfolio-category">${d.category || "Project"}</span>
            <h3 class="portfolio-title">${d.title}</h3>
            <p class="portfolio-desc">${d.description}</p>
            <div class="portfolio-tags">${techTags}</div>
          </div>
        </div>
      `;
    });

    grid.innerHTML = cards.join("");

    // Re-observe new elements
    setTimeout(initScrollAnimations, 50);
  } catch (err) {
    console.warn("[YashTech] Could not load portfolio:", err.message);
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--text-secondary);padding:48px 0;text-align:center;">Failed to load portfolio. Check Firebase config.</div>`;
  }
}

// ── 8. Load Testimonials from Firestore ───────────────────────
async function loadTestimonials() {
  try {
    const snap = await db.collection("testimonials").orderBy("createdAt", "asc").get();
    if (!snap.empty) {
      testimonialData = snap.docs.map(doc => doc.data());
    }
    renderTestimonials();
  } catch (err) {
    console.warn("[YashTech] Could not load testimonials:", err.message);
    renderTestimonials();
  }
}

function renderTestimonials() {
  const track = document.getElementById("testimonial-track");
  const dotsContainer = document.getElementById("carousel-dots");
  if (!track) return;

  if (!testimonialData.length) {
    track.innerHTML = `<div class="testimonial-slide"><p style="color:var(--text-secondary)">No testimonials yet.</p></div>`;
    return;
  }

  // Determine slide size based on viewport
  carouselSlideSize = window.innerWidth <= 768 ? 1 : 2;

  // Build slides (pairs of testimonials)
  const slides = [];
  for (let i = 0; i < testimonialData.length; i += carouselSlideSize) {
    const chunk = testimonialData.slice(i, i + carouselSlideSize);
    const cards = chunk.map(t => buildTestimonialCard(t)).join("");
    slides.push(`<div class="testimonial-slide">${cards}</div>`);
  }

  track.innerHTML = slides.join("");

  // Dots
  if (dotsContainer) {
    dotsContainer.innerHTML = slides.map((_, i) =>
      `<button class="carousel-dot ${i === 0 ? 'active' : ''}" data-idx="${i}" aria-label="Slide ${i + 1}"></button>`
    ).join("");

    dotsContainer.querySelectorAll(".carousel-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        goToSlide(parseInt(dot.dataset.idx, 10));
      });
    });
  }

  goToSlide(0);
  startCarouselAuto();
}

function buildTestimonialCard(t) {
  const stars = Array(t.rating || 5).fill(
    `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
  ).join("");

  const initials = (t.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarContent = t.photoUrl
    ? `<img src="${t.photoUrl}" alt="${t.name}" />`
    : initials;

  return `
    <div class="testimonial-card">
      <div class="testimonial-stars">${stars}</div>
      <p class="testimonial-text">${t.text}</p>
      <div class="testimonial-author">
        <div class="testimonial-avatar">${avatarContent}</div>
        <div>
          <div class="testimonial-name">${t.name}</div>
          <div class="testimonial-company">${t.company}</div>
        </div>
      </div>
    </div>
  `;
}

function goToSlide(idx) {
  const track = document.getElementById("testimonial-track");
  const slides = track ? track.querySelectorAll(".testimonial-slide") : [];
  if (!slides.length) return;

  const total = slides.length;
  carouselIndex = ((idx % total) + total) % total;

  if (track) {
    track.style.transform = `translateX(-${carouselIndex * 100}%)`;
  }

  // Update dots
  document.querySelectorAll(".carousel-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === carouselIndex);
  });
}

function startCarouselAuto() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    goToSlide(carouselIndex + 1);
  }, 5000);
}

function initCarouselControls() {
  const prevBtn = document.getElementById("carousel-prev");
  const nextBtn = document.getElementById("carousel-next");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      goToSlide(carouselIndex - 1);
      startCarouselAuto();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      goToSlide(carouselIndex + 1);
      startCarouselAuto();
    });
  }
}

// ── 9. Contact Form Submission ────────────────────────────────
function initContactForm() {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const fileInput = document.getElementById("file-upload");
  const fileDisplay = document.getElementById("file-name-display");

  if (fileInput && fileDisplay) {
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length > 0) {
        fileDisplay.textContent = "📎 " + fileInput.files[0].name;
        fileDisplay.style.display = "block";
      } else {
        fileDisplay.style.display = "none";
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type='submit']");
    const originalHTML = btn.innerHTML;

    // Validate
    const name    = form.querySelector("#contact-name").value.trim();
    const phone   = form.querySelector("#contact-phone").value.trim();
    const email   = form.querySelector("#contact-email").value.trim();
    const service = form.querySelector("#contact-service").value;
    const budget  = form.querySelector("#contact-budget").value;
    const desc    = form.querySelector("#contact-desc").value.trim();
    const date    = form.querySelector("#contact-date").value;
    const prefContact = form.querySelector('input[name="pref-contact"]:checked');

    if (!name) { showToast("Please enter your full name.", "error"); return; }
    if (!phone || phone.length < 7) { showToast("Please enter a valid phone number.", "error"); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Please enter a valid email address.", "error"); return; }
    if (!service) { showToast("Please select a service type.", "error"); return; }
    if (!budget) { showToast("Please select a budget range.", "error"); return; }
    if (!desc) { showToast("Please describe your project.", "error"); return; }

    const fileName = (fileInput && fileInput.files.length > 0) ? fileInput.files[0].name : "";
    const preferredContactMethod = prefContact ? prefContact.value : "WhatsApp";

    const lead = {
      name,
      phone,
      email,
      service,
      budget,
      description: desc,
      fileUpload: fileName,
      launchDate: date || "",
      preferredContact: preferredContactMethod,
      status: "Pending",
      stage: "New Lead",
      submittedAt: new Date().toISOString()
    };

    // Disable button
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg> Sending…`;
    btn.disabled = true;

    try {
      await db.collection("leads").add(lead);

      // WhatsApp notification
      const adminWA = siteSettings.whatsappNumber || "919876543210";
      const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      const waText = encodeURIComponent(
        `🚀 *New Lead from YashTech Labs Website!*\n\n` +
        `👤 *Name:* ${name}\n` +
        `📋 *Service:* ${service}\n` +
        `💰 *Budget:* ${budget}\n` +
        `📞 *Phone:* ${phone}\n` +
        `📧 *Email:* ${email}\n` +
        `🕐 *Time:* ${now}\n\n` +
        `Check your admin panel for full details.`
      );
      window.open(`https://wa.me/${adminWA}?text=${waText}`, "_blank");

      showToast("✅ Submitted! We'll get back to you within 24 hours.", "success");
      form.reset();
      if (fileDisplay) { fileDisplay.style.display = "none"; }
    } catch (err) {
      console.error("[YashTech] Lead save failed:", err);
      showToast("❌ Submission failed. Please try again or contact us directly.", "error");
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  });
}

// ── 10. Toast Notification ────────────────────────────────────
function showToast(message, type = "info") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || "ℹ️"}</span>
    <span class="toast-text">${message}</span>
    <button class="toast-close" aria-label="Close">✕</button>
  `;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });
  });

  const dismiss = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  };

  toast.querySelector(".toast-close").addEventListener("click", dismiss);
  setTimeout(dismiss, 5000);
}

// ── 11. Smooth Scroll ─────────────────────────────────────────
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", e => {
      const target = document.querySelector(anchor.getAttribute("href"));
      if (target) {
        e.preventDefault();
        const navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-height"), 10) || 72;
        const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
        window.scrollTo({ top, behavior: "smooth" });
      }
    });
  });
}

// ── Spin animation helper (for button loader) ─────────────────
(function injectSpinKeyframe() {
  if (document.querySelector("#spin-keyframe")) return;
  const style = document.createElement("style");
  style.id = "spin-keyframe";
  style.textContent = `@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`;
  document.head.appendChild(style);
})();

// ── Initialize Everything ─────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  document.body.style.overflow = "hidden"; // blocked by loading screen
  initLoadingScreen();
  initThemeToggle();
  initNavbar();
  initMobileNavLinks();
  initSmoothScroll();
  initScrollAnimations();
  initCounters();
  initCarouselControls();
  initContactForm();
  initPortfolioModal();

  // Firestore data loads
  await loadSettings();
  loadPortfolio();
  loadTestimonials();
});

// Re-render carousel on resize
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (testimonialData.length) {
      renderTestimonials();
    }
  }, 300);
});

/* ── Portfolio Modal Logic ──────────────────────────────────── */
function initPortfolioModal() {
  const modal = document.getElementById("portfolio-detail-modal");
  if (!modal) return;

  // Close on background click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closePortfolioDetail();
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("show")) {
      closePortfolioDetail();
    }
  });
}

async function openPortfolioDetail(id) {
  const modal = document.getElementById("portfolio-detail-modal");
  const body = document.getElementById("portfolio-modal-body");
  if (!modal || !body) return;

  // Set loading state
  body.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;padding:80px 0;">
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#D6A75F" stroke-width="2.5" style="animation:spin 0.8s linear infinite;">
        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/>
      </svg>
    </div>
  `;
  modal.classList.add("show");
  document.body.style.overflow = "hidden";

  try {
    const doc = await db.collection("portfolio").doc(id).get();
    if (!doc.exists) {
      body.innerHTML = `<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Project details not found.</p>`;
      return;
    }

    const d = doc.data();
    const imgContent = d.imageUrl
      ? `<img src="${d.imageUrl}" alt="${d.title}" />`
      : `<div class="pm-placeholder">💻</div>`;

    const featuresList = (d.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join("");
    const techTags = (d.technologies || []).map(t => `<span class="pm-tech-tag">${escapeHtml(t)}</span>`).join("");

    body.innerHTML = `
      <div class="pm-header">
        <span class="pm-category">${escapeHtml(d.category || "Project")}</span>
        <h2 class="pm-title" id="modal-project-title">${escapeHtml(d.title)}</h2>
      </div>
      <div class="pm-image-wrap">
        ${imgContent}
      </div>
      <div class="pm-body-grid">
        <div>
          <h3 class="pm-section-title">Project Overview</h3>
          <p class="pm-desc">${escapeHtml(d.description)}</p>
          
          ${featuresList ? `
            <h3 class="pm-section-title">Key Features</h3>
            <ul class="pm-features">
              ${featuresList}
            </ul>
          ` : ""}
        </div>
        <div>
          <div class="pm-sidebar-card">
            <h3 class="pm-section-title" style="font-size:1.05rem;margin-bottom:8px;">Technologies</h3>
            <div class="pm-tech-tags">
              ${techTags}
            </div>
            <button class="btn-primary" style="width:100%;margin-top:28px;font-size:14px;padding:12px 16px;justify-content:center;" onclick="closePortfolioDetail()">Close Project</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("[YashTech] Error opening portfolio modal:", err);
    body.innerHTML = `<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Failed to load project details.</p>`;
  }
}

function closePortfolioDetail() {
  const modal = document.getElementById("portfolio-detail-modal");
  if (modal) modal.classList.remove("show");
  document.body.style.overflow = "";
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

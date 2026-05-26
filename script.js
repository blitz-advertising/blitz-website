/* ─────────────────────────────────────────────
   BLITZ — Powered by GSAP + Lenis
───────────────────────────────────────────── */

/* ─── SMOOTH SCROLL (LENIS) ─────────────────── */
const lenis = new Lenis({
  duration: 1.3,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smooth: true,
});

/* Single raf driver — canonical Lenis loop. Keep ScrollTrigger synced
   via the scroll event. Do NOT also drive lenis.raf from gsap.ticker —
   two drivers feed conflicting timestamps and break animated scrollTo(). */
function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

lenis.on('scroll', ScrollTrigger.update);

/* ─── CUSTOM CURSOR ─────────────────────────── */
const cursor = document.getElementById('cursor');
const cursorRing = document.getElementById('cursorRing');
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  gsap.to(cursor, { left: mouseX, top: mouseY, duration: 0.08, ease: 'none' });
});

(function animateRing() {
  ringX += (mouseX - ringX) * 0.1;
  ringY += (mouseY - ringY) * 0.1;
  cursorRing.style.left = ringX + 'px';
  cursorRing.style.top = ringY + 'px';
  requestAnimationFrame(animateRing);
})();

document.querySelectorAll('a, button, .stat-item, .benefit-card, .service-row, .work-cell').forEach(el => {
  el.addEventListener('mouseenter', () => { cursor.classList.add('hover'); cursorRing.classList.add('hover'); });
  el.addEventListener('mouseleave', () => { cursor.classList.remove('hover'); cursorRing.classList.remove('hover'); });
});

/* work images — fill the cursor ring blue so it stays visible over the invert */
document.querySelectorAll('.work-cell:not(.work-cell--empty)').forEach(el => {
  el.addEventListener('mouseenter', () => cursorRing.classList.add('cursor-ring--work'));
  el.addEventListener('mouseleave', () => cursorRing.classList.remove('cursor-ring--work'));
});

/* ─── NAV SCROLL STATE ──────────────────────── */
const nav = document.getElementById('nav');
if (nav) {
  ScrollTrigger.create({
    start: 'top -60',
    onEnter: () => nav.classList.add('scrolled'),
    onLeaveBack: () => nav.classList.remove('scrolled'),
  });
}

/* ─── WORD SPLIT UTILITY ────────────────────── */
function splitWords(el) {
  const text = el.textContent.trim();
  el.innerHTML = '';
  el.setAttribute('aria-label', text);
  const words = text.split(/(\s+)/);
  const inners = [];
  words.forEach(token => {
    if (/^\s+$/.test(token)) {
      el.appendChild(document.createTextNode(' '));
      return;
    }
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-block; overflow:hidden; vertical-align:bottom; white-space:nowrap; padding-bottom:0.45em; margin-bottom:-0.45em; padding-top:0.5em; margin-top:-0.5em; padding-left:0.1em; margin-left:-0.1em; padding-right:0.18em; margin-right:-0.18em;';
    const inner = document.createElement('span');
    inner.style.display = 'inline-block';
    inner.textContent = token;
    wrap.appendChild(inner);
    el.appendChild(wrap);
    inners.push(inner);
  });
  return inners;
}

/* ─── HERO ANIMATIONS ───────────────────────── */
const heroHeadline = document.querySelector('.hero-headline');
if (heroHeadline) {
  gsap.fromTo(heroHeadline, { opacity: 0, y: 22 },
    { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', delay: 0.2 });
}

gsap.fromTo('.hero-eyebrow', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', delay: 0.5, stagger: 0.1 });
gsap.fromTo('.hero-sub-tag', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', delay: 0.9 });
gsap.fromTo('.hero-scanlines', { opacity: 0 }, { opacity: 1, duration: 1.8, ease: 'power2.out', delay: 0.5 });

/* ─── SECTION META REVEALS ───────────────────── */
gsap.utils.toArray('.section-meta').forEach(el => {
  gsap.fromTo(el, { opacity: 0, x: -20 }, {
    opacity: 1, x: 0,
    duration: 0.9,
    ease: 'expo.out',
    scrollTrigger: { trigger: el, start: 'top 88%' },
  });
});

/* ─── WHY BLITZ ─────────────────────────────── */
const stmtText = document.querySelector('.statement-text');
if (stmtText) {
  gsap.fromTo(stmtText, { opacity: 0, y: 40 }, {
    opacity: 1, y: 0,
    duration: 1.2,
    ease: 'expo.out',
    scrollTrigger: { trigger: stmtText, start: 'top 86%' },
  });
}

const stmtSub = document.querySelector('.statement-sub');
if (stmtSub) {
  gsap.fromTo(stmtSub, { opacity: 0, y: 20 }, {
    opacity: 1, y: 0,
    duration: 1,
    ease: 'expo.out',
    scrollTrigger: { trigger: stmtSub, start: 'top 88%' },
  });
}

gsap.utils.toArray('.stat-item').forEach((el, i) => {
  gsap.fromTo(el, { opacity: 0, y: 24 }, {
    opacity: 1, y: 0,
    duration: 0.8,
    ease: 'expo.out',
    delay: i * 0.08,
    scrollTrigger: { trigger: '.stats-row', start: 'top 85%' },
  });
});

/* ─── SERVICES ──────────────────────────────── */
gsap.utils.toArray('.service-row').forEach((el, i) => {
  gsap.fromTo(el, { opacity: 0, y: 40 }, {
    opacity: 1, y: 0,
    duration: 1,
    ease: 'expo.out',
    delay: i * 0.1,
    scrollTrigger: { trigger: el, start: 'top 88%' },
  });
});

/* ─── BENEFITS ───────────────────────────────── */
gsap.utils.toArray('.benefit-card').forEach((el, i) => {
  gsap.fromTo(el, { opacity: 0, y: 40 }, {
    opacity: 1, y: 0,
    duration: 0.9,
    ease: 'expo.out',
    delay: i * 0.07,
    scrollTrigger: { trigger: '.benefits-grid', start: 'top 82%' },
  });
});

/* ─── WORK ───────────────────────────────────── */
gsap.utils.toArray('.work-cell').forEach((el, i) => {
  gsap.fromTo(el, { opacity: 0, scale: 0.97 }, {
    opacity: 1, scale: 1,
    duration: 0.9,
    ease: 'expo.out',
    delay: i * 0.07,
    scrollTrigger: { trigger: '.work-grid', start: 'top 82%' },
  });
});

/* ─── FAQ ACCORDION ─────────────────────────── */
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-a');
    const isOpen = btn.getAttribute('aria-expanded') === 'true';

    // close all others
    document.querySelectorAll('.faq-item').forEach(other => {
      if (other !== item) {
        other.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
        other.querySelector('.faq-a').classList.remove('open');
        other.classList.remove('faq-item--open');
      }
    });

    btn.setAttribute('aria-expanded', String(!isOpen));
    answer.classList.toggle('open', !isOpen);
    item.classList.toggle('faq-item--open', !isOpen);
  });
});

/* ─── PROCESS TIMELINE REVEAL ────────────────── */
gsap.utils.toArray('.process-step').forEach((el, i) => {
  gsap.fromTo(el, { opacity: 0, x: 24 }, {
    opacity: 1, x: 0,
    duration: 0.8,
    ease: 'expo.out',
    delay: i * 0.12,
    scrollTrigger: { trigger: '.process', start: 'top 82%' },
  });
});

/* ─── HERO CRT — CURSOR REACTIVE ─────────────── */
const heroEl = document.querySelector('.hero');
const heroScan = document.querySelector('.hero-scanlines');
if (heroEl && heroScan) {
  heroEl.addEventListener('mousemove', (e) => {
    const r = heroEl.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    heroScan.style.setProperty('--crt-x', x + '%');
    heroScan.style.setProperty('--crt-y', y + '%');
  });
}

/* ─── CTA ────────────────────────────────────── */
const ctaHeadline = document.querySelector('.cta-headline');
if (ctaHeadline) {
  const words = splitWords(ctaHeadline);
  gsap.set(words, { yPercent: 115 });
  ScrollTrigger.create({
    trigger: ctaHeadline,
    start: 'top 82%',
    once: true,
    onEnter: () => {
      gsap.to(words, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08 });
    },
  });
}

gsap.fromTo('.cta-body', { opacity: 0, y: 24 }, {
  opacity: 1, y: 0,
  duration: 1,
  ease: 'expo.out',
  scrollTrigger: { trigger: '.cta-body', start: 'top 85%' },
});

gsap.fromTo('.cta-btn', { opacity: 0, y: 20 }, {
  opacity: 1, y: 0,
  duration: 1,
  ease: 'expo.out',
  scrollTrigger: { trigger: '.cta-btn', start: 'top 88%' },
});

/* ─── SMOOTH ANCHOR SCROLL ──────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const href = anchor.getAttribute('href');
    if (href === '#' || href === '') {
      lenis.scrollTo(0, { duration: 1.4 });
      return;
    }
    const target = document.querySelector(href);
    if (target) lenis.scrollTo(target, { offset: -80, duration: 1.4 });
  });
});

/* ─── IMAGE PROTECTION ──────────────────────── */
/* Disable right-click "Save Image" and drag-to-download on all images.
   Not bulletproof — anyone can screenshot or open DevTools — but blocks casual saving. */
document.querySelectorAll('img').forEach(img => {
  img.addEventListener('contextmenu', e => e.preventDefault());
  img.addEventListener('dragstart', e => e.preventDefault());
});

/* ─── CURSOR-REACTIVE GLOW ──────────────────── */
const heroGlows = document.querySelectorAll('.hero-glow');
if (heroGlows.length) {
  window.addEventListener('mousemove', (e) => {
    const dx = (e.clientX / window.innerWidth - 0.5) * 2;   /* -1 .. 1 */
    const dy = (e.clientY / window.innerHeight - 0.5) * 2;
    heroGlows.forEach((g, i) => {
      const depth = i === 0 ? 55 : 32;
      gsap.to(g, { x: dx * depth, y: dy * depth, duration: 1.4, ease: 'power2.out' });
    });
  });
}

/* ─── MAGNETIC BUTTONS ──────────────────────── */
function magnetic(el, strength) {
  el.addEventListener('mousemove', (e) => {
    const r = el.getBoundingClientRect();
    const mx = e.clientX - (r.left + r.width / 2);
    const my = e.clientY - (r.top + r.height / 2);
    gsap.to(el, { x: mx * strength, y: my * strength, duration: 0.4, ease: 'power3.out' });
  });
  el.addEventListener('mouseleave', () => {
    gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
  });
}
document.querySelectorAll('.nav-cta, .cta-btn').forEach(el => magnetic(el, 0.34));

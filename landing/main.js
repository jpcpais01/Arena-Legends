// Arena Legends landing page. No build step, no dependencies.

// The live game. Change this one line if the game moves to another domain.
const GAME_URL = 'https://arena-legends-flame.vercel.app/';

// The game can only be installed from its own site (browsers offer the install prompt to
// the app's origin only), so Install opens the game with ?install and the game shows its
// own install box there. iPhones have no prompt at all: Safari's Share menu does it.
const installUrl = () => GAME_URL + '?install';

const ua = navigator.userAgent;
const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const platform = isIos ? 'ios' : isAndroid ? 'android' : 'desktop';

// Play buttons.
for (const a of document.querySelectorAll('[data-play]')) {
  a.href = GAME_URL;
  a.rel = 'noopener';
}

// Install buttons per platform.
const iosModal = document.getElementById('ios-modal');
function openIosSteps(e) {
  e.preventDefault();
  if (iosModal.showModal) iosModal.showModal();
  else location.href = GAME_URL;
}
for (const a of document.querySelectorAll('[data-install-target]')) {
  const target = a.dataset.installTarget;
  if (target === 'ios') a.addEventListener('click', openIosSteps);
  else a.href = installUrl();
}
document.querySelector('[data-install-open]').href = GAME_URL;

// The hero's Install button goes straight to this device's way of installing.
const labels = { ios: 'Install on iPhone', android: 'Install on Android', desktop: 'Install on computer' };
for (const el of document.querySelectorAll('[data-install-label]')) el.textContent = labels[platform];
for (const a of document.querySelectorAll('[data-install]')) {
  if (platform === 'ios') a.addEventListener('click', openIosSteps);
  else a.href = installUrl();
}
document.querySelector(`.pcard[data-platform="${platform}"]`)?.classList.add('is-you');

// Hero screen slideshow.
const shots = [...document.querySelectorAll('.phone-screen .shot')];
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (shots.length > 1 && !still) {
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    shots[i].classList.remove('is-on');
    i = (i + 1) % shots.length;
    shots[i].classList.add('is-on');
  }, 3600);
}

// Screenshot viewer.
const box = document.getElementById('lightbox');
const boxImg = box.querySelector('img');
for (const b of document.querySelectorAll('[data-full]')) {
  b.addEventListener('click', () => {
    boxImg.src = b.dataset.full;
    boxImg.alt = b.querySelector('img')?.alt ?? '';
    box.showModal?.();
  });
}
for (const d of [box, iosModal]) {
  // A click on the backdrop (the dialog itself, outside its card) closes it.
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
}

// Fade sections in as they scroll into view.
if ('IntersectionObserver' in window && !still) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  for (const el of document.querySelectorAll('.step, .feature, .pcard, .gallery, .stats')) {
    el.classList.add('reveal');
    io.observe(el);
  }
}

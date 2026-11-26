const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const progress = document.querySelector('.scroll-progress');

if (progress) {
  const updateProgress = () => {
    const available = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${available > 0 ? window.scrollY / available : 0})`;
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
}

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
    });
  });
}

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

// Small interactive preview: this changes only the illustrative demo, not a live Hekara account.
const fillButton = document.getElementById('fillDemo');
const toast = document.getElementById('demoToast');
if (fillButton && toast) {
  fillButton.addEventListener('click', () => {
    fillButton.textContent = 'Filled ✓';
    fillButton.disabled = true;
    fillButton.style.background = '#4a8c6a';
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2600);
  });
}

// The three steps highlight as the visitor explores the illustrative workflow.
document.querySelectorAll('.workflow-step').forEach(step => {
  step.addEventListener('click', () => {
    const selectedStep = step.dataset.step;
    document.querySelectorAll('.workflow-step').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.workflow-image').forEach(image => {
      image.classList.toggle('active', image.dataset.step === selectedStep);
    });
    step.classList.add('active');
  });
});

// Gentle entrance reveal for content sections.
const revealTargets = document.querySelectorAll('.feature-card, .department-card, .security-card, .faq-item');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealTargets.forEach(target => {
    target.classList.add('will-reveal');
    observer.observe(target);
  });
}

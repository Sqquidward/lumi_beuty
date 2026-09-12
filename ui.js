const loader = document.querySelector('#loader')
const nav = document.querySelector('.nav')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function hideLoader() {
  if (!loader || loader.classList.contains('is-gone')) return
  loader.classList.add('is-gone')
  loader.setAttribute('aria-hidden', 'true')
  document.body.classList.add('is-ready')
}

window.addEventListener('lumi:ready', hideLoader)
window.setTimeout(hideLoader, 9000)

function revealAll() {
  document.querySelectorAll('[data-reveal], .work').forEach((node) => node.classList.add('is-visible'))
}

if (reducedMotion) {
  revealAll()
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  )
  document.querySelectorAll('[data-reveal], .work').forEach((node) => observer.observe(node))
}

function onScroll() {
  if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 40)
}

onScroll()
window.addEventListener('scroll', onScroll, { passive: true })

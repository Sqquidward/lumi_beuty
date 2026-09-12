const SERVICES = [
  { id: 'haircut', title: 'Стрижка', desc: 'Женская стрижка с укладкой', duration: 75, price: 5500 },
  { id: 'blowdry', title: 'Укладка', desc: 'Локоны, объём или гладкая форма', duration: 45, price: 4500 },
  { id: 'airtouch', title: 'Сложный цвет', desc: 'AirTouch, балаяж, блонд на Davines', duration: 210, price: 14900 },
  { id: 'color', title: 'Тонирование', desc: 'Обновить тон без осветления', duration: 120, price: 8900 },
  { id: 'care', title: 'Уход Davines', desc: 'Naturaltech или Nounou под длину', duration: 50, price: 4200 },
  { id: 'brows', title: 'Брови', desc: 'Архитектура, цвет и фиксация', duration: 45, price: 3200 },
  { id: 'makeup', title: 'Макияж', desc: 'Дневной или вечерний', duration: 60, price: 6500 },
]

const TITLES = {
  1: 'Выберите услугу',
  2: 'Когда вам удобно',
  3: 'Как к вам обратиться',
  4: 'Вы записаны',
}

const WEEKDAY_HOURS = { start: 10, end: 20 }
const WEEKEND_HOURS = { start: 11, end: 19 }
const SLOT_STEP = 30
const DAYS_AHEAD = 14
const STORAGE_KEY = 'lumi-bookings'
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const state = {
  step: 1,
  serviceId: null,
  dateKey: null,
  time: null,
  name: '',
  phone: '',
}

const els = {}
let advanceTimer = 0

function formatPrice(n) {
  return `${n.toLocaleString('ru-RU')} ₽`
}

function formatDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function weekdayShort(date) {
  return date.toLocaleDateString('ru-RU', { weekday: 'short' })
}

function dayNumber(date) {
  return date.getDate()
}

function monthShort(date) {
  return date.toLocaleDateString('ru-RU', { month: 'short' })
}

function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

function hoursFor(date) {
  return isWeekend(date) ? WEEKEND_HOURS : WEEKDAY_HOURS
}

function loadBookings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveBooking(dateKey, time, payload) {
  const all = loadBookings()
  const list = all[dateKey] || []
  list.push({ time, ...payload })
  all[dateKey] = list
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

function takenTimes(dateKey) {
  const all = loadBookings()
  return new Set((all[dateKey] || []).map((b) => b.time))
}

function generateTimes(date) {
  const { start, end } = hoursFor(date)
  const times = []
  for (let minutes = start * 60; minutes < end * 60; minutes += SLOT_STEP) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return times
}

function upcomingDays() {
  const days = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = new Date(now)
    date.setDate(now.getDate() + i)
    days.push(date)
  }
  return days
}

function selectedService() {
  return SERVICES.find((s) => s.id === state.serviceId) || null
}

function slotPeriod(time) {
  const hour = Number(time.slice(0, 2))
  if (hour < 13) return 'Утро'
  if (hour < 17) return 'День'
  return 'Вечер'
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').replace(/^8/, '7').slice(0, 11)
  const rest = digits.startsWith('7') ? digits.slice(1) : digits
  let out = '+7'
  if (rest.length) out += ` (${rest.slice(0, 3)}`
  if (rest.length >= 3) out += ')'
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`
  return out
}

function phoneDigits(value) {
  return value.replace(/\D/g, '').replace(/^8/, '7')
}

function dateLabel(key) {
  return parseDateKey(key).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function setStep(step) {
  const prev = state.step
  state.step = step
  const goingBack = step < prev

  els.panel.querySelectorAll('.book-view').forEach((node) => {
    const n = Number(node.dataset.step)
    node.classList.toggle('is-back', goingBack && n === prev)
    node.classList.toggle('is-active', n === step)
  })

  els.panel.querySelectorAll('.book-step').forEach((btn) => {
    const n = Number(btn.dataset.gotoStep)
    btn.classList.toggle('is-active', n === step)
    btn.classList.toggle('is-done', n < step)
    btn.disabled = n > 1 && !canEnter(n)
  })

  els.title.textContent = TITLES[step]
  els.back.hidden = step <= 1 || step === 4
  els.next.hidden = step >= 3
  els.submit.hidden = step !== 3
  els.again.hidden = step !== 4
  els.successClose.hidden = step !== 4
  updateSummary()

  if (step === 3) {
    els.recap.innerHTML = recapHtml()
    window.setTimeout(() => els.name.focus(), reducedMotion ? 0 : 280)
  }
}

function canEnter(step) {
  if (step <= 1) return true
  if (step === 2) return Boolean(state.serviceId)
  if (step === 3) return Boolean(state.serviceId && state.dateKey && state.time)
  return true
}

function recapHtml() {
  const service = selectedService()
  if (!service || !state.dateKey || !state.time) return ''
  return `${service.title} · ${dateLabel(state.dateKey)} · ${state.time}<br>от ${formatPrice(service.price)} · ${service.duration} мин`
}

function scheduleAdvance(step) {
  window.clearTimeout(advanceTimer)
  advanceTimer = window.setTimeout(() => setStep(step), reducedMotion ? 0 : 320)
}

function openModal(serviceId) {
  window.clearTimeout(advanceTimer)
  state.serviceId = serviceId || null
  state.dateKey = formatDateKey(upcomingDays()[0])
  state.time = null
  els.name.value = state.name
  els.phone.value = state.phone ? formatPhone(state.phone) : ''
  clearErrors()
  renderServices()
  renderDates()
  renderTimes()
  els.overlay.classList.add('is-open')
  els.overlay.setAttribute('aria-hidden', 'false')
  document.body.style.overflow = 'hidden'
  setStep(serviceId ? 2 : 1)
}

function closeModal() {
  window.clearTimeout(advanceTimer)
  els.overlay.classList.remove('is-open')
  els.overlay.setAttribute('aria-hidden', 'true')
  document.body.style.overflow = ''
}

function renderServices() {
  els.services.innerHTML = SERVICES.map((service) => {
    const selected = service.id === state.serviceId
    return `
      <button type="button" class="book-card ${selected ? 'is-selected' : ''}" data-pick-service="${service.id}">
        <span class="book-card-title">${service.title}</span>
        <span class="book-card-desc">${service.desc}</span>
        <span class="book-card-meta">${service.duration} мин · от ${formatPrice(service.price)}</span>
      </button>
    `
  }).join('')
}

function renderDates() {
  els.dates.innerHTML = upcomingDays()
    .map((date, i) => {
      const key = formatDateKey(date)
      const selected = key === state.dateKey
      const label = i === 0 ? 'Сегодня' : weekdayShort(date)
      return `
        <button type="button" class="book-day ${selected ? 'is-selected' : ''}" data-pick-date="${key}">
          <span>${label}</span>
          <strong>${dayNumber(date)}</strong>
          <span>${monthShort(date)}</span>
        </button>
      `
    })
    .join('')
}

function isSlotDisabled(date, time) {
  const taken = takenTimes(formatDateKey(date))
  const now = new Date()
  const isToday = formatDateKey(now) === formatDateKey(date)
  const [h, m] = time.split(':').map(Number)
  const slotDate = new Date(date)
  slotDate.setHours(h, m, 0, 0)
  return taken.has(time) || (isToday && slotDate <= now)
}

function renderTimes() {
  const date = parseDateKey(state.dateKey)
  const groups = { Утро: [], День: [], Вечер: [] }
  generateTimes(date).forEach((time) => groups[slotPeriod(time)].push(time))

  let delay = 0
  els.times.innerHTML = Object.entries(groups)
    .filter(([, times]) => times.length)
    .map(
      ([label, times]) => `
        <div class="book-slot-group">
          <p class="booking-label">${label}</p>
          <div class="book-slots">
            ${times
              .map((time) => {
                const disabled = isSlotDisabled(date, time)
                const selected = time === state.time && !disabled
                const style = `style="animation-delay:${delay++ * 18}ms"`
                return `
                  <button type="button" class="book-slot ${selected ? 'is-selected' : ''}" data-pick-time="${time}" ${disabled ? 'disabled' : ''} ${style}>
                    ${time}
                  </button>
                `
              })
              .join('')}
          </div>
        </div>
      `,
    )
    .join('')
}

function updateSummary() {
  const service = selectedService()
  if (state.step === 4) {
    els.summary.textContent = 'До встречи в Lumi'
    els.next.disabled = true
    return
  }
  if (!service) {
    els.summary.textContent = 'Выберите услугу'
    els.next.disabled = true
    return
  }
  if (state.step === 1) {
    els.summary.textContent = `${service.title} · от ${formatPrice(service.price)}`
    els.next.disabled = false
    return
  }
  if (!state.time) {
    els.summary.textContent = `${service.title} · выберите время`
    els.next.disabled = true
    return
  }
  els.summary.textContent = `${service.title} · ${dateLabel(state.dateKey)} · ${state.time}`
  els.next.disabled = false
}

function clearErrors() {
  els.name.classList.remove('is-error')
  els.phone.classList.remove('is-error')
  els.nameHint.textContent = ''
  els.phoneHint.textContent = ''
}

function shake(input) {
  const wrap = input.closest('.booking-input-wrap')
  if (!wrap) return
  wrap.classList.remove('is-shake')
  void wrap.offsetWidth
  wrap.classList.add('is-shake')
}

function showSuccess() {
  const service = selectedService()
  els.successTitle.textContent = 'Вы записаны'
  els.successText.textContent = `${state.name}, ждём вас ${dateLabel(state.dateKey)} в ${state.time} на услугу «${service.title}».`
  setStep(4)
}

function bind() {
  els.overlay = document.querySelector('#booking-overlay')
  els.panel = document.querySelector('#booking-panel')
  els.title = document.querySelector('#booking-title')
  els.services = document.querySelector('#booking-services')
  els.dates = document.querySelector('#booking-dates')
  els.times = document.querySelector('#booking-times')
  els.summary = document.querySelector('#booking-summary')
  els.recap = document.querySelector('#booking-recap')
  els.next = document.querySelector('#booking-next')
  els.back = document.querySelector('[data-prev-step]')
  els.name = document.querySelector('#booking-name')
  els.phone = document.querySelector('#booking-phone')
  els.nameHint = document.querySelector('#booking-name-hint')
  els.phoneHint = document.querySelector('#booking-phone-hint')
  els.submit = document.querySelector('#booking-submit')
  els.again = document.querySelector('[data-book-again]')
  els.successClose = document.querySelector('[data-success-close]')
  els.successTitle = document.querySelector('#booking-success-title')
  els.successText = document.querySelector('#booking-success-text')

  document.querySelectorAll('[data-open-booking]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault()
      openModal(btn.dataset.openBooking || null)
    })
  })

  els.overlay.addEventListener('click', (event) => {
    if (event.target === els.overlay) closeModal()
  })

  els.panel.addEventListener('click', (event) => {
    const close = event.target.closest('[data-close-booking]')
    if (close) closeModal()

    const goto = event.target.closest('[data-goto-step]')
    if (goto && !goto.disabled) setStep(Number(goto.dataset.gotoStep))

    const serviceBtn = event.target.closest('[data-pick-service]')
    if (serviceBtn) {
      state.serviceId = serviceBtn.dataset.pickService
      renderServices()
      updateSummary()
      scheduleAdvance(2)
    }

    const dateBtn = event.target.closest('[data-pick-date]')
    if (dateBtn) {
      state.dateKey = dateBtn.dataset.pickDate
      state.time = null
      renderDates()
      renderTimes()
      updateSummary()
    }

    const timeBtn = event.target.closest('[data-pick-time]')
    if (timeBtn && !timeBtn.disabled) {
      state.time = timeBtn.dataset.pickTime
      renderTimes()
      updateSummary()
      scheduleAdvance(3)
    }

    const next = event.target.closest('[data-next-step]')
    if (next && canEnter(state.step + 1)) setStep(state.step + 1)

    const back = event.target.closest('[data-prev-step]')
    if (back && state.step > 1 && state.step < 4) setStep(state.step - 1)

    const again = event.target.closest('[data-book-again]')
    if (again) {
      state.time = null
      clearErrors()
      renderTimes()
      setStep(1)
    }
  })

  els.phone.addEventListener('input', () => {
    els.phone.value = formatPhone(els.phone.value)
    els.phone.classList.remove('is-error')
    els.phoneHint.textContent = ''
  })

  els.name.addEventListener('input', () => {
    els.name.classList.remove('is-error')
    els.nameHint.textContent = ''
  })

  els.submit.addEventListener('click', () => {
    clearErrors()
    const name = els.name.value.trim()
    const phone = els.phone.value.trim()
    let valid = true

    if (name.length < 2) {
      els.name.classList.add('is-error')
      els.nameHint.textContent = 'Напишите имя'
      shake(els.name)
      valid = false
    }
    if (phoneDigits(phone).length < 11) {
      els.phone.classList.add('is-error')
      els.phoneHint.textContent = 'Нужен номер из 11 цифр'
      shake(els.phone)
      valid = false
    }
    if (!valid) {
      if (els.name.classList.contains('is-error')) els.name.focus()
      else els.phone.focus()
      return
    }

    state.name = name
    state.phone = phone
    const service = selectedService()
    saveBooking(state.dateKey, state.time, {
      serviceId: service.id,
      name,
      phone,
    })
    showSuccess()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.overlay.classList.contains('is-open')) closeModal()
  })
}

bind()

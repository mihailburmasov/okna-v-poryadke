/* «Окна в порядке» — скрипты лендинга */
(function () {
  'use strict';

  /* ===== Настройки ===== */
  // Куда отправляются заявки. Для обычного хостинга с PHP — send.php.
  // Для Yandex Object Storage сюда ставится адрес Cloud Function.
  var FORM_ENDPOINT = 'send.php';
  // Номер счётчика Яндекс Метрики (число). 0 — счётчик не подключён.
  var METRIKA_ID = 0;
  var THANKS_PAGE = 'spasibo.html';

  /* ===== Хранилище без падений (приватный режим и т.п.) ===== */
  function store(kind) {
    return {
      get: function (k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[kind].setItem(k, v); } catch (e) { /* ignore */ } }
    };
  }
  var ls = store('localStorage');
  var ss = store('sessionStorage');

  /* ===== Яндекс Метрика ===== */
  if (METRIKA_ID) {
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(METRIKA_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
  }
  function goal(name) {
    try { if (METRIKA_ID && window.ym) window.ym(METRIKA_ID, 'reachGoal', name); } catch (e) { /* ignore */ }
  }

  /* ===== UTM-метки и yclid: запоминаем на время визита ===== */
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'];
  var params = new URLSearchParams(location.search);
  var utm = {};
  UTM_KEYS.forEach(function (k) {
    var v = params.get(k) || ss.get(k) || '';
    if (params.get(k)) ss.set(k, v);
    utm[k] = v;
  });
  if (!ss.get('landing_ref')) ss.set('landing_ref', document.referrer || '');

  /* ===== Год в подвале ===== */
  var yearEl = document.querySelector('.js-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ===== Цель: клик по телефону ===== */
  document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
    a.addEventListener('click', function () { goal('phone_click'); });
  });

  /* ===== Маска телефона +7 (XXX) XXX-XX-XX ===== */
  // Возвращает 11 цифр вида 7XXXXXXXXXX (или меньше, пока номер не дописан).
  // Первую набранную 8 или 7 считаем кодом страны: «8978…» и «+7978…» дают одно и то же.
  function phoneDigits(value) {
    var v = value.trim();
    var local = (v.indexOf('+7') === 0 ? v.slice(2) : v).replace(/\D/g, '');
    if (v.indexOf('+7') !== 0 && local.length === 11 && /^[78]/.test(local)) local = local.slice(1);
    else if (/^[78]/.test(local)) local = local.slice(1);
    return local ? ('7' + local).slice(0, 11) : (v.indexOf('+7') === 0 ? '7' : '');
  }
  function formatPhone(d) {
    if (!d) return '';
    var r = '+7';
    if (d.length > 1) r += ' (' + d.slice(1, 4);
    if (d.length >= 4) r += ')';
    if (d.length > 4) r += ' ' + d.slice(4, 7);
    if (d.length > 7) r += '-' + d.slice(7, 9);
    if (d.length > 9) r += '-' + d.slice(9, 11);
    return r;
  }
  document.querySelectorAll('.js-phone-input').forEach(function (input) {
    input.addEventListener('input', function (e) {
      // при стирании не переформатируем, иначе скобка и дефисы возвращаются на место
      if (e.inputType && e.inputType.indexOf('delete') === 0) return;
      input.value = formatPhone(phoneDigits(input.value));
      if (phoneDigits(input.value).length === 11) clearError(input);
    });
    input.addEventListener('focus', function () { if (!input.value) input.value = '+7 ('; });
    input.addEventListener('blur', function () { if (phoneDigits(input.value).length <= 1) input.value = ''; });
  });
  function clearError(input) {
    input.classList.remove('is-invalid');
    var f = input.closest('.field'); if (f) f.classList.remove('has-error');
  }
  function setError(input) {
    input.classList.add('is-invalid');
    var f = input.closest('.field'); if (f) f.classList.add('has-error');
    input.focus();
  }

  /* ===== Отправка заявок ===== */
  var startedAt = Date.now();
  var formStarted = false;

  document.querySelectorAll('.lead-form').forEach(function (form) {
    // служебные поля: honeypot, время, метки
    var hp = document.createElement('div');
    hp.className = 'hp'; hp.setAttribute('aria-hidden', 'true');
    hp.innerHTML = '<label>Ваш сайт<input type="text" name="website" tabindex="-1" autocomplete="off"></label>';
    form.appendChild(hp);

    form.addEventListener('input', function () {
      if (!formStarted) { formStarted = true; goal('form_start'); }
    }, { once: true });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = form.querySelector('.form-status');
      var phone = form.querySelector('input[name="phone"]');
      var consent = form.querySelector('input[name="consent"]');
      if (status) { status.className = 'form-status'; status.textContent = ''; }

      if (phoneDigits(phone.value).length !== 11) { setError(phone); return; }
      if (!consent.checked) {
        if (status) { status.className = 'form-status is-error'; status.textContent = 'Чтобы отправить заявку, отметьте согласие на обработку данных.'; }
        return;
      }

      var data = new FormData(form);
      data.set('phone', formatPhone(phoneDigits(phone.value)));
      data.set('form_name', form.getAttribute('data-form') || '');
      data.set('elapsed', String(Math.round((Date.now() - startedAt) / 1000)));
      data.set('page', location.href.split('?')[0]);
      data.set('referrer', ss.get('landing_ref') || '');
      UTM_KEYS.forEach(function (k) { data.set(k, utm[k]); });

      var btn = form.querySelector('button[type="submit"]');
      var btnText = btn.textContent;
      btn.disabled = true; btn.textContent = 'Отправляем…';

      fetch(FORM_ENDPOINT, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'send');
          goal('lead');
          goal(form.getAttribute('data-form') === 'quiz' ? 'quiz_done' : 'form_send');
          ss.set('lead_sent', '1');
          setTimeout(function () { location.href = THANKS_PAGE; }, 250);
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = btnText;
          if (status) {
            status.className = 'form-status is-error';
            status.innerHTML = 'Не удалось отправить заявку. Позвоните нам: <a href="tel:+79780302063">+7 (978) 030-20-63</a>';
          }
        });
    });
  });

  /* ===== Модальное окно ===== */
  var modal = document.getElementById('modal');
  var lastFocus = null;
  function openModal(title, problem) {
    if (!modal) return;
    lastFocus = document.activeElement;
    var t = modal.querySelector('#modal-title');
    if (title) t.textContent = title;
    modal.querySelector('input[name="problem"]').value = problem || '';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(function () { modal.querySelector('input[name="phone"]').focus(); }, 50);
    goal('modal_open');
  }
  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll('[data-open-form]').forEach(function (b) {
    b.addEventListener('click', function () {
      openModal(b.getAttribute('data-form-title'), b.getAttribute('data-problem'));
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach(function (b) { b.addEventListener('click', closeModal); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) closeModal();
  });

  /* ===== Квиз ===== */
  var quiz = document.querySelector('[data-form="quiz"]');
  if (quiz) {
    var steps = quiz.querySelectorAll('.quiz__step');
    var bar = quiz.querySelector('.js-quiz-bar');
    var count = quiz.querySelector('.js-quiz-count');
    var current = 0;
    var show = function (i) {
      steps[current].classList.remove('is-active');
      current = i;
      steps[current].classList.add('is-active');
      bar.style.width = ((current + 1) / steps.length * 100) + '%';
      count.textContent = 'Шаг ' + (current + 1) + ' из ' + steps.length;
      var first = steps[current].querySelector('input');
      if (first && i > 0) first.focus({ preventScroll: true });
      if (i === steps.length - 1) goal('quiz_contacts');
    };
    quiz.querySelectorAll('.js-quiz-next').forEach(function (b) {
      b.addEventListener('click', function () { if (current < steps.length - 1) show(current + 1); });
    });
    quiz.querySelectorAll('.js-quiz-prev').forEach(function (b) {
      b.addEventListener('click', function () { if (current > 0) show(current - 1); });
    });
    // на шагах с одним выбором — переход сразу по клику
    quiz.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () { setTimeout(function () { if (current < steps.length - 1) show(current + 1); }, 220); });
    });
    quiz.addEventListener('change', function () { goal('quiz_start'); }, { once: true });
  }

  /* ===== Вкладки цен ===== */
  var tabs = document.querySelectorAll('[role="tab"]');
  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab); });
    tab.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (n) { e.preventDefault(); selectTab(n); n.focus(); }
    });
  });

  /* ===== Cookie-уведомление ===== */
  var cookie = document.getElementById('cookie');
  if (cookie && !ls.get('cookie_ok')) {
    var showCookie = function () { cookie.classList.add('is-visible'); };
    // На телефоне не закрываем форму первого экрана: показываем после прокрутки
    if (window.matchMedia('(max-width: 720px)').matches) {
      var onScroll = function () { if (window.scrollY > 600) { showCookie(); window.removeEventListener('scroll', onScroll); } };
      window.addEventListener('scroll', onScroll, { passive: true });
    } else {
      setTimeout(showCookie, 1200);
    }
    document.getElementById('cookie-ok').addEventListener('click', function () {
      ls.set('cookie_ok', '1');
      cookie.classList.remove('is-visible');
    });
  }

  /* ===== Появление блоков при прокрутке ===== */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -60px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }
})();

/* ====================================================================== */
/*  VARIANT SCRIPT                                                        */
/* ====================================================================== */

/* ====================================================================== */
/*  TEXT MARQUEE    drag-to-control with kinetic inertia + spring          */
/* ====================================================================== */
(function () {
  var marquee = document.querySelector('.marquee--text');
  var track = document.querySelector('.marquee--text .marquee__track');

  if (!marquee || !track) return;

  var offset = 0;
  var velocity = 0;
  var lastTime = null;
  var lastMouseX = 0;
  var isDragging = false;
  var rafId = null;

  var dragSensitivity = 10;
  var friction  = 0.4;
  var springK   = 4.5;
  var flingBoost = 3.2;
  var baseLoopSeconds = 20;

  var baseSpeed = 0;
  function recalcBaseSpeed() {
    var halfW = track.offsetWidth / 2;
    baseSpeed = halfW / baseLoopSeconds;
  }

  function getHalfWidth() {
    return track.offsetWidth / 2;
  }

  function wrapOffset() {
    var halfW = getHalfWidth();
    offset = ((offset % halfW) + halfW) % halfW - halfW;
  }

  function animate(ts) {
    if (lastTime === null) lastTime = ts;
    var dt = Math.min((ts - lastTime) / 1000, 0.1);
    lastTime = ts;

    if (!isDragging) {
      velocity -= velocity * friction * dt;
      velocity += (baseSpeed - velocity) * springK * dt;
    }

    var halfW = getHalfWidth();
    var maxSpeed = halfW * 2;
    if (velocity >  maxSpeed) velocity =  maxSpeed;
    if (velocity < -maxSpeed) velocity = -maxSpeed;

    offset -= velocity * dt;
    wrapOffset();

    track.style.transform = 'translate3d(' + offset + 'px, 0, 0)';
    rafId = requestAnimationFrame(animate);
  }

  function onDown(e) {
    isDragging = true;
    lastMouseX = e.clientX;
    velocity = 0;
    marquee.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onMove(e) {
    if (!isDragging) return;
    var dx = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    velocity = -(dx * dragSensitivity);
    offset += dx * 1.2;
    var halfW = getHalfWidth();
    if (offset <= -halfW) offset += halfW;
    if (offset >= 0)      offset -= halfW;
  }

  function onUp() {
    if (!isDragging) return;
    isDragging = false;
    velocity *= flingBoost;
    marquee.style.cursor = 'grab';
  }

  function onResize() {
    recalcBaseSpeed();
    if (!isDragging) velocity = baseSpeed;
  }

  marquee.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('resize', onResize);

  marquee.addEventListener('touchstart', function (e) {
    isDragging = true;
    lastMouseX = e.touches[0].clientX;
    velocity = 0;
  }, { passive: false });
  window.addEventListener('touchmove', function (e) {
    if (!isDragging) return;
    var dx = e.touches[0].clientX - lastMouseX;
    lastMouseX = e.touches[0].clientX;
    velocity = -(dx * dragSensitivity);
    offset += dx * 1.2;
    var halfW = getHalfWidth();
    if (offset <= -halfW) offset += halfW;
    if (offset >= 0)      offset -= halfW;
  });
  window.addEventListener('touchend', onUp);

  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mq.matches) {
    track.style.transform = 'translate3d(0, 0, 0)';
    return;
  }

  recalcBaseSpeed();
  velocity = baseSpeed;
  rafId = requestAnimationFrame(animate);
})();

(function () {

  /* ==================================================================== */
  /*  NAV SCROLL STATE                                                     */
  /* ==================================================================== */
  var nav = document.getElementById('nav');

  function onScroll() {
    if (!nav) return;
    if (window.scrollY > 20) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  /* ==================================================================== */
  /*  MOBILE HAMBURGER MENU                                                */
  /* ==================================================================== */
  var hamburger = document.getElementById('navHamburger');
  var mobileNav = document.getElementById('navMobile');
  var mobileLinks = document.querySelectorAll('.nav__mobile a');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      var open = mobileNav.classList.toggle('nav__mobile--open');
      hamburger.classList.toggle('nav__hamburger--open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });

    mobileLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        mobileNav.classList.remove('nav__mobile--open');
        hamburger.classList.remove('nav__hamburger--open');
        document.body.style.overflow = '';
      });
    });
  }

  /* ==================================================================== */
  /*  SMOOTH SCROLL FOR ANCHOR LINKS                                       */
  /* ==================================================================== */
  var anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* tooltip "Interested in a site like this?" CTAs */
  var tooltipCtas = document.querySelectorAll('.marquee__tooltip-cta[data-scroll-to]');
  tooltipCtas.forEach(function (cta) {
    cta.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var target = document.querySelector('#' + this.getAttribute('data-scroll-to'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ==================================================================== */
  /*  FILE UPLOAD LIST                                                     */
  /* ==================================================================== */
  var fileInput = document.getElementById('ctaImages');
  var fileListEl = document.getElementById('ctaFileList');

  if (fileInput && fileListEl) {
    fileInput.addEventListener('change', function () {
      fileListEl.innerHTML = '';
      var files = fileInput.files;
      for (var i = 0; i < files.length; i++) {
        var li = document.createElement('li');
        li.textContent = files[i].name;
        fileListEl.appendChild(li);
      }
    });
  }

  /* ==================================================================== */
  /*  FORM SUBMIT   GOOGLE SHEETS                                          */
  /* ==================================================================== */
  var form = document.getElementById('ctaForm');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name    = document.getElementById('ctaName');
      var email   = document.getElementById('ctaEmail');
      var phone   = document.getElementById('ctaPhone');
      var tier    = document.getElementById('ctaTier');
      var desc    = document.getElementById('ctaDescription');
      var images  = document.getElementById('ctaImages');
      var domain  = document.getElementById('ctaDomain');
      var submit  = document.getElementById('ctaSubmit');
      var feedback = document.getElementById('ctaFeedback');

      var imageNames = [];
      if (images && images.files) {
        for (var i = 0; i < images.files.length; i++) {
          imageNames.push(images.files[i].name);
        }
      }

      var payload = {
        tier: tier ? tier.value : '',
        creatorType: '',
        name: name ? name.value.trim() : '',
        email: email ? email.value.trim() : '',
        phone: phone ? phone.value.trim() : '',
        description: desc ? desc.value.trim() : '',
        domain: domain ? domain.checked : false,
        imageNames: imageNames
      };

      if (submit) {
        submit.disabled = true;
        submit.textContent = 'SENDING...';
      }
      if (feedback) {
        feedback.textContent = '';
        feedback.className = 'cta-form__feedback';
      }

      fetch('https://script.google.com/macros/s/AKfycbwFeFnRgLeLPAQceRK8U2AR82WhCHyJH7Q3KX7KmLRNnhdhWJyzP1DKDcn1SlwvrWIN2w/exec', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      })
      .then(function () {
        if (feedback) {
          feedback.textContent = 'Submitted \u2014 we\u2019ll be in touch soon.';
          feedback.className = 'cta-form__feedback cta-form__feedback--success';
        }
        if (submit) submit.textContent = 'SUBMITTED';
        form.reset();
        if (fileListEl) fileListEl.innerHTML = '';
      })
      .catch(function () {
        if (feedback) {
          feedback.textContent = 'Something went wrong. Please try again.';
          feedback.className = 'cta-form__feedback cta-form__feedback--error';
        }
        if (submit) {
          submit.textContent = 'TRY AGAIN';
          submit.disabled = false;
        }
      });
    });

  }
})();

/* ====================================================================== */
/*  BOX MARQUEE    drag physics + hover pause + kinetic inertia/spring     */
/* ====================================================================== */
(function () {
  var section = document.querySelector('.marquee--boxes');
  var track = section && section.querySelector('.marquee__track');

  if (!section || !track) return;

  var desktopMq = window.matchMedia('(min-width: 769px)');
  var reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

  var boxOffset = 0;
  var boxVelocity = 0;
  var boxLastTime = null;
  var boxRaf = null;
  var paused = false;
  var isDragging = false;
  var lastMouseX = 0;

  var dragSensitivity = 5;
  var friction  = 1.2;
  var springK   = 3.0;
  var flingBoost = 2.5;
  var baseLoopSeconds = 24;

  var baseSpeed = 0;

  function getHalfWidth() {
    return track.offsetWidth / 2;
  }

  function recalcBaseSpeed() {
    baseSpeed = getHalfWidth() / baseLoopSeconds;
  }

  function wrapOffset() {
    var halfW = getHalfWidth();
    boxOffset = ((boxOffset % halfW) + halfW) % halfW - halfW;
  }

  function isMouseOverSection() {
    return section.matches(':hover');
  }

  function boxAnimate(ts) {
    if (boxLastTime === null) boxLastTime = ts;
    var dt = Math.min((ts - boxLastTime) / 1000, 0.1);
    boxLastTime = ts;

    if (!desktopMq.matches) {
      boxRaf = requestAnimationFrame(boxAnimate);
      return;
    }

    var halfW = getHalfWidth();

    if (halfW > 0 && boxOffset === 0 && !isDragging) {
      boxOffset = -halfW;
      track.style.visibility = 'visible';
    }

    baseSpeed = halfW / baseLoopSeconds;

    if (!isDragging) {
      paused = isMouseOverSection();
    }

    if (isDragging) {
      /* drag controls velocity directly */
    } else if (paused) {
      boxVelocity = 0;
    } else {
      boxVelocity -= boxVelocity * friction * dt;
      boxVelocity += (baseSpeed - boxVelocity) * springK * dt;
    }

    var maxSpeed = halfW * 2;
    if (boxVelocity >  maxSpeed) boxVelocity =  maxSpeed;
    if (boxVelocity < -maxSpeed) boxVelocity = -maxSpeed;

    if (!paused) {
      boxOffset += boxVelocity * dt;
      wrapOffset();
    }

    track.style.transform = 'translate3d(' + boxOffset + 'px, 0, 0)';
    boxRaf = requestAnimationFrame(boxAnimate);
  }

  function startLoop() {
    if (boxRaf) return;
    if (reducedMotionMq.matches) {
      track.style.transform = 'translate3d(0, 0, 0)';
      return;
    }
    recalcBaseSpeed();
    boxVelocity = baseSpeed;
    track.style.visibility = 'hidden';
    boxRaf = requestAnimationFrame(boxAnimate);
  }

  function stopLoop() {
    if (boxRaf) {
      cancelAnimationFrame(boxRaf);
      boxRaf = null;
    }
    track.style.transform = '';
  }

  function onDown(e) {
    if (!desktopMq.matches) return;
    if (!e.target.closest('.marquee__item')) return;
    isDragging = true;
    paused = false;
    lastMouseX = e.clientX;
    boxVelocity = 0;
    section.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onMove(e) {
    if (!desktopMq.matches) return;
    if (!isDragging) return;
    var dx = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    boxVelocity = dx * dragSensitivity;
    boxOffset += dx * 1.2;
    wrapOffset();
  }

  function onUp() {
    if (!desktopMq.matches) return;
    if (!isDragging) return;
    isDragging = false;
    boxVelocity *= flingBoost;
    section.style.cursor = '';
  }

  section.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('resize', recalcBaseSpeed);

  section.addEventListener('touchstart', function (e) {
    if (!desktopMq.matches) return;
    if (e.target.closest('.marquee__item')) {
      isDragging = true;
      paused = false;
      lastMouseX = e.touches[0].clientX;
      boxVelocity = 0;
    }
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (!desktopMq.matches) return;
    if (!isDragging) return;
    var dx = e.touches[0].clientX - lastMouseX;
    lastMouseX = e.touches[0].clientX;
    boxVelocity = dx * dragSensitivity;
    boxOffset += dx * 1.2;
    wrapOffset();
  });
  window.addEventListener('touchend', onUp);

  var imgs = track.querySelectorAll('img');
  imgs.forEach(function (img) {
    if (img.complete) return;
    img.addEventListener('load', recalcBaseSpeed);
  });

  function sync(e) {
    var desktop = e ? e.matches : desktopMq.matches;
    if (desktop) startLoop();
    else stopLoop();
  }

  if (desktopMq.addEventListener) {
    desktopMq.addEventListener('change', sync);
  } else if (desktopMq.addListener) {
    desktopMq.addListener(sync);
  }

  sync();
})();

/* ====================================================================== */
/*  BOX MARQUEE    mobile single-card carousel  (arrows + random start)     */
/* ====================================================================== */
(function () {
  var section  = document.querySelector('.marquee--boxes');
  var track    = section && section.querySelector('.marquee__track');
  var prevBtn  = section && section.querySelector('.marquee__arrow--prev');
  var nextBtn  = section && section.querySelector('.marquee__arrow--next');
  var mq       = window.matchMedia('(max-width: 768px)');

  if (!section || !track || !prevBtn || !nextBtn) return;

  var uniqueItems = [];
  var currentIndex = 0;
  var active = false;

  function buildUniqueList() {
    var all = track.querySelectorAll('.marquee__item:not(.marquee__item--placeholder)');
    var seen = Object.create(null);
    uniqueItems = [];
    Array.prototype.forEach.call(all, function (item) {
      var key = item.getAttribute('href') || item.innerHTML;
      item.classList.remove('is-duplicate');
      if (seen[key]) {
        item.classList.add('is-duplicate');
      } else {
        seen[key] = true;
        uniqueItems.push(item);
      }
    });
  }

  function pickRandomIndex() {
    if (uniqueItems.length <= 1) return 0;
    return Math.floor(Math.random() * uniqueItems.length);
  }

  function getCardStep() {
    if (uniqueItems.length >= 2) {
      var r1 = uniqueItems[0].getBoundingClientRect();
      var r2 = uniqueItems[1].getBoundingClientRect();
      return r2.left - r1.left;
    }
    var style = getComputedStyle(section);
    return section.clientWidth
      - parseFloat(style.paddingLeft)
      - parseFloat(style.paddingRight);
  }

  function update() {
    if (!active) return;
    if (uniqueItems.length === 0) return;
    var step = getCardStep();
    track.style.transform = 'translate3d(-' + (currentIndex * step) + 'px, 0, 0)';
  }

  function show(index) {
    var n = uniqueItems.length;
    if (n === 0) return;
    currentIndex = ((index % n) + n) % n;
    update();
  }

  function onPrev() { show(currentIndex - 1); }
  function onNext() { show(currentIndex + 1); }

  function activate() {
    if (active) return;
    active = true;
    buildUniqueList();
    currentIndex = pickRandomIndex();
    section.classList.add('is-mobile-carousel');
    track.style.transform = '';
    requestAnimationFrame(update);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    section.classList.remove('is-mobile-carousel');
    Array.prototype.forEach.call(track.querySelectorAll('.marquee__item'), function (item) {
      item.classList.remove('is-duplicate');
    });
    track.style.transform = '';
  }

  function sync() {
    if (mq.matches) activate();
    else deactivate();
  }

  prevBtn.addEventListener('click', onPrev);
  nextBtn.addEventListener('click', onNext);

  if (mq.addEventListener) {
    mq.addEventListener('change', sync);
  } else if (mq.addListener) {
    mq.addListener(sync);
  }

  sync();
})();

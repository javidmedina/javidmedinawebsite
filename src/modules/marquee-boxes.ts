export function initBoxMarquee(): void {
  const section = document.querySelector<HTMLElement>('.marquee--boxes');
  const track = section?.querySelector<HTMLElement>('.marquee__track');
  if (!section || !track) return;

  const desktopMq = window.matchMedia('(min-width: 769px)');
  const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

  let boxOffset = 0;
  let boxVelocity = 0;
  let boxLastTime: number | null = null;
  let boxRaf: number | null = null;
  let paused = false;
  let isDragging = false;
  let lastMouseX = 0;

  const dragSensitivity = 5;
  const friction = 1.2;
  const springK = 3.0;
  const flingBoost = 2.5;
  const baseLoopSeconds = 24;

  let baseSpeed = 0;

  function getHalfWidth(): number {
    return track!.offsetWidth / 2;
  }

  function recalcBaseSpeed(): void {
    baseSpeed = getHalfWidth() / baseLoopSeconds;
  }

  function wrapOffset(): void {
    const halfW = getHalfWidth();
    boxOffset = ((boxOffset % halfW) + halfW) % halfW - halfW;
  }

  function isMouseOverSection(): boolean {
    return section!.matches(':hover');
  }

  function boxAnimate(ts: number): void {
    if (boxLastTime === null) boxLastTime = ts;
    const dt = Math.min((ts - boxLastTime) / 1000, 0.1);
    boxLastTime = ts;

    if (!desktopMq.matches) {
      boxRaf = requestAnimationFrame(boxAnimate);
      return;
    }

    const halfW = getHalfWidth();

    if (halfW > 0 && boxOffset === 0 && !isDragging) {
      boxOffset = -halfW;
      track!.style.visibility = 'visible';
    }

    baseSpeed = halfW / baseLoopSeconds;

    if (!isDragging) {
      paused = isMouseOverSection();
    }

    if (isDragging) {
      // drag controls velocity directly
    } else if (paused) {
      boxVelocity = 0;
    } else {
      boxVelocity -= boxVelocity * friction * dt;
      boxVelocity += (baseSpeed - boxVelocity) * springK * dt;
    }

    const maxSpeed = halfW * 2;
    if (boxVelocity > maxSpeed) boxVelocity = maxSpeed;
    if (boxVelocity < -maxSpeed) boxVelocity = -maxSpeed;

    if (!paused) {
      boxOffset += boxVelocity * dt;
      wrapOffset();
    }

    track!.style.transform = `translate3d(${boxOffset}px, 0, 0)`;
    boxRaf = requestAnimationFrame(boxAnimate);
  }

  function startLoop(): void {
    if (boxRaf) return;
    if (reducedMotionMq.matches) {
      track!.style.transform = 'translate3d(0, 0, 0)';
      return;
    }
    recalcBaseSpeed();
    boxVelocity = baseSpeed;
    track!.style.visibility = 'hidden';
    boxRaf = requestAnimationFrame(boxAnimate);
  }

  function stopLoop(): void {
    if (boxRaf) {
      cancelAnimationFrame(boxRaf);
      boxRaf = null;
    }
    track!.style.transform = '';
  }

  function onDown(e: MouseEvent): void {
    if (!desktopMq.matches) return;
    if (!(e.target as HTMLElement).closest('.marquee__item')) return;
    isDragging = true;
    paused = false;
    lastMouseX = e.clientX;
    boxVelocity = 0;
    section!.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onMove(e: MouseEvent): void {
    if (!desktopMq.matches) return;
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    boxVelocity = dx * dragSensitivity;
    boxOffset += dx * 1.2;
    wrapOffset();
  }

  function onUp(): void {
    if (!desktopMq.matches) return;
    if (!isDragging) return;
    isDragging = false;
    boxVelocity *= flingBoost;
    section!.style.cursor = '';
  }

  section.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('resize', recalcBaseSpeed);

  section.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (!desktopMq.matches) return;
      if ((e.target as HTMLElement).closest('.marquee__item')) {
        isDragging = true;
        paused = false;
        lastMouseX = e.touches[0].clientX;
        boxVelocity = 0;
      }
    },
    { passive: true },
  );
  window.addEventListener('touchmove', (e: TouchEvent) => {
    if (!desktopMq.matches) return;
    if (!isDragging) return;
    const dx = e.touches[0].clientX - lastMouseX;
    lastMouseX = e.touches[0].clientX;
    boxVelocity = dx * dragSensitivity;
    boxOffset += dx * 1.2;
    wrapOffset();
  });
  window.addEventListener('touchend', onUp);

  const imgs = track.querySelectorAll<HTMLImageElement>('img');
  imgs.forEach((img) => {
    if (img.complete) return;
    img.addEventListener('load', recalcBaseSpeed);
  });

  function sync(e?: MediaQueryListEvent): void {
    const desktop = e ? e.matches : desktopMq.matches;
    if (desktop) startLoop();
    else stopLoop();
  }

  desktopMq.addEventListener('change', sync);
  sync();

  /* ------------------------------------------------------------------ */
  /*  Mobile single-card carousel (arrows + random start)                */
  /* ------------------------------------------------------------------ */
  const prevBtn = section.querySelector<HTMLButtonElement>('.marquee__arrow--prev');
  const nextBtn = section.querySelector<HTMLButtonElement>('.marquee__arrow--next');
  const mobileMq = window.matchMedia('(max-width: 768px)');
  if (!prevBtn || !nextBtn) return;

  let uniqueItems: HTMLElement[] = [];
  let currentIndex = 0;
  let active = false;

  function buildUniqueList(): void {
    const all = track!.querySelectorAll<HTMLElement>('.marquee__item:not(.marquee__item--placeholder)');
    const seen = new Set<string>();
    uniqueItems = [];
    all.forEach((item) => {
      const key = item.getAttribute('href') || item.innerHTML;
      item.classList.remove('is-duplicate');
      if (seen.has(key)) {
        item.classList.add('is-duplicate');
      } else {
        seen.add(key);
        uniqueItems.push(item);
      }
    });
  }

  function pickRandomIndex(): number {
    if (uniqueItems.length <= 1) return 0;
    return Math.floor(Math.random() * uniqueItems.length);
  }

  function getCardStep(): number {
    if (uniqueItems.length >= 2) {
      const r1 = uniqueItems[0].getBoundingClientRect();
      const r2 = uniqueItems[1].getBoundingClientRect();
      return r2.left - r1.left;
    }
    const style = getComputedStyle(section!);
    return section!.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  }

  function update(): void {
    if (!active) return;
    if (uniqueItems.length === 0) return;
    const step = getCardStep();
    track!.style.transform = `translate3d(-${currentIndex * step}px, 0, 0)`;
  }

  function show(index: number): void {
    const n = uniqueItems.length;
    if (n === 0) return;
    currentIndex = ((index % n) + n) % n;
    update();
  }

  function onPrev(): void {
    show(currentIndex - 1);
  }
  function onNext(): void {
    show(currentIndex + 1);
  }

  function activate(): void {
    if (active) return;
    active = true;
    buildUniqueList();
    currentIndex = pickRandomIndex();
    section!.classList.add('is-mobile-carousel');
    track!.style.transform = '';
    requestAnimationFrame(update);
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    section!.classList.remove('is-mobile-carousel');
    track!.querySelectorAll('.marquee__item').forEach((item) => item.classList.remove('is-duplicate'));
    track!.style.transform = '';
  }

  function syncCarousel(): void {
    if (mobileMq.matches) activate();
    else deactivate();
  }

  prevBtn.addEventListener('click', onPrev);
  nextBtn.addEventListener('click', onNext);
  mobileMq.addEventListener('change', syncCarousel);

  syncCarousel();
}

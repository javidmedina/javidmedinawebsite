export function initTextMarquee(): void {
  const marquee = document.querySelector<HTMLElement>('.marquee--text');
  const track = document.querySelector<HTMLElement>('.marquee--text .marquee__track');
  if (!marquee || !track) return;

  let offset = 0;
  let velocity = 0;
  let lastTime: number | null = null;
  let lastMouseX = 0;
  let isDragging = false;

  const dragSensitivity = 10;
  const friction = 0.4;
  const springK = 4.5;
  const flingBoost = 3.2;
  const baseLoopSeconds = 20;

  let baseSpeed = 0;
  function recalcBaseSpeed(): void {
    const halfW = track!.offsetWidth / 2;
    baseSpeed = halfW / baseLoopSeconds;
  }

  function getHalfWidth(): number {
    return track!.offsetWidth / 2;
  }

  function wrapOffset(): void {
    const halfW = getHalfWidth();
    offset = ((offset % halfW) + halfW) % halfW - halfW;
  }

  function animate(ts: number): void {
    if (lastTime === null) lastTime = ts;
    const dt = Math.min((ts - lastTime) / 1000, 0.1);
    lastTime = ts;

    if (!isDragging) {
      velocity -= velocity * friction * dt;
      velocity += (baseSpeed - velocity) * springK * dt;
    }

    const halfW = getHalfWidth();
    const maxSpeed = halfW * 2;
    if (velocity > maxSpeed) velocity = maxSpeed;
    if (velocity < -maxSpeed) velocity = -maxSpeed;

    offset -= velocity * dt;
    wrapOffset();

    track!.style.transform = `translate3d(${offset}px, 0, 0)`;
    requestAnimationFrame(animate);
  }

  function onDown(e: MouseEvent): void {
    isDragging = true;
    lastMouseX = e.clientX;
    velocity = 0;
    marquee!.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onMove(e: MouseEvent): void {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    velocity = -(dx * dragSensitivity);
    offset += dx * 1.2;
    const halfW = getHalfWidth();
    if (offset <= -halfW) offset += halfW;
    if (offset >= 0) offset -= halfW;
  }

  function onUp(): void {
    if (!isDragging) return;
    isDragging = false;
    velocity *= flingBoost;
    marquee!.style.cursor = 'grab';
  }

  function onResize(): void {
    recalcBaseSpeed();
    if (!isDragging) velocity = baseSpeed;
  }

  marquee.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('resize', onResize);

  marquee.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      isDragging = true;
      lastMouseX = e.touches[0].clientX;
      velocity = 0;
    },
    { passive: false },
  );
  window.addEventListener('touchmove', (e: TouchEvent) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - lastMouseX;
    lastMouseX = e.touches[0].clientX;
    velocity = -(dx * dragSensitivity);
    offset += dx * 1.2;
    const halfW = getHalfWidth();
    if (offset <= -halfW) offset += halfW;
    if (offset >= 0) offset -= halfW;
  });
  window.addEventListener('touchend', onUp);

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mq.matches) {
    track.style.transform = 'translate3d(0, 0, 0)';
    return;
  }

  recalcBaseSpeed();
  velocity = baseSpeed;
  requestAnimationFrame(animate);
}

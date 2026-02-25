export function createAnimator(clips, initial = Object.keys(clips)[0]) {
  return { clips, current: initial, frameIdx: 0, timer: 0, flipX: false, flipY: false };
}

export function animatorPlay(anim, clip) {
  if (anim.current === clip) return;
  anim.current = clip; anim.frameIdx = 0; anim.timer = 0;
}

export function animatorUpdate(anim, delta) {
  const clip = anim.clips[anim.current];
  if (!clip?.frames.length) return;
  anim.timer += delta;
  const dur = Array.isArray(clip.durations)
    ? (clip.durations[anim.frameIdx] ?? clip.durations[0])
    : clip.durations;
  if (anim.timer >= dur) {
    anim.timer -= dur;
    anim.frameIdx = (anim.frameIdx + 1) % clip.frames.length;
  }
}

export function animatorSprite(anim) {
  return anim.clips[anim.current]?.frames[anim.frameIdx] ?? null;
}

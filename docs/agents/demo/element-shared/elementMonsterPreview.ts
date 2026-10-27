import './elementCrabPreview.css'

const stage = document.querySelector<HTMLElement>('#stage')
const state = document.querySelector<HTMLElement>('#state')
const buttons = document.querySelectorAll<HTMLButtonElement>('[data-action]')
const canvas = document.querySelector<HTMLCanvasElement>('#monster')
const context = canvas?.getContext('2d')
const sprite = new Image()
if (canvas?.dataset.sprite) sprite.src = canvas.dataset.sprite

// Row bands provide a small body deformation while preserving the source pixels.
// This is a preview renderer; it does not alter the source or the battle system.
function draw(time: number) {
  if (!canvas || !context || !sprite.complete || !sprite.naturalWidth) return
  const action = stage?.dataset.action || 'idle'
  const kind = canvas.dataset.motion || 'spirit'
  const motion = Math.sin(time / (action === 'move' ? 150 : 350))
  const strength = action === 'attack' || action === 'skill' ? 1.8 : action === 'move' ? 1.3 : .65
  const band = 8
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = false
  for (let y = 0; y < canvas.height; y += band) {
    const height = Math.min(band, canvas.height - y)
    const fraction = y / canvas.height
    const shift = kind === 'spirit'
      ? Math.sin(time / 330 + fraction * 5) * 6 * strength
      : motion * (1 - fraction) * (kind === 'boss' ? 7 : 5) * strength
    context.drawImage(sprite, 0, y, canvas.width, height, Math.round(shift), y, canvas.width, height)
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) window.requestAnimationFrame(draw)
}

sprite.addEventListener('load', () => {
  if (!canvas) return
  canvas.width = sprite.naturalWidth
  canvas.height = sprite.naturalHeight
  window.requestAnimationFrame(draw)
}, { once: true })

for (const button of buttons) {
  button.addEventListener('click', () => {
    const action = button.dataset.action
    if (!stage || !state || !action) return
    stage.dataset.action = action
    state.textContent = button.querySelector('strong')?.textContent || ''
    for (const option of buttons) option.setAttribute('aria-pressed', String(option === button))
  })
}

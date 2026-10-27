import './elementCrabPreview.css'

const stage = document.querySelector<HTMLElement>('#stage')
const state = document.querySelector<HTMLElement>('#state')
const buttons = document.querySelectorAll<HTMLButtonElement>('[data-action]')
const names: Record<string, string> = { idle: '待机', move: '移动', attack: '攻击', skill: '泡泡撞击' }
const canvas = document.querySelector<HTMLCanvasElement>('#crab')
const context = canvas?.getContext('2d')
const sprite = new Image()
sprite.src = '/frontend_react/src/assets/combat/element-preview/bubble-hermit-crab-concept-v1.png'

// Keep the approved concept intact: masks only affect this preview's drawing.
const claw = { x: 320, y: 320, width: 198, height: 410 }
const legs = [
  { x: 475, y: 750, width: 120, height: 155 },
  { x: 595, y: 750, width: 150, height: 155 },
  { x: 745, y: 750, width: 165, height: 155 },
]

function drawFrame(time: number) {
  if (!context || !canvas || !sprite.complete || !sprite.naturalWidth) return
  const action = stage?.dataset.action || 'idle'
  const pulse = Math.sin(time / (action === 'move' ? 140 : 330))
  const reach = action === 'attack' || action === 'skill' ? Math.max(0, Math.sin(time / 280)) : 0
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = false
  context.save()
  context.beginPath()
  context.rect(0, 0, canvas.width, canvas.height)
  for (const part of [claw, ...legs]) context.rect(part.x, part.y, part.width, part.height)
  context.clip('evenodd')
  context.drawImage(sprite, 0, 0)
  context.restore()
  context.drawImage(sprite, claw.x, claw.y, claw.width, claw.height,
    claw.x - reach * 12, claw.y - pulse * 5 - reach * 18, claw.width, claw.height)
  legs.forEach((part, index) => {
    const lift = action === 'move' ? Math.max(0, Math.sin(time / 140 + index * 2.1)) * 9 : pulse * 2
    context.drawImage(sprite, part.x, part.y, part.width, part.height,
      part.x, part.y - lift, part.width, part.height)
  })
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) window.requestAnimationFrame(drawFrame)
}

sprite.addEventListener('load', () => window.requestAnimationFrame(drawFrame), { once: true })

for (const button of buttons) {
  button.addEventListener('click', () => {
    const action = button.dataset.action
    if (!stage || !state || !action || !names[action]) return
    stage.dataset.action = action
    state.textContent = names[action]
    for (const option of buttons) option.setAttribute('aria-pressed', String(option === button))
  })
}

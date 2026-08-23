import { useEffect, useRef } from 'react'

const NODE_COUNT = 34
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function buildNodes() {
  return Array.from({ length:NODE_COUNT }, (_, index) => {
    const y = 1 - (index / (NODE_COUNT - 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const angle = index * GOLDEN_ANGLE
    return { x:Math.cos(angle) * radius, y, z:Math.sin(angle) * radius, kind:index % 9 === 0 ? 'approval' : index % 5 === 0 ? 'agent' : 'tool' }
  })
}

const NODES = buildNodes()
const LINKS = NODES.flatMap((node, index) => NODES.slice(index + 1).map((target, offset) => ({
  a:index,
  b:index + offset + 1,
  distance:Math.hypot(node.x - target.x, node.y - target.y, node.z - target.z),
})).filter(link => link.distance < .72)).slice(0, 58)

export default function SpatialOperationsScene() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d', { alpha:true })
    if (!context) return undefined

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let frame = 0
    let rotation = 0
    let targetX = 0
    let targetY = 0
    let pointerX = 0
    let pointerY = 0
    let visible = true

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const rotate = (node, time) => {
      const yaw = rotation + pointerX * .32
      const pitch = -.14 + pointerY * .2
      const x1 = node.x * Math.cos(yaw) - node.z * Math.sin(yaw)
      const z1 = node.x * Math.sin(yaw) + node.z * Math.cos(yaw)
      const y1 = node.y * Math.cos(pitch) - z1 * Math.sin(pitch)
      const z2 = node.y * Math.sin(pitch) + z1 * Math.cos(pitch)
      const pulse = node.kind === 'agent' ? Math.sin(time * .002 + node.x * 4) * .018 : 0
      return { x:x1, y:y1, z:z2, pulse }
    }

    const draw = time => {
      if (!visible) { frame = window.requestAnimationFrame(draw); return }
      context.clearRect(0, 0, width, height)
      pointerX += (targetX - pointerX) * .055
      pointerY += (targetY - pointerY) * .055
      if (!reduceMotion) rotation += .00135

      const centerX = width * .52
      const centerY = height * .5
      const size = Math.min(width, height) * .34
      const points = NODES.map(node => {
        const value = rotate(node, time)
        const perspective = 2.65 / (3.35 - value.z)
        return { ...value, sx:centerX + value.x * size * perspective, sy:centerY + value.y * size * perspective, scale:perspective }
      })

      const halo = context.createRadialGradient(centerX, centerY, 8, centerX, centerY, size * 1.35)
      halo.addColorStop(0, 'rgba(33,216,129,.14)')
      halo.addColorStop(.52, 'rgba(112,73,215,.07)')
      halo.addColorStop(1, 'rgba(7,28,20,0)')
      context.fillStyle = halo
      context.beginPath(); context.arc(centerX, centerY, size * 1.35, 0, Math.PI * 2); context.fill()

      context.lineWidth = 1
      for (const link of LINKS) {
        const a = points[link.a]
        const b = points[link.b]
        const depth = Math.max(.08, (a.z + b.z + 2) / 4)
        context.strokeStyle = `rgba(113,225,165,${.08 + depth * .28})`
        context.beginPath(); context.moveTo(a.sx, a.sy); context.lineTo(b.sx, b.sy); context.stroke()
      }

      points.map((point, index) => ({ point, index })).sort((left, right) => left.point.z - right.point.z).forEach(({ point, index }) => {
        const node = NODES[index]
        const base = node.kind === 'approval' ? 5.3 : node.kind === 'agent' ? 4.3 : 3
        const radius = (base + point.pulse * 20) * point.scale
        const alpha = .4 + ((point.z + 1) / 2) * .6
        context.shadowBlur = node.kind === 'approval' ? 18 : 9
        context.shadowColor = node.kind === 'approval' ? 'rgba(181,155,255,.8)' : 'rgba(33,216,129,.65)'
        context.fillStyle = node.kind === 'approval' ? `rgba(188,168,255,${alpha})` : node.kind === 'agent' ? `rgba(41,222,136,${alpha})` : `rgba(224,255,238,${alpha})`
        context.beginPath(); context.arc(point.sx, point.sy, radius, 0, Math.PI * 2); context.fill()
        context.shadowBlur = 0
      })

      const core = context.createRadialGradient(centerX - 8, centerY - 10, 2, centerX, centerY, 31)
      core.addColorStop(0, '#eafff3'); core.addColorStop(.24, '#32df8d'); core.addColorStop(1, '#086c45')
      context.shadowBlur = 28; context.shadowColor = 'rgba(33,216,129,.55)'; context.fillStyle = core
      context.beginPath(); context.arc(centerX, centerY, 24, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0
      context.strokeStyle = 'rgba(255,255,255,.72)'; context.lineWidth = 2
      context.beginPath(); context.moveTo(centerX - 8, centerY + 5); context.lineTo(centerX, centerY - 7); context.lineTo(centerX + 8, centerY + 5); context.stroke()

      if (!reduceMotion) frame = window.requestAnimationFrame(draw)
    }

    const onPointerMove = event => {
      if (reduceMotion) return
      if (event.pointerType && event.pointerType !== 'mouse') return
      const bounds = canvas.getBoundingClientRect()
      targetX = ((event.clientX - bounds.left) / bounds.width - .5) * 2
      targetY = ((event.clientY - bounds.top) / bounds.height - .5) * 2
    }
    const onPointerLeave = () => { targetX = 0; targetY = 0 }
    const resizeObserver = new ResizeObserver(resize)
    const intersectionObserver = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true }, { rootMargin:'100px' })
    resizeObserver.observe(canvas)
    intersectionObserver.observe(canvas)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)
    resize()
    frame = window.requestAnimationFrame(draw)

    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return <canvas ref={canvasRef} className="spatial-operations-canvas" aria-hidden="true" />
}

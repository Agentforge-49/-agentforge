import { useRef, useState } from 'react'
import { Bot, GitBranch, LocateFixed, Maximize2, Minus, Play, Plug, Plus, ShieldCheck, Square, Type, Wrench } from 'lucide-react'
import './WorkflowCanvas.css'

const META = { input:[Type,'#2563eb'], agent:[Bot,'#7049d7'], tool:[Wrench,'#0b7a53'], connector:[Plug,'#c2377f'], transform:[Square,'#0b7c91'], condition:[GitBranch,'#b56a08'], approval:[ShieldCheck,'#c24c2c'], output:[Play,'#0b7a53'] }
const WIDTH = 174
const HEIGHT = 66

export default function WorkflowCanvas({ nodes, edges, selectedId, onSelect, onMove, onAutoLayout }) {
  const dragRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x:20, y:20 })
  const [panning, setPanning] = useState(null)
  const pointerMove = event => {
    if (dragRef.current) {
      const { id, startX, startY, origin } = dragRef.current
      onMove(id, { x:Math.max(20, origin.x + (event.clientX - startX) / zoom), y:Math.max(20, origin.y + (event.clientY - startY) / zoom) })
    } else if (panning) setPan({ x:panning.origin.x + event.clientX - panning.x, y:panning.origin.y + event.clientY - panning.y })
  }
  const pointerUp = () => { dragRef.current = null; setPanning(null) }
  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  return <div className="workflow-canvas-shell">
    <div className="workflow-canvas-toolbar" aria-label="Canvas controls"><button onClick={() => setZoom(value => Math.min(1.6, value + .1))} aria-label="Zoom in"><Plus size={14}/></button><button onClick={() => setZoom(value => Math.max(.55, value - .1))} aria-label="Zoom out"><Minus size={14}/></button><button onClick={() => { setPan({ x:20,y:20 }); setZoom(1) }} aria-label="Reset view"><LocateFixed size={14}/></button><button onClick={onAutoLayout}><Maximize2 size={14}/> Auto-layout</button><span>{Math.round(zoom*100)}%</span></div>
    <div className="workflow-canvas-viewport" onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={pointerUp} onPointerDown={event => { if(event.target === event.currentTarget) setPanning({ x:event.clientX,y:event.clientY,origin:pan }) }}>
      <div className="workflow-canvas-world" style={{ transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
        <svg width="1200" height="560" aria-hidden="true"><defs><marker id="workflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>{edges.map(edge => { const source=nodeMap.get(edge.source),target=nodeMap.get(edge.target); if(!source||!target)return null; const x1=source.position.x+WIDTH,y1=source.position.y+HEIGHT/2,x2=target.position.x,y2=target.position.y+HEIGHT/2,bend=Math.max(40,Math.abs(x2-x1)/2); return <path key={edge.id} className={`workflow-edge workflow-edge-${edge.mode||'always'}`} d={`M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2}`} markerEnd="url(#workflow-arrow)"/> })}</svg>
        {nodes.map(node => { const [Icon,color]=META[node.type]||META.transform; return <button key={node.id} className={`workflow-canvas-node${selectedId===node.id?' selected':''}`} style={{ left:node.position.x,top:node.position.y,'--node-color':color }} onClick={() => onSelect(node.id)} onPointerDown={event => { event.stopPropagation(); dragRef.current={ id:node.id,startX:event.clientX,startY:event.clientY,origin:node.position } }} aria-pressed={selectedId===node.id}><span><Icon size={16}/></span><span><strong>{node.label}</strong><small>{node.type}</small></span><i/></button> })}
      </div>
      <div className="workflow-minimap" aria-hidden="true">{nodes.map(node => <i key={node.id} style={{ left:`${Math.min(92,node.position.x/12)}%`,top:`${Math.min(82,node.position.y/5.6)}%`,background:(META[node.type]||META.transform)[1] }}/>)}</div>
    </div><div className="workflow-canvas-help">Drag nodes to organize · drag empty space to pan · use controls to zoom</div>
  </div>
}

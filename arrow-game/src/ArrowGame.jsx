import React, { useState, useRef, useEffect } from 'react'
import './App.css'

const ARROW_CHARS = { U: '↑', D: '↓', L: '←', R: '→' }
const DIR_VECTORS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }

function cloneGrid(g) {
  return g.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

function allEmpty(grid) {
  return grid.every((row) => row.every((c) => c === null))
}

function canExit(grid, r, c) {
  const cell = grid[r][c]
  if (!cell || !cell.head) return false
  const { dir, id } = cell
  const H = grid.length
  const W = grid[0].length
  const [dr, dc] = DIR_VECTORS[dir]
  let rr = r + dr
  let cc = c + dc
  while (rr >= 0 && rr < H && cc >= 0 && cc < W) {
    const other = grid[rr][cc]
    if (other && other.id !== id) return false
    rr += dr
    cc += dc
  }
  return true
}

// Async random level generation with bounded solver to avoid blocking UI
async function generateRandomLevelAsync(rows = 4, cols = 4, density = 0.32, maxLen = 2, maxAttempts = 500) {
  const dirs = ['U', 'D', 'L', 'R']
  let idCounter = 1
  const yieldEvery = 20
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const g = Array.from({ length: rows }, () => Array(cols).fill(null))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (g[r][c] !== null) continue
        if (Math.random() >= density) continue
        const dir = dirs[Math.floor(Math.random() * dirs.length)]
        const len = 1 + Math.floor(Math.random() * maxLen)
        const [dr, dc] = DIR_VECTORS[dir]
        const positions = []
        let ok = true
        for (let k = 0; k < len; k++) {
          const rr = r - dr * k
          const cc = c - dc * k
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) {
            ok = false
            break
          }
          if (g[rr][cc] !== null) {
            ok = false
            break
          }
          positions.push([rr, cc])
        }
        if (!ok) continue
        const id = idCounter++
        for (let k = 0; k < positions.length; k++) {
          const [rr, cc] = positions[k]
          g[rr][cc] = { id, dir, len, head: k === 0 }
        }
      }
    }
    const hasArrow = g.some((row) => row.some(Boolean))
    const hasImmediateExit = hasArrow && g.some((row, r) => row.some((cell, c) => cell && cell.head && canExit(g, r, c)))
    if (hasArrow && hasImmediateExit) {
      const sol = findSolutionLimited(g, 20000)
      if (sol) return g
    }
    if (attempt % yieldEvery === 0) await new Promise((res) => setTimeout(res, 0))
  }
  // fallback simple layout
  const fallback = Array.from({ length: rows }, () => Array(cols).fill(null))
  if (rows >= 1 && cols >= 2) {
    fallback[0][0] = { id: 1, dir: 'R', len: 1, head: true }
    if (cols > 1) fallback[0][1] = { id: 1, dir: 'R', len: 1, head: false }
  }
  return fallback
}

function serializeGrid(g) {
  return g.map((row) => row.map((c) => (c ? c.id : 0)).join(',')).join(';')
}

// BFS solver with state limit to keep performance predictable
function findSolutionLimited(startGrid, maxStates = 20000) {
  const rows = startGrid.length
  const cols = startGrid[0].length

  function cloneState(g) {
    return g.map((r) => r.map((c) => (c ? { ...c } : null)))
  }

  function removeId(g, id) {
    const ng = cloneState(g)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (ng[r][c] && ng[r][c].id === id) ng[r][c] = null
    return ng
  }

  const startKey = serializeGrid(startGrid)
  const visited = new Set([startKey])
  const queue = [{ grid: cloneState(startGrid), seq: [] }]
  let states = 0

  while (queue.length > 0) {
    const node = queue.shift()
    states++
    if (states > maxStates) return null
    const g = node.grid
    // empty?
    if (g.every((row) => row.every((c) => c === null))) return node.seq

    // find removable heads
    const moves = []
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = g[r][c]
      if (cell && cell.head && canExit(g, r, c)) moves.push([r, c])
    }
    for (const [r, c] of moves) {
      const id = g[r][c].id
      const ng = removeId(g, id)
      const key = serializeGrid(ng)
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ grid: ng, seq: [...node.seq, [r, c]] })
    }
  }
  return null
}

const ArrowGame = () => {
  const [rows, setRows] = useState(4)
  const [cols, setCols] = useState(4)
  const [density, setDensity] = useState(0.32)
  const [maxLen, setMaxLen] = useState(2)
  const idRef = useRef(0)

  const emptyGrid = () => Array.from({ length: rows }, () => Array(cols).fill(null))
  const [initialGrid, setInitialGrid] = useState(() => emptyGrid())
  const [grid, setGrid] = useState(() => cloneGrid(initialGrid))
  const [hintCell, setHintCell] = useState(null)
  const [generating, setGenerating] = useState(false)

  function resetLevel() {
    setGrid(cloneGrid(initialGrid))
    setHintCell(null)
  }

  async function newRandom() {
    setGenerating(true)
    try {
      const g = await generateRandomLevelAsync(rows, cols, density, maxLen)
      setInitialGrid(cloneGrid(g))
      setGrid(cloneGrid(g))
      setHintCell(null)
    } catch (err) {
      console.error('Generation error', err)
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    // generate initial level on mount without blocking
    let mounted = true
    setGenerating(true)
    generateRandomLevelAsync(rows, cols, density, maxLen)
      .then((g) => {
        if (!mounted) return
        setInitialGrid(cloneGrid(g))
        setGrid(cloneGrid(g))
      })
      .catch((e) => console.error(e))
      .finally(() => mounted && setGenerating(false))
    return () => {
      mounted = false
    }
  }, [])

  function handleClick(r, c) {
    if (!grid[r][c]) return
    if (!grid[r][c].head) return
    if (canExit(grid, r, c)) {
      const id = grid[r][c].id
      const ng = cloneGrid(grid)
      for (let rr = 0; rr < ng.length; rr++) {
        for (let cc = 0; cc < ng[0].length; cc++) {
          if (ng[rr][cc] && ng[rr][cc].id === id) ng[rr][cc] = null
        }
      }
      setGrid(ng)
      setHintCell(null)
      return
    }
    setHintCell([r, c])
    setTimeout(() => setHintCell(null), 500)
  }

  function giveHint() {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[0].length; c++) {
        if (grid[r][c] && grid[r][c].head && canExit(grid, r, c)) {
          setHintCell([r, c])
          setTimeout(() => setHintCell(null), 1500)
          return
        }
      }
    }
    setHintCell(null)
    alert('No arrow can exit directly — try a different sequence or reset.')
  }

  const cleared = allEmpty(grid)

  return (
    <div className="game-root">
      <div className="controls">
        <button onClick={resetLevel} disabled={generating}>Reset</button>
        <button onClick={giveHint} disabled={generating}>Hint</button>
        <button onClick={newRandom} disabled={generating}>{generating ? 'Generating…' : 'New Random'}</button>
      </div>

      <div className="settings">
        <label>Rows: <input type="number" min={2} max={12} value={rows} onChange={(e) => setRows(Math.max(2, Math.min(12, Number(e.target.value))))} /></label>
        <label>Cols: <input type="number" min={2} max={12} value={cols} onChange={(e) => setCols(Math.max(2, Math.min(12, Number(e.target.value))))} /></label>
        <label>Density: <input type="range" min={0} max={0.9} step={0.02} value={density} onChange={(e) => setDensity(Number(e.target.value))} /></label>
        <label>Max Len: <input type="number" min={1} max={4} value={maxLen} onChange={(e) => setMaxLen(Math.max(1, Math.min(4, Number(e.target.value))))} /></label>
        <button onClick={newRandom} disabled={generating}>{generating ? 'Generating…' : 'Apply & New'}</button>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 64px)`,
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r}-${c}`
            const isHint = hintCell && hintCell[0] === r && hintCell[1] === c
            const cls = ['cell']
            if (!cell) cls.push('empty')
            else if (cell.head) cls.push('arrow')
            else cls.push('body')
            if (isHint) cls.push('hint')
            return (
              <button key={key} className={cls.join(' ')} onClick={() => handleClick(r, c)}>
                {cell && cell.head ? `${ARROW_CHARS[cell.dir]}${cell.len > 1 ? cell.len : ''}` : ''}
              </button>
            )
          }),
        )}
      </div>

      <div className="status">
        {cleared ? <div className="cleared">Level cleared! 🎉</div> : <div>Arrows left: {grid.flat().filter(Boolean).filter((c) => c.head).length}</div>}
        {generating ? <div style={{ marginTop: 8, color: '#9fb7ff' }}>Generating level…</div> : null}
      </div>
    </div>
  )
}

export default ArrowGame
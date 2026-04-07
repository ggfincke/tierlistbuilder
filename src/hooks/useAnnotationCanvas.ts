// src/hooks/useAnnotationCanvas.ts
// canvas state management for screenshot annotation — strokes, text, & compositing

import { useCallback, useRef, useState } from 'react'

import { triggerDownload } from '../utils/exportImage'
import { toFileBase } from '../utils/constants'

export interface StrokePoint
{
  x: number
  y: number
}

export interface Stroke
{
  points: StrokePoint[]
  color: string
  width: number
}

export interface TextAnnotation
{
  x: number
  y: number
  text: string
  color: string
  fontSize: number
}

export type AnnotationTool = 'pen' | 'text'

type AnnotationItem =
  | { type: 'stroke'; data: Stroke }
  | { type: 'text'; data: TextAnnotation }

// render a single annotation item onto a canvas context
const drawAnnotationItem = (
  ctx: CanvasRenderingContext2D,
  item: AnnotationItem
): void =>
{
  if (item.type === 'stroke')
  {
    const { points, color, width } = item.data
    if (points.length < 2) return
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++)
    {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()
  }
  else if (item.type === 'text')
  {
    const { x, y, text, color, fontSize } = item.data
    ctx.fillStyle = color
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.fillText(text, x, y)
  }
}

export const useAnnotationCanvas = (
  backgroundImage: string | null,
  title: string
) =>
{
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [activeTool, setActiveTool] = useState<AnnotationTool>('pen')
  const [color, setColor] = useState('#ff4444')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const fontSize = 18
  const [history, setHistory] = useState<AnnotationItem[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const currentStrokeRef = useRef<StrokePoint[]>([])

  // get canvas-relative coordinates from a mouse/touch event
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): StrokePoint | null =>
    {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      let clientX: number
      let clientY: number

      if ('touches' in e)
      {
        const touch = e.touches[0] ?? e.changedTouches[0]
        if (!touch) return null
        clientX = touch.clientX
        clientY = touch.clientY
      }
      else
      {
        clientX = e.clientX
        clientY = e.clientY
      }

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      }
    },
    []
  )

  // redraw all annotations onto the canvas
  const redraw = useCallback((items: AnnotationItem[]) =>
  {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const item of items) drawAnnotationItem(ctx, item)
  }, [])

  // pen tool handlers
  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) =>
    {
      if (activeTool !== 'pen') return
      const point = getCanvasPoint(e)
      if (!point) return
      setIsDrawing(true)
      currentStrokeRef.current = [point]
    },
    [activeTool, getCanvasPoint]
  )

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) =>
    {
      if (!isDrawing || activeTool !== 'pen') return
      const point = getCanvasPoint(e)
      if (!point) return

      currentStrokeRef.current.push(point)

      // draw current stroke in real-time
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!ctx) return

      const points = currentStrokeRef.current
      if (points.length < 2) return

      ctx.strokeStyle = color
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y)
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
      ctx.stroke()
    },
    [activeTool, color, getCanvasPoint, isDrawing, strokeWidth]
  )

  const handlePointerUp = useCallback(() =>
  {
    if (!isDrawing) return
    setIsDrawing(false)

    const points = [...currentStrokeRef.current]
    currentStrokeRef.current = []

    if (points.length < 2) return

    const newItem: AnnotationItem = {
      type: 'stroke',
      data: { points, color, width: strokeWidth },
    }
    setHistory((prev) => [...prev, newItem])
  }, [color, isDrawing, strokeWidth])

  // text tool handler
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) =>
    {
      if (activeTool !== 'text') return
      const point = getCanvasPoint(e)
      if (!point) return

      const text = window.prompt('Enter text:')
      if (!text) return

      const newItem: AnnotationItem = {
        type: 'text',
        data: { x: point.x, y: point.y, text, color, fontSize },
      }
      const nextHistory = [...history, newItem]
      setHistory(nextHistory)
      redraw(nextHistory)
    },
    [activeTool, color, fontSize, getCanvasPoint, history, redraw]
  )

  // undo last annotation
  const undo = useCallback(() =>
  {
    setHistory((prev) =>
    {
      const next = prev.slice(0, -1)
      redraw(next)
      return next
    })
  }, [redraw])

  // clear all annotations
  const clearAll = useCallback(() =>
  {
    setHistory([])
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  // composite background + annotations & trigger download
  const compositeAndDownload = useCallback(async () =>
  {
    if (!backgroundImage) return

    const img = new Image()
    img.src = backgroundImage
    await new Promise<void>((resolve) =>
    {
      img.onload = () => resolve()
    })

    const output = document.createElement('canvas')
    output.width = img.naturalWidth
    output.height = img.naturalHeight
    const ctx = output.getContext('2d')
    if (!ctx) return

    // draw background then overlay annotations
    ctx.drawImage(img, 0, 0)
    for (const item of history) drawAnnotationItem(ctx, item)

    const dataUrl = output.toDataURL('image/png')
    triggerDownload(dataUrl, `${toFileBase(title)}-annotated.png`)
  }, [backgroundImage, history, title])

  return {
    canvasRef,
    activeTool,
    setActiveTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    history,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleCanvasClick,
    undo,
    clearAll,
    compositeAndDownload,
  }
}

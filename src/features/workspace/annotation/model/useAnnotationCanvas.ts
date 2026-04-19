// src/features/workspace/annotation/model/useAnnotationCanvas.ts
// canvas state management for screenshot annotation — strokes, text, & compositing

import { useCallback, useEffect, useRef, useState } from 'react'

import { triggerDownload } from '~/features/workspace/export/lib/exportImage'
import { toFileBase } from '~/shared/lib/fileName'

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

export type AnnotationFontFamily = 'sans-serif' | 'serif' | 'monospace'

export const FONT_FAMILY_LABELS: Record<AnnotationFontFamily, string> = {
  'sans-serif': 'Sans',
  serif: 'Serif',
  monospace: 'Mono',
}

export interface TextStyle
{
  bold: boolean
  italic: boolean
  fontFamily: AnnotationFontFamily
}

export interface TextAnnotation
{
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  bold: boolean
  italic: boolean
  fontFamily: AnnotationFontFamily
}

export type AnnotationTool = 'pen' | 'text'

// pending inline text input positioned over the canvas
export interface PendingTextInput
{
  // canvas-space coordinates (for final rendering)
  canvasX: number
  canvasY: number
  // CSS-space coordinates relative to the canvas container (for input positioning)
  cssX: number
  cssY: number
  color: string
  fontSize: number
  // CSS-scaled font size for the input element
  cssFontSize: number
  bold: boolean
  italic: boolean
  fontFamily: AnnotationFontFamily
}

type AnnotationItem =
  | { type: 'stroke'; data: Stroke }
  | { type: 'text'; data: TextAnnotation }

// build the canvas font string from text style properties
const buildFontString = (
  fontSize: number,
  bold: boolean,
  italic: boolean,
  fontFamily: AnnotationFontFamily
): string =>
{
  const parts: string[] = []
  if (italic) parts.push('italic')
  if (bold) parts.push('bold')
  parts.push(`${fontSize}px`)
  parts.push(fontFamily)
  return parts.join(' ')
}

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
    const { x, y, text, color, fontSize, bold, italic, fontFamily } = item.data
    ctx.fillStyle = color
    ctx.font = buildFontString(fontSize, bold, italic, fontFamily)
    ctx.fillText(text, x, y)
  }
}

// initial annotation color — bright red for high visibility on most screenshots
const DEFAULT_ANNOTATION_COLOR = '#ff4444'

export const useAnnotationCanvas = (
  backgroundImage: string | null,
  title: string
) =>
{
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [activeTool, setActiveTool] = useState<AnnotationTool>('pen')
  const [color, setColor] = useState(DEFAULT_ANNOTATION_COLOR)
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [fontSize, setFontSize] = useState(18)
  const [textStyle, setTextStyle] = useState<TextStyle>({
    bold: true,
    italic: false,
    fontFamily: 'sans-serif',
  })
  const [history, setHistory] = useState<AnnotationItem[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const currentStrokeRef = useRef<StrokePoint[]>([])

  // pending inline text input — null when not editing
  const [pendingText, setPendingText] = useState<PendingTextInput | null>(null)

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

  // get CSS-space coordinates relative to the canvas container
  const getCssPoint = useCallback(
    (
      e: React.MouseEvent
    ): { cssX: number; cssY: number; scaleY: number } | null =>
    {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      return {
        cssX: e.clientX - rect.left,
        cssY: e.clientY - rect.top,
        scaleY: canvas.height / rect.height,
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

  // keep the canvas in sync w/ history. driving redraw from an effect avoids
  // running side-effects inside setState updaters (which StrictMode would
  // double-invoke, causing double-draws of pending transitions)
  useEffect(() =>
  {
    redraw(history)
  }, [history, redraw])

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

  // text tool — click canvas to start inline editing
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) =>
    {
      if (activeTool !== 'text') return
      if (pendingText) return

      const canvasPoint = getCanvasPoint(e)
      const cssPoint = getCssPoint(e)
      if (!canvasPoint || !cssPoint) return

      const cssFontSize = fontSize / cssPoint.scaleY

      setPendingText({
        canvasX: canvasPoint.x,
        canvasY: canvasPoint.y,
        cssX: cssPoint.cssX,
        cssY: cssPoint.cssY,
        color,
        fontSize,
        cssFontSize,
        bold: textStyle.bold,
        italic: textStyle.italic,
        fontFamily: textStyle.fontFamily,
      })
    },
    [
      activeTool,
      color,
      fontSize,
      getCanvasPoint,
      getCssPoint,
      pendingText,
      textStyle,
    ]
  )

  // commit inline text to canvas & history
  const commitText = useCallback(
    (text: string) =>
    {
      if (!pendingText) return
      setPendingText(null)

      const trimmed = text.trim()
      if (!trimmed) return

      const newItem: AnnotationItem = {
        type: 'text',
        data: {
          x: pendingText.canvasX,
          y: pendingText.canvasY,
          text: trimmed,
          color: pendingText.color,
          fontSize: pendingText.fontSize,
          bold: pendingText.bold,
          italic: pendingText.italic,
          fontFamily: pendingText.fontFamily,
        },
      }
      setHistory((prev) => [...prev, newItem])
    },
    [pendingText]
  )

  // cancel inline text without committing
  const cancelText = useCallback(() =>
  {
    setPendingText(null)
  }, [])

  // undo last annotation
  const undo = useCallback(() =>
  {
    setPendingText(null)
    setHistory((prev) => prev.slice(0, -1))
  }, [])

  // clear all annotations — the history-effect handles the canvas clear
  const clearAll = useCallback(() =>
  {
    setPendingText(null)
    setHistory([])
  }, [])

  // composite background + annotations & trigger download
  const compositeAndDownload = useCallback(async () =>
  {
    if (!backgroundImage) return

    const img = new Image()
    img.src = backgroundImage
    await new Promise<void>((resolve, reject) =>
    {
      img.onload = () => resolve()
      img.onerror = () =>
        reject(new Error('Failed to decode annotation background image'))
    })

    const output = document.createElement('canvas')
    output.width = img.naturalWidth
    output.height = img.naturalHeight
    const ctx = output.getContext('2d')
    if (!ctx) return

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
    fontSize,
    setFontSize,
    textStyle,
    setTextStyle,
    history,
    pendingText,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleCanvasClick,
    commitText,
    cancelText,
    undo,
    clearAll,
    compositeAndDownload,
  }
}

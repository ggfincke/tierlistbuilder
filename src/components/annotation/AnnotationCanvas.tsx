// src/components/annotation/AnnotationCanvas.tsx
// canvas overlay for drawing annotations on top of a background image

import { memo, useEffect, useRef } from 'react'

interface AnnotationCanvasProps
{
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  backgroundImage: string
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onClick: (e: React.MouseEvent) => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  cursor: string
}

export const AnnotationCanvas = memo(
  ({
    canvasRef,
    backgroundImage,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onClick,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    cursor,
  }: AnnotationCanvasProps) =>
  {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const bgRef = useRef<HTMLImageElement | null>(null)

    // set canvas dimensions to match the background image
    useEffect(() =>
    {
      const img = new Image()
      img.src = backgroundImage
      img.onload = () =>
      {
        bgRef.current = img
        const canvas = canvasRef.current
        if (canvas)
        {
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
        }
      }
    }, [backgroundImage, canvasRef])

    return (
      <div
        ref={containerRef}
        className="relative inline-block max-h-full max-w-full overflow-auto"
      >
        <img
          src={backgroundImage}
          alt="Board export"
          className="block max-h-[70vh] max-w-full"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ cursor }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onClick={onClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
      </div>
    )
  }
)

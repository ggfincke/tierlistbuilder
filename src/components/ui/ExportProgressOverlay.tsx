// src/components/ui/ExportProgressOverlay.tsx
// full-screen overlay shown during multi-board export to block interaction & show progress

interface ExportProgressOverlayProps
{
  current: number
  total: number
}

export const ExportProgressOverlay = ({
  current,
  total,
}: ExportProgressOverlayProps) =>
{
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-72 rounded-xl border border-[#444] bg-[#1e1e1e] px-6 py-5 shadow-lg shadow-black/40">
        <p className="text-center text-sm text-slate-100">
          Exporting… {current} of {total}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#333]">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

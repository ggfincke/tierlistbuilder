// src/shared/board-ui/SnapGuide.tsx
// center-axis guide overlay for snapped image & label positioning

interface SnapGuideProps
{
  axis: 'x' | 'y'
}

export const SnapGuide = ({ axis }: SnapGuideProps) => (
  <div
    aria-hidden="true"
    className={
      axis === 'x'
        ? 'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--t-accent)]'
        : 'pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--t-accent)]'
    }
  />
)

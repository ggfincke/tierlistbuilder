// src/components/ui/__tests__/UploadDropzone.test.tsx
// @vitest-environment jsdom
// unit tests for shared upload dropzone copy across variants

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UploadDropzone } from '../UploadDropzone'

let container: HTMLDivElement | null = null
let root: Root | null = null

const renderDropzone = async (
  props: Partial<React.ComponentProps<typeof UploadDropzone>> = {}
) =>
{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () =>
  {
    root!.render(
      <UploadDropzone
        isDraggingFiles={false}
        isProcessing={false}
        openFilePicker={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        {...props}
      />
    )
  })
}

afterEach(async () =>
{
  if (root)
  {
    await act(async () =>
    {
      root!.unmount()
    })
  }

  root = null
  container?.remove()
  container = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('UploadDropzone', () =>
{
  it('shows the same processing message in the panel variant', async () =>
  {
    await renderDropzone({ isProcessing: true })
    expect(document.body.textContent).toContain('Processing images...')
  })

  it('shows the same processing message in the empty-state variant', async () =>
  {
    await renderDropzone({ variant: 'empty', isProcessing: true })
    expect(document.body.textContent).toContain('Processing images...')
  })
})

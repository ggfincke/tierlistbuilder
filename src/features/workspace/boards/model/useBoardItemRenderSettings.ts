// src/features/workspace/boards/model/useBoardItemRenderSettings.ts
// shared board-level render settings for item tiles & drag overlays

import { useShallow } from 'zustand/react/shallow'

import { getBoardItemAspectRatio } from '~/shared/board-ui/aspectRatio'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'

export const useBoardItemRenderSettings = () =>
  useActiveBoardStore(
    useShallow((state) => ({
      boardAspectRatio: getBoardItemAspectRatio(state),
      boardDefaultFit: state.defaultItemImageFit,
      boardDefaultPadding: state.defaultItemImagePadding,
      boardLabels: state.labels,
      boardAutoPlate: state.autoPlate,
    }))
  )

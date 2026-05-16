// src/features/workspace/boards/dnd/dragSensors.ts
// drag sensor hook — configure the pointer & touch sensors used by dnd-kit

import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'

// hoisted so useSensor()'s memo holds — inline option literals are fresh each
// render, churning useSensors() -> DndContext (incl. across boardLocked toggles)
const POINTER_SENSOR_OPTIONS = {
  activationConstraint: { distance: 5 },
}

const TOUCH_SENSOR_OPTIONS = {
  activationConstraint: { delay: 120, tolerance: 8 },
}

export const useDragSensors = () =>
  useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS)
  )

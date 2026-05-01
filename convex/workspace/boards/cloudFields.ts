// convex/workspace/boards/cloudFields.ts
// canonical board cloud-state field builders shared by board writers

export const buildFreshBoardCloudFields = (now: number) => ({
  livePublicTemplateId: null,
  cloudState: 'cloudBacked' as const,
  materializationState: 'ready' as const,
  cloudBackedAt: now,
  pausedReason: null,
})

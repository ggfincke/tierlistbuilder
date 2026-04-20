import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const seededBoardState = {
  title: 'Drag Feel Audit',
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      color: '#f47c7c',
      itemIds: ['sample-apex', 'sample-comet', 'sample-drift'],
    },
    { id: 'tier-a', name: 'A', color: '#f1b878', itemIds: [] },
    { id: 'tier-b', name: 'B', color: '#edd77b', itemIds: [] },
    { id: 'tier-c', name: 'C', color: '#e3ea78', itemIds: [] },
    { id: 'tier-d', name: 'D', color: '#abe36d', itemIds: [] },
    { id: 'tier-e', name: 'E', color: '#74e56d', itemIds: [] },
  ],
  unrankedItemIds: [],
  items: {
    'sample-apex': { id: 'sample-apex', label: 'Apex' },
    'sample-comet': { id: 'sample-comet', label: 'Comet' },
    'sample-drift': { id: 'sample-drift', label: 'Drift' },
  },
}

const buildTextItem = (id, label) => ({
  id,
  label,
  backgroundColor: '#4a4a4a',
})

const wrappedTierOrder = [
  'wrapped-1',
  'wrapped-2',
  'wrapped-3',
  'wrapped-4',
  'wrapped-5',
  'wrapped-6',
  'wrapped-7',
  'wrapped-8',
]
const wrappedIncomingItemId = 'wrapped-incoming'
const wrappedBoardState = {
  title: 'Wrapped Drag Audit',
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      color: '#f47c7c',
      itemIds: wrappedTierOrder,
    },
    {
      id: 'tier-a',
      name: 'A',
      color: '#f1b878',
      itemIds: [wrappedIncomingItemId],
    },
    { id: 'tier-b', name: 'B', color: '#edd77b', itemIds: [] },
    { id: 'tier-c', name: 'C', color: '#e3ea78', itemIds: [] },
    { id: 'tier-d', name: 'D', color: '#abe36d', itemIds: [] },
    { id: 'tier-e', name: 'E', color: '#74e56d', itemIds: [] },
  ],
  unrankedItemIds: [],
  items: Object.fromEntries(
    [...wrappedTierOrder, wrappedIncomingItemId].map((itemId, index) => [
      itemId,
      buildTextItem(itemId, `Wrapped ${index + 1}`),
    ])
  ),
}

const keyboardBoardState = {
  title: 'Keyboard Drag Audit',
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      color: '#f47c7c',
      itemIds: ['sample-apex', 'sample-comet', 'sample-drift'],
    },
    {
      id: 'tier-a',
      name: 'A',
      color: '#f1b878',
      itemIds: ['sample-blaze'],
    },
    { id: 'tier-b', name: 'B', color: '#edd77b', itemIds: [] },
    { id: 'tier-c', name: 'C', color: '#e3ea78', itemIds: [] },
    { id: 'tier-d', name: 'D', color: '#abe36d', itemIds: [] },
    {
      id: 'tier-e',
      name: 'E',
      color: '#74e56d',
      itemIds: ['sample-ember'],
    },
  ],
  unrankedItemIds: ['sample-frost'],
  items: Object.fromEntries(
    [
      'sample-apex',
      'sample-comet',
      'sample-drift',
      'sample-blaze',
      'sample-ember',
      'sample-frost',
    ].map((itemId, index) => [
      itemId,
      buildTextItem(itemId, `Keyboard ${index + 1}`),
    ])
  ),
}

const appStorageKey = 'tier-list-builder-state'
const expectedInitialOrder = ['sample-apex', 'sample-comet', 'sample-drift']
const expectedSwapOrder = ['sample-comet', 'sample-apex', 'sample-drift']
const expectedCometMoveOrder = ['sample-apex', 'sample-drift', 'sample-comet']
const expectedTierAMoveOrder = ['sample-apex', 'sample-blaze']
const expectedTierEMoveOrder = ['sample-frost', 'sample-ember']
const expectedUnrankedMoveOrder = ['sample-ember', 'sample-frost']
const wrappedExpectedOrder = [...wrappedTierOrder]
const wrappedExpectedAppendedOrder = [
  ...wrappedTierOrder,
  wrappedIncomingItemId,
]
const wrappedExpectedAfterLeftOrder = [
  ...wrappedTierOrder.slice(0, -1),
  wrappedIncomingItemId,
  wrappedTierOrder[wrappedTierOrder.length - 1],
]
const sampledOffsets = [
  -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90,
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getFreePort = async () =>
  new Promise((resolve, reject) =>
  {
    const server = createServer()

    server.listen(0, '127.0.0.1', () =>
    {
      const address = server.address()
      if (!address || typeof address === 'string')
      {
        reject(new Error('Could not allocate a local port'))
        return
      }

      const { port } = address
      server.close((error) =>
      {
        if (error)
        {
          reject(error)
          return
        }

        resolve(port)
      })
    })

    server.on('error', reject)
  })

const waitForHttp = async (url, timeoutMs = 30_000) =>
{
  const start = Date.now()

  while (Date.now() - start < timeoutMs)
  {
    try
    {
      const response = await fetch(url)
      if (response.ok)
      {
        return
      }
    }
    catch
    {
      // server still starting
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

const spawnProcess = (command, args, options = {}) =>
{
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })

  const stdout = []
  const stderr = []
  child.stdout?.on('data', (chunk) => stdout.push(chunk.toString()))
  child.stderr?.on('data', (chunk) => stderr.push(chunk.toString()))

  return {
    child,
    getOutput: () => ({
      stdout: stdout.join(''),
      stderr: stderr.join(''),
    }),
  }
}

const compareVersions = (left, right) =>
{
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1)
  {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0

    if (leftPart !== rightPart)
    {
      return leftPart - rightPart
    }
  }

  return 0
}

const collectMatchingFiles = async (rootDir, fileName, matches = []) =>
{
  let entries

  try
  {
    entries = await readdir(rootDir, { withFileTypes: true })
  }
  catch
  {
    return matches
  }

  for (const entry of entries)
  {
    const entryPath = path.join(rootDir, entry.name)

    if (entry.isDirectory())
    {
      await collectMatchingFiles(entryPath, fileName, matches)
      continue
    }

    if (entry.isFile() && entry.name === fileName)
    {
      matches.push(entryPath)
    }
  }

  return matches
}

const findBrowserBinary = async () =>
{
  const home = homedir()
  const chromeRoot = path.join(home, '.cache', 'puppeteer', 'chrome')
  const headlessRoot = path.join(
    home,
    '.cache',
    'puppeteer',
    'chrome-headless-shell'
  )

  const chromeCandidates = await collectMatchingFiles(
    chromeRoot,
    'Google Chrome for Testing'
  )
  const headlessCandidates = await collectMatchingFiles(
    headlessRoot,
    'chrome-headless-shell'
  )
  const candidates = [...chromeCandidates, ...headlessCandidates]

  const accessibleCandidates = []
  for (const candidate of candidates)
  {
    try
    {
      await access(candidate, fsConstants.X_OK)
      accessibleCandidates.push(candidate)
    }
    catch
    {
      // ignore non-executable cache entries
    }
  }

  accessibleCandidates.sort((left, right) =>
  {
    const leftVersion = left.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? '0.0.0.0'
    const rightVersion = right.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? '0.0.0.0'

    return compareVersions(rightVersion, leftVersion)
  })

  const binary = accessibleCandidates[0]
  if (!binary)
  {
    throw new Error(
      'No cached Chromium binary was found under ~/.cache/puppeteer'
    )
  }

  return binary
}

class CdpClient
{
  #nextId = 1
  #pending = new Map()
  #eventWaiters = new Map()

  constructor(url)
  {
    this.url = url
    this.socket = null
  }

  async connect()
  {
    this.socket = new WebSocket(this.url)

    await new Promise((resolve, reject) =>
    {
      const handleOpen = () =>
      {
        this.socket.removeEventListener('error', handleError)
        resolve()
      }

      const handleError = (event) =>
      {
        reject(
          new Error(
            `WebSocket connection failed: ${event.message ?? 'unknown error'}`
          )
        )
      }

      this.socket.addEventListener('open', handleOpen, { once: true })
      this.socket.addEventListener('error', handleError, { once: true })
    })

    this.socket.addEventListener('message', (event) =>
    {
      const message = JSON.parse(event.data)

      if (message.id)
      {
        const pending = this.#pending.get(message.id)
        if (!pending)
        {
          return
        }

        this.#pending.delete(message.id)

        if (message.error)
        {
          pending.reject(new Error(message.error.message))
          return
        }

        pending.resolve(message.result)
        return
      }

      const waiters = this.#eventWaiters.get(message.method)
      if (!waiters || waiters.length === 0)
      {
        return
      }

      const remainingWaiters = []
      for (const waiter of waiters)
      {
        if (waiter.predicate(message.params))
        {
          waiter.resolve(message.params)
        }
        else
        {
          remainingWaiters.push(waiter)
        }
      }

      this.#eventWaiters.set(message.method, remainingWaiters)
    })
  }

  async send(method, params = {})
  {
    const id = this.#nextId
    this.#nextId += 1

    const payload = JSON.stringify({ id, method, params })

    return new Promise((resolve, reject) =>
    {
      this.#pending.set(id, { resolve, reject })
      this.socket.send(payload)
    })
  }

  async waitForEvent(method, predicate = () => true, timeoutMs = 10_000)
  {
    return new Promise((resolve, reject) =>
    {
      const timeout = setTimeout(() =>
      {
        reject(new Error(`Timed out waiting for ${method}`))
      }, timeoutMs)

      const waiters = this.#eventWaiters.get(method) ?? []
      waiters.push({
        predicate,
        resolve: (value) =>
        {
          clearTimeout(timeout)
          resolve(value)
        },
      })

      this.#eventWaiters.set(method, waiters)
    })
  }

  async evaluate(expression)
  {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })

    if (result.exceptionDetails)
    {
      throw new Error(
        result.exceptionDetails.text ?? 'Runtime evaluation failed'
      )
    }

    return result.result.value
  }

  async close()
  {
    if (!this.socket)
    {
      return
    }

    this.socket.close()
    this.socket = null
  }
}

const navigateAndWait = async (client, url) =>
{
  const loaded = client.waitForEvent('Page.loadEventFired')
  await client.send('Page.navigate', { url })
  await loaded
}

const reloadAndWait = async (client) =>
{
  const loaded = client.waitForEvent('Page.loadEventFired')
  await client.send('Page.reload', { ignoreCache: true })
  await loaded
}

const waitForCondition = async (client, expression, timeoutMs = 10_000) =>
{
  const start = Date.now()

  while (Date.now() - start < timeoutMs)
  {
    const value = await client.evaluate(expression)
    if (value)
    {
      return value
    }

    await delay(50)
  }

  throw new Error(`Timed out waiting for condition: ${expression}`)
}

const getTierOrder = async (client, tierId = 'tier-s') =>
{
  return client.evaluate(`(() => {
    const container = document.querySelector('[data-testid="tier-container-${tierId}"]')
    if (!container) {
      return []
    }

    return Array.from(container.querySelectorAll('[data-item-id]'))
      .map((element) => {
        const rect = element.getBoundingClientRect()

        return {
          itemId: element.getAttribute('data-item-id'),
          left: rect.left,
          top: rect.top,
        }
      })
      .filter((item) => item.itemId)
      .sort((left, right) => {
        const topDelta = left.top - right.top
        if (Math.abs(topDelta) > 4) {
          return topDelta
        }

        return left.left - right.left
      })
      .map((item) => item.itemId)
  })()`)
}

const getContainerOrder = async (client, selector) =>
{
  return client.evaluate(`(() => {
    const container = document.querySelector(${JSON.stringify(selector)})
    if (!container) {
      return []
    }

    return Array.from(container.querySelectorAll('[data-item-id]'))
      .map((element) => {
        const rect = element.getBoundingClientRect()

        return {
          itemId: element.getAttribute('data-item-id'),
          left: rect.left,
          top: rect.top,
        }
      })
      .filter((item) => item.itemId)
      .sort((left, right) => {
        const topDelta = left.top - right.top
        if (Math.abs(topDelta) > 4) {
          return topDelta
        }

        return left.left - right.left
      })
      .map((item) => item.itemId)
  })()`)
}

const getKeyboardState = async (client) =>
{
  const [tierS, tierA, tierE, unranked, domState] = await Promise.all([
    getContainerOrder(client, '[data-testid="tier-container-tier-s"]'),
    getContainerOrder(client, '[data-testid="tier-container-tier-a"]'),
    getContainerOrder(client, '[data-testid="tier-container-tier-e"]'),
    getContainerOrder(client, '[data-testid="unranked-container"]'),
    client.evaluate(`(() => {
      const activeElement = document.activeElement
      const board = document.querySelector('[data-testid="tier-list-board"]')
      const draggingItem = document.querySelector('[data-keyboard-dragging="true"]')

      return {
        activeItem: activeElement?.getAttribute('data-item-id') ?? null,
        activeTag: activeElement?.tagName ?? null,
        keyboardMode: board?.getAttribute('data-keyboard-mode') ?? 'idle',
        keyboardFocusItem:
          board?.getAttribute('data-keyboard-focus-item-id') || null,
        draggingItem: draggingItem?.getAttribute('data-item-id') ?? null,
      }
    })()`),
  ])

  return { tierS, tierA, tierE, unranked, ...domState }
}

const getItemCenter = async (client, itemId) =>
{
  const metrics = await client.evaluate(`(() => {
    const element = document.querySelector('[data-testid="tier-item-${itemId}"]')
    if (!element) {
      return null
    }

    const rect = element.getBoundingClientRect()

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    }
  })()`)

  if (!metrics)
  {
    throw new Error(`Could not locate ${itemId}`)
  }

  return metrics
}

const clickAt = async (client, x, y, delayMs = 100) =>
{
  await dispatchMouseMove(client, x, y, 0)
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
  })
  await delay(delayMs)
}

const focusItem = async (client, itemId) =>
{
  const center = await getItemCenter(client, itemId)
  await clickAt(client, center.x, center.y)
}

const pressKey = async (
  client,
  {
    key,
    code,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode,
    downType = 'rawKeyDown',
    text,
    unmodifiedText,
    delayMs = 150,
  }
) =>
{
  const downEvent = {
    type: downType,
    key,
    code,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode,
  }

  if (text !== undefined)
  {
    downEvent.text = text
    downEvent.unmodifiedText = unmodifiedText
  }

  await client.send('Input.dispatchKeyEvent', downEvent)
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode,
  })
  await delay(delayMs)
}

const pressSpace = async (client) =>
{
  await pressKey(client, {
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 49,
    downType: 'keyDown',
    text: ' ',
    unmodifiedText: ' ',
  })
}

const ARROW_KEY_CODES = {
  ArrowLeft: { keyCode: 37, nativeKeyCode: 123 },
  ArrowUp: { keyCode: 38, nativeKeyCode: 126 },
  ArrowRight: { keyCode: 39, nativeKeyCode: 124 },
  ArrowDown: { keyCode: 40, nativeKeyCode: 125 },
}

const pressArrowKey = async (client, direction) =>
{
  await pressKey(client, {
    key: direction,
    code: direction,
    windowsVirtualKeyCode: ARROW_KEY_CODES[direction].keyCode,
    nativeVirtualKeyCode: ARROW_KEY_CODES[direction].nativeKeyCode,
    delayMs: 200,
  })
}

const pressEscape = async (client) =>
{
  await pressKey(client, {
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53,
  })
}

const dispatchMouseMove = async (client, x, y, buttons) =>
{
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'none',
    buttons,
    pointerType: 'mouse',
  })
}

const beginDrag = async (client, itemId) =>
{
  const center = await getItemCenter(client, itemId)

  await dispatchMouseMove(client, center.x, center.y, 0)
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: center.x,
    y: center.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
  })
  await dispatchMouseMove(client, center.x + 12, center.y, 1)
  await delay(50)

  return center
}

const moveDragToPoint = async (client, x, y) =>
{
  await dispatchMouseMove(client, x, y, 1)
  await delay(50)
  return getTierOrder(client)
}

const releaseMouse = async (client, x, y) =>
{
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
  })
  await delay(50)
}

const getContainerCenter = async (client, selector) =>
{
  const metrics = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) {
      return null
    }

    const rect = element.getBoundingClientRect()

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  })()`)

  if (!metrics)
  {
    throw new Error(`Could not locate ${selector}`)
  }

  return metrics
}

const clickTierContainer = async (client, tierId) =>
{
  const center = await getContainerCenter(
    client,
    `[data-testid="tier-container-${tierId}"]`
  )
  await clickAt(client, center.x, center.y, 150)
}

const getRenderedRowCount = async (client, tierId) =>
{
  return client.evaluate(`(() => {
    const container = document.querySelector('[data-testid="tier-container-${tierId}"]')
    if (!container) {
      return 0
    }

    const tops = Array.from(container.querySelectorAll('[data-item-id]'))
      .map((element) => element.getBoundingClientRect().top)
      .sort((left, right) => left - right)

    if (tops.length === 0) {
      return 0
    }

    const rows = []
    for (const top of tops) {
      const existingRow = rows.find((rowTop) => Math.abs(rowTop - top) <= 4)
      if (existingRow === undefined) {
        rows.push(top)
      }
    }

    return rows.length
  })()`)
}

const seedBoard = async (client, boardState = seededBoardState) =>
{
  const payload = JSON.stringify({ state: boardState, version: 2 })

  await client.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(appStorageKey)}, ${JSON.stringify(payload)})
    return true
  })()`)
}

const resetSeededBoard = async (
  client,
  baseUrl,
  boardState = seededBoardState,
  expectedOrder = expectedInitialOrder
) =>
{
  await navigateAndWait(client, baseUrl)
  await seedBoard(client, boardState)
  await reloadAndWait(client)
  await waitForCondition(
    client,
    `(() => {
      const container = document.querySelector('[data-testid="tier-container-tier-s"]')
      return Boolean(container)
    })()`
  )

  await waitForCondition(
    client,
    `(() => {
      const order = Array.from(
        document.querySelectorAll('[data-testid="tier-container-tier-s"] [data-item-id]')
      ).map((element) => element.getAttribute('data-item-id')).filter(Boolean)

      return JSON.stringify(order) === ${JSON.stringify(JSON.stringify(expectedOrder))}
    })()`
  )
}

const getTrailingLastRowDropPoint = async (client, tierId = 'tier-s') =>
{
  const point = await client.evaluate(`(() => {
    const container = document.querySelector('[data-testid="tier-container-${tierId}"]')
    if (!container) {
      return null
    }

    const containerRect = container.getBoundingClientRect()
    const itemRects = Array.from(container.querySelectorAll('[data-item-id]'))
      .map((element) => {
        const rect = element.getBoundingClientRect()

        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
        }
      })
      .sort((left, right) => {
        const topDelta = left.top - right.top
        if (Math.abs(topDelta) > 4) {
          return topDelta
        }

        return left.left - right.left
      })

    if (itemRects.length === 0) {
      return null
    }

    const lastRowTop = itemRects[itemRects.length - 1].top
    const lastRowRects = itemRects.filter(
      (rect) => Math.abs(rect.top - lastRowTop) <= 4
    )
    const rightmostRect = lastRowRects.reduce((current, rect) =>
      rect.right > current.right ? rect : current
    )
    const rowTop = Math.min(...lastRowRects.map((rect) => rect.top))
    const rowBottom = Math.max(...lastRowRects.map((rect) => rect.bottom))
    const availableSpace = containerRect.right - rightmostRect.right

    if (availableSpace <= 16) {
      return null
    }

    const x = Math.min(
      rightmostRect.right + Math.max(Math.min(availableSpace / 2, 40), 12),
      containerRect.right - 8
    )

    return {
      x,
      y: (rowTop + rowBottom) / 2,
      availableSpace,
      lastRowCount: lastRowRects.length,
    }
  })()`)

  if (!point)
  {
    throw new Error(
      `Could not locate trailing last-row drop space for ${tierId}`
    )
  }

  return point
}

const createPageClient = async (debugPort) =>
{
  const targetResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?about:blank`,
    {
      method: 'PUT',
    }
  )

  if (!targetResponse.ok)
  {
    throw new Error(
      `Could not create a browser target: ${targetResponse.status}`
    )
  }

  const target = await targetResponse.json()
  const client = new CdpClient(target.webSocketDebuggerUrl)
  await client.connect()
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await setViewport(client, 1440, 1200)

  return client
}

const setViewport = async (client, width, height) =>
{
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
}

const runWrappedTrailingSpaceAudit = async (client, baseUrl) =>
{
  await setViewport(client, 980, 1200)

  try
  {
    await resetSeededBoard(
      client,
      baseUrl,
      wrappedBoardState,
      wrappedExpectedOrder
    )

    const dropPoint = await getTrailingLastRowDropPoint(client, 'tier-s')

    assert.ok(
      dropPoint.availableSpace > 16,
      `Wrapped trailing space was too narrow: ${dropPoint.availableSpace}px`
    )

    await beginDrag(client, wrappedIncomingItemId)
    const previewOrder = await moveDragToPoint(client, dropPoint.x, dropPoint.y)

    assert.deepEqual(
      previewOrder,
      wrappedExpectedAppendedOrder,
      'Preview order did not append when hovering trailing last-row space'
    )

    await releaseMouse(client, dropPoint.x, dropPoint.y)
    const finalOrder = await getTierOrder(client)

    assert.deepEqual(
      finalOrder,
      previewOrder,
      'Final drop order did not match preview order in trailing last-row space'
    )

    return {
      dropPoint,
      previewOrder,
      finalOrder,
    }
  }
  finally
  {
    await setViewport(client, 1440, 1200)
  }
}

const runKeyboardAudit = async (client, baseUrl) =>
{
  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-apex')
  await pressSpace(client)
  const browseEntryState = await getKeyboardState(client)

  assert.equal(
    browseEntryState.keyboardMode,
    'browse',
    'The first Space press should enter keyboard browse mode'
  )
  assert.equal(
    browseEntryState.keyboardFocusItem,
    'sample-apex',
    'Entering keyboard mode should keep focus on the current item'
  )
  assert.equal(
    browseEntryState.draggingItem,
    null,
    'Entering keyboard mode should not pick up an item yet'
  )

  await pressArrowKey(client, 'ArrowRight')
  const browseMoveState = await getKeyboardState(client)

  assert.deepEqual(
    browseMoveState.tierS,
    expectedInitialOrder,
    'Arrow keys in browse mode should not reorder items'
  )
  assert.equal(
    browseMoveState.keyboardMode,
    'browse',
    'Arrow navigation should keep keyboard mode in browse state'
  )
  assert.equal(
    browseMoveState.keyboardFocusItem,
    'sample-comet',
    'Arrow navigation in browse mode should move keyboard focus only'
  )
  assert.equal(
    browseMoveState.activeItem,
    'sample-comet',
    'DOM focus should move to the browsed item'
  )
  assert.equal(
    browseMoveState.draggingItem,
    null,
    'Browse mode should not mark any item as actively dragged'
  )

  await pressSpace(client)
  const pickupState = await getKeyboardState(client)

  assert.equal(
    pickupState.keyboardMode,
    'dragging',
    'The second Space press should pick up the focused item'
  )
  assert.equal(
    pickupState.draggingItem,
    'sample-comet',
    'Picking up should mark the focused item as the dragged item'
  )

  await pressArrowKey(client, 'ArrowRight')
  const sameContainerPreview = await getKeyboardState(client)

  assert.deepEqual(
    sameContainerPreview.tierS,
    expectedCometMoveOrder,
    'ArrowRight while dragging should move the item one slot within the tier'
  )
  assert.equal(
    sameContainerPreview.activeItem,
    'sample-comet',
    'Focus should stay on the dragged item during same-row keyboard moves'
  )

  await pressSpace(client)
  const sameContainerFinal = await getKeyboardState(client)

  assert.deepEqual(
    sameContainerFinal.tierS,
    sameContainerPreview.tierS,
    'Same-row keyboard drop order did not match the preview order'
  )
  assert.equal(
    sameContainerFinal.keyboardMode,
    'browse',
    'Dropping with Space should return keyboard mode to browse state'
  )
  assert.equal(
    sameContainerFinal.activeItem,
    'sample-comet',
    'Focus did not return to the dropped item after a same-row keyboard drop'
  )

  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-apex')
  await pressSpace(client)
  await pressSpace(client)
  await pressArrowKey(client, 'ArrowDown')
  const crossTierPreview = await getKeyboardState(client)

  assert.deepEqual(
    crossTierPreview.tierS,
    ['sample-comet', 'sample-drift'],
    'Keyboard ArrowDown should remove the item from the source tier immediately'
  )
  assert.deepEqual(
    crossTierPreview.tierA,
    expectedTierAMoveOrder,
    'Keyboard ArrowDown should insert into the next tier at the matching index'
  )
  assert.equal(
    crossTierPreview.activeItem,
    'sample-apex',
    'Focus should stay on the dragged item during cross-tier keyboard moves'
  )
  assert.equal(
    crossTierPreview.keyboardMode,
    'dragging',
    'Cross-tier movement should keep keyboard mode in dragging state'
  )

  await pressSpace(client)
  const crossTierFinal = await getKeyboardState(client)

  assert.deepEqual(
    crossTierFinal.tierS,
    crossTierPreview.tierS,
    'Cross-tier keyboard drop did not preserve the preview source-tier order'
  )
  assert.deepEqual(
    crossTierFinal.tierA,
    crossTierPreview.tierA,
    'Cross-tier keyboard drop did not preserve the preview target-tier order'
  )
  assert.equal(
    crossTierFinal.activeItem,
    'sample-apex',
    'Focus did not return to the dropped item after a cross-tier keyboard drop'
  )
  assert.equal(
    crossTierFinal.keyboardMode,
    'browse',
    'Dropping after a cross-tier move should return to browse mode'
  )

  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-apex')
  await pressSpace(client)
  await pressSpace(client)
  await pressArrowKey(client, 'ArrowLeft')
  const boundaryPreview = await getKeyboardState(client)

  assert.deepEqual(
    boundaryPreview.tierS,
    expectedInitialOrder,
    'Keyboard boundary moves should be no-ops at the start of a row'
  )
  assert.equal(
    boundaryPreview.activeItem,
    'sample-apex',
    'Focus should stay on the dragged item during a boundary no-op'
  )
  assert.equal(
    boundaryPreview.keyboardMode,
    'dragging',
    'A boundary no-op should keep keyboard mode in dragging state'
  )

  await pressSpace(client)
  const boundaryFinal = await getKeyboardState(client)

  assert.deepEqual(
    boundaryFinal.tierS,
    expectedInitialOrder,
    'Keyboard boundary no-op should not change the dropped order'
  )
  assert.equal(
    boundaryFinal.activeItem,
    'sample-apex',
    'Focus did not return to the item after a boundary no-op drop'
  )
  assert.equal(
    boundaryFinal.keyboardMode,
    'browse',
    'Dropping after a boundary no-op should still return to browse mode'
  )

  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-apex')
  await pressSpace(client)
  await pressArrowKey(client, 'ArrowRight')
  await pressEscape(client)
  const escapeBrowseState = await getKeyboardState(client)

  assert.equal(
    escapeBrowseState.keyboardMode,
    'idle',
    'Escape should exit keyboard browse mode'
  )
  assert.deepEqual(
    escapeBrowseState.tierS,
    expectedInitialOrder,
    'Escape from browse mode should not mutate board order'
  )
  assert.equal(
    escapeBrowseState.activeItem,
    'sample-comet',
    'Escape from browse mode should leave focus on the last browsed item'
  )

  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-apex')
  await pressSpace(client)
  await pressSpace(client)
  await pressArrowKey(client, 'ArrowDown')
  await pressEscape(client)
  const escapeDraggingState = await getKeyboardState(client)

  assert.equal(
    escapeDraggingState.keyboardMode,
    'idle',
    'Escape should exit keyboard drag mode'
  )
  assert.deepEqual(
    escapeDraggingState.tierS,
    expectedInitialOrder,
    'Escape while dragging should discard the preview source-tier order'
  )
  assert.deepEqual(
    escapeDraggingState.tierA,
    ['sample-blaze'],
    'Escape while dragging should discard the preview target-tier order'
  )
  assert.equal(
    escapeDraggingState.activeItem,
    'sample-apex',
    'Escape while dragging should restore focus to the dragged item'
  )

  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-apex')
  await pressSpace(client)
  await pressArrowKey(client, 'ArrowRight')
  await clickTierContainer(client, 'tier-b')
  const pointerBrowseExitState = await getKeyboardState(client)

  assert.equal(
    pointerBrowseExitState.keyboardMode,
    'idle',
    'A pointer click should exit keyboard browse mode'
  )
  assert.deepEqual(
    pointerBrowseExitState.tierS,
    expectedInitialOrder,
    'A pointer click during browse mode should not mutate board order'
  )

  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-apex')
  await pressSpace(client)
  await pressSpace(client)
  await pressArrowKey(client, 'ArrowDown')
  await clickTierContainer(client, 'tier-b')
  const pointerDragExitState = await getKeyboardState(client)

  assert.equal(
    pointerDragExitState.keyboardMode,
    'idle',
    'A pointer click should exit keyboard drag mode'
  )
  assert.deepEqual(
    pointerDragExitState.tierS,
    expectedInitialOrder,
    'A pointer click while dragging should discard the preview source-tier order'
  )
  assert.deepEqual(
    pointerDragExitState.tierA,
    ['sample-blaze'],
    'A pointer click while dragging should discard the preview target-tier order'
  )

  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-ember')
  await pressSpace(client)
  await pressSpace(client)
  await pressArrowKey(client, 'ArrowDown')
  const lastTierPreview = await getKeyboardState(client)

  assert.deepEqual(
    lastTierPreview.tierE,
    [],
    'Keyboard ArrowDown from the last tier should clear the source tier preview'
  )
  assert.deepEqual(
    lastTierPreview.unranked,
    expectedUnrankedMoveOrder,
    'Keyboard ArrowDown from the last tier should move into Unranked'
  )
  assert.equal(
    lastTierPreview.activeItem,
    'sample-ember',
    'Focus should stay on the dragged item when moving from the last tier to Unranked'
  )
  assert.equal(
    lastTierPreview.keyboardMode,
    'dragging',
    'Last-tier to Unranked movement should keep keyboard mode in dragging state'
  )

  await pressSpace(client)
  const lastTierFinal = await getKeyboardState(client)

  assert.deepEqual(
    lastTierFinal.unranked,
    lastTierPreview.unranked,
    'Last-tier to Unranked keyboard drop did not preserve the preview order'
  )
  assert.equal(
    lastTierFinal.activeItem,
    'sample-ember',
    'Focus did not return to the item after dropping into Unranked'
  )
  assert.equal(
    lastTierFinal.keyboardMode,
    'browse',
    'Dropping into Unranked should return keyboard mode to browse state'
  )

  await resetSeededBoard(
    client,
    baseUrl,
    keyboardBoardState,
    expectedInitialOrder
  )

  await focusItem(client, 'sample-frost')
  await pressSpace(client)
  await pressSpace(client)
  await pressArrowKey(client, 'ArrowUp')
  const unrankedPreview = await getKeyboardState(client)

  assert.deepEqual(
    unrankedPreview.tierE,
    expectedTierEMoveOrder,
    'Keyboard ArrowUp from Unranked should move into the last tier'
  )
  assert.deepEqual(
    unrankedPreview.unranked,
    [],
    'Keyboard ArrowUp from Unranked should remove the item from the pool preview'
  )
  assert.equal(
    unrankedPreview.activeItem,
    'sample-frost',
    'Focus should stay on the dragged item when moving from Unranked into the last tier'
  )
  assert.equal(
    unrankedPreview.keyboardMode,
    'dragging',
    'Unranked-to-tier movement should keep keyboard mode in dragging state'
  )

  await pressSpace(client)
  const unrankedFinal = await getKeyboardState(client)

  assert.deepEqual(
    unrankedFinal.tierE,
    unrankedPreview.tierE,
    'Unranked-to-tier keyboard drop did not preserve the preview order'
  )
  assert.equal(
    unrankedFinal.activeItem,
    'sample-frost',
    'Focus did not return to the item after dropping into the last tier'
  )
  assert.equal(
    unrankedFinal.keyboardMode,
    'browse',
    'Dropping into the last tier should return keyboard mode to browse state'
  )

  await setViewport(client, 980, 1200)

  try
  {
    await resetSeededBoard(
      client,
      baseUrl,
      wrappedBoardState,
      wrappedExpectedOrder
    )

    const wrappedRowCount = await getRenderedRowCount(client, 'tier-s')

    assert.ok(
      wrappedRowCount > 1,
      `Wrapped keyboard append target rendered only ${wrappedRowCount} row(s)`
    )

    await focusItem(client, wrappedIncomingItemId)
    await pressSpace(client)
    await pressSpace(client)
    await pressArrowKey(client, 'ArrowUp')
    const wrappedAppendPreview = await getKeyboardState(client)

    assert.deepEqual(
      wrappedAppendPreview.tierS,
      wrappedExpectedAppendedOrder,
      'ArrowUp into a wrapped higher tier should append to the end'
    )
    assert.equal(
      wrappedAppendPreview.draggingItem,
      wrappedIncomingItemId,
      'Wrapped upward movement should keep the dragged item active'
    )

    await pressArrowKey(client, 'ArrowLeft')
    const wrappedAfterLeftPreview = await getKeyboardState(client)

    assert.deepEqual(
      wrappedAfterLeftPreview.tierS,
      wrappedExpectedAfterLeftOrder,
      'After appending upward, ArrowLeft should reposition within the target tier'
    )

    await pressSpace(client)
    const wrappedFinal = await getKeyboardState(client)

    assert.deepEqual(
      wrappedFinal.tierS,
      wrappedExpectedAfterLeftOrder,
      'Wrapped upward keyboard drop should preserve the preview order'
    )
    assert.equal(
      wrappedFinal.keyboardMode,
      'browse',
      'Dropping after a wrapped upward move should return to browse mode'
    )

    return {
      browseEntry: browseEntryState,
      browseMove: browseMoveState,
      sameContainer: {
        preview: sameContainerPreview,
        final: sameContainerFinal,
      },
      crossTier: {
        preview: crossTierPreview,
        final: crossTierFinal,
      },
      boundaryNoOp: {
        preview: boundaryPreview,
        final: boundaryFinal,
      },
      escapeBrowse: escapeBrowseState,
      escapeDragging: escapeDraggingState,
      pointerBrowseExit: pointerBrowseExitState,
      pointerDragExit: pointerDragExitState,
      lastTierToUnranked: {
        preview: lastTierPreview,
        final: lastTierFinal,
      },
      unrankedToLastTier: {
        preview: unrankedPreview,
        final: unrankedFinal,
      },
      wrappedAppend: {
        preview: wrappedAppendPreview,
        afterLeft: wrappedAfterLeftPreview,
        final: wrappedFinal,
      },
    }
  }
  finally
  {
    await setViewport(client, 1440, 1200)
  }
}

const runAudit = async (client, baseUrl) =>
{
  await resetSeededBoard(client, baseUrl)

  await beginDrag(client, 'sample-apex')
  const target = await getItemCenter(client, 'sample-comet')

  const observations = []
  for (const offset of sampledOffsets)
  {
    const order = await moveDragToPoint(client, target.x + offset, target.y)
    observations.push({ offset, order })
  }

  const swappedOffsets = observations
    .filter(
      (observation) =>
        observation.order.join(',') === expectedSwapOrder.join(',')
    )
    .map((observation) => observation.offset)

  const firstSwapOffset = swappedOffsets[0]
  const lastSwapOffset = swappedOffsets[swappedOffsets.length - 1]
  const stableBandWidth =
    firstSwapOffset !== undefined && lastSwapOffset !== undefined
      ? lastSwapOffset - firstSwapOffset
      : -1

  await releaseMouse(
    client,
    target.x + sampledOffsets[sampledOffsets.length - 1],
    target.y
  )

  const report = {
    sampledOffsets,
    observations,
    firstSwapOffset,
    lastSwapOffset,
    stableBandWidth,
  }

  console.log(JSON.stringify(report, null, 2))

  assert.notEqual(
    firstSwapOffset,
    undefined,
    'No swapped hover band was detected'
  )
  assert.ok(
    stableBandWidth >= 12,
    `Swapped hover band was too narrow: ${stableBandWidth}px`
  )

  const releaseOffsets = [
    ...new Set([
      firstSwapOffset,
      Math.round((firstSwapOffset + lastSwapOffset) / 2),
      lastSwapOffset,
    ]),
  ]
  const parityChecks = []

  for (const releaseOffset of releaseOffsets)
  {
    await resetSeededBoard(client, baseUrl)
    await beginDrag(client, 'sample-apex')
    const refreshedTarget = await getItemCenter(client, 'sample-comet')

    let previewOrder = expectedInitialOrder
    for (const offset of sampledOffsets)
    {
      previewOrder = await moveDragToPoint(
        client,
        refreshedTarget.x + offset,
        refreshedTarget.y
      )

      if (offset === releaseOffset)
      {
        break
      }
    }

    await releaseMouse(
      client,
      refreshedTarget.x + releaseOffset,
      refreshedTarget.y
    )
    const finalOrder = await getTierOrder(client)

    parityChecks.push({
      releaseOffset,
      previewOrder,
      finalOrder,
      matched: JSON.stringify(previewOrder) === JSON.stringify(finalOrder),
    })

    assert.deepEqual(
      finalOrder,
      previewOrder,
      `Drop order did not match hover order at release offset ${releaseOffset}`
    )
  }

  const wrappedTrailingSpace = await runWrappedTrailingSpaceAudit(
    client,
    baseUrl
  )
  const keyboard = await runKeyboardAudit(client, baseUrl)

  return { ...report, parityChecks, wrappedTrailingSpace, keyboard }
}

const main = async () =>
{
  const serverPort = await getFreePort()
  const debugPort = await getFreePort()
  const baseUrl = `http://127.0.0.1:${serverPort}`
  const browserBinary = await findBrowserBinary()
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), 'tierlistbuilder-chrome-')
  )

  const server = spawnProcess('npm', [
    'run',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    String(serverPort),
  ])
  let browser
  let client

  try
  {
    await waitForHttp(baseUrl, 60_000)

    browser = spawnProcess(browserBinary, [
      '--headless=new',
      '--disable-gpu',
      '--mute-audio',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${debugPort}`,
      '--window-size=1440,1200',
      'about:blank',
    ])

    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 30_000)
    client = await createPageClient(debugPort)
    const report = await runAudit(client, baseUrl)

    console.log(JSON.stringify(report, null, 2))
  }
  finally
  {
    await client?.close()
    browser?.child.kill('SIGTERM')
    server.child.kill('SIGTERM')
    await rm(userDataDir, { recursive: true, force: true })

    const browserExitCode = browser?.child.exitCode
    if (browser && browserExitCode && browserExitCode !== 0)
    {
      const output = browser.getOutput()
      console.error(output.stderr || output.stdout)
    }

    const serverExitCode = server.child.exitCode
    if (serverExitCode && serverExitCode !== 0)
    {
      const output = server.getOutput()
      console.error(output.stderr || output.stdout)
    }
  }
}

main().catch((error) =>
{
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})

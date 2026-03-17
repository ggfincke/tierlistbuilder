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
    'sample-apex': {
      id: 'sample-apex',
      label: 'Apex',
      imageUrl: '/sample-items/apex.jpg',
    },
    'sample-comet': {
      id: 'sample-comet',
      label: 'Comet',
      imageUrl: '/sample-items/comet.jpg',
    },
    'sample-drift': {
      id: 'sample-drift',
      label: 'Drift',
      imageUrl: '/sample-items/drift.jpg',
    },
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

const appStorageKey = 'tier-list-maker-state'
const expectedInitialOrder = ['sample-apex', 'sample-comet', 'sample-drift']
const expectedSwapOrder = ['sample-comet', 'sample-apex', 'sample-drift']
const wrappedExpectedOrder = [...wrappedTierOrder]
const wrappedExpectedAppendedOrder = [
  ...wrappedTierOrder,
  wrappedIncomingItemId,
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

  return { ...report, parityChecks, wrappedTrailingSpace }
}

const main = async () =>
{
  const serverPort = await getFreePort()
  const debugPort = await getFreePort()
  const baseUrl = `http://127.0.0.1:${serverPort}`
  const browserBinary = await findBrowserBinary()
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), 'tierlistmaker-chrome-')
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

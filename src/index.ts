import { Hono } from 'hono'
import { chromium } from 'playwright-extra'
import { BrowserContext, Page } from 'playwright'

const app = new Hono()

// 存储浏览器会话和状态
const sessions = new Map<string, {
  browser: BrowserContext
  page: Page
  qrCodeUrl?: string
  cookies?: any[]
  isLoggedIn: boolean
  timer?: NodeJS.Timeout
}>()

// 生成随机 nonce
function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// 初始化浏览器会话
async function initBrowserSession(nonce: string) {
  const browser = await chromium.launchPersistentContext(`./dist/browser_${nonce}`, {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  })

  const page = await browser.newPage()

  // 设置路由拦截来禁用 CSS、图片和字体加载
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType()
    if (['stylesheet', 'image', 'font'].includes(resourceType)) {
      route.abort()
      return
    }
    route.continue()
  })

  const session = {
    browser,
    page,
    qrCodeUrl: undefined as string | undefined,
    cookies: undefined as any[] | undefined,
    isLoggedIn: false,
    timer: undefined as NodeJS.Timeout | undefined
  }

  sessions.set(nonce, session)

  // 监听二维码创建响应
  page.on('response', async (response) => {
    if (['xhr', 'fetch'].includes(response.request().resourceType())) {
      if (response.url().includes('/api/sns/web/v1/login/qrcode/create')) {
        const res = await response.json()
        const qrCodeUrl = res.data.url
        session.qrCodeUrl = qrCodeUrl
        console.log(`QR Code URL for ${nonce}:`, qrCodeUrl)
      }
      if (response.url().includes('/api/sns/web/v2/user/me')) {
        const res = await response.json()
        if (res?.data?.guest === false) {
          const cookies = await page.context().cookies()
          session.cookies = cookies
          session.isLoggedIn = true
          console.log(`User logged in for ${nonce}`)
        }
      }
    }
  })

  // 1分钟后自动关闭
  session.timer = setTimeout(async () => {
    await browser.close()
    sessions.delete(nonce)
    console.log(`Session ${nonce} auto-closed after 1 minute`)
  }, 60000)

  await page.goto('https://www.xiaohongshu.com')

  return session
}

// 接口1: 请求登录二维码 URL
app.get('/qrcode', async (c) => {
  const nonce = generateNonce()

  try {
    const session = await initBrowserSession(nonce)

    // 等待二维码 URL 生成 (最多等待10秒)
    let attempts = 0
    while (!session.qrCodeUrl && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 200))
      attempts++
    }

    if (!session.qrCodeUrl) {
      await session.browser.close()
      sessions.delete(nonce)
      return c.json({ error: 'Failed to get QR code URL' }, 500)
    }

    return c.json({
      nonce,
      qrCodeUrl: session.qrCodeUrl,
      message: 'Browser session initialized, will auto-close in 1 minute'
    })
  } catch (error) {
    console.error('Error initializing browser session:', error)
    return c.json({ error: 'Failed to initialize browser session' }, 500)
  }
})

// 接口2: 查询 cookie 状态
app.get('/cookies/:nonce', async (c) => {
  const nonce = c.req.param('nonce')
  const session = sessions.get(nonce)

  if (!session) {
    return c.json({ error: 'Session not found or expired' }, 404)
  }

  if (!session.isLoggedIn) {
    return c.json({
      isLoggedIn: false,
      message: 'User not logged in yet'
    })
  }

  // 清理定时器并关闭浏览器
  if (session.timer) {
    clearTimeout(session.timer)
  }
  await session.browser.close()
  sessions.delete(nonce)

  return c.json({
    isLoggedIn: true,
    cookies: session.cookies,
    message: 'Login successful, browser session closed'
  })
})

export default app

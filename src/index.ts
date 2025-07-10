import { Hono } from "hono";
import { chromium } from "playwright-extra";
import { Browser, BrowserContext, Page, Route, Response } from "playwright";

const app = new Hono();

// 全局浏览器实例
let globalBrowserInstance: Browser | null = null;

// 初始化全局浏览器实例
async function initGlobalBrowser() {
  if (!globalBrowserInstance) {
    globalBrowserInstance = await chromium.launch({
      headless: false,
      devtools: false,
      args: [
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--disable-notifications",
        "--disable-popup-blocking",
        "--enable-network-logging",
      ],
    });
    console.log("全局浏览器实例已初始化");
  }
  return globalBrowserInstance;
}

// 确保服务关闭时清理浏览器资源
process.on('SIGINT', async () => {
  if (globalBrowserInstance) {
    console.log("正在关闭全局浏览器实例...");
    await globalBrowserInstance.close();
    globalBrowserInstance = null;
  }
  process.exit();
});

process.on('SIGTERM', async () => {
  if (globalBrowserInstance) {
    console.log("正在关闭全局浏览器实例...");
    await globalBrowserInstance.close();
    globalBrowserInstance = null;
  }
  process.exit();
});

// 存储浏览器会话和状态
const sessions = new Map<
  string,
  {
    browser: BrowserContext;
    page: Page;
    qrCodeUrl?: string;
    cookies?: any[];
    isLoggedIn: boolean;
    timer?: NodeJS.Timeout;
    captchaId?: string;
    hasCaptcha?: boolean;
  }
>();

// 生成随机 nonce
function generateNonce(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

// 初始化浏览器会话
async function initBrowserSession(nonce: string) {
  // 使用全局浏览器实例
  const browserInstance = await initGlobalBrowser();
  
  const browser = await browserInstance.newContext({
    acceptDownloads: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await browser.newPage();

  // 设置路由拦截来禁用 CSS、图片和字体加载
  await page.route("**/*", (route: Route) => {
    const resourceType = route.request().resourceType();
    if (["stylesheet", "image", "font"].includes(resourceType)) {
      route.abort();
      return;
    }
    route.continue();
  });

  const session = {
    browser,
    page,
    qrCodeUrl: undefined as string | undefined,
    cookies: undefined as any[] | undefined,
    isLoggedIn: false,
    timer: undefined as NodeJS.Timeout | undefined,
    captchaId: undefined as string | undefined,
    hasCaptcha: false,
  };

  sessions.set(nonce, session);

  // 监听二维码创建响应
  page.on("response", async (response: Response) => {
    if (["xhr", "fetch"].includes(response.request().resourceType())) {
      if (response.url().includes("/api/sns/web/v1/login/qrcode/create")) {
        const res = await response.json();
        const qrCodeUrl = res.data.url;
        session.qrCodeUrl = qrCodeUrl;
        console.log(`QR Code URL for ${nonce}:`, qrCodeUrl);
      }
      if (response.url().includes("/api/sns/web/v2/user/me")) {
        const res = await response.json();
        if (res?.data?.guest === false) {
          const cookies = await page.context().cookies();
          session.cookies = cookies;
          session.isLoggedIn = true;
          console.log(`User logged in for ${nonce}`);
        }
      }
      // /api/redcaptcha/v2/captcha/register
      if (response.url().includes("/api/redcaptcha/v2/captcha/register")) {
        const res = await response.json();
        session.captchaId = res.data.captcha_id;
        session.hasCaptcha = true;
        session.isLoggedIn = false;
        console.log(`Captcha detected for ${nonce}, captcha_id: ${res.data.captcha_id}`);
      }
    }
  });

  // 1分钟后自动关闭
  session.timer = setTimeout(async () => {
    await browser.close(); // 只关闭context，不关闭browserInstance
    sessions.delete(nonce);
    console.log(`Session ${nonce} auto-closed after 1 minute`);
  }, 60000);

  await page.goto("https://www.xiaohongshu.com");

  return session;
}

// 接口1: 请求登录二维码 URL
app.get("/qrcode", async (c) => {
  const nonce = generateNonce();

  try {
    const session = await initBrowserSession(nonce);

    // 等待二维码 URL 生成 (最多等待10秒)
    let attempts = 0;
    while (!session.qrCodeUrl && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      attempts++;
    }

    if (!session.qrCodeUrl) {
      await session.browser.close();
      sessions.delete(nonce);
      return c.json({
        code: 0,
        data: {
          error: "Failed to get QR code URL",
        },
        message: "Failed to get QR code URL",
      }, 500);
    }

    return c.json({
      code: 1,
      data: {
        nonce,
        qrCodeUrl: session.qrCodeUrl,
        hasCaptcha: session.hasCaptcha || false,
        captchaId: session.captchaId,
      },
      message: session.hasCaptcha ? "需要处理验证码" : "Browser session initialized, will auto-close in 1 minute",
    });
  } catch (error) {
    console.error("Error initializing browser session:", error);
    return c.json({ error: "Failed to initialize browser session" }, 500);
  }
});

// 接口1.2: 通过nonce手动关闭browser
app.get("/close/:nonce", async (c) => {
  const nonce = c.req.param("nonce");
  const session = sessions.get(nonce);

  if (!session) {
    return c.json({
      code: 0,
      data: {
        error: "Session not found or already closed",
      },
      message: "Session not found or already closed",
    }, 404);
  }

  // 清理定时器并关闭浏览器
  if (session.timer) {
    clearTimeout(session.timer);
  }
  
  await session.browser.close();
  sessions.delete(nonce);

  return c.json({
    code: 1,
    data: {
      message: "Browser session closed successfully",
    },
    message: "Browser session closed successfully",
  });
});

// 接口2: 查询 cookie 状态
app.get("/cookies/:nonce", async (c) => {
  const nonce = c.req.param("nonce");
  const session = sessions.get(nonce);

  if (!session) {
    return c.json({
      code: 0,
      data: {
        error: "Session not found or expired",
      },
      message: "Session not found or expired",
    }, 404);
  }

  if (session.hasCaptcha) {
    return c.json({
      code: 0,
      data: {
        isLoggedIn: false,
        hasCaptcha: true,
        captchaId: session.captchaId,
      },
      message: "需要处理验证码，登录失败",
    });
  }

  if (!session.isLoggedIn) {
    return c.json({
      code: 0,
      data: {
        isLoggedIn: false,
        hasCaptcha: false,
      },
      message: "User not logged in yet",
    });
  }

  // 清理定时器并关闭浏览器
  if (session.timer) {
    clearTimeout(session.timer);
  }
  await session.browser.close(); // 只关闭context，不关闭browserInstance
  sessions.delete(nonce);

  return c.json({
    code: 1,
    data: {
      isLoggedIn: true,
      cookies: session.cookies,
    },
    message: "Login successful, browser session closed",
  });
});

// 提供测试页面
app.get('/test', async (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>小红书登录 - SSE 测试</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
        .connected { background-color: #d4edda; color: #155724; }
        .error { background-color: #f8d7da; color: #721c24; }
        .success { background-color: #d1ecf1; color: #0c5460; }
        .qrcode img { max-width: 300px; border: 1px solid #ddd; padding: 10px; }
        .cookies { background-color: #f8f9fa; padding: 15px; border-radius: 5px; white-space: pre-wrap; font-family: monospace; max-height: 300px; overflow-y: auto; }
        button { background-color: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; }
        button:hover { background-color: #0056b3; }
        button:disabled { background-color: #6c757d; cursor: not-allowed; }
    </style>
</head>
<body>
    <h1>小红书登录 - SSE 长连接测试</h1>
    <button id="startBtn" onclick="startLogin()">开始登录</button>
    <button id="stopBtn" onclick="stopLogin()" disabled>停止连接</button>
    <div id="status"></div>
    <div id="qrcode"></div>
    <div id="cookies"></div>
    <script>
        let eventSource = null;
        function addStatus(message, type = 'info') {
            const statusDiv = document.getElementById('status');
            const div = document.createElement('div');
            div.className = \`status \${type}\`;
            div.textContent = \`[\${new Date().toLocaleTimeString()}] \${message}\`;
            statusDiv.appendChild(div);
            statusDiv.scrollTop = statusDiv.scrollHeight;
        }
        function startLogin() {
            if (eventSource) eventSource.close();
            document.getElementById('status').innerHTML = '';
            document.getElementById('qrcode').innerHTML = '';
            document.getElementById('cookies').innerHTML = '';
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            addStatus('正在连接服务器...', 'connected');
            eventSource = new EventSource('/qrcode/stream');
            eventSource.addEventListener('connected', function(e) {
                const data = JSON.parse(e.data);
                addStatus(\`连接成功! Session ID: \${data.nonce}\`, 'connected');
            });
            eventSource.addEventListener('qrcode', function(e) {
                const data = JSON.parse(e.data);
                addStatus('收到二维码，请扫码登录', 'success');
                document.getElementById('qrcode').innerHTML = \`<h3>请扫描二维码登录：</h3><div class="qrcode"><img src="\${data.qrCodeUrl}" alt="登录二维码" /></div><p>等待用户扫码登录...</p>\`;
            });
            eventSource.addEventListener('login_success', function(e) {
                const data = JSON.parse(e.data);
                addStatus('登录成功！已获取到 cookies', 'success');
                document.getElementById('cookies').innerHTML = \`<h3>登录成功，获取到的 Cookies：</h3><div class="cookies">\${JSON.stringify(data.cookies, null, 2)}</div>\`;
                stopLogin();
            });
            eventSource.addEventListener('error', function(e) {
                const data = JSON.parse(e.data);
                addStatus(\`错误: \${data.error}\`, 'error');
                stopLogin();
            });
            eventSource.addEventListener('timeout', function(e) {
                const data = JSON.parse(e.data);
                addStatus(\`超时: \${data.message}\`, 'error');
                stopLogin();
            });
            eventSource.onerror = function(e) {
                addStatus('连接错误，请检查服务器是否运行', 'error');
                stopLogin();
            };
        }
        function stopLogin() {
            if (eventSource) { eventSource.close(); eventSource = null; }
            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            addStatus('连接已关闭', 'connected');
        }
    </script>
</body>
</html>
  `)
})

// 接口1.1: SSE 长连接版本 - 获取二维码并等待登录
app.get('/qrcode/stream', async (c) => {
  const nonce = generateNonce()

  // 设置 SSE 响应头
  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache')
  c.header('Connection', 'keep-alive')
  c.header('Access-Control-Allow-Origin', '*')

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      }

      // 初始化浏览器会话
      initBrowserSession(nonce).then(async (session) => {
        // 发送连接成功事件
        sendEvent('connected', { nonce, message: 'Browser session initialized' })

        // 等待二维码 URL
        let attempts = 0
        while (!session.qrCodeUrl && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 200))
          attempts++
        }

        if (!session.qrCodeUrl) {
          sendEvent('error', { error: 'Failed to get QR code URL' })
          await session.browser.close()
          sessions.delete(nonce)
          controller.close()
          return
        }

        // 发送二维码 URL
        sendEvent('qrcode', { qrCodeUrl: session.qrCodeUrl })

        // 监听登录状态变化
        const checkLogin = setInterval(async () => {
          // 检查是否出现验证码
          if (session.hasCaptcha) {
            clearInterval(checkLogin)
            
            // 清理定时器
            if (session.timer) {
              clearTimeout(session.timer)
            }
            
            // 发送验证码事件
            sendEvent('captcha', {
              captchaId: session.captchaId,
              message: '需要处理验证码，登录失败'
            })
            
            // 关闭浏览器和连接
            await session.browser.close()
            sessions.delete(nonce)
            controller.close()
            return
          }
          
          // 检查是否登录成功
          if (session.isLoggedIn) {
            clearInterval(checkLogin)

            // 清理定时器
            if (session.timer) {
              clearTimeout(session.timer)
            }

            // 发送登录成功事件和 cookies
            sendEvent('login_success', {
              cookies: session.cookies,
              message: 'Login successful'
            })

            // 关闭浏览器和连接
            await session.browser.close()
            sessions.delete(nonce)
            controller.close()
          }
        }, 1000) // 每秒检查一次

        // 5分钟超时
        setTimeout(() => {
          clearInterval(checkLogin)
          if (sessions.has(nonce)) {
            sendEvent('timeout', { message: 'Login timeout after 5 minutes' })
            session.browser.close().then(() => {
              sessions.delete(nonce)
            })
          }
          controller.close()
        }, 300000) // 5分钟

      }).catch((error) => {
        console.error('Error initializing browser session:', error)
        sendEvent('error', { error: 'Failed to initialize browser session' })
        controller.close()
      })
    }
  })

  return new Response(stream)
})

export default {
  idleTimeout: 60,
  port: 3000,
  fetch: app.fetch,
};

# SSE 长连接登录使用指南

## 🚀 新功能：长连接登录

现在支持通过 Server-Sent Events (SSE) 保持长连接，一次请求完成整个登录流程！

## 📡 接口说明

### 1. SSE 长连接接口

**端点**: `GET /qrcode/stream`

**特性**:
- ✅ 保持长连接，无需轮询
- ✅ 实时推送登录状态
- ✅ 自动获取 cookies
- ✅ 5分钟超时保护
- ✅ 自动清理资源

### 2. 事件类型

| 事件名 | 描述 | 数据格式 |
|--------|------|----------|
| `connected` | 连接建立成功 | `{nonce, message}` |
| `qrcode` | 二维码生成完成 | `{qrCodeUrl}` |
| `login_success` | 登录成功 | `{cookies, message}` |
| `error` | 发生错误 | `{error}` |
| `timeout` | 超时 | `{message}` |

## 💻 使用示例

### JavaScript 客户端

```javascript
const eventSource = new EventSource('http://localhost:3000/qrcode/stream');

// 连接成功
eventSource.addEventListener('connected', function(e) {
    const data = JSON.parse(e.data);
    console.log('连接成功:', data.nonce);
});

// 收到二维码
eventSource.addEventListener('qrcode', function(e) {
    const data = JSON.parse(e.data);
    console.log('二维码URL:', data.qrCodeUrl);
    // 显示二维码给用户扫描
    showQRCode(data.qrCodeUrl);
});

// 登录成功
eventSource.addEventListener('login_success', function(e) {
    const data = JSON.parse(e.data);
    console.log('登录成功，获取到 cookies:', data.cookies);
    // 保存 cookies 并关闭连接
    saveCookies(data.cookies);
    eventSource.close();
});

// 错误处理
eventSource.addEventListener('error', function(e) {
    const data = JSON.parse(e.data);
    console.error('错误:', data.error);
    eventSource.close();
});

// 超时处理
eventSource.addEventListener('timeout', function(e) {
    const data = JSON.parse(e.data);
    console.log('超时:', data.message);
    eventSource.close();
});
```

### Python 客户端

```python
import requests
import json

def login_with_sse():
    url = 'http://localhost:3000/qrcode/stream'
    
    with requests.get(url, stream=True) as response:
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                
                if line.startswith('event: '):
                    event_type = line[7:]
                elif line.startswith('data: '):
                    data = json.loads(line[6:])
                    
                    if event_type == 'connected':
                        print(f"连接成功: {data['nonce']}")
                    
                    elif event_type == 'qrcode':
                        print(f"二维码URL: {data['qrCodeUrl']}")
                        # 显示二维码
                        
                    elif event_type == 'login_success':
                        print("登录成功!")
                        print(f"Cookies: {data['cookies']}")
                        break
                        
                    elif event_type == 'error':
                        print(f"错误: {data['error']}")
                        break
                        
                    elif event_type == 'timeout':
                        print(f"超时: {data['message']}")
                        break

login_with_sse()
```

## 🌐 测试页面

访问 `http://localhost:3000/test` 查看完整的 Web 测试界面。

## 🔄 流程对比

### 原方式（需要轮询）
1. `GET /qrcode` → 获取二维码和 nonce
2. 显示二维码给用户
3. 循环调用 `GET /cookies/{nonce}` 检查登录状态
4. 直到获取到 cookies 或超时

### 新方式（SSE 长连接）
1. `GET /qrcode/stream` → 建立 SSE 连接
2. 自动接收二维码 URL
3. 自动接收登录成功事件和 cookies
4. 连接自动关闭

## ⚡ 优势

- **实时性**: 登录成功立即推送，无延迟
- **效率**: 无需轮询，减少服务器压力
- **简单**: 一个连接完成整个流程
- **可靠**: 自动超时和错误处理
- **资源友好**: 自动清理浏览器会话

## 🛠️ 兼容性

- ✅ 保留原有 `/qrcode` 和 `/cookies/{nonce}` 接口
- ✅ 支持所有现代浏览器
- ✅ 支持 Node.js、Python 等服务端
- ✅ 支持移动端 WebView

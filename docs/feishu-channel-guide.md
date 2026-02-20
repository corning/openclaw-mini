# 飞书渠道使用指南

## 概述

飞书渠道允许你的 Mini Agent 与飞书机器人集成，实现：
- 接收飞书消息并自动回复
- 主动发送消息到飞书用户或群聊
- 处理飞书事件（如@机器人、按钮点击等）

## 快速开始

### 1. 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 获取以下信息：
   - **App ID** - 应用唯一标识
   - **App Secret** - 应用密钥
4. 配置机器人权限：
   - 获取用户 user_id
   - 获取用户基础信息
   - 获取与发送单聊、群组消息
   - 获取群组信息
   - 获取群组中所有成员

### 2. 配置环境变量

创建 `.env` 文件或设置环境变量：

```bash
# Agent 配置
ANTHROPIC_API_KEY=sk-ant-...

# 飞书配置
FEISHU_APP_ID=cli_xxxxxx
FEISHU_APP_SECRET=xxxxxxxx
FEISHU_ENCRYPT_KEY=xxxxxx  # 可选
FEISHU_VERIFICATION_TOKEN=xxxxxx  # 可选
FEISHU_TEST_CONVERSATION_ID=oc_xxxxxx  # 测试用的群聊ID
```

### 3. 运行示例

```bash
# 安装依赖
npm install

# 设置环境变量
export ANTHROPIC_API_KEY=your-key
export FEISHU_APP_ID=your-app-id
export FEISHU_APP_SECRET=your-app-secret

# 运行飞书渠道示例
npx tsx examples/feishu-channel.ts
```

## 详细配置

### 事件订阅配置（Webhook）

如需接收飞书消息，需要配置事件订阅：

1. 在飞书开放平台应用管理页面：
   - 进入"事件订阅"页面
   - 添加"接收消息"事件
   - 配置请求地址（你的服务器地址）

2. 配置加密密钥和验证令牌：
   - 在"事件订阅"页面生成
   - 用于验证飞书请求的合法性

### 渠道配置选项

```typescript
import { FeishuChannel } from "../src/index.js";

const channel = new FeishuChannel("feishu-bot", {
  // 必需
  appId: "cli_xxxxxx",
  appSecret: "xxxxxxxx",
  
  // 可选：用于 webhook 验证
  encryptKey: "xxxxxx",
  verificationToken: "xxxxxx",
  
  // 可选：webhook 地址（如果使用 webhook 模式）
  webhookUrl: "https://your-server.com/feishu/webhook",
  
  // 可选：消息接收端点
  endpoint: "/feishu/webhook",
});
```

## 使用方法

### 1. 基本使用

```typescript
import { Agent, createChannelManager, FeishuChannel } from "../src/index.js";

async function setupFeishu() {
  // 创建飞书渠道
  const feishuChannel = new FeishuChannel("feishu-bot", {
    appId: process.env.FEISHU_APP_ID!,
    appSecret: process.env.FEISHU_APP_SECRET!,
  });

  // 创建渠道管理器
  const channelManager = createChannelManager();
  channelManager.registerChannel(feishuChannel);

  // 初始化并连接
  await feishuChannel.initialize();
  await feishuChannel.connect();

  // 创建 Agent 并设置渠道管理器
  const agent = new Agent({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    workspaceDir: process.cwd(),
  });

  const sessionId = "feishu-session";
  const context = await agent.getSessionContext(sessionId);
  context.metadata = {
    ...context.metadata,
    channelManager,
  };

  return { agent, sessionId, channelManager };
}
```

### 2. 发送消息

Agent 可以通过工具发送消息：

```typescript
// Agent 会自动使用 channel_send 工具
const result = await agent.run(sessionId, "发送消息到飞书，内容：'你好，飞书！'，会话ID：oc_123456");
```

### 3. 接收消息

配置 webhook 后，飞书消息会自动转发给 Agent：

```typescript
// 在 webhook 处理器中
app.post("/feishu/webhook", async (req, res) => {
  const event = req.body;
  
  // 处理飞书事件
  await feishuChannel.handleWebhookEvent(event);
  
  // 返回成功响应
  res.json({ code: 0, msg: "success" });
});
```

## 工具说明

Agent 可以使用以下渠道工具：

### 1. `channel_send`
发送消息到指定渠道。

**参数：**
- `channel_type`: 渠道类型，如 "feishu"
- `channel_id`: 渠道ID
- `conversation_id`: 会话ID（飞书用户ID或群聊ID）
- `content`: 消息内容
- `message_type`: 消息类型（text/markdown/html）

**示例：**
```typescript
// Agent 会自动调用
"发送消息到飞书渠道 feishu-bot，会话ID oc_123456，内容：'测试消息'"
```

### 2. `channel_status`
获取所有渠道状态。

**示例：**
```typescript
"查看所有渠道的状态"
```

### 3. `channel_broadcast`
广播消息到所有已连接的渠道。

**参数：**
- `content`: 广播内容
- `message_type`: 消息类型

**示例：**
```typescript
"广播消息到所有渠道，内容：'系统通知：服务器维护中'"
```

## 常见问题

### 1. 如何获取 conversation_id？
- **用户ID**: 以 "u_" 开头
- **群聊ID**: 以 "oc_" 开头
- 可以通过飞书API获取，或在飞书客户端查看

### 2. 消息发送失败？
检查：
- 飞书应用是否有发送消息权限
- 访问令牌是否有效
- conversation_id 是否正确
- 用户是否在群聊中

### 3. 如何调试？
启用详细日志：
```typescript
const channel = new FeishuChannel("feishu-bot", config);
// 监听渠道事件
channel.onEvent((event) => {
  console.log("飞书渠道事件:", event);
});
```

## 高级功能

### 1. 消息类型扩展
当前支持文本消息，可以扩展支持：
- 富文本消息
- 卡片消息
- 图片消息
- 文件消息

### 2. 事件处理
可以处理更多飞书事件：
- 按钮点击事件
- 菜单点击事件
- 用户加入群聊事件
- 消息撤回事件

### 3. 多渠道集成
可以同时集成多个渠道：
- 飞书 + Webhook
- 飞书 + 钉钉
- 多个飞书机器人实例

## 安全建议

1. **保护 App Secret**：不要泄露到客户端
2. **验证签名**：始终验证飞书 webhook 签名
3. **限制权限**：按需分配最小权限
4. **日志监控**：监控渠道连接和消息发送状态

## 参考链接

- [飞书开放平台文档](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-concepts)
- [飞书机器人API](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [Mini Agent 文档](../README.md)
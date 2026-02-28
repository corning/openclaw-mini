# 渠道功能指南

OpenClaw Mini 的渠道层提供了多渠道机器人接入能力，参考了 openclaw/extensions/feishu 的实现。

## 功能概述

渠道功能包括：

1. **多渠道接入**：支持飞书、Webhook、示例渠道等
2. **消息收发**：双向消息传递
3. **渠道管理**：多渠道统一管理
4. **飞书扩展**：文档、知识库、云盘等高级功能
5. **工具集成**：渠道相关工具自动注入

## 快速开始

### 1. 基本渠道使用

```typescript
import { Agent, ChannelManager } from "openclaw-mini";

// 创建渠道管理器
const channelManager = new ChannelManager();

// 创建 Agent 并启用渠道
const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  workspaceDir: process.cwd(),
  channels: {
    enabled: true,
  },
});

// 设置渠道管理器
agent.setChannelManager(channelManager);
```

### 2. 飞书渠道配置

#### 环境变量方式
```bash
# .env 文件
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_DOMAIN=feishu  # 可选：feishu 或 lark
FEISHU_ENCRYPT_KEY=your_key  # 可选
FEISHU_VERIFICATION_TOKEN=your_token  # 可选
FEISHU_REQUIRE_MENTION=false  # 可选
FEISHU_CONNECTION_MODE=webhook  # 可选：webhook 或 websocket
```

#### 代码方式
```typescript
import { FeishuChannel } from "openclaw-mini/channels";

const feishuChannel = new FeishuChannel("feishu-main", {
  enabled: true,
  defaultAccount: {
    accountId: 'default',
    appId: process.env.FEISHU_APP_ID!,
    appSecret: process.env.FEISHU_APP_SECRET!,
    domain: 'feishu',
    connectionMode: 'webhook',
    requireMention: false,
  },
});

// 添加到 Agent
agent.addChannel('feishu', feishuChannel);
```

## 可用工具

### 基础渠道工具

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `channel_send` | 发送消息到指定渠道 | `channel_type`, `channel_id`, `conversation_id`, `content`, `message_type` |
| `channel_status` | 查看所有渠道状态 | - |
| `channel_broadcast` | 广播消息到所有渠道 | `content`, `message_type` |

### 飞书专用工具

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `feishu_doc` | 访问飞书文档 | `action`, `document_id`, `query`, `limit` |
| `feishu_wiki` | 访问飞书知识库 | `action`, `space_id`, `node_id`, `query`, `limit` |
| `feishu_drive` | 访问飞书云盘 | `action`, `folder_token`, `file_token`, `query`, `file_name`, `content`, `limit` |
| `feishu_perm` | 管理飞书权限（默认禁用） | `action`, `user_id`, `department_id`, `resource_type`, `resource_id`, `permission` |

## 配置示例

### 多账户配置
```typescript
const feishuConfig = {
  enabled: true,
  defaultAccount: {
    accountId: 'default',
    appId: 'app_id_1',
    appSecret: 'app_secret_1',
  },
  accounts: {
    'account2': {
      accountId: 'account2',
      name: '第二个飞书账户',
      enabled: true,
      appId: 'app_id_2',
      appSecret: 'app_secret_2',
      domain: 'lark',
    },
  },
};
```

### 工具配置控制
```typescript
const agent = new Agent({
  // ... 其他配置
  channels: {
    enabled: true,
    feishuTools: {
      doc: true,       // 启用文档工具
      wiki: true,      // 启用知识库工具
      drive: true,     // 启用云盘工具
      perm: false,     // 权限工具默认禁用（敏感操作）
      scopes: true,    // 启用范围检查
    },
  },
});
```

## 使用示例

### 发送消息
```typescript
// Agent 会自动调用 channel_send 工具
const result = await agent.run(sessionId, `
  发送消息到飞书：
  渠道类型：feishu
  渠道ID：feishu-main  
  会话ID：oc_123456
  内容："这是一个测试消息"
  消息类型：text
`);
```

### 查看状态
```typescript
const result = await agent.run(sessionId, "查看所有渠道的状态信息");
```

### 使用飞书文档
```typescript
const result = await agent.run(sessionId, `
  搜索飞书文档：
  操作：search
  查询："项目文档"
  限制：5
`);
```

## Webhook 集成

### 接收飞书消息
```typescript
// 假设你有 Express 服务器
app.post('/feishu-webhook', async (req, res) => {
  const event = req.body;
  
  try {
    await feishuChannel.handleWebhookEvent(event);
    res.json({ code: 0, msg: "success" });
  } catch (error) {
    console.error("Webhook 处理失败:", error);
    res.status(500).json({ code: 1, msg: "error" });
  }
});
```

### 模拟飞书事件
```typescript
const mockEvent = {
  event: {
    type: "message",
    message: {
      message_id: "mock_msg_123",
      chat_id: "oc_123456",
      chat_type: "p2p",
      message_type: "text",
      content: JSON.stringify({ text: "你好，Agent！" }),
      create_time: Math.floor(Date.now() / 1000).toString(),
      sender: {
        sender_id: {
          user_id: "u_123456",
          open_id: "ou_123456",
        },
      },
    },
  },
};

await feishuChannel.handleWebhookEvent(mockEvent);
```

## 高级功能

### 动态工具管理
```typescript
// 获取渠道工具管理器
const channelToolManager = agent.getChannelToolManager();

// 获取工具统计
const stats = channelToolManager.getToolStats();
console.log(`总工具数: ${stats.total}`);
console.log("按渠道分布:", stats.byChannel);

// 生成工具说明
const descriptions = channelToolManager.generateToolDescriptions();
console.log(descriptions);

// 更新配置
agent.updateFeishuToolsConfig({
  doc: true,
  wiki: true,
  drive: false, // 禁用云盘工具
});
```

### 多渠道支持
```typescript
// 可以注册多个渠道
channelManager.registerChannel(feishuChannel);
channelManager.registerChannel(webhookChannel);
channelManager.registerChannel(exampleChannel);

// 统一管理
await channelManager.initializeAll();
await channelManager.connectAll();
await channelManager.disconnectAll();
```

## 故障排除

### 常见问题

1. **飞书连接失败**
   - 检查 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 是否正确
   - 确认飞书应用已开通相应权限
   - 检查网络连接和代理设置

2. **工具不可用**
   - 确保 `channels.enabled: true`
   - 检查工具配置是否正确
   - 验证渠道管理器是否已设置

3. **消息发送失败**
   - 确认 `conversation_id` 格式正确
   - 检查渠道是否已连接
   - 验证用户/群聊是否有权限

### 调试模式
```typescript
// 启用详细日志
process.env.DEBUG = 'openclaw-mini:channels';

// 查看详细状态
const status = channelManager.getStatus();
console.log(JSON.stringify(status, null, 2));
```

## 参考资源

- [飞书开放平台文档](https://open.feishu.cn/document/)
- [OpenClaw Feishu 扩展](workspace/openclaw/extensions/feishu)
- [渠道类型定义](src/channels/types.ts)
- [渠道管理器](src/channels/manager.ts)
- [飞书渠道实现](src/channels/feishu.ts)
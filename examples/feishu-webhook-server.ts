/**
 * 飞书 Webhook 服务器示例
 * 演示如何创建一个接收飞书消息的 HTTP 服务器
 */

import "dotenv/config";
import express from "express";
import { Agent } from "../src/index.js";
import { ChannelManager } from "../src/channels/manager.js";
import { FeishuChannel } from "../src/channels/feishu.js";

const app = express();
const PORT = process.env.PORT || 3000;

// 全局变量
let agent: Agent;
let channelManager: ChannelManager;
let feishuChannel: FeishuChannel;

async function setupAgent() {
  console.log("=== 飞书 Webhook 服务器设置 ===\n");

  // 检查环境变量
  const requiredVars = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'ANTHROPIC_API_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error("缺少必要的环境变量:", missingVars.join(", "));
    process.exit(1);
  }

  // 创建飞书配置
  const feishuConfig = {
    enabled: true,
    defaultAccount: {
      accountId: 'default',
      name: 'Webhook 服务器',
      enabled: true,
      appId: process.env.FEISHU_APP_ID!,
      appSecret: process.env.FEISHU_APP_SECRET!,
      encryptKey: process.env.FEISHU_ENCRYPT_KEY,
      verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
      domain: (process.env.FEISHU_DOMAIN as 'feishu' | 'lark') || 'feishu',
      connectionMode: 'webhook' as const,
      requireMention: process.env.FEISHU_REQUIRE_MENTION === 'true',
    },
  };

  // 创建飞书渠道
  console.log("1. 创建飞书渠道...");
  feishuChannel = new FeishuChannel("feishu-webhook", feishuConfig);

  // 创建渠道管理器
  console.log("2. 创建渠道管理器...");
  channelManager = new ChannelManager();
  channelManager.registerChannel(feishuChannel);

  // 初始化飞书渠道
  console.log("3. 初始化飞书渠道...");
  try {
    await feishuChannel.initialize();
    await feishuChannel.connect();
    console.log("✅ 飞书渠道连接成功");
  } catch (error) {
    console.error("❌ 飞书渠道连接失败:", error);
    process.exit(1);
  }

  // 创建 Agent
  console.log("4. 创建 Agent...");
  agent = new Agent({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    workspaceDir: process.cwd(),
    provider: process.env.OPENCLAW_MINI_PROVIDER || "anthropic",
    model: process.env.OPENCLAW_MINI_MODEL || "claude-sonnet-4-20250514",
    maxTurns: 10,
    
    // 启用渠道功能
    channels: {
      enabled: true,
      manager: channelManager,
      feishuTools: {
        doc: true,
        wiki: true,
        drive: true,
        perm: false,
        scopes: true,
      },
    },
  });

  // 设置渠道管理器
  agent.setChannelManager(channelManager);
  agent.addChannel('feishu', feishuChannel);

  // 监听飞书消息
  console.log("5. 设置消息监听...");
  channelManager.onMessage(async (message) => {
    console.log(`\n📨 收到来自 ${message.channelType}:${message.channelId} 的消息`);
    console.log(`   用户: ${message.userId}`);
    console.log(`   会话: ${message.conversationId}`);
    console.log(`   内容: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`);
    console.log(`   类型: ${message.messageType}`);
    
    // 处理消息
    await processIncomingMessage(message);
  });

  // 监听渠道事件
  channelManager.onEvent((event) => {
    console.log(`\n📡 渠道事件: ${event.type}`);
    if (event.type === 'error') {
      console.error(`   错误: ${event.data.error}`);
    }
  });

  console.log(`\n✅ Agent 设置完成`);
}

async function processIncomingMessage(message: any) {
  const sessionId = `feishu-${message.conversationId}`;
  const userMessage = message.content;
  
  console.log(`\n🤖 处理消息，会话: ${sessionId}`);
  console.log(`   消息内容: ${userMessage}`);

  try {
    // 订阅 Agent 事件
    const unsubscribe = agent.subscribe((event) => {
      if (event.type === "message_delta") {
        process.stdout.write(event.delta);
      }
    });

    // 运行 Agent
    const result = await agent.run(sessionId, userMessage);
    
    console.log(`\n✅ 处理完成: ${result.turns} 轮对话, ${result.toolCalls} 次工具调用`);
    
    // 如果 Agent 使用了渠道工具，消息会自动发送
    // 否则可以在这里手动发送回复
    if (result.toolCalls === 0) {
      console.log("⚠️  Agent 未使用渠道工具发送回复");
    }
    
    unsubscribe();
    
  } catch (error) {
    console.error("❌ 处理消息失败:", error);
    
    // 发送错误消息
    try {
      await channelManager.sendMessage(
        message.channelType,
        message.channelId,
        {
          id: `error-${Date.now()}`,
          channelType: message.channelType,
          channelId: message.channelId,
          userId: "agent",
          conversationId: message.conversationId,
          content: "抱歉，处理消息时出现错误。",
          messageType: "text",
          timestamp: new Date(),
        }
      );
    } catch (sendError) {
      console.error("❌ 发送错误消息失败:", sendError);
    }
  }
}

// 设置 Express 服务器
function setupServer() {
  console.log("\n=== Webhook 服务器设置 ===\n");

  // 解析 JSON 请求体
  app.use(express.json());

  // 健康检查端点
  app.get("/", (req, res) => {
    res.json({
      status: "ok",
      service: "Feishu Webhook Server",
      agent: agent ? "ready" : "not ready",
      channels: channelManager ? "ready" : "not ready",
    });
  });

  // 状态端点
  app.get("/status", (req, res) => {
    if (!channelManager) {
      return res.status(503).json({ error: "Channel manager not ready" });
    }
    
    const status = channelManager.getStatus();
    res.json({
      status: "ok",
      channels: status,
    });
  });

  // 飞书 Webhook 端点
  app.post("/feishu/webhook", async (req, res) => {
    console.log("\n🌐 收到 Webhook 请求");
    console.log(`   方法: ${req.method}`);
    console.log(`   路径: ${req.path}`);
    console.log(`   头信息:`, req.headers);
    
    try {
      // 验证挑战请求（飞书首次配置时发送）
      if (req.body?.type === "url_verification") {
        console.log("🔐 处理 URL 验证挑战");
        const challenge = req.body.challenge;
        res.json({ challenge });
        return;
      }

      // 处理消息事件
      if (feishuChannel) {
        await feishuChannel.handleWebhookEvent(req.body);
        res.json({ code: 0, msg: "success" });
      } else {
        res.status(503).json({ code: 1, msg: "channel not ready" });
      }
    } catch (error) {
      console.error("❌ Webhook 处理失败:", error);
      res.status(500).json({ 
        code: 1, 
        msg: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 模拟消息端点（用于测试）
  app.post("/simulate/message", async (req, res) => {
    const { content, conversationId = "oc_test_chat", userId = "u_test_user" } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    console.log("\n🎭 模拟消息:", content);
    
    const mockEvent = {
      event: {
        type: "message",
        message: {
          message_id: `mock_${Date.now()}`,
          chat_id: conversationId,
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: content }),
          create_time: Math.floor(Date.now() / 1000).toString(),
          sender: {
            sender_id: {
              user_id: userId,
              open_id: `ou_${userId}`,
            },
          },
        },
      },
    };

    try {
      if (feishuChannel) {
        await feishuChannel.handleWebhookEvent(mockEvent);
        res.json({ success: true, message: "模拟消息已处理" });
      } else {
        res.status(503).json({ error: "channel not ready" });
      }
    } catch (error) {
      console.error("❌ 模拟消息失败:", error);
      res.status(500).json({ error: "处理失败" });
    }
  });

  // 发送消息端点
  app.post("/send/message", async (req, res) => {
    const { conversationId, content, messageType = "text" } = req.body;
    
    if (!conversationId || !content) {
      return res.status(400).json({ 
        error: "conversationId and content are required" 
      });
    }

    console.log(`\n✉️  发送消息到: ${conversationId}`);
    
    try {
      await channelManager.sendMessage("feishu", "feishu-webhook", {
        id: `api-${Date.now()}`,
        channelType: "feishu",
        channelId: "feishu-webhook",
        userId: "api",
        conversationId,
        content,
        messageType,
        timestamp: new Date(),
      });
      
      res.json({ success: true, message: "消息已发送" });
    } catch (error) {
      console.error("❌ 发送消息失败:", error);
      res.status(500).json({ error: "发送失败" });
    }
  });

  // 404 处理
  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // 错误处理
  app.use((error: any, req: any, res: any, next: any) => {
    console.error("❌ 服务器错误:", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

// 启动服务器
async function startServer() {
  try {
    // 设置 Agent
    await setupAgent();
    
    // 设置服务器
    const app = setupServer();
    
    // 启动服务器
    app.listen(PORT, () => {
      console.log(`\n🚀 服务器已启动`);
      console.log(`   地址: http://localhost:${PORT}`);
      console.log(`   健康检查: http://localhost:${PORT}/`);
      console.log(`   状态检查: http://localhost:${PORT}/status`);
      console.log(`   飞书 Webhook: http://localhost:${PORT}/feishu/webhook`);
      console.log(`   模拟消息: http://localhost:${PORT}/simulate/message`);
      console.log(`   发送消息: http://localhost:${PORT}/send/message`);
      console.log(`\n📝 使用说明:`);
      console.log(`   1. 将飞书事件订阅 URL 设置为: http://你的域名/feishu/webhook`);
      console.log(`   2. 使用 /simulate/message 端点测试消息处理`);
      console.log(`   3. 使用 /send/message 端点手动发送消息`);
    });
  } catch (error) {
    console.error("❌ 启动服务器失败:", error);
    process.exit(1);
  }
}

// 清理函数
async function cleanup() {
  console.log("\n🧹 清理资源...");
  
  try {
    if (channelManager) {
      await channelManager.disconnectAll();
    }
    console.log("✅ 清理完成");
  } catch (error) {
    console.error("❌ 清理失败:", error);
  }
  
  process.exit(0);
}

// 处理退出信号
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// 启动服务器
startServer().catch(console.error);
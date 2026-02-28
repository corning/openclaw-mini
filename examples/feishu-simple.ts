/**
 * 飞书渠道简单示例
 * 演示如何从环境变量配置飞书渠道
 */

import "dotenv/config";
import { Agent } from "../src/index.js";
import { loadChannelConfig, createChannelsFromConfig } from "../src/channels/config.js";

async function main() {
  console.log("=== 飞书渠道简单示例 ===\n");

  // 检查环境变量
  console.log("检查环境变量配置...");
  const requiredEnvVars = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'ANTHROPIC_API_KEY'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error("错误：缺少必要的环境变量:");
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error("\n请创建 .env 文件并设置以下变量:");
    console.error(`
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret
FEISHU_DOMAIN=feishu  # 可选：feishu 或 lark
FEISHU_ENCRYPT_KEY=your_encrypt_key  # 可选
FEISHU_VERIFICATION_TOKEN=your_token  # 可选
FEISHU_REQUIRE_MENTION=false  # 可选
FEISHU_CONNECTION_MODE=webhook  # 可选：webhook 或 websocket

ANTHROPIC_API_KEY=sk-ant-xxx
OPENCLAW_MINI_PROVIDER=anthropic
OPENCLAW_MINI_MODEL=claude-sonnet-4-20250514
    `);
    process.exit(1);
  }

  console.log("✅ 环境变量检查通过");

  // 加载渠道配置
  console.log("\n1. 加载渠道配置...");
  const channelConfig = loadChannelConfig();
  console.log("配置摘要:");
  console.log(`- 渠道管理器启用: ${channelConfig.enabled ? '✅' : '❌'}`);
  console.log(`- 飞书配置: ${channelConfig.channels?.feishu ? '✅' : '❌'}`);
  
  if (channelConfig.channels?.feishu) {
    const feishuConfig = channelConfig.channels.feishu;
    console.log(`  应用ID: ${feishuConfig.defaultAccount?.appId?.substring(0, 8)}...`);
    console.log(`  连接模式: ${feishuConfig.defaultAccount?.connectionMode || 'webhook'}`);
    console.log(`  域名: ${feishuConfig.defaultAccount?.domain || 'feishu'}`);
  }

  // 创建 Agent
  console.log("\n2. 创建 Agent...");
  const agent = new Agent({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    workspaceDir: process.cwd(),
    provider: process.env.OPENCLAW_MINI_PROVIDER || "anthropic",
    model: process.env.OPENCLAW_MINI_MODEL || "claude-sonnet-4-20250514",
    
    // 启用渠道功能
    channels: {
      enabled: true,
      feishuTools: {
        doc: true,
        wiki: true,
        drive: true,
        perm: false,
        scopes: true,
      },
    },
  });

  // 启用渠道工具
  agent.enableChannelTools(true);
  
  console.log("✅ Agent 创建成功");

  // 订阅事件
  console.log("\n3. 订阅事件...");
  const unsubscribe = agent.subscribe((event) => {
    if (event.type === "message_delta") {
      process.stdout.write(event.delta);
    } else if (event.type === "tool_execution_start") {
      console.log(`\n[工具: ${event.toolName}]`);
    }
  });

  const sessionId = "feishu-simple-session";

  // 示例对话
  console.log("\n=== 示例对话 ===");
  
  // 测试渠道功能
  console.log("\n1. 测试渠道工具...");
  const result1 = await agent.run(sessionId, "你好！请告诉我目前有哪些可用的渠道工具？");
  console.log(`\n[完成: ${result1.turns} 轮对话]`);

  // 测试飞书工具
  console.log("\n2. 测试飞书工具...");
  const result2 = await agent.run(sessionId, `
    请介绍一下飞书相关的工具功能：
    1. 文档工具可以做什么？
    2. 知识库工具有什么用途？
    3. 云盘工具有哪些功能？
  `);
  console.log(`\n[完成: ${result2.turns} 轮对话]`);

  // 发送消息示例
  console.log("\n3. 发送消息示例...");
  const conversationId = process.env.FEISHU_TEST_CONVERSATION_ID;
  if (conversationId) {
    const result3 = await agent.run(sessionId, `
      请向飞书发送一条测试消息：
      渠道类型：feishu
      会话ID：${conversationId}
      内容："这是一个简单的测试消息"
      消息类型：text
    `);
    console.log(`\n[完成: ${result3.turns} 轮对话]`);
  } else {
    console.log("跳过发送消息测试（未设置 FEISHU_TEST_CONVERSATION_ID）");
  }

  // 获取工具说明
  console.log("\n4. 获取详细工具说明...");
  const result4 = await agent.run(sessionId, `
    请为我详细说明以下工具的使用方法：
    1. channel_send 工具
    2. channel_status 工具  
    3. channel_broadcast 工具
    4. feishu_doc 工具
    5. feishu_wiki 工具
    6. feishu_drive 工具
  `);
  console.log(`\n[完成: ${result4.turns} 轮对话]`);

  // 显示统计信息
  console.log("\n=== 统计信息 ===");
  const stats = agent.getChannelToolStats();
  console.log(`总工具数: ${stats.total}`);
  console.log("按渠道分布:");
  Object.entries(stats.byChannel).forEach(([channel, count]) => {
    console.log(`  ${channel}: ${count} 个工具`);
  });

  // 清理
  console.log("\n=== 清理 ===");
  unsubscribe();
  await agent.reset(sessionId);
  
  console.log("\n✅ 示例完成");
}

main().catch((error) => {
  console.error("错误:", error);
  process.exit(1);
});
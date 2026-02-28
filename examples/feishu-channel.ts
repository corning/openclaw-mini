/**
 * 飞书渠道增强示例
 * 
 * 使用前需要：
 * 1. 在飞书开放平台创建企业自建应用
 * 2. 获取 App ID 和 App Secret
 * 3. 配置机器人权限
 * 4. 设置环境变量：
 *    - FEISHU_APP_ID
 *    - FEISHU_APP_SECRET
 *    - FEISHU_ENCRYPT_KEY (可选)
 *    - FEISHU_VERIFICATION_TOKEN (可选)
 */

import "dotenv/config";
import { Agent } from "../src/index.js";
import { ChannelManager } from "../src/channels/manager.js";
import { FeishuChannel } from "../src/channels/feishu.js";

async function main() {
  console.log("=== 飞书渠道增强示例 ===\n");

  // 从环境变量获取配置
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
  const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;

  if (!appId || !appSecret) {
    console.error("错误：请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET 环境变量");
    console.error("参考：https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-concepts");
    process.exit(1);
  }

  // 创建飞书配置
  console.log("1. 配置飞书渠道...");
  const feishuConfig = {
    enabled: true,
    defaultAccount: {
      accountId: 'default',
      name: '测试飞书账户',
      enabled: true,
      appId,
      appSecret,
      encryptKey,
      verificationToken,
      domain: 'feishu' as const,
      connectionMode: 'webhook' as const,
      requireMention: false,
      dmPolicy: 'open' as const,
      groupPolicy: 'open' as const,
    },
  };

  // 创建飞书渠道
  console.log("2. 创建飞书渠道...");
  const feishuChannel = new FeishuChannel("feishu-main", feishuConfig);

  // 创建渠道管理器
  console.log("3. 创建渠道管理器...");
  const channelManager = new ChannelManager();
  channelManager.registerChannel(feishuChannel);

  // 初始化并连接渠道
  console.log("4. 初始化飞书渠道...");
  try {
    await feishuChannel.initialize();
    await feishuChannel.connect();
    console.log("✅ 飞书渠道连接成功");

    // 显示渠道信息
    const info = feishuChannel.getInfo();
    console.log(`   账户ID: ${info.accountId}`);
    console.log(`   连接模式: ${info.connectionMode}`);
    console.log(`   应用ID: ${info.config.appId}`);
  } catch (error) {
    console.error("❌ 飞书渠道连接失败:", error);
    process.exit(1);
  }

  // 创建 Agent 并启用渠道功能
  console.log("5. 创建 Agent 并配置渠道...");
  const agent = new Agent({
    apiKey: process.env.OPENAI_API_KEY,
    workspaceDir: process.cwd(),
    provider: process.env.OPENCLAW_MINI_PROVIDER || "anthropic",
    model: process.env.OPENCLAW_MINI_MODEL || "claude-sonnet-4-20250514",
    maxTurns: 10,
    // 启用渠道功能
    channels: {
      enabled: true,
      manager: channelManager,
      feishuTools: {
        doc: true,       // 启用文档工具
        wiki: true,      // 启用知识库工具
        drive: true,     // 启用云盘工具
        perm: false,     // 权限工具默认禁用（敏感操作）
        scopes: true,    // 启用范围检查
      },
    },
  });

  // 设置渠道管理器
  agent.setChannelManager(channelManager);

  // 添加飞书渠道到管理器
  agent.addChannel('feishu', feishuChannel);

  // 订阅 Agent 事件
  console.log("6. 订阅 Agent 事件...");
  const unsubscribe = agent.subscribe((event) => {
    switch (event.type) {
      case "message_delta":
        process.stdout.write(event.delta);
        break;
      case "tool_execution_start":
        console.log(`\n[调用工具: ${event.toolName}]`);
        break;
      case "tool_execution_end":
        const preview = event.result.substring(0, 80);
        console.log(`\n[工具结果: ${preview}${event.result.length > 80 ? '...' : ''}]`);
        break;
      case "agent_start":
        console.log(`\n[Agent 启动] runId=${event.runId} 模型=${event.model}`);
        break;
      case "agent_end":
        console.log(`\n[Agent 结束] 轮次=${event.turns} 工具调用=${event.toolCalls}`);
        break;
    }
  });

  const sessionId = "feishu-enhanced-example";
  console.log(`\n7. 使用会话: ${sessionId}`);

  // 显示可用工具
  console.log("\n=== 可用工具 ===");
  const channelToolManager = agent.getChannelToolManager();
  const toolStats = channelToolManager.getToolStats();
  console.log(`渠道工具总数: ${toolStats.total}`);
  console.log(`按渠道分布:`);
  for (const [channel, count] of Object.entries(toolStats.byChannel)) {
    console.log(`  ${channel}: ${count} 个工具`);
  }
  console.log(`启用状态: 渠道管理器=${toolStats.enabled.channelManager ? '✅' : '❌'}, 飞书=${toolStats.enabled.feishu ? '✅' : '❌'}`);

  // 示例对话
  console.log("\n=== 示例对话 ===");

  // 示例 1: 查看渠道状态
  console.log("\n--- 示例 1: 查看渠道状态 ---");
  const result1 = await agent.run(sessionId, "查看当前所有渠道的状态信息");
  console.log(`\n[完成: ${result1.turns} 轮对话, ${result1.toolCalls} 次工具调用]`);

  // 示例 2: 测试飞书文档功能
  console.log("\n--- 示例 2: 测试飞书文档功能 ---");
  const result2 = await agent.run(sessionId, `
    我需要了解飞书文档功能：
    1. 列出可用的飞书文档工具
    2. 说明如何搜索飞书文档
    3. 解释如何读取飞书文档内容
  `);
  console.log(`\n[完成: ${result2.turns} 轮对话, ${result2.toolCalls} 次工具调用]`);

  // 示例 3: 测试飞书知识库
  console.log("\n--- 示例 3: 测试飞书知识库功能 ---");
  const result3 = await agent.run(sessionId, `
    了解飞书知识库工具：
    1. 飞书知识库工具有哪些功能？
    2. 如何搜索知识库内容？
    3. 如何读取知识库节点？
  `);
  console.log(`\n[完成: ${result3.turns} 轮对话, ${result3.toolCalls} 次工具调用]`);

  // 示例 4: 发送消息到飞书（如果配置了会话ID）
  console.log("\n--- 示例 4: 发送消息到飞书 ---");
  const conversationId = process.env.FEISHU_TEST_CONVERSATION_ID;
  if (conversationId) {
    console.log(`使用会话ID: ${conversationId}`);
    const result4 = await agent.run(sessionId, `
      请发送一条测试消息到飞书：
      1. 使用 channel_send 工具
      2. 渠道类型：feishu
      3. 渠道ID：feishu-main
      4. 会话ID：${conversationId}
      5. 内容："这是增强版飞书渠道的测试消息，发送时间：${new Date().toLocaleString()}"
      6. 消息类型：text
    `);
    console.log(`\n[完成: ${result4.turns} 轮对话, ${result4.toolCalls} 次工具调用]`);
  } else {
    console.log("跳过：请设置 FEISHU_TEST_CONVERSATION_ID 环境变量来测试消息发送");
  }

  // 示例 5: 模拟飞书消息处理
  console.log("\n--- 示例 5: 模拟飞书消息处理 ---");
  console.log("模拟飞书 webhook 事件处理...");

  const mockFeishuEvent = {
    event: {
      type: "message",
      message: {
        message_id: "mock_msg_" + Date.now(),
        chat_id: "oc_mock_chat_id",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "你好，增强版 Agent！请帮我查看今天的待办事项。" }),
        create_time: Math.floor(Date.now() / 1000).toString(),
        sender: {
          sender_id: {
            user_id: "u_mock_user",
            open_id: "ou_mock_openid",
          },
        },
      },
    },
  };

  try {
    await feishuChannel.handleWebhookEvent(mockFeishuEvent);
    console.log("✅ 模拟消息处理完成");
  } catch (error) {
    console.error("❌ 模拟消息处理失败:", error);
  }

  // 示例 6: 渠道工具说明
  console.log("\n--- 示例 6: 获取渠道工具说明 ---");
  const result6 = await agent.run(sessionId, "请为我列出所有可用的渠道工具及其使用说明");
  console.log(`\n[完成: ${result6.turns} 轮对话, ${result6.toolCalls} 次工具调用]`);

  // 显示最终统计
  console.log("\n=== 最终统计 ===");
  const finalStats = agent.getChannelToolStats();
  console.log(`渠道工具总数: ${finalStats.total}`);
  console.log("按渠道分布:");
  for (const [channel, count] of Object.entries(finalStats.byChannel)) {
    console.log(`  ${channel}: ${count} 个工具`);
  }

  // 清理资源
  console.log("\n=== 清理资源 ===");
  unsubscribe();
  await feishuChannel.disconnect();
  await agent.reset(sessionId);

  console.log("\n✅ 增强版飞书渠道示例完成");
}

// 运行示例
main().catch((error) => {
  console.error("示例运行失败:", error);
  process.exit(1);
});
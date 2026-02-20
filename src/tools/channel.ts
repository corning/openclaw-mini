/**
 * 渠道工具
 * 用于发送和接收渠道消息
 */

import type { Tool, ToolContext } from "./types.js";
import type { ChannelManager, ChannelMessage } from "../channels/index.js";

/**
 * 发送消息到渠道工具
 */
export const channelSendTool: Tool<{
  channel_type: string;
  channel_id: string;
  conversation_id: string;
  content: string;
  message_type?: string;
}> = {
  name: "channel_send",
  description: "发送消息到指定渠道",
  inputSchema: {
    type: "object",
    properties: {
      channel_type: {
        type: "string",
        description: "渠道类型，如：feishu、webhook、example",
      },
      channel_id: {
        type: "string",
        description: "渠道ID",
      },
      conversation_id: {
        type: "string",
        description: "会话ID或用户ID",
      },
      content: {
        type: "string",
        description: "消息内容",
      },
      message_type: {
        type: "string",
        description: "消息类型，默认为text",
        enum: ["text", "markdown", "html"],
        default: "text",
      },
    },
    required: ["channel_type", "channel_id", "conversation_id", "content"],
  },
  execute: async (args, context) => {
    const { channelManager } = context.metadata as { channelManager?: ChannelManager };
    
    if (!channelManager) {
      throw new Error("Channel manager not available in context");
    }

    const message: ChannelMessage = {
      id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      channelType: args.channel_type,
      channelId: args.channel_id,
      userId: "agent", // 发送者ID
      conversationId: args.conversation_id,
      content: args.content,
      messageType: args.message_type || "text",
      timestamp: new Date(),
      metadata: {
        source: "agent",
        tool: "channel_send",
      },
    };

    try {
      await channelManager.sendMessage(
        args.channel_type,
        args.channel_id,
        message
      );

      return `消息已发送到渠道 ${args.channel_type}:${args.channel_id}\n` +
             `会话: ${args.conversation_id}\n` +
             `内容: ${args.content.substring(0, 100)}${args.content.length > 100 ? '...' : ''}`;
    } catch (error) {
      return `发送消息失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * 获取渠道状态工具
 */
export const channelStatusTool: Tool<{}> = {
  name: "channel_status",
  description: "获取所有渠道的状态信息",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async (args, context) => {
    const { channelManager } = context.metadata as { channelManager?: ChannelManager };
    
    if (!channelManager) {
      throw new Error("Channel manager not available in context");
    }

    const status = channelManager.getStatus();
    
    let result = `渠道状态总览:\n`;
    result += `总渠道数: ${status.totalChannels}\n`;
    result += `已连接渠道: ${status.connectedChannels}\n\n`;
    
    result += `渠道详情:\n`;
    for (const channel of status.channels) {
      result += `- ${channel.type}:${channel.id}\n`;
      result += `  状态: ${channel.connected ? '✅ 已连接' : '❌ 未连接'}\n`;
      result += `  信息: ${JSON.stringify(channel.info, null, 2).replace(/\n/g, '\n  ')}\n\n`;
    }

    return result;
  },
};

/**
 * 广播消息工具
 */
export const channelBroadcastTool: Tool<{
  content: string;
  message_type?: string;
}> = {
  name: "channel_broadcast",
  description: "广播消息到所有已连接的渠道",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "广播消息内容",
      },
      message_type: {
        type: "string",
        description: "消息类型，默认为text",
        enum: ["text", "markdown", "html"],
        default: "text",
      },
    },
    required: ["content"],
  },
  execute: async (args, context) => {
    const { channelManager } = context.metadata as { channelManager?: ChannelManager };
    
    if (!channelManager) {
      throw new Error("Channel manager not available in context");
    }

    const message: ChannelMessage = {
      id: `broadcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      channelType: "broadcast",
      channelId: "all",
      userId: "agent",
      conversationId: "broadcast",
      content: args.content,
      messageType: args.message_type || "text",
      timestamp: new Date(),
      metadata: {
        source: "agent",
        tool: "channel_broadcast",
        broadcast: true,
      },
    };

    try {
      await channelManager.broadcastMessage(message);
      
      const status = channelManager.getStatus();
      return `广播消息已发送到 ${status.connectedChannels} 个已连接渠道\n` +
             `内容: ${args.content.substring(0, 100)}${args.content.length > 100 ? '...' : ''}`;
    } catch (error) {
      return `广播消息失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * 所有渠道工具
 */
export const channelTools = [
  channelSendTool,
  channelStatusTool,
  channelBroadcastTool,
];
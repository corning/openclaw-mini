/**
 * 渠道工具管理器
 * 动态管理渠道相关工具
 */

import type { Tool } from "./types.js";
import type { ChannelManager } from "../channels/manager.js";
import type { FeishuChannel } from "../channels/feishu.js";
import { getFeishuTools, type FeishuToolConfig } from "../channels/feishu-tools.js";
import { channelTools } from "./channel.js";

export interface ChannelToolManagerConfig {
  /** 渠道管理器 */
  channelManager?: ChannelManager;
  /** 渠道列表 */
  channels?: {
    feishu?: FeishuChannel;
    // 可以添加其他渠道类型
  };
  /** 飞书工具配置 */
  feishuTools?: FeishuToolConfig;
}

/**
 * 渠道工具管理器
 */
export class ChannelToolManager {
  private channelManager?: ChannelManager;
  private channels: Map<string, any> = new Map();
  private feishuToolsConfig: FeishuToolConfig;

  constructor(config: ChannelToolManagerConfig = {}) {
    if (config.channelManager) {
      this.channelManager = config.channelManager;
    }

    if (config.channels?.feishu) {
      this.channels.set('feishu', config.channels.feishu);
    }

    this.feishuToolsConfig = config.feishuTools || {};
  }

  /**
   * 设置渠道管理器
   */
  setChannelManager(channelManager: ChannelManager): void {
    this.channelManager = channelManager;
  }

  /**
   * 添加渠道
   */
  addChannel(type: string, channel: any): void {
    this.channels.set(type, channel);
  }

  /**
   * 获取渠道
   */
  getChannel(type: string): any | undefined {
    return this.channels.get(type);
  }

  /**
   * 获取所有工具
   */
  getAllTools(): Tool[] {
    const tools: Tool[] = [];

    // 基础渠道工具（发送、状态、广播）
    if (this.channelManager) {
      // 为渠道工具注入上下文
      const enhancedChannelTools = channelTools.map(tool => ({
        ...tool,
        execute: async (args: any, context: any) => {
          const enhancedContext = {
            ...context,
            metadata: {
              ...context.metadata,
              channelManager: this.channelManager,
            },
          };
          return tool.execute(args, enhancedContext);
        },
      }));
      tools.push(...enhancedChannelTools);
    }

    // 飞书专用工具
    const feishuChannel = this.channels.get('feishu');
    if (feishuChannel) {
      const feishuTools = getFeishuTools(this.feishuToolsConfig);
      const enhancedFeishuTools = feishuTools.map(tool => ({
        ...tool,
        execute: async (args: any, context: any) => {
          const enhancedContext = {
            ...context,
            metadata: {
              ...context.metadata,
              feishuChannel,
              channelManager: this.channelManager,
            },
          };
          return tool.execute(args, enhancedContext);
        },
      }));
      tools.push(...enhancedFeishuTools);
    }

    return tools;
  }

  /**
   * 获取工具列表（按渠道分组）
   */
  getToolsByChannel(): Record<string, Tool[]> {
    const result: Record<string, Tool[]> = {};

    // 基础渠道工具
    if (this.channelManager) {
      result.base = channelTools;
    }

    // 飞书工具
    const feishuChannel = this.channels.get('feishu');
    if (feishuChannel) {
      result.feishu = getFeishuTools(this.feishuToolsConfig);
    }

    return result;
  }

  /**
   * 获取工具统计
   */
  getToolStats(): {
    total: number;
    byChannel: Record<string, number>;
    enabled: {
      channelManager: boolean;
      feishu: boolean;
      webhook: boolean;
    };
  } {
    const byChannel = this.getToolsByChannel();
    const stats = {
      total: 0,
      byChannel: {} as Record<string, number>,
      enabled: {
        channelManager: !!this.channelManager,
        feishu: this.channels.has('feishu'),
        webhook: this.channels.has('webhook'),
      },
    };

    for (const [channel, tools] of Object.entries(byChannel)) {
      const count = tools.length;
      stats.byChannel[channel] = count;
      stats.total += count;
    }

    return stats;
  }

  /**
   * 更新飞书工具配置
   */
  updateFeishuToolsConfig(config: Partial<FeishuToolConfig>): void {
    this.feishuToolsConfig = { ...this.feishuToolsConfig, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): ChannelToolManagerConfig {
    const feishuChannel = this.channels.get('feishu');
    
    return {
      channelManager: this.channelManager,
      channels: feishuChannel ? { feishu: feishuChannel } : undefined,
      feishuTools: this.feishuToolsConfig,
    };
  }

  /**
   * 生成工具使用说明
   */
  generateToolDescriptions(): string {
    const byChannel = this.getToolsByChannel();
    let description = '可用渠道工具:\n\n';

    for (const [channel, tools] of Object.entries(byChannel)) {
      description += `=== ${channel.toUpperCase()} 渠道工具 (${tools.length} 个) ===\n`;
      
      for (const tool of tools) {
        description += `- ${tool.name}: ${tool.description}\n`;
        
        // 显示输入参数
        const schema = (tool as any).inputSchema;
        if (schema && schema.properties) {
          description += '  参数:\n';
          for (const [paramName, paramSchema] of Object.entries(schema.properties as Record<string, any>)) {
            const required = schema.required?.includes(paramName) ? ' [必需]' : '';
            description += `    - ${paramName}${required}: ${paramSchema.description || paramSchema.type}\n`;
          }
        }
        description += '\n';
      }
    }

    return description;
  }
}

/**
 * 创建默认的渠道工具管理器
 */
export function createDefaultChannelToolManager(config?: ChannelToolManagerConfig): ChannelToolManager {
  return new ChannelToolManager(config);
}
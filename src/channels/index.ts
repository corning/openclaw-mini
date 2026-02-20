/**
 * Channels 模块入口
 * 提供多渠道机器人接入能力
 */

export type { 
  Channel, 
  ChannelMessage, 
  ChannelResponse, 
  ChannelConfig, 
  ChannelEvent 
} from "./types.js";

export { ChannelManager } from "./manager.js";
export { FeishuChannel, type FeishuConfig } from "./feishu.js";
export { WebhookChannel, type WebhookConfig } from "./webhook.js";
export { ExampleChannel, type ExampleConfig } from "./example.js";

/**
 * 创建渠道管理器实例
 */
export function createChannelManager(): ChannelManager {
  return new ChannelManager();
}

/**
 * 根据配置创建渠道
 */
export function createChannelFromConfig(
  type: string,
  id: string,
  config: any
): Channel {
  switch (type.toLowerCase()) {
    case 'feishu':
      return new FeishuChannel(id, config);
    
    case 'webhook':
      return new WebhookChannel(id, config);
    
    case 'example':
      return new ExampleChannel(id, config);
    
    default:
      throw new Error(`Unknown channel type: ${type}`);
  }
}

/**
 * 从配置文件加载渠道
 */
export async function loadChannelsFromConfig(
  configs: Array<{
    type: string;
    id: string;
    config: any;
    enabled?: boolean;
  }>
): Promise<ChannelManager> {
  const manager = createChannelManager();
  
  for (const channelConfig of configs) {
    try {
      const channel = createChannelFromConfig(
        channelConfig.type,
        channelConfig.id,
        channelConfig.config
      );
      
      manager.registerChannel(channel);
      
      // 如果启用，自动连接
      if (channelConfig.enabled !== false) {
        await channel.initialize();
        await channel.connect();
      }
    } catch (error) {
      console.error(`Failed to load channel ${channelConfig.type}:${channelConfig.id}:`, error);
    }
  }
  
  return manager;
}
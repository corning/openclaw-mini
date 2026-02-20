/**
 * Channel Manager
 * 管理多个渠道的注册、连接和消息分发
 */

import type { Channel, ChannelConfig, ChannelMessage, ChannelEvent } from "./types.js";

export class ChannelManager {
  private channels: Map<string, Channel> = new Map();
  private messageCallbacks: Array<(message: ChannelMessage) => void> = [];
  private eventCallbacks: Array<(event: ChannelEvent) => void> = [];

  /**
   * 注册渠道
   */
  registerChannel(channel: Channel): void {
    const key = `${channel.type}:${channel.id}`;
    
    if (this.channels.has(key)) {
      throw new Error(`Channel ${key} already registered`);
    }

    // 监听渠道消息
    channel.onMessage((message) => {
      this.handleChannelMessage(message);
    });

    // 监听渠道事件
    channel.onEvent((event) => {
      this.handleChannelEvent(event);
    });

    this.channels.set(key, channel);
    console.log(`[ChannelManager] Registered channel: ${key}`);
  }

  /**
   * 注销渠道
   */
  unregisterChannel(type: string, id: string): void {
    const key = `${type}:${id}`;
    const channel = this.channels.get(key);
    
    if (channel) {
      channel.disconnect().catch(console.error);
      this.channels.delete(key);
      console.log(`[ChannelManager] Unregistered channel: ${key}`);
    }
  }

  /**
   * 获取渠道
   */
  getChannel(type: string, id: string): Channel | undefined {
    return this.channels.get(`${type}:${id}`);
  }

  /**
   * 获取所有渠道
   */
  getAllChannels(): Channel[] {
    return Array.from(this.channels.values());
  }

  /**
   * 获取启用的渠道
   */
  getEnabledChannels(): Channel[] {
    return this.getAllChannels().filter(channel => {
      // 这里可以根据渠道状态判断是否启用
      return channel.connected;
    });
  }

  /**
   * 初始化所有渠道
   */
  async initializeAll(): Promise<void> {
    const channels = this.getAllChannels();
    const promises = channels.map(channel => channel.initialize());
    await Promise.all(promises);
    console.log(`[ChannelManager] Initialized ${channels.length} channels`);
  }

  /**
   * 连接所有渠道
   */
  async connectAll(): Promise<void> {
    const channels = this.getAllChannels();
    const promises = channels.map(channel => channel.connect());
    await Promise.all(promises);
    console.log(`[ChannelManager] Connected ${channels.length} channels`);
  }

  /**
   * 断开所有渠道连接
   */
  async disconnectAll(): Promise<void> {
    const channels = this.getAllChannels();
    const promises = channels.map(channel => channel.disconnect());
    await Promise.all(promises);
    console.log(`[ChannelManager] Disconnected ${channels.length} channels`);
  }

  /**
   * 发送消息到指定渠道
   */
  async sendMessage(
    channelType: string,
    channelId: string,
    message: ChannelMessage
  ): Promise<void> {
    const channel = this.getChannel(channelType, channelId);
    if (!channel) {
      throw new Error(`Channel ${channelType}:${channelId} not found`);
    }

    if (!channel.connected) {
      throw new Error(`Channel ${channelType}:${channelId} is not connected`);
    }

    await channel.sendMessage(message);
  }

  /**
   * 广播消息到所有渠道
   */
  async broadcastMessage(message: ChannelMessage): Promise<void> {
    const channels = this.getEnabledChannels();
    const promises = channels.map(channel => 
      channel.sendMessage({
        ...message,
        channelType: channel.type,
        channelId: channel.id,
      }).catch(error => {
        console.error(`[ChannelManager] Failed to send message to ${channel.type}:${channel.id}:`, error);
      })
    );

    await Promise.all(promises);
  }

  /**
   * 监听消息
   */
  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * 监听事件
   */
  onEvent(callback: (event: ChannelEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * 处理渠道消息
   */
  private handleChannelMessage(message: ChannelMessage): void {
    // 调用所有注册的回调
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (error) {
        console.error('[ChannelManager] Error in message callback:', error);
      }
    }
  }

  /**
   * 处理渠道事件
   */
  private handleChannelEvent(event: ChannelEvent): void {
    // 调用所有注册的回调
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('[ChannelManager] Error in event callback:', error);
      }
    }
  }

  /**
   * 获取管理器状态
   */
  getStatus(): {
    totalChannels: number;
    connectedChannels: number;
    channels: Array<{
      type: string;
      id: string;
      connected: boolean;
      info: Record<string, any>;
    }>;
  } {
    const channels = this.getAllChannels();
    const connectedChannels = channels.filter(ch => ch.connected);
    
    return {
      totalChannels: channels.length,
      connectedChannels: connectedChannels.length,
      channels: channels.map(channel => ({
        type: channel.type,
        id: channel.id,
        connected: channel.connected,
        info: channel.getInfo(),
      })),
    };
  }
}
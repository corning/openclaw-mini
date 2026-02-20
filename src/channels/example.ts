/**
 * 示例渠道
 * 用于演示和测试
 */

import type { Channel, ChannelMessage, ChannelResponse, ChannelEvent } from "./types.js";

export interface ExampleConfig {
  /** 模拟延迟（毫秒） */
  delay?: number;
  /** 是否自动回复 */
  autoReply?: boolean;
  /** 自动回复内容 */
  autoReplyContent?: string;
}

export class ExampleChannel implements Channel {
  readonly type = "example";
  readonly id: string;
  private config: ExampleConfig;
  private connectedState = false;
  private messageCallbacks: Array<(message: ChannelMessage) => void> = [];
  private eventCallbacks: Array<(event: ChannelEvent) => void> = [];
  private interval?: NodeJS.Timeout;
  private messageCount = 0;

  constructor(id: string, config: ExampleConfig = {}) {
    this.id = id;
    this.config = {
      delay: config.delay || 1000,
      autoReply: config.autoReply || false,
      autoReplyContent: config.autoReplyContent || '这是自动回复消息',
    };
  }

  get connected(): boolean {
    return this.connectedState;
  }

  async initialize(): Promise<void> {
    console.log(`[ExampleChannel:${this.id}] Initializing...`);
    
    // 模拟初始化延迟
    await this.delay(500);
    
    console.log(`[ExampleChannel:${this.id}] Initialized`);
    this.emitEvent({ type: 'initialized', data: { id: this.id }, timestamp: new Date() });
  }

  async connect(): Promise<void> {
    if (this.connectedState) {
      return;
    }

    console.log(`[ExampleChannel:${this.id}] Connecting...`);
    
    try {
      // 模拟连接延迟
      await this.delay(this.config.delay || 1000);
      
      this.connectedState = true;
      
      // 启动模拟消息发送（如果启用了自动回复）
      if (this.config.autoReply) {
        this.startAutoReply();
      }
      
      console.log(`[ExampleChannel:${this.id}] Connected`);
      this.emitEvent({ type: 'connected', data: { id: this.id }, timestamp: new Date() });
    } catch (error) {
      console.error(`[ExampleChannel:${this.id}] Connection failed:`, error);
      this.emitEvent({ 
        type: 'error', 
        data: { error: error instanceof Error ? error.message : String(error) }, 
        timestamp: new Date() 
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connectedState) {
      return;
    }

    console.log(`[ExampleChannel:${this.id}] Disconnecting...`);
    
    // 停止自动回复
    this.stopAutoReply();
    
    // 模拟断开延迟
    await this.delay(500);
    
    this.connectedState = false;
    console.log(`[ExampleChannel:${this.id}] Disconnected`);
    this.emitEvent({ type: 'disconnected', data: { id: this.id }, timestamp: new Date() });
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelResponse> {
    if (!this.connectedState) {
      throw new Error('Channel is not connected');
    }

    console.log(`[ExampleChannel:${this.id}] Sending message:`, message.content.substring(0, 50) + '...');
    
    try {
      // 模拟发送延迟
      await this.delay(this.config.delay || 1000);
      
      // 生成模拟响应
      const response = {
        success: true,
        messageId: `example-${Date.now()}-${++this.messageCount}`,
        content: `已收到消息: ${message.content}`,
        metadata: {
          simulated: true,
          delay: this.config.delay,
          originalMessage: message.content.substring(0, 100),
        },
      };
      
      console.log(`[ExampleChannel:${this.id}] Message sent successfully`);
      
      // 如果启用了自动回复，模拟接收回复
      if (this.config.autoReply) {
        setTimeout(() => {
          this.simulateIncomingMessage();
        }, this.config.delay || 1000);
      }
      
      return response;
    } catch (error) {
      console.error(`[ExampleChannel:${this.id}] Failed to send message:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        content: message.content,
      };
    }
  }

  onMessage(callback: (message: ChannelMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onEvent(callback: (event: ChannelEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  getInfo(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      connected: this.connectedState,
      config: this.config,
      stats: {
        messageCount: this.messageCount,
        autoReplyEnabled: this.config.autoReply,
      },
    };
  }

  /**
   * 模拟接收消息
   */
  simulateIncomingMessage(content?: string): void {
    const message: ChannelMessage = {
      id: `example-incoming-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      channelType: this.type,
      channelId: this.id,
      userId: 'example-user',
      conversationId: 'example-conversation',
      content: content || this.config.autoReplyContent || '这是模拟的接收消息',
      messageType: 'text',
      timestamp: new Date(),
      metadata: {
        simulated: true,
        source: 'auto-reply',
      },
    };
    
    this.emitMessage(message);
    
    this.emitEvent({
      type: 'message_received',
      data: { message },
      timestamp: new Date(),
    });
  }

  /**
   * 启动自动回复
   */
  private startAutoReply(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
    
    // 每10秒发送一条模拟消息
    this.interval = setInterval(() => {
      if (this.connectedState) {
        this.simulateIncomingMessage();
      }
    }, 10000);
    
    console.log(`[ExampleChannel:${this.id}] Auto-reply started`);
  }

  /**
   * 停止自动回复
   */
  private stopAutoReply(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    
    console.log(`[ExampleChannel:${this.id}] Auto-reply stopped`);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 触发消息事件
   */
  private emitMessage(message: ChannelMessage): void {
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (error) {
        console.error(`[ExampleChannel:${this.id}] Error in message callback:`, error);
      }
    }
  }

  /**
   * 触发渠道事件
   */
  private emitEvent(event: ChannelEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error(`[ExampleChannel:${this.id}] Error in event callback:`, error);
      }
    }
  }
}
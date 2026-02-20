/**
 * Channel 基础接口
 * 用于接入不同渠道的机器人（飞书、钉钉、微信等）
 */

export interface ChannelMessage {
  /** 消息ID */
  id: string;
  /** 渠道类型 */
  channelType: string;
  /** 渠道ID */
  channelId: string;
  /** 用户ID */
  userId: string;
  /** 会话ID */
  conversationId: string;
  /** 消息内容 */
  content: string;
  /** 消息类型：text, image, file, etc. */
  messageType: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, any>;
}

export interface ChannelResponse {
  /** 是否成功 */
  success: boolean;
  /** 响应消息ID */
  messageId?: string;
  /** 错误信息 */
  error?: string;
  /** 响应内容 */
  content?: string;
  /** 元数据 */
  metadata?: Record<string, any>;
}

export interface ChannelConfig {
  /** 渠道类型 */
  type: string;
  /** 渠道ID */
  id: string;
  /** 配置项 */
  config: Record<string, any>;
  /** 是否启用 */
  enabled: boolean;
}

export interface ChannelEvent {
  /** 事件类型：message, error, connected, disconnected */
  type: string;
  /** 事件数据 */
  data: any;
  /** 时间戳 */
  timestamp: Date;
}

export interface Channel {
  /** 渠道类型 */
  readonly type: string;
  /** 渠道ID */
  readonly id: string;
  /** 是否已连接 */
  readonly connected: boolean;
  
  /** 初始化渠道 */
  initialize(): Promise<void>;
  
  /** 连接渠道 */
  connect(): Promise<void>;
  
  /** 断开连接 */
  disconnect(): Promise<void>;
  
  /** 发送消息 */
  sendMessage(message: ChannelMessage): Promise<ChannelResponse>;
  
  /** 接收消息（事件监听） */
  onMessage(callback: (message: ChannelMessage) => void): void;
  
  /** 监听事件 */
  onEvent(callback: (event: ChannelEvent) => void): void;
  
  /** 获取渠道信息 */
  getInfo(): Record<string, any>;
}
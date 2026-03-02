/**
 * 飞书渠道实现 (增强版)
 * 基于飞书开放平台机器人API，支持多账户、Webhook、WebSocket连接
 * 参考 openclaw/extensions/feishu 实现
 */

import type { Channel, ChannelMessage, ChannelResponse, ChannelEvent } from "./types.js";

export type FeishuDomain = "feishu" | "lark" | string;

export interface FeishuAccountConfig {
  /** 账户ID */
  accountId: string;
  /** 账户名称 */
  name?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 飞书应用 App ID */
  appId: string;
  /** 飞书应用 App Secret */
  appSecret: string;
  /** 加密密钥（可选，用于验证请求） */
  encryptKey?: string;
  /** 验证令牌（可选） */
  verificationToken?: string;
  /** 域名：feishu 或 lark */
  domain?: FeishuDomain;
  /** 连接模式：webhook 或 websocket */
  connectionMode?: "webhook" | "websocket";
  /** Webhook 路径 */
  webhookPath?: string;
  /** Webhook 主机 */
  webhookHost?: string;
  /** Webhook 端口 */
  webhookPort?: number;
  /** 是否需要提及机器人 */
  requireMention?: boolean;
  /** 私聊策略 */
  dmPolicy?: "open" | "pairing" | "allowlist";
  /** 群聊策略 */
  groupPolicy?: "open" | "allowlist" | "disabled";
}

export interface FeishuConfig {
  /** 默认账户配置 */
  defaultAccount?: FeishuAccountConfig;
  /** 多账户配置 */
  accounts?: Record<string, FeishuAccountConfig>;
  /** 是否启用所有账户 */
  enabled?: boolean;
  /** 全局配置 */
  domain?: FeishuDomain;
  connectionMode?: "webhook" | "websocket";
  requireMention?: boolean;
  dmPolicy?: "open" | "pairing" | "allowlist";
  groupPolicy?: "open" | "allowlist" | "disabled";
}

// 飞书SDK
import * as Lark from "@larksuiteoapi/node-sdk";

// 客户端缓存
const clientCache = new Map<string, Lark.Client>();

export class FeishuChannel implements Channel {
  readonly type = "feishu";
  readonly id: string;
  private config: FeishuConfig;
  private connectedState = false;
  private messageCallbacks: Array<(message: ChannelMessage) => void> = [];
  private eventCallbacks: Array<(event: ChannelEvent) => void> = [];
  private client?: Lark.Client;
  private wsClient?: Lark.WSClient;
  private eventDispatcher?: Lark.EventDispatcher;
  private currentAccount?: FeishuAccountConfig;

  constructor(id: string, config: FeishuConfig) {
    this.id = id;
    this.config = config;
  }

  get connected(): boolean {
    return this.connectedState;
  }

  /**
   * 获取当前活动的账户配置
   */
  private getActiveAccount(): FeishuAccountConfig {
    if (this.currentAccount) {
      return this.currentAccount;
    }

    // 优先使用默认账户
    if (this.config.defaultAccount) {
      this.currentAccount = this.config.defaultAccount;
      return this.currentAccount;
    }

    // 如果没有默认账户，从accounts中获取第一个启用的账户
    if (this.config.accounts) {
      const enabledAccounts = Object.values(this.config.accounts).filter(account => account.enabled);
      if (enabledAccounts.length > 0) {
        this.currentAccount = enabledAccounts[0];
        return this.currentAccount;
      }
    }

    throw new Error('No active Feishu account configured');
  }

  /**
   * 切换账户
   */
  async switchAccount(accountId: string): Promise<void> {
    if (!this.config.accounts || !this.config.accounts[accountId]) {
      throw new Error(`Feishu account ${accountId} not found`);
    }

    const account = this.config.accounts[accountId];
    if (!account.enabled) {
      throw new Error(`Feishu account ${accountId} is not enabled`);
    }

    // 如果已连接，先断开
    if (this.connectedState) {
      await this.disconnect();
    }

    this.currentAccount = account;
    console.log(`[FeishuChannel:${this.id}] Switched to account: ${accountId}`);
  }

  /**
   * 创建飞书客户端
   */
  private createFeishuClient(account: FeishuAccountConfig): Lark.Client {
    const cacheKey = `${this.id}:${account.accountId}`;

    // 检查缓存
    const cached = clientCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 创建新客户端
    const domain = account.domain || this.config.domain || 'feishu';
    let resolvedDomain: string | Lark.Domain;

    if (domain === 'lark') {
      resolvedDomain = Lark.Domain.Lark;
    } else if (domain === 'feishu') {
      resolvedDomain = Lark.Domain.Feishu;
    } else {
      resolvedDomain = domain.replace(/\/+$/, '');
    }

    const client = new Lark.Client({
      appId: account.appId,
      appSecret: account.appSecret,
      appType: Lark.AppType.SelfBuild,
      domain: resolvedDomain,
      loggerLevel: Lark.LoggerLevel.info,
    });

    // 缓存客户端
    clientCache.set(cacheKey, client);
    return client;
  }

  async initialize(): Promise<void> {
    console.log(`[FeishuChannel:${this.id}] Initializing...`);

    // 获取活动账户
    const account = this.getActiveAccount();

    // 验证配置
    if (!account.appId || !account.appSecret) {
      throw new Error('Feishu appId and appSecret are required');
    }

    // 创建客户端
    this.client = this.createFeishuClient(account);

    // 如果是websocket模式，准备创建websocket客户端
    const connectionMode = account.connectionMode || this.config.connectionMode || 'webhook';
    if (connectionMode === 'websocket') {
      this.wsClient = new Lark.WSClient({
        appId: account.appId,
        appSecret: account.appSecret,
        domain: account.domain === 'lark' ? Lark.Domain.Lark : Lark.Domain.Feishu,
        loggerLevel: Lark.LoggerLevel.info,
      });
    }

    // 创建事件分发器
    if (account.encryptKey || account.verificationToken) {
      this.eventDispatcher = new Lark.EventDispatcher({
        encryptKey: account.encryptKey,
        verificationToken: account.verificationToken,
      });
    }

    console.log(`[FeishuChannel:${this.id}] Initialized with account: ${account.accountId}`);
    this.emitEvent({ type: 'initialized', data: { id: this.id, accountId: account.accountId }, timestamp: new Date() });
  }

  async connect(): Promise<void> {
    if (this.connectedState) {
      return;
    }

    console.log(`[FeishuChannel:${this.id}] Connecting...`);

    try {
      const account = this.getActiveAccount();
      const connectionMode = account.connectionMode || this.config.connectionMode || 'webhook';

      if (connectionMode === 'websocket' && this.wsClient) {
        // WebSocket连接
        await new Promise<void>((resolve, reject) => {
          if (!this.wsClient) {
            reject(new Error('WebSocket client not initialized'));
            return;
          }

          this.wsClient.start();

          // 监听事件
          this.wsClient.on('ready', () => {
            console.log(`[FeishuChannel:${this.id}] WebSocket connected`);
            this.connectedState = true;
            this.emitEvent({ type: 'connected', data: { id: this.id, mode: 'websocket' }, timestamp: new Date() });
            resolve();
          });

          this.wsClient.on('error', (error) => {
            console.error(`[FeishuChannel:${this.id}] WebSocket error:`, error);
            reject(error);
          });

          this.wsClient.on('message', async (data: any) => {
            await this.handleFeishuEvent(data);
          });
        });
      } else {
        // Webhook模式，只需验证令牌有效性
        await this.ensureValidToken();
        this.connectedState = true;
        console.log(`[FeishuChannel:${this.id}] Connected in webhook mode`);
        this.emitEvent({ type: 'connected', data: { id: this.id, mode: 'webhook' }, timestamp: new Date() });
      }
    } catch (error) {
      console.error(`[FeishuChannel:${this.id}] Connection failed:`, error);
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

    console.log(`[FeishuChannel:${this.id}] Disconnecting...`);

    // 关闭WebSocket连接
    if (this.wsClient) {
      this.wsClient.close();
    }

    this.connectedState = false;

    console.log(`[FeishuChannel:${this.id}] Disconnected`);
    this.emitEvent({ type: 'disconnected', data: { id: this.id }, timestamp: new Date() });
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelResponse> {
    if (!this.connectedState) {
      throw new Error('Channel is not connected');
    }

    try {
      await this.ensureValidToken();

      // 根据消息类型发送到飞书
      const response = await this.sendToFeishu(message);

      return {
        success: true,
        messageId: response.message_id,
        content: message.content,
        metadata: response,
      };
    } catch (error) {
      console.error(`[FeishuChannel:${this.id}] Failed to send message:`, error);

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

  /**
   * 处理飞书webhook事件
   */
  async handleWebhookEvent(event: any): Promise<void> {
    try {
      const account = this.getActiveAccount();

      // 如果有事件分发器，使用它验证和解析事件
      if (this.eventDispatcher) {
        const verified = this.eventDispatcher.verifySignature(event);
        if (!verified) {
          console.warn(`[FeishuChannel:${this.id}] Invalid signature`);
          return;
        }
      }

      // 解析飞书事件
      const message = await this.parseFeishuEvent(event);
      if (message) {
        this.emitMessage(message);
      }

      this.emitEvent({
        type: 'webhook_received',
        data: event,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`[FeishuChannel:${this.id}] Error handling webhook:`, error);
      this.emitEvent({
        type: 'error',
        data: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date(),
      });
    }
  }

  getInfo(): Record<string, any> {
    const account = this.getActiveAccount();
    const connectionMode = account.connectionMode || this.config.connectionMode || 'webhook';

    return {
      type: this.type,
      id: this.id,
      connected: this.connectedState,
      accountId: account.accountId,
      connectionMode,
      config: {
        appId: account.appId,
        domain: account.domain,
        requireMention: account.requireMention,
        hasEncryptKey: !!account.encryptKey,
        hasVerificationToken: !!account.verificationToken,
      },
    };
  }

  /**
   * 获取账户列表
   */
  getAccounts(): FeishuAccountConfig[] {
    const accounts: FeishuAccountConfig[] = [];

    if (this.config.defaultAccount) {
      accounts.push(this.config.defaultAccount);
    }

    if (this.config.accounts) {
      accounts.push(...Object.values(this.config.accounts));
    }

    return accounts;
  }

  /**
   * 确保访问令牌有效
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    // 飞书SDK会自动处理令牌刷新
    // 这里只需确保客户端已初始化
    return;
  }

  /**
   * 发送消息到飞书
   */
  private async sendToFeishu(message: ChannelMessage): Promise<any> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    const account = this.getActiveAccount();
    const receiveId = message.conversationId || message.userId;
    const msgType = message.messageType === 'markdown' ? 'interactive' : 'text';

    // 构建消息内容
    let content: string;
    if (msgType === 'interactive') {
      // 卡片消息
      content = JSON.stringify({
        config: { wide_screen_mode: true },
        header: {
          title: {
            tag: "plain_text",
            content: "Agent Message"
          }
        },
        elements: [
          {
            tag: "markdown",
            content: message.content
          }
        ]
      });
    } else {
      // 文本消息
      content = JSON.stringify({ text: message.content });
    }

    // 发送消息
    const result = await this.client.im.message.create({
      params: { receive_id_type: this.guessIdType(receiveId) },
      data: {
        receive_id: receiveId,
        msg_type: msgType,
        content: content,
      },
    });

    if (result.code !== 0) {
      throw new Error(`Feishu API error: ${result.msg}`);
    }

    return result.data;
  }

  /**
   * 猜测ID类型
   */
  private guessIdType(id: string): "open_id" | "user_id" | "chat_id" | "union_id" {
    if (id.startsWith('ou_')) {
      return 'open_id';
    } else if (id.startsWith('u_')) {
      return 'user_id';
    } else if (id.startsWith('oc_')) {
      return 'chat_id';
    } else {
      // 默认尝试open_id
      return 'open_id';
    }
  }

  /**
   * 处理飞书事件
   */
  private async handleFeishuEvent(data: any): Promise<void> {
    try {
      const message = await this.parseFeishuEvent(data);
      if (message) {
        this.emitMessage(message);
      }
    } catch (error) {
      console.error(`[FeishuChannel:${this.id}] Error handling Feishu event:`, error);
    }
  }

  /**
   * 解析飞书事件为ChannelMessage
   */
  private async parseFeishuEvent(event: any): Promise<ChannelMessage | null> {
    // 飞书事件结构参考：https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-concepts
    if (!event || !event.event) {
      return null;
    }

    const feishuEvent = event.event;

    // 处理消息事件
    if (feishuEvent.type === 'message' && feishuEvent.message) {
      const message = feishuEvent.message;
      const account = this.getActiveAccount();

      // 提取消息内容
      let content = '';
      if (message.message_type === 'text') {
        const textContent = JSON.parse(message.content || '{}');
        content = textContent.text || '';
      } else if (message.message_type === 'post') {
        const postContent = JSON.parse(message.content || '{}');
        // 简化处理富文本消息
        content = '[富文本消息]';
      } else if (message.message_type === 'image') {
        content = '[图片消息]';
      } else {
        content = `[${message.message_type}消息]`;
      }

      // 检查是否需要提及机器人
      const requireMention = account.requireMention || this.config.requireMention;
      let mentionedBot = false;

      if (requireMention && message.mentions) {
        // 检查是否提及了机器人
        mentionedBot = message.mentions.some((mention: any) =>
          mention.key === `@_user_${account.appId}` || mention.name === 'OpenClaw'
        );

        // 如果要求提及但未提及，忽略消息
        if (!mentionedBot && message.chat_type !== 'p2p') {
          return null;
        }
      }

      return {
        id: message.message_id,
        channelType: this.type,
        channelId: this.id,
        userId: message.sender?.sender_id?.user_id || message.sender?.sender_id?.open_id || 'unknown',
        conversationId: message.chat_id || message.open_chat_id || 'unknown',
        content,
        messageType: this.extractMessageType(message),
        timestamp: new Date(parseInt(message.create_time) * 1000),
        metadata: {
          event,
          message_type: message.message_type,
          chat_type: message.chat_type,
          mentioned_bot: mentionedBot,
          account_id: account.accountId,
        },
      };
    }

    return null;
  }

  /**
   * 提取消息类型
   */
  private extractMessageType(message: any): string {
    if (!message.message_type) {
      return 'text';
    }

    switch (message.message_type) {
      case 'text':
        return 'text';
      case 'post':
        return 'markdown';
      case 'image':
        return 'image';
      case 'file':
        return 'file';
      case 'audio':
        return 'audio';
      case 'media':
        return 'media';
      case 'interactive':
        return 'interactive';
      default:
        return 'text';
    }
  }

  /**
   * 触发消息事件
   */
  private emitMessage(message: ChannelMessage): void {
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (error) {
        console.error(`[FeishuChannel:${this.id}] Error in message callback:`, error);
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
        console.error(`[FeishuChannel:${this.id}] Error in event callback:`, error);
      }
    }
  }
}
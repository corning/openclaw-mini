/**
 * Webhook 渠道
 * 通用的 HTTP webhook 渠道，可以接收来自任何系统的 HTTP 请求
 */

import type { Channel, ChannelMessage, ChannelResponse, ChannelEvent } from "./types.js";
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

export interface WebhookConfig {
  /** 监听端口 */
  port: number;
  /** 监听地址 */
  host?: string;
  /** Webhook 路径 */
  path?: string;
  /** 验证令牌（可选） */
  token?: string;
  /** 是否启用 HTTPS */
  ssl?: {
    key: string;
    cert: string;
  };
}

export class WebhookChannel implements Channel {
  readonly type = "webhook";
  readonly id: string;
  private config: WebhookConfig;
  private connectedState = false;
  private messageCallbacks: Array<(message: ChannelMessage) => void> = [];
  private eventCallbacks: Array<(event: ChannelEvent) => void> = [];
  private server?: any;

  constructor(id: string, config: WebhookConfig) {
    this.id = id;
    this.config = {
      port: config.port,
      host: config.host || '0.0.0.0',
      path: config.path || '/webhook',
      token: config.token,
      ssl: config.ssl,
    };
  }

  get connected(): boolean {
    return this.connectedState;
  }

  async initialize(): Promise<void> {
    console.log(`[WebhookChannel:${this.id}] Initializing...`);
    
    // 验证配置
    if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
      throw new Error('Invalid port number');
    }

    console.log(`[WebhookChannel:${this.id}] Initialized`);
    this.emitEvent({ type: 'initialized', data: { id: this.id }, timestamp: new Date() });
  }

  async connect(): Promise<void> {
    if (this.connectedState) {
      return;
    }

    console.log(`[WebhookChannel:${this.id}] Starting server on ${this.config.host}:${this.config.port}...`);
    
    try {
      await this.startServer();
      
      this.connectedState = true;
      console.log(`[WebhookChannel:${this.id}] Server started`);
      this.emitEvent({ type: 'connected', data: { id: this.id }, timestamp: new Date() });
    } catch (error) {
      console.error(`[WebhookChannel:${this.id}] Failed to start server:`, error);
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

    console.log(`[WebhookChannel:${this.id}] Stopping server...`);
    
    try {
      await this.stopServer();
      this.connectedState = false;
      console.log(`[WebhookChannel:${this.id}] Server stopped`);
      this.emitEvent({ type: 'disconnected', data: { id: this.id }, timestamp: new Date() });
    } catch (error) {
      console.error(`[WebhookChannel:${this.id}] Error stopping server:`, error);
      throw error;
    }
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelResponse> {
    // Webhook 渠道主要用于接收消息，发送功能有限
    // 这里可以实现向外部系统发送 webhook 的功能
    
    return {
      success: true,
      messageId: `webhook-${Date.now()}`,
      content: message.content,
      metadata: {
        note: 'Webhook channel is primarily for receiving messages',
      },
    };
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
      config: {
        host: this.config.host,
        port: this.config.port,
        path: this.config.path,
        hasToken: !!this.config.token,
        hasSSL: !!this.config.ssl,
      },
      server: this.server ? {
        listening: this.server.listening,
        address: this.server.address(),
      } : null,
    };
  }

  /**
   * 获取 webhook URL
   */
  getWebhookUrl(): string {
    const protocol = this.config.ssl ? 'https' : 'http';
    const host = this.config.host === '0.0.0.0' ? 'localhost' : this.config.host;
    return `${protocol}://${host}:${this.config.port}${this.config.path}`;
  }

  /**
   * 启动 HTTP 服务器
   */
  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const requestHandler = this.handleRequest.bind(this);
        
        if (this.config.ssl) {
          // 如果需要 HTTPS
          const https = require('node:https');
          const fs = require('node:fs');
          
          const options = {
            key: fs.readFileSync(this.config.ssl.key),
            cert: fs.readFileSync(this.config.ssl.cert),
          };
          
          this.server = https.createServer(options, requestHandler);
        } else {
          this.server = createServer(requestHandler);
        }

        this.server.on('error', (error: Error) => {
          console.error(`[WebhookChannel:${this.id}] Server error:`, error);
          this.emitEvent({
            type: 'error',
            data: { error: error.message },
            timestamp: new Date(),
          });
        });

        this.server.listen(this.config.port, this.config.host, () => {
          console.log(`[WebhookChannel:${this.id}] Listening on ${this.getWebhookUrl()}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 停止服务器
   */
  private async stopServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          this.server = undefined;
          resolve();
        }
      });
    });
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    
    // 只处理配置的路径
    if (url.pathname !== this.config.path) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    // 验证令牌（如果配置了）
    if (this.config.token) {
      const token = req.headers['authorization']?.replace('Bearer ', '') || 
                    url.searchParams.get('token');
      
      if (token !== this.config.token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    // 只处理 POST 请求
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    try {
      // 读取请求体
      const body = await this.readRequestBody(req);
      const data = JSON.parse(body);

      // 处理 webhook 事件
      await this.handleWebhookData(data, req.headers);

      // 返回成功响应
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error(`[WebhookChannel:${this.id}] Error handling request:`, error);
      
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Bad Request',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  /**
   * 读取请求体
   */
  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }

  /**
   * 处理 webhook 数据
   */
  private async handleWebhookData(data: any, headers: any): Promise<void> {
    // 创建 ChannelMessage
    const message: ChannelMessage = {
      id: data.id || `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      channelType: this.type,
      channelId: this.id,
      userId: data.userId || data.user?.id || data.sender?.id || 'unknown',
      conversationId: data.conversationId || data.chatId || data.roomId || 'unknown',
      content: this.extractContent(data),
      messageType: data.messageType || this.detectMessageType(data),
      timestamp: new Date(data.timestamp || Date.now()),
      metadata: {
        data,
        headers,
        source: data.source || 'webhook',
      },
    };

    // 触发消息事件
    this.emitMessage(message);

    // 触发 webhook 事件
    this.emitEvent({
      type: 'webhook_received',
      data: {
        message,
        rawData: data,
        headers,
      },
      timestamp: new Date(),
    });
  }

  /**
   * 提取内容
   */
  private extractContent(data: any): string {
    if (typeof data.content === 'string') {
      return data.content;
    }
    
    if (data.text) {
      return data.text;
    }
    
    if (data.message) {
      return typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
    }
    
    return JSON.stringify(data);
  }

  /**
   * 检测消息类型
   */
  private detectMessageType(data: any): string {
    if (data.messageType) {
      return data.messageType;
    }
    
    if (data.type) {
      return data.type;
    }
    
    if (data.image || data.imageUrl) {
      return 'image';
    }
    
    if (data.file || data.fileUrl) {
      return 'file';
    }
    
    if (data.audio || data.audioUrl) {
      return 'audio';
    }
    
    return 'text';
  }

  /**
   * 触发消息事件
   */
  private emitMessage(message: ChannelMessage): void {
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (error) {
        console.error(`[WebhookChannel:${this.id}] Error in message callback:`, error);
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
        console.error(`[WebhookChannel:${this.id}] Error in event callback:`, error);
      }
    }
  }
}
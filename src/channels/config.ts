/**
 * 渠道配置管理器
 * 用于加载和管理渠道配置
 */

import type { FeishuConfig, FeishuAccountConfig } from "./feishu.js";

export interface ChannelManagerConfig {
  /** 是否启用渠道管理器 */
  enabled?: boolean;
  /** 渠道配置 */
  channels?: {
    feishu?: FeishuConfig;
    webhook?: Record<string, any>;
    example?: Record<string, any>;
  };
}

/**
 * 加载渠道配置
 */
export function loadChannelConfig(): ChannelManagerConfig {
  try {
    // 从环境变量加载配置
    const config: ChannelManagerConfig = {
      enabled: process.env.CHANNELS_ENABLED === 'true',
      channels: {},
    };

    // 加载飞书配置
    const feishuConfig = loadFeishuConfig();
    if (feishuConfig) {
      config.channels!.feishu = feishuConfig;
    }

    // 加载其他渠道配置...

    return config;
  } catch (error) {
    console.error('Error loading channel config:', error);
    return { enabled: false };
  }
}

/**
 * 加载飞书配置
 */
function loadFeishuConfig(): FeishuConfig | null {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    return null;
  }

  const config: FeishuConfig = {
    enabled: process.env.FEISHU_ENABLED !== 'false',
    defaultAccount: {
      accountId: 'default',
      name: process.env.FEISHU_ACCOUNT_NAME || 'Default Feishu Account',
      enabled: process.env.FEISHU_ENABLED !== 'false',
      appId,
      appSecret,
      encryptKey: process.env.FEISHU_ENCRYPT_KEY,
      verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
      domain: process.env.FEISHU_DOMAIN as 'feishu' | 'lark' || 'feishu',
      connectionMode: process.env.FEISHU_CONNECTION_MODE as 'webhook' | 'websocket' || 'webhook',
      requireMention: process.env.FEISHU_REQUIRE_MENTION === 'true',
      dmPolicy: (process.env.FEISHU_DM_POLICY as 'open' | 'pairing' | 'allowlist') || 'open',
      groupPolicy: (process.env.FEISHU_GROUP_POLICY as 'open' | 'allowlist' | 'disabled') || 'open',
    },
  };

  // 加载多账户配置
  const multiAccounts = loadMultiFeishuAccounts();
  if (multiAccounts && Object.keys(multiAccounts).length > 0) {
    config.accounts = multiAccounts;
  }

  return config;
}

/**
 * 加载多账户飞书配置
 */
function loadMultiFeishuAccounts(): Record<string, FeishuAccountConfig> | null {
  const accountsStr = process.env.FEISHU_MULTI_ACCOUNTS;
  if (!accountsStr) {
    return null;
  }

  try {
    const accounts = JSON.parse(accountsStr);
    const result: Record<string, FeishuAccountConfig> = {};

    for (const [accountId, accountData] of Object.entries(accounts as Record<string, any>)) {
      result[accountId] = {
        accountId,
        name: accountData.name || accountId,
        enabled: accountData.enabled !== false,
        appId: accountData.appId,
        appSecret: accountData.appSecret,
        encryptKey: accountData.encryptKey,
        verificationToken: accountData.verificationToken,
        domain: accountData.domain,
        connectionMode: accountData.connectionMode,
        requireMention: accountData.requireMention,
        dmPolicy: accountData.dmPolicy,
        groupPolicy: accountData.groupPolicy,
      };
    }

    return result;
  } catch (error) {
    console.error('Error parsing FEISHU_MULTI_ACCOUNTS:', error);
    return null;
  }
}

/**
 * 创建渠道管理器实例
 */
export function createChannelsFromConfig(config: ChannelManagerConfig): any[] {
  const channels: any[] = [];

  // 创建飞书渠道
  if (config.channels?.feishu?.enabled) {
    const FeishuChannel = require('./feishu.js').FeishuChannel;
    const feishuChannel = new FeishuChannel('feishu-main', config.channels.feishu);
    channels.push(feishuChannel);
  }

  // 创建其他渠道...

  return channels;
}

/**
 * 验证配置
 */
export function validateChannelConfig(config: ChannelManagerConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.enabled) {
    return { valid: true, errors: [] };
  }

  // 验证飞书配置
  if (config.channels?.feishu?.enabled) {
    const feishuErrors = validateFeishuConfig(config.channels.feishu);
    errors.push(...feishuErrors);
  }

  // 验证其他渠道...

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证飞书配置
 */
function validateFeishuConfig(config: FeishuConfig): string[] {
  const errors: string[] = [];

  // 检查默认账户
  if (config.defaultAccount) {
    if (!config.defaultAccount.appId) {
      errors.push('Feishu default account appId is required');
    }
    if (!config.defaultAccount.appSecret) {
      errors.push('Feishu default account appSecret is required');
    }
  }

  // 检查多账户
  if (config.accounts) {
    for (const [accountId, account] of Object.entries(config.accounts)) {
      if (account.enabled) {
        if (!account.appId) {
          errors.push(`Feishu account ${accountId}: appId is required`);
        }
        if (!account.appSecret) {
          errors.push(`Feishu account ${accountId}: appSecret is required`);
        }
      }
    }
  }

  return errors;
}

/**
 * 获取配置摘要
 */
export function getConfigSummary(config: ChannelManagerConfig): string {
  const summary: string[] = [];

  summary.push('Channel Manager Configuration:');
  summary.push(`- Enabled: ${config.enabled ? '✅' : '❌'}`);

  if (config.channels?.feishu?.enabled) {
    const feishuConfig = config.channels.feishu;
    summary.push('- Feishu:');
    summary.push(`  - Accounts: ${feishuConfig.defaultAccount ? 1 : 0} default + ${Object.keys(feishuConfig.accounts || {}).length} additional`);
    summary.push(`  - Mode: ${feishuConfig.connectionMode || 'webhook'}`);

    if (feishuConfig.defaultAccount) {
      summary.push(`  - Default Account: ${feishuConfig.defaultAccount.accountId}`);
    }
  }

  // 其他渠道...

  return summary.join('\n');
}
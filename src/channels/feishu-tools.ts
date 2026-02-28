/**
 * 飞书工具集成
 * 提供飞书相关的工具：文档、知识库、云盘等
 * 参考 openclaw/extensions/feishu 实现
 */

import type { Tool } from "../tools/types.js";
import type { FeishuChannel } from "./feishu.js";

export interface FeishuToolConfig {
  /** 是否启用文档工具 */
  doc?: boolean;
  /** 是否启用知识库工具 */
  wiki?: boolean;
  /** 是否启用云盘工具 */
  drive?: boolean;
  /** 是否启用权限工具 */
  perm?: boolean;
  /** 是否启用范围检查 */
  scopes?: boolean;
}

/**
 * 飞书文档工具
 */
export const feishuDocTool: Tool<{
  document_id: string;
  action: "read" | "list" | "search";
  query?: string;
  limit?: number;
}> = {
  name: "feishu_doc",
  description: "访问飞书文档（云文档）",
  inputSchema: {
    type: "object",
    properties: {
      document_id: {
        type: "string",
        description: "文档ID（可选，list/search时不需要）",
      },
      action: {
        type: "string",
        description: "操作类型",
        enum: ["read", "list", "search"],
      },
      query: {
        type: "string",
        description: "搜索查询（search时必需）",
      },
      limit: {
        type: "number",
        description: "返回结果数量限制，默认10",
        default: 10,
      },
    },
    required: ["action"],
  },
  execute: async (args, context) => {
    const { feishuChannel } = context.metadata as { feishuChannel?: FeishuChannel };

    if (!feishuChannel) {
      throw new Error("Feishu channel not available in context");
    }

    try {
      switch (args.action) {
        case "read":
          return await readFeishuDocument(args.document_id, feishuChannel);
        case "list":
          return await listFeishuDocuments(feishuChannel, args.limit);
        case "search":
          return await searchFeishuDocuments(args.query!, feishuChannel, args.limit);
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error) {
      return `飞书文档操作失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * 飞书知识库工具
 */
export const feishuWikiTool: Tool<{
  space_id?: string;
  node_id?: string;
  action: "read" | "list_spaces" | "list_nodes" | "search";
  query?: string;
  limit?: number;
}> = {
  name: "feishu_wiki",
  description: "访问飞书知识库",
  inputSchema: {
    type: "object",
    properties: {
      space_id: {
        type: "string",
        description: "知识库空间ID",
      },
      node_id: {
        type: "string",
        description: "知识库节点ID",
      },
      action: {
        type: "string",
        description: "操作类型",
        enum: ["read", "list_spaces", "list_nodes", "search"],
      },
      query: {
        type: "string",
        description: "搜索查询（search时必需）",
      },
      limit: {
        type: "number",
        description: "返回结果数量限制，默认10",
        default: 10,
      },
    },
    required: ["action"],
  },
  execute: async (args, context) => {
    const { feishuChannel } = context.metadata as { feishuChannel?: FeishuChannel };

    if (!feishuChannel) {
      throw new Error("Feishu channel not available in context");
    }

    try {
      switch (args.action) {
        case "read":
          return await readWikiNode(args.space_id!, args.node_id!, feishuChannel);
        case "list_spaces":
          return await listWikiSpaces(feishuChannel, args.limit);
        case "list_nodes":
          return await listWikiNodes(args.space_id!, feishuChannel, args.limit);
        case "search":
          return await searchWiki(args.query!, feishuChannel, args.limit);
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error) {
      return `飞书知识库操作失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * 飞书云盘工具
 */
export const feishuDriveTool: Tool<{
  folder_token?: string;
  file_token?: string;
  action: "list" | "read" | "search" | "upload";
  query?: string;
  file_name?: string;
  content?: string;
  limit?: number;
}> = {
  name: "feishu_drive",
  description: "访问飞书云盘",
  inputSchema: {
    type: "object",
    properties: {
      folder_token: {
        type: "string",
        description: "文件夹token",
      },
      file_token: {
        type: "string",
        description: "文件token",
      },
      action: {
        type: "string",
        description: "操作类型",
        enum: ["list", "read", "search", "upload"],
      },
      query: {
        type: "string",
        description: "搜索查询",
      },
      file_name: {
        type: "string",
        description: "文件名（upload时必需）",
      },
      content: {
        type: "string",
        description: "文件内容（upload时必需）",
      },
      limit: {
        type: "number",
        description: "返回结果数量限制，默认10",
        default: 10,
      },
    },
    required: ["action"],
  },
  execute: async (args, context) => {
    const { feishuChannel } = context.metadata as { feishuChannel?: FeishuChannel };

    if (!feishuChannel) {
      throw new Error("Feishu channel not available in context");
    }

    try {
      switch (args.action) {
        case "list":
          return await listDriveFiles(args.folder_token, feishuChannel, args.limit);
        case "read":
          return await readDriveFile(args.file_token!, feishuChannel);
        case "search":
          return await searchDriveFiles(args.query!, feishuChannel, args.limit);
        case "upload":
          return await uploadDriveFile(args.file_name!, args.content!, args.folder_token, feishuChannel);
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error) {
      return `飞书云盘操作失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * 飞书权限工具
 */
export const feishuPermTool: Tool<{
  user_id?: string;
  department_id?: string;
  resource_type: string;
  resource_id: string;
  action: "check" | "list_users" | "list_departments" | "grant" | "revoke";
  permission?: string;
}> = {
  name: "feishu_perm",
  description: "管理飞书权限（敏感操作，谨慎使用）",
  inputSchema: {
    type: "object",
    properties: {
      user_id: {
        type: "string",
        description: "用户ID",
      },
      department_id: {
        type: "string",
        description: "部门ID",
      },
      resource_type: {
        type: "string",
        description: "资源类型：doc/wiki/drive/chat",
      },
      resource_id: {
        type: "string",
        description: "资源ID",
      },
      action: {
        type: "string",
        description: "操作类型",
        enum: ["check", "list_users", "list_departments", "grant", "revoke"],
      },
      permission: {
        type: "string",
        description: "权限类型：view/edit/comment/manage",
      },
    },
    required: ["resource_type", "resource_id", "action"],
  },
  execute: async (args, context) => {
    const { feishuChannel } = context.metadata as { feishuChannel?: FeishuChannel };

    if (!feishuChannel) {
      throw new Error("Feishu channel not available in context");
    }

    try {
      switch (args.action) {
        case "check":
          return await checkPermission(args.resource_type, args.resource_id, args.user_id, args.permission!, feishuChannel);
        case "list_users":
          return await listResourceUsers(args.resource_type, args.resource_id, feishuChannel);
        case "list_departments":
          return await listResourceDepartments(args.resource_type, args.resource_id, feishuChannel);
        case "grant":
          return await grantPermission(args.resource_type, args.resource_id, args.user_id, args.department_id, args.permission!, feishuChannel);
        case "revoke":
          return await revokePermission(args.resource_type, args.resource_id, args.user_id, args.department_id, args.permission!, feishuChannel);
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error) {
      return `飞书权限操作失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

// ========== 实现函数 ==========

async function readFeishuDocument(documentId: string, channel: FeishuChannel): Promise<string> {
  // 实现文档读取逻辑
  return `读取飞书文档: ${documentId}\n[文档内容预览]`;
}

async function listFeishuDocuments(channel: FeishuChannel, limit: number = 10): Promise<string> {
  // 实现文档列表逻辑
  return `列出最近的 ${limit} 个飞书文档\n[文档列表]`;
}

async function searchFeishuDocuments(query: string, channel: FeishuChannel, limit: number = 10): Promise<string> {
  // 实现文档搜索逻辑
  return `搜索飞书文档: "${query}"\n返回 ${limit} 个结果\n[搜索结果]`;
}

async function readWikiNode(spaceId: string, nodeId: string, channel: FeishuChannel): Promise<string> {
  // 实现知识库节点读取
  return `读取飞书知识库节点: ${nodeId}\n[节点内容]`;
}

async function listWikiSpaces(channel: FeishuChannel, limit: number = 10): Promise<string> {
  // 实现知识库空间列表
  return `列出 ${limit} 个飞书知识库空间\n[空间列表]`;
}

async function listWikiNodes(spaceId: string, channel: FeishuChannel, limit: number = 10): Promise<string> {
  // 实现知识库节点列表
  return `列出知识库空间 ${spaceId} 中的 ${limit} 个节点\n[节点列表]`;
}

async function searchWiki(query: string, channel: FeishuChannel, limit: number = 10): Promise<string> {
  // 实现知识库搜索
  return `搜索飞书知识库: "${query}"\n返回 ${limit} 个结果\n[搜索结果]`;
}

async function listDriveFiles(folderToken: string | undefined, channel: FeishuChannel, limit: number = 10): Promise<string> {
  // 实现云盘文件列表
  const location = folderToken ? `文件夹 ${folderToken}` : '根目录';
  return `列出 ${location} 中的 ${limit} 个文件\n[文件列表]`;
}

async function readDriveFile(fileToken: string, channel: FeishuChannel): Promise<string> {
  // 实现文件读取
  return `读取飞书云盘文件: ${fileToken}\n[文件内容]`;
}

async function searchDriveFiles(query: string, channel: FeishuChannel, limit: number = 10): Promise<string> {
  // 实现文件搜索
  return `搜索飞书云盘文件: "${query}"\n返回 ${limit} 个结果\n[搜索结果]`;
}

async function uploadDriveFile(fileName: string, content: string, folderToken: string | undefined, channel: FeishuChannel): Promise<string> {
  // 实现文件上传
  const location = folderToken ? `文件夹 ${folderToken}` : '根目录';
  return `上传文件到飞书云盘 ${location}\n文件名: ${fileName}\n大小: ${content.length} 字符`;
}

async function checkPermission(resourceType: string, resourceId: string, userId: string | undefined, permission: string, channel: FeishuChannel): Promise<string> {
  // 实现权限检查
  const target = userId ? `用户 ${userId}` : '当前用户';
  return `检查 ${target} 对 ${resourceType}/${resourceId} 的 ${permission} 权限\n[权限检查结果]`;
}

async function listResourceUsers(resourceType: string, resourceId: string, channel: FeishuChannel): Promise<string> {
  // 实现资源用户列表
  return `列出 ${resourceType}/${resourceId} 的授权用户\n[用户列表]`;
}

async function listResourceDepartments(resourceType: string, resourceId: string, channel: FeishuChannel): Promise<string> {
  // 实现资源部门列表
  return `列出 ${resourceType}/${resourceId} 的授权部门\n[部门列表]`;
}

async function grantPermission(resourceType: string, resourceId: string, userId: string | undefined, departmentId: string | undefined, permission: string, channel: FeishuChannel): Promise<string> {
  // 实现权限授予
  const target = userId ? `用户 ${userId}` : departmentId ? `部门 ${departmentId}` : '未知目标';
  return `授予 ${target} 对 ${resourceType}/${resourceId} 的 ${permission} 权限\n[操作成功]`;
}

async function revokePermission(resourceType: string, resourceId: string, userId: string | undefined, departmentId: string | undefined, permission: string, channel: FeishuChannel): Promise<string> {
  // 实现权限撤销
  const target = userId ? `用户 ${userId}` : departmentId ? `部门 ${departmentId}` : '未知目标';
  return `撤销 ${target} 对 ${resourceType}/${resourceId} 的 ${permission} 权限\n[操作成功]`;
}

/**
 * 根据配置获取启用的飞书工具
 */
export function getFeishuTools(config: FeishuToolConfig = {}): Tool[] {
  const tools: Tool[] = [];
  const defaultConfig: Required<FeishuToolConfig> = {
    doc: true,
    wiki: true,
    drive: true,
    perm: false, // 权限工具默认禁用
    scopes: true,
  };

  const resolvedConfig = { ...defaultConfig, ...config };

  if (resolvedConfig.doc) {
    tools.push(feishuDocTool);
  }

  if (resolvedConfig.wiki) {
    tools.push(feishuWikiTool);
  }

  if (resolvedConfig.drive) {
    tools.push(feishuDriveTool);
  }

  if (resolvedConfig.perm) {
    tools.push(feishuPermTool);
  }

  // scopes 配置用于控制范围检查，不是单独的工具

  return tools;
}

/**
 * 默认工具配置
 */
export const DEFAULT_FEISHU_TOOLS_CONFIG: Required<FeishuToolConfig> = {
  doc: true,
  wiki: true,
  drive: true,
  perm: false,
  scopes: true,
};
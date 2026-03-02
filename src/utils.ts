import "dotenv/config";
import { Model, stream, Context } from '@mariozechner/pi-ai';
import axios, { AxiosResponse } from 'axios';
export const getModelResult = async (promptText: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        // 1. 配置 DeepSeek (使用 openai-completions 适配器)
        const model: Model<'openai-completions'> = {
            id: process.env.OPENCLAW_MINI_MODEL || "",             // 自定义 ID
            name: process.env.OPENCLAW_MINI_MODEL || "",             // 显示名称
            api: 'openai-completions',       // 【关键】使用 OpenAI 兼容协议
            provider: process.env.OPENCLAW_MINI_PROVIDER || "",              // 底层实现复用 openai 逻辑
            baseUrl: process.env.OPENCLAW_MINI_BASE_URL || "", // 【关键】替换为 DeepSeek 地址
            reasoning: false,
            input: ['text', 'image'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 32000
        };

        const context: Context = {
            systemPrompt: '你是一个OCR识别验证码，请返回识别结果。',
            messages: [
                {
                    role: 'user',
                    content: [
                        { "type": "text", text: "这是登陆生成数字验证码，有简单的噪音干扰，里面是4位数字，无其他内容。" },
                        {
                            type: 'image', data: promptText, mimeType: 'image/png'
                        }
                    ],
                    timestamp: new Date().getTime()
                }
            ]
        };


        const s = stream(model, context, {
            apiKey: process.env.OPENAI_API_KEY || "",
            thinkingEnabled: false
        });

        for await (const event of s) {
            if (event.type === 'text_delta') {
                process.stdout.write(event.delta);
                resolve(event.delta)
            } else if (event.type === 'error') {
                // event.reason tells you if it was "error" or "aborted"
                console.log(`${event.reason === 'aborted' ? 'Aborted' : 'Error'}:`, event.error.errorMessage);
                reject(event.error)
            }
        }

        const resLLM = await s.result();

        if (resLLM.stopReason === 'aborted') {
            console.log('Request was aborted:', resLLM.errorMessage);
            console.log('Partial content received:', resLLM.content);
            console.log('Tokens used:', resLLM.usage);
            reject(resLLM.errorMessage)
        }

    });
}

// 定义请求参数接口（TypeScript 类型安全）
interface CaptchaRequest {
    image_base64: string; // Base64 编码的图片
}

// 定义响应接口（根据 FastAPI 返回结构定制）
interface CaptchaResponse {
    success: boolean;
    code?: string;      // 识别出的验证码
    data?: any; // 识别置信度
    msg?: string;   // 错误信息（可选）
}

/**
 * 识别验证码图片
 * @param base64Image - Base64 编码的图片（不包含 data URL 前缀）
 * @returns 识别结果
 */
export async function recognizeCaptcha(base64Image: string): Promise<CaptchaResponse> {
    const captcha_url = process.env.STOCK_EASTMONEY_VERIFY_CODE_URL || "";
    // 验证 Base64 格式
    if (!base64Image || typeof base64Image !== 'string' || !captcha_url) {
        throw new Error('无效的 Base64 图片数据或验证服务器地址没配');
    }

    // 移除可能存在的 data URL 前缀（如 "data:image/jpeg;base64,"）
    const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

    try {
        // 创建请求参数（类型安全）
        const requestData: CaptchaRequest = {
            image_base64: cleanBase64
        };

        console.log('🔍 正在发送验证码识别请求...');
        console.log(`📊 Base64 数据长度: ${cleanBase64.length} 字符`);

        // 发送 POST 请求
        const response: AxiosResponse<CaptchaResponse> = await axios.post(
            captcha_url,
            requestData,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000 // 10秒超时
            }
        );

        // 验证响应结构
        if (!response.data || typeof response.data !== 'object') {
            throw new Error('无效的服务器响应格式');
        }
        return response.data;

    } catch (error) {
        console.error('💥 错误:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}
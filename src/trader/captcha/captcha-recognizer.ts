import type { CaptchaRecognizerObject, CaptchaRecognitionResult, CaptchaRecognizerOptions } from './types.js';
import { recognizeCaptcha } from '../../utils.js';

export class CaptchaRecognizer implements CaptchaRecognizerObject {
    readonly name = 'CaptchaRecognizer';
    private options: Required<CaptchaRecognizerOptions>;
    private instance: any = null;

    constructor(options: CaptchaRecognizerOptions = {}) {
        this.options = {
            maxRetries: options.maxRetries ?? 3,
            retryDelay: options.retryDelay ?? 1000,
            expectedLength: options.expectedLength ?? 4,
            charset: options.charset ?? '0123456789'
        };
    }

    /**
     * 初始化 instance.js
     */
    private async initialize(): Promise<void> {
        if (this.instance) {
            return;
        }

        try {

            this.instance = new CaptchaRecognizer();
        } catch (error) {
            throw new Error(`Failed to initialize error: ${error}.`);
        }
    }

    /**
     * 识别验证码图片
     */
    async recognize(imageBuffer: Buffer): Promise<string> {
        const result = await this.recognizeWithDetails(imageBuffer);
        return result.text;
    }

    /**
     * 识别验证码图片并返回详细信息
     */
    async recognizeWithDetails(imageBuffer: Buffer): Promise<CaptchaRecognitionResult> {
        await this.initialize();

        const startTime = Date.now();
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {

                const resultData = await recognizeCaptcha(imageBuffer.toString('base64'));
                const text = resultData.data?.code || '';
                // 清理识别结果：移除空格和换行
                const cleanedText = text.replace(/\s+/g, '');

                // 验证结果长度
                if (this.options.expectedLength && cleanedText.length !== this.options.expectedLength) {
                    console.warn(`验证码长度不符: 期望 ${this.options.expectedLength}, 实际 ${cleanedText.length}, 文本: ${cleanedText}`);

                    // 如果置信度低或长度不对，可能识别错误，重试
                    if (attempt < this.options.maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
                        continue;
                    }
                }
                const processingTime = Date.now() - startTime;
                return {
                    text: cleanedText,
                    recognizer: this.name,
                    processingTime
                };

            } catch (error) {
                lastError = error as Error;
                console.warn(`识别尝试 ${attempt} 失败:`, error);

                if (attempt < this.options.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
                }
            }
        }

        throw new Error(`验证码识别失败，最大重试次数 ${this.options.maxRetries} 已用完: ${lastError?.message}`);
    }

    /**
     * 释放资源
     */
    async terminate(): Promise<void> {
        if (this.instance) {
            await this.instance.terminate();
            this.instance = null;
        }
    }

}
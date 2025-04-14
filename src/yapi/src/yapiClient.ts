import {
    YapiInterfaceDetailDataSchema,
    YapiListDataSchema,
    YapiMenuDataSchema,
    YapiProjectSchema,
    YapiInterfaceGetResponseSchema,
    YapiListCatResponseSchema,
    YapiListMenuResponseSchema,
    YapiProjectGetResponseSchema
  } from './schemas.js';
  import { z } from 'zod';
  
  // 自定义错误类，方便区分 YAPI 错误
  export class YapiError extends Error {
    constructor(message: string, public readonly errcode?: number, public readonly responseBody?: any) {
      super(message);
      this.name = 'YapiError';
    }
  }
  
  export class YapiClient {
    private baseUrl: string;
    private token: string;
  
    constructor(baseUrl: string, token: string) {
      this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      this.token = token;
      if (!this.baseUrl || !this.token) {
          throw new Error("YAPI Base URL and Token must be provided.");
      }
      console.error(`YapiClient initialized with base URL: ${this.baseUrl}`);
    }
  
    // 通用请求方法
    private async request<T extends z.ZodTypeAny>(
      path: string,
      schema: T, // Zod schema for the *entire* expected JSON response
      params?: Record<string, string | number | undefined>,
      method: 'GET' | 'POST' = 'GET', // 默认为 GET
      body?: any // 用于 POST 请求体
    ): Promise<z.infer<T>> {
      const url = new URL(`${this.baseUrl}${path}`);
  
      // 添加 token 到所有请求
      if (method === 'GET') {
          url.searchParams.append('token', this.token);
          // 添加其他 GET 参数
          if (params) {
              for (const [key, value] of Object.entries(params)) {
                  if (value !== undefined) {
                      url.searchParams.append(key, String(value));
                  }
              }
          }
      } else if (method === 'POST' && body) {
           // 对于 POST，将 token 添加到请求体中（根据 YAPI 文档）
           if(typeof body === 'object' && body !== null) {
               body.token = this.token;
           } else {
               // 如果 body 不是对象，可能需要不同的处理方式或抛出错误
               console.warn("Warning: POST request body is not an object, token not added automatically.");
           }
           // POST 请求的参数通常在 body 中
      } else if (method === 'POST' && !body) {
           // 如果是 POST 但没有 body，也需要添加 token
           body = { token: this.token };
      }
  
      console.error(`[YAPI Request] ${method} ${url.toString()}`);
      if (body) {
        console.error(`[YAPI Request Body]`, JSON.stringify(body));
      }
  
      const headers: HeadersInit = {
        'Accept': 'application/json',
      };
      if (method === 'POST') {
          headers['Content-Type'] = 'application/json'; // 假设 POST 总是 JSON
      }
  
      try {
        const response = await fetch(url.toString(), {
          method: method,
          headers: headers,
          body: body ? JSON.stringify(body) : undefined,
        });
  
        console.error(`[YAPI Response] Status: ${response.status}`);
  
        if (!response.ok) {
          let errorBody;
          try {
              errorBody = await response.json();
          } catch (e) {
              errorBody = await response.text();
          }
          console.error(`[YAPI Response Error Body]`, errorBody);
          throw new YapiError(`HTTP error ${response.status} - ${response.statusText}`, response.status, errorBody);
        }
  
        const responseData = await response.json();
        console.error(`[YAPI Response Body]`, JSON.stringify(responseData, null, 2));
  
        // 检查 YAPI 业务错误码
        if (responseData && typeof responseData === 'object' && 'errcode' in responseData && responseData.errcode !== 0) {
          throw new YapiError(responseData.errmsg || 'YAPI operation failed', responseData.errcode, responseData);
        }
  
        // 使用 Zod 解析和验证整个返回的数据
        const parsed = schema.safeParse(responseData);
        if (!parsed.success) {
            console.error("[Zod Parse Error]", parsed.error.errors);
            throw new YapiError(`Failed to parse YAPI response for ${path}. Schema validation failed.`, undefined, { zodErrors: parsed.error.errors, rawData: responseData });
        }
  
        return parsed.data;
      } catch (error) {
        console.error(`[YAPI Client Error] Request to ${path} failed:`, error);
        if (error instanceof YapiError) {
          throw error;
        }
        throw new YapiError(`Network or fetch error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  
    async getInterfaceDetails(interfaceId: number): Promise<z.infer<typeof YapiInterfaceDetailDataSchema>> {
      const result = await this.request(`/api/interface/get`, YapiInterfaceGetResponseSchema, { id: interfaceId });
      return result.data;
    }
  
    async listInterfacesByCategory(categoryId: number, page: number = 1, limit: number = 10): Promise<z.infer<typeof YapiListDataSchema>> {
      const result = await this.request(`/api/interface/list_cat`, YapiListCatResponseSchema, { catid: categoryId, page, limit });
      return result.data;
    }
  
    async getProjectInterfaceMenu(): Promise<z.infer<typeof YapiMenuDataSchema>> {
      const result = await this.request(`/api/interface/list_menu`, YapiListMenuResponseSchema);
      return result.data;
    }
  
    async getProjectInfo(): Promise<z.infer<typeof YapiProjectSchema>> {
      const result = await this.request(`/api/project/get`, YapiProjectGetResponseSchema);
      return result.data;
    }
  }
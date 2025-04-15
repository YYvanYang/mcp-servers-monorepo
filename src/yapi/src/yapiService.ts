import { ZodError, z } from 'zod';
import { YapiError, ConfigurationError } from './errors.js';
import {
  // Import the actual data schemas needed for return types
  YapiInterfaceDetailDataSchema,
  YapiListCatDataSchema, // This is the nested data for list_cat
  YapiMenuDataSchema,
  YapiProjectSchema,
  // Import the full response schemas for validation in the request method
  YapiInterfaceGetResponseSchema,
  YapiListCatResponseSchema,
  YapiListMenuResponseSchema,
  YapiProjectGetResponseSchema
} from './schemas.js';

export class YapiService {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly userAgent: string = `@mcp-servers/yapi/0.2.0`; // Use package name/version

  constructor(baseUrl?: string, token?: string) {
    if (!baseUrl) {
      throw new ConfigurationError("YAPI_BASE_URL environment variable is not configured.");
    }
    if (!token) {
      throw new ConfigurationError("YAPI_PROJECT_TOKEN environment variable is not configured.");
    }
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.token = token;
    console.error(`[YapiService] Initialized with base URL: ${this.baseUrl}`);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Generic method to make requests to the YAPI API.
   * Handles adding the token, making the request, checking HTTP status,
   * checking YAPI business logic errors (errcode), and validating the
   * entire response structure against the provided Zod schema.
   */
  private async request<TResponseSchema extends z.ZodTypeAny>(
    path: string,
    schema: TResponseSchema, // Zod schema for the *entire* JSON response (incl. errcode/errmsg)
    params?: Record<string, string | number | undefined>,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<z.infer<TResponseSchema>> { // Returns the parsed full response
    const url = new URL(`${this.baseUrl}${path}`);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': this.userAgent,
    };

    const requestOptions: RequestInit = {
        method: method,
        headers: headers,
    };

    // Add token and parameters based on method
    if (method === 'GET') {
        url.searchParams.append('token', this.token);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) {
                    url.searchParams.append(key, String(value));
                }
            }
        }
    } else if (method === 'POST') {
        const requestBody = body ? { ...body, token: this.token } : { token: this.token };
        requestOptions.body = JSON.stringify(requestBody);
        headers['Content-Type'] = 'application/json';
    }

    const logUrl = new URL(url);
    logUrl.searchParams.delete('token'); // Don't log token in URL
    console.error(`[YapiService Request] ${method} ${logUrl.toString()}`);
     if (requestOptions.body) {
        try {
            const loggableBody = JSON.parse(requestOptions.body as string);
            delete loggableBody?.token; // Don't log token from body
            console.error(`[YapiService Request Body]`, JSON.stringify(loggableBody));
        } catch {
            console.error(`[YapiService Request Body] (Could not parse as JSON)`);
        }
     }


    try {
      const response = await fetch(url.toString(), requestOptions);

      console.error(`[YapiService Response] Status: ${response.status}`);

      let responseData: any;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        const textResponse = await response.text();
        console.error(`[YapiService Response Error] Non-JSON response: ${textResponse}`);
        throw new YapiError(`Failed to parse JSON response from YAPI. Status: ${response.status}. Response body: ${textResponse}`, undefined, response.status, textResponse);
      }

      // console.error(`[YapiService Response Body]`, JSON.stringify(responseData, null, 2)); // Log full for debug if needed

      if (!response.ok) {
        const errorMessage = responseData?.errmsg || response.statusText || 'YAPI request failed';
        console.error(`[YapiService Error Body on !ok]`, responseData);
        throw new YapiError(errorMessage, responseData?.errcode, response.status, responseData);
      }

      // Check YAPI business error code AFTER checking HTTP status
      if (responseData && typeof responseData === 'object' && 'errcode' in responseData && responseData.errcode !== 0) {
        console.error(`[YapiService Business Error Body]`, responseData);
        throw new YapiError(responseData.errmsg || 'YAPI operation failed', responseData.errcode, response.status, responseData);
      }

      // Validate the *entire* response structure using the provided wrapper Zod schema
      const parsed = schema.safeParse(responseData);
      if (!parsed.success) {
          console.error("[Zod Parse Error]", parsed.error.format()); // Log formatted Zod errors
          const validationErrors = parsed.error.errors.map(e => `Path: ${e.path.join('.')}, Message: ${e.message}`).join('; ');
          throw new YapiError(`YAPI response validation failed for ${path}. Details: ${validationErrors}`, undefined, response.status, { zodErrors: parsed.error.format(), rawData: responseData });
      }

      return parsed.data; // Return the validated full response object

    } catch (error) {
      console.error(`[YapiService Error] Request to ${path} failed:`, error);
      if (error instanceof YapiError || error instanceof ConfigurationError) {
        throw error; // Re-throw known errors
      }
      // Wrap unknown errors (like network errors)
      throw new YapiError(`Network or fetch error during request to ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --- Public API Methods ---
  // These methods now return the specific data *inside* the 'data' field
  // after validating the full response.

  async getInterfaceDetails(interfaceId: number): Promise<z.infer<typeof YapiInterfaceDetailDataSchema>> {
    const result = await this.request(
      `/api/interface/get`,
      YapiInterfaceGetResponseSchema, // Validate using the wrapper schema
      { id: interfaceId }
    );
    return result.data; // Return the validated inner 'data' object
  }

  async listInterfacesByCategory(categoryId: number, page: number = 1, limit: number = 10): Promise<z.infer<typeof YapiListCatDataSchema>> {
    const result = await this.request(
        `/api/interface/list_cat`,
        YapiListCatResponseSchema, // Validate using the wrapper schema
        { catid: categoryId, page, limit }
    );
    return result.data; // Return the validated inner 'data' object
  }

  async getProjectInterfaceMenu(): Promise<z.infer<typeof YapiMenuDataSchema>> {
    const result = await this.request(
        `/api/interface/list_menu`,
        YapiListMenuResponseSchema // Validate using the wrapper schema
    );
    return result.data; // Return the validated inner 'data' object (which is an array)
  }

  async getProjectInfo(): Promise<z.infer<typeof YapiProjectSchema>> {
    const result = await this.request(
        `/api/project/get`,
        YapiProjectGetResponseSchema // Validate using the wrapper schema
    );
    return result.data; // Return the validated inner 'data' object
  }
}
import { ZodError, z } from 'zod';
import { YapiError, ConfigurationError } from './errors.js';
import {
  // Data schemas
  YapiInterfaceDetailDataSchema,
  YapiListCatDataSchema,
  YapiMenuDataSchema,
  YapiProjectSchema,
  // Full Response schemas for validation
  YapiInterfaceGetResponseSchema,
  YapiListCatResponseSchema,
  YapiListMenuResponseSchema,
  YapiProjectGetResponseSchema
} from './schemas.js';

export class YapiService {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly apiBase: string;
  private readonly userAgent: string = `@mcp-servers/yapi/0.2.0`; // Use package name/version

  constructor(baseUrl?: string, token?: string) {
    if (!baseUrl) {
      throw new ConfigurationError("YAPI_BASE_URL environment variable is not configured.");
    }
    if (!token) {
      throw new ConfigurationError("YAPI_PROJECT_TOKEN environment variable is not configured.");
    }

    // Validate baseUrl format - should not contain /api/* or /project/*
    try {
        const parsedUrl = new URL(baseUrl);
        if (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '') {
             console.warn(`[YapiService Config Warning] The provided YAPI_BASE_URL "${baseUrl}" includes a path ("${parsedUrl.pathname}"). It should typically be just the base domain (e.g., "https://yapi.example.com"). Removing the path.`);
             this.baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
        } else {
             this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        }
    } catch (e) {
        throw new ConfigurationError(`Invalid YAPI_BASE_URL provided: "${baseUrl}". It should be a valid URL like "https://yapi.example.com".`);
    }

    this.apiBase = `${this.baseUrl}/api`; // Construct API base path
    this.token = token;
    // Use console.error for server status logs
    console.error(`[YapiService] Initialized with API base: ${this.apiBase}`);
  }

  public getBaseUrl(): string {
    return this.baseUrl; // Return the original base URL for display/logging
  }

  /**
   * Generic method to make requests to the YAPI API.
   */
  private async request<TResponseSchema extends z.ZodTypeAny>(
    apiPath: string, // Path relative to /api, e.g., /interface/get
    schema: TResponseSchema,
    params?: Record<string, string | number | undefined>,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<z.infer<TResponseSchema>> {
    const url = new URL(`${this.apiBase}${apiPath}`);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': this.userAgent,
    };

    const requestOptions: RequestInit = {
        method: method,
        headers: headers,
    };

    // Add token and parameters
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
        // For POST, token should usually be in the body for YAPI open API
        const requestBody = body ? { ...body, token: this.token } : { token: this.token };
        requestOptions.body = JSON.stringify(requestBody);
        headers['Content-Type'] = 'application/json';
    }

    const logUrl = new URL(url);
    logUrl.searchParams.delete('token'); // Don't log token
    // Use console.error for operational logs
    console.error(`[YapiService Request] ${method} ${logUrl.pathname}${logUrl.search}`);
     if (method === 'POST' && requestOptions.body) {
        try {
            const loggableBody = JSON.parse(requestOptions.body as string);
            delete loggableBody?.token; // Don't log token from body
            console.error(`[YapiService Request Body]`, JSON.stringify(loggableBody, null, 2));
        } catch {
            console.error(`[YapiService Request Body] (Could not parse as JSON)`);
        }
     }


    try {
      const response = await fetch(url.toString(), requestOptions);

      console.error(`[YapiService Response] Status: ${response.status} for ${method} ${logUrl.pathname}${logUrl.search}`);

      let responseData: any;
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
          try {
            responseData = await response.json();
          } catch (jsonError) {
            console.error(`[YapiService Response Error] Failed to parse JSON despite Content-Type header. Status: ${response.status}. Error:`, jsonError);
            // Attempt to read as text for debugging
            const textResponse = await response.text().catch(() => "[Could not read text body]");
            throw new YapiError(`Failed to parse JSON response from YAPI. Status: ${response.status}. Response body fragment: ${textResponse.substring(0, 100)}`, undefined, response.status, textResponse);
          }
      } else {
          // Handle non-JSON responses if necessary, or throw an error
          const textResponse = await response.text();
          console.error(`[YapiService Response Warning] Received non-JSON response (Content-Type: ${contentType || 'N/A'}). Status: ${response.status}. Body: ${textResponse.substring(0, 200)}...`);
           // If a non-JSON response is unexpected, treat it as an error
           if (!response.ok) {
                throw new YapiError(`YAPI request failed with non-JSON response. Status: ${response.status}. Body: ${textResponse}`, undefined, response.status, textResponse);
           }
           // If it might be expected in some cases, handle it or potentially return text
           // For now, we assume JSON is expected for successful API calls here.
           throw new YapiError(`Received unexpected non-JSON response from YAPI for ${apiPath}. Content-Type: ${contentType}`, undefined, response.status, textResponse);
      }


      // console.error(`[YapiService Response Body]`, JSON.stringify(responseData, null, 2)); // Uncomment for deep debugging

      if (!response.ok) {
        const errorMessage = responseData?.errmsg || response.statusText || `YAPI request failed with status ${response.status}`;
        console.error(`[YapiService Error Body on !ok]`, responseData);
        throw new YapiError(errorMessage, responseData?.errcode, response.status, responseData);
      }

      // Check YAPI business error code
      if (responseData && typeof responseData === 'object' && 'errcode' in responseData && responseData.errcode !== 0) {
        console.error(`[YapiService Business Error Body]`, responseData);
        throw new YapiError(responseData.errmsg || `YAPI operation failed with code ${responseData.errcode}`, responseData.errcode, response.status, responseData);
      }

      // Validate the *entire* response structure
      const parsed = schema.safeParse(responseData);
      if (!parsed.success) {
          console.error("[Zod Parse Error]", parsed.error.format());
          const validationErrors = parsed.error.errors.map(e => `Path: ${e.path.join('.')}, Message: ${e.message}`).join('; ');
          throw new YapiError(`YAPI response validation failed for ${apiPath}. Details: ${validationErrors}`, undefined, response.status, { zodErrors: parsed.error.format(), rawData: responseData });
      }

      return parsed.data;

    } catch (error) {
      console.error(`[YapiService Error] Request to ${apiPath} failed:`, error);
      if (error instanceof YapiError || error instanceof ConfigurationError) {
        throw error;
      }
      throw new YapiError(`Network or fetch error during request to ${apiPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --- Public API Methods ---

  async getInterfaceDetails(interfaceId: number): Promise<z.infer<typeof YapiInterfaceDetailDataSchema>> {
    const response = await this.request(
      `/interface/get`,
      YapiInterfaceGetResponseSchema,
      { id: interfaceId }
    );
    if (response.errcode === 0 && response.data) {
        // YAPI sometimes returns stringified JSON in res_body/req_body_other
        // Attempt to parse them if they look like JSON objects/arrays
        const tryParseJsonString = (jsonString: string | null | undefined): any => {
            if (!jsonString || typeof jsonString !== 'string') return jsonString;
            const trimmed = jsonString.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    return JSON.parse(trimmed);
                } catch {
                    // Ignore parsing errors, return original string
                }
            }
            return jsonString;
        };
        response.data.res_body = tryParseJsonString(response.data.res_body);
        response.data.req_body_other = tryParseJsonString(response.data.req_body_other);

        return response.data;
    } else {
        // This case should ideally be caught by the error handling in `request`,
        // but included for robustness.
        throw new YapiError(response.errmsg || 'Failed to get interface details', response.errcode);
    }
  }

  async listInterfacesByCategory(categoryId: number, page: number = 1, limit: number = 10): Promise<z.infer<typeof YapiListCatDataSchema>> {
    const response = await this.request(
        `/interface/list_cat`,
        YapiListCatResponseSchema,
        { catid: categoryId, page, limit }
    );
     if (response.errcode === 0 && response.data) {
        return response.data;
    } else {
        throw new YapiError(response.errmsg || 'Failed to list interfaces by category', response.errcode);
    }
  }

  async getProjectInterfaceMenu(): Promise<z.infer<typeof YapiMenuDataSchema>> {
    // Note: YAPI doc shows project_id, but it's often inferred from the token.
    // If your YAPI instance requires project_id here, you'll need to add it.
    const response = await this.request(
        `/interface/list_menu`,
        YapiListMenuResponseSchema
        // If needed: { project_id: your_project_id_logic_here }
    );
     if (response.errcode === 0 && response.data) {
        return response.data;
    } else {
        throw new YapiError(response.errmsg || 'Failed to get project interface menu', response.errcode);
    }
  }

  async getProjectInfo(): Promise<z.infer<typeof YapiProjectSchema>> {
    const response = await this.request(
        `/project/get`,
        YapiProjectGetResponseSchema
    );
     if (response.errcode === 0 && response.data) {
        return response.data;
    } else {
        throw new YapiError(response.errmsg || 'Failed to get project info', response.errcode);
    }
  }
}
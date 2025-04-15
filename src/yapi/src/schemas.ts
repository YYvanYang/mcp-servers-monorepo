import { z } from 'zod';

// --- Input Argument Schemas ---
export const GetInterfaceDetailsArgsSchema = z.object({
  interface_id: z.number().int().positive().describe("要获取详情的 YAPI 接口 ID"),
});

export const ListInterfacesByCategoryArgsSchema = z.object({
  category_id: z.number().int().positive().describe("要获取列表的 YAPI 分类 ID"),
  page: z.number().int().positive().optional().default(1).describe("页码 (可选, 默认为 1)"),
  limit: z.number().int().positive().optional().default(10).describe("每页数量 (可选, 默认为 10, 最大建议 100)")
});

export const GetProjectInterfaceMenuArgsSchema = z.object({}).describe("获取项目接口菜单，无需参数");

export const GetProjectInfoArgsSchema = z.object({}).describe("获取项目基本信息，无需参数");

// --- Inferred Input Types ---
export type GetInterfaceDetailsArgs = z.infer<typeof GetInterfaceDetailsArgsSchema>;
export type ListInterfacesByCategoryArgs = z.infer<typeof ListInterfacesByCategoryArgsSchema>;
export type GetProjectInterfaceMenuArgs = z.infer<typeof GetProjectInterfaceMenuArgsSchema>;
export type GetProjectInfoArgs = z.infer<typeof GetProjectInfoArgsSchema>;

// --- YAPI Response Data Schemas (Refined based on YAPI doc) ---
// These schemas represent the actual data *within* the 'data' field of successful YAPI responses.

// Basic building blocks for request/response parts
const YapiReqParamSchema = z.object({
    _id: z.string().optional(),
    name: z.string(),
    desc: z.string().optional().nullable(),
    example: z.string().optional().nullable(),
}).passthrough(); // Allows fields not explicitly defined

const YapiReqHeaderSchema = YapiReqParamSchema.extend({
    required: z.string().optional().refine(val => val === '1' || val === '0', { message: "Required must be '1' or '0'" }).nullable(),
    value: z.string().optional().nullable(),
    type: z.string().default('text'),
});

const YapiReqBodyFormSchema = YapiReqParamSchema.extend({
    required: z.string().optional().refine(val => val === '1' || val === '0', { message: "Required must be '1' or '0'" }).nullable(),
    type: z.string().default('text'),
});

const YapiReqQuerySchema = YapiReqParamSchema.extend({
    required: z.string().optional().refine(val => val === '1' || val === '0', { message: "Required must be '1' or '0'" }).nullable(),
    type: z.string().default('text'),
});

// Schema for the detailed data of a single interface (/api/interface/get)
export const YapiInterfaceDetailDataSchema = z.object({
    query_path: z.object({ path: z.string(), params: z.array(z.unknown()) }).optional(),
    edit_uid: z.number().optional().nullable(),
    status: z.enum(["done", "undone", "design"]).optional(),
    type: z.string().optional(), // e.g., "static"
    req_body_is_json_schema: z.boolean().optional(),
    res_body_is_json_schema: z.boolean().optional(),
    api_opened: z.boolean().optional(),
    index: z.number().optional(),
    tag: z.array(z.string()).optional(),
    _id: z.number(),
    method: z.string(),
    catid: z.number(),
    title: z.string(),
    path: z.string(),
    project_id: z.number(),
    uid: z.number(),
    add_time: z.number(),
    up_time: z.number(),
    req_query: z.array(YapiReqQuerySchema).optional(),
    req_headers: z.array(YapiReqHeaderSchema).optional(),
    req_params: z.array(YapiReqParamSchema).optional(), // Path parameters
    req_body_type: z.enum(['raw', 'form', 'json']).optional().nullable(),
    req_body_form: z.array(YapiReqBodyFormSchema).optional(),
    req_body_other: z.string().optional().nullable(), // Raw JSON string or other raw body
    res_body_type: z.enum(['json', 'raw', 'xml']).optional().nullable(),
    res_body: z.string().optional().nullable(), // Response body as JSON string or raw string/XML
    desc: z.string().optional().nullable(),
    markdown: z.string().optional().nullable(),
    username: z.string().optional(), // Often included
}).passthrough();

// Schema for a single interface item in a list (/api/interface/list_cat, /api/interface/list_menu)
export const YapiInterfaceListItemSchema = z.object({
    edit_uid: z.number().optional().nullable(),
    status: z.enum(["done", "undone", "design"]).optional(),
    api_opened: z.boolean().optional(),
    tag: z.array(z.string()).optional(),
    _id: z.number(),
    method: z.string(),
    catid: z.number(),
    title: z.string(),
    path: z.string(),
    project_id: z.number(),
    uid: z.number(),
    add_time: z.number(),
    up_time: z.number(),
}).passthrough();

// Schema for the data returned by /api/interface/list_cat (nested under 'data')
export const YapiListCatDataSchema = z.object({
    count: z.number(),
    total: z.number(),
    list: z.array(YapiInterfaceListItemSchema),
});

// Schema for a category, potentially including its list of interfaces (used by /api/interface/list_menu)
export const YapiCategorySchema = z.object({
    index: z.number().optional(),
    _id: z.number(),
    name: z.string(),
    project_id: z.number(),
    desc: z.string().optional().nullable(),
    uid: z.number(),
    add_time: z.number(),
    up_time: z.number(),
    // 'list' is present in the response of /api/interface/list_menu
    list: z.array(YapiInterfaceListItemSchema).optional(),
}).passthrough();

// Schema for the data returned by /api/interface/list_menu (an array of categories)
export const YapiMenuDataSchema = z.array(YapiCategorySchema); // Correctly exported

// Schema for the data returned by /api/project/get
export const YapiProjectSchema = z.object({
    switch_notice: z.boolean().optional(),
    is_mock_open: z.boolean().optional(),
    strice: z.boolean().optional(), // YAPI's potential typo
    is_json5: z.boolean().optional(),
    _id: z.number(),
    name: z.string(),
    desc: z.string().optional().nullable(),
    basepath: z.string().optional().nullable(),
    project_type: z.string().optional(),
    uid: z.number(),
    group_id: z.number(),
    icon: z.string().optional(),
    color: z.string().optional(),
    add_time: z.number(),
    up_time: z.number(),
    env: z.array(z.object({ name: z.string(), domain: z.string() }).passthrough()).optional(),
    role: z.string().optional().nullable(),
}).passthrough();


// --- YAPI API Response Wrapper Schemas ---
// These define the *full* response structure including errcode/errmsg

const YapiBaseResponseSchema = z.object({
  errcode: z.number(),
  errmsg: z.string(),
});

// Wrapper for /api/interface/get
export const YapiInterfaceGetResponseSchema = YapiBaseResponseSchema.extend({
  data: YapiInterfaceDetailDataSchema,
});

// Wrapper for /api/interface/list_cat
export const YapiListCatResponseSchema = YapiBaseResponseSchema.extend({
  data: YapiListCatDataSchema // Use the nested list data schema
});

// Wrapper for /api/interface/list_menu
export const YapiListMenuResponseSchema = YapiBaseResponseSchema.extend({
  data: YapiMenuDataSchema, // Use the array of categories schema
});

// Wrapper for /api/project/get
export const YapiProjectGetResponseSchema = YapiBaseResponseSchema.extend({
  data: YapiProjectSchema,
});
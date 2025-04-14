import { z } from 'zod';

// 输入参数 Schema 定义
export const GetInterfaceDetailsArgsSchema = z.object({
  interface_id: z.number().int().positive().describe("要获取详情的 YAPI 接口 ID"),
});

export const ListInterfacesByCategoryArgsSchema = z.object({
  category_id: z.number().int().positive().describe("要获取列表的 YAPI 分类 ID"),
  page: z.number().int().positive().optional().default(1).describe("页码 (可选, 默认为 1)"),
  limit: z.number().int().positive().optional().default(10).describe("每页数量 (可选, 默认为 10, 最大建议 100)")
});

export const GetProjectInterfaceMenuArgsSchema = z.object({}); // 无需参数

export const GetProjectInfoArgsSchema = z.object({}); // 无需参数

// 定义参数类型 (可选，但有助于代码提示)
export type GetInterfaceDetailsArgs = z.infer<typeof GetInterfaceDetailsArgsSchema>;
export type ListInterfacesByCategoryArgs = z.infer<typeof ListInterfacesByCategoryArgsSchema>;
export type GetProjectInterfaceMenuArgs = z.infer<typeof GetProjectInterfaceMenuArgsSchema>;
export type GetProjectInfoArgs = z.infer<typeof GetProjectInfoArgsSchema>;

// YAPI 返回数据结构的部分类型定义 (根据需要添加更多细节)
// **重要**: 你需要根据实际 YAPI 接口返回的 JSON 结构来完善这些 Schema
// 这里提供了一些基础字段，参考附件中的 /api/interface/get 示例
const YapiReqParamSchema = z.object({
    name: z.string(),
    example: z.string().optional(),
    desc: z.string().optional(),
    _id: z.string().optional(),
}).passthrough(); // 允许未知字段

const YapiReqHeaderSchema = z.object({
    name: z.string(),
    type: z.string().optional().default('text'),
    example: z.string().optional(),
    desc: z.string().optional(),
    required: z.string().optional().refine(val => val === '1' || val === '0', { message: "Required must be '1' or '0'" }),
    _id: z.string().optional(),
}).passthrough();

const YapiReqBodyFormSchema = YapiReqHeaderSchema.extend({
    type: z.string().default('text'), // YAPI form 默认是 text
});

const YapiReqQuerySchema = YapiReqHeaderSchema.extend({
    type: z.string().default('text'), // YAPI query 默认是 text
});

export const YapiInterfaceDetailDataSchema = z.object({
    _id: z.number(),
    project_id: z.number(),
    catid: z.number(),
    title: z.string(),
    path: z.string(),
    method: z.string(),
    req_body_type: z.enum(['raw', 'form', 'json']).optional(),
    res_body: z.string().optional(), // 通常是 JSON 字符串或 Schema 字符串
    res_body_type: z.enum(['json', 'raw', 'xml']).optional(), // 包含 'xml'
    uid: z.number(),
    add_time: z.number(),
    up_time: z.number(),
    req_body_form: z.array(YapiReqBodyFormSchema).optional(),
    req_params: z.array(YapiReqParamSchema).optional(), // 对应路径参数
    req_headers: z.array(YapiReqHeaderSchema).optional(),
    req_query: z.array(YapiReqQuerySchema).optional(),
    status: z.string().optional(),
    edit_uid: z.number().optional(),
    res_body_is_json_schema: z.boolean().optional(),
    req_body_other: z.string().optional(), // 用于存储 raw 或 json 请求体
    // 可以添加更多字段，如 markdown 描述等
    desc: z.string().optional(),
    markdown: z.string().optional(),
}).passthrough(); // 允许未知字段

export const YapiInterfaceListItemSchema = z.object({
    _id: z.number(),
    project_id: z.number(),
    catid: z.number(),
    title: z.string(),
    path: z.string(),
    method: z.string(),
    uid: z.number(),
    add_time: z.number(),
    up_time: z.number(),
    status: z.string().optional(),
    edit_uid: z.number().optional(),
}).passthrough(); // 允许未知字段

export const YapiCategorySchema = z.object({
    _id: z.number(),
    name: z.string(),
    project_id: z.number(),
    desc: z.string().optional(),
    uid: z.number(),
    add_time: z.number(),
    up_time: z.number(),
    list: z.array(YapiInterfaceListItemSchema).optional(), // list_menu 会包含这个
}).passthrough(); // 允许未知字段

export const YapiProjectSchema = z.object({
    _id: z.number(),
    name: z.string(),
    basepath: z.string().optional(),
    project_type: z.string().optional(),
    uid: z.number(),
    group_id: z.number(),
    // 添加更多需要的字段...
}).passthrough(); // 允许未知字段

export const YapiListDataSchema = z.object({
  count: z.number(),
  total: z.number(),
  list: z.array(YapiInterfaceListItemSchema), // list_cat 返回的是这个
});

// list_menu 直接返回 YapiCategorySchema 数组
export const YapiMenuDataSchema = z.array(YapiCategorySchema);

// 用于解析 /api/interface/get 的完整响应
export const YapiInterfaceGetResponseSchema = z.object({
    errcode: z.number(),
    errmsg: z.string(),
    data: YapiInterfaceDetailDataSchema
});

// 用于解析 /api/interface/list_cat 的完整响应
export const YapiListCatResponseSchema = z.object({
    errcode: z.number(),
    errmsg: z.string(),
    data: YapiListDataSchema
});

// 用于解析 /api/interface/list_menu 的完整响应
export const YapiListMenuResponseSchema = z.object({
    errcode: z.number(),
    errmsg: z.string(),
    data: YapiMenuDataSchema
});

// 用于解析 /api/project/get 的完整响应
export const YapiProjectGetResponseSchema = z.object({
    errcode: z.number(),
    errmsg: z.string(),
    data: YapiProjectSchema
});
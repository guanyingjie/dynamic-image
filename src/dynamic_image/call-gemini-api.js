/**
 * Worker B (Gemini 代理) - 修正版
 * 修复了 User location 报错的问题
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // 拼接 Google 的真实地址
    const targetUrl = GEMINI_API_BASE + url.pathname + url.search;

    // ⚡️⚡️ 核心修复 ⚡️⚡️
    // 创建一个新的、干净的 Headers 对象
    // 不要直接复制 request.headers，那样会暴露你的位置！
    const cleanHeaders = new Headers();

    // 我们只需要告诉 Google 发送的是 JSON
    cleanHeaders.set('Content-Type', 'application/json');

    // 创建新请求，使用干净的 Header
    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: cleanHeaders, // 👈 这里改成了 cleanHeaders
      body: request.body
    });

    // 发送给 Google
    const response = await fetch(newRequest);

    // 处理返回结果
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');

    return newResponse;
  },
};
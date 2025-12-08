/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */


const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 如果是预检请求 (OPTIONS)，直接返回允许跨域
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // 拼接真实的目标地址
    // 比如你请求 worker.dev/v1beta/models/..., 它会转发到 googleapis.com/v1beta/models/...
    const targetUrl = GEMINI_API_BASE + url.pathname + url.search;

    // 创建新请求
    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });

    // 发送给 Google
    const response = await fetch(newRequest);

    // 返回结果给微信云函数
    // 必须加上 CORS 头，虽然云函数是后端调用，但加上更保险
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');

    return newResponse;
  },
};
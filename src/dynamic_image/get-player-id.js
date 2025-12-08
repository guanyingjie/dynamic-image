/**
 * Cloudflare Worker: Kyureki Finder (Google API Edition)
 * 核心逻辑：使用 Google 官方 API，彻底解决 403/WAF 封锁问题
 */

// 🔴 必须替换这里的内容 🔴
const GOOGLE_API_KEY = "AIzaSyB_ClNsdqcSQTykK7qVNyIccDWDIbC4bTs";
const GOOGLE_CX_ID = "e5d247b3ac13f4d63";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const params = url.searchParams;
    const name = params.get("name");

    // 允许跨域
    const corsHeaders = {
      "content-type": "application/json;charset=UTF-8",
      "Access-Control-Allow-Origin": "*"
    };

    if (!name) {
      return new Response(JSON.stringify({ error: "请提供 name 参数" }), { status: 400, headers: corsHeaders });
    }

    try {
      console.log(`[Google API] 正在搜索: ${name}`);

      // 1. 构造 Google API 请求
      // num=1: 我们只需要第1个结果
      const googleApiUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(name)}&num=1`;

      const googleRes = await fetch(googleApiUrl);

      if (!googleRes.ok) {
        // 如果 API 配置错或者额度超了，这里会报错
        const errText = await googleRes.text();
        console.error("Google API Error:", errText);
        return new Response(JSON.stringify({ error: "Search Service Error", details: "API Key配置错误或额度耗尽" }), { status: 500, headers: corsHeaders });
      }

      const data = await googleRes.json();
      let playerUrl = null;

      // 2. 提取链接
      if (data.items && data.items.length > 0) {
        const firstResult = data.items[0];
        // 确保结果是球员页 (包含 /player/)
        if (firstResult.link && firstResult.link.includes("/player/")) {
           playerUrl = firstResult.link;
        }
      }

      if (!playerUrl) {
        return new Response(JSON.stringify({
          error: "未找到该球员",
          source: "Google API",
          details: "Google 收录中未找到匹配结果"
        }), { status: 404, headers: corsHeaders });
      }

      console.log(`[Google API] 找到链接: ${playerUrl}`);

      // 3. (可选) 获取 Wayback Machine 存档
      // 这一步通常不会被封，Archive.org 很开放
      let archiveUrl = null;
      try {
        const archiveApiUrl = `https://archive.org/wayback/available?url=${playerUrl}`;
        const archiveRes = await fetch(archiveApiUrl);
        const archiveData = await archiveRes.json();
        if (archiveData.archived_snapshots && archiveData.archived_snapshots.closest) {
          archiveUrl = archiveData.archived_snapshots.closest.url;
        }
      } catch (e) {
        console.error("Archive Check Failed:", e);
        // Archive 失败不影响主流程
      }

      // 4. 返回成功结果
      return new Response(JSON.stringify({
        name: name,
        source: "Google API",
        url: archiveUrl,           // 优先展示存档
        original_url: playerUrl,   // 原链接
        has_archive: !!archiveUrl
      }), {
        headers: corsHeaders,
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker Error", details: e.message }), { status: 500, headers: corsHeaders });
    }
  },
};
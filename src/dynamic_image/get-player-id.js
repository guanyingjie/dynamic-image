/**
 * Cloudflare Worker: Kyureki Finder (Google API Edition) - 增加缓存功能
 */

// 🔴 必须替换这里的内容 🔴
const GOOGLE_API_KEY = "AIzaSyB_ClNsdqcSQTykK7qVNyIccDWDIbC4bTs";
const GOOGLE_CX_ID = "e5d247b3ac13f4d63";

// 缓存配置
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 缓存有效期：24小时

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

    // 构造缓存Key (基于原始请求URL)
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;

    // ----------------------------------------------------
    // 1. 尝试从缓存中获取结果
    // ----------------------------------------------------
    let cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      console.log(`[Cache] 命中缓存: ${name}`);

      // 可以选择在这里实现 Stale-While-Revalidate (SWR) 策略：
      // 如果缓存已过期，在后台发起新的请求并更新缓存，但立即返回旧的缓存结果。
      // 为简化，我们先直接返回缓存结果。如果需要 SWR，需要更复杂的逻辑判断TTL。

      // Cloudflare 默认缓存通常不提供精细的 TTL 控制，
      // 我们直接使用缓存控制头来控制过期。
      return cachedResponse;
    }

    // ----------------------------------------------------
    // 2. 缓存未命中，执行 API 查找
    // ----------------------------------------------------
    console.log(`[Cache] 未命中，执行 Google API 搜索: ${name}`);

    try {
      // 1. 构造 Google API 请求
      const googleApiUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(name)}&num=1`;

      const googleRes = await fetch(googleApiUrl);

      if (!googleRes.ok) {
        const errText = await googleRes.text();
        console.error("Google API Error:", errText);
        return new Response(JSON.stringify({ error: "Search Service Error", details: "API Key配置错误或额度耗尽" }), { status: 500, headers: corsHeaders });
      }

      const data = await googleRes.json();
      let playerUrl = null;

      // 2. 提取链接
      if (data.items && data.items.length > 0) {
        const firstResult = data.items[0];
        if (firstResult.link && firstResult.link.includes("/player/")) {
           playerUrl = firstResult.link;
        }
      }

      if (!playerUrl) {
        // 未找到结果的响应不应该缓存太久，避免短期内重复请求失败。
        const notFoundResponse = new Response(JSON.stringify({
          error: "未找到该球员",
          source: "Google API",
          details: "Google 收录中未找到匹配结果"
        }), { status: 404, headers: corsHeaders });

        // 可以选择缓存 404 响应，但设置较短的 TTL
        // ctx.waitUntil(cache.put(cacheKey, notFoundResponse.clone(), { expirationTtl: 60 * 10 })); // 10分钟

        return notFoundResponse;
      }

      console.log(`[Google API] 找到链接: ${playerUrl}`);

      // 3. (可选) 获取 Wayback Machine 存档
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
      const responseBody = JSON.stringify({
        name: name,
        source: "Google API",
        url: archiveUrl,           // 优先展示存档
        original_url: playerUrl,   // 原链接
        has_archive: !!archiveUrl
      });

      // 构造最终响应，并添加缓存头
      const finalResponse = new Response(responseBody, {
        headers: {
          ...corsHeaders,
          // Worker 缓存控制头：缓存该响应 24 小时
          "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
        },
      });

      // ----------------------------------------------------
      // 5. 异步将结果存入缓存
      // ----------------------------------------------------
      // 使用 ctx.waitUntil 确保缓存操作在 Worker 响应后继续完成
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));

      return finalResponse;

    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker Error", details: e.message }), { status: 500, headers: corsHeaders });
    }
  },
};
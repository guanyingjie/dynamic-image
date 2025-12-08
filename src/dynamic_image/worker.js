/**
 * Cloudflare Worker: Kyureki Finder (Yahoo! Japan Edition)
 * 核心策略：利用日本雅虎的 site: 语法进行外部精准搜索
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const params = url.searchParams;
    const name = params.get("name");

    const corsHeaders = {
      "content-type": "application/json;charset=UTF-8",
      "Access-Control-Allow-Origin": "*"
    };

    if (!name) {
      return new Response(JSON.stringify({ error: "请提供 name 参数" }), { status: 400, headers: corsHeaders });
    }

    try {
      // 构造 Yahoo! Japan 搜索链接
      // 使用 site:kyureki.com 强制限定在球历网内搜索
      const searchQuery = `${name} site:kyureki.com`;
      const searchUrl = `https://search.yahoo.co.jp/search?p=${encodeURIComponent(searchQuery)}`;

      console.log(`正在尝试 Yahoo! Japan 搜索: ${searchUrl}`);

      const searchRes = await fetch(searchUrl, {
        headers: {
          // 模拟常见的 Windows Chrome 浏览器
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
          "Referer": "https://www.yahoo.co.jp/"
        }
      });

      let playerUrl = null;

      // 解析 Yahoo 结果
      // 雅虎的真实链接有时会包裹在重定向里，但通常 href 还是会包含目标域名的
      await new HTMLRewriter()
        .on('a', {
          element(element) {
            const href = element.getAttribute("href");

            // 核心判断：链接里必须包含 "kyureki.com/player/"
            // 且过滤掉 Yahoo 自身的缓存链接 (cache.yahoofs.jp)
            if (!playerUrl && href && href.includes("kyureki.com/player/") && !href.includes("cache.yahoofs")) {

              // 简单清洗：有时候 Yahoo 会把链接编码，尝试解码一下
              try {
                  const decoded = decodeURIComponent(href);
                  // 有些 Yahoo 链接是 /RU=aHR0cHM... 这种加密格式，
                  // 但如果 href 直接包含明文 kyureki.com 最好。
                  // 如果是 Yahoo 的跳转链接 (r.yahoo.co.jp)，我们很难在 Worker 里解开，
                  // 但通常 Yahoo 搜索结果标题的 href 是直链。
                  playerUrl = href;
              } catch (e) {
                  playerUrl = href;
              }
            }
          }
        })
        .transform(searchRes)
        .text();

      // 如果 Yahoo 没找到，或者被拦截了
      if (!playerUrl) {
        // 这里我们可以打印一下 Yahoo 返回了什么状态，方便调试
        console.log("Yahoo Search Status:", searchRes.status);
        return new Response(JSON.stringify({
            error: "未找到该球员主页",
            source: "Yahoo! Japan",
            details: "可能是没有收录，或者 Yahoo 拦截了 Cloudflare IP"
        }), { status: 404, headers: corsHeaders });
      }

      console.log("Yahoo 找到了链接:", playerUrl);

      // ============================================================
      // 获取 Archive 链接 (标准流程)
      // ============================================================
      const archiveApiUrl = `https://archive.org/wayback/available?url=${playerUrl}`;
      const archiveApiRes = await fetch(archiveApiUrl);
      const archiveData = await archiveApiRes.json();

      let archiveUrl = null;
      if (archiveData.archived_snapshots && archiveData.archived_snapshots.closest) {
        archiveUrl = archiveData.archived_snapshots.closest.url;
      }

      // 返回结果
      return new Response(JSON.stringify({
        name: name,
        source: "Yahoo! Japan",
        url: archiveUrl,             // 如果有存档，则是存档链接
        original_url: playerUrl,     // 哪怕没存档，至少你可以拿到原链接
        has_archive: !!archiveUrl
      }), {
        headers: corsHeaders,
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker Error", details: e.message }), { status: 500, headers: corsHeaders });
    }
  },
};
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 获取日期参数 (例如: 2024-5-1 或 2024-05-01)
    const dateParam = url.searchParams.get("date");

    if (!dateParam) {
      return new Response("Missing 'date' parameter. Usage: ?date=YYYY-MM-DD", { status: 400 });
    }

    try {
      // 2. 解析日期并【强制补零】
      const parts = dateParam.split('-');
      if (parts.length !== 3) {
        return new Response("Invalid date format. Please use YYYY-MM-DD", { status: 400 });
      }

      const year = parts[0];
      // 核心修复：把 "5" 变成 "05"，把 "10" 保持 "10"
      const month = parts[1].padStart(2, '0');

      // 3. 构造 NPB 官网目标 URL
      // 正确格式示例: https://npb.jp/games/2024/schedule_05_detail.html
      const targetUrl = `https://npb.jp/games/${year}/schedule_${month}_detail.html`;

      console.log(`[Proxy] Fetching: ${targetUrl}`);

      // 4. 发起请求
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          // NPB 官网反爬不严，但带上 UA 是好习惯
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      // 5. 错误处理
      if (!response.ok) {
        if (response.status === 404) {
          // 如果是 404，说明该年该月的赛程表还没发布（比如 2025年5月）
          return new Response("NPB Schedule Page Not Found (Year/Month might be invalid)", { status: 404 });
        }
        return new Response(`Upstream Error: ${response.statusText}`, { status: response.status });
      }

      // 6. 返回 HTML 给你的微信云函数
      // NPB 官网通常是 UTF-8，直接返回 text 即可
      const html = await response.text();

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // 允许跨域（方便调试）
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (e) {
      // 捕获代码本身的异常
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
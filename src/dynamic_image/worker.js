/**
 * Cloudflare Worker: Kyureki Player Archive Searcher (Enhanced Parsing)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const params = url.searchParams;
    const name = params.get("name");

    if (!name) {
      return new Response(JSON.stringify({ error: "请提供 name 参数" }), {
        status: 400,
        headers: { "content-type": "application/json;charset=UTF-8" },
      });
    }

    try {
      // === 第一步：使用搜索引擎 (DuckDuckGo Lite) 查找 kyureki.com 链接 ===
      // (这一步保持不变，依然利用搜索引擎的容错能力)
      const searchQuery = `${name} site:kyureki.com`;
      const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(searchQuery)}`;

      const searchRes = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept-Language": "ja-JP"
        }
      });

      let playerUrl = null;
      await new HTMLRewriter()
        .on('a.result-link', {
          element(element) {
            const href = element.getAttribute("href");
            if (!playerUrl && href && href.includes("kyureki.com/player/")) {
              playerUrl = href;
            }
          }
        })
        .transform(searchRes)
        .text();

      if (!playerUrl) {
        return new Response(JSON.stringify({ error: "未找到该球员主页", query: searchQuery }), { status: 404 });
      }

      // === 第二步：获取 Archive.org 链接 ===
      const archiveApiUrl = `https://archive.org/wayback/available?url=${playerUrl}`;
      const archiveApiRes = await fetch(archiveApiUrl);
      const archiveData = await archiveApiRes.json();

      if (!archiveData.archived_snapshots || !archiveData.archived_snapshots.closest) {
        return new Response(JSON.stringify({ error: "Wayback Machine 无存档", original_url: playerUrl }), { status: 404 });
      }
      const archiveUrl = archiveData.archived_snapshots.closest.url;


      // === 第三步：获取并精细解析 HTML 内容 ===
      const contentRes = await fetch(archiveUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }
      });

      // 数据容器
      let result = {
        name: name,
        source: "kyureki.com (Archive)",
        url: archiveUrl,
        profile: {},
        history: [],   // 对应“全国大会”
        raw_resume: "" // 对应可能存在的“经歴”
      };

      // 解析状态变量
      let currentKey = "";
      let tempVal = "";

      await new HTMLRewriter()
        // 1. 抓取名字 (通常在 h1)
        .on('h1', {
           text(chunk) { if(chunk.text.trim()) result.name = chunk.text.trim(); }
        })
        // 2. 遇到新的一行 tr，重置临时变量
        .on('tbody tr', {
          element(el) {
            currentKey = "";
            tempVal = "";
          }
        })
        // 3. 抓取 Key (第一列)
        .on('tbody tr td:nth-child(1)', {
          text(chunk) {
            // 累加文本（去除空白），例如 <b>世代</b> -> "世代"
            const text = chunk.text.trim();
            if (text) currentKey += text;
          }
        })
        // 4. 抓取 Value (第二列) 的文本内容
        .on('tbody tr td:nth-child(2)', {
          text(chunk) {
            // 累加文本，保留之前的空格以防粘连
            if (currentKey && chunk.text) {
                // 直接写入 result 对象，实现流式更新
                // 如果是第一次写入，初始化；否则追加
                if (!result.profile[currentKey]) result.profile[currentKey] = "";
                result.profile[currentKey] += chunk.text;
            }
          }
        })
        // 5. 【关键】遇到 <br> 标签时，手动插入换行符
        // 这样 "EventA<br>EventB" 就会变成 "EventA\nEventB"
        .on('tbody tr td:nth-child(2) br', {
          element(el) {
             if (currentKey && result.profile[currentKey]) {
                 result.profile[currentKey] += "\n";
             }
          }
        })
        .transform(contentRes)
        .text();

      // === 第四步：数据清洗与格式化 ===
      // 在流式解析结束后，我们需要对数据进行清理，特别是把“全国大会”从 profile 移到 history

      const finalProfile = {};

      for (const [key, value] of Object.entries(result.profile)) {
          // 清理多余的空白字符，但保留换行符
          let cleanValue = value.replace(/[ \t]+/g, " ").trim();

          if (key.includes("全国大会")) {
              // 处理全国大会：按换行符分割成数组
              result.history = cleanValue
                  .split("\n")
                  .map(s => s.trim())
                  .filter(s => s.length > 0); // 过滤空行
          }
          else if (key.includes("経歴") || key.includes("球歴")) {
              // 处理履历路径
              result.raw_resume = cleanValue;
          }
          else {
              // 普通资料
              finalProfile[key] = cleanValue;
          }
      }

      result.profile = finalProfile;

      return new Response(JSON.stringify(result), {
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "Access-Control-Allow-Origin": "*"
        },
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker Error", details: e.message }), { status: 500 });
    }
  },
};
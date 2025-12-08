export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);

    // 1. 获取 URL 参数
    let targetUrl = requestUrl.searchParams.get("url");
    if (!targetUrl) {
      const fullUrlString = request.url.toString();
      const idx = fullUrlString.indexOf("?url=");
      if (idx !== -1) targetUrl = fullUrlString.substring(idx + 5);
    }
    if (!targetUrl) return new Response(JSON.stringify({ error: "Missing ?url=" }), { status: 400 });

    // 2. Archive.org 加速处理 (自动插入 id_)
    let fastUrl = targetUrl;
    if (fastUrl.includes("web.archive.org") && !fastUrl.includes("id_/")) {
       fastUrl = fastUrl.replace(/\/web\/(\d{14})\//, '/web/$1id_/');
    }

    try {
      // 3. 下载 HTML
      const htmlContent = await fetchPartialHTML(fastUrl);

      // 4. 清洗与降噪 (修复了正则语法问题)
      let textProcessor = htmlContent;

      // 分步替换，避免链式调用中的语法陷阱
      textProcessor = textProcessor.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
      textProcessor = textProcessor.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
      // ⬇️ 修正点：使用正确的正则匹配 HTML 注释 textProcessor = textProcessor.replace(//g, "");
      textProcessor = textProcessor.replace(/<nav[\s\S]*?>[\s\S]*?<\/nav>/gi, "");
      textProcessor = textProcessor.replace(/<header[\s\S]*?>[\s\S]*?<\/header>/gi, "");

      // 5. 提取核心表格 (基本资料)
      const tableMatches = textProcessor.match(/<table[\s\S]*?<\/table>/gi) || [];

      // 筛选逻辑：
      // 1. 扔掉包含 "打数"(At bats), "安打"(Hits), "防御率" 的比赛数据表
      // 2. 保留包含 "身長", "投打", "生年月日", "経歴" 的资料表
      const usefulTables = tableMatches.filter(t => {
        if (t.includes("打数") || t.includes("安打") || t.includes("防御率") || t.includes("試合")) return false;
        return t.includes("身長") || t.includes("投打") || t.includes("生年月日") || t.includes("経歴");
      }).join("\n");

      // 6. 提取文本 (经歴 & 寸评)
      // 移除标签转纯文本
      let rawText = textProcessor.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

      // 定位开始：找“経歴”或者“プロフィール”
      let startIndex = rawText.indexOf("経歴 ✏");
      if (startIndex === -1) startIndex = rawText.indexOf("経歴");
      if (startIndex === -1) startIndex = rawText.indexOf("プロフィール");

      // 定位结束：找“寸評について”或者“情報提供”
      let endIndex = rawText.indexOf("寸評について");
      if (endIndex === -1) endIndex = rawText.indexOf("情報提供");
      if (endIndex === -1) endIndex = rawText.length;

      let narrativeText = "";
      if (startIndex !== -1 && endIndex > startIndex) {
        narrativeText = rawText.substring(startIndex, endIndex);
      } else {
        // 兜底：截取前2000字
        const nameIndex = rawText.indexOf("のプロフィール");
        const safeStart = Math.max(0, nameIndex);
        const safeEnd = Math.min(rawText.length, safeStart + 2000);
        narrativeText = rawText.substring(safeStart, safeEnd);
      }

      // 进一步清理无用词汇
      narrativeText = narrativeText
        .replace(/✏ 編集/g, "")
        .replace(/シェア/g, "")
        .replace(/ファン登録/g, "")
        .replace(/画像をタップすると動画が再生されます。/g, "")
        .replace(/ログイン/g, "");

      // 7. 拼接最终结果
      const finalPayload = `
      【基本资料表格】:
      ${usefulTables}
      
      【履历与评价文本】:
      ${narrativeText}
      `;

      return new Response(JSON.stringify({
        status: "success",
        html: finalPayload,
        source: fastUrl
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  },
};

// 下载函数
async function fetchPartialHTML(url) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let result = "";
    let len = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
      len += value.length;
      if (len > 150 * 1024) { await reader.cancel(); break; }
    }
    return result;
  } catch(e) { throw e; }
}
/**
 * Cloudflare Worker: Kyureki Finder (Google API Edition) - 增加缓存功能
 */

// 🔴 必须替换这里的内容 🔴
const GOOGLE_API_KEY = "AIzaSyB_ClNsdqcSQTykK7qVNyIccDWDIbC4bTs";
const GOOGLE_CX_ID = "e5d247b3ac13f4d63";

// 🎯 精选人名映射表 (仅保留人名常用字，约120个)
const CN_JP_MAP = {
  // --- 顶级高频 (姓氏/名字核心字) ---
  '泽': '沢', '岛': '島', '广': '廣', '边': '辺', '齐': '斉',
  '斋': '斎', '滨': '浜', '关': '関', '冈': '岡', '宫': '宮',
  '泷': '滝', '荣': '栄', '卫': '衛', '礼': '禮', '万': '萬','垒':'塁',

  // --- 名字常用形容词/名词 ---
  '气': '気', '实': '実', '惠': '恵', '丰': '豊', '乐': '楽',
  '亚': '亜', '恶': '悪', '圆': '円', '艳': '艶', '樱': '桜',
  '应': '応', '归': '帰', '龟': '亀', '义': '義', '菊': '菊',
  '吉': '吉', '举': '挙', '旧': '旧', '巨': '巨', '与': '與',
  '龙': '竜', '宽': '寛', '户': '戸', '庆': '慶', '伦': '倫',
  '伟': '偉', '仪': '儀', '优': '優', '勋': '勲', '华': '華',
  '发': '発', '启': '啓', '园': '園', '圣': '聖', '坚': '堅',
  '增': '増', '寿': '寿', '奖': '奨', '孙': '孫', '学': '学',
  '宁': '寧', '宝': '宝', '将': '将', '尧': '尭', '强': '強',
  '彻': '徹', '德': '徳', '显': '顕', '晓': '暁', '晖': '暉',
  '权': '権', '杨': '楊', '杰': '傑', '极': '極', '构': '構',
  '枫': '楓', '查': '査', '桧': '桧', '梁': '梁', '梦': '夢',
  '检': '検', '榆': '楡', '榉': '欅', '赖': '頼', '涉': '渉',
  '润': '潤', '涩': '渋', '渊': '淵', '满': '満', '灵': '霊',
  '灿': '燦', '炼': '錬', '焕': '煥', '熏': '薫', '爱': '愛',
  '尔': '爾', '犹': '猶', '狮': '獅', '荧': '蛍', '荫': '蔭',
  '药': '薬', '庄': '荘', '莓': '苺', '苍': '蒼', '蓝': '藍',
  '藏': '蔵', '艺': '芸', '薮': '藪', '薰': '薫', '见': '見',
  '规': '規', '觉': '覚', '亲': '親', '观': '観', '诚': '誠',
  '详': '詳', '谦': '謙', '谨': '謹', '贞': '貞', '贤': '賢',
  '质': '質', '贯': '貫', '贵': '貴', '贺': '賀', '赞': '賛',
  '辉': '輝', '选': '選', '连': '連', '进': '進', '逸': '逸',
  '迟': '遅', '辽': '遼', '释': '釈', '钦': '欽', '钱': '銭',
  '铁': '鉄', '铃': '鈴', '铭': '銘', '锐': '鋭', '银': '銀',
  '锦': '錦', '锻': '鍛', '兰': '蘭', '镰': '鎌', '长': '長',
  '门': '門', '闻': '聞', '阳': '陽', '阴': '陰', '陆': '陸',
  '难': '難', '霸': '覇', '韩': '韓', '顺': '順', '须': '須',
  '顾': '顧', '颖': '穎', '颜': '顔', '飒': '颯', '飞': '飛',
  '马': '馬', '驰': '馳', '驹': '駒', '骏': '駿', '鹤': '鶴',
  '鹫': '鷲', '鹭': '鷺', '鹰': '鷹', '黑': '黒'
};

function convertToJapaneseKanji(text) {
  if (!text) return "";
  return text.split('').map(char => CN_JP_MAP[char] || char).join('');
}

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
    // let cachedResponse = await cache.match(cacheKey);

    // if (cachedResponse) {
    //   console.log(`[Cache] 命中缓存: ${name}`);

    //   return cachedResponse;
    // }

    // ----------------------------------------------------
    // 2. 缓存未命中，执行 API 查找
    // ----------------------------------------------------
    console.log(`[Cache] 未命中，执行 Google API 搜索: ${name}`);

    const searchName = convertToJapaneseKanji(name);
    console.log(`[Search] ${name} -> ${searchName}`);

    try {
      // 1. 构造 Google API 请求
      const googleApiUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(searchName)}&num=1`;

      console.log(`Google API URL: ${googleApiUrl}`);
      const googleRes = await fetch(googleApiUrl);

      if (!googleRes.ok) {
        const errText = await googleRes.text();
        console.error("Google API Error:", errText);
        return new Response(JSON.stringify({ error: "Search Service Error", details: "API Key配置错误或额度耗尽" }), { status: 500, headers: corsHeaders });
      }

      const data = await googleRes.json();
      let finalPlayerUrl = null;
      let rawFoundUrl = null;

      // 4. ⚡️ 核心逻辑：遍历结果，强制提取 ID 并重组 URL ⚡️
      if (data.items && data.items.length > 0) {
        // 遍历所有返回结果 (防止第一个是无ID的新闻页)
        for (const item of data.items) {
          const rawUrl = item.link;

          // 正则匹配 ID
          // 兼容: /player/12345, /keiyaku/p12345, /score/12345
          // 逻辑: 域名后 -> 任意路径 -> (可选p) -> 连续数字 -> (可选/)
          const match = rawUrl.match(/kyureki\.com\/[a-z]+\/(?:p)?(\d+)\/?/);

          if (match && match[1]) {
            // 找到了 ID！
            const playerId = match[1];

            // 强制重组为标准档案页
            finalPlayerUrl = `https://www.kyureki.com/player/${playerId}/`;
            rawFoundUrl = rawUrl; // 记录一下是从哪个链接提取的

            console.log(`[ID Extraction] Found ID ${playerId} in ${rawUrl} -> ${finalPlayerUrl}`);
            break; // 找到一个就收工，不再看后面的结果
          }
        }
      }

      if (!finalPlayerUrl) {
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

      console.log(`[Google API] 找到链接: ${finalPlayerUrl}`);

      let archiveUrl = null;
      try {
        const archiveApiUrl = `https://archive.org/wayback/available?url=${finalPlayerUrl}`;
        const archiveRes = await fetch(archiveApiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        // const archiveRes = await fetch(archiveApiUrl);
        const archiveData = await archiveRes.json();
        if (archiveData.archived_snapshots && archiveData.archived_snapshots.closest) {
          archiveUrl = archiveData.archived_snapshots.closest.url;
        }
      } catch (e) {
        console.error("Archive Check Failed:", e);
        return new Response(JSON.stringify({ error: "Can't get archive link", details: e.message }), { status: 500, headers: corsHeaders });
        // Archive 失败不影响主流程
      }

      // 4. 返回成功结果
      const responseBody = JSON.stringify({
        name: name,
        source: "Google API",
        url: archiveUrl,           // 优先展示存档
        original_url: finalPlayerUrl,   // 原链接
        extracted_from: rawFoundUrl,
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
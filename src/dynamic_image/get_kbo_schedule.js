export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 获取日期参数
    let dateParam = url.searchParams.get("date");
    if (!dateParam) {
      dateParam = new Date().toISOString().split('T')[0];
    }

    const targetUrl = `https://mykbostats.com/schedule/week_of/${dateParam}`;

    try {
      // 2. 下载网页
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();

      // 3. ⚡️ 解析逻辑 (针对 provided HTML) ⚡️
      const games = [];

      // 步骤 A: 按 <h3> 切割，每一块代表一天 (除了第一块是头部)
      // HTML结构: <h3><time datetime="...">...</time></h3> ...games...
      const dayBlocks = html.split('<h3');

      // 从第 1 块开始遍历 (第0块是导航栏废话)
      for (let i = 1; i < dayBlocks.length; i++) {
        // 补回被切掉的 <h3 方便处理
        const block = '<h3' + dayBlocks[i];

        // --- 提取日期 ---
        // 寻找 <time ... datetime="2025-06-10T09:30:00Z">
        const timeMatch = block.match(/datetime="([^"]+)"/);
        let gameDate = "Unknown";
        if (timeMatch) {
          // 提取 2025-06-10
          gameDate = timeMatch[1].split('T')[0];
        }

        // --- 提取这一天的所有比赛 ---
        // 比赛被包裹在 <a ... class="game-line" ...> ... </a> 中
        // 我们用 split 切分每个 game-line
        const gameChunks = block.split('class="game-line"');

        // 从第 1 块开始 (第0块是 h3 日期部分)
        for (let j = 1; j < gameChunks.length; j++) {
          const gameHtml = gameChunks[j];

          // --- 提取数据 ---

          // 1. 提取客队 (Away)
          // <div class="away-team">Lotte <span ...>Giants</span></div>
          const awayMatch = gameHtml.match(/class="away-team">([\s\S]*?)<\/div>/);
          const awayTeam = awayMatch ? cleanText(awayMatch[1]) : "Unknown";

          // 2. 提取主队 (Home)
          // <div class="home-team">KT <span ...>Wiz</span></div>
          const homeMatch = gameHtml.match(/class="home-team">([\s\S]*?)<\/div>/);
          const homeTeam = homeMatch ? cleanText(homeMatch[1]) : "Unknown";

          // 3. 判断状态 (比分 or 取消)
          let status = "RESULT"; // 默认为有结果
          let homeScore = 0;
          let awayScore = 0;
          let infoText = "";

          // 检查是否取消 (Canceled)
          if (gameHtml.includes('class="status"')) {
             // 提取 <div class="status">Canceled</div>
             const statusMatch = gameHtml.match(/class="status">\s*([\s\S]*?)\s*<\/div>/);
             const reasonMatch = gameHtml.match(/class="reason">\s*([\s\S]*?)\s*<\/div>/);

             status = "CANCEL";
             const reason = reasonMatch ? cleanText(reasonMatch[1]) : "";
             infoText = statusMatch ? cleanText(statusMatch[1]) : "Canceled";
             if (reason) infoText += ` (${reason})`;
          }
          else {
             // 提取比分 <span class="score away-score">3</span>
             const awayScoreMatch = gameHtml.match(/class="score away-score">(\d+)<\/span>/);
             const homeScoreMatch = gameHtml.match(/class="score home-score">(\d+)<\/span>/);

             if (awayScoreMatch && homeScoreMatch) {
                awayScore = parseInt(awayScoreMatch[1]);
                homeScore = parseInt(homeScoreMatch[1]);
                infoText = `${awayScore} : ${homeScore}`;

                // 检查是否还在进行中 (Inning)
                // <div class="inning">Final</div>
                const inningMatch = gameHtml.match(/class="inning">\s*([\s\S]*?)\s*<\/div>/);
                const inningText = inningMatch ? cleanText(inningMatch[1]) : "";

                if (!inningText.includes("Final")) {
                  status = "PROGRESS"; // 如果不是 Final，就是进行中
                } else {
                  status = "RESULT";
                }

                // 附加局数信息 (如 Final/12)
                if (inningText !== "Final") {
                   infoText += ` (${inningText})`;
                }
             } else {
                // 如果没有比分也没有取消，可能是赛前 (Preview)
                // 该网站赛前通常不显示比分 span
                status = "BEFORE";
                infoText = "VS";
             }
          }

          games.push({
            date: gameDate,
            status: status, // BEFORE, PROGRESS, RESULT, CANCEL
            home: homeTeam,
            away: awayTeam,
            home_score: homeScore,
            away_score: awayScore,
            display_info: infoText // "3 : 12 (Final)" 或 "Canceled (Rained Out)"
          });
        }
      }

      return new Response(JSON.stringify({
        status: "success",
        count: games.length,
        data: games
      }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  },
};

// 辅助函数：清洗 HTML 标签和多余空格
function cleanText(str) {
  if (!str) return "";
  // 1. 去掉 HTML 标签
  const noTags = str.replace(/<[^>]+>/g, " ");
  // 2. 将多余的空格、换行换成一个空格
  return noTags.replace(/\s+/g, " ").trim();
}
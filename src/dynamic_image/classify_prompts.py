"""
使用 Gemini API 对 Midjourney 视频 prompts 进行分类
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List
import google.generativeai as genai
from dotenv import load_dotenv


# 配置文件路径
PROJECT_ROOT = Path(__file__).parent.parent.parent
PROMPT_FILE = PROJECT_ROOT / "prompt.md"
SOURCE_JSON = PROJECT_ROOT / "images" / "source.json"
RESULT_DIR = PROJECT_ROOT / "result"

# 加载 .env 文件
load_dotenv(PROJECT_ROOT / ".env")


def load_classification_prompt() -> str:
    """加载分类提示词"""
    try:
        with open(PROMPT_FILE, 'r', encoding='utf-8') as f:
            prompt_content = f.read()
        print(f"✅ 成功加载分类提示词: {PROMPT_FILE}")
        return prompt_content
    except FileNotFoundError:
        print(f"❌ 找不到提示词文件: {PROMPT_FILE}")
        raise
    except Exception as e:
        print(f"❌ 加载提示词失败: {e}")
        raise


def load_source_data() -> List[Dict]:
    """加载源数据 JSON"""
    try:
        with open(SOURCE_JSON, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"✅ 成功加载源数据: {len(data)} 条记录")
        return data
    except FileNotFoundError:
        print(f"❌ 找不到源数据文件: {SOURCE_JSON}")
        raise
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析错误: {e}")
        raise


def prepare_input_for_gemini(data: List[Dict]) -> str:
    """准备发送给 Gemini 的输入数据（简化格式）"""
    simplified_data = []
    
    for item in data:
        video_id = item.get('id')
        prompt_obj = item.get('prompt', {})
        decoded_prompts = prompt_obj.get('decodedPrompt', [])
        
        if decoded_prompts and len(decoded_prompts) > 0:
            content = decoded_prompts[0].get('content', '')
            simplified_data.append({
                "id": video_id,
                "prompt": {
                    "decodedPrompt": [
                        {"content": content}
                    ]
                }
            })
    
    return json.dumps(simplified_data, ensure_ascii=False, indent=2)


def init_gemini_api(api_key: str = None):
    """初始化 Gemini API"""
    if api_key is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key is None:
            raise ValueError(
                "请设置环境变量 GEMINI_API_KEY\n"
                "例如: export GEMINI_API_KEY='your-api-key'"
            )
    
    genai.configure(api_key=api_key)
    print(f"✅ Gemini API 初始化完成")


def classify_with_gemini(
    classification_prompt: str,
    input_data: str,
    model_name: str = "gemini-2.0-flash-exp",
    temperature: float = 0.1
) -> Dict:
    """使用 Gemini 模型进行分类"""
    
    print(f"🤖 使用模型: {model_name}")
    print(f"📊 输入数据长度: {len(input_data)} 字符")
    
    # 创建模型实例
    model = genai.GenerativeModel(
        model_name=model_name,
        generation_config={
            "temperature": temperature,
            "max_output_tokens": 8192,
            "response_mime_type": "application/json"
        }
    )
    
    # 构建完整的提示词
    full_prompt = f"""
{classification_prompt}

# Input Data (输入数据)
请分析以下 JSON 数据并按照上述标准进行分类：

```json
{input_data}
```

请直接输出分类结果的 JSON，不要包含任何其他文字说明。
"""
    
    print("🚀 正在调用 Gemini 模型进行分类...")
    print("⏳ 这可能需要几分钟，请稍候...")
    
    try:
        # 调用模型
        response = model.generate_content(full_prompt)
        
        print("✅ Gemini 模型返回成功")
        
        # 获取返回文本
        result_text = response.text
        
        # 清理可能的 markdown 代码块标记
        result_text = result_text.strip()
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.startswith("```"):
            result_text = result_text[3:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]
        result_text = result_text.strip()
        
        # 保存原始返回（用于调试）
        RESULT_DIR.mkdir(exist_ok=True)
        debug_file = RESULT_DIR / "debug_response.txt"
        with open(debug_file, 'w', encoding='utf-8') as f:
            f.write(result_text)
        print(f"📝 原始返回已保存到: {debug_file}")
        
        # 解析 JSON
        try:
            result_json = json.loads(result_text)
        except json.JSONDecodeError as e:
            print(f"❌ JSON 解析错误: {e}")
            print(f"📄 返回内容长度: {len(result_text)} 字符")
            print(f"📄 返回内容的前 500 字符:")
            print(result_text[:500])
            print(f"\n📄 返回内容的后 500 字符:")
            print(result_text[-500:])
            print(f"\n💡 完整内容已保存到: {debug_file}")
            raise
        
        return result_json
    
    except Exception as e:
        print(f"❌ 调用 Gemini 模型失败: {e}")
        raise


def merge_classification_results(results: List[Dict]) -> Dict:
    """合并多个分类结果"""
    merged = {}
    
    for result in results:
        for category, items in result.items():
            if category not in merged:
                merged[category] = []
            merged[category].extend(items)
    
    return merged


def save_result(result: Dict, filename: str = None):
    """保存分类结果到 result 目录"""
    # 创建 result 目录（如果不存在）
    RESULT_DIR.mkdir(exist_ok=True)
    
    # 生成文件名（如果未指定）
    if filename is None:
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"classification_result_{timestamp}.json"
    
    output_path = RESULT_DIR / filename
    
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 分类结果已保存到: {output_path}")
        
        # 打印统计信息
        print("\n📊 分类统计:")
        total_items = 0
        for category, items in result.items():
            count = len(items)
            total_items += count
            print(f"  • {category}: {count} 个")
        print(f"\n  总计: {total_items} 个条目被分类")
    
    except Exception as e:
        print(f"❌ 保存结果失败: {e}")
        raise


def main():
    """主函数"""
    print("=" * 80)
    print("🎨 Midjourney Prompt 智能分类系统 (Powered by Gemini)")
    print("=" * 80)
    
    # 配置批处理参数
    BATCH_SIZE = 100  # 每批处理的数据量
    
    try:
        # 1. 初始化 Gemini API
        print("\n🔑 步骤 1: 初始化 Gemini API")
        api_key = os.getenv("GEMINI_API_KEY")
        init_gemini_api(api_key=api_key)
        
        # 2. 加载分类提示词
        print("\n📖 步骤 2: 加载分类提示词")
        classification_prompt = load_classification_prompt()
        
        # 3. 加载源数据
        print("\n📂 步骤 3: 加载源数据")
        source_data = load_source_data()
        total_items = len(source_data)
        
        # 4. 分批处理
        print(f"\n🔧 步骤 4: 准备分批处理")
        num_batches = (total_items + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"✅ 总共 {total_items} 条数据，将分为 {num_batches} 批处理")
        print(f"   每批处理 {BATCH_SIZE} 条数据")
        
        # 5. 调用 Gemini 进行分类（分批）
        print("\n🤖 步骤 5: 调用 Gemini 模型进行分类")
        print("=" * 80)
        
        all_results = []
        
        for batch_idx in range(num_batches):
            start_idx = batch_idx * BATCH_SIZE
            end_idx = min(start_idx + BATCH_SIZE, total_items)
            batch_data = source_data[start_idx:end_idx]
            
            print(f"\n📦 批次 {batch_idx + 1}/{num_batches}")
            print(f"   处理第 {start_idx + 1} 到 {end_idx} 条数据 (共 {len(batch_data)} 条)")
            
            # 准备这一批的输入数据
            input_data = prepare_input_for_gemini(batch_data)
            
            # 调用 Gemini
            try:
                batch_result = classify_with_gemini(classification_prompt, input_data)
                all_results.append(batch_result)
                print(f"   ✅ 批次 {batch_idx + 1} 完成")
            except Exception as e:
                print(f"   ❌ 批次 {batch_idx + 1} 失败: {e}")
                print(f"   ⚠️  将继续处理下一批...")
                # 添加一个空结果，避免中断整个流程
                all_results.append({})
            
            # 批次之间稍作延迟，避免触发 API 限流
            if batch_idx < num_batches - 1:
                import time
                print(f"   ⏳ 等待 2 秒后继续...")
                time.sleep(2)
        
        # 6. 合并结果
        print("\n🔗 步骤 6: 合并分类结果")
        final_result = merge_classification_results(all_results)
        print(f"✅ 已合并 {len(all_results)} 个批次的结果")
        
        # 7. 保存结果
        print("\n💾 步骤 7: 保存分类结果")
        save_result(final_result)
        
        print("\n" + "=" * 80)
        print("🎉 分类完成！")
        print("=" * 80)
    
    except Exception as e:
        print(f"\n❌ 程序执行失败: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())


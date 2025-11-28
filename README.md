# Dynamic Image

一个用于 Midjourney 视频内容处理和智能分类的 Python 项目。

## 功能特性

1. **视频下载**: 从 Midjourney 批量下载视频内容
2. **智能分类**: 使用 Gemini API 对视频 prompts 进行智能分类
3. **数据管理**: SQLite 数据库记录下载历史和元数据

## 安装

```bash
pip install -r requirements.txt
```

## 项目结构

```
dynamic-image/
├── src/dynamic_image/
│   ├── download_vedio.py      # 视频下载脚本
│   └── classify_prompts.py    # Gemini 分类脚本
├── images/
│   └── source.json            # 视频 prompts 数据源
├── result/                    # 分类结果输出目录
├── downloaded_videos/         # 下载的视频文件
├── prompt.md                  # 分类标准定义
└── requirements.txt           # Python 依赖
```

## 使用方法

### 视频下载

```bash
python src/dynamic_image/download_vedio.py
```

### 智能分类

```bash
# 设置 API Key
export GEMINI_API_KEY="your-api-key"

# 运行分类
python src/dynamic_image/classify_prompts.py
```

## License

MIT License

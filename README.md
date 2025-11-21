# Dynamic Image

A Python project for dynamic image processing.

## Installation

### Development Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd dynamic-image
```

2. Install the package in development mode with dev dependencies:
```bash
pip install -e ".[dev]"
```

Or if you only need the basic dependencies:
```bash
pip install -e .
```

## Project Structure

```
dynamic-image/
├── src/
│   └── dynamic_image/
│       └── __init__.py
├── tests/
│   └── __init__.py
├── pyproject.toml
└── README.md
```

## Usage

```python
from dynamic_image import example_function

# Your code here
```

## Development

### Running Tests

```bash
pytest
```

### Code Formatting

```bash
black src/ tests/
```

### Type Checking

```bash
mypy src/
```

## License

MIT License


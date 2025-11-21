"""Basic tests for the dynamic-image package."""

import dynamic_image


def test_version():
    """Test that the version is defined."""
    assert dynamic_image.__version__ == "0.1.0"


def test_import():
    """Test that the package can be imported."""
    assert dynamic_image is not None


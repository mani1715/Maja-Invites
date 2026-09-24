import pytest_asyncio  # noqa: F401  pytest-asyncio plugin auto-discovery

# Use auto-mode so @pytest.mark.asyncio works without a per-test event_loop fixture.
def pytest_collection_modifyitems(config, items):
    pass

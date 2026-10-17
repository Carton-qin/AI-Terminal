from setuptools import setup, find_packages

setup(
    name="aiterm",
    version="0.1.0",
    description="AI-powered intelligent interactive terminal assistant",
    packages=find_packages(),
    install_requires=[
        "prompt_toolkit>=3.0.40",
        "rich>=13.7.0",
        "openai>=1.20.0",
        "pydantic>=2.5.0",
    ],
    entry_points={
        "console_scripts": [
            "aiterm = aiterm.cli:main",
            "ai = aiterm.cli:main",
        ],
    },
    python_requires=">=3.9",
)

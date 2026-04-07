from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./priestess.db"
    secret_key: str = "change-this-to-a-random-string"

    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""     # 中转站地址，留空则用官方
    openai_model: str = "gpt-4o"  # 中转站可能用不同模型名
    ollama_base_url: str = "http://localhost:11434"

    class Config:
        env_file = ".env"


settings = Settings()

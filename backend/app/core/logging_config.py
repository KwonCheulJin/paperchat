import logging
import logging.handlers
import os
import structlog


def configure_logging() -> None:
    # 로그 파일 경로: SQLITE_PATH와 같은 디렉토리 또는 현재 디렉토리
    sqlite_path = os.environ.get("SQLITE_PATH", "./data/docrag.db")
    log_dir = os.path.dirname(os.path.abspath(sqlite_path))
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "backend.log")

    # 파일 핸들러 (10MB 로테이션, 최대 3개 보관)
    file_handler = logging.handlers.RotatingFileHandler(
        log_path,
        maxBytes=10 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)

    # 콘솔 핸들러 (INFO 이상)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)

    logging.basicConfig(
        level=logging.DEBUG,
        handlers=[file_handler, console_handler],
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # structlog → stdlib → file 핸들러로 라우팅
    formatter = structlog.stdlib.ProcessorFormatter(
        processor=structlog.dev.ConsoleRenderer(),
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)


def get_logger(name: str):
    return structlog.get_logger(name)

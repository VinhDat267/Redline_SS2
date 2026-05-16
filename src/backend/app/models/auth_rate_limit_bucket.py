from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuthRateLimitBucket(Base):
    __tablename__ = "auth_rate_limit_buckets"

    bucket_key: Mapped[str] = mapped_column(String(512), primary_key=True)
    window_start_epoch: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at_epoch: Mapped[int] = mapped_column(Integer, nullable=False)

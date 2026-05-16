"""add google login account fields

Revision ID: e5b7c1a9d2f4
Revises: c76f8a2d1b44
Create Date: 2026-05-06 10:00:00.000000

"""

from __future__ import annotations

import base64
import hashlib
from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5b7c1a9d2f4"
down_revision: str | Sequence[str] | None = "c76f8a2d1b44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PBKDF2_ITERATIONS = 390_000
DEMO_PASSWORD = "redline123"
DEMO_PASSWORD_SALT = "redline-demo-password"


def _urlsafe_b64encode(raw_value: bytes) -> str:
    return base64.urlsafe_b64encode(raw_value).rstrip(b"=").decode("ascii")


def _build_demo_password_hash() -> str:
    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        DEMO_PASSWORD.encode("utf-8"),
        DEMO_PASSWORD_SALT.encode("utf-8"),
        PBKDF2_ITERATIONS,
    )
    return (
        f"pbkdf2_sha256${PBKDF2_ITERATIONS}${DEMO_PASSWORD_SALT}"
        f"${_urlsafe_b64encode(derived_key)}"
    )


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("google_sub", sa.String(length=255), nullable=True))
        batch_op.alter_column(
            "password_hash",
            existing_type=sa.String(length=255),
            nullable=True,
        )

    op.create_index(op.f("ix_users_google_sub"), "users", ["google_sub"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_users_google_sub"), table_name="users")

    demo_password_hash = _build_demo_password_hash()
    op.execute(
        sa.text("UPDATE users SET password_hash = :password_hash WHERE password_hash IS NULL").bindparams(
            password_hash=demo_password_hash
        )
    )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "password_hash",
            existing_type=sa.String(length=255),
            nullable=False,
        )
        batch_op.drop_column("google_sub")

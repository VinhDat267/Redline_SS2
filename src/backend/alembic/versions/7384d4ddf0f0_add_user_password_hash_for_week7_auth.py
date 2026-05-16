"""add user password hash for week 7 auth

Revision ID: 7384d4ddf0f0
Revises: 00950ecca438
Create Date: 2026-03-19 10:30:00.000000

"""

from __future__ import annotations

import base64
import hashlib
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7384d4ddf0f0"
down_revision: Union[str, Sequence[str], None] = "00950ecca438"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

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
    demo_password_hash = _build_demo_password_hash()

    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("password_hash", sa.String(length=255), nullable=True))

    op.execute(
        sa.text("UPDATE users SET password_hash = :password_hash WHERE password_hash IS NULL").bindparams(
            password_hash=demo_password_hash
        )
    )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("password_hash", existing_type=sa.String(length=255), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("password_hash")

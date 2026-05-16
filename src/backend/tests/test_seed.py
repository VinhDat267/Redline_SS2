from sqlalchemy import select

from app.models import User
from app.seed import seed_demo_users


def test_seed_demo_users_is_idempotent(session_factory):
    with session_factory() as session:
        created_users = seed_demo_users(session)
        assert len(created_users) == 3

        created_again = seed_demo_users(session)
        assert len(created_again) == 3

        persisted_users = list(session.scalars(select(User).order_by(User.id)))
        assert len(persisted_users) == 3
        assert [user.email for user in persisted_users] == [
            "vinh@example.com",
            "my@example.com",
            "ly@example.com",
        ]

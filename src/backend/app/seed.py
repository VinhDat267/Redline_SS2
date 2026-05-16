from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import build_demo_password_hash
from app.core.database import SessionLocal
from app.models import User


DEMO_USERS = [
    {"email": "vinh@example.com", "display_name": "Vinh"},
    {"email": "my@example.com", "display_name": "My"},
    {"email": "ly@example.com", "display_name": "Ly"},
]


def seed_demo_users(session: Session) -> list[User]:
    demo_password_hash = build_demo_password_hash()
    existing_users = {
        user.email: user
        for user in session.scalars(select(User).where(User.email.in_([user["email"] for user in DEMO_USERS])))
    }

    for user_payload in DEMO_USERS:
        existing_user = existing_users.get(user_payload["email"])
        if existing_user is None:
            user = User(**user_payload, password_hash=demo_password_hash)
            session.add(user)
            continue

        if existing_user.password_hash != demo_password_hash:
            existing_user.password_hash = demo_password_hash
            session.add(existing_user)

    session.commit()
    return list(session.scalars(select(User).where(User.email.in_([user["email"] for user in DEMO_USERS])).order_by(User.id)))


def main() -> None:
    with SessionLocal() as session:
        users = seed_demo_users(session)
        print(f"Seeded {len(users)} demo users.")
        for user in users:
            print(f"{user.id}: {user.display_name} <{user.email}>")


if __name__ == "__main__":
    main()

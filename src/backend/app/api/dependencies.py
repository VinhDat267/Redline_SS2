from collections.abc import Generator

import hmac

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import AUTH_CSRF_HEADER_NAME, AUTH_SESSION_COOKIE_NAME, verify_access_token
from app.models import User


def get_db_session() -> Generator[Session, None, None]:
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    database: Session = Depends(get_db_session),
) -> User:
    token_source = "bearer" if credentials is not None else "cookie"
    token = credentials.credentials if credentials is not None else request.cookies.get(AUTH_SESSION_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        token_claims = verify_access_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = database.get(User, token_claims.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.token_version != token_claims.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if token_source == "cookie" and request.method.upper() not in {"GET", "HEAD", "OPTIONS"}:
        csrf_header = request.headers.get(AUTH_CSRF_HEADER_NAME)
        if not csrf_header:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your session has expired. Please sign in again.")
        if not token_claims.csrf_token or not hmac.compare_digest(csrf_header, token_claims.csrf_token):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your session has expired. Please sign in again.")

    return user

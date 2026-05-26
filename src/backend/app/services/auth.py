from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, generate_csrf_token, hash_password, verify_password
from app.models import ProjectInvitation, User
from app.schemas.auth import (
    AuthGoogleRequest,
    AuthLoginRequest,
    AuthRegisterRequest,
    UserPasswordChangeRequest,
    UserProfileUpdateRequest,
)
from app.services import project_invitations as project_invitation_service


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(session: Session, email: str) -> User | None:
    return session.scalar(select(User).where(User.email == normalize_email(email)))


def get_user_by_google_sub(session: Session, google_sub: str) -> User | None:
    return session.scalar(select(User).where(User.google_sub == google_sub))


def register_user(session: Session, payload: AuthRegisterRequest) -> User:
    email = normalize_email(payload.email)
    existing_user = get_user_by_email(session, email)
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    user = User(
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def authenticate_user(session: Session, payload: AuthLoginRequest) -> User:
    user = get_user_by_email(session, payload.email)
    if user is None or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
    return user


def _is_verified_email_claim(value: object) -> bool:
    return value is True or (isinstance(value, str) and value.lower() == "true")


def _safe_display_name(name: object, email: str) -> str:
    if isinstance(name, str) and name.strip():
        return name.strip()[:255]
    return email.split("@", 1)[0][:255] or "Google User"


def verify_google_credential(credential: str) -> dict[str, object]:
    if not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google login is not configured")

    try:
        from google.auth import exceptions as google_auth_exceptions
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google login is not available") from exc

    try:
        claims = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except google_auth_exceptions.TransportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is temporarily unavailable",
        ) from exc
    except google_auth_exceptions.GoogleAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential") from exc

    issuer = claims.get("iss")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential")

    return claims


def authenticate_google_user(session: Session, payload: AuthGoogleRequest) -> User:
    claims = verify_google_credential(payload.credential.strip())
    google_sub = claims.get("sub")
    email_claim = claims.get("email")

    if not isinstance(google_sub, str) or not google_sub.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential")
    if not isinstance(email_claim, str) or not email_claim.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential")
    if not _is_verified_email_claim(claims.get("email_verified")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google email is not verified")

    email = normalize_email(email_claim)
    google_sub = google_sub.strip()
    linked_user = get_user_by_google_sub(session, google_sub)
    if linked_user is not None and linked_user.email != email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Google account is already linked")

    user = get_user_by_email(session, email)
    if user is not None:
        if user.google_sub and user.google_sub != google_sub:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Google account is already linked")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
        if not user.google_sub:
            user.google_sub = google_sub
            session.commit()
            session.refresh(user)
        return user

    user = User(
        email=email,
        display_name=_safe_display_name(claims.get("name"), email),
        password_hash=None,
        google_sub=google_sub,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_current_user_profile(session: Session, user: User, payload: UserProfileUpdateRequest) -> User:
    display_name = payload.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Display name is required")

    user.display_name = display_name
    session.commit()
    session.refresh(user)
    return user


def change_current_user_password(session: Session, user: User, payload: UserPasswordChangeRequest) -> User:
    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password sign-in is not enabled for this account",
        )
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    session.commit()
    session.refresh(user)
    return user


def _can_use_email_bound_invitations(user: User) -> bool:
    return True


def build_session_payload(session: Session, user: User) -> dict[str, object]:
    csrf_token = generate_csrf_token()
    pending_invitations = (
        project_invitation_service.list_pending_invitations_for_email(session, user.email)
        if _can_use_email_bound_invitations(user)
        else []
    )
    return {
        "token": create_access_token(user.id, token_version=user.token_version, csrf_token=csrf_token),
        "csrf_token": csrf_token,
        "user": user,
        "pending_project_invitations": pending_invitations,
    }


def accept_pending_project_invitation(
    session: Session,
    invitation_id: int,
    user: User,
) -> dict[str, object]:
    if not _can_use_email_bound_invitations(user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project invitation not found")

    invitation = session.get(ProjectInvitation, invitation_id)
    if invitation is None or invitation.status != "pending" or invitation.email != normalize_email(user.email):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project invitation not found")

    member = project_invitation_service.accept_project_invitation(session, invitation, user.id)
    pending_invitations = project_invitation_service.list_pending_invitations_for_email(session, user.email)
    return {
        "member": member,
        "pending_project_invitations": pending_invitations,
    }

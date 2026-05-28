from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.core.security import clear_auth_session_cookie, set_auth_session_cookie
from app.services.auth import normalize_email
from app.models import User
from app.models import ProjectInvitation
from app.schemas.auth import (
    AuthGoogleRequest,
    AuthLoginRequest,
    AuthRegisterRequest,
    AuthSessionRead,
    PendingProjectInvitationAcceptanceRead,
    UserPasswordChangeRead,
    UserPasswordChangeRequest,
    UserProfileUpdateRequest,
    UserRead,
)
from app.schemas.project_invitation import ProjectInvitationRead
from app.services import auth as auth_service
from app.services import auth_rate_limit
from app.services import avatar as avatar_service
from app.services import project_invitations as project_invitation_service


router = APIRouter(tags=["auth"])


def _build_auth_session_response(response: Response, session_payload: dict[str, object]) -> dict[str, object]:
    set_auth_session_cookie(response, str(session_payload["token"]))
    return {
        "data": AuthSessionRead(
            csrf_token=str(session_payload["csrf_token"]),
            user=UserRead.model_validate(session_payload["user"]),
            pending_project_invitations=session_payload["pending_project_invitations"],
        ).model_dump(mode="json")
    }


@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register_user(
    payload: AuthRegisterRequest,
    request: Request,
    response: Response,
    database: Session = Depends(get_db_session),
):
    auth_rate_limit.enforce_register_rate_limit(
        database,
        auth_rate_limit.get_client_ip(request),
        payload.email,
    )
    user = auth_service.register_user(database, payload)
    session_payload = auth_service.build_session_payload(database, user)
    return _build_auth_session_response(response, session_payload)


@router.post("/auth/login")
def login_user(
    payload: AuthLoginRequest,
    request: Request,
    response: Response,
    database: Session = Depends(get_db_session),
):
    auth_rate_limit.enforce_password_login_rate_limit(
        database,
        auth_rate_limit.get_client_ip(request),
        payload.email,
    )
    user = auth_service.authenticate_user(database, payload)
    session_payload = auth_service.build_session_payload(database, user)
    return _build_auth_session_response(response, session_payload)


@router.post("/auth/google")
def login_with_google(
    payload: AuthGoogleRequest,
    request: Request,
    response: Response,
    database: Session = Depends(get_db_session),
):
    auth_rate_limit.enforce_google_login_rate_limit(database, auth_rate_limit.get_client_ip(request))
    user = auth_service.authenticate_google_user(database, payload)
    session_payload = auth_service.build_session_payload(database, user)
    return _build_auth_session_response(response, session_payload)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_user(
    response: Response,
    _current_user: User = Depends(get_current_user),
):
    clear_auth_session_cookie(response)
    return None


@router.get("/auth/me")
def read_current_user(current_user=Depends(get_current_user)):
    return {"data": UserRead.model_validate(current_user).model_dump(mode="json")}


@router.patch("/auth/me")
def update_current_user_profile(
    payload: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    user = auth_service.update_current_user_profile(database, current_user, payload)
    return {"data": UserRead.model_validate(user).model_dump(mode="json")}


@router.post("/auth/me/password")
def change_current_user_password(
    payload: UserPasswordChangeRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    auth_rate_limit.enforce_password_change_rate_limit(
        database,
        auth_rate_limit.get_client_ip(request),
        current_user.id,
    )
    user = auth_service.change_current_user_password(database, current_user, payload)
    session_payload = auth_service.build_session_payload(database, user)
    set_auth_session_cookie(response, str(session_payload["token"]))
    return {
        "data": UserPasswordChangeRead(
            user=UserRead.model_validate(user),
            csrf_token=str(session_payload["csrf_token"]),
        ).model_dump(mode="json")
    }


@router.post("/auth/project-invitations/{invitation_id}/accept")
def accept_project_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    payload = auth_service.accept_pending_project_invitation(database, invitation_id, current_user)
    return {
        "data": PendingProjectInvitationAcceptanceRead(
            member=payload["member"],
            pending_project_invitations=payload["pending_project_invitations"],
        ).model_dump(mode="json")
    }


@router.get("/auth/my-invitations")
def list_my_pending_invitations(
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    invitations = project_invitation_service.list_pending_invitations_for_email(database, current_user.email)
    return {"data": [ProjectInvitationRead.model_validate(inv).model_dump(mode="json") for inv in invitations]}


@router.post("/auth/project-invitations/{invitation_id}/decline", status_code=status.HTTP_200_OK)
def decline_project_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    invitation = database.get(ProjectInvitation, invitation_id)
    if invitation is None or invitation.status != "pending" or invitation.email != normalize_email(current_user.email):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project invitation not found")
    invitation.status = "declined"
    database.add(invitation)
    database.commit()
    pending_invitations = project_invitation_service.list_pending_invitations_for_email(database, current_user.email)
    return {
        "data": {
            "pending_project_invitations": [
                ProjectInvitationRead.model_validate(inv).model_dump(mode="json") for inv in pending_invitations
            ]
        }
    }


@router.post("/auth/me/avatar")
def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    auth_rate_limit.enforce_avatar_upload_rate_limit(
        database,
        auth_rate_limit.get_client_ip(request),
        current_user.id,
    )
    user = avatar_service.upload_avatar(database, current_user, file)
    return {"data": UserRead.model_validate(user).model_dump(mode="json")}


@router.delete("/auth/me/avatar")
def delete_avatar(
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    user = avatar_service.delete_avatar(database, current_user)
    return {"data": UserRead.model_validate(user).model_dump(mode="json")}

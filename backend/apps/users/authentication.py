"""
Custom JWT authentication that enforces real-time user state.

The default JWTAuthentication only validates the token signature and expiry.
It does NOT re-check the database, so a deactivated or role-changed user can
keep using their existing token until it naturally expires (up to 30 minutes).

This class fixes that by:
  1. Rejecting tokens for users whose is_active = False.
  2. Rejecting tokens issued before the user's last account update (updated_at).
     This covers deactivation, role changes, and password resets — any save()
     on the User model bumps updated_at and immediately invalidates old tokens.
"""
import datetime

from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class ActiveUserJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        # 1. Instant deactivation check
        if not user.is_active:
            raise AuthenticationFailed(
                "This account has been deactivated.",
                code="user_inactive",
            )

        # 2. Stale-token check: reject tokens issued before the last account change.
        #    validated_token["iat"] is a Unix timestamp (int) set by SimpleJWT.
        token_iat = validated_token.get("iat")
        if token_iat and user.updated_at:
            issued_at = datetime.datetime.fromtimestamp(token_iat, tz=datetime.timezone.utc)
            if user.updated_at > issued_at:
                raise AuthenticationFailed(
                    "Account was modified after this token was issued. Please log in again.",
                    code="token_invalidated",
                )

        return user

"""Role-based permissions.

Usage on a view:
    permission_classes = [HasRole.for_roles(Role.OWNER, Role.MANAGER)]

or, for read/write splits:
    permission_classes = [RoleAccess]
    read_roles = (Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
    write_roles = (Role.OWNER, Role.MANAGER)
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import Role


class HasRole(BasePermission):
    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.allowed_roles)

    @classmethod
    def for_roles(cls, *roles):
        return type(f"HasRole_{'_'.join(roles)}", (cls,), {"allowed_roles": roles})


class IsOwner(HasRole):
    allowed_roles = (Role.OWNER,)


class RoleAccess(BasePermission):
    """Reads `read_roles` / `write_roles` from the view. Owner always passes."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role == Role.OWNER:
            return True
        attr = "read_roles" if request.method in SAFE_METHODS else "write_roles"
        return user.role in getattr(view, attr, ())

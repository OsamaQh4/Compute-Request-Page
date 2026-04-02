import ssl
from ldap3 import Server, Connection, ALL, NTLM, Tls, SUBTREE
from ldap3.core.exceptions import LDAPException
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class LDAPService:
    def __init__(self, config):
        self.config = config

    def _make_connection(self, user_dn: str, password: str) -> Connection:
        tls = None
        if self.config.use_ssl or self.config.ignore_ssl:
            tls_ctx = ssl.create_default_context()
            if self.config.ignore_ssl:
                tls_ctx.check_hostname = False
                tls_ctx.verify_mode = ssl.CERT_NONE
            tls = Tls(ssl_context=tls_ctx, validate=ssl.CERT_NONE if self.config.ignore_ssl else ssl.CERT_REQUIRED)

        server = Server(
            self.config.server,
            port=self.config.port,
            use_ssl=self.config.use_ssl,
            tls=tls,
            get_info=ALL,
        )
        conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        return conn

    def authenticate(self, username: str, password: str) -> Optional[dict]:
        """
        Authenticate user@domain.com against AD LDAP.
        Returns user info dict or None on failure.
        """
        try:
            conn = self._make_connection(username, password)
        except LDAPException as e:
            logger.warning("LDAP auth failed for %s: %s", username, e)
            return None

        try:
            # Derive search base from email domain if no explicit user_search_base
            search_base = self.config.user_search_base or self.config.base_dn

            # Search for user object
            email_filter = f"(userPrincipalName={username})"
            conn.search(
                search_base=search_base,
                search_filter=email_filter,
                search_scope=SUBTREE,
                attributes=["cn", "displayName", "mail", "department",
                            "memberOf", "sAMAccountName", "distinguishedName"],
            )

            if not conn.entries:
                logger.warning("No LDAP entry found for %s", username)
                return None

            entry = conn.entries[0]
            user_dn = str(entry.distinguishedName)
            display_name = str(entry.displayName) if entry.displayName else str(entry.cn)
            email = str(entry.mail) if entry.mail else username
            department = str(entry.department) if entry.department else None
            member_of = [str(g) for g in entry.memberOf] if entry.memberOf else []

            # Determine role
            role = self._get_role(member_of)

            conn.unbind()
            return {
                "email": email,
                "name": display_name,
                "department": department,
                "role": role,
                "dn": user_dn,
            }
        except Exception as e:
            logger.error("LDAP search error: %s", e)
            try:
                conn.unbind()
            except Exception:
                pass
            return None

    def _get_role(self, member_of: list) -> str:
        """Check AD group membership for role assignment."""
        admin_dn = (self.config.admin_group_dn or "").lower()
        for group in member_of:
            if admin_dn and admin_dn in group.lower():
                return "admin"
        return "requester"

    def test_connection(self) -> dict:
        """Test LDAP connectivity using bind account."""
        try:
            bind_dn = self.config.bind_dn or ""
            bind_pw = self.config.bind_password or ""
            conn = self._make_connection(bind_dn, bind_pw)
            conn.unbind()
            return {"success": True, "message": "LDAP connection successful"}
        except Exception as e:
            return {"success": False, "message": str(e)}

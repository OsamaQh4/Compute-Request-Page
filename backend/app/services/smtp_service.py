import aiosmtplib
import ssl
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

logger = logging.getLogger(__name__)


class SMTPService:
    def __init__(self, config):
        self.config = config

    async def send_email(
        self,
        to: List[str],
        subject: str,
        html_body: str,
        cc: Optional[List[str]] = None,
    ) -> bool:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self.config.from_name} <{self.config.from_address}>"
        msg["To"] = ", ".join(to)
        if cc:
            msg["Cc"] = ", ".join(cc)
        msg.attach(MIMEText(html_body, "html"))

        all_recipients = to + (cc or [])

        try:
            tls_context = None
            if self.config.ignore_ssl:
                tls_context = ssl.create_default_context()
                tls_context.check_hostname = False
                tls_context.verify_mode = ssl.CERT_NONE

            await aiosmtplib.send(
                msg,
                hostname=self.config.host,
                port=self.config.port,
                start_tls=self.config.use_tls,
                tls_context=tls_context,
                username=self.config.username or None,
                password=self.config.password or None,
                recipients=all_recipients,
            )
            logger.info("Email sent to %s", all_recipients)
            return True
        except Exception as e:
            logger.error("SMTP error: %s", e)
            return False

    def _admin_recipients(self) -> List[str]:
        if self.config.admin_email:
            return [e.strip() for e in self.config.admin_email.split(",") if e.strip()]
        return []

    # ── Email templates ───────────────────────────────────────────────────────

    async def notify_admins_new_request(self, request) -> bool:
        admins = self._admin_recipients()
        if not admins:
            return False
        req_type = "Provision" if request.request_type == "provision" else "Edit"
        vm_ref = request.vm_name or request.target_vm_name or "N/A"
        subject = f"[VM Portal] New {req_type} Request – {vm_ref}"
        body = _render("New Request Pending Approval", f"""
            <p>A new <strong>{req_type}</strong> request has been submitted and requires your approval.</p>
            <table class="details">
                <tr><td>Request ID</td><td>#{request.id}</td></tr>
                <tr><td>Requester</td><td>{request.requester_name} ({request.requester_email})</td></tr>
                <tr><td>VM</td><td>{vm_ref}</td></tr>
                <tr><td>Submitted</td><td>{request.created_at}</td></tr>
                <tr><td>Justification</td><td>{request.justification or "—"}</td></tr>
            </table>
            <p>Please log in to the VM Request Portal to review and action this request.</p>
        """)
        return await self.send_email(admins, subject, body)

    async def notify_requester_approved(self, request) -> bool:
        subject = f"[VM Portal] Your Request #{request.id} Has Been Approved"
        vm_ref = request.vm_name or request.target_vm_name or "N/A"
        body = _render("Request Approved", f"""
            <p>Hello {request.requester_name},</p>
            <p>Your <strong>{request.request_type}</strong> request for <strong>{vm_ref}</strong>
               (Request #{request.id}) has been <span style="color:#16a34a;font-weight:bold;">approved</span>
               and is being processed.</p>
            <p>You will receive a confirmation once the operation is complete.</p>
            <p style="color:#6b7280;font-size:0.9em;">Approved by: {request.approved_by or 'System'}</p>
        """)
        admins = self._admin_recipients()
        return await self.send_email([request.requester_email], subject, body, cc=admins)

    async def notify_requester_denied(self, request) -> bool:
        subject = f"[VM Portal] Your Request #{request.id} Has Been Denied"
        vm_ref = request.vm_name or request.target_vm_name or "N/A"
        body = _render("Request Denied", f"""
            <p>Hello {request.requester_name},</p>
            <p>Your <strong>{request.request_type}</strong> request for <strong>{vm_ref}</strong>
               (Request #{request.id}) has been <span style="color:#dc2626;font-weight:bold;">denied</span>.</p>
            <table class="details">
                <tr><td>Reason</td><td>{request.denial_reason or "No reason provided"}</td></tr>
                <tr><td>Reviewed by</td><td>{request.approved_by or "Administrator"}</td></tr>
            </table>
            <p>If you have questions, please contact your administrator.</p>
        """)
        return await self.send_email([request.requester_email], subject, body)

    async def notify_provision_completed(self, request) -> bool:
        subject = f"[VM Portal] VM Provisioned – {request.vm_name}"
        body = _render("VM Provisioned Successfully", f"""
            <p>Hello {request.requester_name},</p>
            <p>Your VM <strong>{request.vm_name}</strong> has been successfully provisioned.</p>
            <table class="details">
                <tr><td>Request ID</td><td>#{request.id}</td></tr>
                <tr><td>VM Name</td><td>{request.vm_name}</td></tr>
                <tr><td>CPU</td><td>{request.cpu_count} vCPU(s)</td></tr>
                <tr><td>Memory</td><td>{request.memory_mb} MB</td></tr>
                <tr><td>Storage</td><td>{request.storage_gb} GB</td></tr>
                <tr><td>OS Template</td><td>{request.os_template}</td></tr>
            </table>
            <p style="font-size:0.85em;color:#6b7280;">Agent response: {request.agent_response or "Completed"}</p>
        """)
        admins = self._admin_recipients()
        return await self.send_email([request.requester_email], subject, body, cc=admins)

    async def notify_edit_completed(self, request) -> bool:
        subject = f"[VM Portal] VM Edit Completed – {request.target_vm_name}"
        body = _render("VM Edit Completed", f"""
            <p>Hello {request.requester_name},</p>
            <p>The edit request for <strong>{request.target_vm_name}</strong> has been completed.</p>
            <table class="details">
                <tr><td>Request ID</td><td>#{request.id}</td></tr>
                <tr><td>Auto-Approved</td><td>{"Yes (≤10% change)" if request.auto_approved else "No"}</td></tr>
                {'<tr><td>CPU</td><td>' + str(request.requested_cpu) + ' vCPU(s)</td></tr>' if request.requested_cpu else ''}
                {'<tr><td>Memory</td><td>' + str(request.requested_memory_mb) + ' MB</td></tr>' if request.requested_memory_mb else ''}
                {'<tr><td>Storage</td><td>' + str(request.requested_storage_gb) + ' GB</td></tr>' if request.requested_storage_gb else ''}
            </table>
        """)
        admins = self._admin_recipients()
        return await self.send_email([request.requester_email], subject, body, cc=admins)

    async def test_connection(self) -> dict:
        try:
            subject = "[VM Portal] SMTP Test"
            body = _render("SMTP Test", "<p>This is a test email from the VM Request Portal.</p>")
            admins = self._admin_recipients()
            if not admins:
                return {"success": False, "message": "No admin email configured"}
            result = await self.send_email(admins[:1], subject, body)
            if result:
                return {"success": True, "message": "Test email sent successfully"}
            return {"success": False, "message": "Failed to send test email"}
        except Exception as e:
            return {"success": False, "message": str(e)}


def _render(title: str, content: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: #f3f4f6; margin: 0; padding: 24px; color: #111827; }}
      .container {{ max-width: 600px; margin: 0 auto; background: #fff;
                    border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.12); }}
      .header {{ background: #1e40af; color: #fff; padding: 24px 32px; }}
      .header h1 {{ margin: 0; font-size: 1.25rem; }}
      .body {{ padding: 32px; }}
      table.details {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
      table.details td {{ padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }}
      table.details td:first-child {{ font-weight: 600; color: #374151; width: 40%; }}
      .footer {{ background: #f9fafb; padding: 16px 32px; font-size: 0.8rem; color: #9ca3af;
                 border-top: 1px solid #e5e7eb; }}
    </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>VM Request Portal – {title}</h1></div>
        <div class="body">{content}</div>
        <div class="footer">This is an automated message from the VM Request Portal. Do not reply.</div>
      </div>
    </body>
    </html>
    """

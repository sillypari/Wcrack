from datetime import datetime, timezone
from typing import Optional, List, Any
from sqlalchemy import Integer, String, Boolean, DateTime, JSON, ForeignKey, LargeBinary, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    client: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    active: Mapped[bool] = mapped_column(Boolean, default=False)

class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)

class Scope(Base):
    __tablename__ = "scopes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    allowed_bssids: Mapped[list] = mapped_column(JSON, default=list)
    allowed_ssids: Mapped[list] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)

class Adapter(Base):
    __tablename__ = "adapters"

    id: Mapped[int] = mapped_column(primary_key=True)
    mac: Mapped[str] = mapped_column(String, unique=True)
    iface_name: Mapped[str] = mapped_column(String)
    chipset: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    driver: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    current_mode: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

class ResourceLease(Base):
    __tablename__ = "resource_leases"

    id: Mapped[int] = mapped_column(primary_key=True)
    resource_type: Mapped[str] = mapped_column(String)
    resource_id: Mapped[str] = mapped_column(String)
    lease_type: Mapped[str] = mapped_column(String)
    job_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    owner_module: Mapped[str] = mapped_column(String)
    acquired_at: Mapped[datetime] = mapped_column(DateTime)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String)

class Network(Base):
    __tablename__ = "networks"

    id: Mapped[int] = mapped_column(primary_key=True)
    bssid: Mapped[str] = mapped_column(String, unique=True)
    ssid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    channel: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    band: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    encryption: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime)
    last_seen: Mapped[datetime] = mapped_column(DateTime)
    max_rssi: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vendor: Mapped[Optional[str]] = mapped_column(String, nullable=True)

class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    mac: Mapped[str] = mapped_column(String, unique=True)
    vendor: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    associated_bssid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime)
    last_seen: Mapped[datetime] = mapped_column(DateTime)
    max_rssi: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    probed_ssids: Mapped[list] = mapped_column(JSON, default=list)

class JobQueue(Base):
    __tablename__ = "job_queue"

    id: Mapped[int] = mapped_column(primary_key=True)
    module_name: Mapped[str] = mapped_column(String)
    handler_name: Mapped[str] = mapped_column(String)
    params_json: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_msg: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    scope_id: Mapped[Optional[int]] = mapped_column(ForeignKey("scopes.id"), nullable=True)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sessions.id"), nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)

class AttackSession(Base):
    __tablename__ = "attack_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job_queue.id"))
    type: Mapped[str] = mapped_column(String)
    target_bssid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    target_client: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    channel: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    packets_sent: Mapped[int] = mapped_column(Integer, default=0)
    scope_id: Mapped[int] = mapped_column(ForeignKey("scopes.id"))
    adapter_id: Mapped[int] = mapped_column(ForeignKey("adapters.id"))
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)

class Capture(Base):
    __tablename__ = "captures"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String)
    bssid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ssid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    hashcat_format: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    exported: Mapped[bool] = mapped_column(Boolean, default=False)
    scope_id: Mapped[int] = mapped_column(ForeignKey("scopes.id"))
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)

class ApSession(Base):
    __tablename__ = "ap_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    ssid: Mapped[str] = mapped_column(String)
    bssid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    channel: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    portal_template: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    clients_connected: Mapped[int] = mapped_column(Integer, default=0)
    credentials_captured: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String)
    scope_id: Mapped[int] = mapped_column(ForeignKey("scopes.id"))
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)

class Credential(Base):
    __tablename__ = "credentials"

    id: Mapped[int] = mapped_column(primary_key=True)
    ap_session_id: Mapped[int] = mapped_column(ForeignKey("ap_sessions.id"))
    network_ssid: Mapped[str] = mapped_column(String)
    password: Mapped[str] = mapped_column(String)
    kdf_salt: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    kdf_params: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    client_mac: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    client_ip: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)

class SessionLog(Base):
    __tablename__ = "session_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    action: Mapped[str] = mapped_column(String)
    target: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    result: Mapped[str] = mapped_column(String)
    detail: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

class ModuleState(Base):
    __tablename__ = "module_state"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    running: Mapped[bool] = mapped_column(Boolean, default=False)
    params_json: Mapped[dict] = mapped_column(JSON, default=dict)
    health: Mapped[str] = mapped_column(String, default='unknown')
    last_error: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    stopped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class CrackJob(Base):
    __tablename__ = "crack_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    source_capture_id: Mapped[Optional[int]] = mapped_column(ForeignKey("captures.id"), nullable=True)
    wordlist_path: Mapped[str] = mapped_column(String)
    rules_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mask: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    hash_mode: Mapped[int] = mapped_column(Integer, default=22000)
    attack_mode: Mapped[int] = mapped_column(Integer)
    backend: Mapped[str] = mapped_column(String)
    device: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String)
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0)
    candidates_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    candidates_tested: Mapped[int] = mapped_column(Integer, default=0)
    speed_hashes_sec: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    eta_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cracked_plaintext: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cracked_password_id: Mapped[Optional[int]] = mapped_column(ForeignKey("credentials.id"), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    exit_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pid: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    log_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    potfile_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    scope_id: Mapped[Optional[int]] = mapped_column(ForeignKey("scopes.id"), nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List, Optional
from pydantic import BaseModel
from wcarck.db.session import get_db
from wcarck.db.models import Project, Scope
from datetime import datetime

router = APIRouter(prefix="/api/projects", tags=["projects"])

class ProjectCreateReq(BaseModel):
    name: str
    client: Optional[str] = None
    notes: Optional[str] = None

class ProjectRes(BaseModel):
    id: int
    name: str
    client: Optional[str]
    notes: Optional[str]
    created_at: datetime
    active: bool

    class Config:
        from_attributes = True

@router.get("", response_model=List[ProjectRes])
async def list_projects(db: AsyncSession = Depends(get_db)):
    stmt = select(Project).order_by(Project.created_at.desc())
    result = await db.execute(stmt)
    projects = list(result.scalars().all())
    
    # Optional: We will manually map them to the same schema if needed
    # Wait, instead of complex joins, since this is a local app with sqlite, 
    # we can just return the base model and frontend will use what it has.
    # But wait, ProjectRes doesn't have stats yet! Let me just return them as is for now.
    return projects

@router.post("", response_model=ProjectRes)
async def create_project(req: ProjectCreateReq, db: AsyncSession = Depends(get_db)):
    # Check if project with the same name already exists
    stmt = select(Project).where(Project.name == req.name)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Project with this name already exists")

    project = Project(
        name=req.name,
        client=req.client,
        notes=req.notes,
        active=False
    )
    db.add(project)
    await db.flush() # Populate project.id

    # Create default scope for the project
    scope = Scope(
        name=f"Default Scope ({req.name})",
        notes=f"Auto-generated scope for project {req.name}",
        project_id=project.id,
        active=False
    )
    db.add(scope)
    await db.commit()
    await db.refresh(project)
    return project

@router.get("/{project_id}", response_model=ProjectRes)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Project).where(Project.id == project_id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.put("/{project_id}", response_model=ProjectRes)
async def update_project(project_id: int, req: ProjectCreateReq, db: AsyncSession = Depends(get_db)):
    stmt = select(Project).where(Project.id == project_id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.name = req.name
    project.client = req.client
    project.notes = req.notes
    await db.commit()
    await db.refresh(project)
    return project

@router.delete("/{project_id}")
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Project).where(Project.id == project_id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()
    return {"status": "deleted", "project_id": project_id}

@router.post("/{project_id}/activate", response_model=ProjectRes)
async def activate_project(project_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Project).where(Project.id == project_id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 1. Deactivate all other projects
    await db.execute(update(Project).where(Project.id != project_id).values(active=False))
    
    # 2. Activate selected project
    project.active = True

    # 3. Deactivate all scopes first
    await db.execute(update(Scope).values(active=False))

    # 4. Activate scopes for this project (or the first/default scope)
    scope_stmt = select(Scope).where(Scope.project_id == project_id).limit(1)
    scope_result = await db.execute(scope_stmt)
    scope = scope_result.scalar_one_or_none()
    if scope:
        scope.active = True
    else:
        # Create a new scope if missing
        scope = Scope(
            name=f"Default Scope ({project.name})",
            notes=f"Auto-generated scope for project {project.name}",
            project_id=project_id,
            active=True
        )
        db.add(scope)

    await db.commit()
    await db.refresh(project)
    
    # Notify UI about active project/scope change
    from wcarck.core.event_bus import bus
    bus.publish("project.activated", {"project_id": project.id, "name": project.name, "scope_id": scope.id if scope else None})

    return project

async def get_active_project(db: AsyncSession) -> Optional[Project]:
    """Helper function to fetch the currently active project."""
    stmt = select(Project).where(Project.active == True)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

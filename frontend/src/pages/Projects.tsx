import * as React from 'react'
import { Plus, Trash2, FolderPlus, FolderOpen, CheckCircle2, FileText, Calendar, User, Activity, Users, Zap, Key, ShieldAlert, Cpu, TerminalSquare, Edit2 } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Projects() {
  const { projects, activeProjectId, createProject, activateProject, deleteProject, networks, captures, credentials, clients } = useWcarckStore()
  const navigate = useNavigate()
  
  const [isOpen, setIsOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [client, setClient] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const [projectToDelete, setProjectToDelete] = React.useState<{id: number, name: string} | null>(null)
  
  // Edit State
  const [editOpen, setEditOpen] = React.useState(false)
  const [editId, setEditId] = React.useState<number | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editClient, setEditClient] = React.useState('')
  const [editNotes, setEditNotes] = React.useState('')
  const { updateProject } = useWcarckStore()

  const activeProject = projects.find(p => p.id === activeProjectId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Project Name is required')
      return
    }

    try {
      setIsSubmitting(true)
      await createProject(name, client, notes)
      setIsOpen(false)
      setName('')
      setClient('')
      setNotes('')
    } catch {
      // toast is already displayed inside the store action
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = (id: number, name: string) => {
    setProjectToDelete({ id, name })
  }

  const handleEditClick = (p: any) => {
    setEditId(p.id)
    setEditName(p.name)
    setEditClient(p.client || '')
    setEditNotes(p.notes || '')
    setEditOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim() || editId === null) {
      toast.error('Project Name is required')
      return
    }

    try {
      setIsSubmitting(true)
      await updateProject(editId, editName, editClient, editNotes)
      setEditOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full animate-fade-in gap-4 font-sans">
      {/* ── HEADER + CREATE BUTTON ───────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0 bg-bg-elevated border border-border-subtle rounded-lg p-3">
        <div className="flex items-center gap-4">
          <FolderOpen className="w-5 h-5 text-accent ml-2" />
          <h2 className="text-[12px] font-bold text-text-disabled uppercase tracking-widest">Audit Projects</h2>
          <span className="text-xs font-mono text-text-disabled bg-bg-surface border border-border-subtle px-2 py-0.5 rounded">
            {projects.length} defined
          </span>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30 font-bold h-8">
              <FolderPlus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-bg-surface border-border-subtle max-w-md">
            <DialogHeader>
              <DialogTitle className="text-text-primary text-base font-bold">Create New Project</DialogTitle>
              <DialogDescription className="text-text-secondary text-xs">
                Initialize a new engagement profile. A default scope will be generated automatically.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="proj-name" className="text-xs font-medium text-text-secondary">Project Name</Label>
                <Input
                  id="proj-name"
                  placeholder="e.g. Q3_Wireless_Audit"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-bg-active border-border-default text-text-primary text-sm h-9"
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-client" className="text-xs font-medium text-text-secondary">Client Name (Optional)</Label>
                <Input
                  id="proj-client"
                  placeholder="e.g. Acme Corp"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  className="bg-bg-active border-border-default text-text-primary text-sm h-9"
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-notes" className="text-xs font-medium text-text-secondary">Description / Notes</Label>
                <textarea
                  id="proj-notes"
                  placeholder="Audit parameters, locations, scope info..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border-default bg-bg-active px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                />
              </div>
              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="border-border-default text-text-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-accent hover:bg-accent/90 text-white font-medium"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── ACTIVE MISSION DOSSIER ─────────────────────────────────────── */}
      {activeProject && (
        <div className="flex-shrink-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-bg-surface via-bg-elevated to-bg-elevated border border-border-subtle rounded-lg p-5 flex flex-col md:flex-row gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-accent" />
          
          <div className="flex-1 flex flex-col">
             <div className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Active Mission Dossier</div>
             <h3 className="text-2xl font-black text-text-primary tracking-tight mb-2">
               {activeProject.client ? `${activeProject.client} / ${activeProject.name}` : activeProject.name}
             </h3>
             <p className="text-xs text-text-secondary max-w-lg mb-4 line-clamp-2">
               {activeProject.notes || 'No operational notes provided for this mission.'}
             </p>
             <div className="flex gap-3 mt-auto">
                <Button size="sm" onClick={() => navigate('/')} className="bg-accent text-white hover:bg-accent-hover text-xs font-bold h-8">
                   Open Dashboard
                </Button>
                <Button size="sm" onClick={() => navigate('/recon')} variant="outline" className="bg-bg-active border-border-subtle hover:bg-bg-hover text-text-primary text-xs font-bold h-8">
                   Start Recon
                </Button>
             </div>
          </div>

          <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
             <div className="bg-bg-surface border border-border-subtle rounded p-3 flex flex-col justify-center">
                <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-1 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Networks</div>
                <div className="text-2xl font-black text-text-primary font-mono">{networks.size}</div>
             </div>
             <div className="bg-bg-surface border border-border-subtle rounded p-3 flex flex-col justify-center">
                <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-1 flex items-center gap-1.5"><Users className="w-3 h-3" /> Clients</div>
                <div className="text-2xl font-black text-text-primary font-mono">{clients.size}</div>
             </div>
             <div className="bg-bg-surface border border-border-subtle rounded p-3 flex flex-col justify-center">
                <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-1 flex items-center gap-1.5"><Zap className="w-3 h-3" /> Captures</div>
                <div className="text-2xl font-black text-text-primary font-mono">{captures.length}</div>
             </div>
             <div className="bg-bg-surface border border-border-subtle rounded p-3 flex flex-col justify-center">
                <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-1 flex items-center gap-1.5"><Key className="w-3 h-3" /> Cracked</div>
                <div className="text-2xl font-black text-status-success font-mono">{credentials.length}</div>
             </div>
          </div>
        </div>
      )}

      {/* ── PROJECTS GRID ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-bg-elevated border border-border-subtle rounded-lg min-h-0">
        <div className="p-3 border-b border-border-subtle">
           <h3 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> All Projects</h3>
        </div>
        <div className="p-4 flex-1 overflow-y-auto min-h-0">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FolderOpen className="w-12 h-12 text-text-disabled opacity-30 mb-4" />
              <h3 className="text-sm font-bold text-text-secondary">No Projects Defined</h3>
              <p className="text-xs text-text-disabled max-w-xs mt-1">
                Create an audit project to isolate your targets, captures, and cracked credentials.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId
                return (
                  <div 
                    key={project.id} 
                    className={cn(
                      "flex flex-col bg-bg-surface border rounded-lg transition-all select-none duration-300 overflow-hidden",
                      isActive ? 'border-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.15)]' : 'border-border-subtle hover:border-border-default'
                    )}
                  >
                    <div className="p-4 pb-3 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-text-primary truncate">{project.name}</h4>
                          <span className="text-[10px] text-text-secondary truncate block font-mono">{project.client || 'Internal'}</span>
                        </div>
                        {isActive && (
                          <span className="flex items-center text-[9px] font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded animate-pulse-green">
                            Active
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border-subtle/50 text-[10px] text-text-disabled font-mono">
                         <div className="flex items-center gap-1.5" title="Networks (Data only available when active)">
                           <Activity className="w-3 h-3" /> {isActive ? networks.size : '--'}
                         </div>
                         <div className="flex items-center gap-1.5" title="Captures (Data only available when active)">
                           <Zap className="w-3 h-3" /> {isActive ? captures.length : '--'}
                         </div>
                         <div className="flex items-center gap-1.5" title="Credentials (Data only available when active)">
                           <Key className="w-3 h-3" /> {isActive ? credentials.length : '--'}
                         </div>
                      </div>
                    </div>
                    
                    <div className="px-4 py-2 bg-bg-active border-t border-border-subtle/40 flex justify-between items-center">
                      <span className="text-[9px] text-text-disabled font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(project.created_at).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => activateProject(project.id)}
                            className="h-6 px-2 text-[10px] font-bold text-text-secondary hover:text-text-primary bg-bg-surface border border-border-subtle hover:border-border-default"
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClick(project)}
                          className="h-6 px-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(project.id, project.name)}
                          className="h-6 px-1.5 text-status-error/60 hover:text-status-error hover:bg-status-error/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={() => {
          if (projectToDelete) deleteProject(projectToDelete.id)
        }}
        title="Delete Project"
        description={`Are you sure you want to delete project "${projectToDelete?.name}"? This will delete all scopes and capture data under it.`}
        confirmText="Delete Project"
        cancelText="Cancel"
        variant="destructive"
      />

      {/* ── EDIT PROJECT DIALOG ──────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-bg-surface border-border-subtle max-w-md">
          <DialogHeader>
            <DialogTitle className="text-text-primary text-base font-bold">Edit Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs font-medium text-text-secondary">Project Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-bg-active border-border-default text-text-primary text-sm h-9"
                disabled={isSubmitting}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-client" className="text-xs font-medium text-text-secondary">Client Name (Optional)</Label>
              <Input
                id="edit-client"
                value={editClient}
                onChange={(e) => setEditClient(e.target.value)}
                className="bg-bg-active border-border-default text-text-primary text-sm h-9"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes" className="text-xs font-medium text-text-secondary">Mission Notes (Optional)</Label>
              <textarea
                id="edit-notes"
                rows={4}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full bg-bg-active border border-border-default rounded-md text-text-primary text-sm p-2 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                disabled={isSubmitting}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} disabled={isSubmitting} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-accent text-white hover:bg-accent-hover text-xs font-bold">
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

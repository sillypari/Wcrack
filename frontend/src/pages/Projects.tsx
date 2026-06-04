import * as React from 'react'
import { Plus, Trash2, FolderPlus, FolderOpen, CheckCircle2, FileText, Calendar, User } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'

export function Projects() {
  const { projects, activeProjectId, createProject, activateProject, deleteProject } = useWcarckStore()
  
  const [isOpen, setIsOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [client, setClient] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

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
    if (window.confirm(`Are you sure you want to delete project "${name}"? This will delete all scopes and capture data under it.`)) {
      deleteProject(id)
    }
  }

  return (
    <div className="flex flex-col h-full animate-fade-in gap-4">
      {/* ── HEADER + CREATE BUTTON ───────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-text-primary tracking-tight font-sans">Audit Projects</h2>
          <span className="text-xs font-mono text-text-disabled bg-bg-elevated border border-border-subtle px-2.5 py-1 rounded">
            {projects.length} total
          </span>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-accent hover:bg-accent/90 text-white font-medium h-8">
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

      {/* ── METRICS SUMMARY CARD ─────────────────────────────────────── */}
      {activeProject && (
        <div className="flex-shrink-0 bg-bg-elevated border border-border-subtle rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-accent uppercase tracking-wider font-mono">Active Engagement</div>
              <h3 className="text-base font-bold text-text-primary tracking-tight">
                {activeProject.client ? `${activeProject.client} - ${activeProject.name}` : activeProject.name}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-text-secondary">
            {activeProject.client && (
              <div className="flex items-center gap-1.5 bg-bg-surface px-2.5 py-1.5 rounded border border-border-subtle">
                <User className="w-3.5 h-3.5 text-text-tertiary" />
                <span>Client: {activeProject.client}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-bg-surface px-2.5 py-1.5 rounded border border-border-subtle">
              <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
              <span>Started: {new Date(activeProject.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── PROJECTS GRID ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-border-subtle bg-bg-elevated/40 text-center p-6">
            <FolderOpen className="w-10 h-10 text-text-disabled mb-2" />
            <h3 className="text-sm font-semibold text-text-secondary">No Projects Defined</h3>
            <p className="text-xs text-text-disabled max-w-xs mt-1">
              Create an audit project to separate your network targets, credential logs, and captures.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project) => {
              const isActive = project.id === activeProjectId
              return (
                <Card 
                  key={project.id} 
                  className={`bg-bg-surface border-border-subtle hover:border-border-default transition-all select-none duration-normal ${
                    isActive ? 'border-accent/40 bg-accent/4' : ''
                  }`}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-bold text-text-primary truncate font-sans">
                          {project.name}
                        </CardTitle>
                        <CardDescription className="text-xs text-text-secondary truncate mt-0.5">
                          {project.client ? `Client: ${project.client}` : 'No Client Name'}
                        </CardDescription>
                      </div>
                      {isActive ? (
                        <span className="flex items-center text-xs font-semibold text-status-success bg-status-success/10 border border-status-success/20 px-2 py-0.5 rounded-full font-mono">
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={() => activateProject(project.id)}
                          className="text-xs font-semibold text-text-secondary hover:text-text-primary bg-bg-elevated hover:bg-bg-hover border border-border-subtle px-2 py-0.5 rounded transition-colors"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 pb-3 text-xs text-text-secondary font-sans leading-relaxed">
                    <p className="line-clamp-2 h-8">
                      {project.notes || 'No description notes available.'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-3 text-[10px] text-text-tertiary font-mono">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(project.created_at).toLocaleString()}</span>
                    </div>
                  </CardContent>
                  <CardFooter className="p-4 pt-0 flex justify-end gap-2 border-t border-border-subtle/40 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(project.id, project.name)}
                      className="text-status-error/80 hover:text-status-error hover:bg-status-error/10 h-7 px-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

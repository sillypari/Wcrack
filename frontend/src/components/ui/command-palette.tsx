import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Search, MonitorOff, Activity, FileText, Settings, Download, Focus } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { useWcarckStore } from "@/store/useWcarckStore"
import { toast } from "sonner"

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()
  const { toggleFocusMode } = useWcarckStore()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => navigate("/recon"))}>
            <Search className="mr-2 h-4 w-4" />
            <span>Start Scan</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => toast.info("Stopping all jobs..."))}>
            <MonitorOff className="mr-2 h-4 w-4" />
            <span>Stop All Jobs</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => {
            const txt = "Wcarck Debug Report\n" // This will be expanded later
            navigator.clipboard.writeText(txt)
            toast.success("Copied to clipboard")
          })}>
            <Download className="mr-2 h-4 w-4" />
            <span>Copy Debug Report</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => toggleFocusMode())}>
            <Focus className="mr-2 h-4 w-4" />
            <span>Toggle Focus Mode</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => navigate("/recon"))}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Open Recon</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/logs"))}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Open Logs</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/adapters"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Open Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
